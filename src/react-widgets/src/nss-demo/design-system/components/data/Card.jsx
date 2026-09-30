import React from "react";

/** Neon card surface. */
export function Card({ children, variant = "bordered", interactive = false, selected = false, className = "", onClick, onKeyDown, ...rest }) {
  const cls = ["neon", "neon-card",
    variant === "raised" ? "neon-card--raised" : variant === "flat" ? "" : "neon-card--bordered",
    interactive ? "neon-card--interactive" : "",
    selected ? "neon-card--selected" : "", className].filter(Boolean).join(" ");
  const interactiveProps = interactive ? {
    role: "button",
    tabIndex: 0,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (e.key === " ") e.preventDefault();
        onClick && onClick(e);
      }
      onKeyDown && onKeyDown(e);
    },
  } : { onKeyDown };
  return <div className={cls} onClick={onClick} {...interactiveProps} {...rest}>{children}</div>;
}
export default Card;
