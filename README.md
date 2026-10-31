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

On first API startup, Ultralytics downloads its official `yolov8n-pose.pt` pose weights if they are not already available; the host needs internet access for that first run. To use an existing local file instead, set `YOLO_POSE_WEIGHTS` to its full path. Gemini verification is optional. Set `GEMINI_API_KEY` only if you want uploaded clips to be sent to Gemini for a second opinion.

## Train and evaluate

Run training from the repository root:

```powershell
python SignNova_Complete.py
```

The run requires all 166 classes and at least two usable training clips per class. It writes the model, class-name mapping, and `training_report_166.json` only after training and held-out evaluation succeed. The supplied test partition contains 138 of the 166 classes, so its results do not measure the other 28 words. Review test accuracy, balanced accuracy, macro F1, class support, and the majority-class baseline in the report; a high training score alone is not evidence of useful recognition.

The current checked-in bundle was retrained on GitHub Actions from the official WLASL splits for 49 epochs. It reports 15.42% test accuracy, 16.30% balanced test accuracy, and 13.78% macro F1 on 201 test videos covering 138 of 166 classes; the majority-class baseline is 1.49%. The model and class map now match. This is a substantial improvement over the previous 0.50% result, but it is still experimental and far below accuracy suitable for dependable communication.

Training now keeps the existing model files unless validation accuracy, test accuracy, and balanced test accuracy each reach at least 10%. This is a minimum quality gate to reject near-random models, not a claim that 10% is good enough for real communication. `--min-accuracy` can raise the gate; it should not be lowered to force a weak model into use.

The public repository also has a Linux GitHub Actions training workflow. It runs when the training code or tracked feature data changes, and commits the model, class mapping, and report only when the quality gate passes. It can also be started from the Actions tab. Standard GitHub-hosted runners are free for public repositories; this does not keep the prediction API online.

The API checks that the model, class-name file, and training report use the same preprocessing and class order. The saved bundle passes those metadata checks. The local Windows environment still blocks TensorFlow imports under its application-control policy, so a full live camera session has not been verified on this computer.

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

The browser requires localhost or HTTPS for camera permission. The local development default is `http://127.0.0.1:8000`.

## Share the website with the team

The workflow in `.github/workflows/pages.yml` publishes only `index.html`, `style.css`, and `app.js`; it does not publish the video datasets or model files. On the repository's first Pages deployment, open **Settings → Pages** and select **GitHub Actions** as the publishing source. After the workflow succeeds, GitHub displays the team website URL in the deployment details. This repository's expected URL is `https://mtamer200915-droid.github.io/SignSpeak/`.

GitHub Pages serves the website files only. It cannot run this Python API, and `127.0.0.1` on a teammate's browser points to that teammate's own device. For a temporary no-cost team demo, start the API on a computer with a working Python environment and the checked-in model bundle; the first API start downloads the YOLO pose weights. Then expose port 8000 with a Cloudflare Quick Tunnel. Set the API's `SIGNOVA_CORS_ORIGINS` to `https://mtamer200915-droid.github.io` and open the team site with the tunnel address, for example:

```text
https://mtamer200915-droid.github.io/SignSpeak/?api=https://example.trycloudflare.com
```

Replace the example with the HTTPS address printed by `cloudflared tunnel --url http://127.0.0.1:8000`. The tunnel address changes each time, the API stops when the host computer or tunnel stops, and anyone who gets the address can submit videos. Do not use it for private recordings. A Quick Tunnel is for short demos, not an always-on service.

The latest trained model still produces experimental results at 15.42% test accuracy. The API has not yet been smoke-tested end to end in a deployed environment; a local Windows application-control policy prevents TensorFlow from loading here. A computer that can run the API and download YOLO weights is still required for live camera predictions.

The API limits videos to 50 MB by default (`SIGNOVA_MAX_UPLOAD_BYTES` can change this). Gemini verification sends the uploaded clip to Google when `GEMINI_API_KEY` is configured; without the key, only the local prediction is used.

## Checks

```powershell
node --check app.js
python -m py_compile Signova_Frontend_DarkAI\app.py SignNova_Complete.py predict.py signova_features.py
```
