# Signova

Signova is an experimental American Sign Language (ASL) video translator. The repository contains the browser interface, FastAPI backend, a 166-class landmark model bundle, extracted features, and prepared video datasets.

## Project files

- `index.html`, `style.css`, and `app.js` are the static frontend. Matching copies are in `Signova_Frontend_DarkAI/` beside the API.
- `Signova_Frontend_DarkAI/app.py` exposes `POST /api/predict` and `GET /health`.
- `SignNova_Complete.py` trains the 166-class model from `New_dataset` on WLASL's supplied train/validation/test partitions, augments only training clips, and saves a report with held-out metrics. The older `dataset/` tree is retained as an archive and is not used as a fallback source for training.
- `signova_features.py` is shared by training and inference so webcam clips and training samples use the same landmark preprocessing.
- `predict.py` runs local inference on a video file.
- `dataset/` and `New_dataset/` contain the prepared source data and model artifacts.

The older pose-feature cache contains 897 files. All 897 normalized video IDs also exist in the 1,609-file `New_dataset` cache; 793 pairs have identical bytes, while the other 104 are different feature arrays for IDs already covered by the newer cache. Training now reads only `New_dataset`, so old features cannot silently replace or mix with the selected 166-class features. No dataset files were deleted.

## Install

Use 64-bit Python 3.10–3.12. TensorFlow on native Windows runs on CPU. Install packages in a virtual environment:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements.txt
```

On the first prediction, the isolated pose worker downloads Ultralytics' official `yolov8n-pose.pt` weights if they are not already available; the host needs internet access for that first run. To use an existing local file instead, set `YOLO_POSE_WEIGHTS` to its full path. Pose extraction runs in a separate process from TensorFlow classification to avoid native-library conflicts. Gemini's second opinion is optional. Set `GEMINI_API_KEY` only if you want uploaded clips to be sent to Google; an answer is accepted only when it exactly matches one of the project's 166 class labels.

## Train and evaluate

Run training from the repository root:

```powershell
python SignNova_Complete.py
```

The run requires all 166 classes and at least two usable training clips per class. It writes the model, class-name mapping, and `training_report_166.json` only after training and held-out evaluation succeed. The supplied test partition contains 138 of the 166 classes, so its results do not measure the other 28 words. Review test accuracy, balanced accuracy, macro F1, class support, and the majority-class baseline in the report; a high training score alone is not evidence of useful recognition.

The current checked-in bundle was retrained on GitHub Actions from the official WLASL splits for 49 epochs. It reports 15.42% test accuracy, 16.30% balanced test accuracy, and 13.78% macro F1 on 201 test videos covering 138 of 166 classes; the majority-class baseline is 1.49%. The model and class map now match. This is a substantial improvement over the previous 0.50% result, but it is still experimental and far below accuracy suitable for dependable communication.

The Linux API smoke check confirms that the model loads, downloads YOLO pose weights, accepts a video, and returns a prediction. It does not establish that the prediction is correct: on video `00623`, whose training label is `accident`, the API returned `student` with a 40.06% model score. The frontend labels this value as a model score and warns users to verify each word.

Training now keeps the existing model files unless the candidate clears the configured minimum and does not regress against the checked-in report in validation accuracy, test accuracy, balanced accuracy, or macro F1. This prevents the automated training workflow from silently replacing the served model with a weaker one. It does not itself improve accuracy: the current body-only model still needs more labeled signers and hand/finger landmarks to make a substantial gain.

The public repository also has a Linux GitHub Actions training workflow. It runs when the training code or tracked feature data changes, and commits the model, class mapping, and report only when the quality gate passes. Standard GitHub-hosted runners are free for public repositories; this does not keep the prediction API online.

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

Open `http://localhost:5500`. In **Translator**, allow camera access and wait for the in-browser guide to show that your face and shoulders are centered. Press **Start sign**, perform one word, then press **Stop & predict**. The guide uses MediaPipe Pose Landmarker in the browser; the live preview is not uploaded, and the clip is sent to the API only after recording stops. You can switch between front and rear cameras while not recording. Press **Done** to add each reviewed prediction to your sentence, then **Play audio** to read the collected words aloud using the browser's built-in speech synthesis. The API samples 30 frames, extracts pose landmarks, and runs the local model. The frontend also accepts uploaded sign videos.

The browser requires localhost or HTTPS for camera permission. The local development default is `http://127.0.0.1:8000`.

For each prediction, the Translator can show up to three highest-scoring model labels. Select the word you actually performed before pressing **Done**. These scores are experimental model outputs, not calibrated probabilities or a measure of guaranteed correctness; choosing a suggestion only corrects the current sentence, it does not retrain the model.

## Keep the API available automatically for the team

GitHub Pages only hosts the static website. The API must run on a separate service. The repository includes a Cloud Run deployment workflow that gives the API a stable HTTPS address, starts it automatically when the connected website or a prediction request reaches it, and scales it to zero after inactivity. A later request wakes the same service address again, so the team does not need to restart the API for each session. The container is configured for one shared instance and accepts up to four requests at once; model inference is serialized so concurrent uploads do not use the TensorFlow and YOLO model objects at the same time.

There is a one-time Google Cloud setup before the team can use automatic wake-up. The GitHub workflow uses Workload Identity Federation (no long-lived service-account key) and expects these repository settings:

- Secrets: `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and `GCP_DEPLOY_SERVICE_ACCOUNT`.
- Optional repository variable: `GCP_REGION` (defaults to `me-central1`, Doha).
- Use a dedicated Google Cloud project for the demo. Enable Cloud Run, Cloud Build, and Artifact Registry. Grant the GitHub deploy service account Cloud Run Source Developer, Cloud Run Admin (the workflow creates a public service), and Service Usage Consumer. Grant it Service Account User on the Cloud Run runtime identity. Grant the Cloud Build service account Cloud Run Builder.
- Configure the Workload Identity provider to trust only this repository, `mtamer200915-droid/SignSpeak`, and grant its repository principal `roles/iam.workloadIdentityUser` on the deploy service account. Store the full provider resource name and service account email in the named GitHub secrets.

After that setup, start **Actions → Deploy Signova API to auto-waking Cloud Run** manually when you choose to deploy. The workflow builds the container, deploys it, checks `/health`, sends a public sample prediction, and puts a connected website link in the run summary. Share that connected link with the team. The API address remains stable through scale-down and restart. Regular code pushes do not deploy to Google Cloud; use this workflow only after confirming the billing setup and expected costs.

Cloud Run currently has a request-based monthly free allowance for CPU, memory, and requests, aggregated across projects on the billing account. Google Cloud still requires an active billing account, and deployment/build/storage or usage beyond free limits can be charged; the free allowance is not a promise of zero cost. Check the current [Cloud Run pricing](https://cloud.google.com/run/pricing) and set a budget alert before using this optional deployment. The service is capped at one instance and scales to zero when unused. A cold start can delay the first request after inactivity. See [scale-to-zero behavior](https://docs.cloud.google.com/run/docs/about-instance-autoscaling) and [source deployment roles](https://docs.cloud.google.com/run/docs/deploying-source-code).

The API is public so the team can use it without separate accounts. Use demonstration clips only; do not send private recordings. The app's current model is experimental and does not guarantee correct predictions.

## Share the website with the team

The workflow in `.github/workflows/pages.yml` publishes the static website files, including `framing.css`; it does not publish the video datasets or model files. On the repository's first Pages deployment, open **Settings → Pages** and select **GitHub Actions** as the publishing source. After the workflow succeeds, GitHub displays the team website URL in the deployment details. This repository's expected URL is `https://mtamer200915-droid.github.io/SignSpeak/`.

For this free temporary team demo, use the connected link from the GitHub Actions / Cloudflare Quick Tunnel run summary. The optional Cloud Run route above provides a stable link but requires a Google Cloud billing account and can incur charges.

1. Open [Actions → Start temporary Signova team demo](https://github.com/mtamer200915-droid/SignSpeak/actions/workflows/team-demo.yml), click **Run workflow**, and choose a shared session (15, 30, 60, 180, or 315 minutes).
2. When setup and the public API check finish, open the workflow run summary and click **Open the website connected to the live API**. Share that page with the team.
3. The demo stops automatically at the selected time. Cancel the workflow run to stop it sooner.

This temporary route uses a public GitHub Actions runner and a random Cloudflare Quick Tunnel URL. The supervisor restarts the Python API automatically if it crashes during the chosen run, and the interface warns in the final 15 seconds. It still stops at the selected duration or runner limit; after that, the old tunnel address cannot be recovered by the browser. Use Cloud Run when you want automatic wake-up later from the same stable link.

The demo link is public and has no login, so anyone who sees it can send a video. Use demo clips only; do not send private recordings. The tunnel address changes each time and has no uptime guarantee, so this is for temporary team testing, not a permanent server.

GitHub Codespaces setup is also included for anyone who prefers to launch the API in a remote development environment. Its free personal-account quota is 120 hours on a 2-core machine and 15 GB-month storage for GitHub Free; the Codespace stops when idle. The temporary Actions demo above avoids using that quota.

The Windows application-control policy on the development computer blocks local TensorFlow imports, so the GitHub Actions smoke workflow verifies API/model execution. A real camera and browser permission test must still be performed on the target phone or computer. Hosting makes the app reachable; it does not improve model accuracy. The current 15.42% test accuracy is experimental and too low for dependable communication.

The API limits videos to 50 MB by default (`SIGNOVA_MAX_UPLOAD_BYTES` can change this). Gemini's optional second opinion sends the uploaded clip to Google when `GEMINI_API_KEY` is configured; without the key, only the local prediction is used.

## Checks

```powershell
node --check app.js
python -m py_compile Signova_Frontend_DarkAI\app.py SignNova_Complete.py predict.py signova_features.py
```
