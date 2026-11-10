import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { WeightChart } from "@/components/weights/weight-chart";
import {
  summarizeWeights,
  formatWeightGrams,
  formatMeasurementDate,
  type WeightRecord,
} from "@/lib/weights/core";
import {
  formatHealthDate,
  HEALTH_TYPE_LABELS,
  type HealthRecord,
} from "@/lib/health/core";

export function PetCareOverview({
  petId,
  weights,
  health,
  weightError,
  healthError,
}: {
  petId: string;
  weights: WeightRecord[];
  health: HealthRecord[];
  weightError: unknown;
  healthError: unknown;
}) {
  const latest = summarizeWeights(weights).latest;
  return (
    <div className="pet-care-grid">
      <Card className="pet-weight-overview">
        <div className="pet-section-heading">
          <h2>Weight Trend</h2>
          {!weightError && latest ? (
            <span className="pet-latest-weight">
              <strong>{formatWeightGrams(latest.weight_grams)}</strong>
              <time dateTime={latest.recorded_at}>
                {formatMeasurementDate(latest.recorded_at)}
              </time>
            </span>
          ) : null}
        </div>
        {weightError ? (
          <p role="alert">Weight records could not be loaded.</p>
        ) : (
          <WeightChart records={weights} compact />
        )}
        <Link
          href={`/pets/${petId}?view=weight#pet-weight`}
          className="pet-care-link"
        >
          Log weight & view history →
        </Link>
      </Card>
      <Card className="pet-health-overview" id="pet-health">
        <div className="pet-section-heading">
          <h2>Health Summary</h2>
          <Link href={`/pets/${petId}/health`}>View all →</Link>
        </div>
        {healthError ? (
          <p role="alert">Health records could not be loaded.</p>
        ) : health.length ? (
          <ol>
            {health.map((record) => (
              <li key={record.id}>
                <span>{HEALTH_TYPE_LABELS[record.record_type]}</span>
                <strong>{record.title}</strong>
                <time dateTime={record.record_date}>
                  {formatHealthDate(record.record_date)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <div className="pet-care-empty">
            No health records yet.
            <p>A place for care notes and little observations.</p>
          </div>
        )}
        <ButtonLink href={`/pets/${petId}/health`} variant="secondary">
          + Add Health Record
        </ButtonLink>
      </Card>
    </div>
  );
}
