import React from "react";

/** Neon horizontal progress bar. Omit value for indeterminate. */
export function ProgressBar({ value, size = "md", className = "", ...rest }) {
  const indeterminate = value == null;
  const cls = ["neon", "neon-progress", size === "sm" ? "neon-progress--sm" : "", indeterminate ? "neon-progress--indeterminate" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} role="progressbar" aria-valuenow={indeterminate ? undefined : value} aria-valuemin={0} aria-valuemax={100} {...rest}>
      <div className="neon-progress__fill" style={{ width: indeterminate ? undefined : `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
export default ProgressBar;
