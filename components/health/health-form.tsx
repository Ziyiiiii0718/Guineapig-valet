"use client";
import { useActionState, useEffect, useRef } from "react";
import {
  createHealthAction,
  updateHealthAction,
  type HealthActionState,
} from "@/app/actions/health";
import { Button } from "@/components/ui/button";
import {
  HEALTH_TYPES,
  HEALTH_TYPE_LABELS,
  type HealthRecord,
} from "@/lib/health/core";

const INITIAL: HealthActionState = { status: "idle" };
function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
export function HealthForm({
  petId,
  record,
  onCancel,
}: {
  petId: string;
  record?: HealthRecord;
  onCancel?: () => void;
}) {
  const action = record ? updateHealthAction : createHealthAction;
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success" && !record) formRef.current?.reset();
    if (state.status === "success" && record) onCancel?.();
  }, [onCancel, record, state.status]);
  const values = state.values;
  return (
    <form ref={formRef} action={formAction} className="health-form">
      <input type="hidden" name="petId" value={petId} />
      {record ? (
        <input type="hidden" name="recordId" value={record.id} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="form-field">
          <span className="form-label">Category</span>
          <select
            className="input"
            name="recordType"
            defaultValue={
              values?.recordType ?? record?.record_type ?? "general"
            }
            aria-describedby={
              state.fieldErrors?.recordType
                ? `health-type-${record?.id ?? "new"}`
                : undefined
            }
          >
            {HEALTH_TYPES.map((type) => (
              <option key={type} value={type}>
                {HEALTH_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          {state.fieldErrors?.recordType ? (
            <span
              id={`health-type-${record?.id ?? "new"}`}
              className="form-error"
            >
              {state.fieldErrors.recordType}
            </span>
          ) : null}
        </label>
        <label className="form-field">
          <span className="form-label">Event date</span>
          <input
            className="input"
            type="date"
            name="recordDate"
            required
            defaultValue={
              values?.recordDate ?? record?.record_date ?? localToday()
            }
            aria-describedby={
              state.fieldErrors?.recordDate
                ? `health-date-${record?.id ?? "new"}`
                : undefined
            }
          />
          {state.fieldErrors?.recordDate ? (
            <span
              id={`health-date-${record?.id ?? "new"}`}
              className="form-error"
            >
              {state.fieldErrors.recordDate}
            </span>
          ) : null}
        </label>
      </div>
      <label className="form-field">
        <span className="form-label">Title</span>
        <input
          className="input"
          name="title"
          required
          maxLength={120}
          defaultValue={values?.title ?? record?.title ?? ""}
          aria-describedby={
            state.fieldErrors?.title
              ? `health-title-${record?.id ?? "new"}`
              : undefined
          }
        />
        {state.fieldErrors?.title ? (
          <span
            id={`health-title-${record?.id ?? "new"}`}
            className="form-error"
          >
            {state.fieldErrors.title}
          </span>
        ) : null}
      </label>
      <label className="form-field">
        <span className="form-label">
          Notes <span className="text-secondary">(optional)</span>
        </span>
        <textarea
          className="input"
          name="notes"
          rows={4}
          maxLength={4000}
          defaultValue={values?.notes ?? record?.notes ?? ""}
          aria-describedby={
            state.fieldErrors?.notes
              ? `health-notes-${record?.id ?? "new"}`
              : undefined
          }
        />
        {state.fieldErrors?.notes ? (
          <span
            id={`health-notes-${record?.id ?? "new"}`}
            className="form-error"
          >
            {state.fieldErrors.notes}
          </span>
        ) : null}
      </label>
      {state.message ? (
        <p
          className={
            state.status === "error" ? "form-error" : "text-secondary text-sm"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : record ? "Save" : "Add health record"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
