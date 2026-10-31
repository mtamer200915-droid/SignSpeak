"""Signova - Real-World Inference Script for 166-Classes Model."""
from pathlib import Path
import argparse
import os
import numpy as np
import cv2
from ultralytics import YOLO
import tensorflow as tf

# ---- المسارات الأساسية للنموذج والملفات المدربة ----
PROJECT_ROOT = Path(__file__).resolve().parent
NEW_ROOT = PROJECT_ROOT / "New_dataset" / "dataset"
MODELS_DIR = NEW_ROOT / "models_combined_166"
MODEL_PATH = MODELS_DIR / "sign_language_model_166.keras"
CLASS_PATH = MODELS_DIR / "class_names_166.npy"
POSE_WEIGHTS = Path(os.environ.get(
    "YOLO_POSE_WEIGHTS",
    str(PROJECT_ROOT / "dataset" / "dataset" / "models" / "yolov8n-pose.pt"),
))

FRAMES, DIM = 30, 34
DEVICE = "cpu" # ضعها "cuda" لو كارت الشاشة شغال معاك في الاستخراج


def load_inference_model():
    if not MODEL_PATH.exists() or not CLASS_PATH.exists():
        raise FileNotFoundError("لم يتم العثور على ملفات النموذج أو الكلاسات المحفوظة!")
    model = tf.keras.models.load_model(MODEL_PATH)
    classes = np.load(CLASS_PATH, allow_pickle=True)
    return model, classes


def extract_video_features(video_path, pose_model):
    cap = cv2.VideoCapture(str(video_path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if cap.isOpened() else 0
    if total <= 0:
        cap.release()
        return None

    indices = np.linspace(0, total - 1, min(FRAMES, total), dtype=int).tolist()
    wanted, frames, idx = set(indices), [], 0

    while idx <= indices[-1]:
        ok, frame = cap.read()
        if not ok:
            break
        if idx in wanted:
            h, w = frame.shape[:2]
            vec = np.zeros(DIM, dtype=np.float32)
            result = pose_model.predict(frame, device=DEVICE, verbose=False)
            if result and result[0].keypoints is not None:
                xy = result[0].keypoints.xy
                if xy is not None and len(xy):
                    person = 0
                    boxes = result[0].boxes
                    if boxes is not None and len(boxes) > 1:
                        b = boxes.xyxy.cpu().numpy()
                        person = int(np.argmax((b[:, 2]-b[:, 0])*(b[:, 3]-b[:, 1])))
                    coords = xy[person].cpu().numpy().astype(np.float32)
                    coords[:, 0] /= max(w, 1)
                    coords[:, 1] /= max(h, 1)
                    vec = coords.reshape(-1)[:DIM]
                    if vec.size < DIM:
                        vec = np.pad(vec, (0, DIM-vec.size))
            frames.append(vec)
        idx += 1
    cap.release()

    if not frames:
        return None

    arr = np.asarray(frames, dtype=np.float32)
    if len(arr) < FRAMES:
        arr = np.vstack([arr, np.zeros((FRAMES-len(arr), DIM), np.float32)])
    return arr[:FRAMES]


def enhance(seq):
    normalized = np.zeros_like(seq, dtype=np.float32)
    for t in range(seq.shape[0]):
        frame = seq[t].reshape(-1, 2)
        pts = frame[np.any(frame != 0, axis=1)]
        normalized[t] = (frame - pts.mean(axis=0)).flatten() if len(pts) else seq[t]
    vel = np.vstack([np.zeros((1, normalized.shape[1]), np.float32),
                     np.abs(np.diff(normalized, axis=0))])
    return np.concatenate([normalized, vel], axis=-1).astype(np.float32)


def predict_sign(video_path):
    print("⏳ جاري تحميل النموذج وتجهيز الأوزان...")
    model, classes = load_inference_model()

    print("⏳ جاري تحميل نموذج الاستخراج (YOLO)...")
    pose_model = YOLO(str(POSE_WEIGHTS))

    print(f"🎬 جاري استخراج المعالم من الفيديو: {Path(video_path).name}")
    raw_seq = extract_video_features(video_path, pose_model)
    if raw_seq is None:
        print("❌ خطأ: لم يتم قراءة أو استخراج المعالم من الفيديو بنجاح.")
        return

    enhanced = enhance(raw_seq)
    X_input = np.expand_dims(enhanced, axis=0) # شكل المدخلات المناسب للنموذج (1, 30, 68)

    print("🧠 جاري التنبؤ بالإشارة...")
    preds = model.predict(X_input, verbose=0)[0]
    top_idx = np.argmax(preds)
    confidence = preds[top_idx] * 100
    predicted_class = classes[top_idx]

    print("\n" + "="*40)
    print(f"🎯 نتيجة التنبؤ بالحركة:")
    print(f"   - الكلمة (Gloss): {predicted_class}")
    print(f"   - نسبة الثقة (Confidence): {confidence:.2f}%")
    print("="*40)

    # عرض أقوى 3 احتمالات بديلة
    top_3 = np.argsort(preds)[-3:][::-1]
    print("\n📊 أفضل 3 احتمالات بديلة:")
    for i, idx in enumerate(top_3, 1):
        print(f"   {i}. {classes[idx]} — نسبة الثقة: {preds[idx]*100:.2f}%")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict an ASL sign from a video file.")
    parser.add_argument("video", type=Path, help="Path to an input video")
    args = parser.parse_args()
    if not args.video.is_file():
        parser.error(f"Video file not found: {args.video}")
    if not POSE_WEIGHTS.is_file():
        parser.error(
            f"YOLO pose weights not found: {POSE_WEIGHTS}. "
            "Set YOLO_POSE_WEIGHTS to a valid yolov8n-pose.pt file."
        )
    predict_sign(args.video)
