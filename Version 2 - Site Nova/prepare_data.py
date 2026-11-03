"""Select and fetch a reproducible 20-word MS-ASL/WLASL training subset.

The source videos remain local and are not committed to Git. The committed
manifest contains attribution, labels, and source URLs so each clip can be
re-fetched under the source dataset's C-UDA terms.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PROJECT = Path(__file__).resolve().parent
DATA = PROJECT / "data"
MANIFEST = DATA / "manifest.jsonl"
REPORT = DATA / "preparation_report.json"
WORDS = (
    "book", "deaf", "eat", "drink", "family", "go", "happy", "help", "home", "like",
    "mother", "need", "no", "not", "please", "school", "water", "want", "yes", "you",
)
TRAIN_PER_WORD = 18
EVAL_TARGET_PER_WORD = 5
FPS = 10
CLIP_SIZE = 224
OFFICIAL_MSASL = "https://www.microsoft.com/en-us/download/details.aspx?id=100121"
OFFICIAL_WLASL = "https://github.com/dxli94/WLASL"
_RAW_LOCKS: dict[str, threading.Lock] = {}
_RAW_LOCKS_GUARD = threading.Lock()


def raw_lock(video: str) -> threading.Lock:
    with _RAW_LOCKS_GUARD:
        return _RAW_LOCKS.setdefault(video, threading.Lock())


def video_id(url: str) -> str:
    parsed = urlparse(url)
    if parsed.hostname and "youtu.be" in parsed.hostname:
        return parsed.path.strip("/").split("/")[0]
    if parsed.hostname and "youtube.com" in parsed.hostname:
        return parse_qs(parsed.query).get("v", [""])[0]
    return ""


def safe_video_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", value)


def clip_times(row: dict) -> tuple[float, float | None]:
    fps = float(row.get("fps") or 0)
    start = row.get("start_time")
    end = row.get("end_time")
    if not isinstance(start, (int, float)) and fps > 0 and isinstance(row.get("start"), (int, float)):
        start = float(row["start"]) / fps
    if not isinstance(end, (int, float)) and fps > 0 and isinstance(row.get("end"), (int, float)):
        end_frame = float(row["end"])
        if end_frame > float(row.get("start") or 0):
            end = end_frame / fps
    if not isinstance(start, (int, float)) or start < 0:
        start = 0.0
    if not isinstance(end, (int, float)) or end <= start:
        end = None
    if end is not None and end - start > 20:
        start, end = 0.0, None
    return float(start), (float(end) if end is not None else None)


def load_msasl(msasl_zip: Path) -> dict[str, list[dict]]:
    with zipfile.ZipFile(msasl_zip) as archive:
        result = {}
        for split in ("train", "val", "test"):
            name = f"MS-ASL/MSASL_{split}.json"
            result[split] = json.loads(archive.read(name))
        return result


def best_unique_rows(rows: list[dict], word: str) -> list[dict]:
    """One labelled segment per source video, preferring reviewed annotations."""
    candidates = [row for row in rows
                  if row.get("clean_text", "").strip().lower() == word
                  and video_id(str(row.get("url", "")))]
    candidates.sort(
        key=lambda row: (
            0 if row.get("review") == 1 else 1,
            abs(((clip_times(row)[1] or 2.5) - clip_times(row)[0]) - 2.5),
            video_id(row["url"]),
        )
    )
    seen: set[str] = set()
    selected = []
    for row in candidates:
        vid = video_id(row["url"])
        if vid in seen:
            continue
        seen.add(vid)
        selected.append(row)
    return selected


def write_manifest(msasl_zip: Path, wlasl_root: Path | None) -> list[dict]:
    splits = load_msasl(msasl_zip)
    records: list[dict] = []
    global_split_ids: dict[str, set[str]] = {"train": set(), "val": set(), "test": set()}

    for word in WORDS:
        split_ids: dict[str, set[str]] = {"train": set(), "val": set(), "test": set()}
        for split in ("train", "val", "test"):
            candidates = best_unique_rows(splits[split], word)
            if split == "train":
                candidates = candidates[: max(TRAIN_PER_WORD + 15, TRAIN_PER_WORD)]
            for candidate in candidates:
                vid = video_id(candidate["url"])
                # Guard against source-video leakage between official splits.
                if any(vid in global_split_ids[other] for other in global_split_ids if other != split):
                    continue
                split_ids[split].add(vid)
                global_split_ids[split].add(vid)
                box = candidate.get("box") or [0, 0, 1, 1]
                records.append({
                    "dataset": "MS-ASL",
                    "word": word,
                    "split": split,
                    "video_id": vid,
                    "url": candidate["url"],
                    "start_time": clip_times(candidate)[0],
                    "end_time": clip_times(candidate)[1],
                    "box": [float(value) for value in box],
                    "width": float(candidate.get("width") or 0),
                    "height": float(candidate.get("height") or 0),
                    "signer_id": candidate.get("signer_id"),
                    "reviewed": candidate.get("review") == 1,
                })

        if len(split_ids["val"]) < 3 or len(split_ids["test"]) < 1:
            raise RuntimeError(f"MS-ASL has too few distinct validation/test videos for {word}.")

    # Reuse locally available WLASL training clips from the user's Data folder.
    # They increase visual variety without crossing into the held-out MS-ASL split.
    if wlasl_root:
        wlasl_json = wlasl_root / "WLASL_v0.3.json"
        video_dir = wlasl_root / "videos"
        if wlasl_json.is_file() and video_dir.is_dir():
            classes = json.loads(wlasl_json.read_text(encoding="utf-8"))
            for cls in classes:
                word = cls.get("gloss", "").strip().lower()
                if word not in WORDS:
                    continue
                for item in cls.get("instances", []):
                    vid = str(item.get("video_id", ""))
                    if item.get("split") not in {"train", "val", "test"} or not vid:
                        continue
                    local_video = video_dir / f"{vid}.mp4"
                    url = str(item.get("url", ""))
                    parsed_url = urlparse(url)
                    source_video_id = video_id(url)
                    if source_video_id and any(
                        source_video_id in global_split_ids[other]
                        for other in global_split_ids if other != item["split"]
                    ):
                        continue
                    supported_remote = bool(video_id(url)) or parsed_url.path.lower().endswith((".mp4", ".webm", ".mov"))
                    if not local_video.is_file() and (item["split"] not in {"train", "val"} or not supported_remote):
                        continue
                    fps = float(item.get("fps") or 0)
                    frame_start = float(item.get("frame_start") or 0)
                    frame_end = float(item.get("frame_end") or -1)
                    remote_youtube = not local_video.is_file() and bool(video_id(url))
                    if source_video_id:
                        global_split_ids[item["split"]].add(source_video_id)
                    records.append({
                        "dataset": "WLASL",
                        "word": word,
                        "split": item["split"],
                        "video_id": vid,
                        "url": url,
                        "local_video": f"videos/{vid}.mp4",
                        "start_time": frame_start / fps if remote_youtube and fps > 0 else 0.0,
                        "end_time": frame_end / fps if remote_youtube and fps > 0 and frame_end > frame_start else None,
                        # WLASL boxes are pixel coordinates; use the same center square crop as the live API.
                        "box": [0.0, 0.0, 1.0, 1.0],
                        "width": 0,
                        "height": 0,
                        "signer_id": item.get("signer_id"),
                        "reviewed": False,
                    })

    DATA.mkdir(parents=True, exist_ok=True)
    records.sort(key=lambda row: (row["word"], row["split"], row["dataset"], row["video_id"]))
    MANIFEST.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in records),
        encoding="utf-8",
    )
    return records


def read_manifest(path: Path = MANIFEST) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def ffmpeg_binary() -> Path:
    # imageio-ffmpeg ships an FFmpeg build with ffmpeg.exe, no system install required.
    try:
        import imageio_ffmpeg
        binary = Path(imageio_ffmpeg.get_ffmpeg_exe())
        if binary.is_file():
            return binary
    except Exception:
        pass
    located = shutil.which("ffmpeg")
    if located:
        return Path(located)
    raise RuntimeError("FFmpeg was not found. Install imageio-ffmpeg or add ffmpeg to PATH.")


def yt_dlp_command(url: str, output: Path, ffmpeg: Path) -> tuple[bool, str]:
    output.parent.mkdir(parents=True, exist_ok=True)
    py = sys.executable
    command = [
        py, "-m", "yt_dlp", "--no-warnings", "--no-progress", "--no-playlist",
        "--retries", "2", "--socket-timeout", "30", "--ffmpeg-location", str(ffmpeg),
        "-f", "bestvideo[height<=480][ext=mp4]/bestvideo[height<=480]/best[height<=480]",
        "-o", str(output.with_suffix(".%(ext)s")), url,
    ]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=240)
    candidates = list(output.parent.glob(output.stem + ".*"))
    downloaded = next((path for path in candidates if path.suffix.lower() in {".mp4", ".webm", ".mkv"}), None)
    if completed.returncode == 0 and downloaded and downloaded.stat().st_size > 20_000:
        # Normalize filename extension because the selected yt-dlp format may vary.
        final_path = output.with_suffix(".mp4")
        if downloaded != final_path:
            normalize = subprocess.run(
                [str(ffmpeg), "-hide_banner", "-loglevel", "error", "-i", str(downloaded),
                 "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "27", "-y", str(final_path)],
                capture_output=True, text=True, timeout=180,
            )
            if normalize.returncode != 0:
                return False, normalize.stderr[-500:]
            downloaded.unlink(missing_ok=True)
        return True, ""
    detail = (completed.stderr or completed.stdout or f"download exited {completed.returncode}")[-800:]
    return False, detail


def crop_expression(box: list[float], dataset: str = "") -> str:
    # MS-ASL supplies [y0, x0, y1, x1]; other sources use x/y order.
    if dataset == "MS-ASL":
        y1, x1, y2, x2 = box
    else:
        x1, y1, x2, y2 = box
    center_x = (x1 + x2) / 2
    center_y = (y1 + y2) / 2
    # Square crop avoids letterboxing while keeping hands and face visible.
    side = "min(iw,ih)"
    crop = (
        f"crop='{side}':'{side}':"
        f"'max(0,min(iw-ow,iw*{center_x:.6f}-ow/2))':"
        f"'max(0,min(ih-oh,ih*{center_y:.6f}-oh/2))'"
    )
    return f"{crop},scale={CLIP_SIZE}:{CLIP_SIZE},fps={FPS}"


def make_clip(record: dict, source: Path, destination: Path, ffmpeg: Path) -> tuple[bool, str]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = [str(ffmpeg), "-hide_banner", "-loglevel", "error"]
    start_time = float(record.get("start_time") or 0.0)
    end_time = record.get("end_time")
    if record["dataset"] == "MS-ASL" or start_time > 0 or end_time is not None:
        start = max(0.0, start_time - 0.12)
        command += ["-ss", f"{start:.3f}", "-i", str(source)]
        if end_time is not None:
            duration = max(0.5, float(end_time) - start_time + 0.24)
            command += ["-t", f"{duration:.3f}"]
    else:
        command += ["-i", str(source)]
    command += [
        "-an", "-vf", crop_expression(record["box"], record["dataset"]), "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", str(destination),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=120)
    if completed.returncode == 0 and destination.is_file() and destination.stat().st_size > 2_000:
        return True, ""
    destination.unlink(missing_ok=True)
    return False, (completed.stderr or f"ffmpeg exited {completed.returncode}")[-500:]


def fetch_and_clip(record: dict, raw_dir: Path, clip_dir: Path, ffmpeg: Path,
                   wlasl_root: Path | None) -> tuple[dict, bool, str]:
    vid = safe_video_id(record["video_id"])
    output = clip_dir / record["split"] / record["word"] / f"{record['dataset'].lower()}_{vid}.mp4"
    if output.is_file() and output.stat().st_size > 2_000:
        return record, True, "cached"
    if record["dataset"] == "WLASL":
        # Prefer the user's local WLASL archive; fetch an official source URL only if needed.
        source = (wlasl_root / record["local_video"]) if wlasl_root else Path(record["local_video"])
        if not source.is_file():
            source = raw_dir / "originals" / f"wlasl_{vid}.mp4"
            with raw_lock(f"wlasl_{vid}"):
                if not source.is_file() or source.stat().st_size < 20_000:
                    url = str(record.get("url", ""))
                    parsed = urlparse(url)
                    if not (video_id(url) or parsed.path.lower().endswith((".mp4", ".webm", ".mov"))):
                        return record, False, f"no downloadable WLASL source for {vid}"
                    ok, detail = yt_dlp_command(url, source, ffmpeg)
                    if not ok:
                        return record, False, detail
    else:
        raw = raw_dir / "originals" / f"{vid}.mp4"
        source = raw
        with raw_lock(vid):
            if not raw.is_file() or raw.stat().st_size < 20_000:
                raw.parent.mkdir(parents=True, exist_ok=True)
                ok, detail = yt_dlp_command(record["url"], raw, ffmpeg)
                if not ok:
                    return record, False, detail
            source = raw
    ok, detail = make_clip(record, source, output, ffmpeg)
    return record, ok, detail


def run_download(records: list[dict], raw_dir: Path, clip_dir: Path, workers: int,
                 wlasl_root: Path | None) -> dict:
    ffmpeg = ffmpeg_binary()
    pending = []
    successful_train = {word: 0 for word in WORDS}
    for row in records:
        clip = clip_dir / row["split"] / row["word"] / f"{row['dataset'].lower()}_{safe_video_id(row['video_id'])}.mp4"
        if clip.is_file() and clip.stat().st_size > 2_000:
            if row["split"] == "train" and row["dataset"] == "MS-ASL":
                successful_train[row["word"]] += 1
            continue
        if row["dataset"] == "MS-ASL" and row["split"] == "train" and successful_train[row["word"]] >= TRAIN_PER_WORD:
            continue
        pending.append(row)

    failures = []
    # Download MS-ASL training records by class in small batches.
    for word in WORDS:
        train_rows = [r for r in pending if r["dataset"] == "MS-ASL" and r["split"] == "train" and r["word"] == word]
        if successful_train[word] < TRAIN_PER_WORD:
            for offset in range(0, len(train_rows), max(1, workers)):
                batch = train_rows[offset:offset + max(1, workers)]
                with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
                    futures = [pool.submit(fetch_and_clip, r, raw_dir, clip_dir, ffmpeg, wlasl_root) for r in batch]
                    for future in as_completed(futures):
                        row, ok, detail = future.result()
                        if ok:
                            successful_train[word] += 1
                            print(f"[{word} train] {successful_train[word]}/{TRAIN_PER_WORD} {row['video_id']}", flush=True)
                        else:
                            failures.append({"word": word, "split": "train", "video_id": row["video_id"], "error": detail})
                if successful_train[word] >= TRAIN_PER_WORD:
                    break

    def clip_path(row: dict) -> Path:
        return clip_dir / row["split"] / row["word"] / f"{row['dataset'].lower()}_{safe_video_id(row['video_id'])}.mp4"

    def ready_count(split: str, word: str) -> int:
        return sum(1 for row in records if row["split"] == split and row["word"] == word
                   and clip_path(row).is_file() and clip_path(row).stat().st_size > 2_000)

    # Prepare locally available WLASL clips first.
    rest = [
        row for row in pending if row["dataset"] == "WLASL"
        and wlasl_root and (wlasl_root / row["local_video"]).is_file()
    ]
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = [pool.submit(fetch_and_clip, row, raw_dir, clip_dir, ffmpeg, wlasl_root) for row in rest]
        for future in as_completed(futures):
            row, ok, detail = future.result()
            if ok:
                print(f"[{row['word']} {row['split']}] ready {row['video_id']}", flush=True)
            else:
                failures.append({"word": row["word"], "split": row["split"], "video_id": row["video_id"], "error": detail})

    # Fetch missing official WLASL training sources only when MS-ASL and local
    # WLASL clips together still fall short of the 18-video class minimum.
    for word in WORDS:
        if ready_count("train", word) >= TRAIN_PER_WORD:
            continue
        candidates = [
            row for row in pending
            if row["dataset"] == "WLASL" and row["split"] == "train" and row["word"] == word
            and not (wlasl_root and (wlasl_root / row["local_video"]).is_file())
        ]
        for offset in range(0, len(candidates), max(1, workers)):
            batch = candidates[offset:offset + max(1, workers)]
            with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
                futures = [pool.submit(fetch_and_clip, row, raw_dir, clip_dir, ffmpeg, wlasl_root) for row in batch]
                for future in as_completed(futures):
                    row, ok, detail = future.result()
                    if ok:
                        print(f"[{word} train] WLASL ready {row['video_id']}", flush=True)
                    else:
                        failures.append({"word": word, "split": "train", "video_id": row["video_id"], "error": detail})
            if ready_count("train", word) >= TRAIN_PER_WORD:
                break

    # A few labels have sparse MS-ASL validation splits. Use an official WLASL
    # validation source only if local clips and MS-ASL do not reach three.
    for word in WORDS:
        if ready_count("val", word) >= 3:
            continue
        candidates = [
            row for row in pending
            if row["dataset"] == "WLASL" and row["split"] == "val" and row["word"] == word
            and not (wlasl_root and (wlasl_root / row["local_video"]).is_file())
        ]
        for offset in range(0, len(candidates), max(1, workers)):
            batch = candidates[offset:offset + max(1, workers)]
            with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
                futures = [pool.submit(fetch_and_clip, row, raw_dir, clip_dir, ffmpeg, wlasl_root) for row in batch]
                for future in as_completed(futures):
                    row, ok, detail = future.result()
                    if ok:
                        print(f"[{word} val] WLASL ready {row['video_id']}", flush=True)
                    else:
                        failures.append({"word": word, "split": "val", "video_id": row["video_id"], "error": detail})
            if ready_count("val", word) >= 3:
                break

    # Collect enough independent examples for useful evaluation, then stop.
    for split in ("val", "test"):
        for word in WORDS:
            if ready_count(split, word) >= EVAL_TARGET_PER_WORD:
                continue
            candidates = [
                row for row in pending
                if row["dataset"] == "MS-ASL" and row["split"] == split and row["word"] == word
            ]
            for offset in range(0, len(candidates), max(1, workers)):
                batch = candidates[offset:offset + max(1, workers)]
                with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
                    futures = [pool.submit(fetch_and_clip, row, raw_dir, clip_dir, ffmpeg, wlasl_root) for row in batch]
                    for future in as_completed(futures):
                        row, ok, detail = future.result()
                        if ok:
                            print(f"[{word} {split}] ready {row['video_id']}", flush=True)
                        else:
                            failures.append({"word": word, "split": split, "video_id": row["video_id"], "error": detail})
                if ready_count(split, word) >= EVAL_TARGET_PER_WORD:
                    break

    counts = {split: {word: 0 for word in WORDS} for split in ("train", "val", "test")}
    for row in records:
        clip = clip_dir / row["split"] / row["word"] / f"{row['dataset'].lower()}_{safe_video_id(row['video_id'])}.mp4"
        if clip.is_file() and clip.stat().st_size > 2_000:
            counts[row["split"]][row["word"]] += 1
    report = {
        "source": "MS-ASL and WLASL (C-UDA licensed subset)",
        "words": list(WORDS),
        "minimum_train_per_word": TRAIN_PER_WORD,
        "target_validation_and_test_per_word": EVAL_TARGET_PER_WORD,
        "counts": counts,
        "failures": failures,
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def reclip_local_sources(records: list[dict], raw_dir: Path, clip_dir: Path,
                         ffmpeg: Path, wlasl_root: Path | None) -> dict:
    """Rebuild already-downloaded clips after a crop/preprocessing change."""
    results = {"reclipped": 0, "missing_source": 0, "errors": []}
    for row in records:
        vid = safe_video_id(row["video_id"])
        if row["dataset"] == "WLASL":
            local_source = (wlasl_root / row["local_video"]) if wlasl_root else None
            source = local_source if local_source and local_source.is_file() else raw_dir / "originals" / f"wlasl_{vid}.mp4"
        else:
            source = raw_dir / "originals" / f"{vid}.mp4"
        if not source.is_file():
            results["missing_source"] += 1
            continue
        destination = clip_dir / row["split"] / row["word"] / f"{row['dataset'].lower()}_{vid}.mp4"
        ok, detail = make_clip(row, source, destination, ffmpeg)
        if ok:
            results["reclipped"] += 1
        else:
            results["errors"].append({"word": row["word"], "split": row["split"], "video_id": vid, "error": detail})
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata-zip", type=Path, help="Official MS-ASL.zip downloaded from Microsoft")
    parser.add_argument("--wlasl-root", type=Path, help="Extracted WLASL root containing WLASL_v0.3.json and videos/")
    parser.add_argument("--select-only", action="store_true", help="Write manifest, do not download clips")
    parser.add_argument("--reclip", action="store_true", help="Rebuild clips from cached source videos and stop")
    parser.add_argument("--workers", type=int, default=3, help="Parallel public-video downloads (default: 3)")
    parser.add_argument("--raw-dir", type=Path, default=DATA / "raw", help="Local-only source video cache")
    parser.add_argument("--clip-dir", type=Path, default=DATA / "clips", help="Local-only trimmed clip directory")
    args = parser.parse_args()

    if args.metadata_zip:
        records = write_manifest(args.metadata_zip, args.wlasl_root)
    elif MANIFEST.is_file():
        records = read_manifest()
    else:
        parser.error("Pass --metadata-zip on first run, or create data/manifest.jsonl before downloading.")

    print(f"Manifest: {MANIFEST} ({len(records)} candidates)")
    print("Candidate counts:", json.dumps({
        split: {word: sum(1 for row in records if row['split'] == split and row['word'] == word)
                for word in WORDS}
        for split in ("train", "val", "test")
    }))
    if args.select_only:
        return

    if args.reclip:
        result = reclip_local_sources(records, args.raw_dir, args.clip_dir, ffmpeg_binary(), args.wlasl_root)
        print(json.dumps(result, indent=2))
        return

    report = run_download(records, args.raw_dir, args.clip_dir, args.workers, args.wlasl_root)
    print(json.dumps(report, indent=2))
    missing = [word for word in WORDS if report["counts"]["train"][word] < TRAIN_PER_WORD]
    if missing:
        raise SystemExit(f"Fewer than {TRAIN_PER_WORD} training clips available for: {', '.join(missing)}")


if __name__ == "__main__":
    main()
