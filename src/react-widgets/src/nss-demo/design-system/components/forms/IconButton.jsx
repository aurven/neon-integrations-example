import React from "react";
import { Button } from "./Button.jsx";

/** Square, icon-only Neon button. Always give an aria-label. */
export function IconButton({ icon, variant = "ghost", size = "md", "aria-label": ariaLabel, ...rest }) {
  return <Button variant={variant} size={size} iconOnly icon={icon} aria-label={ariaLabel} {...rest} />;
}
export default IconButton;
