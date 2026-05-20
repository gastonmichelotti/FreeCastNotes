/**
 * Vault mode storage — one .md file per note in ~/Documents/FreeCastNotes.
 * Replaces the localStorage blob from db.ts.
 *
 * Note.content in memory = Markdown body (raw, with relative image paths).
 * getNote() returns resolved Markdown (base64-inlined images) for the editor.
 */

import type { Note, DeletedNote, SortOrder, NoteVisibility } from "../types/index";
import { bridge } from "./bridge";
import { extractTitle } from "./utils";

// --- Module state ---

let _filenameMap: Map<string, string> = new Map(); // noteId → "slug-id8.md"
let _notesMeta: Map<string, Note> = new Map(); // noteId → Note (content = raw md body)
let _deletedFilenameMap: Map<string, string> = new Map(); // deletedNoteId → filename in _deleted/
let _deletedMeta: Map<string, DeletedNote> = new Map(); // deletedNoteId → DeletedNote
// Tracks notes whose vaultWriteNote is in-flight so listNotes() doesn't overwrite the cache
let _pendingUpdates: Map<string, Note> = new Map();

// --- Internal types ---

interface FrontmatterMeta {
  id: string;
  created_at: string;
  updated_at: string;
  last_opened_at?: string;
  tags?: string[];
  pinned?: boolean;
  pin_order?: number;
  visibility?: NoteVisibility;
  edit_permission?: boolean;
  published_slug?: string;
}

// --- Helpers ---

function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  if (typeof c?.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now(): string {
  return new Date().toISOString();
}

function parseFrontmatter(fileContent: string): {
  meta: FrontmatterMeta;
  body: string;
} {
  const empty: FrontmatterMeta = { id: "", created_at: now(), updated_at: now() };

  if (!fileContent.startsWith("---\n") && !fileContent.startsWith("---\r\n")) {
    return { meta: empty, body: fileContent };
  }

  const endIdx = fileContent.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { meta: empty, body: fileContent };
  }

  const yaml = fileContent.slice(4, endIdx); // between "---\n" and "\n---"
  const afterEnd = fileContent.indexOf("\n", endIdx + 1);
  const body =
    afterEnd !== -1 ? fileContent.slice(afterEnd + 1).replace(/^\n+/, "") : "";

  const meta: FrontmatterMeta = { id: "", created_at: now(), updated_at: now() };

  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "id") meta.id = value;
    else if (key === "created_at") meta.created_at = value;
    else if (key === "updated_at") meta.updated_at = value;
    else if (key === "last_opened_at") meta.last_opened_at = value;
    else if (key === "tags") {
      if (value.startsWith("[") && value.endsWith("]")) {
        const inner = value.slice(1, -1).trim();
        meta.tags = inner
          ? inner
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [];
      } else {
        meta.tags = [];
      }
    } else if (key === "pinned") {
      meta.pinned = value === "true";
    } else if (key === "pin_order") {
      const n = parseInt(value, 10);
      if (!isNaN(n)) meta.pin_order = n;
    } else if (key === "visibility") {
      if (value === "public" || value === "unlisted" || value === "private") {
        meta.visibility = value;
      }
    } else if (key === "edit_permission") {
      meta.edit_permission = value === "true";
    } else if (key === "published_slug") {
      if (value) meta.published_slug = value;
    }
  }

  return { meta, body };
}

function serializeNote(note: Note, body: string): string {
  const lines = ["---", `id: ${note.id}`, `created_at: ${note.created_at}`, `updated_at: ${note.updated_at}`];
  if (note.last_opened_at) lines.push(`last_opened_at: ${note.last_opened_at}`);
  if (note.tags && note.tags.length > 0) lines.push(`tags: [${note.tags.join(", ")}]`);
  if (note.is_pinned) {
    lines.push("pinned: true");
    if (note.pin_order >= 0) lines.push(`pin_order: ${note.pin_order}`);
  }
  if (note.visibility && note.visibility !== "private") {
    lines.push(`visibility: ${note.visibility}`);
  }
  if (note.edit_permission) lines.push("edit_permission: true");
  if (note.published_slug) lines.push(`published_slug: ${note.published_slug}`);
  lines.push("---", "", "");
  return lines.join("\n") + body;
}

function slugFromMarkdown(body: string): string {
  for (const line of body.split("\n")) {
    const cleaned = line.replace(/^#+\s+/, "").trim();
    if (cleaned) {
      return (
        cleaned
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 50) || "untitled"
      );
    }
  }
  return "untitled";
}

function noteFilename(body: string, id: string): string {
  const slug = slugFromMarkdown(body);
  return `${slug}-${id.slice(0, 8)}.md`;
}

/** Simple hash for deduplicating attachment filenames across saves */
function simpleHash(s: string): string {
  let h = 5381;
  const len = Math.min(s.length, 2000);
  for (let i = 0; i < len; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

/**
 * Extract base64 data-URL images from Markdown.
 * Returns cleaned markdown (relative paths) + attachments array for vaultWriteNote.
 */
function extractAttachments(
  markdown: string,
  id8: string,
): { md: string; attachments: Array<{ path: string; base64: string }> } {
  const attachments: Array<{ path: string; base64: string }> = [];

  // First, handle HTML img tags with width: <img src="data:image/..." alt="..." width="500">
  let md = markdown.replace(
    /<img\s+src="(data:image\/([^;]+);base64,([^"]+))"\s+alt="([^"]*)"(?:\s+width="(\d+)")?\s*>/g,
    (_, _fullSrc: string, ext: string, base64: string, alt: string, width: string | undefined) => {
      const fileExt = ext === "jpeg" ? "jpg" : ext;
      const hash = simpleHash(base64);
      const relPath = `attachments/${id8}-${hash}.${fileExt}`;
      const sizeKB = Math.round(base64.length * 0.75 / 1024);
      
      console.log(`[FreeCastNotes] Extracting image: ${relPath} (${sizeKB} KB, format: ${ext}${width ? `, width: ${width}px` : ""})`);
      
      attachments.push({ path: relPath, base64 });
      
      // Preserve width if it was set
      if (width) {
        return `<img src="${relPath}" alt="${alt}" width="${width}">`;
      }
      return `![${alt}](${relPath})`;
    },
  );

  // Then handle standard markdown images: ![alt](data:image/...)
  md = md.replace(
    /!\[([^\]]*)\]\((data:image\/([^;]+);base64,([^)]+))\)/g,
    (_, alt: string, _fullSrc: string, ext: string, base64: string) => {
      const fileExt = ext === "jpeg" ? "jpg" : ext;
      const hash = simpleHash(base64);
      const relPath = `attachments/${id8}-${hash}.${fileExt}`;
      const sizeKB = Math.round(base64.length * 0.75 / 1024);
      
      console.log(`[FreeCastNotes] Extracting image: ${relPath} (${sizeKB} KB, format: ${ext})`);
      
      attachments.push({ path: relPath, base64 });
      return `![${alt}](${relPath})`;
    },
  );

  return { md, attachments };
}

// --- Public API ---

export function sortNotes(notes: Note[], sortOrder: SortOrder = "modified"): Note[] {
  return [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
    if (a.is_pinned && b.is_pinned && a.pin_order !== b.pin_order) {
      return a.pin_order - b.pin_order;
    }
    if (sortOrder === "title") {
      return extractTitle(a.content).localeCompare(extractTitle(b.content), undefined, {
        sensitivity: "base",
      });
    }
    if (sortOrder === "opened") {
      const aDate = a.last_opened_at ?? a.updated_at;
      const bDate = b.last_opened_at ?? b.updated_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export async function listNotes(): Promise<Note[]> {
  const result = await bridge.vaultLoadAll();

  _filenameMap.clear();
  _notesMeta.clear();
  _deletedFilenameMap.clear();
  _deletedMeta.clear();

  const notes: Note[] = [];

  for (const file of result.notes) {
    try {
      const { meta, body } = parseFrontmatter(file.content);
      if (!meta.id) continue;

      const note: Note = {
        id: meta.id,
        content: body,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        last_opened_at: meta.last_opened_at,
        is_pinned: meta.pinned ? 1 : 0,
        pin_order: meta.pin_order ?? -1,
        tags: meta.tags ?? [],
        visibility: meta.visibility,
        edit_permission: meta.edit_permission,
        published_slug: meta.published_slug,
      };

      _filenameMap.set(meta.id, file.filename);
      _notesMeta.set(meta.id, note);
      notes.push(note);
    } catch {
      // Skip malformed files
    }
  }

  // Re-apply any writes that were in-flight when vaultLoadAll ran.
  // listNotes() reads disk state before those writes commit, so without this
  // the cache would revert to the old content and updateLastOpened would
  // subsequently overwrite the file with stale data (no image reference).
  for (const [pendingId, pendingNote] of _pendingUpdates) {
    const idx = notes.findIndex((n) => n.id === pendingId);
    if (idx !== -1) notes[idx] = pendingNote;
    if (_notesMeta.has(pendingId)) _notesMeta.set(pendingId, pendingNote);
  }

  for (const file of result.deleted) {
    try {
      const { meta } = parseFrontmatter(file.content);
      if (!meta.id) continue;

      _deletedFilenameMap.set(meta.id, file.filename);
      _deletedMeta.set(meta.id, {
        id: meta.id,
        content: "",
        deleted_at:
          file.mtime > 0
            ? new Date(file.mtime * 1000).toISOString()
            : now(),
        original_created_at: meta.created_at,
      });
    } catch {
      // Skip malformed files
    }
  }

  return notes;
}

export async function searchNotes(query: string): Promise<Note[]> {
  const q = query.trim().toLowerCase();
  if (!q) return listNotes();
  const notes = Array.from(_notesMeta.values());
  return notes.filter(
    (n) =>
      n.content.toLowerCase().includes(q) ||
      extractTitle(n.content).toLowerCase().includes(q),
  );
}

export async function createNote(): Promise<Note> {
  const timestamp = now();
  const id = uuid();
  const note: Note = {
    id,
    content: "",
    created_at: timestamp,
    updated_at: timestamp,
    is_pinned: 0,
    pin_order: -1,
    tags: [],
  };

  const filename = noteFilename("", id);
  const fileContent = serializeNote(note, "");
  await bridge.vaultWriteNote(filename, fileContent, []);

  _filenameMap.set(id, filename);
  _notesMeta.set(id, note);

  return note;
}

/**
 * Returns the note with images resolved as base64 data URLs (for the editor).
 * Called when switching to a note.
 */
export async function getNote(id: string): Promise<Note | null> {
  const filename = _filenameMap.get(id);
  if (!filename) return null;

  // vaultReadNote returns full file content with images inlined
  const fileContent = await bridge.vaultReadNote(filename);
  if (!fileContent) return null;

  const { body } = parseFrontmatter(fileContent);
  const cached = _notesMeta.get(id);
  if (!cached) return null;

  // Check for broken image references (attachments/... paths that weren't resolved)
  const brokenImageMatches = body.match(/!\[([^\]]*)\]\((attachments\/[^)]+)\)/g);
  if (brokenImageMatches && brokenImageMatches.length > 0) {
    console.warn(`[FreeCastNotes] ⚠️ Note "${filename}" has ${brokenImageMatches.length} broken image reference(s):`);
    brokenImageMatches.forEach((match, i) => {
      console.warn(`  ${i + 1}. ${match}`);
    });
    console.warn(`[FreeCastNotes] These images will be removed from the note.`);
  }

  // Return note with resolved markdown body (base64 images for editor display)
  return { ...cached, content: body };
}

/**
 * content = Markdown string (may contain base64 data URLs from jsonToMarkdown).
 * Extracts attachments to files, writes clean markdown to disk.
 */
export async function updateNote(id: string, content: string): Promise<void> {
  const note = _notesMeta.get(id);
  const filename = _filenameMap.get(id);
  if (!note || !filename) return;

  const { md, attachments } = extractAttachments(content, id.slice(0, 8));
  
  if (attachments.length > 0) {
    console.log(`[FreeCastNotes] Saving note "${filename}" with ${attachments.length} attachment(s):`);
    attachments.forEach((att, i) => {
      const sizeKB = Math.round(att.base64.length * 0.75 / 1024);
      console.log(`  ${i + 1}. ${att.path} (${sizeKB} KB)`);
    });
  }
  
  const updatedNote: Note = { ...note, content: md, updated_at: now() };

  // Optimistic cache update before the async write so that concurrent readers
  // (updateLastOpened, listNotes re-apply) always see the new content.
  _notesMeta.set(id, updatedNote);
  _pendingUpdates.set(id, updatedNote);

  const fileContent = serializeNote(updatedNote, md);
  try {
    const success = await bridge.vaultWriteNote(filename, fileContent, attachments);

    if (attachments.length > 0) {
      if (success) {
        console.log(`[FreeCastNotes] ✓ Successfully saved note with attachments`);
      } else {
        console.error(`[FreeCastNotes] ✗ Failed to save note with attachments`);
      }
    }
  } finally {
    _pendingUpdates.delete(id);
  }
}

export async function deleteNote(id: string): Promise<void> {
  const filename = _filenameMap.get(id);
  if (!filename) return;

  await bridge.vaultDeleteNote(filename);

  const note = _notesMeta.get(id);
  if (note) {
    _deletedFilenameMap.set(id, filename);
    _deletedMeta.set(id, {
      id,
      content: "",
      deleted_at: now(),
      original_created_at: note.created_at,
    });
  }

  _filenameMap.delete(id);
  _notesMeta.delete(id);
}

export function updateLastOpened(id: string): void {
  const note = _notesMeta.get(id);
  const filename = _filenameMap.get(id);
  if (!note || !filename) return;

  const updatedNote = { ...note, last_opened_at: now() };
  _notesMeta.set(id, updatedNote);

  // Fire-and-forget disk write
  const fileContent = serializeNote(updatedNote, note.content);
  bridge.vaultWriteNote(filename, fileContent, []).catch(() => {});
}

export async function togglePin(id: string): Promise<Note | null> {
  const note = _notesMeta.get(id);
  const filename = _filenameMap.get(id);
  if (!note || !filename) return null;

  const willPin = note.is_pinned === 0;
  const maxPinOrder = Array.from(_notesMeta.values()).reduce(
    (max, n) => (n.is_pinned ? Math.max(max, n.pin_order) : max),
    -1,
  );

  const updated: Note = {
    ...note,
    is_pinned: willPin ? 1 : 0,
    pin_order: willPin ? maxPinOrder + 1 : -1,
    updated_at: now(),
  };

  const fileContent = serializeNote(updated, note.content);
  await bridge.vaultWriteNote(filename, fileContent, []);
  _notesMeta.set(id, updated);

  return updated;
}

export async function duplicateNote(id: string): Promise<Note | null> {
  const original = _notesMeta.get(id);
  if (!original) return null;

  // Get the original note content with images resolved for duplication
  const resolvedOriginal = await getNote(id);
  const contentToDup = resolvedOriginal?.content ?? original.content;

  const timestamp = now();
  const newId = uuid();

  // Extract attachments from duplicated content
  const { md, attachments } = extractAttachments(contentToDup, newId.slice(0, 8));

  const dup: Note = {
    id: newId,
    content: md,
    created_at: timestamp,
    updated_at: timestamp,
    is_pinned: 0,
    pin_order: -1,
    tags: [...(original.tags ?? [])],
  };

  const filename = noteFilename(md, newId);
  const fileContent = serializeNote(dup, md);
  await bridge.vaultWriteNote(filename, fileContent, attachments);

  _filenameMap.set(newId, filename);
  _notesMeta.set(newId, dup);

  return dup;
}

export async function updateNoteTags(id: string, tags: string[]): Promise<void> {
  const note = _notesMeta.get(id);
  const filename = _filenameMap.get(id);
  if (!note || !filename) return;

  const updatedNote = { ...note, tags };
  const fileContent = serializeNote(updatedNote, note.content);
  await bridge.vaultWriteNote(filename, fileContent, []);
  _notesMeta.set(id, updatedNote);
}

export async function listDeletedNotes(): Promise<DeletedNote[]> {
  const deleted = Array.from(_deletedMeta.values());
  return deleted.sort(
    (a, b) =>
      new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime(),
  );
}

export async function restoreNote(id: string): Promise<Note | null> {
  const deletedFilename = _deletedFilenameMap.get(id);
  if (!deletedFilename) return null;

  const success = await bridge.vaultRestoreNote(deletedFilename);
  if (!success) return null;

  const deletedInfo = _deletedMeta.get(id);
  _deletedFilenameMap.delete(id);
  _deletedMeta.delete(id);

  // The restored file is back in the vault root with same filename
  _filenameMap.set(id, deletedFilename);

  const note: Note = {
    id,
    content: "",
    created_at: deletedInfo?.original_created_at ?? now(),
    updated_at: now(),
    is_pinned: 0,
    pin_order: -1,
    tags: [],
  };
  _notesMeta.set(id, note);

  return note;
}

export async function purgeDeletedNotes(): Promise<void> {
  await bridge.vaultPurgeDeleted();
  _deletedMeta.clear();
  _deletedFilenameMap.clear();
}

/** Returns the vault filename for a note ID (for focus-reload comparison). */
export function getNoteFilename(id: string): string | undefined {
  return _filenameMap.get(id);
}

/**
 * Debugging function to inspect attachment status for a note.
 * Call from browser console: window.__debugAttachments(noteId)
 */
export function debugAttachments(id: string): void {
  const note = _notesMeta.get(id);
  const filename = _filenameMap.get(id);
  
  if (!note || !filename) {
    console.log(`[Debug] Note ${id} not found`);
    return;
  }
  
  console.log(`[Debug] Note: ${filename}`);
  console.log(`[Debug] Content preview: ${note.content.substring(0, 200)}...`);
  
  // Find all image references in the markdown
  const imageMatches = note.content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g);
  const images: Array<{ alt: string; src: string; type: string }> = [];
  
  for (const match of imageMatches) {
    const alt = match[1];
    const src = match[2];
    const type = src.startsWith("data:") ? "base64" : src.startsWith("attachments/") ? "attachment" : "unknown";
    images.push({ alt, src: src.substring(0, 100) + (src.length > 100 ? "..." : ""), type });
  }
  
  if (images.length === 0) {
    console.log(`[Debug] No images found in note`);
  } else {
    console.log(`[Debug] Found ${images.length} image reference(s):`);
    images.forEach((img, i) => {
      console.log(`  ${i + 1}. [${img.type}] ${img.alt || "(no alt)"}: ${img.src}`);
    });
  }
  
  // Check for broken attachments
  const brokenImages = images.filter(img => img.type === "attachment");
  if (brokenImages.length > 0) {
    console.warn(`[Debug] ⚠️ ${brokenImages.length} broken attachment reference(s) found`);
    console.warn(`[Debug] These images reference files that may not exist on disk.`);
  }
}

// Expose debug function to window for console access
if (typeof window !== "undefined") {
  (window as any).__debugAttachments = debugAttachments;
}

export async function updateNoteVisibility(id: string, visibility: NoteVisibility): Promise<void> {
  const note = _notesMeta.get(id);
  const filename = _filenameMap.get(id);
  if (!note || !filename) return;
  const updated: Note = { ...note, visibility, updated_at: now() };
  const fileContent = serializeNote(updated, note.content);
  await bridge.vaultWriteNote(filename, fileContent, []);
  _notesMeta.set(id, updated);
}

export async function updateNoteEditPermission(id: string, editPermission: boolean): Promise<void> {
  const note = _notesMeta.get(id);
  const filename = _filenameMap.get(id);
  if (!note || !filename) return;
  const updated: Note = { ...note, edit_permission: editPermission, updated_at: now() };
  const fileContent = serializeNote(updated, note.content);
  await bridge.vaultWriteNote(filename, fileContent, []);
  _notesMeta.set(id, updated);
}

export async function updateNotePublishedSlug(id: string, slug: string, hubUrl: string): Promise<void> {
  const note = _notesMeta.get(id);
  const filename = _filenameMap.get(id);
  if (!note || !filename) return;
  const updated: Note = {
    ...note,
    published_slug: slug,
    published_url: `${hubUrl}/${slug}`,
    updated_at: now(),
  };
  const fileContent = serializeNote(updated, note.content);
  await bridge.vaultWriteNote(filename, fileContent, []);
  _notesMeta.set(id, updated);
}
