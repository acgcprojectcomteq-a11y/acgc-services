import { getPasswordStrength } from "@/lib/passwordStrength";

export default function PasswordStrengthMeter({ password = "", darkMode = false }) {
  if (!password) return null;

  const strength = getPasswordStrength(password);

  return (
    <div className="mt-2" aria-live="polite">
      <div
        className={`h-1.5 w-3/4 overflow-hidden rounded-full ${darkMode ? "bg-slate-700" : "bg-slate-200"}`}
        role="progressbar"
        aria-label="Password strength"
        aria-valuemin="0"
        aria-valuemax="4"
        aria-valuenow={strength.score}
      >
        <span
          className="block h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${strength.score * 25}%`, backgroundColor: strength.color }}
        />
      </div>
      <p className="mt-1 text-xs font-semibold transition-colors duration-300" style={{ color: strength.color }}>
        {strength.label} password
      </p>
    </div>
  );
}
