"""Extract pose frames in a worker process separate from TensorFlow."""
import sys
import os
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from signova_features import FRAMES, POSE_DIM


def resize_frame(frame: np.ndarray) -> np.ndarray:
    height, width = frame.shape[:2]
    longest = max(height, width)
    if longest <= 640:
        return frame
    scale = 640 / longest
    return cv2.resize(frame, (max(1, int(width * scale)), max(1, int(height * scale))))


def extract(video_path: Path, output_path: Path) -> None:
    override = os.getenv("YOLO_POSE_WEIGHTS")
    weights = Path(override) if override else Path("yolov8n-pose.pt")
    if override and not weights.is_file():
        raise RuntimeError(f"YOLO pose weights not found: {weights}")

    capture = cv2.VideoCapture(str(video_path))
    try:
        if not capture.isOpened():
            raise ValueError("The video could not be decoded. Upload an MP4 or WebM clip and try again.")

        total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        selected: list[tuple[int, np.ndarray]] = []
        if total > 0:
            indices = np.linspace(0, total - 1, min(FRAMES, total), dtype=int).tolist()
            wanted = set(indices)
            index = 0
            while index <= indices[-1]:
                ok, frame = capture.read()
                if not ok:
                    break
                if index in wanted:
                    selected.append((index, resize_frame(frame)))
                index += 1
        else:
            # Android MediaRecorder WebM files can decode while reporting zero frames.
            rng = np.random.default_rng(0)
            seen = 0
            while seen < 6000:
                ok, frame = capture.read()
                if not ok:
                    break
                frame = resize_frame(frame)
                if seen < FRAMES:
                    selected.append((seen, frame))
                else:
                    replacement = int(rng.integers(0, seen + 1))
                    if replacement < FRAMES:
                        selected[replacement] = (seen, frame)
                seen += 1
            selected.sort(key=lambda item: item[0])

        if not selected:
            raise ValueError("The video could not be decoded. Upload an MP4 or WebM clip and try again.")

        pose_model = YOLO(str(weights))
        vectors: list[np.ndarray] = []
        detected = 0
        for _, frame in selected:
            height, width = frame.shape[:2]
            vector = np.zeros(POSE_DIM, dtype=np.float32)
            result = pose_model.predict(frame, device="cpu", verbose=False)
            if result and result[0].keypoints is not None:
                xy = result[0].keypoints.xy
                if xy is not None and len(xy):
                    person = 0
                    boxes = result[0].boxes
                    if boxes is not None and len(boxes) > 1:
                        box_xyxy = boxes.xyxy.cpu().numpy()
                        areas = (box_xyxy[:, 2] - box_xyxy[:, 0]) * (box_xyxy[:, 3] - box_xyxy[:, 1])
                        person = int(np.argmax(areas))
                    coordinates = xy[person].cpu().numpy().astype(np.float32)
                    if np.isfinite(coordinates).all() and np.any(coordinates != 0):
                        detected += 1
                    coordinates[:, 0] /= max(width, 1)
                    coordinates[:, 1] /= max(height, 1)
                    vector = coordinates.reshape(-1)[:POSE_DIM]
                    if vector.size < POSE_DIM:
                        vector = np.pad(vector, (0, POSE_DIM - vector.size))
            vectors.append(vector)

        coverage = detected / max(len(selected), 1)
        print(f"Pose extraction complete: {len(vectors)} frames, {coverage:.0%} signer coverage.")
        np.savez_compressed(output_path, frames=np.asarray(vectors, dtype=np.float32), pose_coverage=coverage)
    finally:
        capture.release()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: pose_infer.py VIDEO_PATH OUTPUT_NPZ", file=sys.stderr)
        raise SystemExit(2)
    try:
        extract(Path(sys.argv[1]), Path(sys.argv[2]))
    except ValueError as error:
        print(f"VIDEO_ERROR: {error}", file=sys.stderr)
        raise SystemExit(2) from error
