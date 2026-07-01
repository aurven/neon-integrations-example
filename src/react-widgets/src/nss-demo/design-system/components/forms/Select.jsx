import React from "react";
import { Icon } from "../../assets/icons/Icon.jsx";
import { Label } from "./Label.jsx";

/**
 * Neon Select (dropdown). Controlled via value/onChange.
 * options: [{ value, label, icon? }]
 */
export function Select({
  label, required, size = "md", value, onChange, options = [], placeholder = "Select…",
  disabled = false, error, id, className = "", ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const selected = options.find(o => o.value === value);
  const wrapCls = ["neon", "neon-input", size !== "md" ? `neon-input--${size}` : "", open ? "neon-select--open" : "", error ? "neon-input--error" : "", disabled ? "neon-input--disabled" : ""].filter(Boolean).join(" ");
  return (
    <div className={["neon", "neon-field", className].filter(Boolean).join(" ")} ref={ref} {...rest}>
      {label && <Label htmlFor={id} required={required} disabled={disabled}>{label}</Label>}
      <div className="neon-select" style={{ position: "relative" }}>
        <div className={wrapCls} role="button" tabIndex={disabled ? -1 : 0} id={id}
          onClick={() => !disabled && setOpen(o => !o)}
          onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !disabled) { e.preventDefault(); setOpen(o => !o); } }}>
          {selected?.icon && <span className="neon-input__icon"><Icon name={selected.icon} size={12} /></span>}
          <span className={"neon-select__value" + (selected ? "" : " neon-select__value--placeholder")}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="neon-select__chevron"><Icon name="ChevronBottom" size={12} /></span>
        </div>
        {open && (
          <div className="neon-menu" role="listbox">
            {options.map(o => (
              <div key={o.value} role="option" aria-selected={o.value === value}
                className={"neon-option" + (o.value === value ? " neon-option--selected" : "") + (o.disabled ? " neon-option--disabled" : "")}
                onClick={() => { if (!o.disabled) { onChange && onChange(o.value); setOpen(false); } }}>
                {o.icon && <span className="neon-option__icon"><Icon name={o.icon} size={12} /></span>}
                <span>{o.label}</span>
                {o.value === value && <span className="neon-option__check"><Icon name="Check" size={12} /></span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {error && <span className="neon-error">{error}</span>}
    </div>
  );
}
export default Select;
