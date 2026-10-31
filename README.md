# Signova

Signova is an experimental American Sign Language (ASL) video translator. The repository contains the browser interface, FastAPI backend, a 166-class landmark model bundle, extracted features, and prepared video datasets.

## Project files

- `index.html`, `style.css`, and `app.js` are the static frontend. Matching copies are in `Signova_Frontend_DarkAI/` beside the API.
- `Signova_Frontend_DarkAI/app.py` exposes `POST /api/predict` and `GET /health`.
- `SignNova_Complete.py` trains the 166-class model on WLASL's supplied train/validation/test partitions, augments only training clips, and saves a report with held-out metrics.
- `signova_features.py` is shared by training and inference so webcam clips and training samples use the same landmark preprocessing.
- `predict.py` runs local inference on a video file.
- `dataset/` and `New_dataset/` contain the prepared source data and model artifacts.

## Install

Use 64-bit Python 3.10–3.12. TensorFlow on native Windows runs on CPU. Install packages in a virtual environment:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

The API also needs Ultralytics pose weights named `yolov8n-pose.pt`; this file is not included. Set `YOLO_POSE_WEIGHTS` to its full path before starting the API. Gemini verification is optional. Set `GEMINI_API_KEY` only if you want uploaded clips to be sent to Gemini for a second opinion.

## Train and evaluate

Run training from the repository root:

```powershell
python SignNova_Complete.py
```

The run requires all 166 classes and at least two usable training clips per class. It writes the model, class-name mapping, and `training_report_166.json` only after training and held-out evaluation succeed. The supplied test partition contains 138 of the 166 classes, so its results do not measure the other 28 words. Review test accuracy, balanced accuracy, macro F1, class support, and the majority-class baseline in the report; a high training score alone is not evidence of useful recognition.

The report currently checked into this repository is from an older run. It reports about 0.50% test accuracy, and its class-name list does not match the `class_names_166.npy` file beside the saved model. Treat the existing model bundle as unverified until a fresh training run completes. No accuracy is promised for the current artifacts.

The API checks that the model, class-name file, and training report use the same preprocessing and class order. It will refuse to start with the current stale bundle; complete a fresh training run before testing camera predictions.

## Run the camera workflow locally

Start the API in one terminal:

```powershell
Set-Location .\Signova_Frontend_DarkAI
$env:YOLO_POSE_WEIGHTS = "C:\path\to\yolov8n-pose.pt"
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Serve the frontend from another terminal in the repository root:

```powershell
python -m http.server 5500
```

Open `http://localhost:5500`. In **Translator**, allow camera access, record one sign for a few seconds, then press **Stop**. The preview is live, but recognition runs after the clip is sent to the API. The API samples 30 frames, extracts pose landmarks, and runs the local model. The frontend also accepts uploaded sign videos.

For a hosted frontend, `index.html` must point `window.SIGNOVA_API_BASE` to a reachable HTTPS API before loading `app.js`, and the API must list the exact frontend origin in `SIGNOVA_CORS_ORIGINS`. GitHub Pages alone cannot host the model API or access a visitor's `127.0.0.1` backend. Camera permission requires localhost or HTTPS.

The API limits videos to 50 MB by default (`SIGNOVA_MAX_UPLOAD_BYTES` can change this). Gemini verification sends the uploaded clip to Google when `GEMINI_API_KEY` is configured; without the key, only the local prediction is used.

## Checks

```powershell
node --check app.js
python -m py_compile Signova_Frontend_DarkAI\app.py SignNova_Complete.py predict.py signova_features.py
```
