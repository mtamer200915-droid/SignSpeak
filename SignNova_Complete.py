"""Reproducible training pipeline for Signova's 166-class landmark model."""

from __future__ import annotations

import argparse
from collections import Counter
import json
import os
from pathlib import Path

import numpy as np
import tensorflow as tf
from sklearn.metrics import balanced_accuracy_score, f1_score
from tensorflow.keras import Sequential
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.layers import BatchNormalization, Dense, Dropout, Input, LSTM
from tensorflow.keras.optimizers import Adam

from signova_features import (
    FRAMES,
    MODEL_DIM,
    POSE_DIM,
    PREPROCESSING_VERSION,
    add_velocity_features,
    enhance_pose_sequence,
)


PROJECT_ROOT = Path(__file__).resolve().parent
NEW_CLEAN = PROJECT_ROOT / "New_dataset" / "dataset" / "clean"
NEW_FEATURES = NEW_CLEAN / "clean" / "extracted_features_v3"
JSON_PATH = NEW_CLEAN / "WLASL_selected_166.json"
MODELS_DIR = PROJECT_ROOT / "New_dataset" / "dataset" / "models_combined_166"
MODEL_PATH = MODELS_DIR / "sign_language_model_166.keras"
CLASS_PATH = MODELS_DIR / "class_names_166.npy"
REPORT_PATH = MODELS_DIR / "training_report_166.json"
NUM_CLASSES = 166
SEED = 42


def normalize_video_id(value: object) -> str:
    text = str(value).strip()
    return str(int(text)) if text.isdigit() else text


def load_video_metadata() -> dict[str, tuple[str, str]]:
    if not JSON_PATH.is_file():
        raise FileNotFoundError(f"Missing labels file: {JSON_PATH}")
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    metadata: dict[str, tuple[str, str]] = {}
    for sign_class in data.get("classes", []):
        gloss = str(sign_class.get("gloss", "")).strip()
        if not gloss:
            continue
        for instance in sign_class.get("instances", []):
            if instance.get("video_id") is not None:
                split = str(instance.get("split", "")).strip().lower()
                if split not in {"train", "val", "test"}:
                    raise ValueError(
                        f"Video {instance['video_id']} has unsupported source split {split!r}."
                    )
                video_id = normalize_video_id(instance["video_id"])
                value = (gloss, split)
                if video_id in metadata and metadata[video_id] != value:
                    raise ValueError(f"Video id {video_id} has conflicting labels or source splits.")
                metadata[video_id] = value
    return metadata


def collect_feature_paths() -> dict[str, Path]:
    # Train only from the selected dataset so cached pose features stay on one
    # consistent extraction pipeline. The old cache is retained as an archive.
    paths: dict[str, Path] = {}
    if NEW_FEATURES.is_dir():
        for path in sorted(NEW_FEATURES.glob("*.npy")):
            paths.setdefault(normalize_video_id(path.stem), path)
    return paths


def load_examples() -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str], dict[str, int]]:
    metadata = load_video_metadata()
    paths = collect_feature_paths()
    examples: list[np.ndarray] = []
    glosses: list[str] = []
    source_splits: list[str] = []
    skipped: list[str] = []

    for video_id, path in sorted(paths.items()):
        label_info = metadata.get(video_id)
        if label_info is None:
            continue
        gloss, split = label_info
        try:
            pose = np.load(path, allow_pickle=False)
            examples.append(enhance_pose_sequence(pose))
            glosses.append(gloss)
            source_splits.append(split)
        except (OSError, ValueError, TypeError) as error:
            skipped.append(f"{path.name}: {error}")

    if skipped:
        details = "\n".join(skipped[:10])
        raise ValueError(
            f"Found {len(skipped)} invalid labeled feature file(s); fix the source data before training.\n{details}"
        )

    class_counts = Counter(glosses)
    if len(class_counts) != NUM_CLASSES:
        raise ValueError(
            f"Expected all {NUM_CLASSES} labeled classes, found {len(class_counts)}. "
            "No model files were changed."
        )
    class_names = sorted(class_counts)
    label_to_idx = {name: index for index, name in enumerate(class_names)}
    y = np.asarray([label_to_idx[gloss] for gloss in glosses], dtype=np.int32)
    split_ids = np.asarray(source_splits, dtype=np.str_)
    X = np.asarray(examples, dtype=np.float32)
    counts_by_class = {name: class_counts[name] for name in class_names}
    if X.ndim != 3 or X.shape[1:] != (FRAMES, MODEL_DIM):
        raise ValueError(f"Unexpected model input array shape: {X.shape}.")
    train_counts = np.bincount(y[split_ids == "train"], minlength=len(class_names))
    if np.any(train_counts < 2):
        missing = [class_names[i] for i, count in enumerate(train_counts) if count < 2]
        raise ValueError(
            "Each class needs at least two training clips in the official split; "
            f"insufficient support: {missing}. No model files were changed."
        )
    return X, y, split_ids, class_names, counts_by_class


def split_examples(
    X: np.ndarray, y: np.ndarray, split_ids: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Use WLASL's supplied, disjoint train/validation/test video partitions."""
    if not (len(X) == len(y) == len(split_ids)):
        raise ValueError("Features, labels, and source split ids must have equal lengths.")
    masks = {name: split_ids == name for name in ("train", "val", "test")}
    if any(not mask.any() for mask in masks.values()):
        raise ValueError("The labeled feature set must include train, val, and test videos.")
    return (
        X[masks["train"]],
        y[masks["train"]],
        X[masks["val"]],
        y[masks["val"]],
        X[masks["test"]],
        y[masks["test"]],
    )


def augment_sequence(sequence: np.ndarray, rng: np.random.Generator) -> list[np.ndarray]:
    normalized = sequence[:, :POSE_DIM].copy()
    variants = [sequence]

    # Keep missing-joint sentinels at zero while adding small landmark jitter.
    joints = normalized.reshape(FRAMES, POSE_DIM // 2, 2)
    visible = np.any(joints != 0, axis=-1)
    jittered = joints.copy()
    jittered += rng.normal(0, 0.005, size=joints.shape).astype(np.float32) * visible[..., None]
    variants.append(add_velocity_features(jittered.reshape(FRAMES, POSE_DIM)))

    # Slightly shorten the gesture in time, then pad with the last frame.
    sample_count = max(2, int(FRAMES * 0.9))
    indices = np.linspace(0, FRAMES - 1, sample_count, dtype=int)
    shortened = normalized[indices]
    if len(shortened) < FRAMES:
        shortened = np.pad(
            shortened,
            ((0, FRAMES - len(shortened)), (0, 0)),
            mode="edge",
        )
    variants.append(add_velocity_features(shortened[:FRAMES]))
    return variants


def build_model() -> tf.keras.Model:
    # Smaller capacity is intentional: there are only about ten original clips per class.
    model = Sequential(
        [
            Input(shape=(FRAMES, MODEL_DIM)),
            LSTM(64, return_sequences=True),
            Dropout(0.3),
            LSTM(32),
            Dropout(0.3),
            Dense(64, activation="relu"),
            BatchNormalization(),
            Dropout(0.35),
            Dense(NUM_CLASSES, activation="softmax"),
        ]
    )
    model.compile(
        optimizer=Adam(learning_rate=0.001),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def train(epochs: int, batch_size: int, min_accuracy: float = 0.10) -> dict[str, object]:
    if not 0.0 < min_accuracy <= 1.0:
        raise ValueError("min_accuracy must be greater than 0 and at most 1.0")
    np.random.seed(SEED)
    tf.keras.utils.set_random_seed(SEED)

    X, y, split_ids, class_names, source_class_counts = load_examples()
    X_train, y_train, X_validation, y_validation, X_test, y_test = split_examples(X, y, split_ids)

    rng = np.random.default_rng(SEED)
    augmented_X: list[np.ndarray] = []
    augmented_y: list[int] = []
    for sequence, label in zip(X_train, y_train):
        for variant in augment_sequence(sequence, rng):
            augmented_X.append(variant)
            augmented_y.append(int(label))
    X_train_augmented = np.asarray(augmented_X, dtype=np.float32)
    y_train_augmented = np.asarray(augmented_y, dtype=np.int32)

    train_counts = np.bincount(y_train, minlength=NUM_CLASSES)
    class_weights = {
        index: float(np.sqrt(len(y_train) / (NUM_CLASSES * max(count, 1))))
        for index, count in enumerate(train_counts)
    }

    print(
        f"Classes: {NUM_CLASSES} | source clips: {len(X)} | "
        f"train/validation/test: {len(y_train)}/{len(y_validation)}/{len(y_test)} | "
        f"augmented train: {len(X_train_augmented)}"
    )
    print(
        f"Input per clip: ({FRAMES}, {MODEL_DIM}) | class clips range: "
        f"{min(source_class_counts.values())}–{max(source_class_counts.values())}"
    )

    model = build_model()
    callbacks = [
        ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=6, min_lr=1e-5, verbose=1
        ),
        EarlyStopping(
            monitor="val_loss", patience=18, restore_best_weights=True, verbose=1
        ),
    ]
    history = model.fit(
        X_train_augmented,
        y_train_augmented,
        validation_data=(X_validation, y_validation),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=callbacks,
        class_weight=class_weights,
        verbose=1,
    )

    validation_loss, validation_accuracy = model.evaluate(X_validation, y_validation, verbose=0)
    test_loss, test_accuracy = model.evaluate(X_test, y_test, verbose=0)
    test_probabilities = model.predict(X_test, verbose=0)
    test_predictions = np.argmax(test_probabilities, axis=1)
    test_supported_labels = np.unique(y_test)
    majority_baseline = float(np.bincount(y_test).max() / len(y_test))
    validation_accuracy = float(validation_accuracy)
    test_accuracy = float(test_accuracy)
    test_balanced_accuracy = float(balanced_accuracy_score(y_test, test_predictions))
    test_macro_f1 = float(
        f1_score(
            y_test,
            test_predictions,
            labels=test_supported_labels,
            average="macro",
            zero_division=0,
        )
    )

    if min(validation_accuracy, test_accuracy, test_balanced_accuracy) < min_accuracy:
        raise RuntimeError(
            "Model quality gate failed; no model files were changed. "
            f"Required validation, test, and balanced test accuracy >= {min_accuracy:.0%}; "
            f"got {validation_accuracy:.2%}, {test_accuracy:.2%}, "
            f"and {test_balanced_accuracy:.2%}. Add or improve labeled clips before deployment."
        )

    # A newly trained model must not replace a better checked-in bundle. Keep
    # validation, test, balanced accuracy, and macro F1 at least at baseline.
    # The validation split is the tuning signal; the test checks are a
    # regression guard against the model currently served by the API.
    baseline_metrics: dict[str, float] = {}
    if REPORT_PATH.is_file():
        try:
            baseline_report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
            for key in (
                "validation_accuracy",
                "test_accuracy",
                "test_balanced_accuracy",
                "test_macro_f1",
            ):
                value = baseline_report.get(key)
                if isinstance(value, (int, float)) and np.isfinite(value):
                    baseline_metrics[key] = float(value)
        except (OSError, json.JSONDecodeError):
            baseline_metrics = {}

    candidate_metrics = {
        "validation_accuracy": validation_accuracy,
        "test_accuracy": test_accuracy,
        "test_balanced_accuracy": test_balanced_accuracy,
        "test_macro_f1": test_macro_f1,
    }
    regressions = {
        key: (value, baseline_metrics[key])
        for key, value in candidate_metrics.items()
        if key in baseline_metrics and value + 1e-9 < baseline_metrics[key]
    }
    if regressions:
        details = ", ".join(
            f"{key} {candidate:.2%} < current {baseline:.2%}"
            for key, (candidate, baseline) in regressions.items()
        )
        raise RuntimeError(
            "Model quality gate failed; the existing model bundle was kept. "
            f"Candidate metrics regressed: {details}. Add or improve labeled clips before deployment."
        )

    # Keep the existing deployable bundle intact unless training and evaluation succeed.
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    candidate_model = MODELS_DIR / ".sign_language_model_166_candidate.keras"
    candidate_classes = MODELS_DIR / ".class_names_166_candidate.npy"
    candidate_report = MODELS_DIR / ".training_report_166_candidate.json"
    model.save(candidate_model)
    np.save(candidate_classes, np.asarray(class_names, dtype=np.str_))

    report: dict[str, object] = {
        "classes": NUM_CLASSES,
        "class_names": class_names,
        "source_class_counts": source_class_counts,
        "train_class_counts": {
            name: int(count) for name, count in zip(class_names, train_counts)
        },
        "samples": {
            "source_total": int(len(X)),
            "train_original": int(len(y_train)),
            "train_augmented": int(len(y_train_augmented)),
            "validation": int(len(y_validation)),
            "test": int(len(y_test)),
        },
        "source_split_strategy": "official WLASL train/val/test partitions",
        "validation_class_coverage": int(len(np.unique(y_validation))),
        "test_class_coverage": int(len(np.unique(y_test))),
        "test_class_names": [class_names[index] for index in np.unique(y_test)],
        "test_class_counts": {
            class_names[index]: int(np.sum(y_test == index)) for index in test_supported_labels
        },
        "input_shape": [None, FRAMES, MODEL_DIM],
        "preprocessing": PREPROCESSING_VERSION,
        "seed": SEED,
        "epochs_completed": len(history.history.get("loss", [])),
        "validation_accuracy": validation_accuracy,
        "validation_loss": float(validation_loss),
        "test_loss": float(test_loss),
        "test_accuracy": test_accuracy,
        "test_balanced_accuracy": test_balanced_accuracy,
        "test_macro_f1": test_macro_f1,
        "baseline_quality_metrics": baseline_metrics,
        "minimum_accuracy_quality_gate": min_accuracy,
        "test_majority_baseline_accuracy": majority_baseline,
        "chance_baseline_accuracy": 1.0 / NUM_CLASSES,
        "model_path": str(MODEL_PATH.relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "class_names_path": str(CLASS_PATH.relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "evaluation_split_used_for_callbacks": False,
    }
    candidate_report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    os.replace(candidate_model, MODEL_PATH)
    os.replace(candidate_classes, CLASS_PATH)
    os.replace(candidate_report, REPORT_PATH)
    print(
        f"Held-out test accuracy: {test_accuracy:.2%} | "
        f"balanced accuracy: {report['test_balanced_accuracy']:.2%} | "
        f"majority baseline: {majority_baseline:.2%}"
    )
    print(f"Saved model, class mapping, and report under {MODELS_DIR}")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Signova's 166-class sign model.")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument(
        "--min-accuracy",
        type=float,
        default=0.10,
        help="Minimum validation, test, and balanced test accuracy required to replace the saved model (default: 0.10).",
    )
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1:
        parser.error("--epochs and --batch-size must be positive integers")
    if not 0.0 < args.min_accuracy <= 1.0:
        parser.error("--min-accuracy must be greater than 0 and at most 1.0")
    train(args.epochs, args.batch_size, args.min_accuracy)


if __name__ == "__main__":
    main()
