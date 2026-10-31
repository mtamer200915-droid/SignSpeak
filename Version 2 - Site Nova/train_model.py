"""Train, evaluate, and export the isolated-sign Signova V2 classifier."""

from __future__ import annotations

import argparse
import json
import os
import random
import subprocess
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

PROJECT = Path(__file__).resolve().parent
DATA = PROJECT / "data"
CLIP_DIR = DATA / "clips"
MODEL_DIR = PROJECT / "api" / "models"
WORDS = (
    "book", "deaf", "eat", "drink", "family", "go", "happy", "help", "home", "like",
    "mother", "need", "no", "not", "please", "school", "water", "want", "yes", "you",
)
FRAMES = 12
SIZE = 224
FPS = 8
SEED = 42


def ffmpeg_binary() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError("Install imageio-ffmpeg before training.") from exc


def clip_path(row: dict) -> Path:
    source = row["dataset"].lower()
    video = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in str(row["video_id"]))
    return CLIP_DIR / row["split"] / row["word"] / f"{source}_{video}.mp4"


def extract_frames(path: Path, ffmpeg: str) -> np.ndarray:
    """Decode a clip to a fixed-length, uniformly sampled RGB frame sequence."""
    vf = f"fps={FPS},scale={SIZE}:{SIZE}:force_original_aspect_ratio=decrease,pad={SIZE}:{SIZE}:(ow-iw)/2:(oh-ih)/2"
    proc = subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(path), "-t", "6",
         "-an", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
        capture_output=True, timeout=90,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "replace")[-600:])
    frame_bytes = SIZE * SIZE * 3
    available = len(proc.stdout) // frame_bytes
    if available < 2:
        raise ValueError("The clip contains fewer than two decodable frames.")
    raw = np.frombuffer(proc.stdout[:available * frame_bytes], dtype=np.uint8)
    frames = raw.reshape(available, SIZE, SIZE, 3)
    indices = np.linspace(0, available - 1, FRAMES).round().astype(np.int32)
    return frames[indices].copy()


def read_records(manifest: Path) -> tuple[dict[str, list[dict]], list[dict]]:
    rows = [json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    found = {split: [] for split in ("train", "val", "test")}
    missing = []
    for row in rows:
        path = clip_path(row)
        if path.is_file() and path.stat().st_size > 2_000:
            row["_clip_path"] = path
            found[row["split"]].append(row)
        else:
            missing.append({"split": row["split"], "word": row["word"], "video_id": row["video_id"]})
    return found, missing


def load_cached_features(rows: list[dict], encoder, ffmpeg: str, cache_name: str):
    """Decode clips in small chunks and compute frozen MobileNetV2 frame features."""
    cache_path = DATA / cache_name
    paths = [str(row["_clip_path"].resolve()) for row in rows]
    cache_key = f"{len(paths)}|" + "|".join(paths)
    if cache_path.is_file():
        cached = np.load(cache_path, allow_pickle=False)
        if cached["key"].item() == cache_key:
            features = cached["features"].astype(np.float32)
            labels = cached["labels"].astype(np.int32)
            return features, labels

    import tensorflow as tf
    preprocess = tf.keras.applications.mobilenet_v2.preprocess_input
    all_features, all_labels = [], []
    chunk_size = 6
    for offset in range(0, len(rows), chunk_size):
        chunk = rows[offset:offset + chunk_size]
        videos = []
        for row in chunk:
            videos.append(extract_frames(row["_clip_path"], ffmpeg))
        batch = np.stack(videos, axis=0)
        flat = preprocess(batch.reshape(-1, SIZE, SIZE, 3).astype(np.float32))
        emb = encoder.predict(flat, batch_size=24, verbose=0)
        emb = emb.reshape(len(chunk), FRAMES, -1).astype(np.float32)
        labels = np.asarray([WORDS.index(row["word"]) for row in chunk], dtype=np.int32)
        all_features.append(emb)
        all_labels.append(labels)
        print(f"Encoded {min(offset + len(chunk), len(rows))}/{len(rows)} {cache_name}", flush=True)

    features = np.concatenate(all_features, axis=0) if all_features else np.empty((0, FRAMES, 1280), np.float32)
    labels = np.concatenate(all_labels) if all_labels else np.empty((0,), np.int32)
    np.savez_compressed(cache_path, key=np.asarray(cache_key), features=features, labels=labels)
    return features, labels


def class_counts(rows: list[dict]) -> dict[str, int]:
    return {word: sum(1 for row in rows if row["word"] == word) for word in WORDS}


def train(manifest: Path, epochs: int = 80) -> dict:
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
    random.seed(SEED)
    np.random.seed(SEED)
    import tensorflow as tf

    tf.keras.utils.set_random_seed(SEED)
    tf.config.threading.set_intra_op_parallelism_threads(max(1, min(8, os.cpu_count() or 1)))
    tf.config.threading.set_inter_op_parallelism_threads(2)

    records, missing = read_records(manifest)
    for split in ("train", "val", "test"):
        counts = class_counts(records[split])
        print(f"{split}: {counts}", flush=True)
        minimum = 18 if split == "train" else 3 if split == "val" else 1
        short = [word for word, count in counts.items() if count < minimum]
        if short:
            raise RuntimeError(f"Not enough {split} clips for {', '.join(short)}: {counts}")

    print("Loading ImageNet MobileNetV2 frame encoder...", flush=True)
    encoder = tf.keras.applications.MobileNetV2(
        input_shape=(SIZE, SIZE, 3), include_top=False, weights="imagenet", pooling="avg"
    )
    encoder.trainable = False
    X_train, y_train = load_cached_features(records["train"], encoder, ffmpeg_binary(), "train_features.npz")
    X_val, y_val = load_cached_features(records["val"], encoder, ffmpeg_binary(), "val_features.npz")
    X_test, y_test = load_cached_features(records["test"], encoder, ffmpeg_binary(), "test_features.npz")

    # Reset after loading the encoder and cached features so the classifier
    # initialization is reproducible across machines and training runs.
    tf.keras.utils.set_random_seed(SEED)
    inputs = tf.keras.Input(shape=(FRAMES, 1280), name="frame_embeddings")
    x = tf.keras.layers.LayerNormalization(name="embedding_normalization")(inputs)
    x = tf.keras.layers.Conv1D(
        48,
        3,
        padding="same",
        activation="relu",
        kernel_regularizer=tf.keras.regularizers.l2(0.01),
        name="temporal_frame_features",
    )(x)
    x = tf.keras.layers.SpatialDropout1D(0.3, name="temporal_dropout")(x)
    pooled = tf.keras.layers.Concatenate(name="temporal_pooling")([
        tf.keras.layers.GlobalAveragePooling1D()(x),
        tf.keras.layers.GlobalMaxPooling1D()(x),
    ])
    x = tf.keras.layers.Dense(
        48,
        activation="relu",
        kernel_regularizer=tf.keras.regularizers.l2(0.02),
        name="sign_classifier_features",
    )(pooled)
    x = tf.keras.layers.Dropout(0.55, name="classifier_dropout")(x)
    outputs = tf.keras.layers.Dense(len(WORDS), activation="softmax", name="class_probabilities")(x)
    classifier = tf.keras.Model(inputs, outputs, name="signova_v2_temporal_conv_classifier")
    classifier.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0005),
        loss=tf.keras.losses.SparseCategoricalCrossentropy(),
        metrics=["accuracy"],
    )
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=10, mode="max", restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=4, min_lr=1e-5),
    ]
    history = classifier.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=16,
        shuffle=True,
        callbacks=callbacks,
        verbose=2,
    )

    val_probs = classifier.predict(X_val, batch_size=16, verbose=0)
    val_pred = np.argmax(val_probs, axis=1)
    val_top3 = np.argsort(val_probs, axis=1)[:, -3:]
    validation_top1 = float(np.mean(val_pred == y_val))
    validation_top3 = float(np.mean([label in choices for label, choices in zip(y_val, val_top3)]))

    probs = classifier.predict(X_test, batch_size=16, verbose=0)
    pred = np.argmax(probs, axis=1)
    top3 = np.argsort(probs, axis=1)[:, -3:]
    test_accuracy = float(np.mean(pred == y_test))
    top3_accuracy = float(np.mean([label in choices for label, choices in zip(y_test, top3)]))
    per_class = {}
    for index, word in enumerate(WORDS):
        mask = y_test == index
        per_class[word] = {
            "support": int(mask.sum()),
            "accuracy": float(np.mean(pred[mask] == y_test[mask])) if mask.any() else None,
        }
    confusion = tf.math.confusion_matrix(y_test, pred, num_classes=len(WORDS)).numpy().tolist()
    present_class_accuracy = [row["accuracy"] for row in per_class.values() if row["accuracy"] is not None]
    balanced_accuracy = float(np.mean(present_class_accuracy)) if present_class_accuracy else 0.0

    # Export one inference model that accepts preprocessed RGB frames in [-1,1]
    # and contains both the frozen image encoder and trained temporal classifier.
    frame_input = tf.keras.Input(shape=(FRAMES, SIZE, SIZE, 3), dtype=tf.float32, name="mobilenet_scaled_frames")
    embedded = tf.keras.layers.TimeDistributed(encoder, name="frame_encoder")(frame_input)
    final_output = classifier(embedded)
    inference_model = tf.keras.Model(frame_input, final_output, name="signova_v2")
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODEL_DIR / "signova_v2.keras"
    inference_model.save(model_path)

    report = {
        "model": "MobileNetV2 ImageNet frame embeddings + regularized temporal Conv1D classifier",
        "classes": list(WORDS),
        "input": {"frames": FRAMES, "height": SIZE, "width": SIZE, "fps_sampling": FPS,
                  "preprocess": "MobileNetV2 RGB, float values scaled to [-1,1]"},
        "samples": {split: class_counts(records[split]) for split in records},
        "test": {
            "top1_accuracy": test_accuracy,
            "balanced_top1_accuracy": balanced_accuracy,
            "top3_accuracy": top3_accuracy,
            "clip_count": int(len(y_test)),
            "per_class": per_class,
            "confusion_matrix": confusion,
            "confusion_matrix_labels": list(WORDS),
        },
        "validation": {
            "top1_accuracy": validation_top1,
            "top3_accuracy": validation_top3,
            "clip_count": int(len(y_val)),
        },
        "training": {
            "epochs_ran": len(history.history.get("loss", [])),
            "best_validation_accuracy": float(max(history.history.get("val_accuracy", [0]))),
            "seed": SEED,
        },
        "missing_candidate_clips_skipped_count": len(missing),
        "source_attribution": {
            "MS-ASL": "https://www.microsoft.com/en-us/download/details.aspx?id=100121",
            "WLASL": "https://github.com/dxli94/WLASL",
        },
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (MODEL_DIR / "model_info.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (MODEL_DIR / "class_names.json").write_text(json.dumps(list(WORDS), indent=2), encoding="utf-8")
    site_report = {
        "classes": list(WORDS),
        "test": report["test"],
        "samples": report["samples"],
        "note": "Held-out test results from this dataset only. This does not guarantee future predictions.",
        "generated_at_utc": report["generated_at_utc"],
    }
    (PROJECT / "web" / "model-report.json").write_text(json.dumps(site_report, indent=2), encoding="utf-8")
    print(json.dumps({"model": str(model_path), "test": report["test"], "samples": report["samples"]}, indent=2))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DATA / "manifest.jsonl")
    parser.add_argument("--epochs", type=int, default=80)
    args = parser.parse_args()
    train(args.manifest, max(1, args.epochs))


if __name__ == "__main__":
    main()
