import React from "react";
import { Icon } from "../../assets/icons/Icon.jsx";

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
  return (
    <span className={cls} onClick={onClick} {...rest}>
      {icon && <Icon name={icon} size={10} />}
      <span>{children}</span>
      {kind === "input" && (
        <span className="neon-chip__close" onClick={e => { e.stopPropagation(); onRemove && onRemove(); }}>
          <Icon name="Close" size={8} />
        </span>
      )}
    </span>
  );
}
export default Chip;
