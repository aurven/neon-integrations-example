import React from "react";
import { Icon } from "../../assets/icons/Icon.jsx";

/** Neon modal dialog. Render conditionally on `open`. */
export function Modal({ open = true, title, onClose, footer, children, width, className = "", ...rest }) {
  if (!open) return null;
  return (
    <div className="neon neon-modal-backdrop" onClick={onClose}>
      <div className={["neon-modal", className].filter(Boolean).join(" ")} style={{ maxWidth: width }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" {...rest}>
        {title && (
          <div className="neon-modal__header">
            <span className="neon-modal__title">{title}</span>
            {onClose && (
              <button className="neon-btn neon-btn--ghost neon-btn--md neon-btn--iconOnly" aria-label="Close" onClick={onClose}>
                <Icon name="Close" size={12} />
              </button>
            )}
          </div>
        )}
        <div className="neon-modal__body">{children}</div>
        {footer && <div className="neon-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
export default Modal;
