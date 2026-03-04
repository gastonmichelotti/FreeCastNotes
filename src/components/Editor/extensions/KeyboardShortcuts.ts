import { Extension } from "@tiptap/react";

export const KeyboardShortcuts = Extension.create({
  name: "customKeyboardShortcuts",

  addKeyboardShortcuts() {
    return {
      // Headings: ⌥⌘1, ⌥⌘2, ⌥⌘3
      "Alt-Mod-1": () =>
        this.editor.commands.toggleHeading({ level: 1 }),
      "Alt-Mod-2": () =>
        this.editor.commands.toggleHeading({ level: 2 }),
      "Alt-Mod-3": () =>
        this.editor.commands.toggleHeading({ level: 3 }),

      // Code block: ⌥⌘C
      "Alt-Mod-c": () => this.editor.commands.toggleCodeBlock(),

      // Blockquote: ⇧⌘B
      "Shift-Mod-b": () => this.editor.commands.toggleBlockquote(),

      // Bullet list: ⇧⌘8
      "Shift-Mod-8": () => this.editor.commands.toggleBulletList(),

      // Ordered list: ⇧⌘7
      "Shift-Mod-7": () => this.editor.commands.toggleOrderedList(),

      // Task list: ⇧⌘9
      "Shift-Mod-9": () => this.editor.commands.toggleTaskList(),

      // Strikethrough: ⇧⌘S
      "Shift-Mod-s": () => this.editor.commands.toggleStrike(),

      // Insert table: ⌘T
      "Mod-t": () =>
        this.editor.commands.insertTable({
          rows: 3,
          cols: 2,
          withHeaderRow: true,
        }),
    };
  },
});
