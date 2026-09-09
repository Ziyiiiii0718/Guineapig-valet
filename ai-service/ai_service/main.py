from secrets import compare_digest

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status

from ai_service.config import Settings, get_settings
from ai_service.model import (
    ImageEmbedder,
    InferenceError,
    ModelUnavailableError,
    get_embedder,
    get_model_status,
)
from ai_service.preprocessing import InvalidImageError, decode_rgb_image
from ai_service.schemas import EmbeddingResponse, ErrorResponse, HealthResponse

SUPPORTED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}

app = FastAPI(
    title="PiggieVault AI Service",
    description="Private image embeddings only; classification is not implemented.",
    version="0.1.0",
)


def require_service_token(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = f"Bearer {settings.service_token}"
    if (
        not settings.service_token
        or not authorization
        or not compare_digest(authorization, expected)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid server authentication is required.",
        )


def get_embedder_dependency() -> ImageEmbedder:
    try:
        return get_embedder()
    except Exception as error:
        raise HTTPException(
            status_code=503, detail="Embedding model is unavailable."
        ) from error


@app.get("/health", response_model=HealthResponse)
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    model_status = get_model_status()
    return HealthResponse(
        model_status=model_status,
        model=settings.model_name,
        version=settings.model_version,
        dimension=settings.embedding_dimension,
    )


@app.post(
    "/embed",
    response_model=EmbeddingResponse,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        413: {"model": ErrorResponse},
        415: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
    dependencies=[Depends(require_service_token)],
)
async def embed_image(
    request: Request,
    embedder: ImageEmbedder = Depends(get_embedder_dependency),
    settings: Settings = Depends(get_settings),
) -> EmbeddingResponse:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported image content type.")

    image_bytes = await request.body()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image body is empty.")
    if len(image_bytes) > settings.max_image_bytes:
        raise HTTPException(status_code=413, detail="Image body is too large.")

    try:
        decode_rgb_image(image_bytes)
        result = embedder.embed_bytes(image_bytes)
    except InvalidImageError as error:
        raise HTTPException(
            status_code=422, detail="Image could not be decoded."
        ) from error
    except ModelUnavailableError as error:
        raise HTTPException(
            status_code=503, detail="Embedding model is unavailable."
        ) from error
    except InferenceError as error:
        raise HTTPException(
            status_code=422, detail="Image could not be embedded."
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="Embedding request failed."
        ) from error

    if (
        result.dimension != settings.embedding_dimension
        or len(result.embedding) != result.dimension
    ):
        raise HTTPException(status_code=500, detail="Embedding request failed.")

    return EmbeddingResponse(
        embedding=result.embedding,
        model=result.model,
        version=result.version,
        dimension=result.dimension,
    )
