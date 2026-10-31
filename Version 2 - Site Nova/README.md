# Signova V2 — Site Nova

Signova V2 is a separate, 20-word ASL video-recognition demo. The original Signova website and API remain in the repository root. V2 labels are **book**, **deaf**, **eat**, **drink**, **family**, **go**, **happy**, **help**, **home**, **like**, **mother**, **need**, **no**, **not**, **please**, **school**, **water**, **want**, **yes**, and **you**.

The model uses RGB video frames, a frozen ImageNet MobileNetV2 encoder, and a small bidirectional GRU classifier. It returns three candidate words so the user can review the result. This is an experimental isolated-sign classifier, not continuous sign-language translation, and it does not promise perfect accuracy.

## Dataset and attribution

The data manifest selects source clips from **MS-ASL** and adds locally available WLASL training clips when supplied. MS-ASL provides separate train, validation, and test partitions. The preparation script removes source-video overlap across those partitions. It downloads each selected source locally and crops the annotated sign segment and signer region.

Short signer-cropped clips are included in `data/clips/` with the dataset-specific C-UDA copies in `data/licenses/`. Untrimmed originals and temporary downloads stay in ignored local folders. `data/manifest.jsonl` records the selected source IDs, URLs, labels, and timings; `prepare_data.py` can re-fetch clips from those sources. Follow the dataset terms and attribution when using or redistributing the data. Read the [MS-ASL download page](https://www.microsoft.com/en-us/download/details.aspx?id=100121), the [WLASL dataset page](https://github.com/dxli94/WLASL), and Microsoft's [C-UDA terms](https://github.com/microsoft/Computational-Use-of-Data-Agreement).

## Prepare and train

The selected, signer-cropped train/validation/test clips are included in `data/clips/`, so the delivered model can be retrained without downloading the full source archives. From this directory, install the Python dependencies and train:

```powershell
python -m pip install -r requirements-training.txt
python train_model.py
```

Training writes `api/models/signova_v2.keras`, `api/models/class_names.json`, `api/models/model_info.json`, and the website's `web/model-report.json`. The report contains the actual sample counts, held-out top-1/top-3 accuracy, per-class accuracy, and confusion matrix. The held-out test split is not used for early stopping.

To recreate the sample selection from the source metadata or add local WLASL training clips, download the official MS-ASL metadata archive and extract WLASL v0.3, then run:

```powershell
python prepare_data.py --metadata-zip "C:\path\to\MS-ASL.zip" --wlasl-root "C:\path\to\WLASL" --workers 4
```

## Run locally

Install `api/requirements.txt`, then start the API from this directory:

```powershell
python -m uvicorn app:app --app-dir api --host 127.0.0.1 --port 8000
```

In a second terminal, serve the website with `python -m http.server 8080 --directory web`, then open `http://127.0.0.1:8080/?api=http://127.0.0.1:8000`. The V2 API offers `/health` and `/api/predict`.

## GitHub Pages and temporary API

The Pages workflow publishes V2 at `/v2/`. Start **Start temporary Signova V2 team demo** from GitHub Actions, then use the connected website link in its run summary. The API exists only while that Actions job is active; everyone using that link shares the same session and timer.

The automated smoke check verifies that the public API can decode a short video and return a model response. It does not measure sign-recognition accuracy. See `api/models/model_info.json` for the independent offline evaluation.
