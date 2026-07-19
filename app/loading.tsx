import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <Card className="flex items-center gap-3" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="text-secondary text-sm font-semibold">
        Loading PiggieVault...
      </p>
    </Card>
  );
}
