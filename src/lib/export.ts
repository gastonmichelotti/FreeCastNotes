import { bridge } from "./bridge";
import type { Editor } from "@tiptap/react";

/** Copy plain text to clipboard */
export async function copyAsPlainText(editor: Editor): Promise<void> {
  const text = editor.getText();
  await navigator.clipboard.writeText(text);
}

/** Copy HTML to clipboard */
export async function copyAsHTML(editor: Editor): Promise<void> {
  const html = editor.getHTML();
  await navigator.clipboard.writeText(html);
}

/** Copy Markdown to clipboard (with optional YAML frontmatter for tags) */
export async function copyAsMarkdown(
  editor: Editor,
  tags: string[] = [],
): Promise<void> {
  const json = editor.getJSON();
  const md = withTagFrontmatter(jsonToMarkdown(json), tags);
  await navigator.clipboard.writeText(md);
}

/** Export note to file via save dialog */
export async function exportToFile(
  editor: Editor,
  format: "md" | "html" | "txt",
  tags: string[] = [],
): Promise<boolean> {
  let content: string;
  let extension: string;
  let filterName: string;

  switch (format) {
    case "md":
      content = withTagFrontmatter(jsonToMarkdown(editor.getJSON()), tags);
      extension = "md";
      filterName = "Markdown";
      break;
    case "html":
      content = editor.getHTML();
      extension = "html";
      filterName = "HTML";
      break;
    case "txt":
      content = editor.getText();
      extension = "txt";
      filterName = "Plain Text";
      break;
  }

  return bridge.exportFile(content, extension, filterName);
}

// --- Helpers ---

function withTagFrontmatter(md: string, tags: string[]): string {
  if (!tags.length) return md;
  return `---\ntags: [${tags.join(", ")}]\n---\n\n${md}`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// --- TipTap JSON to Markdown converter ---

export interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

export function jsonToMarkdown(doc: TipTapNode): string {
  if (!doc.content) return "";
  return doc.content.map((node) => nodeToMarkdown(node, 0)).join("\n");
}

function nodeToMarkdown(node: TipTapNode, depth: number): string {
  switch (node.type) {
    case "paragraph":
      return inlineContent(node) + "\n";

    case "heading": {
      const level = (node.attrs?.level as number) || 1;
      const prefix = "#".repeat(level);
      return `${prefix} ${inlineContent(node)}\n`;
    }

    case "bulletList":
      return (
        (node.content || [])
          .map((item) => listItemToMarkdown(item, depth, "- "))
          .join("\n") + "\n"
      );

    case "orderedList":
      return (
        (node.content || [])
          .map((item, i) => listItemToMarkdown(item, depth, `${i + 1}. `))
          .join("\n") + "\n"
      );

    case "taskList":
      return (
        (node.content || [])
          .map((item) => {
            const checked = item.attrs?.checked ? "x" : " ";
            return listItemToMarkdown(item, depth, `- [${checked}] `);
          })
          .join("\n") + "\n"
      );

    case "codeBlock":
      return "```\n" + plainTextContent(node) + "\n```\n";

    case "blockquote":
      return (
        (node.content || [])
          .map((child) => "> " + nodeToMarkdown(child, depth).trimEnd())
          .join("\n") + "\n"
      );

    case "horizontalRule":
      return "---\n";

    case "table": {
      const rows = node.content || [];
      if (rows.length === 0) return "";
      const mdRows: string[] = [];
      rows.forEach((row, rowIdx) => {
        const cells = row.content || [];
        const cellTexts = cells.map((cell) => {
          // cell content is a paragraph node
          const para = cell.content?.[0];
          return para ? inlineContent(para).replace(/\|/g, "\\|") : "";
        });
        mdRows.push("| " + cellTexts.join(" | ") + " |");
        // Insert separator after header row
        if (rowIdx === 0) {
          mdRows.push("| " + cellTexts.map(() => "---").join(" | ") + " |");
        }
      });
      return mdRows.join("\n") + "\n";
    }

    case "image": {
      const src = (node.attrs?.src as string) || "";
      const alt = (node.attrs?.alt as string) || "";
      const width = node.attrs?.width as number | null | undefined;
      
      // If width is set, use HTML format to preserve it
      // Otherwise use standard markdown format
      if (width && width > 0) {
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${width}">\n`;
      }
      return `![${alt}](${src})\n`;
    }

    default:
      return inlineContent(node) + "\n";
  }
}

function listItemToMarkdown(
  item: TipTapNode,
  depth: number,
  prefix: string,
): string {
  const indent = "  ".repeat(depth);
  const children = item.content || [];
  const lines: string[] = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (
      child.type === "bulletList" ||
      child.type === "orderedList" ||
      child.type === "taskList"
    ) {
      lines.push(nodeToMarkdown(child, depth + 1).trimEnd());
    } else if (i === 0) {
      lines.push(`${indent}${prefix}${inlineContent(child)}`);
    } else {
      lines.push(`${indent}  ${inlineContent(child)}`);
    }
  }

  return lines.join("\n");
}

function inlineContent(node: TipTapNode): string {
  if (!node.content) return "";
  return node.content.map(inlineNode).join("");
}

function inlineNode(node: TipTapNode): string {
  if (node.type === "hardBreak") return "\n";
  if (node.type !== "text" || !node.text) return "";

  let text = node.text;

  if (node.marks) {
    for (const mark of node.marks) {
      switch (mark.type) {
        case "bold":
          text = `**${text}**`;
          break;
        case "italic":
          text = `*${text}*`;
          break;
        case "strike":
          text = `~~${text}~~`;
          break;
        case "code":
          text = `\`${text}\``;
          break;
        case "link":
          text = `[${text}](${mark.attrs?.href || ""})`;
          break;
        case "underline":
          text = `<u>${text}</u>`;
          break;
      }
    }
  }

  return text;
}

function plainTextContent(node: TipTapNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(plainTextContent).join("");
}
