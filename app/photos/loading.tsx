import { Card } from "@/components/ui/card";

export default function PhotosLoading() {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-3">
          <div className="spinner" aria-hidden="true" />
          <p className="text-secondary text-sm">Loading private photos...</p>
        </div>
      </Card>
    </div>
  );
}
