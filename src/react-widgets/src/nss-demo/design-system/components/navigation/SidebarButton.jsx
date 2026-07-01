import React from "react";
import { Icon } from "../../assets/icons/Icon.jsx";

/** Neon sidebar rail button (icon-only, selectable). */
export function SidebarButton({ icon, selected = false, "aria-label": ariaLabel, className = "", ...rest }) {
  return (
    <button type="button" aria-label={ariaLabel} aria-pressed={selected}
      className={["neon", "neon-sidebar-btn", selected ? "neon-sidebar-btn--selected" : "", className].filter(Boolean).join(" ")} {...rest}>
      <Icon name={icon} size={16} />
    </button>
  );
}
export default SidebarButton;
