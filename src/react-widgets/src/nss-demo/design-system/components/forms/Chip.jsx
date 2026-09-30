import React from "react";
import { X } from "lucide-react";

/**
 * Neon Chip — three kinds:
 *  - "filter": toggleable pill (active = brand blue)
 *  - "input": removable token (× to remove)
 *  - "info": semantic colored tag (set `color`)
 */
export function Chip({
  kind = "info", color = "grey", active = false, icon, onRemove, onClick, children, className = "", ...rest
}) {
  const cls = ["neon", "neon-chip", `neon-chip--${kind}`,
    kind === "filter" && active ? "neon-chip--active" : "",
    kind === "info" ? `neon-chip--${color}` : "",
    className].filter(Boolean).join(" ");
  const IconComp = icon;
  return (
    <span className={cls} onClick={onClick} {...rest}>
      {IconComp && <IconComp size={10} />}
      <span>{children}</span>
      {kind === "input" && (
        <span className="neon-chip__close" onClick={e => { e.stopPropagation(); onRemove && onRemove(); }}>
          <X size={8} />
        </span>
      )}
    </span>
  );
}
export default Chip;
