import React from "react";
/** Vertical icon rail container. Put SidebarButtons inside; `footer` pins to bottom. */
export function Sidebar({ side = "left", children, footer, className = "", ...rest }) {
  return (
    <nav className={["neon", "neon-rail", side === "right" ? "neon-rail--right" : "", className].filter(Boolean).join(" ")} {...rest}>
      {children}
      {footer && <div className="neon-rail__spacer">{footer}</div>}
    </nav>
  );
}
export default Sidebar;
