import { create } from "zustand";
import type { Note, SortOrder } from "../types/index";
import * as db from "../lib/db";
import { runMigrationIfNeeded } from "../lib/migration";
import { bridge } from "../lib/bridge";

interface AppState {
  notes: Note[];
  currentNote: Note | null;
  loading: boolean;

  // Toast
  toast: string | null;
  showToast: (message: string) => void;
  clearToast: () => void;

  // Navigation history
  history: string[];
  historyIndex: number;

  // Actions
  loadNotes: () => Promise<void>;
  createNote: () => Promise<Note>;
  switchToNote: (id: string) => Promise<void>;
  updateCurrentNoteContent: (content: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  duplicateNote: (id: string) => Promise<Note | null>;
  updateNoteTags: (id: string, tags: string[]) => Promise<void>;
  reloadChangedNotes: (
    files: Array<{ filename: string; content: string }>,
  ) => Promise<void>;

  // Navigation
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  canGoBack: () => boolean;
  canGoForward: () => boolean;

  // Auto-resize
  autoResizeEnabled: boolean;
  toggleAutoResize: () => void;

  // Layout
  layoutMode: "single" | "split";
  splitPanelWidth: number;
  setLayoutMode: (mode: "single" | "split") => void;
  setSplitPanelWidth: (width: number) => void;

  // Sort
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;

  // Hub
  hubConfig: { url: string; hasToken: boolean; connected: boolean };
  setHubConfig: (config: { url: string; hasToken: boolean; connected: boolean }) => void;
  testHubConnection: () => Promise<void>;

  // Note publishing
  updateNoteVisibility: (id: string, visibility: import("../types/index").NoteVisibility) => Promise<void>;
  updateNoteEditPermission: (id: string, editPermission: boolean) => Promise<void>;
}

const _PREFS_KEY = "freecastnotes.prefs.v1";
const _initPrefs: Record<string, unknown> = (() => {
  try {
    return JSON.parse(localStorage.getItem(_PREFS_KEY) || "{}");
  } catch {
    return {};
  }
})();
function _savePrefs(updates: Record<string, unknown>) {
  try {
    const existing = JSON.parse(localStorage.getItem(_PREFS_KEY) || "{}");
    localStorage.setItem(_PREFS_KEY, JSON.stringify({ ...existing, ...updates }));
  } catch {
    /* ignore */
  }
}

const VALID_SORT_ORDERS: SortOrder[] = ["modified", "opened", "title"];
function initSortOrder(): SortOrder {
  const saved = _initPrefs.sortOrder as string;
  return VALID_SORT_ORDERS.includes(saved as SortOrder)
    ? (saved as SortOrder)
    : "modified";
}

export const useAppStore = create<AppState>((set, get) => ({
  notes: [],
  currentNote: null,
  loading: true,

  // Toast
  toast: null,
  showToast: (message: string) => set({ toast: message }),
  clearToast: () => set({ toast: null }),

  // Navigation history
  history: [],
  historyIndex: -1,

  loadNotes: async () => {
    try {
      await runMigrationIfNeeded();
      const rawNotes = await db.listNotes();
      const notes = db.sortNotes(rawNotes, get().sortOrder);
      set({ notes, loading: false });
    } catch (error) {
      console.error("Failed to load notes", error);
      set({ loading: false });
      get().showToast("Could not load notes");
    }
  },

  createNote: async () => {
    try {
      const note = await db.createNote();
      const rawNotes = await db.listNotes();
      const { history, historyIndex, sortOrder } = get();
      const notes = db.sortNotes(rawNotes, sortOrder);
      const newHistory = [...history.slice(0, historyIndex + 1), note.id];
      set({
        notes,
        currentNote: note,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      });
      return note;
    } catch (error) {
      console.error("Failed to create note", error);
      get().showToast("Could not create note");
      throw error;
    }
  },

  switchToNote: async (id: string) => {
    try {
      const note = await db.getNote(id);
      if (!note) return;

      // Track last opened (for "Last Opened" sort)
      db.updateLastOpened(id);

      const { history, historyIndex, currentNote, sortOrder, notes } = get();
      const openedAt = new Date().toISOString();
      const updatedNotes = db.sortNotes(
        notes.map((n) => (n.id === id ? { ...n, last_opened_at: openedAt } : n)),
        sortOrder,
      );

      if (currentNote?.id === id) {
        set({ currentNote: note, notes: updatedNotes });
      } else {
        const newHistory = [...history.slice(0, historyIndex + 1), id];
        set({
          currentNote: note,
          notes: updatedNotes,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      }
    } catch (error) {
      console.error("Failed to switch note", error);
    }
  },

  updateCurrentNoteContent: async (content: string) => {
    const { currentNote, sortOrder } = get();
    if (!currentNote) return;

    try {
      await db.updateNote(currentNote.id, content);
      const updatedNote = {
        ...currentNote,
        content,
        updated_at: new Date().toISOString(),
      };
      set((state) => ({
        currentNote: updatedNote,
        notes: db.sortNotes(
          state.notes.map((n) => (n.id === updatedNote.id ? updatedNote : n)),
          sortOrder,
        ),
      }));
    } catch (error) {
      console.error("Failed to update note", error);
    }
  },

  deleteNote: async (id: string) => {
    try {
      await db.deleteNote(id);
      const rawNotes = await db.listNotes();
      const { currentNote, sortOrder } = get();
      const notes = db.sortNotes(rawNotes, sortOrder);
      if (currentNote?.id === id) {
        if (notes.length > 0) {
          set({ notes, currentNote: notes[0] });
        } else {
          const newNote = await db.createNote();
          const refreshed = db.sortNotes(await db.listNotes(), sortOrder);
          set({ notes: refreshed, currentNote: newNote });
        }
      } else {
        set({ notes });
      }
    } catch (error) {
      console.error("Failed to delete note", error);
      get().showToast("Could not delete note");
    }
  },

  togglePin: async (id: string) => {
    try {
      const updated = await db.togglePin(id);
      if (!updated) return;
      const rawNotes = await db.listNotes();
      const { currentNote, sortOrder } = get();
      const notes = db.sortNotes(rawNotes, sortOrder);
      set({
        notes,
        currentNote: currentNote?.id === id ? updated : currentNote,
      });
    } catch (error) {
      console.error("Failed to pin/unpin note", error);
      get().showToast("Could not update pin");
    }
  },

  duplicateNote: async (id: string) => {
    try {
      const dup = await db.duplicateNote(id);
      if (!dup) return null;
      const rawNotes = await db.listNotes();
      const { history, historyIndex, sortOrder } = get();
      const notes = db.sortNotes(rawNotes, sortOrder);
      const newHistory = [...history.slice(0, historyIndex + 1), dup.id];
      set({
        notes,
        currentNote: dup,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      });
      return dup;
    } catch (error) {
      console.error("Failed to duplicate note", error);
      get().showToast("Could not duplicate note");
      return null;
    }
  },

  updateNoteTags: async (id: string, tags: string[]) => {
    try {
      await db.updateNoteTags(id, tags);
      const { currentNote } = get();
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, tags } : n)),
        currentNote:
          currentNote?.id === id ? { ...currentNote, tags } : currentNote,
      }));
    } catch (error) {
      console.error("Failed to update note tags", error);
      get().showToast("Could not update tags");
    }
  },

  reloadChangedNotes: async (files) => {
    if (files.length === 0) return;
    const { currentNote, sortOrder } = get();

    // Refresh notes list from vault
    const rawNotes = await db.listNotes();
    const notes = db.sortNotes(rawNotes, sortOrder);
    set({ notes });

    // If current note changed externally, reload it with full image resolution
    if (currentNote) {
      const currentFilename = db.getNoteFilename(currentNote.id);
      if (currentFilename && files.some((f) => f.filename === currentFilename)) {
        const refreshed = await db.getNote(currentNote.id);
        if (refreshed) set({ currentNote: refreshed });
      }
    }
  },

  // Navigation
  goBack: async () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const noteId = history[newIndex];
    const note = await db.getNote(noteId);
    if (note) {
      set({ currentNote: note, historyIndex: newIndex });
    }
  },

  goForward: async () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const noteId = history[newIndex];
    const note = await db.getNote(noteId);
    if (note) {
      set({ currentNote: note, historyIndex: newIndex });
    }
  },

  canGoBack: () => {
    const { historyIndex } = get();
    return historyIndex > 0;
  },

  canGoForward: () => {
    const { history, historyIndex } = get();
    return historyIndex < history.length - 1;
  },

  // Auto-resize
  autoResizeEnabled: localStorage.getItem("autoResize") !== "false",
  toggleAutoResize: () => {
    set((state) => {
      const next = !state.autoResizeEnabled;
      localStorage.setItem("autoResize", String(next));
      return { autoResizeEnabled: next };
    });
  },

  // Layout
  layoutMode: _initPrefs.layoutMode === "split" ? "split" : "single",
  splitPanelWidth:
    typeof _initPrefs.splitPanelWidth === "number"
      ? _initPrefs.splitPanelWidth
      : 300,
  setLayoutMode: (mode) => {
    set({ layoutMode: mode });
    _savePrefs({ layoutMode: mode });
  },
  setSplitPanelWidth: (width) => {
    set({ splitPanelWidth: width });
    _savePrefs({ splitPanelWidth: width });
  },

  // Sort
  sortOrder: initSortOrder(),
  setSortOrder: (order) => {
    const { notes } = get();
    set({ sortOrder: order, notes: db.sortNotes(notes, order) });
    _savePrefs({ sortOrder: order });
  },

  // Hub
  hubConfig: { url: "", hasToken: false, connected: false },
  setHubConfig: (config) => set({ hubConfig: config }),
  testHubConnection: async () => {
    const result = await bridge.hubTestConnection();
    set((state) => ({
      hubConfig: { ...state.hubConfig, connected: result.ok },
    }));
  },

  // Note publishing
  updateNoteVisibility: async (id, visibility) => {
    try {
      await db.updateNoteVisibility(id, visibility);
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, visibility } : n)),
        currentNote: state.currentNote?.id === id ? { ...state.currentNote, visibility } : state.currentNote,
      }));
      // Push to Hub if visibility changed to public/unlisted
      if (visibility !== "private") {
        const result = await bridge.syncRunNow();
        if (!result.ok) {
          set((state) => ({ hubConfig: { ...state.hubConfig, connected: false } }));
        }
        checkSyncConflicts(result, get);
      }
    } catch (error) {
      console.error("Failed to update note visibility", error);
      get().showToast("Could not update visibility");
    }
  },

  updateNoteEditPermission: async (id, editPermission) => {
    try {
      await db.updateNoteEditPermission(id, editPermission);
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, edit_permission: editPermission } : n)),
        currentNote: state.currentNote?.id === id ? { ...state.currentNote, edit_permission: editPermission } : state.currentNote,
      }));
      // Sync to push updated permissions to Hub
      const result = await bridge.syncRunNow();
      checkSyncConflicts(result, get);
    } catch (error) {
      console.error("Failed to update note edit permission", error);
      get().showToast("Could not update edit permission");
    }
  },
}));

function checkSyncConflicts(result: Record<string, unknown>, get: () => AppState) {
  // Swift returns summary.push.conflicts (count) or summary.manifest.conflictCount
  const summary = result?.summary as Record<string, unknown> | undefined;
  const pushConflicts = (summary?.push as Record<string, unknown>)?.conflicts;
  const manifestConflicts = (summary?.manifest as Record<string, unknown>)?.conflictCount;
  const count = Number(pushConflicts ?? manifestConflicts ?? 0);
  if (count > 0) {
    get().showToast(`Conflict resolved — Hub version applied for ${count} note${count > 1 ? "s" : ""}`);
  }
}
