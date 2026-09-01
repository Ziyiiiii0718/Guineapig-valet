import Link from "next/link";
import { notFound } from "next/navigation";
import { HealthForm } from "@/components/health/health-form";
import { HealthRecordList } from "@/components/health/health-record-list";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  HEALTH_TYPES,
  HEALTH_TYPE_LABELS,
  healthPageCount,
  parseHealthFilter,
  parseHealthPage,
} from "@/lib/health/core";
import { listHealthForPet } from "@/lib/health/queries";
import {
  getPetForUser,
  requireAuthenticatedSupabase,
} from "@/lib/pets/queries";
import { petIdSchema } from "@/lib/validation/pets";

function healthUrl(petId: string, type: string | null, page = 1) {
  const query = new URLSearchParams();
  if (type) query.set("type", type);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return `/pets/${petId}/health${suffix ? `?${suffix}` : ""}`;
}
export default async function HealthPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const petId = petIdSchema.safeParse(id);
  if (!petId.success) notFound();
  const { user } = await requireAuthenticatedSupabase();
  if (!user) notFound();
  const type = parseHealthFilter(query.type);
  const page = parseHealthPage(query.page);
  const [{ pet }, history] = await Promise.all([
    getPetForUser(petId.data, user.id),
    listHealthForPet(petId.data, user.id, { page, type }),
  ]);
  if (!pet) notFound();
  const pages = healthPageCount(history.count);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-kicker">Private pet history</p>
          <h1 className="heading-page mt-2">{pet.name}’s health</h1>
          <p className="text-secondary mt-2 text-sm">
            Organize observations and care events without medical
            interpretation.
          </p>
        </div>
        <ButtonLink href={`/pets/${pet.id}`} variant="secondary">
          Back to pet
        </ButtonLink>
      </div>
      <Card>
        <h2 className="heading-section">Add health record</h2>
        <div className="mt-5">
          <HealthForm petId={pet.id} />
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="heading-section">Health history</h2>
            <p className="text-secondary mt-2 text-sm">
              Newest event first · {history.count} matching{" "}
              {history.count === 1 ? "record" : "records"}
            </p>
          </div>
        </div>
        <nav aria-label="Filter health records" className="health-filters mt-5">
          <Link
            className={!type ? "active" : ""}
            href={healthUrl(pet.id, null)}
          >
            All
          </Link>
          {HEALTH_TYPES.map((item) => (
            <Link
              key={item}
              className={type === item ? "active" : ""}
              href={healthUrl(pet.id, item)}
            >
              {HEALTH_TYPE_LABELS[item]}
            </Link>
          ))}
        </nav>
        {history.error ? (
          <p className="alert alert-error mt-5" role="alert">
            We could not load health history. Please try again.
          </p>
        ) : null}
        {!history.error && history.records.length ? (
          <div className="mt-6">
            <HealthRecordList petId={pet.id} records={history.records} />
          </div>
        ) : null}
        {!history.error && !history.records.length ? (
          <div className="empty-state mt-6 text-sm">
            {type
              ? `No ${HEALTH_TYPE_LABELS[type].toLowerCase()} records yet.`
              : "No health records yet."}
          </div>
        ) : null}
        {pages > 1 ? (
          <nav className="pagination mt-6" aria-label="Health history pages">
            {page > 1 ? (
              <Link href={healthUrl(pet.id, type, page - 1)}>Previous</Link>
            ) : (
              <span />
            )}
            <span>
              Page {Math.min(page, pages)} of {pages}
            </span>
            {page < pages ? (
              <Link href={healthUrl(pet.id, type, page + 1)}>Next</Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </Card>
    </div>
  );
}
