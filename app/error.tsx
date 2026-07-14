"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h1 className="text-xl font-semibold text-red-900">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-red-800">
        {error.message || "The page could not be loaded."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-red-900 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
      >
        Try again
      </button>
    </section>
  );
}
