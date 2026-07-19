import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "success" | "warning" | "neutral";

const toneClasses: Record<BadgeTone, string> = {
  success: "badge-success",
  warning: "badge-warning",
  neutral: "badge-neutral",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span className={cn("badge", toneClasses[tone], className)} {...props} />
  );
}
