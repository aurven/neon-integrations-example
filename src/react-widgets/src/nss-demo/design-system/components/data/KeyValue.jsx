import React from "react";
/** Metadata key/value row. */
export function KeyValue({ label, children, className = "", ...rest }) {
  return (
    <div className={["neon", "neon-kv", className].filter(Boolean).join(" ")} {...rest}>
      <span className="neon-kv__k">{label}</span>
      <span className="neon-kv__v">{children}</span>
    </div>
  );
}
export default KeyValue;
