import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type PlaceholderSectionProps = {
  title: string;
  description: string;
  iconTone?: "green" | "olive" | "accent";
};

export function PlaceholderSection({
  title,
  description,
  iconTone = "green",
}: PlaceholderSectionProps) {
  const iconClass =
    iconTone === "accent"
      ? "placeholder-icon-accent"
      : iconTone === "olive"
        ? "placeholder-icon-olive"
        : "";

  return (
    <Card className="placeholder-card">
      <div className="placeholder-top">
        <div className="min-w-0">
          <div className="placeholder-title-row">
            <span
              className={`placeholder-icon ${iconClass}`}
              aria-hidden="true"
            />
            <h2 className="heading-section text-lg">{title}</h2>
          </div>
          <p className="text-secondary mt-3 text-sm leading-6">{description}</p>
        </div>
        <Badge>Planned</Badge>
      </div>
      <div className="placeholder-empty">
        <div className="empty-state text-sm">
          No data is shown because this feature is not implemented in Phase 1A.
        </div>
      </div>
    </Card>
  );
}
