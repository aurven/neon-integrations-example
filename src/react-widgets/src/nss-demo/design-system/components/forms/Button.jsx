import React from "react";
import { Icon } from "../../assets/icons/Icon.jsx";

const ICON_SIZE = { sm: 10, md: 12, lg: 12 };

/**
 * Neon Button — the primary interactive control.
 * Variants: primary | secondary | tertiary | ghost | hyperlink | inline | whiteGhost
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,            // icon name shown before the label (or the only icon when iconOnly)
  iconRight,       // icon name shown after the label
  iconOnly = false,
  disabled = false,
  className = "",
  ...rest
}) {
  const cls = [
    "neon", "neon-btn",
    `neon-btn--${variant}`,
    `neon-btn--${size}`,
    iconOnly ? "neon-btn--iconOnly" : "",
    className,
  ].filter(Boolean).join(" ");
  const s = ICON_SIZE[size] || 12;
  return (
    <button type="button" className={cls} disabled={disabled} {...rest}>
      {icon && <Icon className="neon-icon" name={icon} size={s} />}
      {!iconOnly && children != null && <span>{children}</span>}
      {!iconOnly && iconRight && <Icon className="neon-icon" name={iconRight} size={s} />}
    </button>
  );
}

export default Button;
