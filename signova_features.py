"""Shared landmark preprocessing used by training and every inference path."""

from __future__ import annotations

import numpy as np


FRAMES = 30
POSE_DIM = 34
MODEL_DIM = POSE_DIM * 2
PREPROCESSING_VERSION = "signova_features_v2_center_visible_joints_keep_missing_zero_append_abs_velocity_visible_consecutive"


def _append_velocity(normalized: np.ndarray, visible: np.ndarray) -> np.ndarray:
    velocity = np.zeros_like(normalized, dtype=np.float32)
    joint_velocity = velocity.reshape(FRAMES, POSE_DIM // 2, 2)
    joint_positions = normalized.reshape(FRAMES, POSE_DIM // 2, 2)
    consecutive = visible[1:] & visible[:-1]
    deltas = np.abs(np.diff(joint_positions, axis=0))
    joint_velocity[1:][consecutive] = deltas[consecutive]
    return np.concatenate([normalized, velocity], axis=-1).astype(np.float32)


def validate_pose_sequence(sequence: np.ndarray) -> np.ndarray:
    """Return a finite float32 (30, 34) pose sequence or raise a clear error."""
    values = np.asarray(sequence, dtype=np.float32)
    if values.shape != (FRAMES, POSE_DIM):
        raise ValueError(
            f"Expected pose data with shape ({FRAMES}, {POSE_DIM}); got {values.shape}."
        )
    if not np.isfinite(values).all():
        raise ValueError("Pose data contains NaN or infinite values.")
    return values


def enhance_pose_sequence(sequence: np.ndarray) -> np.ndarray:
    """Center each frame on visible joints and append per-joint motion features."""
    values = validate_pose_sequence(sequence)
    normalized = np.zeros_like(values, dtype=np.float32)
    visible_joints = np.zeros((FRAMES, POSE_DIM // 2), dtype=bool)

    for frame_index, flat_frame in enumerate(values):
        frame = flat_frame.reshape(-1, 2)
        visible = np.any(frame != 0, axis=1)
        visible_joints[frame_index] = visible
        if visible.any():
            center = frame[visible].mean(axis=0)
            # Keep the all-zero missing-joint sentinel intact after centering.
            normalized[frame_index].reshape(-1, 2)[visible] = frame[visible] - center

    return _append_velocity(normalized, visible_joints)


def add_velocity_features(normalized_sequence: np.ndarray) -> np.ndarray:
    """Append motion features to already centered landmarks (used by augmentation)."""
    values = np.asarray(normalized_sequence, dtype=np.float32)
    if values.shape != (FRAMES, POSE_DIM):
        raise ValueError(
            f"Expected normalized pose data with shape ({FRAMES}, {POSE_DIM}); got {values.shape}."
        )
    if not np.isfinite(values).all():
        raise ValueError("Pose data contains NaN or infinite values.")
    visible = np.any(values.reshape(FRAMES, POSE_DIM // 2, 2) != 0, axis=-1)
    return _append_velocity(values, visible)
