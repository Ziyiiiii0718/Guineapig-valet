import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import {
  formatHealthDate,
  HEALTH_TYPE_LABELS,
  type HealthRecord,
} from "@/lib/health/core";

export function HealthSummary({
  petId,
  records,
}: {
  petId: string;
  records: HealthRecord[];
}) {
  return (
    <section aria-labelledby="health-summary-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="health-summary-heading" className="heading-section">
            Health
          </h2>
          <p className="text-secondary mt-2 text-sm">
            Private record keeping only—not a substitute for veterinary advice.
          </p>
        </div>
        <ButtonLink href={`/pets/${petId}/health`}>
          {records.length ? "View health history" : "Add health record"}
        </ButtonLink>
      </div>
      {records.length ? (
        <ol className="mt-5 space-y-3">
          {records.map((record) => (
            <li key={record.id} className="health-summary-item">
              <div className="flex flex-wrap items-center gap-2">
                <time dateTime={record.record_date}>
                  {formatHealthDate(record.record_date)}
                </time>
                <Badge>{HEALTH_TYPE_LABELS[record.record_type]}</Badge>
              </div>
              <strong className="mt-1 block">{record.title}</strong>
              {record.notes ? (
                <p className="health-note-preview text-secondary mt-1 text-sm">
                  {record.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state mt-5 text-sm">No health records yet.</div>
      )}
    </section>
  );
}
