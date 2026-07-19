"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="border-[#f1c7bb] bg-[var(--color-error-background)]">
      <h1 className="heading-section text-[#c65337]">Something went wrong</h1>
      <p className="mt-2 text-sm text-[#c65337]">
        {error.message || "The page could not be loaded."}
      </p>
      <Button type="button" onClick={reset} variant="danger" className="mt-4">
        Try again
      </Button>
    </Card>
  );
}
