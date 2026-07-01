import React from "react";

/** Neon form label. Sits above inputs with a 5px gap. */
export function Label({ children, required = false, disabled = false, htmlFor, className = "", ...rest }) {
  const cls = ["neon", "neon-label", disabled ? "neon-label--disabled" : "", className].filter(Boolean).join(" ");
  return (
    <label className={cls} htmlFor={htmlFor} {...rest}>
      {children}
      {required && <span className="neon-label__req">*</span>}
    </label>
  );
}
export default Label;
