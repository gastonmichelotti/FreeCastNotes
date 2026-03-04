import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";

interface TableBubbleMenuProps {
  editor: Editor;
}

export default function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const update = () => {
      if (!editor.isActive("table")) {
        setRect(null);
        return;
      }

      // Walk up the ProseMirror node tree to find the table position
      const { $from } = editor.state.selection;
      let tablePos = -1;
      for (let depth = $from.depth; depth >= 0; depth--) {
        if ($from.node(depth).type.name === "table") {
          tablePos = $from.before(depth);
          break;
        }
      }
      if (tablePos === -1) {
        setRect(null);
        return;
      }

      const tableDOM = editor.view.nodeDOM(tablePos);
      if (tableDOM instanceof Element) {
        setRect(tableDOM.getBoundingClientRect());
      }
    };

    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  if (!rect) return null;

  const toolbarWidth = 300;
  const left = Math.max(8, rect.left + rect.width / 2 - toolbarWidth / 2);

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: Math.max(8, rect.top - 48),
        left,
        width: toolbarWidth,
        zIndex: 50,
      }}
    >
      <div className="flex items-center justify-center gap-0.5 rounded-[20px] border border-white/15 bg-[#2A2B30] px-1.5 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
        <TableMenuBtn
          onClick={() => editor.chain().focus().addRowBefore().run()}
          tooltip="Add row above"
        >
          <RowBeforeIcon />
        </TableMenuBtn>
        <TableMenuBtn
          onClick={() => editor.chain().focus().addRowAfter().run()}
          tooltip="Add row below"
        >
          <RowAfterIcon />
        </TableMenuBtn>
        <TableMenuBtn
          onClick={() => editor.chain().focus().deleteRow().run()}
          tooltip="Delete row"
          danger
        >
          <RowDeleteIcon />
        </TableMenuBtn>

        <div className="mx-1 h-4 w-px bg-white/15" />

        <TableMenuBtn
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          tooltip="Add column left"
        >
          <ColBeforeIcon />
        </TableMenuBtn>
        <TableMenuBtn
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          tooltip="Add column right"
        >
          <ColAfterIcon />
        </TableMenuBtn>
        <TableMenuBtn
          onClick={() => editor.chain().focus().deleteColumn().run()}
          tooltip="Delete column"
          danger
        >
          <ColDeleteIcon />
        </TableMenuBtn>

        <div className="mx-1 h-4 w-px bg-white/15" />

        <TableMenuBtn
          onClick={() => editor.chain().focus().deleteTable().run()}
          tooltip="Delete table"
          danger
        >
          <TableDeleteIcon />
        </TableMenuBtn>
      </div>
    </div>,
    document.body,
  );
}

function TableMenuBtn({
  onClick,
  tooltip,
  danger = false,
  children,
}: {
  onClick: () => void;
  tooltip: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onClick();
        }}
        className={`flex h-[28px] w-[28px] items-center justify-center rounded-[10px] transition-all ${
          danger
            ? "text-[#d2d2d4]/70 hover:bg-red-500/20 hover:text-red-400"
            : "text-[#d2d2d4]/80 hover:bg-white/10 hover:text-[#f1f1f3]"
        }`}
      >
        {children}
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-100 group-hover:translate-y-0 group-hover:opacity-100">
        <div className="whitespace-nowrap rounded-xl border border-white/15 bg-[#303136] px-2.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.5)]">
          <span className="text-[12px] font-semibold text-[#f3f3f5]">{tooltip}</span>
        </div>
      </div>
    </div>
  );
}

function RowBeforeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="8" width="13" height="6.5" rx="1.5" />
      <path d="M8 1.5v5" />
      <path d="M5.5 4h5" />
    </svg>
  );
}

function RowAfterIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="13" height="6.5" rx="1.5" />
      <path d="M8 9.5v5" />
      <path d="M5.5 12h5" />
    </svg>
  );
}

function RowDeleteIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="13" height="6.5" rx="1.5" />
      <path d="m6 11 4 4" />
      <path d="m10 11-4 4" />
    </svg>
  );
}

function ColBeforeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="1.5" width="6.5" height="13" rx="1.5" />
      <path d="M3.5 8h4.5" />
      <path d="M3.5 6v4" />
    </svg>
  );
}

function ColAfterIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="6.5" height="13" rx="1.5" />
      <path d="M8 8h4.5" />
      <path d="M12.5 6v4" />
    </svg>
  );
}

function ColDeleteIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="6.5" height="13" rx="1.5" />
      <path d="m10 10 4 4" />
      <path d="m14 10-4 4" />
    </svg>
  );
}

function TableDeleteIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" />
      <path d="M1.5 5.5h13" />
      <path d="M5.5 5.5v9" />
      <path d="m8.5 8.5 3 3" />
      <path d="m11.5 8.5-3 3" />
    </svg>
  );
}
