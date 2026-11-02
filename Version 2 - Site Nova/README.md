# Signova V2 — Site Nova

Signova V2 is a separate, 20-word ASL video-recognition demo. The original Signova website and API remain in the repository root. V2 labels are **book**, **deaf**, **eat**, **drink**, **family**, **go**, **happy**, **help**, **home**, **like**, **mother**, **need**, **no**, **not**, **please**, **school**, **water**, **want**, **yes**, and **you**.

The model uses RGB video frames, a frozen ImageNet MobileNetV2 encoder, and a temporal Conv1D classifier. It returns three candidate words so the user can review the result. This is an experimental isolated-sign classifier, not continuous sign-language translation, and it does not promise perfect accuracy.

The translator automatically sends a photo to the letters-and-numbers model and a video to the word model. Both use the same FastAPI service and API address. The character model is optional: it is loaded only when its model, `character_class_names.json`, and `character_model_info.json` form a valid matching bundle. If that optional model is missing or invalid, word predictions remain available and the API reports the character model as unavailable. A character can be submitted from a JPG/PNG upload or captured with the camera's **Take photo** button. ASL letter O and numeral 0 share the same static handshape, so language context is needed to distinguish those meanings reliably.

## Dataset and attribution

The data manifest selects source clips from **MS-ASL** and adds locally available WLASL training clips when supplied. MS-ASL provides separate train, validation, and test partitions. The preparation script removes source-video overlap across those partitions. It downloads each selected source locally and crops the annotated sign segment and signer region.

Short signer-cropped clips are included in `data/clips/` with the dataset-specific C-UDA copies in `data/licenses/`. Untrimmed originals and temporary downloads stay in ignored local folders. `data/manifest.jsonl` records the selected source IDs, URLs, labels, and timings; `prepare_data.py` can re-fetch clips from those sources. Follow the dataset terms and attribution when using or redistributing the data. Read the [MS-ASL download page](https://www.microsoft.com/en-us/download/details.aspx?id=100121), the [WLASL dataset page](https://github.com/dxli94/WLASL), and Microsoft's [C-UDA terms](https://github.com/microsoft/Computational-Use-of-Data-Agreement).

## Prepare and train

The checkout includes 736 usable clips: 533 train, 121 validation, and 82 test. Another 416 of the 1,152 manifest candidates are unavailable locally. The training script requires at least 18 clips per word, but some test classes have only one or two examples. The current held-out report is 25.6% top-1 and 48.8% top-3 accuracy across 82 clips, so the model remains experimental and is not dependable yet.

The selected, signer-cropped train/validation/test clips are included in `data/clips/`, so the delivered model can be retrained without downloading the full source archives. From this directory, install the Python dependencies and train:

```powershell
python -m pip install -r requirements-training.txt
python train_model.py
```

Training writes `api/models/signova_v2.keras`, `api/models/class_names.json`, `api/models/model_info.json`, and the website's `web/model-report.json`. The report contains the actual sample counts, held-out top-1/top-3 accuracy, per-class accuracy, and confusion matrix. The held-out test split is not used for early stopping.

### Train the letters-and-numbers model

The supplied image archives can be used to train a separate 40-label ASL character model (A–Z, 0–9, space, delete, nothing, and unknown). The script reads the two ZIP files directly and extracts a balanced sample of up to 2,000 unique images per label into train, validation, and test splits under the ignored `.downloads/character-training/` directory; it does not add the image archives or extracted images to Git. Expect several gigabytes of temporary disk use. Keep the word model files unchanged.

The supplied archives did not include a license/readme file. Check the original dataset pages and their redistribution terms before publishing derived data or model weights publicly.

```powershell
python train_character_model.py --alphabet-zip "G:\archive (1).zip" --digits-zip "G:\archive (2).zip"
```

This writes `api/models/signova_characters.keras`, `api/models/character_class_names.json`, and `api/models/character_model_info.json`. Its preliminary evaluation holds out random images because the supplied archives do not identify signer/session IDs. It must not be presented as independent camera accuracy. In particular, J and Z include movement, so add real labeled video examples and evaluate on separate recording sessions before relying on those predictions.

To recreate the sample selection from the source metadata or add local WLASL training clips, download the official MS-ASL metadata archive and extract WLASL v0.3, then run:

```powershell
python prepare_data.py --metadata-zip "C:\path\to\MS-ASL.zip" --wlasl-root "C:\path\to\WLASL" --workers 4
```

## Run locally

Install `api/requirements.txt`, then start the API from this directory:

```powershell
python -m uvicorn app:app --app-dir api --host 127.0.0.1 --port 8000
```

In a second terminal, serve the website with `python -m http.server 8080 --directory web`, then open `http://127.0.0.1:8080/?api=http://127.0.0.1:8000`. The V2 API offers `/health` and `/api/predict`; the same upload route accepts multipart `mode=words` or `mode=characters` and selects the corresponding model inside one API service.

## GitHub Pages and temporary API

The Pages workflow publishes V2 at `/v2/`; the repository root `/` is the older website. Start **Start temporary Signova V2 team demo** from GitHub Actions, then expand **Start the temporary public link and verify it** in that run's `team-demo` job and open the `Connected website:` URL from its log. That URL includes the API tunnel and the source commit's cache-busting build ID, so it opens the current V2 page. The API exists only while that Actions job is active; everyone using that link shares the same session and timer. Starting another V2 demo while one is already running leaves the active session online; reuse its connected website link instead of starting another run.

The automated smoke check verifies that the public API can decode a short video and return a model response. It does not measure sign-recognition accuracy. See `api/models/model_info.json` for the independent offline evaluation.
