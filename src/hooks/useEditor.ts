import { useEditor as useTipTapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import type { EditorView } from "@tiptap/pm/view";
import { KeyboardShortcuts } from "../components/Editor/extensions/KeyboardShortcuts";
import { SearchAndReplace } from "../components/Editor/extensions/SearchAndReplace";
import { ResizableImage } from "../components/Editor/extensions/ResizableImage";
import { compressImage, validateImageFile } from "../lib/imageUtils";

/**
 * Insert a validated image file at the current selection.
 * Shared by the paste and drop handlers so both paths behave identically.
 */
function insertImageFromFile(view: EditorView, file: File): void {
  compressImage(file)
    .then((src) => {
      const { state } = view;
      const node = state.schema.nodes.image.create({ src });
      view.dispatch(state.tr.replaceSelectionWith(node));
    })
    .catch((err) => {
      console.error("[FreeCastNotes] Failed to compress image:", err);
    });
}

export function useAppEditor() {
  const editor = useTipTapEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: "code-block" } },
        blockquote: { HTMLAttributes: { class: "blockquote" } },
        bulletList: { HTMLAttributes: { class: "bullet-list" } },
        orderedList: { HTMLAttributes: { class: "ordered-list" } },
        listItem: { HTMLAttributes: { class: "list-item" } },
        horizontalRule: {},
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "editor-link" },
      }),
      TaskList.configure({
        HTMLAttributes: { class: "task-list" },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: "task-item" },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      KeyboardShortcuts,
      SearchAndReplace,
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
      }),
    ],
    autofocus: true,
    editorProps: {
      attributes: {
        class: "editor-content",
      },

      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // 1. Check DataTransferItems — catches screenshot paste (image/png,
        //    image/tiff) and image files copied from Finder.
        const items = Array.from(clipboardData.items);
        const imageItem = items.find((item) =>
          item.type.startsWith("image/"),
        );
        if (imageItem) {
          event.preventDefault();
          const file = imageItem.getAsFile();
          if (file) {
            const error = validateImageFile(file);
            if (error) {
              console.warn("[FreeCastNotes] Image paste rejected:", error);
            } else {
              insertImageFromFile(view, file);
            }
          }
          return true;
        }

        // 2. Fallback: clipboardData.files — some OS/WKWebView combinations
        //    surface image files here instead of (or in addition to) items.
        const imageFile = Array.from(clipboardData.files).find((f) =>
          f.type.startsWith("image/"),
        );
        if (imageFile) {
          event.preventDefault();
          const error = validateImageFile(imageFile);
          if (error) {
            console.warn("[FreeCastNotes] Image paste rejected:", error);
          } else {
            insertImageFromFile(view, imageFile);
          }
          return true;
        }

        return false;
      },

      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        // Find the first image in the drop — user may drop mixed files.
        const imageFile = Array.from(files).find((f) =>
          f.type.startsWith("image/"),
        );
        if (!imageFile) return false;

        event.preventDefault();
        const error = validateImageFile(imageFile);
        if (error) {
          console.warn("[FreeCastNotes] Image drop rejected:", error);
          return true;
        }

        // Insert at the drop position rather than the current selection.
        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        compressImage(imageFile)
          .then((src) => {
            const node = view.state.schema.nodes.image.create({ src });
            const pos = coords?.pos ?? view.state.selection.to;
            view.dispatch(view.state.tr.insert(pos, node));
          })
          .catch((err) => {
            console.error("[FreeCastNotes] Failed to compress dropped image:", err);
          });

        return true;
      },
    },
  });

  return editor;
}
