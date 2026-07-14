export default function Loading() {
  return (
    <div
      className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium text-stone-700">
        Loading PiggieVault...
      </p>
    </div>
  );
}
