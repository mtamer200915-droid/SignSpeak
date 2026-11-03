# Signova V2 character model

## Data preparation

The supplied alphabet and digit ZIP archives were sampled and cleaned locally. Raw ZIP files and prepared images remain outside Git and are not included in the public repository. Exact duplicate image files were removed within each label before the train/validation/test split. The split is seeded and stratified by label; up to 400 unique images per label were sampled.

- Labels: 40 total (A–Z, 0–9, plus DELETE, NOTHING, SPACE, UNKNOWN).
- Training images: 12,618.
- Validation images: 1,575.
- Held-out test images: 1,575 (about 39–40 per label).
- Split: 80% train, 10% validation, 10% test per label.
- Duplicate audit: no exact cross-label duplicates and no same-class file hashes appear across splits.

## Model and evaluation

The model uses ImageNet-pretrained MobileNetV2 as a frozen image feature extractor, then trains a regularized 256-unit classifier with dropout, mild image augmentation, early stopping, and learning-rate reduction. The complete image model is packaged as `api/models/signova_characters.keras`; the FastAPI service loads it alongside the existing video word model.

Held-out image Top-1 accuracy: **88.3%**. Balanced Top-1 accuracy: **88.3%**. Top-3 accuracy: **97.1%** across 1575 test images.

| Label | Train | Validation | Test | Test accuracy |
|---|---:|---:|---:|---:|
| 0 | 320 | 40 | 40 | 97.5% |
| 1 | 320 | 40 | 40 | 87.5% |
| 2 | 320 | 40 | 40 | 67.5% |
| 3 | 317 | 40 | 40 | 95.0% |
| 4 | 319 | 40 | 40 | 87.5% |
| 5 | 320 | 40 | 40 | 95.0% |
| 6 | 317 | 40 | 40 | 87.5% |
| 7 | 320 | 40 | 40 | 82.5% |
| 8 | 320 | 40 | 40 | 80.0% |
| 9 | 320 | 40 | 40 | 95.0% |
| A | 315 | 40 | 40 | 87.5% |
| B | 315 | 40 | 40 | 95.0% |
| C | 315 | 39 | 39 | 92.3% |
| D | 315 | 39 | 39 | 92.3% |
| E | 315 | 39 | 39 | 74.4% |
| F | 315 | 39 | 39 | 79.5% |
| G | 314 | 39 | 39 | 92.3% |
| H | 316 | 40 | 40 | 90.0% |
| I | 315 | 39 | 39 | 79.5% |
| J | 313 | 39 | 39 | 84.6% |
| K | 316 | 39 | 39 | 97.4% |
| L | 315 | 39 | 39 | 82.1% |
| M | 317 | 40 | 40 | 82.5% |
| N | 315 | 39 | 39 | 84.6% |
| O | 316 | 39 | 39 | 92.3% |
| P | 312 | 39 | 39 | 84.6% |
| Q | 310 | 39 | 39 | 100.0% |
| R | 310 | 39 | 39 | 89.7% |
| S | 316 | 39 | 39 | 84.6% |
| T | 315 | 39 | 39 | 84.6% |
| U | 313 | 39 | 39 | 87.2% |
| V | 308 | 38 | 38 | 84.2% |
| W | 313 | 39 | 39 | 82.1% |
| X | 313 | 39 | 39 | 82.1% |
| Y | 314 | 39 | 39 | 82.1% |
| Z | 313 | 39 | 39 | 92.3% |
| DELETE | 308 | 39 | 39 | 100.0% |
| NOTHING | 320 | 40 | 40 | 100.0% |
| SPACE | 313 | 39 | 39 | 100.0% |
| UNKNOWN | 320 | 40 | 40 | 97.5% |

The weakest relevant labels in this image holdout were **2 (67.5%)**, **E (74.4%)**, and **F/I (79.5%)**. Results vary by class and should not be represented as 100% accuracy.

## Limits and API behavior

This is a random image holdout, not a signer-independent camera test; the archives do not provide signer/session IDs. Real camera images may score lower because of background, framing, lighting, hand size, and signer differences. Static images do not encode the movement needed to fully recognize ASL **J** and **Z**. The letter **O** and numeral **0** share a static handshape, so selecting between them needs sequence or user context.

The V2 web page sends photos to character mode and videos to word mode automatically. Both models are served by the same FastAPI application and `/api/predict` endpoint. The existing word model was not retrained in this change. Its held-out video score remains separate from this image-model score.

## Reproducibility

Run `train_character_model.py` with the two supplied ZIP archive paths. The default training cap is 400 sampled images per label to keep CPU training practical; the split seed is 42. The detailed class metrics and confusion matrix are saved in `api/models/character_model_info.json`.
