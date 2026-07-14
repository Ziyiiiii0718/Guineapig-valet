type PlaceholderSectionProps = {
  title: string;
  description: string;
};

export function PlaceholderSection({
  title,
  description,
}: PlaceholderSectionProps) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
          Planned
        </span>
      </div>
      <div className="mt-5 rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-600">
        No data is shown because this feature is not implemented in Phase 1A.
      </div>
    </section>
  );
}
