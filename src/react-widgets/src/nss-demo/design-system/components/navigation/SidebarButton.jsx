import React from "react";

/** Neon sidebar rail button (icon-only, selectable). */
export function SidebarButton({ icon, selected = false, "aria-label": ariaLabel, className = "", ...rest }) {
  const IconComp = icon;
  return (
    <button type="button" aria-label={ariaLabel} aria-pressed={selected}
      className={["neon", "neon-sidebar-btn", selected ? "neon-sidebar-btn--selected" : "", className].filter(Boolean).join(" ")} {...rest}>
      <IconComp size={16} />
    </button>
  );
}
export default SidebarButton;
