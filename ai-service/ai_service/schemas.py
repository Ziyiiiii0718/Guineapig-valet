from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    service: Literal["ok"] = "ok"
    model_status: Literal["not_loaded", "ready", "unavailable"]
    model: str
    version: str
    dimension: int = Field(gt=0)


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    model: str
    version: str
    dimension: int = Field(gt=0)


class ErrorResponse(BaseModel):
    detail: str
