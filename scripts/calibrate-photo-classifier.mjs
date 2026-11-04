import { readFile } from "node:fs/promises";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error(
    "Usage: node scripts/calibrate-photo-classifier.mjs <local-evaluation.json>",
  );
  process.exitCode = 1;
} else {
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const samples = Array.isArray(raw.samples) ? raw.samples : [];
  const same = [];
  const different = [];
  const margins = [];
  let ambiguous = 0;

  for (const sample of samples) {
    const expected = new Set(sample.expectedPetIds ?? []);
    const scores = [...(sample.candidateScores ?? [])].sort(
      (left, right) => right.score - left.score,
    );
    for (const candidate of scores) {
      (expected.has(candidate.petId) ? same : different).push(candidate.score);
    }
    if (scores.length > 1) {
      const margin = scores[0].score - scores[1].score;
      margins.push(margin);
      if (margin <= 0.04) ambiguous += 1;
    }
  }

  const range = (values) =>
    values.length === 0
      ? null
      : { maximum: Math.max(...values), minimum: Math.min(...values) };
  const mean = (values) =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;

  console.log(
    JSON.stringify(
      {
        ambiguousCasesAtCurrentMargin: ambiguous,
        differentPetScoreRange: range(different),
        meanNearestPetMargin: mean(margins),
        samePetScoreRange: range(same),
        testImageCount: samples.length,
      },
      null,
      2,
    ),
  );
}
