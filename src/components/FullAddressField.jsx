import { getFullAddressError, normalizeFullAddress, FULL_ADDRESS_MAX_LENGTH } from "@/lib/fullAddressValidation";

export default function FullAddressField({
  label,
  icon: Icon,
  value = "",
  validationValue,
  countValue,
  onChange,
  onBlur,
  as = "input",
  rows = 3,
  className = "",
  labelClassName = "",
  helperClassName = "",
  showError = true,
  ...props
}) {
  const address = String(value ?? "");
  const trimmedAddress = normalizeFullAddress(countValue ?? address);
  const validationError = getFullAddressError(validationValue ?? address);
  const Component = as;
  const iconPadding = Icon ? "pl-11" : "";

  return (
    <div className="min-w-0">
      {label && <label htmlFor={props.id || props.name} className={`mb-1 block text-xs font-semibold ${labelClassName}`}>{label}</label>}
      <div className="relative">
        {Icon && <Icon size={18} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-3 text-slate-400" aria-hidden="true" />}
        <Component
          {...props}
          id={props.id || props.name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          maxLength={FULL_ADDRESS_MAX_LENGTH}
          aria-invalid={showError && Boolean(validationError)}
          aria-describedby={`${props.id || props.name}-address-help`}
          rows={as === "textarea" ? rows : undefined}
          className={`${className} ${iconPadding}`}
        />
      </div>
      <div id={`${props.id || props.name}-address-help`} className={`mt-1 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs ${helperClassName}`}>
        <span className={showError && validationError ? "text-red-600" : "text-slate-500"}>
          {showError && validationError ? validationError : "Enter 50-100 characters."}
        </span>
        <span className="shrink-0 text-slate-500" aria-live="polite">{trimmedAddress.length}/{FULL_ADDRESS_MAX_LENGTH}</span>
      </div>
    </div>
  );
}
