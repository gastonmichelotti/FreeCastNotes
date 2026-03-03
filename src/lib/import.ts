/**
 * Convert Markdown text to HTML that TipTap can parse via editor.commands.setContent().
 */
export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    // Blank lines: jsonToMarkdown uses join("\n") so each pair of top-level block
    // nodes is separated by 1 extra "\n". This means:
    //   1 blank line  = paragraph separator   → 0 empty paragraphs
    //   3 blank lines = 1 empty paragraph     → 1 <p></p>
    //   N blank lines = (N-1)/2 empty paras
    if (!line.trim()) {
      let blankCount = 0;
      while (i < lines.length && !lines[i].trim()) {
        blankCount++;
        i++;
      }
      const emptyParas = Math.floor((blankCount - 1) / 2);
      for (let b = 0; b < emptyParas; b++) {
        html.push("<p></p>");
      }
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      html.push("<hr>");
      i++;
      continue;
    }

    // HTML image tag: <img src="..." alt="..." width="...">
    const htmlImgMatch = line.match(/^<img\s+src="([^"]+)"\s+alt="([^"]*)"(?:\s+width="(\d+)")?\s*>$/);
    if (htmlImgMatch) {
      const src = htmlImgMatch[1];
      const alt = htmlImgMatch[2];
      const width = htmlImgMatch[3];
      const widthAttr = width ? ` width="${width}"` : "";
      html.push(`<img src="${src}" alt="${alt}"${widthAttr}>`);
      i++;
      continue;
    }

    // Standalone image line: ![alt](src)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      html.push(`<img src="${imgMatch[2]}" alt="${imgMatch[1]}">`);
      i++;
      continue;
    }

    // List item (task, unordered, or ordered) — handles nested indentation recursively
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const { html: listHtml, endIndex } = parseListBlock(lines, i, 0);
      html.push(listHtml);
      i = endIndex;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      html.push(
        `<blockquote><p>${parseInline(quoteLines.join(" "))}</p></blockquote>`,
      );
      continue;
    }

    // Paragraph (default)
    html.push(`<p>${parseInline(line)}</p>`);
    i++;
  }

  return html.join("");
}

/**
 * Returns true if `line` is a list item at exactly `indentLevel` (2 spaces per level).
 */
function isListItemAt(line: string, indentLevel: number): boolean {
  const expectedIndent = "  ".repeat(indentLevel);
  if (!line.startsWith(expectedIndent)) return false;
  const trimmed = line.slice(expectedIndent.length);
  // Must not start with more spaces (deeper level)
  if (trimmed.startsWith(" ")) return false;
  return /^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed);
}

/**
 * Recursively parse a list block (ul, ol, or taskList) at a given indent level.
 * Handles nested lists by recursing when the next line is more indented.
 */
function parseListBlock(
  lines: string[],
  startIndex: number,
  indentLevel: number,
): { html: string; endIndex: number } {
  const indent = "  ".repeat(indentLevel);
  let i = startIndex;

  // Determine list type from first item
  const trimmedFirst = lines[i].slice(indent.length);
  const isTask = /^[-*]\s+\[[ xX]\]\s/.test(trimmedFirst);
  const isOrdered = !isTask && /^\d+\.\s+/.test(trimmedFirst);

  const openTag = isTask ? '<ul data-type="taskList">' : isOrdered ? "<ol>" : "<ul>";
  const closeTag = isOrdered ? "</ol>" : "</ul>";

  const items: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    // Stop at blank lines (list ended)
    if (!line.trim()) break;

    // Stop if line is at a shallower indent
    const lineIndentSpaces = (line.match(/^(\s*)/) ?? ["", ""])[1].length;
    if (lineIndentSpaces < indent.length) break;

    const trimmedLine = line.slice(indent.length);

    // Skip deeper-indented lines (should have been consumed recursively, but guard anyway)
    if (trimmedLine.startsWith(" ")) {
      i++;
      continue;
    }

    // Stop if item type doesn't match this list
    const lineIsTask = /^[-*]\s+\[[ xX]\]\s/.test(trimmedLine);
    const lineIsOrdered = /^\d+\.\s+/.test(trimmedLine);
    const lineIsUnordered = !lineIsTask && /^[-*]\s+/.test(trimmedLine);

    if (isTask && !lineIsTask) break;
    if (isOrdered && !lineIsOrdered) break;
    if (!isTask && !isOrdered && (lineIsTask || lineIsOrdered || !lineIsUnordered)) break;

    // Parse item content
    const taskMatch = trimmedLine.match(/^[-*]\s+\[([ xX])\]\s+(.*)/);
    const ulMatch = !taskMatch ? trimmedLine.match(/^[-*]\s+(.*)/) : null;
    const olMatch = !taskMatch && !ulMatch ? trimmedLine.match(/^\d+\.\s+(.*)/) : null;

    const itemContent = taskMatch
      ? taskMatch[2]
      : ulMatch
        ? ulMatch[1]
        : olMatch
          ? olMatch[1]
          : trimmedLine;
    const isChecked = taskMatch ? taskMatch[1] !== " " : false;

    i++; // advance past this item line

    // Recurse into nested list if next line is more indented
    let nestedHtml = "";
    if (i < lines.length && lines[i].trim() && isListItemAt(lines[i], indentLevel + 1)) {
      const result = parseListBlock(lines, i, indentLevel + 1);
      nestedHtml = result.html;
      i = result.endIndex;
    }

    if (isTask) {
      items.push(
        `<li data-type="taskItem" data-checked="${isChecked}"><p>${parseInline(itemContent)}</p>${nestedHtml}</li>`,
      );
    } else {
      items.push(`<li><p>${parseInline(itemContent)}</p>${nestedHtml}</li>`);
    }
  }

  return { html: `${openTag}${items.join("")}${closeTag}`, endIndex: i };
}

function parseInline(text: string): string {
  // Extract inline code first to protect it from other transformations
  const codes: string[] = [];
  let result = text.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(code);
    return `\x00CODE${codes.length - 1}\x00`;
  });

  // Images: ![alt](src) — must come before links
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1">',
  );

  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Restore inline code (escaped)
  result = result.replace(/\x00CODE(\d+)\x00/g, (_, idx: string) => {
    return `<code>${escapeHtml(codes[parseInt(idx)])}</code>`;
  });

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
