# Signova V2 — Site Nova

Signova V2 is a separate, 20-word ASL video-recognition demo. The original Signova website and API remain in the repository root. V2 labels are **book**, **deaf**, **eat**, **drink**, **family**, **go**, **happy**, **help**, **home**, **like**, **mother**, **need**, **no**, **not**, **please**, **school**, **water**, **want**, **yes**, and **you**.

The model uses RGB video frames, a frozen ImageNet MobileNetV2 encoder, and a temporal Conv1D classifier. It returns three candidate words so the user can review the result. This is an experimental isolated-sign classifier, not continuous sign-language translation, and it does not promise perfect accuracy.

Select **Words**, **Letters**, or **Numbers** before capture. Words use a short video; letters and numbers use one photo. Separate specialized letter and digit models are served by the same FastAPI service; the previous combined character model is retained as a fallback. The browser attempts to crop around the detected hand before sending a camera photo. JPG/PNG upload is also supported. ASL letter O and numeral 0 share a static handshape, so the chosen mode supplies the category. The model cannot infer the full movements of J and Z from a single still photo.

The letter candidate was trained on 600 images per letter and scored 95.8% on 1,017 held-out images from the same source, versus 87.1% for the previous model restricted to letters. These are random image splits, not independent signer or mobile-camera tests. `train_letter_model.py` reproduces the local experiment with an alphabet ZIP and the original split cache; save its output separately and evaluate before replacing the service model.

## Dataset and attribution

The data manifest selects source clips from **MS-ASL** and adds locally available WLASL training clips when supplied. MS-ASL provides separate train, validation, and test partitions. The preparation script removes source-video overlap across those partitions. It downloads each selected source locally and crops the annotated sign segment and signer region.

MS-ASL bounding boxes are stored in `[y0, x0, y1, x1]` order. The preparation script now interprets that order correctly. Existing clips and the published word model were created before this correction; they must be re-prepared and independently evaluated before assuming any improvement in word accuracy.

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

### Experimental dedicated digit model

The same API can load `api/models/signova_digits.keras` for Numbers while keeping the existing image model for Letters and the video model for Words. If the optional digit bundle is absent or invalid, Numbers fall back to the previous character model. `/health` reports `available_modes.numbers.dedicated_model_loaded` separately.

The candidate used 14,146 deduplicated number images. The 400 validation and 400 test images from the earlier prepared split were excluded by exact file hash. On those same-source test images the candidate scored 94.75% top-1, versus 87.5% for the old character model restricted to digits. These are random images from the same source and use PIL resizing; this is not an independent signer or phone-camera result, and near-duplicate images can remain across splits.

To reproduce the experiment locally, retain the earlier prepared `val/<digit>` and `test/<digit>` images and run the following with the original archive. The output is a separate candidate; it does not overwrite deployed weights:

```powershell
python train_digit_model.py --digits-zip "G:\archive (2).zip" --heldout-cache ".downloads\character-training-20261103-011526" --output ".downloads\digit-candidate-local"
```

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

The Pages workflow publishes V2 at `/v2/`; the repository root `/` is the older website. Start **Start temporary Signova V2 team demo** from GitHub Actions and choose the requested duration (15, 30, 60, 180, or 315 minutes; default 60). After the API is verified, the workflow updates the connection behind the QR website address `https://mtamer200915-droid.github.io/SignSpeak/v2/?build=df9028e` and waits for GitHub Pages to publish it. Keep this exact QR URL across releases; its API connection is loaded from the published configuration. The temporary API itself still exists only while its Actions job is active. Everyone shares the same API session and timer. Starting another V2 demo while one is already running leaves the active session online; use the same QR URL after the next session has published its connection.

The demo refuses to publish a connected link unless both the 20-word model and 40-class character model load, their prediction endpoints respond, and the Pages release manifest matches the API build. This is an integration check, not a sign-recognition accuracy guarantee. The current isolated-word model's held-out Top-1 accuracy is about 25.6%; real camera results can be lower or higher and need better labeled word clips plus a separate independent evaluation before claiming improved accuracy.

The automated smoke check verifies that the public API can decode a short video and return a model response. It does not measure sign-recognition accuracy. See `api/models/model_info.json` for the independent offline evaluation.
