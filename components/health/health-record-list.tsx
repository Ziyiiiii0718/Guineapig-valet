"use client";
import { useActionState, useState } from "react";
import {
  deleteHealthAction,
  type HealthActionState,
} from "@/app/actions/health";
import { HealthForm } from "@/components/health/health-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatHealthDate,
  HEALTH_TYPE_LABELS,
  type HealthRecord,
} from "@/lib/health/core";

const INITIAL: HealthActionState = { status: "idle" };
function DeleteHealthButton({
  petId,
  record,
}: {
  petId: string;
  record: HealthRecord;
}) {
  const [state, action, pending] = useActionState(deleteHealthAction, INITIAL);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete “${record.title}” from ${formatHealthDate(record.record_date)}? Only this health record will be removed.`,
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="petId" value={petId} />
      <input type="hidden" name="recordId" value={record.id} />
      <Button
        type="submit"
        variant="ghost"
        disabled={pending}
        aria-label={`Delete ${record.title} from ${formatHealthDate(record.record_date)}`}
      >
        {pending ? "Deleting..." : "Delete"}
      </Button>
      {state.status === "error" ? (
        <span className="form-error" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
function HealthRecordItem({
  petId,
  record,
}: {
  petId: string;
  record: HealthRecord;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="health-record-item">
      {editing ? (
        <HealthForm
          petId={petId}
          record={record}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <time dateTime={record.record_date}>
              {formatHealthDate(record.record_date)}
            </time>
            <Badge>{HEALTH_TYPE_LABELS[record.record_type]}</Badge>
          </div>
          <h3 className="mt-2 font-bold">{record.title}</h3>
          {record.notes ? (
            <p className="health-notes text-secondary mt-2 text-sm">
              {record.notes}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${record.title}`}
            >
              Edit
            </Button>
            <DeleteHealthButton petId={petId} record={record} />
          </div>
        </>
      )}
    </li>
  );
}
export function HealthRecordList({
  petId,
  records,
}: {
  petId: string;
  records: HealthRecord[];
}) {
  return (
    <ol className="health-timeline">
      {records.map((record) => (
        <HealthRecordItem key={record.id} petId={petId} record={record} />
      ))}
    </ol>
  );
}
