import React from "react";
import { Icon } from "../../assets/icons/Icon.jsx";

/** Neon section header — a collapsible list section title with count + actions. */
export function SectionHeader({ title, count, open = true, collapsible = true, onToggle, actions, className = "", ...rest }) {
  return (
    <div className={["neon", "neon-section-header", open ? "neon-section-header--open" : "", className].filter(Boolean).join(" ")}
      onClick={() => collapsible && onToggle && onToggle(!open)} {...rest}>
      {collapsible && <span className="neon-section-header__chevron"><Icon name="ChevronRight" size={8} /></span>}
      <span className="neon-section-header__title">{title}</span>
      {count != null && <span className="neon-section-header__count">{count}</span>}
      {actions && <span className="neon-section-header__actions" onClick={e => e.stopPropagation()}>{actions}</span>}
    </div>
  );
}
export default SectionHeader;
