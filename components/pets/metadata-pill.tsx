import type { ReactNode } from "react";
import { OutlineIcon, type IconName } from "@/components/ui/outline-icon";

export function MetadataPill({
  icon,
  children,
}: {
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <span className="pet-metadata-pill">
      <OutlineIcon name={icon} />
      {children}
    </span>
  );
}
