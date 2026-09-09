import math
from collections.abc import Generator
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from ai_service.config import Settings, get_settings
from ai_service.main import app, get_embedder_dependency
from ai_service.model import EmbeddingResult, InferenceError, normalize_vector

TOKEN = "unit-test-server-token"
DIMENSION = 512


def image_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (8, 8), color=(110, 161, 93)).save(buffer, format="JPEG")
    return buffer.getvalue()


class FakeEmbedder:
    def embed_bytes(self, _image_bytes: bytes) -> EmbeddingResult:
        return EmbeddingResult(
            embedding=[1.0] + [0.0] * (DIMENSION - 1),
            model="ViT-B-32-quickgelu",
            version="test-weights",
            dimension=DIMENSION,
        )


@pytest.fixture(autouse=True)
def dependencies() -> Generator[None, None, None]:
    app.dependency_overrides[get_settings] = lambda: Settings(service_token=TOKEN)
    app.dependency_overrides[get_embedder_dependency] = FakeEmbedder
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def auth_headers(content_type: str = "image/jpeg") -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": content_type}


def test_health_endpoint_reports_model_metadata(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "service": "ok",
        "model_status": "not_loaded",
        "model": "ViT-B-32-quickgelu",
        "version": "openai",
        "dimension": DIMENSION,
    }


def test_embedding_requires_server_authentication(client: TestClient) -> None:
    assert client.post("/embed", content=image_bytes()).status_code == 401
    assert (
        client.post(
            "/embed",
            content=image_bytes(),
            headers={"Authorization": "Bearer wrong", "Content-Type": "image/jpeg"},
        ).status_code
        == 401
    )


def test_valid_image_returns_normalized_finite_embedding(client: TestClient) -> None:
    response = client.post("/embed", content=image_bytes(), headers=auth_headers())
    assert response.status_code == 200
    payload = response.json()
    assert payload["model"] == "ViT-B-32-quickgelu"
    assert payload["version"] == "test-weights"
    assert payload["dimension"] == DIMENSION
    assert len(payload["embedding"]) == DIMENSION
    assert all(math.isfinite(value) for value in payload["embedding"])
    assert math.isclose(
        math.sqrt(sum(value * value for value in payload["embedding"])), 1.0
    )


@pytest.mark.parametrize("body", [b"", b"not-an-image"])
def test_empty_or_invalid_images_are_rejected(client: TestClient, body: bytes) -> None:
    response = client.post("/embed", content=body, headers=auth_headers())
    assert response.status_code == (400 if not body else 422)
    assert "Traceback" not in response.text


def test_unsupported_content_type_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/embed", content=image_bytes(), headers=auth_headers("application/json")
    )
    assert response.status_code == 415


def test_model_initialization_failure_is_sanitized(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unavailable() -> FakeEmbedder:
        raise RuntimeError("secret model cache path")

    app.dependency_overrides.pop(get_embedder_dependency)
    monkeypatch.setattr("ai_service.main.get_embedder", unavailable)
    response = client.post("/embed", content=image_bytes(), headers=auth_headers())
    assert response.status_code == 503
    assert "secret model cache path" not in response.text


def test_internal_inference_failure_is_sanitized(client: TestClient) -> None:
    class BrokenEmbedder:
        def embed_bytes(self, _image_bytes: bytes) -> EmbeddingResult:
            raise InferenceError("private internal detail")

    app.dependency_overrides[get_embedder_dependency] = BrokenEmbedder
    response = client.post("/embed", content=image_bytes(), headers=auth_headers())
    assert response.status_code == 422
    assert "private internal detail" not in response.text


def test_normalize_vector_is_unit_length() -> None:
    normalized = normalize_vector([3.0, 4.0])
    assert normalized.tolist() == pytest.approx([0.6, 0.8])
    assert math.isclose(float(sum(normalized * normalized)), 1.0)


def test_normalize_vector_rejects_zero_vector() -> None:
    with pytest.raises(InferenceError):
        normalize_vector([0.0, 0.0])
