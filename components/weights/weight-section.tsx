"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createWeightAction,
  deleteWeightAction,
  updateWeightAction,
  type WeightActionState,
} from "@/app/actions/weights";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WeightChart } from "@/components/weights/weight-chart";
import {
  formatMeasurementDate,
  formatWeightDifference,
  formatWeightGrams,
  summarizeWeights,
  type WeightRecord,
  WEIGHT_MAX_GRAMS,
  WEIGHT_MIN_GRAMS,
} from "@/lib/weights/core";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : label}
    </Button>
  );
}
function Fields({ date, weight }: { date: string; weight?: number }) {
  return (
    <>
      <div>
        <label
          className="form-label"
          htmlFor={`weight-${date}-${weight ?? "new"}`}
        >
          Weight (g)
        </label>
        <input
          className="input"
          id={`weight-${date}-${weight ?? "new"}`}
          name="weightGrams"
          type="number"
          inputMode="numeric"
          min={WEIGHT_MIN_GRAMS}
          max={WEIGHT_MAX_GRAMS}
          step="1"
          defaultValue={weight}
          required
        />
      </div>
      <div>
        <label
          className="form-label"
          htmlFor={`date-${date}-${weight ?? "new"}`}
        >
          Measurement date
        </label>
        <input
          className="input"
          id={`date-${date}-${weight ?? "new"}`}
          name="measuredAt"
          type="date"
          defaultValue={date}
          required
        />
      </div>
    </>
  );
}
function AddForm({ petId }: { petId: string }) {
  const [state, action] = useActionState(createWeightAction, {
    status: "idle",
  } satisfies WeightActionState);
  return (
    <form action={action} className="weight-form">
      <input type="hidden" name="petId" value={petId} />
      <Fields date={state.values?.measuredAt || todayLocal()} />
      <div className="flex items-end">
        <Submit label="Add weight" />
      </div>
      {state.message ? (
        <Alert
          className="sm:col-span-3"
          tone={state.status === "error" ? "error" : "success"}
          role="status"
        >
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}
function RecordRow({ petId, record }: { petId: string; record: WeightRecord }) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateWeightAction, {
    status: "idle",
  } satisfies WeightActionState);
  const [deleteState, deleteAction] = useActionState(deleteWeightAction, {
    status: "idle",
  } satisfies WeightActionState);
  return (
    <li className="weight-record-row">
      {editing ? (
        <form action={editAction} className="weight-form flex-1">
          <input type="hidden" name="petId" value={petId} />
          <input type="hidden" name="recordId" value={record.id} />
          <Fields date={record.recorded_at} weight={record.weight_grams} />
          <div className="flex items-end gap-2">
            <Submit label="Save" />
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          {editState.message ? (
            <Alert tone={editState.status === "error" ? "error" : "success"}>
              {editState.message}
            </Alert>
          ) : null}
        </form>
      ) : (
        <>
          <div>
            <strong>{formatWeightGrams(record.weight_grams)}</strong>
            <p className="text-secondary text-sm">
              {formatMeasurementDate(record.recorded_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${formatWeightGrams(record.weight_grams)} from ${formatMeasurementDate(record.recorded_at)}`}
            >
              Edit
            </Button>
            <form
              action={deleteAction}
              onSubmit={(event) => {
                if (
                  !window.confirm(
                    `Delete ${formatWeightGrams(record.weight_grams)} from ${formatMeasurementDate(record.recorded_at)}? This deletes only this measurement.`,
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="petId" value={petId} />
              <input type="hidden" name="recordId" value={record.id} />
              <Button
                type="submit"
                variant="danger"
                aria-label={`Delete ${formatWeightGrams(record.weight_grams)} from ${formatMeasurementDate(record.recorded_at)}`}
              >
                Delete
              </Button>
            </form>
          </div>
        </>
      )}
      {deleteState.message ? (
        <Alert tone={deleteState.status === "error" ? "error" : "success"}>
          {deleteState.message}
        </Alert>
      ) : null}
    </li>
  );
}
export function WeightSection({
  petId,
  petName,
  records,
}: {
  petId: string;
  petName: string;
  records: WeightRecord[];
}) {
  const summary = summarizeWeights(records);
  return (
    <section className="space-y-5" aria-labelledby="weight-title">
      <div>
        <h2 id="weight-title" className="heading-section">
          Weight
        </h2>
        <p className="text-secondary mt-1 text-sm">
          Calendar-date measurements for {petName}. Values are personal records,
          not medical conclusions.
        </p>
      </div>
      {summary.latest ? (
        <div className="weight-summary">
          <div>
            <span className="text-secondary text-sm">Latest weight</span>
            <strong>{formatWeightGrams(summary.latest.weight_grams)}</strong>
            <span className="text-secondary text-sm">
              {formatMeasurementDate(summary.latest.recorded_at)}
            </span>
          </div>
          {summary.difference !== null ? (
            <p>
              <strong>{formatWeightDifference(summary.difference)}</strong>{" "}
              since previous measurement
            </p>
          ) : null}
        </div>
      ) : (
        <div className="empty-state text-sm">No weight recorded yet.</div>
      )}
      <AddForm petId={petId} />
      <div>
        <h3 className="font-bold">Trend</h3>
        <p className="text-secondary text-sm">
          Straight lines connect recorded values for readability only.
        </p>
      </div>
      <WeightChart records={records} />
      <div>
        <h3 className="font-bold">Weight history</h3>
        {records.length ? (
          <ol className="mt-3 space-y-3">
            {records.map((record) => (
              <RecordRow key={record.id} petId={petId} record={record} />
            ))}
          </ol>
        ) : (
          <p className="text-secondary mt-2 text-sm">
            No measurements to list.
          </p>
        )}
      </div>
    </section>
  );
}
