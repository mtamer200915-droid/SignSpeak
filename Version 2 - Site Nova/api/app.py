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
from fastapi import Form
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "signova_v2.keras"
INFO_PATH = ROOT / "models" / "model_info.json"
CHAR_MODEL_PATH = ROOT / "models" / "signova_characters.keras"
CHAR_CLASS_PATH = ROOT / "models" / "character_class_names.json"
CHAR_INFO_PATH = ROOT / "models" / "character_model_info.json"
DIGIT_MODEL_PATH = ROOT / "models" / "signova_digits.keras"
DIGIT_INFO_PATH = ROOT / "models" / "digit_model_info.json"
LETTER_MODEL_PATH = ROOT / "models" / "signova_letters.keras"
LETTER_INFO_PATH = ROOT / "models" / "letter_model_info.json"
SIZE = 224
FRAME_COUNT = 12
SAMPLE_FPS = 8
MAX_UPLOAD_BYTES = 80 * 1024 * 1024

app = FastAPI(title="Signova V2 Prediction API", version="2.3.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_model = None
_info: dict = {}
_character_model = None
_character_info: dict = {}
_character_classes: list[str] = []
_digit_model = None
_digit_info: dict = {}
_letter_model = None
_letter_info: dict = {}
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
    global _model, _info, _character_model, _character_info, _character_classes, _digit_model, _digit_info, _letter_model, _letter_info
    _digit_model, _digit_info = None, {}
    _letter_model, _letter_info = None, {}
    if not MODEL_PATH.is_file() or not INFO_PATH.is_file():
        raise RuntimeError("Signova V2 model files are missing. Run the training workflow first.")
    _info = json.loads(INFO_PATH.read_text(encoding="utf-8"))
    _model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    expected = (FRAME_COUNT, SIZE, SIZE, 3)
    if tuple(_model.input_shape[1:]) != expected:
        raise RuntimeError(f"Expected model input {expected}; found {_model.input_shape}.")
    if _model.output_shape[-1] != len(_info.get("classes", [])):
        raise RuntimeError("Model output size does not match model_info.json classes.")

    # The image-based character model is optional so the existing word API keeps
    # starting normally while character training is in progress.
    character_files = (CHAR_MODEL_PATH, CHAR_CLASS_PATH, CHAR_INFO_PATH)
    if any(path.exists() for path in character_files):
        try:
            if not all(path.is_file() for path in character_files):
                raise RuntimeError("Character model bundle is incomplete.")
            _character_info = json.loads(CHAR_INFO_PATH.read_text(encoding="utf-8"))
            _character_classes = json.loads(CHAR_CLASS_PATH.read_text(encoding="utf-8"))
            if _character_info.get("classes") != _character_classes:
                raise RuntimeError("Character class names do not match character_model_info.json.")
            _character_model = tf.keras.models.load_model(CHAR_MODEL_PATH, compile=False)
            if tuple(_character_model.input_shape[1:]) != (SIZE, SIZE, 3):
                raise RuntimeError("Character model must accept one 224x224 RGB image.")
            if _character_model.output_shape[-1] != len(_character_classes):
                raise RuntimeError("Character model output does not match its class-name file.")
        except Exception as exc:
            _character_model = None
            _character_info = {}
            _character_classes = []
            print(f"Character model unavailable; word model remains online: {exc}", flush=True)

    # A specialized digit model can coexist with the character model. A broken
    # or absent optional bundle leaves the existing character fallback intact.
    if DIGIT_MODEL_PATH.exists() or DIGIT_INFO_PATH.exists():
        try:
            if not DIGIT_MODEL_PATH.is_file() or not DIGIT_INFO_PATH.is_file():
                raise RuntimeError("Digit model bundle is incomplete.")
            digit_info = json.loads(DIGIT_INFO_PATH.read_text(encoding="utf-8"))
            if digit_info.get("classes") != list("0123456789"):
                raise RuntimeError("Digit model class order is invalid.")
            digit_model = tf.keras.models.load_model(DIGIT_MODEL_PATH, compile=False)
            if tuple(digit_model.input_shape[1:]) != (SIZE, SIZE, 3) or digit_model.output_shape[-1] != 10:
                raise RuntimeError("Digit model dimensions are invalid.")
            _digit_info, _digit_model = digit_info, digit_model
        except Exception as exc:
            print(f"Specialized digit model unavailable; using character fallback: {exc}", flush=True)

    if LETTER_MODEL_PATH.exists() or LETTER_INFO_PATH.exists():
        try:
            if not LETTER_MODEL_PATH.is_file() or not LETTER_INFO_PATH.is_file():
                raise RuntimeError("Letter model bundle is incomplete.")
            letter_info = json.loads(LETTER_INFO_PATH.read_text(encoding="utf-8"))
            if letter_info.get("classes") != list("ABCDEFGHIJKLMNOPQRSTUVWXYZ"):
                raise RuntimeError("Letter model class order is invalid.")
            letter_model = tf.keras.models.load_model(LETTER_MODEL_PATH, compile=False)
            if tuple(letter_model.input_shape[1:]) != (SIZE, SIZE, 3) or letter_model.output_shape[-1] != 26:
                raise RuntimeError("Letter model dimensions are invalid.")
            _letter_info, _letter_model = letter_info, letter_model
        except Exception as exc:
            print(f"Specialized letter model unavailable; using character fallback: {exc}", flush=True)


@app.on_event("startup")
def startup() -> None:
    load_bundle()


def decode_frames(path: Path) -> np.ndarray:
    # Keep this preprocessing aligned with train_model.extract_frames().
    vf = (
        f"fps={SAMPLE_FPS},scale={SIZE}:{SIZE}:force_original_aspect_ratio=decrease,"
        f"pad={SIZE}:{SIZE}:(ow-iw)/2:(oh-ih)/2"
    )
    command = [
        get_ffmpeg(), "-hide_banner", "-loglevel", "error", "-i", str(path), "-t", "6",
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
    return {
        "service": "Signova V2",
        "health": "/health",
        "prediction": "/api/predict",
        "prediction_modes": ["words", "letters", "numbers"],
    }


@app.get("/health")
def health() -> dict:
    if _model is None:
        raise HTTPException(status_code=503, detail="The V2 model has not loaded.")
    test = _info.get("test", {})
    return {
        "status": "ok",
        "model_loaded": True,
        "model_version": "v2",
        "build_sha": os.environ.get("SIGNOVA_BUILD_SHA", "local"),
        "classes": _info.get("classes", []),
        "test_accuracy": test.get("top1_accuracy"),
        "test_top1_accuracy": test.get("top1_accuracy"),
        "experimental": True,
        "available_modes": {
            "words": {"model_loaded": True, "classes": _info.get("classes", [])},
            "letters": {
                "model_loaded": _letter_model is not None or _character_model is not None,
                "dedicated_model_loaded": _letter_model is not None,
                "classes": list("ABCDEFGHIJKLMNOPQRSTUVWXYZ") if _letter_model is not None else [label for label in _character_classes if len(label) == 1 and label.isalpha()],
                "test_accuracy": _letter_info.get("test", {}).get("top1_accuracy"),
                "test_sample_count": _letter_info.get("test", {}).get("sample_count"),
                "test_note": _letter_info.get("test", {}).get("note"),
            },
            "numbers": {
                "model_loaded": _digit_model is not None or _character_model is not None,
                "dedicated_model_loaded": _digit_model is not None,
                "classes": list("0123456789") if _digit_model is not None else [label for label in _character_classes if len(label) == 1 and label.isdigit()],
                "test_accuracy": _digit_info.get("test", {}).get("top1_accuracy"),
                "test_sample_count": _digit_info.get("test", {}).get("sample_count"),
                "test_note": _digit_info.get("test", {}).get("note"),
            },
            "characters": {
                "model_loaded": _character_model is not None,
                "classes": _character_classes,
                "test_accuracy": _character_info.get("test", {}).get("top1_accuracy"),
                "test_clip_count": _character_info.get("test", {}).get("clip_count"),
            },
        },
    }


@app.post("/api/predict")
async def predict(
    file: UploadFile = File(...),
    mode: str = Form("words"),
    character_kind: str = Form("all"),
) -> dict:
    if _model is None:
        raise HTTPException(status_code=503, detail="The V2 model is not ready.")
    if mode in {"letters", "numbers"}:
        if character_kind not in {"all", mode}:
            raise HTTPException(status_code=400, detail="The selected mode and character filter do not match.")
        character_kind = mode
        mode = "characters"
    if mode not in {"words", "characters"}:
        raise HTTPException(status_code=400, detail="Choose words, letters, or numbers prediction mode.")
    if character_kind not in {"all", "letters", "numbers"}:
        raise HTTPException(status_code=400, detail="Choose all characters, letters, or numbers.")
    if mode == "words" and character_kind != "all":
        raise HTTPException(status_code=400, detail="Character type filters can only be used with the character model.")
    use_digit_model = mode == "characters" and character_kind == "numbers" and _digit_model is not None
    use_letter_model = mode == "characters" and character_kind == "letters" and _letter_model is not None
    if mode == "characters" and _character_model is None and not (use_digit_model or use_letter_model):
        raise HTTPException(status_code=503, detail="The letters and numbers model is not trained or installed yet.")
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The image or video is too large. Keep uploads under 80 MB.")
    if not payload:
        raise HTTPException(status_code=400, detail="Choose a non-empty image or video file.")

    suffix = Path(file.filename or "sign.mp4").suffix.lower()
    image_suffixes = {".jpg", ".jpeg", ".png"}
    video_suffixes = {".mp4", ".mov", ".webm", ".m4v", ".mkv", ".avi"}
    is_image = suffix in image_suffixes or (file.content_type or "").lower().startswith("image/")
    if mode == "words" and is_image:
        raise HTTPException(status_code=415, detail="The word model needs a short video clip. Use a video upload.")

    if mode == "characters" and is_image:
        try:
            image = tf.io.decode_image(payload, channels=3, expand_animations=False)
            image = tf.image.resize(image, (SIZE, SIZE), antialias=True)
            character_input = tf.cast(image, tf.float32)[None, ...]
        except Exception as exc:
            raise HTTPException(status_code=422, detail="The image could not be decoded. Use a clear JPG or PNG photo.") from exc
        image_model = _digit_model if use_digit_model else (_letter_model if use_letter_model else _character_model)
        probabilities = image_model.predict(character_input, verbose=0)[0]
        input_type = "image"
    else:
        if suffix not in video_suffixes:
            raise HTTPException(status_code=415, detail="Choose a supported video file, or send a JPG or PNG image in character mode.")
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

        if mode == "characters":
            # Average per-frame static-handshape scores for character videos.
            image_model = _digit_model if use_digit_model else (_letter_model if use_letter_model else _character_model)
            frame_probabilities = image_model.predict(frames, batch_size=FRAME_COUNT, verbose=0)
            probabilities = frame_probabilities.mean(axis=0)
        else:
            scaled = tf.keras.applications.mobilenet_v2.preprocess_input(frames.copy())
            probabilities = _model.predict(scaled[None, ...], verbose=0)[0]
        input_type = "video"

    if use_digit_model:
        classes = list("0123456789")
        candidate_scores = probabilities
    elif use_letter_model:
        classes = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        candidate_scores = probabilities
    elif mode == "characters":
        available_classes = _character_classes
        if character_kind == "letters":
            selected_indices = [index for index, label in enumerate(available_classes) if len(label) == 1 and label.isalpha()]
        elif character_kind == "numbers":
            selected_indices = [index for index, label in enumerate(available_classes) if len(label) == 1 and label.isdigit()]
        else:
            selected_indices = list(range(len(available_classes)))
        if not selected_indices:
            raise HTTPException(status_code=503, detail="The selected character classes are missing from the model.")
        classes = [available_classes[index] for index in selected_indices]
        candidate_scores = probabilities[selected_indices]
    else:
        classes = _info["classes"]
        candidate_scores = probabilities
    order = np.argsort(candidate_scores)[::-1][:3]
    suggestions = [
        {"word": classes[int(index)], "score": round(float(candidate_scores[index] * 100), 2)}
        for index in order
    ]
    best = suggestions[0]
    return {
        "word": best["word"],
        "confidence": best["score"],
        "suggestions": suggestions,
        "prediction_source": "signova_v2_digit_model" if use_digit_model else ("signova_v2_letter_model" if use_letter_model else ("signova_v2_character_model" if mode == "characters" else "signova_v2_local_model")),
        "pose_coverage": None,
        "model_version": "digits-v1" if use_digit_model else ("letters-v1" if use_letter_model else ("characters-v1" if mode == "characters" else "v2")),
        "prediction_mode": mode,
        "character_kind": character_kind if mode == "characters" else None,
        "input_type": input_type,
        "experimental": True,
    }
