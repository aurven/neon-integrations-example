import React from "react";
import { Icon } from "../../assets/icons/Icon.jsx";

/**
 * Neon toggle group — segmented control.
 * items: [{ value, label?, icon? }]
 */
export function ToggleGroup({ items = [], value, onChange, className = "", ...rest }) {
  return (
    <div className={["neon", "neon-toggle-group", className].filter(Boolean).join(" ")} role="tablist" {...rest}>
      {items.map(it => (
        <button key={it.value} type="button"
          className={"neon-toggle-btn" + (it.value === value ? " neon-toggle-btn--active" : "")}
          aria-pressed={it.value === value}
          onClick={() => onChange && onChange(it.value)}>
          {it.icon && <Icon name={it.icon} size={12} />}
          {it.label && <span>{it.label}</span>}
        </button>
      ))}
    </div>
  );
}
export default ToggleGroup;
