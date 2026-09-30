import React from "react";

const ICON_SIZE = { sm: 10, md: 12, lg: 12 };

/**
 * Neon Button — the primary interactive control.
 * Variants: primary | secondary | tertiary | ghost | hyperlink | inline | whiteGhost
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,            // icon component shown before the label (or the only icon when iconOnly)
  iconRight,       // icon component shown after the label
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
  const IconComp = icon;
  const IconRightComp = iconRight;
  return (
    <button type="button" className={cls} disabled={disabled} {...rest}>
      {IconComp && <IconComp className="neon-icon" size={s} />}
      {!iconOnly && children != null && <span>{children}</span>}
      {!iconOnly && IconRightComp && <IconRightComp className="neon-icon" size={s} />}
    </button>
  );
}

export default Button;
