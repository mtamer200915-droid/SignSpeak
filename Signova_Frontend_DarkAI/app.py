"""Signova - Advanced Hybrid Multimodal Backend API (Local Model + Gemini Video + Text Validation)."""
from pathlib import Path
import asyncio
import os
import tempfile
import numpy as np
import cv2
import tensorflow as tf
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import uvicorn

from google import genai

app = FastAPI(title="Signova Multimodal API", version="4.1")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini video validation is optional. Keep the key outside source control.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# المسارات والملفات الأساسية للنموذج المحلي
PROJECT_ROOT = Path(__file__).resolve().parents[1]
NEW_ROOT = PROJECT_ROOT / "New_dataset" / "dataset"
MODELS_DIR = NEW_ROOT / "models_combined_166"
MODEL_PATH = MODELS_DIR / "sign_language_model_166.keras"
CLASS_PATH = MODELS_DIR / "class_names_166.npy"
POSE_WEIGHTS = Path(os.getenv(
    "YOLO_POSE_WEIGHTS",
    str(PROJECT_ROOT / "dataset" / "dataset" / "models" / "yolov8n-pose.pt"),
))

FRAMES, DIM = 30, 34

print("⏳ جاري تحميل نموذج الذكاء الاصطناعي المحلي وأوزان الاستخراج...")
if not MODEL_PATH.exists() or not CLASS_PATH.exists():
    raise FileNotFoundError("ملفات النموذج أو التصنيفات غير موجودة في المسار المحدد!")
if not POSE_WEIGHTS.is_file():
    raise FileNotFoundError(
        f"YOLO pose weights not found: {POSE_WEIGHTS}. "
        "Set YOLO_POSE_WEIGHTS to a valid yolov8n-pose.pt file."
    )

model = tf.keras.models.load_model(MODEL_PATH)
classes = np.load(CLASS_PATH, allow_pickle=True)
pose_model = YOLO(str(POSE_WEIGHTS))
print("✅ النظام المحلي يعمل بكفاءة وجاهز!")

def enhance(seq):
    normalized = np.zeros_like(seq, dtype=np.float32)
    for t in range(seq.shape[0]):
        frame = seq[t].reshape(-1, 2)
        pts = frame[np.any(frame != 0, axis=1)]
        normalized[t] = (frame - pts.mean(axis=0)).flatten() if len(pts) else seq[t]
    vel = np.vstack([np.zeros((1, normalized.shape[1]), np.float32),
                     np.abs(np.diff(normalized, axis=0))])
    return np.concatenate([normalized, vel], axis=-1).astype(np.float32)

@app.post("/api/predict")
async def predict_frame_sequence(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".mp4", ".avi", ".mov", ".webm", ".mkv"}:
        raise HTTPException(status_code=400, detail="الملف المرسل ليس فيديو صالحاً.")

    temp_video_path = None
    video_file_ref = None
    cap = None

    try:
        # 1. حفظ الفيديو محلياً بطريقة صحيحة وآمنة
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="ملف الفيديو فارغ.")
        with tempfile.NamedTemporaryFile(prefix="signova_", suffix=suffix, delete=False) as buffer:
            buffer.write(contents)
            temp_video_path = Path(buffer.name)

        # 2. التحليل المحلي بالنموذج القديم (YOLO + TensorFlow)
        cap = cv2.VideoCapture(str(temp_video_path))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if cap.isOpened() else 0

        if total <= 0:
            if cap:
                cap.release()
            raise HTTPException(status_code=400, detail="تعذر قراءة إطارات الفيديو.")

        indices = np.linspace(0, total - 1, min(FRAMES, total), dtype=int).tolist()
        wanted, extracted_frames, idx = set(indices), [], 0

        while idx <= indices[-1]:
            ok, frame = cap.read()
            if not ok:
                break
            if idx in wanted:
                h, w = frame.shape[:2]
                vec = np.zeros(DIM, dtype=np.float32)
                result = pose_model.predict(frame, device="cpu", verbose=False)
                if result and result[0].keypoints is not None:
                    xy = result[0].keypoints.xy
                    if xy is not None and len(xy):
                        coords = xy[0].cpu().numpy().astype(np.float32)
                        coords[:, 0] /= max(w, 1)
                        coords[:, 1] /= max(h, 1)
                        vec = coords.reshape(-1)[:DIM]
                        if vec.size < DIM:
                            vec = np.pad(vec, (0, DIM-vec.size))
                extracted_frames.append(vec)
            idx += 1

        cap.release()

        if not extracted_frames:
            raise HTTPException(status_code=500, detail="فشل في استخراج المعالم من الفيديو.")

        arr = np.asarray(extracted_frames, dtype=np.float32)
        if len(arr) < FRAMES:
            arr = np.vstack([arr, np.zeros((FRAMES-len(arr), DIM), np.float32)])
        arr = arr[:FRAMES]

        enhanced = enhance(arr)
        X_input = np.expand_dims(enhanced, axis=0)

        # استخراج التوقع المحلي
        preds = model.predict(X_input, verbose=0)[0]
        top_idx = np.argmax(preds)
        confidence = float(preds[top_idx] * 100)
        local_predicted_word = str(classes[top_idx])

        print(f"🔍 Local Model Prediction: {local_predicted_word} (Confidence: {confidence:.2f}%)")

        # 3. إرسال الفيديو + الكلمة المحلية معاً إلى Gemini للتحقق والتدقيق البصري
        final_word = local_predicted_word
        try:
            if client is None:
                raise RuntimeError("GEMINI_API_KEY is not configured; using the local prediction.")
            print("⏳ جاري رفع الفيديو والتحقق منه عبر Gemini...")
            video_file_ref = client.files.upload(file=str(temp_video_path))

            while video_file_ref.state.name == "PROCESSING":
                await asyncio.sleep(1)
                video_file_ref = client.files.get(name=video_file_ref.name)

            if video_file_ref.state.name == "FAILED":
                raise Exception("فشل معالجة الفيديو على سحابة جوجل.")

            # البرومبت الذي يطلب من Gemini مشاهدة الفيديو ومقارنته بتوقع النموذج المحلي
            prompt = f"""
            You are an expert American Sign Language (ASL) validator and interpreter.
            A local sign language model analyzed this video and predicted the word: "{local_predicted_word}".

            Your Task:
            1. Watch the attached video carefully and observe the sign gesture being performed.
            2. Compare what you actually see in the video with the local model's prediction ("{local_predicted_word}").
            3. If the local model prediction matches what is in the video, confirm and output it in standard American English.
            4. If the local model prediction is WRONG or does not match the video gesture, ignore it and provide the correct ASL word/phrase based on your direct observation of the video in standard American English.
            5. Keep your response extremely concise: output ONLY the final correct American English word or short phrase, with zero extra text, punctuation marks, or explanations.
            """

            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[video_file_ref, prompt]
            )

            if response and response.text:
                final_word = response.text.strip()
                print(f"🤖 Gemini Final Validated/Corrected Word: {final_word}")

        except Exception as gemini_err:
            print(f"Gemini Multimodal Validation Warning (Using local fallback): {gemini_err}")
            # لو حصل أي تأخير أو خطأ في الـ API، يعتمد كلمة النموذج المحلي فوراً

        return {
            "word": final_word,
            "original_local_word": local_predicted_word,
            "confidence": round(confidence, 2)
        }

    finally:
        if cap is not None and cap.isOpened():
            cap.release()

        if temp_video_path is not None and temp_video_path.exists():
            try:
                temp_video_path.unlink(missing_ok=True)
            except Exception as e:
                print(f"Warning: Could not delete temp file: {e}")

        # تنظيف ملف الفيديو من سحابة جوجل
        if video_file_ref is not None and client is not None:
            try:
                client.files.delete(name=video_file_ref.name)
            except Exception:
                pass

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
