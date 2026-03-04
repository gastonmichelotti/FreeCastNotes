import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { Editor } from "@tiptap/react";
import { bridge } from "../../lib/bridge";

interface FormatBarProps {
  editor: Editor | null;
  chromeActive?: boolean;
}

export default function FormatBar({
  editor,
  chromeActive = true,
}: FormatBarProps) {
  const [visible, setVisible] = useState(true);
  const [headingOpen, setHeadingOpen] = useState(false);
  const headingMenuRef = useRef<HTMLDivElement | null>(null);

  // Toggle only via custom event (App handles ⌥⌘, and dispatches this; Action Panel also dispatches it)
  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("toggle-format-bar", onToggle);
    return () => window.removeEventListener("toggle-format-bar", onToggle);
  }, []);

  // Force re-render on editor selection/transaction changes
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const update = () => setTick((t) => t + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  // Close heading menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!headingOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!headingMenuRef.current?.contains(target)) {
        setHeadingOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHeadingOpen(false);
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [headingOpen]);

  const run = useCallback(
    (cmd: () => boolean) => {
      cmd();
      editor?.commands.focus();
    },
    [editor],
  );

  if (!visible || !editor) return null;

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);

  const headingItems = [
    { level: 1 as const, label: "Heading 1", shortcut: ["⌥", "⌘", "1"] },
    { level: 2 as const, label: "Heading 2", shortcut: ["⌥", "⌘", "2"] },
    { level: 3 as const, label: "Heading 3", shortcut: ["⌥", "⌘", "3"] },
  ];

  return (
    <div
      data-format-bar
      className={`relative flex h-12 shrink-0 items-center border-t border-white/7 bg-[#232323] px-2 transition-opacity duration-180 ${
        chromeActive ? "opacity-100" : "opacity-38"
      }`}
    >
      <div className="mx-auto flex items-center gap-0.5">
        {/* Heading dropdown */}
        <div ref={headingMenuRef} className="relative">
          <FormatBtn
            icon={<HeadingIcon />}
            active={isActive("heading")}
            onClick={() => setHeadingOpen((o) => !o)}
            tooltip="Headings"
            shortcut={["⌥", "⌘", "1-3"]}
          />
          {headingOpen && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-[24px] border border-white/15 bg-[#2F3035] p-2 shadow-[0_16px_32px_rgba(0,0,0,0.58)]">
              {headingItems.map(({ level, label, shortcut }) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => {
                    run(() =>
                      editor.chain().focus().toggleHeading({ level }).run(),
                    );
                    setHeadingOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-2.5 text-left transition-colors ${
                    isActive("heading", { level })
                      ? "bg-white/10 text-white"
                      : "text-white/90 hover:bg-white/8"
                  }`}
                >
                  <span className="text-[16px] leading-none font-semibold">
                    {label}
                  </span>
                  <ShortcutKeys keysList={shortcut} />
                </button>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Inline formats */}
        <FormatBtn
          icon={<span className="text-[17px] font-bold leading-none">B</span>}
          active={isActive("bold")}
          onClick={() => run(() => editor.chain().focus().toggleBold().run())}
          tooltip="Bold"
          shortcut={["⌘", "B"]}
        />
        <FormatBtn
          icon={
            <span className="text-[17px] leading-none italic font-medium">I</span>
          }
          active={isActive("italic")}
          onClick={() => run(() => editor.chain().focus().toggleItalic().run())}
          tooltip="Italic"
          shortcut={["⌘", "I"]}
        />
        <FormatBtn
          icon={
            <span className="text-[17px] leading-none line-through font-medium">
              S
            </span>
          }
          active={isActive("strike")}
          onClick={() => run(() => editor.chain().focus().toggleStrike().run())}
          tooltip="Strikethrough"
          shortcut={["⇧", "⌘", "S"]}
        />
        <FormatBtn
          icon={
            <span className="text-[17px] leading-none underline font-medium">
              U
            </span>
          }
          active={isActive("underline")}
          onClick={() =>
            run(() => editor.chain().focus().toggleUnderline().run())
          }
          tooltip="Underline"
          shortcut={["⌘", "U"]}
        />
        <FormatBtn
          icon={<InlineCodeIcon />}
          active={isActive("code")}
          onClick={() => run(() => editor.chain().focus().toggleCode().run())}
          tooltip="Inline code"
          shortcut={["⌘", "E"]}
        />
        <FormatBtn
          icon={<LinkIcon />}
          active={isActive("link")}
          onClick={() => {
            if (isActive("link")) {
              run(() => editor.chain().focus().unsetLink().run());
            } else {
              const url = window.prompt("URL:");
              if (url) {
                run(() =>
                  editor.chain().focus().setLink({ href: url }).run(),
                );
              }
            }
          }}
          tooltip="Link"
          shortcut={["⌘", "L"]}
        />

        <Separator />

        {/* Block formats */}
        <FormatBtn
          icon={<CodeBlockIcon />}
          active={isActive("codeBlock")}
          onClick={() =>
            run(() => editor.chain().focus().toggleCodeBlock().run())
          }
          tooltip="Code block"
          shortcut={["⌥", "⌘", "C"]}
        />
        <FormatBtn
          icon={<BulletedListIcon />}
          active={isActive("bulletList")}
          onClick={() =>
            run(() => editor.chain().focus().toggleBulletList().run())
          }
          tooltip="Bulleted list"
          shortcut={["⇧", "⌘", "8"]}
        />
        <FormatBtn
          icon={<NumberedListIcon />}
          active={isActive("orderedList")}
          onClick={() =>
            run(() => editor.chain().focus().toggleOrderedList().run())
          }
          tooltip="Numbered list"
          shortcut={["⇧", "⌘", "7"]}
        />
        <FormatBtn
          icon={<TaskListIcon />}
          active={isActive("taskList")}
          onClick={() =>
            run(() => editor.chain().focus().toggleTaskList().run())
          }
          tooltip="Task list"
          shortcut={["⇧", "⌘", "9"]}
        />
        <FormatBtn
          icon={<BlockquoteIcon />}
          active={isActive("blockquote")}
          onClick={() =>
            run(() => editor.chain().focus().toggleBlockquote().run())
          }
          tooltip="Blockquote"
          shortcut={["⇧", "⌘", "B"]}
        />

        <Separator />

        {/* Image insert */}
        <FormatBtn
          icon={<ImageIcon />}
          active={false}
          onClick={async () => {
            if (!editor) return;
            const src = await bridge.importImage();
            if (src) {
              editor.chain().focus().setImage({ src }).run();
            }
          }}
          tooltip="Insert image"
        />
        <FormatBtn
          icon={<TableIcon />}
          active={isActive("table")}
          onClick={() =>
            run(() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 2, withHeaderRow: true })
                .run(),
            )
          }
          tooltip="Insert table"
        />
      </div>

      {/* Close button */}
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        <div className="h-7 w-px bg-white/12" />
        <FormatBtn
          icon={<CloseIcon />}
          active={false}
          onClick={() => setVisible(false)}
          tooltip="Hide format bar"
          shortcut={["⌥", "⌘", ","]}
        />
      </div>
    </div>
  );
}

function FormatBtn({
  icon,
  active,
  onClick,
  tooltip,
  shortcut,
}: {
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  tooltip: string;
  shortcut?: string[];
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={`flex h-[34px] min-w-[34px] items-center justify-center rounded-[10px] px-2 transition-all ${
          active
            ? "bg-white/14 text-[#f5f5f7]"
            : "text-[#d2d2d4]/85 hover:bg-white/9 hover:text-[#f1f1f3]"
        }`}
      >
        {icon}
      </button>
      <Tooltip label={tooltip} shortcut={shortcut} />
    </div>
  );
}

function Separator() {
  return <div className="mx-1 h-6 w-px bg-white/9" />;
}

function Tooltip({
  label,
  shortcut,
}: {
  label: string;
  shortcut?: string[];
}) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
      <div className="flex items-center gap-2 whitespace-nowrap rounded-[18px] border border-white/18 bg-[#303136] px-3 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.55)]">
        <span className="text-[14px] font-semibold text-[#f3f3f5]">{label}</span>
        {shortcut && shortcut.length > 0 ? (
          <ShortcutKeys keysList={shortcut} compact />
        ) : null}
      </div>
    </div>
  );
}

function ShortcutKeys({
  keysList,
  compact,
}: {
  keysList: string[];
  compact?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      {keysList.map((key, idx) => (
        <kbd
          key={`${key}-${idx}`}
          className={`inline-flex min-w-7 items-center justify-center rounded-[10px] border border-white/4 bg-white/12 text-center font-semibold text-white/80 ${
            compact ? "px-2 py-1 text-[12px]" : "px-2 py-1 text-[11px]"
          }`}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

function HeadingIcon() {
  return (
    <span className="flex items-center gap-0.5">
      <span className="text-[17px] font-medium leading-none">H</span>
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3 text-current"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 6.5 8 11l4.5-4.5" />
      </svg>
    </span>
  );
}

function InlineCodeIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m8 5-5 5 5 5" />
      <path d="m12 5 5 5-5 5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m8 12 4-4" />
      <path d="M7 15H6a3.5 3.5 0 1 1 0-7h2" />
      <path d="M13 5h1a3.5 3.5 0 1 1 0 7h-2" />
    </svg>
  );
}

function CodeBlockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.6" y="2.6" width="14.8" height="14.8" rx="3" />
      <path d="m8.2 7.5-2.3 2.5 2.3 2.5" />
      <path d="m11.8 7.5 2.3 2.5-2.3 2.5" />
    </svg>
  );
}

function BulletedListIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="4" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="15" r="1" fill="currentColor" stroke="none" />
      <path d="M8 5h8" />
      <path d="M8 10h8" />
      <path d="M8 15h8" />
    </svg>
  );
}

function NumberedListIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.7 4.8h2.2" />
      <path d="M3.8 4.8v4" />
      <path d="M2.5 14h3" />
      <path d="M2.7 10.4h2.6l-2.6 3.6h2.6" />
      <path d="M8 5h8" />
      <path d="M8 10h8" />
      <path d="M8 15h8" />
    </svg>
  );
}

function TaskListIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 5.5 1.2 1.2 2.1-2.1" />
      <path d="m3 10.1 1.2 1.2 2.1-2.1" />
      <path d="m3 14.7 1.2 1.2 2.1-2.1" />
      <path d="M8 5h8" />
      <path d="M8 10h8" />
      <path d="M8 15h8" />
    </svg>
  );
}

function BlockquoteIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4v12" />
      <path d="M8 6h8" />
      <path d="M8 10h6" />
      <path d="M8 14h8" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <circle cx="7" cy="8" r="1.5" />
      <path d="M17.5 13.5 13 9l-6 6" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="M2.5 8h15" />
      <path d="M8.5 8v8.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="8.2" />
      <path d="m7.2 7.2 5.6 5.6" />
      <path d="m12.8 7.2-5.6 5.6" />
    </svg>
  );
}
