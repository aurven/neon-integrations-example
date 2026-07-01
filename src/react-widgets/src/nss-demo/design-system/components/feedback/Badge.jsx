import React from "react";

/** Small count/dot badge or a status dot with label. */
export function Badge({ children, color = "product", dot = false, className = "", ...rest }) {
  const colorCls = { red: "neon-badge--red", green: "neon-badge--green", yellow: "neon-badge--yellow", grey: "neon-badge--grey", product: "" }[color] || "";
  return (
    <span className={["neon", "neon-badge", dot ? "neon-badge--dot" : "", colorCls, className].filter(Boolean).join(" ")} {...rest}>
      {!dot && children}
    </span>
  );
}

/** WF-style status: colored dot + label. color = a feedback CSS color. */
export function StatusDot({ label, color = "var(--color-background-feedback-green)", className = "", ...rest }) {
  return (
    <span className={["neon", "neon-status", className].filter(Boolean).join(" ")} {...rest}>
      <span className="neon-status__dot" style={{ background: color }} />
      {label && <span>{label}</span>}
    </span>
  );
}
export default Badge;
