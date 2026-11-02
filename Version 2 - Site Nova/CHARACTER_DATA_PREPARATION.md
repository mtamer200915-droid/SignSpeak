# Character image data preparation

The supplied alphabet and digit archives have been staged into a balanced 40-label image dataset. Originals remain unchanged in their ZIP archives. The working split is local under the ignored .downloads/character-training/ folder and is not committed to Git.

- Labels: 40 (A–Z, 0–9, DELETE, NOTHING, SPACE, UNKNOWN)
- Training images: 55073
- Validation images: 6883
- Test images: 6883
- Per-label sampling cap: 2000 unique images before the split
- Duplicate handling: exact duplicate file contents were removed within each label before splitting.
- Split method: seeded, stratified random image split (80% train, 10% validation, 10% test).

| Label | Train | Validation | Test |
|---|---:|---:|---:|
| 0 | 1199 | 150 | 150 |
| 1 | 1200 | 150 | 150 |
| 2 | 1197 | 150 | 150 |
| 3 | 1176 | 147 | 147 |
| 4 | 1193 | 149 | 149 |
| 5 | 1199 | 150 | 150 |
| 6 | 1192 | 149 | 149 |
| 7 | 1200 | 150 | 150 |
| 8 | 1200 | 150 | 150 |
| 9 | 1200 | 150 | 150 |
| A | 1464 | 183 | 183 |
| B | 1452 | 182 | 182 |
| C | 1457 | 182 | 182 |
| D | 1421 | 178 | 178 |
| E | 1435 | 179 | 179 |
| F | 1452 | 182 | 182 |
| G | 1442 | 180 | 180 |
| H | 1441 | 180 | 180 |
| I | 1447 | 181 | 181 |
| J | 1446 | 181 | 181 |
| K | 1438 | 180 | 180 |
| L | 1458 | 182 | 182 |
| M | 1427 | 178 | 178 |
| N | 1452 | 182 | 182 |
| O | 1459 | 182 | 182 |
| P | 1429 | 178 | 178 |
| Q | 1435 | 180 | 180 |
| R | 1444 | 180 | 180 |
| S | 1461 | 183 | 183 |
| T | 1458 | 182 | 182 |
| U | 1442 | 180 | 180 |
| V | 1412 | 176 | 176 |
| W | 1425 | 178 | 178 |
| X | 1462 | 183 | 183 |
| Y | 1450 | 181 | 181 |
| Z | 1412 | 176 | 176 |
| DELETE | 1395 | 174 | 174 |
| NOTHING | 1600 | 200 | 200 |
| SPACE | 1401 | 175 | 175 |
| UNKNOWN | 1200 | 150 | 150 |

## Evaluation status

No character model has been trained yet, so accuracy for the letters and numbers is **not available**. The prepared test split is image-based and is not a signer-independent or camera-video evaluation. The supplied archives have no signer/session IDs, and static images do not contain the movement needed to fully model J or Z. The ASL letter O and numeral 0 also share the same static handshape, so a single image cannot reliably determine which meaning the signer intends without context.

Training has not run in the current Windows workspace. The local virtual environment contains TensorFlow packages, but its Python executable points to a Windows Store runtime that Windows denies access to, so the training process cannot start. Do not treat the current word model's 25.61% held-out video score as the character image model's accuracy.
