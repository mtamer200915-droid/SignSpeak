"""Signova - Full 166 Classes Training Pipeline (Combining Old & New Datasets)."""
from pathlib import Path
from collections import Counter
import numpy as np
import tensorflow as tf
from tensorflow.keras import Sequential
from tensorflow.keras.layers import Input, LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from sklearn.model_selection import train_test_split
import json

# ---- مسارات البيانات القديمة والجديدة ----
PROJECT_ROOT = Path(__file__).resolve().parent
OLD_ROOT = PROJECT_ROOT / "dataset" / "dataset"
OLD_FEATURES = OLD_ROOT / "clean" / "extracted_features_v3"

NEW_ROOT = PROJECT_ROOT / "New_dataset" / "dataset"
NEW_CLEAN = NEW_ROOT / "clean"
NEW_FEATURES = NEW_CLEAN / "clean" / "extracted_features_v3"
JSON_PATH = NEW_CLEAN / "WLASL_selected_166.json"
MODELS_DIR = NEW_ROOT / "models_combined_166"

# تثبيت العشوائية لضمان تكرار النتائج
np.random.seed(42)
tf.random.set_seed(42)

def normalize_video_id(x):
    x = str(x).strip()
    return str(int(x)) if x.isdigit() else x

def load_video_labels():
    if not JSON_PATH.exists():
        raise FileNotFoundError(f"Missing JSON: {JSON_PATH}")
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    labels = {}
    for cls in data.get("classes", []):
        gloss = str(cls.get("gloss", "")).strip()
        if not gloss:
            continue
        for inst in cls.get("instances", []):
            if inst.get("video_id") is None:
                continue
            vid = normalize_video_id(inst["video_id"])
            labels[vid] = gloss
    return labels

def load_feature_file(path):
    return np.asarray(np.load(path, allow_pickle=False), dtype=np.float32)

# تحميل التصنيفات
labels_raw = load_video_labels()
labels = {normalize_video_id(k): v for k, v in labels_raw.items()}

# جمع جميع ملفات الـ npy من المجلدين (القديم والجديد) دون تكرار للـ video_id
feature_paths = {}
for folder in [NEW_FEATURES, OLD_FEATURES]:
    if folder.exists():
        for path in folder.glob("*.npy"):
            vid = normalize_video_id(path.stem)
            if vid not in feature_paths:  # تفضيل الجديد لو موجود كنسخة أحدث، أو دمجهم
                feature_paths[vid] = path

# جمع الكلاسات المتاحة
all_labels_list = []
for vid, path in feature_paths.items():
    if vid in labels:
        all_labels_list.append(labels[vid])

class_counts = Counter(all_labels_list)
TOP_N_CLASSES = min(166, len(class_counts))
chosen_classes = [item[0] for item in class_counts.most_common(TOP_N_CLASSES)]
print(f"🔥 Training on Combined Dataset Vocabulary: {TOP_N_CLASSES} Classes (Total Files: {len(feature_paths)})")

label_to_idx = {name: i for i, name in enumerate(chosen_classes)}

X_raw, y_raw = [], []

for vid, path in feature_paths.items():
    if vid not in labels:
        continue
    label = labels[vid]
    if label in label_to_idx:
        seq = load_feature_file(path)

        # Normalization
        normalized_seq = np.zeros_like(seq)
        for t in range(seq.shape[0]):
            frame = seq[t].reshape(-1, 2)
            valid_pts = frame[np.any(frame != 0, axis=1)]
            if len(valid_pts) > 0:
                center = np.mean(valid_pts, axis=0)
                normalized_seq[t] = (frame - center).flatten()
            else:
                normalized_seq[t] = seq[t]

        # Velocity
        if normalized_seq.shape[0] > 1:
            vel = np.vstack([np.zeros((1, normalized_seq.shape[1])), np.abs(np.diff(normalized_seq, axis=0))])
        else:
            vel = np.zeros_like(normalized_seq)

        enhanced_seq = np.concatenate([normalized_seq, vel], axis=-1)
        X_raw.append(enhanced_seq)
        y_raw.append(label_to_idx[label])

# دالة Data Augmentation لمضاعفة وتحسين قوة العينات
def augment_sequence(seq):
    augmented_list = [seq]
    noise = np.random.normal(0, 0.01, seq.shape)
    augmented_list.append(seq + noise)

    length = seq.shape[0]
    if length > 5:
        indices = np.linspace(0, length - 1, int(length * 0.9))
        indices = np.clip(indices, 0, length - 1).astype(int)
        resampled = seq[indices]
        if len(resampled) < length:
            padded = np.pad(resampled, ((0, length - len(resampled)), (0, 0)), mode='edge')
            augmented_list.append(padded)

    return augmented_list

X_train_raw, X_test, y_train_raw, y_test = train_test_split(
    np.asarray(X_raw, dtype=np.float32),
    np.asarray(y_raw, dtype=np.int32),
    test_size=0.2,
    random_state=42,
    stratify=y_raw,
)

# Augment only the training split so related copies of one video never leak into evaluation.
X_train, y_train = [], []
for seq, label in zip(X_train_raw, y_train_raw):
    for aug_seq in augment_sequence(seq):
        X_train.append(aug_seq)
        y_train.append(label)

X_train = np.asarray(X_train, dtype=np.float32)
y_train = np.asarray(y_train, dtype=np.int32)
X_test = np.asarray(X_test, dtype=np.float32)
y_test = np.asarray(y_test, dtype=np.int32)

print(f"🔥 Training samples after augmentation: {len(X_train)}")
print(f"🧪 Held-out test samples: {len(X_test)}")

# المعمارية القوية للـ LSTM
model = Sequential([
    Input(shape=(X_train.shape[1], X_train.shape[2])),
    LSTM(256, return_sequences=True),
    Dropout(0.4),
    LSTM(128),
    Dropout(0.4),
    Dense(256, activation="relu"),
    BatchNormalization(),
    Dropout(0.4),
    Dense(len(chosen_classes), activation="softmax")
])

model.compile(
    optimizer=Adam(learning_rate=0.001),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)

callbacks = [
    ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=15, min_lr=0.00001, verbose=1),
    EarlyStopping(monitor='val_accuracy', patience=40, restore_best_weights=True, verbose=1)
]

history = model.fit(
    X_train, y_train,
    validation_data=(X_test, y_test),
    epochs=200,
    batch_size=16,
    callbacks=callbacks,
    verbose=1
)

loss, accuracy = model.evaluate(X_test, y_test, verbose=1)
print(f"\n🚀 Combined (Old + New) LSTM Test Accuracy: {accuracy * 100:.2f}%")

MODELS_DIR.mkdir(parents=True, exist_ok=True)
model.save(MODELS_DIR / "sign_language_model_166.keras")
np.save(MODELS_DIR / "class_names_166.npy", np.array(chosen_classes))
print(f"\n✅ Combined model saved successfully!")
