import React from "react";
import { Icon } from "../../assets/icons/Icon.jsx";
import { Label } from "./Label.jsx";

/**
 * Neon text input. Optional leading icon, clear button, label, and error.
 */
export function TextField({
  label, required, size = "md", icon, value, onChange, placeholder,
  error, disabled = false, clearable = false, id, className = "", inputProps = {}, ...rest
}) {
  const wrapCls = [
    "neon", "neon-input",
    size !== "md" ? `neon-input--${size}` : "",
    error ? "neon-input--error" : "",
    disabled ? "neon-input--disabled" : "",
  ].filter(Boolean).join(" ");
  const iconSize = size === "sm" ? 10 : 12;
  return (
    <div className={["neon", "neon-field", className].filter(Boolean).join(" ")} {...rest}>
      {label && <Label htmlFor={id} required={required} disabled={disabled}>{label}</Label>}
      <div className={wrapCls}>
        {icon && <span className="neon-input__icon"><Icon name={icon} size={iconSize} /></span>}
        <input
          id={id}
          className="neon-input__control"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          {...inputProps}
        />
        {clearable && value ? (
          <button type="button" className="neon-input__clear" aria-label="Clear"
            onClick={() => onChange && onChange({ target: { value: "" } })}>
            <Icon name="Close" size={12} />
          </button>
        ) : null}
      </div>
      {error && <span className="neon-error"><Icon name="Error" size={12} />{error}</span>}
    </div>
  );
}
export default TextField;
