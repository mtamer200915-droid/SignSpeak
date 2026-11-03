# Signova V2 — Site Nova

Signova V2 is a separate, 20-word ASL video-recognition demo. The original Signova website and API remain in the repository root. V2 labels are **book**, **deaf**, **eat**, **drink**, **family**, **go**, **happy**, **help**, **home**, **like**, **mother**, **need**, **no**, **not**, **please**, **school**, **water**, **want**, **yes**, and **you**.

The model uses RGB video frames, a frozen ImageNet MobileNetV2 encoder, and a temporal Conv1D classifier. It returns three candidate words so the user can review the result. This is an experimental isolated-sign classifier, not continuous sign-language translation, and it does not promise perfect accuracy.

Select **Words**, **Letters**, or **Numbers** before capture. Words use a short video; letters and numbers use one photo. Both character modes use the same image model and FastAPI service, while the selected mode filters model candidates to A–Z or 0–9. The browser also crops around the detected hand before sending a camera photo. A JPG/PNG upload is supported for character predictions. The character model is optional: it is loaded only when its model, `character_class_names.json`, and `character_model_info.json` form a valid matching bundle. If that bundle is missing or invalid, word predictions remain available and the API reports a character-model error when a photo is submitted. ASL letter O and numeral 0 share the same static handshape, so the selected mode supplies the meaning category but does not increase the model's visual accuracy.

## Dataset and attribution

The data manifest selects source clips from **MS-ASL** and adds locally available WLASL training clips when supplied. MS-ASL provides separate train, validation, and test partitions. The preparation script removes source-video overlap across those partitions. It downloads each selected source locally and crops the annotated sign segment and signer region.

Short signer-cropped clips are included in `data/clips/` with the dataset-specific C-UDA copies in `data/licenses/`. Untrimmed originals and temporary downloads stay in ignored local folders. `data/manifest.jsonl` records the selected source IDs, URLs, labels, and timings; `prepare_data.py` can re-fetch clips from those sources. Follow the dataset terms and attribution when using or redistributing the data. Read the [MS-ASL download page](https://www.microsoft.com/en-us/download/details.aspx?id=100121), the [WLASL dataset page](https://github.com/dxli94/WLASL), and Microsoft's [C-UDA terms](https://github.com/microsoft/Computational-Use-of-Data-Agreement).

## Prepare and train

The checkout includes 736 usable clips: 533 train, 121 validation, and 82 test. Another 416 of the 1,152 manifest candidates are unavailable locally. The training script requires at least 18 clips per word, but some test classes have only one or two examples. The current held-out report is 25.6% top-1 and 48.8% top-3 accuracy across 82 clips, so the word model remains experimental and is not dependable yet. The category selector does not retrain or improve this word model.

To compare how training-set size affects results without changing the held-out test videos, run **Compare Signova V2 training sizes** in GitHub Actions. The reduced, current, and expanded profiles keep the original test set unchanged; the expanded profile leaves three validation examples per word and moves the other validation clips into training. Compare candidates using validation results, then treat test results as a final diagnostic rather than choosing whichever profile happens to score highest on the small test set. Candidate models are uploaded as artifacts and do not replace the live API model automatically.

The selected, signer-cropped train/validation/test clips are included in `data/clips/`, so the delivered model can be retrained without downloading the full source archives. From this directory, install the Python dependencies and train:

```powershell
python -m pip install -r requirements-training.txt
python train_model.py
```

Training writes `api/models/signova_v2.keras`, `api/models/class_names.json`, `api/models/model_info.json`, and the website's `web/model-report.json`. The report contains the actual sample counts, held-out top-1/top-3 accuracy, per-class accuracy, and confusion matrix. The held-out test split is not used for early stopping.

### Train the letters-and-numbers model

The supplied image archives were used to train a separate 40-label ASL character model (A–Z, 0–9, space, delete, nothing, and unknown). The script reads the two ZIP files directly and extracts a balanced sample of up to 400 unique images per label into train, validation, and test splits under an ignored `.downloads/character-training-*` directory; it does not add the image archives or extracted images to Git. The latest run has 12,618 training images, 1,575 validation images, and 1,575 held-out test images. Keep the word model files unchanged.

The supplied archives did not include a license/readme file. Check the original dataset pages and their redistribution terms before publishing derived data or model weights publicly.

```powershell
python train_character_model.py --alphabet-zip "G:\archive (1).zip" --digits-zip "G:\archive (2).zip"
```

This writes `api/models/signova_characters.keras`, `api/models/character_class_names.json`, and `api/models/character_model_info.json`. The current held-out image accuracy is 88.3% Top-1 and 97.1% Top-3 across 1,575 images; see `CHARACTER_DATA_PREPARATION.md` for per-label scores. This preliminary evaluation holds out random images because the supplied archives do not identify signer/session IDs. It must not be presented as independent camera accuracy. In particular, J and Z include movement, so add real labeled video examples and evaluate on separate recording sessions before relying on those predictions.

To recreate the sample selection from the source metadata or add local WLASL training clips, download the official MS-ASL metadata archive and extract WLASL v0.3, then run:

```powershell
python prepare_data.py --metadata-zip "C:\path\to\MS-ASL.zip" --wlasl-root "C:\path\to\WLASL" --workers 4
```

## Run locally

Install `api/requirements.txt`, then start the API from this directory:

```powershell
python -m uvicorn app:app --app-dir api --host 127.0.0.1 --port 8000
```

In a second terminal, serve the website with `python -m http.server 8080 --directory web`, then open `http://127.0.0.1:8080/?api=http://127.0.0.1:8000`. The V2 API offers `/health` and `/api/predict`; the same upload route accepts multipart `mode=words` or `mode=characters`. Character requests also send `character_kind=letters` or `character_kind=numbers`, so the API returns the top three candidates from only the selected category. No second API process is needed.

## GitHub Pages and temporary API

The Pages workflow publishes V2 at `/v2/`; the repository root `/` is the older website. Start **Start temporary Signova V2 team demo** from GitHub Actions and choose the requested duration (15, 30, 60, 180, or 315 minutes; default 60). Wait for **Start and verify the API, then get the connected website link** to pass, then open the connected website link in the newest run summary. That link includes the temporary API tunnel and matching build ID. The API exists only while that Actions job is active; everyone using that link shares the same session and timer. Starting another V2 demo while one is already running leaves the active session online; reuse its connected website link instead of starting another run.

The demo refuses to publish a connected link unless both the 20-word model and 40-class character model load, their prediction endpoints respond, and the Pages release manifest matches the API build. This is an integration check, not a sign-recognition accuracy guarantee. The current isolated-word model's held-out Top-1 accuracy is about 25.6%; real camera results can be lower or higher and need better labeled word clips plus a separate independent evaluation before claiming improved accuracy.

The automated smoke check verifies that the public API can decode a short video and return a model response. It does not measure sign-recognition accuracy. See `api/models/model_info.json` for the independent offline evaluation.
