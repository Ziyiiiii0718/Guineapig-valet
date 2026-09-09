import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    service_token: str
    model_name: str = "ViT-B-32-quickgelu"
    model_version: str = "openai"
    embedding_dimension: int = 512
    max_image_bytes: int = 10 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings(service_token=os.environ.get("AI_SERVICE_TOKEN", "").strip())
