# PiggieVault AI service

This FastAPI service creates normalized image embeddings for already-authorized
private PiggieVault photos. Phase 7 classification remains in one canonical
Next.js server module; FastAPI does not know pet names, access Supabase, fetch
URLs, or persist incoming image bytes.

## Local setup

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e './ai-service[dev]'
export AI_SERVICE_TOKEN='use-the-same-long-random-local-value-as-nextjs'
uvicorn ai_service.main:app --app-dir ai-service --reload --port 8000
```

The first real embedding request downloads the configured OpenCLIP weights into
the normal PyTorch model cache. No model binary belongs in this repository.

Next.js needs the matching server-only values in `.env.local`:

```text
AI_SERVICE_URL=http://127.0.0.1:8000
AI_SERVICE_TOKEN=use-the-same-long-random-local-value-as-nextjs
```

Check service availability at `http://127.0.0.1:8000/health`. The model loads
once, lazily, on the first embedding request. `/embed` accepts only authenticated
raw JPEG, PNG, or WEBP bytes up to 10 MB. It never accepts a remote URL.

## Verification

```bash
ruff format --check ai-service
ruff check ai-service
mypy --config-file ai-service/pyproject.toml ai-service/ai_service
pytest -c ai-service/pyproject.toml ai-service/tests
```

The tests replace the large model boundary with a deterministic fake. A real
model smoke test is intentionally manual because it downloads sizeable model
weights.

## Model contract

- Encoder: OpenCLIP `ViT-B-32-quickgelu`
- Pretrained weights: `openai`
- Dimension: 512
- Preprocessing: OpenCLIP's matching resize, center crop, RGB conversion, and
  channel normalization
- Output: L2-normalized finite vector
- Comparison: the Next.js classifier uses cosine similarity and centrally
  versioned provisional thresholds; FastAPI performs no label decision.

Production still requires choosing and provisioning a separate Python/ML host.
The Vercel-hosted Next.js app must point `AI_SERVICE_URL` at that private service
and share `AI_SERVICE_TOKEN` through server-only environment configuration.
