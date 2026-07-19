import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type AlertTone = "success" | "warning" | "error" | "info";

const toneClasses: Record<AlertTone, string> = {
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
  info: "alert-info",
};

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone;
};

export function Alert({ tone = "info", className, ...props }: AlertProps) {
  return (
    <div className={cn("alert", toneClasses[tone], className)} {...props} />
  );
}
