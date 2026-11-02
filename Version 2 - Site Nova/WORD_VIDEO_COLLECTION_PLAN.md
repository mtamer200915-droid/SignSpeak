# Signova V2 word video collection plan

Current counts and scores come from `api/models/model_info.json`. The existing test set has only 1–8 clips for each word, so a 0% class score is a warning signal, not a precise estimate of that word's true accuracy.

## Record first

For these words, record **15 new clips each**. For `drink`, `happy`, `home`, `like`, `mother`, `need`, `not`, `yes`, and `you`, the current held-out score is 0%; `drink` has only one held-out test clip. `help`, `no`, and `please` are at 20–25%, and `go` has only 18 current training clips.

| Word | Current train clips | Current test clips | Current held-out accuracy | New clips to record |
|---|---:|---:|---:|---:|
| drink | 29 | 1 | 0.0% | 15–20 |
| happy | 21 | 8 | 0.0% | 15 |
| home | 21 | 3 | 0.0% | 15 |
| like | 28 | 5 | 0.0% | 15 |
| mother | 31 | 4 | 0.0% | 15 |
| need | 19 | 2 | 0.0% | 15 |
| not | 19 | 4 | 0.0% | 15 |
| yes | 32 | 3 | 0.0% | 15 |
| you | 26 | 3 | 0.0% | 15 |
| help | 29 | 4 | 25.0% | 15 |
| no | 30 | 4 | 25.0% | 15 |
| please | 23 | 5 | 20.0% | 15 |
| go | 18 | 5 | 40.0% | 15 |

## Next group

Record **8–10 new clips each** for `book` (40.0%, 5 test clips), `eat` (33.3%, 3), `want` (40.0%, 5), `water` (50.0%, 2), and `deaf` (50.0%, 6). The very small test counts make these scores uncertain too.

`family` (75.0%, 4 test clips) and `school` (66.7%, 6 test clips) can wait for the first new training pass. Keep them in the next evaluation because their test counts remain small.

## Recording format

- One sign per clip, about 2–5 seconds, with the whole signer visible and hands unobstructed.
- Keep each word's label in the filename or folder, for example `drink/clip_001.mp4` and `no/clip_001.mp4`. If sending loose files, name them `drink_001.mp4`, `drink_002.mp4`, and so on.
- Vary lighting, distance, and background slightly across clips. Keep the sign itself correct and clear.
- Send the clips grouped or named by word. Do not add clips to the current test set; preserve the old test data until we make a separate evaluation split.
- A held-out split from recordings by the same person measures that person's examples, not accuracy for all users. Keep a separate later recording session for a more honest camera check.
