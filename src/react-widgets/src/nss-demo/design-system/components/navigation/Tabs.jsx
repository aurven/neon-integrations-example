import React from "react";
import { Icon } from "../../assets/icons/Icon.jsx";

/**
 * Neon Tabs. items: [{ value, label, icon? }]
 * variant "primary" = filled blue selected pill; "line" = underline indicator.
 */
export function Tabs({ items = [], value, onChange, variant = "primary", className = "", ...rest }) {
  return (
    <div className={["neon", "neon-tabs", variant === "line" ? "neon-tabs--line" : "", className].filter(Boolean).join(" ")} role="tablist" {...rest}>
      {items.map(it => (
        <button key={it.value} type="button" role="tab" aria-selected={it.value === value}
          className={"neon-tab" + (it.value === value ? " neon-tab--selected" : "")}
          disabled={it.disabled}
          onClick={() => onChange && onChange(it.value)}>
          {it.icon && <Icon className="neon-icon" name={it.icon} size={12} />}
          {it.label && <span>{it.label}</span>}
        </button>
      ))}
    </div>
  );
}
export default Tabs;
