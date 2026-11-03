"""Train one static ASL letters-and-digits model from the supplied ZIP archives.

The word model is untouched. This model classifies letters, digits, and the
provided no-sign/space/delete labels and is loaded by the same FastAPI service.
The random image holdout is only a preliminary evaluation; user-recorded clips
from unseen sessions are needed to measure camera generalization.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import time
import zipfile
from collections import Counter
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
DEFAULT_ALPHA_ZIP = Path(r"G:\archive (1).zip")
DEFAULT_DIGITS_ZIP = Path(r"G:\archive (2).zip")
CACHE_DIR = PROJECT / ".downloads" / "character-training"
MODEL_DIR = PROJECT / "api" / "models"
LETTERS = tuple("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
DIGITS = tuple(str(number) for number in range(10))
EXTRA_CLASSES = ("DELETE", "NOTHING", "SPACE", "UNKNOWN")
CLASSES = DIGITS + LETTERS + EXTRA_CLASSES
SEED = 42
IMAGE_SIZE = 224


def entries_for_archive(archive: zipfile.ZipFile, kind: str):
    for info in archive.infolist():
        if info.is_dir() or Path(info.filename).suffix.lower() not in {".jpg", ".jpeg"}:
            continue
        parts = info.filename.replace("\\", "/").split("/")
        if kind == "letters":
            try:
                folder_index = parts.index("asl_alphabet_train")
                label = parts[folder_index + 1]
                if label in LETTERS:
                    yield info, label
                elif label.lower() in {"del", "nothing", "space"}:
                    yield info, {"del": "DELETE", "nothing": "NOTHING", "space": "SPACE"}[label.lower()]
            except (ValueError, IndexError):
                continue
        else:
            try:
                folder_index = parts.index("Sign Language for Numbers")
                label = parts[folder_index + 1]
                if label in DIGITS:
                    yield info, label
                elif label.lower() == "unknown":
                    yield info, "UNKNOWN"
            except (ValueError, IndexError):
                continue


def stage_archives(alpha_zip: Path, digits_zip: Path, rebuild: bool, max_images_per_class: int) -> dict:
    global CACHE_DIR
    sources = {"alphabet_zip": str(alpha_zip.resolve()), "digits_zip": str(digits_zip.resolve())}
    base_cache_dir = CACHE_DIR
    candidates = [base_cache_dir, *sorted(base_cache_dir.parent.glob(f"{base_cache_dir.name}-*"), reverse=True)]
    if not rebuild:
        for candidate in candidates:
            marker = candidate / "source_manifest.json"
            if not marker.is_file():
                continue
            try:
                cached = json.loads(marker.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if (cached.get("sources") != sources
                    or cached.get("max_images_per_class") != max_images_per_class):
                continue
            cached_counts = cached.get("counts", {})
            cache_complete = all(
                sum(1 for path in (candidate / split / label).glob("*") if path.suffix.lower() in {".jpg", ".jpeg"})
                == cached_counts.get(split, {}).get(label)
                for split in ("train", "val", "test")
                for label in CLASSES
            )
            if cache_complete:
                CACHE_DIR = candidate
                print(f"Using already prepared images in {CACHE_DIR}", flush=True)
                return cached_counts
            print(f"Prepared image cache at {candidate} is incomplete; rebuilding from the source archives.", flush=True)
    if CACHE_DIR.exists() or any(base_cache_dir.parent.glob(f"{base_cache_dir.name}-*")):
        stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
        CACHE_DIR = base_cache_dir.with_name(f"{base_cache_dir.name}-{stamp}")
    marker = CACHE_DIR / "source_manifest.json"
    for path in (alpha_zip, digits_zip):
        if not path.is_file():
            raise FileNotFoundError(f"Dataset archive not found: {path}")
    for split in ("train", "val", "test"):
        for label in CLASSES:
            (CACHE_DIR / split / label).mkdir(parents=True, exist_ok=True)

    rows: list[tuple[Path, str, int]] = []
    for archive_path, kind in ((alpha_zip, "letters"), (digits_zip, "digits")):
        print(f"Reading {archive_path}", flush=True)
        with zipfile.ZipFile(archive_path) as archive:
            for info, label in entries_for_archive(archive, kind):
                rows.append((archive_path, info.filename, CLASSES.index(label)))

    by_class: dict[str, list[tuple[Path, str]]] = {label: [] for label in CLASSES}
    for archive_path, member, class_index in rows:
        by_class[CLASSES[class_index]].append((archive_path, member))

    rng = random.Random(SEED)
    counts = {split: Counter() for split in ("train", "val", "test")}
    hash_seen: dict[str, set[str]] = {label: set() for label in CLASSES}
    for label in CLASSES:
        samples = by_class[label]
        rng.shuffle(samples)
        if max_images_per_class > 0:
            samples = samples[:max_images_per_class]
        accepted: list[tuple[Path, str, bytes]] = []
        for archive_path in sorted({item[0] for item in samples}):
            with zipfile.ZipFile(archive_path) as archive:
                for source, member in (item for item in samples if item[0] == archive_path):
                    content = archive.read(member)
                    digest = hashlib.sha256(content).hexdigest()
                    if digest in hash_seen[label]:
                        continue
                    hash_seen[label].add(digest)
                    accepted.append((source, member, content))
        rng.shuffle(accepted)
        if len(accepted) < 30:
            raise RuntimeError(f"Class {label} has only {len(accepted)} unique images; need at least 30.")
        test_n = max(1, round(len(accepted) * 0.10))
        val_n = max(1, round(len(accepted) * 0.10))
        partitions = {
            "test": accepted[:test_n],
            "val": accepted[test_n:test_n + val_n],
            "train": accepted[test_n + val_n:],
        }
        for split, subset in partitions.items():
            for index, (source, member, content) in enumerate(subset):
                filename = f"{label}_{index:06d}{Path(member).suffix.lower()}"
                destination = CACHE_DIR / split / label / filename
                destination.write_bytes(content)
                counts[split][label] += 1
        print(f"{label}: {len(accepted)} unique images", flush=True)

    result = {split: dict(counts[split]) for split in counts}
    marker.write_text(json.dumps({
        "sources": sources,
        "max_images_per_class": max_images_per_class,
        "counts": result,
    }, indent=2), encoding="utf-8")
    print("Prepared split counts:", json.dumps(result, indent=2), flush=True)
    return result


def train(epochs: int, batch_size: int, weights: str, alpha_zip: Path, digits_zip: Path, rebuild: bool, max_images_per_class: int) -> dict:
    import numpy as np
    from PIL import Image
    import tensorflow as tf

    tf.keras.utils.set_random_seed(SEED)
    counts = stage_archives(alpha_zip, digits_zip, rebuild, max_images_per_class)
    for split, values in counts.items():
        too_small = [label for label in CLASSES if values.get(label, 0) < (10 if split == "train" else 2)]
        if too_small:
            raise RuntimeError(f"Not enough {split} samples for: {', '.join(too_small)}")

    augmentation = tf.keras.Sequential([
        tf.keras.layers.RandomRotation(0.035, fill_mode="nearest"),
        tf.keras.layers.RandomTranslation(0.06, 0.06, fill_mode="nearest"),
        tf.keras.layers.RandomZoom(0.08, fill_mode="nearest"),
        tf.keras.layers.RandomContrast(0.10),
    ], name="safe_handshape_augmentation")

    try:
        backbone = tf.keras.applications.MobileNetV2(
            include_top=False, weights=None if weights.lower() == "none" else weights,
            input_shape=(IMAGE_SIZE, IMAGE_SIZE, 3), pooling="avg",
        )
    except Exception as exc:
        raise RuntimeError("Could not load pretrained MobileNetV2 weights. Retry with Kaggle Notebook internet enabled or pass --weights none.") from exc
    backbone.trainable = False

    @tf.function(input_signature=[tf.TensorSpec((None, IMAGE_SIZE, IMAGE_SIZE, 3), tf.float32)])
    def embed_batch(images):
        return backbone(tf.keras.applications.mobilenet_v2.preprocess_input(images), training=False)

    def encode_split(split: str, augment_images: bool):
        """Read small, bounded batches and cache frozen MobileNetV2 features once."""
        rows: list[tuple[Path, int]] = []
        for label_index, label in enumerate(CLASSES):
            rows.extend((path, label_index) for path in sorted((CACHE_DIR / split / label).glob("*"))
                        if path.suffix.lower() in {".jpg", ".jpeg"})
        if split == "train":
            np.random.default_rng(SEED).shuffle(rows)
        feature_batches = []
        label_batches = []
        total = len(rows)
        batch_count = int(np.ceil(total / batch_size))
        for batch_index, start in enumerate(range(0, total, batch_size)):
            batch_rows = rows[start:start + batch_size]
            images = []
            for path, _ in batch_rows:
                with Image.open(path) as source:
                    images.append(np.asarray(source.convert("RGB").resize(
                        (IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.BILINEAR), dtype=np.float32))
            images = np.stack(images, axis=0)
            if augment_images:
                images = augmentation(images, training=True).numpy()
            embeddings = embed_batch(tf.convert_to_tensor(images, dtype=tf.float32))
            feature_batches.append(embeddings.numpy().astype(np.float32))
            label_batches.append(np.asarray([label for _, label in batch_rows], dtype=np.int32))
            if (batch_index + 1) % 10 == 0 or batch_index + 1 == batch_count:
                print(f"Encoded {split}: {min((batch_index + 1) * batch_size, total)}/{total}", flush=True)
        return np.concatenate(feature_batches, axis=0), np.concatenate(label_batches, axis=0)

    X_train, y_train = encode_split("train", augment_images=True)
    X_val, y_val = encode_split("val", augment_images=False)
    X_test, y_test = encode_split("test", augment_images=False)

    feature_inputs = tf.keras.Input((1280,), name="mobilenet_v2_features")
    x = tf.keras.layers.Dropout(0.35)(feature_inputs)
    x = tf.keras.layers.Dense(256, activation="relu", kernel_regularizer=tf.keras.regularizers.l2(0.001))(x)
    x = tf.keras.layers.Dropout(0.30)(x)
    feature_outputs = tf.keras.layers.Dense(len(CLASSES), activation="softmax", name="character_probabilities")(x)
    classifier = tf.keras.Model(feature_inputs, feature_outputs, name="signova_asl_character_classifier")
    classifier.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
                       loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=5, mode="max", restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2, min_lr=1e-5),
    ]
    history = classifier.fit(
        X_train, y_train, validation_data=(X_val, y_val), epochs=epochs,
        batch_size=batch_size, shuffle=True, callbacks=callbacks, verbose=2,
    )

    probabilities = classifier.predict(X_test, batch_size=batch_size, verbose=1)
    y_true = y_test
    y_pred = np.argmax(probabilities, axis=1)
    top3 = np.argsort(probabilities, axis=1)[:, -3:]
    per_class = {}
    for index, label in enumerate(CLASSES):
        mask = y_true == index
        per_class[label] = {
            "support": int(mask.sum()),
            "accuracy": float(np.mean(y_pred[mask] == y_true[mask])) if np.any(mask) else None,
        }
    matrix = tf.math.confusion_matrix(y_true, y_pred, num_classes=len(CLASSES)).numpy().tolist()
    balanced_top1 = float(np.mean([per_class[label]["accuracy"] for label in CLASSES]))
    report = {
        "model": "ImageNet MobileNetV2 transfer learning for static ASL handshapes",
        "classes": list(CLASSES),
        "input": {"height": IMAGE_SIZE, "width": IMAGE_SIZE, "channels": 3, "color": "RGB", "value_range": "0..255"},
        "samples": counts,
        "test": {
            "top1_accuracy": float(np.mean(y_pred == y_true)),
            "balanced_top1_accuracy": balanced_top1,
            "top3_accuracy": float(np.mean([label in guesses for label, guesses in zip(y_true, top3)])),
            "clip_count": int(len(y_true)),
            "per_class": per_class,
            "confusion_matrix": matrix,
            "confusion_matrix_labels": list(CLASSES),
            "split_note": "Random image holdout; the source archives do not identify signers, so this is not signer-independent camera accuracy.",
        },
        "training": {
            "epochs_ran": len(history.history.get("loss", [])),
            "seed": SEED,
            "backbone_weights": weights,
            "method": "Frozen MobileNetV2 features are extracted once; a regularized classifier is trained on those features.",
            "augmentation": "One randomized rotation/translation/zoom/contrast view per training image.",
        },
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    image_inputs = tf.keras.Input((IMAGE_SIZE, IMAGE_SIZE, 3), name="rgb_frame_0_255")
    normalized = tf.keras.applications.mobilenet_v2.preprocess_input(image_inputs)
    outputs = classifier(backbone(normalized, training=False))
    model = tf.keras.Model(image_inputs, outputs, name="signova_asl_letters_digits")
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.save(MODEL_DIR / "signova_characters.keras")
    (MODEL_DIR / "character_model_info.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (MODEL_DIR / "character_class_names.json").write_text(json.dumps(list(CLASSES), indent=2), encoding="utf-8")
    print(json.dumps({"model": str(MODEL_DIR / 'signova_characters.keras'), "test": report["test"]}, indent=2))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--alphabet-zip", type=Path, default=DEFAULT_ALPHA_ZIP)
    parser.add_argument("--digits-zip", type=Path, default=DEFAULT_DIGITS_ZIP)
    parser.add_argument("--epochs", type=int, default=18)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--max-images-per-class", type=int, default=400,
                        help="Limit each class to a balanced random sample (default 400 for CPU training); 0 uses every image.")
    parser.add_argument("--weights", default="imagenet", help="Use imagenet or none; pretrained initialization is recommended.")
    parser.add_argument("--rebuild-cache", action="store_true", help="Re-extract and rebuild randomized splits.")
    args = parser.parse_args()
    train(max(1, args.epochs), max(8, args.batch_size), args.weights, args.alphabet_zip, args.digits_zip,
          args.rebuild_cache, max(0, args.max_images_per_class))


if __name__ == "__main__":
    main()
