import { useRef, useState } from "react";
import { useAppStore } from "../../stores/appStore";

interface TagBarProps {
  /** Inline in toolbar: compact, single row */
  inline?: boolean;
}

export default function TagBar({ inline = false }: TagBarProps) {
  const { currentNote, updateNoteTags } = useAppStore();
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!currentNote) return null;

  const tags = currentNote.tags ?? [];

  function showInput() {
    setInputVisible(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function confirmTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag || !currentNote) return;
    if (!tags.includes(tag)) {
      updateNoteTags(currentNote.id, [...tags, tag]);
    }
    setInputValue("");
    setInputVisible(false);
  }

  function removeTag(tag: string) {
    if (!currentNote) return;
    updateNoteTags(
      currentNote.id,
      tags.filter((t) => t !== tag),
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      confirmTag(inputValue);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInputValue("");
      setInputVisible(false);
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${inline ? "" : "px-6 pb-2 pt-1"}`}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-[3px] text-[11px] text-[#E5E5E7]/80"
        >
          <TagIcon />
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="ml-0.5 text-[#E5E5E7]/35 transition-colors hover:text-[#E5E5E7]/80"
            title={`Remove "${tag}"`}
          >
            ×
          </button>
        </span>
      ))}

      {inputVisible ? (
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) confirmTag(inputValue);
            else setInputVisible(false);
          }}
          placeholder="tag name..."
          className="h-[22px] w-28 rounded-full border border-white/20 bg-white/8 px-3 text-[11px] text-[#E5E5E7] placeholder-[#E5E5E7]/30 outline-none"
        />
      ) : (
        <button
          onClick={showInput}
          className="flex items-center gap-1 rounded-full border border-dashed border-white/15 px-2.5 py-[3px] text-[11px] text-[#E5E5E7]/35 transition-colors hover:border-white/25 hover:text-[#E5E5E7]/60"
        >
          + tag
        </button>
      )}
    </div>
  );
}

function TagIcon() {
  return (
    <svg
      className="h-2.5 w-2.5 shrink-0 opacity-50"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M2 2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 0 1.414l-3.586 3.586a1 1 0 0 1-1.414 0L3.293 7.293A1 1 0 0 1 3 6.586V3a1 1 0 0 0-1-1zm3.5 3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
    </svg>
  );
}
