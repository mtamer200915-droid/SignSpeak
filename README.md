# Signova

Signova is an experimental American Sign Language (ASL) video translator. This repository contains the browser interface, FastAPI backend, trained model artifacts, extracted features, and both prepared video datasets.

## Project files

- `index.html`, `style.css`, and `app.js` at the repository root are the GitHub Pages frontend. The matching frontend source and backend are in `Signova_Frontend_DarkAI/`.
- `Signova_Frontend_DarkAI/app.py` exposes `POST /api/predict`, extracts pose landmarks, runs the 166-class Keras model, and optionally sends the clip to Gemini for video verification.
- `SignNova_Complete.py` trains the combined model. Augmentation is applied only after splitting off the held-out test samples.
- `predict.py` runs local inference on a video file.
- `dataset/` contains the 100-class dataset and earlier model artifacts. `New_dataset/` contains the 166-class dataset, extracted features, and current model.

## Requirements

Use Python 3.10–3.12 and install the backend dependencies in a virtual environment:

```powershell
py -m pip install fastapi uvicorn python-multipart numpy opencv-python tensorflow ultralytics google-genai
```

The backend needs Ultralytics pose weights named `yolov8n-pose.pt`. The file is not included in this repository. Set `YOLO_POSE_WEIGHTS` to its full path before starting the backend. Gemini verification is optional; set `GEMINI_API_KEY` in the environment to enable it. Without that key, the API returns the local model result. Do not put API keys in source files.

## Run locally

Start the backend in one terminal:

```powershell
Set-Location .\Signova_Frontend_DarkAI
py -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Serve the repository root in another terminal with VS Code Live Server or:

```powershell
py -m http.server 5500
```

Open `http://localhost:5500`. In **Translator**, start the camera and press **Stop** after recording, or choose **Upload sign video**. The browser sends the clip to the local backend. When Gemini is enabled, the clip is also sent to Google for verification. Camera access requires localhost or HTTPS. Sentence and history entries stay in the current browser session.

## Checks and model status

Check the frontend with `node --check app.js`. Check Python syntax without running inference with:

```powershell
py -m py_compile Signova_Frontend_DarkAI\app.py SignNova_Complete.py predict.py
```

The saved training report records test accuracy of about **0.50%** across 166 classes. Treat predictions as experimental until the model is retrained and evaluated successfully. Training is not run by the startup steps because it overwrites the saved model files.
