"""Signova V2 inference API for the 20-word isolated ASL demo."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "signova_v2.keras"
INFO_PATH = ROOT / "models" / "model_info.json"
SIZE = 224
FRAME_COUNT = 12
SAMPLE_FPS = 8
MAX_UPLOAD_BYTES = 80 * 1024 * 1024

app = FastAPI(title="Signova V2 Prediction API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_model = None
_info: dict = {}
_ffmpeg = None


def get_ffmpeg() -> str:
    global _ffmpeg
    if _ffmpeg:
        return _ffmpeg
    try:
        import imageio_ffmpeg
        _ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        return _ffmpeg
    except Exception as exc:
        raise RuntimeError("FFmpeg is unavailable on this API host.") from exc


def load_bundle() -> None:
    global _model, _info
    if not MODEL_PATH.is_file() or not INFO_PATH.is_file():
        raise RuntimeError("Signova V2 model files are missing. Run the training workflow first.")
    _info = json.loads(INFO_PATH.read_text(encoding="utf-8"))
    _model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    expected = (FRAME_COUNT, SIZE, SIZE, 3)
    if tuple(_model.input_shape[1:]) != expected:
        raise RuntimeError(f"Expected model input {expected}; found {_model.input_shape}.")
    if _model.output_shape[-1] != len(_info.get("classes", [])):
        raise RuntimeError("Model output size does not match model_info.json classes.")


@app.on_event("startup")
def startup() -> None:
    load_bundle()


def decode_frames(path: Path) -> np.ndarray:
    crop = "crop='min(iw,ih)':'min(iw,ih)':'(iw-ow)/2':'(ih-oh)/2'"
    vf = (
        f"{crop},scale={SIZE}:{SIZE}:force_original_aspect_ratio=decrease,"
        f"pad={SIZE}:{SIZE}:(ow-iw)/2:(oh-ih)/2,fps={SAMPLE_FPS}"
    )
    command = [
        get_ffmpeg(), "-hide_banner", "-loglevel", "error", "-i", str(path), "-t", "10",
        "-an", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ]
    try:
        proc = subprocess.run(command, capture_output=True, timeout=45)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=422, detail="The video took too long to decode. Use a shorter clip.") from exc
    if proc.returncode != 0:
        raise HTTPException(status_code=422, detail="The uploaded file could not be decoded as a video.")
    size = SIZE * SIZE * 3
    n = len(proc.stdout) // size
    if n < 2:
        raise HTTPException(status_code=422, detail="The video has too few readable frames. Try a clear 2–8 second clip.")
    frames = np.frombuffer(proc.stdout[:n * size], dtype=np.uint8).reshape(n, SIZE, SIZE, 3)
    indexes = np.linspace(0, n - 1, FRAME_COUNT).round().astype(np.int32)
    return frames[indexes].astype(np.float32)


@app.get("/")
def root() -> dict:
    return {"service": "Signova V2", "health": "/health", "prediction": "/api/predict"}


@app.get("/health")
def health() -> dict:
    if _model is None:
        raise HTTPException(status_code=503, detail="The V2 model has not loaded.")
    test = _info.get("test", {})
    return {
        "status": "ok",
        "model_loaded": True,
        "model_version": "v2",
        "classes": _info.get("classes", []),
        "test_accuracy": test.get("top1_accuracy"),
        "test_top1_accuracy": test.get("top1_accuracy"),
        "experimental": True,
    }


@app.post("/api/predict")
async def predict(file: UploadFile = File(...)) -> dict:
    if _model is None:
        raise HTTPException(status_code=503, detail="The V2 model is not ready.")
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Video is too large. Keep uploads under 80 MB.")
    if not payload:
        raise HTTPException(status_code=400, detail="Choose a non-empty video file.")

    suffix = Path(file.filename or "sign.mp4").suffix.lower()
    if suffix not in {".mp4", ".mov", ".webm", ".m4v", ".mkv", ".avi"}:
        suffix = ".mp4"
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp:
            temp.write(payload)
            temp_path = Path(temp.name)
        frames = decode_frames(temp_path)
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except UnboundLocalError:
            pass

    scaled = tf.keras.applications.mobilenet_v2.preprocess_input(frames)
    probabilities = _model.predict(scaled[None, ...], verbose=0)[0]
    classes = _info["classes"]
    order = np.argsort(probabilities)[::-1][:3]
    suggestions = [
        {"word": classes[int(index)], "score": round(float(probabilities[index] * 100), 2)}
        for index in order
    ]
    best = suggestions[0]
    return {
        "word": best["word"],
        "confidence": best["score"],
        "suggestions": suggestions,
        "prediction_source": "signova_v2_local_model",
        "pose_coverage": None,
        "model_version": "v2",
        "experimental": True,
    }
