function ProfileAvatar({ name = "Customer", email = "", compact = false, avatarOnly = false, size, className = "", nameClassName = "", emailClassName = "" }) {
  const displayName = String(name || "Customer").trim() || "Customer";
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const initials = (nameParts.length > 1
    ? `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`
    : nameParts[0].slice(0, 2)
  ).toUpperCase();
  const avatarSize = size || (compact ? "sm" : "md");
  const sizeClass = {
    sm: "h-8 w-8 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-28 w-28 text-4xl",
    profile: "h-[84px] w-[84px] text-[26px]",
  }[avatarSize] || "h-9 w-9 text-sm";
  const avatarClass = `inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-700 to-amber-600 font-black text-white shadow-sm ${sizeClass} ${className}`;

  if (avatarOnly) {
    return <span role="img" aria-label={`${displayName} avatar`} className={avatarClass}>{initials}</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className={avatarClass}>
        {initials}
      </span>
      <div className="min-w-0">
        <div className={`truncate font-semibold ${nameClassName || "text-slate-900"}`}>{displayName}</div>
        {email && <div className={`truncate text-xs ${emailClassName || "text-slate-500"}`}>{email}</div>}
      </div>
    </div>
  );
}

export default ProfileAvatar;
