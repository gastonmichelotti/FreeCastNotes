import { useState, type ReactNode } from "react";
import { bridge } from "../../lib/bridge";

interface ToolbarProps {
  title?: string;
  chromeActive?: boolean;
  onBrowse?: () => void;
  onNewNote?: () => void;
  onActionPanel?: () => void;
  onToggleTagBar?: () => void;
  tagBarVisible?: boolean;
  children?: ReactNode;
}

export default function Toolbar({
  title = "Untitled",
  chromeActive = true,
  onBrowse,
  onNewNote,
  onActionPanel,
  onToggleTagBar,
  tagBarVisible = false,
  children,
}: ToolbarProps) {
  const [hovering, setHovering] = useState(false);

  return (
    <div
      className={`shrink-0 border-b border-white/7 bg-[#232323] transition-opacity duration-180 ${
        chromeActive ? "opacity-100" : "opacity-38"
      }`}
    >
      <div
        data-drag-region
        className="relative flex h-12 items-center justify-between px-3"
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("button") || target.closest("[data-no-drag]")) return;
          e.preventDefault();
          window.swiftBridge?.postMessage("startWindowDrag", {});
        }}
      >
        {/* Close button */}
        <div
          className="relative z-10 flex items-center"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <TrafficLight
            color="#FF5F57"
            hoverIcon="×"
            hovering={hovering}
            onClick={() => bridge.hideWindow()}
          />
        </div>

        {/* Title centered */}
        <div
          data-drag-region
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <span
            data-drag-region
            className="pointer-events-none text-sm font-semibold tracking-[0.01em] text-[#E5E5E7]/58"
          >
            {title}
          </span>
        </div>

        {/* Right buttons */}
        <div className="relative z-10 flex items-center gap-0.5">
          <ToolbarButton
            icon={<TagIcon />}
            onClick={() => onToggleTagBar?.()}
            title="Toggle Tags"
            active={tagBarVisible}
          />
          <ToolbarButton
            icon={<CommandIcon />}
            onClick={() => onActionPanel?.()}
            title="Action Panel (⌘K)"
          />
          <ToolbarButton
            icon={<BrowseIcon />}
            onClick={() => onBrowse?.()}
            title="Browse Notes (⌘P)"
          />
          <ToolbarButton
            icon={<PlusIcon />}
            onClick={() => onNewNote?.()}
            title="New Note (⌘N)"
          />
        </div>
      </div>
      {/* Tag row — rendered below the main toolbar row when tags are visible */}
      {children && (
        <div className="flex justify-center px-3 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

function TrafficLight({
  color,
  hoverIcon,
  hovering,
  onClick,
  disabled = false,
}: {
  color: string;
  hoverIcon: string;
  hovering: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-3 w-3 items-center justify-center rounded-full text-[8px] leading-none text-black/60 transition-opacity ${
        disabled ? "cursor-default opacity-90" : "hover:brightness-110"
      }`}
      style={{ backgroundColor: color }}
    >
      {!disabled && hovering ? hoverIcon : ""}
    </button>
  );
}

function ToolbarButton({
  icon,
  onClick,
  title,
  active = false,
}: {
  icon: ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-[34px] w-[34px] items-center justify-center rounded-[9px] transition-all hover:bg-white/10 hover:text-[#F1F1F3] ${
        active
          ? "bg-white/10 text-[#F1F1F3]"
          : "text-[#D6D7DA]/72"
      }`}
    >
      {icon}
    </button>
  );
}

function CommandIcon() {
  return (
    <span className="text-[16px] leading-none font-medium">⌘</span>
  );
}

function BrowseIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[16px] w-[16px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3.2" width="14" height="13.6" rx="2.5" />
      <path d="M6.5 7h7" />
      <path d="M6.5 10h7" />
      <path d="M6.5 13h7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[16px] w-[16px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 4.5v11" />
      <path d="M4.5 10h11" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[16px] w-[16px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3h6.172a2 2 0 0 1 1.414.586l6.243 6.243a2 2 0 0 1 0 2.828l-3.757 3.757a2 2 0 0 1-2.828 0L3.586 10.17A2 2 0 0 1 3 8.757V3z" />
      <circle cx="7" cy="7" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
