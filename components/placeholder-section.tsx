import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type PlaceholderSectionProps = {
  title: string;
  description: string;
};

export function PlaceholderSection({
  title,
  description,
}: PlaceholderSectionProps) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="heading-section text-lg">{title}</h2>
          <p className="text-secondary mt-2 text-sm leading-6">{description}</p>
        </div>
        <Badge>Planned</Badge>
      </div>
      <div className="empty-state mt-5 text-sm">
        No data is shown because this feature is not implemented in Phase 1A.
      </div>
    </Card>
  );
}
