# Phase 7 Classification Calibration Report

Date: 2026-09-09  
Model: `ViT-B-32-quickgelu`  
Weights/version: `openai`  
Embedding dimension: 512  
Classifier: `embedding-similarity-v1`  
Configuration: `provisional-2026-09-v1`

## Available data

- Pet profiles in the linked project: 3
- Private photos in the linked project: 4
- Ready reference embeddings: 1
- Manually labeled held-out test photos: 0

This is too small to calculate same-pet/different-pet ranges or claim classification accuracy. The sole reference is not a held-out test example. No private filename, image, pet name, ID, vector, or signed URL is recorded here.

## Current aggregate results

| Measure                   | Result        |
| ------------------------- | ------------- |
| Same-pet score range      | Not available |
| Different-pet score range | Not available |
| Nearest-pet margin range  | Not available |
| Ambiguous cases           | Not evaluated |
| Multi-pet cases           | Not evaluated |
| Unrelated/Unknown cases   | Not evaluated |

## Provisional safety-first configuration

- Minimum ready references per eligible pet: 2
- Pet score: mean of its top 3 reference similarities
- Single-pet threshold: 0.86
- Multiple-pet candidate threshold: 0.82
- Maximum gap for a multiple-pet heuristic: 0.04
- Persisted ranked candidates: 5

These values are conservative defaults, not empirically validated production thresholds. They prefer Unknown or review over a weak assignment.

## Local evaluation workflow

1. Add at least two ready references for each pet, preferably 5–15 varied clear images.
2. Keep separate held-out photos: clear examples, difficult angles, an available multiple-pet frame, and unrelated/ambiguous images.
3. Analyze each held-out photo and manually record the known pet IDs plus persisted candidate pet IDs/scores in `.local/phase7-evaluation.json`. Do not copy vectors, image data, signed URLs, or credentials.
4. Use this shape:

```json
{
  "samples": [
    {
      "expectedPetIds": ["pet-uuid"],
      "candidateScores": [{ "petId": "pet-uuid", "score": 0.0 }]
    }
  ]
}
```

5. Run `pnpm calibrate:ai -- .local/phase7-evaluation.json`.
6. Record aggregate ranges only. Review false assignments and Unknowns. Do not count reference photos as independent test cases.
7. Change thresholds only when evidence supports it, increment `configurationVersion`, rerun deterministic tests, and repeat manual review.

## Known limitations

- The current sample cannot support statistical confidence.
- Scores are cosine similarities, not probabilities.
- Global image embeddings cannot guarantee multi-pet detection or localization.
- Background, pose, lighting, and visually similar pets can affect ranking.
- Production AI still requires separately hosted FastAPI; the deployed core app remains functional without it.

## Offline Potato/Annie dataset experiment

For local four-folder collection, capture-session grouping, duplicate-aware frozen
splits, and the unchanged OpenCLIP baseline, follow
[Offline photo evaluation](learning/20-offline-ml-evaluation.md). This workflow
uses no live database or deployed service. Cropped OpenCLIP and color methods are
future comparisons on the same manifest.
