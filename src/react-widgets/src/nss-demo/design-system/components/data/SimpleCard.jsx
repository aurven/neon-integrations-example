import React from "react";

/** Simple content card — a lightweight surface with soft shadow. */
export function SimpleCard({ children, flat = false, className = "", ...rest }) {
  return <div className={["neon", "neon-simple", flat ? "neon-simple--flat" : "", className].filter(Boolean).join(" ")} {...rest}>{children}</div>;
}
export default SimpleCard;
