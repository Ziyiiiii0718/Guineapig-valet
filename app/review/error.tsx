"use client";
import { Button } from "@/components/ui/button";
export default function ReviewError({ reset }: { reset: () => void }) {
  return (
    <div className="card space-y-3" role="alert">
      <p>We could not load photo reviews. Please try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
