import React from "react";

/** Neon card surface. */
export function Card({ children, variant = "bordered", interactive = false, selected = false, className = "", ...rest }) {
  const cls = ["neon", "neon-card",
    variant === "raised" ? "neon-card--raised" : variant === "flat" ? "" : "neon-card--bordered",
    interactive ? "neon-card--interactive" : "",
    selected ? "neon-card--selected" : "", className].filter(Boolean).join(" ");
  return <div className={cls} {...rest}>{children}</div>;
}
export default Card;
