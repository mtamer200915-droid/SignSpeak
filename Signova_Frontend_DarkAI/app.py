"""Signova - FastAPI for local pose classification with an optional Gemini second opinion."""
from pathlib import Path
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import os
import sys
import subprocess
import tempfile
import time
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
from signova_features import (
    FRAMES,
    MODEL_DIM,
    POSE_DIM,
    PREPROCESSING_VERSION,
    enhance_pose_sequence,
)

try:
    from google import genai
except ImportError:
    genai = None

app = FastAPI(title="Signova Multimodal API", version="4.1")

configured_origins = [
    origin.strip()
    for origin in os.getenv("SIGNOVA_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini video second opinion is optional. Keep the key outside source control.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY and genai else None

# Paths and core files for the local model
PROJECT_ROOT = Path(__file__).resolve().parents[1]
NEW_ROOT = PROJECT_ROOT / "New_dataset" / "dataset"
MODELS_DIR = NEW_ROOT / "models_combined_166"
MODEL_PATH = MODELS_DIR / "sign_language_model_166.keras"
CLASS_PATH = MODELS_DIR / "class_names_166.npy"
REPORT_PATH = MODELS_DIR / "training_report_166.json"
POSE_WEIGHTS_OVERRIDE = os.getenv("YOLO_POSE_WEIGHTS")
POSE_WEIGHTS = Path(POSE_WEIGHTS_OVERRIDE) if POSE_WEIGHTS_OVERRIDE else Path("yolov8n-pose.pt")
POSE_WORKER_PATH = Path(__file__).with_name("pose_infer.py")

MAX_UPLOAD_BYTES = int(os.getenv("SIGNOVA_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))

print("Loading the local prediction model and pose weights...")
if not MODEL_PATH.exists() or not CLASS_PATH.exists() or not REPORT_PATH.exists():
    raise FileNotFoundError("The model, class labels, or training report file is missing.")
model = tf.keras.models.load_model(MODEL_PATH)
classes = np.load(CLASS_PATH, allow_pickle=False)
training_report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
if training_report.get("preprocessing") != PREPROCESSING_VERSION:
    raise RuntimeError(
        "Saved model was not trained with the current webcam preprocessing. "
        "Run SignNova_Complete.py successfully before starting the API."
    )
if training_report.get("class_names") != classes.tolist():
    raise RuntimeError(
        "Saved class names do not match the training report. Retrain the model bundle before starting the API."
    )
if model.output_shape[-1] != len(classes):
    raise ValueError(
        f"Model outputs {model.output_shape[-1]} classes, but the class file has {len(classes)}."
    )
if tuple(model.input_shape[1:]) != (FRAMES, MODEL_DIM):
    raise ValueError(
        f"Model expects {model.input_shape}; preprocessing produces ({FRAMES}, {MODEL_DIM})."
    )
prediction_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="signova-inference")
DEMO_EXPIRES_AT_FILE = os.getenv("SIGNOVA_DEMO_EXPIRES_AT_FILE")
MIN_POSE_COVERAGE = float(os.getenv("SIGNOVA_MIN_POSE_COVERAGE", "0.35"))
print("The local prediction service is ready.")


def infer_video(video_path: Path) -> dict[str, object]:
    """Extract pose landmarks in an isolated worker, then classify them with TensorFlow."""
    pose_path = video_path.with_name(f"{video_path.name}.poses.npz")
    try:
        try:
            worker = subprocess.run(
                [sys.executable, str(POSE_WORKER_PATH), str(video_path), str(pose_path)],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=180,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            raise HTTPException(
                status_code=504,
                detail="Pose extraction took too long. Try a shorter video.",
            ) from error
        if worker.returncode != 0:
            worker_output = "\n".join(part for part in (worker.stdout, worker.stderr) if part).strip()
            if "VIDEO_ERROR:" in worker_output:
                message = worker_output.split("VIDEO_ERROR:", 1)[1].strip().splitlines()[0]
                raise HTTPException(status_code=400, detail=message)
            print(f"Pose extraction worker exited with {worker.returncode}: {worker_output[-4000:]}")
            raise HTTPException(
                status_code=500,
                detail="Pose extraction stopped unexpectedly. The API stayed online; retry with a short MP4 or WebM clip.",
            )

        with np.load(pose_path) as pose_data:
            arr = np.asarray(pose_data["frames"], dtype=np.float32)
            pose_coverage = float(pose_data["pose_coverage"])

        if pose_coverage < MIN_POSE_COVERAGE:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No signer was clearly visible in enough frames. Keep the person's face, shoulders, "
                    "and both arms in frame, then try again. Do not point the camera at a screen playing a video."
                ),
            )

        if len(arr) < FRAMES:
            arr = np.vstack([arr, np.zeros((FRAMES - len(arr), POSE_DIM), np.float32)])
        arr = arr[:FRAMES]

        enhanced = enhance_pose_sequence(arr)
        probabilities = model.predict(np.expand_dims(enhanced, axis=0), verbose=0)[0]
        top_indices = np.argsort(probabilities)[-3:][::-1]
        top_idx = int(top_indices[0])
        candidates = [
            {"word": str(classes[int(index)]), "score": round(float(probabilities[index] * 100), 2)}
            for index in top_indices
        ]
        print(
            f"🔍 Local Model Prediction: {classes[top_idx]} "
            f"(score: {probabilities[top_idx] * 100:.2f}%, pose coverage: {pose_coverage:.0%})"
        )
        return {
            "word": str(classes[top_idx]),
            "confidence": float(probabilities[top_idx] * 100),
            "pose_coverage": pose_coverage,
            "suggestions": candidates,
        }
    finally:
        if pose_path.exists():
            try:
                pose_path.unlink()
            except OSError:
                pass


def demo_expiry_status() -> tuple[int | None, int | None]:
    if not DEMO_EXPIRES_AT_FILE:
        return None, None
    try:
        expires_at = int(Path(DEMO_EXPIRES_AT_FILE).read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None, None
    return expires_at, max(0, int(expires_at - time.time()))


@app.get("/health")
async def health():
    demo_expires_at, seconds_remaining = demo_expiry_status()
    return {
        "status": "ok",
        "model_loaded": True,
        "classes": len(classes),
        "test_accuracy": float(training_report.get("test_accuracy", 0.0)),
        "test_balanced_accuracy": float(training_report.get("test_balanced_accuracy", 0.0)),
        "pose_weights": POSE_WEIGHTS.name if POSE_WEIGHTS_OVERRIDE else "yolov8n-pose.pt",
        "gemini_enabled": client is not None,
        "demo_expires_at": demo_expires_at,
        "seconds_remaining": seconds_remaining,
    }

@app.post("/api/predict")
async def predict_frame_sequence(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".mp4", ".avi", ".mov", ".webm", ".mkv"}:
        raise HTTPException(
            status_code=400,
            detail="Unsupported video format. Upload an MP4, WebM, MOV, AVI, or MKV clip.",
        )

    temp_video_path = None
    video_file_ref = None

    try:
        # Save a bounded copy of the upload before processing it.
        contents = await file.read(MAX_UPLOAD_BYTES + 1)
        if not contents:
            raise HTTPException(status_code=400, detail="The uploaded video is empty.")
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"The video exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.",
            )
        with tempfile.NamedTemporaryFile(prefix="signova_", suffix=suffix, delete=False) as buffer:
            buffer.write(contents)
            temp_video_path = Path(buffer.name)

        # Keep TensorFlow classification serialized and keep the YOLO/OpenCV
        # native stack in a subprocess so it cannot collide with TensorFlow's
        # bundled LLVM libraries. The worker thread keeps /health responsive.
        loop = asyncio.get_running_loop()
        local_result = await loop.run_in_executor(prediction_executor, infer_video, temp_video_path)
        local_predicted_word = str(local_result["word"])
        confidence = float(local_result["confidence"])

        # Ask Gemini for an optional second opinion if the key is configured.
        final_word = local_predicted_word
        prediction_source = "local"
        try:
            if client is None:
                raise RuntimeError("GEMINI_API_KEY is not configured; using the local prediction.")
            print("Uploading the clip for an optional Gemini second opinion...")
            video_file_ref = client.files.upload(file=str(temp_video_path))

            while video_file_ref.state.name == "PROCESSING":
                await asyncio.sleep(1)
                video_file_ref = client.files.get(name=video_file_ref.name)

            if video_file_ref.state.name == "FAILED":
                raise Exception("Gemini could not process the uploaded clip.")

            allowed_labels = ", ".join(str(label) for label in classes)
            prompt = f"""
            You are an expert American Sign Language (ASL) validator and interpreter.
            A local sign language model analyzed this video and predicted the word: "{local_predicted_word}".

            Your Task:
            1. Watch the attached video carefully and observe the sign gesture being performed.
            2. Compare what you actually see in the video with the local model's prediction ("{local_predicted_word}").
            3. If the local model prediction matches what is in the video, confirm and output it in standard American English.
            4. If the local model prediction is WRONG or does not match the video gesture, ignore it and provide the correct ASL word/phrase based on your direct observation of the video in standard American English.
            5. Choose exactly one label from this allowed project vocabulary: {allowed_labels}
            6. Output only that exact label, with no explanation or punctuation. If uncertain, choose the local prediction.
            """

            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[video_file_ref, prompt]
            )

            if response and response.text:
                gemini_candidate = response.text.strip().strip("`\"'.,!? ")
                class_by_casefold = {str(label).casefold(): str(label) for label in classes}
                matched_class = class_by_casefold.get(gemini_candidate.casefold())
                if matched_class:
                    final_word = matched_class
                    prediction_source = "gemini_second_opinion"
                    print(f"🤖 Gemini Final Class Suggestion: {final_word}")
                else:
                    print("Gemini response was not an exact project class; retaining the local model result.")

        except Exception as gemini_err:
            print(f"Gemini second-opinion warning (using local fallback): {gemini_err}")
            # If Gemini fails or times out, retain the local model result.

        return {
            "word": final_word,
            "original_local_word": local_predicted_word,
            "prediction_source": prediction_source,
            "confidence": round(confidence, 2),
            "pose_coverage": round(float(local_result["pose_coverage"]) * 100, 1),
            "suggestions": local_result["suggestions"],
        }

    finally:
        if temp_video_path is not None and temp_video_path.exists():
            try:
                temp_video_path.unlink(missing_ok=True)
            except Exception as e:
                print(f"Warning: Could not delete temp file: {e}")

        # Delete the temporary video from Gemini storage
        if video_file_ref is not None and client is not None:
            try:
                client.files.delete(name=video_file_ref.name)
            except Exception:
                pass

if __name__ == "__main__":
    uvicorn.run(
        app,
        host=os.getenv("SIGNOVA_HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
    )
