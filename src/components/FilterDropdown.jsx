import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export default function FilterDropdown({ label, value, options, onChange, darkMode = false, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedOption = options.find(([optionValue]) => optionValue === value);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!dropdownRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={`relative z-10 min-w-0 focus-within:z-50 ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm font-semibold outline-none transition focus:ring-2 ${darkMode ? "border-red-400/70 bg-slate-800 text-slate-200 hover:border-red-400 focus:border-red-400 focus:ring-red-400/20" : "border-red-300 bg-white text-slate-700 hover:border-red-400 focus:border-red-400 focus:ring-red-100"}`}
      >
        <span className="truncate">{selectedOption?.[1] || label}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          role="listbox"
          aria-label={label}
          className={`absolute inset-x-0 top-full z-[80] mt-1 max-h-60 overflow-y-auto rounded-2xl border p-1.5 shadow-xl ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}
        >
          {options.map(([optionValue, optionLabel]) => {
            const selected = value === optionValue;
            return (
              <button
                key={optionValue}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(optionValue);
                  setIsOpen(false);
                }}
                className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${selected ? darkMode ? "bg-red-950/50 font-semibold text-red-300" : "bg-rose-50 font-semibold text-red-700" : darkMode ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100"}`}
              >
                <span className="truncate">{optionLabel}</span>
                {selected && <Check size={16} className="shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
