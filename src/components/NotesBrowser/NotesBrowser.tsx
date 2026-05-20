import { useState, useEffect, useRef, useMemo } from "react";
import { useAppStore } from "../../stores/appStore";
import { extractTitle } from "../../lib/utils";
import NoteItem from "./NoteItem";

interface NotesBrowserProps {
  open: boolean;
  onClose: () => void;
  defaultSearch?: string;
}

export default function NotesBrowser({ open, onClose, defaultSearch = "" }: NotesBrowserProps) {
  const [search, setSearch] = useState(defaultSearch);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { notes, currentNote, switchToNote, createNote, deleteNote, togglePin } =
    useAppStore();

  // Sync search when defaultSearch changes (e.g. "Filter by Tag")
  useEffect(() => {
    setSearch(defaultSearch);
  }, [defaultSearch]);

  // Reset search and focus input whenever the panel opens.
  useEffect(() => {
    if (open) {
      setSearch(defaultSearch);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    }
  }, [open, defaultSearch]);

  const visibleNotes = useMemo(
    () => (notes.length === 0 && currentNote ? [currentNote] : notes),
    [notes, currentNote],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return visibleNotes;
    const q = search.toLowerCase();
    return visibleNotes.filter((n) => {
      const title = extractTitle(n.content).toLowerCase();
      const content = n.content.toLowerCase();
      return (
        title.includes(q) ||
        content.includes(q) ||
        (n.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [visibleNotes, search]);

  // Choose a default selected note for keyboard navigation
  useEffect(() => {
    if (!open) return;
    if (filtered.length === 0) {
      setSelectedIndex(-1);
      return;
    }

    if (!search.trim()) {
      const idx = currentNote
        ? filtered.findIndex((n) => n.id === currentNote.id)
        : -1;
      setSelectedIndex(idx >= 0 ? idx : 0);
      return;
    }

    setSelectedIndex((i) => Math.max(0, Math.min(i, filtered.length - 1)));
  }, [open, filtered, currentNote?.id, search]);

  // Keep selected row visible while navigating with arrows
  useEffect(() => {
    if (!open || selectedIndex < 0) return;
    const selected = listRef.current?.querySelector<HTMLElement>(
      `[data-note-index="${selectedIndex}"]`,
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex, filtered.length]);

  // Keyboard handling
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      if (key === "escape") {
        e.preventDefault();
        onClose();
      }

      if (key === "arrowdown") {
        if (filtered.length === 0) return;
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }

      if (key === "arrowup") {
        if (filtered.length === 0) return;
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }

      if (key === "enter") {
        const selected = filtered[selectedIndex];
        if (!selected) return;
        e.preventDefault();
        switchToNote(selected.id);
        onClose();
      }

      if (mod && (key === "n" || e.code === "KeyN")) {
        e.preventDefault();
        createNote().then(() => onClose());
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    open,
    onClose,
    createNote,
    filtered,
    selectedIndex,
    switchToNote,
  ]);

  if (!open) return null;

  return (
    <div className="animate-overlay-in absolute inset-0 z-50 flex flex-col bg-[#232323]/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-white/8 px-4 pb-3 pt-14">
        {/* Search */}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for notes..."
          className="w-full rounded-lg bg-white/8 px-3 py-2 text-sm text-[#E5E5E7] placeholder-[#E5E5E7]/30 outline-none focus:bg-white/10"
        />
        {/* Count */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#E5E5E7]/40">
            {filtered.length}/{visibleNotes.length} Notes
          </span>
        </div>
      </div>

      {/* Notes list */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-1 py-1">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#E5E5E7]/30">
            No notes found
          </p>
        ) : (
          filtered.map((note, index) => (
            <div
              key={note.id}
              data-note-index={index}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <NoteItem
                note={note}
                isCurrent={note.id === currentNote?.id}
                isHighlighted={index === selectedIndex}
                onSelect={() => {
                  switchToNote(note.id);
                  onClose();
                }}
                onPin={() => togglePin(note.id)}
                onDelete={() => deleteNote(note.id)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
