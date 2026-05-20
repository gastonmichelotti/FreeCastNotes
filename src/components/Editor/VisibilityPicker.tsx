import type { NoteVisibility } from "../../types/index";

interface VisibilityPickerProps {
  value: NoteVisibility;
  onChange: (v: NoteVisibility) => void;
  editPermission?: boolean;
  onEditPermissionChange?: (enabled: boolean) => void;
  disabled?: boolean;
}

const OPTIONS: { value: NoteVisibility; label: string; description: string }[] = [
  { value: "private", label: "Private", description: "Only you can access this note" },
  { value: "unlisted", label: "Unlisted", description: "Accessible by link, not listed publicly" },
  { value: "public", label: "Public", description: "Listed and accessible by anyone" },
];

export default function VisibilityPicker({
  value,
  onChange,
  editPermission = false,
  onEditPermissionChange,
  disabled,
}: VisibilityPickerProps) {
  const isPublished = value !== "private";

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            title={opt.description}
            className={`rounded px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40 ${
              value === opt.value
                ? opt.value === "public"
                  ? "bg-green-500/20 text-green-400"
                  : opt.value === "unlisted"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-white/10 text-white/60"
                : "text-white/30 hover:text-white/50 hover:bg-white/5"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isPublished && onEditPermissionChange && (
        <label className="flex items-center gap-1 text-[11px] text-white/40 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={editPermission}
            disabled={disabled}
            onChange={(e) => onEditPermissionChange(e.target.checked)}
            className="w-3 h-3 disabled:opacity-40"
          />
          Allow web editing
        </label>
      )}
    </div>
  );
}
