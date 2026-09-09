from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal, Protocol

import numpy as np
from numpy.typing import NDArray

from ai_service.config import get_settings
from ai_service.preprocessing import decode_rgb_image


class ModelUnavailableError(RuntimeError):
    """Raised when the configured embedding model cannot be loaded."""


class InferenceError(RuntimeError):
    """Raised when model inference does not produce a usable vector."""


@dataclass(frozen=True)
class EmbeddingResult:
    embedding: list[float]
    model: str
    version: str
    dimension: int


class ImageEmbedder(Protocol):
    def embed_bytes(self, image_bytes: bytes) -> EmbeddingResult: ...


def normalize_vector(
    vector: Sequence[float] | NDArray[np.floating[Any]],
) -> NDArray[np.float32]:
    values = np.asarray(vector, dtype=np.float32).reshape(-1)
    magnitude = float(np.linalg.norm(values))
    if not np.isfinite(magnitude) or magnitude <= 0:
        raise InferenceError("Model produced an invalid vector.")
    normalized = values / magnitude
    if not np.all(np.isfinite(normalized)):
        raise InferenceError("Model produced non-finite values.")
    return normalized.astype(np.float32)


class OpenClipEmbedder:
    def __init__(self) -> None:
        settings = get_settings()
        try:
            import open_clip
            import torch

            model, _, preprocess = open_clip.create_model_and_transforms(
                settings.model_name,
                pretrained=settings.model_version,
            )
            model.eval()
        except Exception as error:
            raise ModelUnavailableError(
                "Embedding model could not be loaded."
            ) from error

        self._model = model
        self._preprocess = preprocess
        self._torch = torch
        self._settings = settings

    def embed_bytes(self, image_bytes: bytes) -> EmbeddingResult:
        image = decode_rgb_image(image_bytes)
        try:
            tensor = self._preprocess(image).unsqueeze(0)
            with self._torch.inference_mode():
                raw = self._model.encode_image(tensor)
            vector = normalize_vector(raw[0].detach().cpu().numpy())
        except InferenceError:
            raise
        except Exception as error:
            raise InferenceError("Image embedding failed.") from error

        if vector.size != self._settings.embedding_dimension:
            raise InferenceError("Model returned an unexpected vector dimension.")

        return EmbeddingResult(
            embedding=vector.tolist(),
            model=self._settings.model_name,
            version=self._settings.model_version,
            dimension=int(vector.size),
        )


ModelStatus = Literal["not_loaded", "ready", "unavailable"]
_model_status: ModelStatus = "not_loaded"


@lru_cache
def get_embedder() -> ImageEmbedder:
    global _model_status
    try:
        embedder = OpenClipEmbedder()
        _model_status = "ready"
        return embedder
    except Exception:
        _model_status = "unavailable"
        raise


def get_model_status() -> ModelStatus:
    return _model_status
