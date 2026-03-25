import { useEffect, useRef, useCallback, useState } from "react";
import { bridge } from "./lib/bridge";
import Toolbar from "./components/Toolbar/Toolbar";
import Editor from "./components/Editor/Editor";
import FormatBar from "./components/Editor/FormatBar";
import NotesBrowser from "./components/NotesBrowser/NotesBrowser";
import ActionPanel from "./components/ActionPanel/ActionPanel";
import Toast from "./components/Toast/Toast";
import FindBar from "./components/Editor/FindBar";
import ShortcutSettings from "./components/ShortcutSettings/ShortcutSettings";
import SplitLayout from "./components/SplitLayout/SplitLayout";
import TagBar from "./components/TagBar/TagBar";
import { useAppEditor } from "./hooks/useEditor";
import { useAppStore } from "./stores/appStore";
import { extractTitle } from "./lib/utils";
import { copyAsMarkdown, jsonToMarkdown } from "./lib/export";
import { markdownToHtml } from "./lib/import";
import * as db from "./lib/db";

function App() {
  const editor = useAppEditor();
  const [browseOpen, setBrowseOpen] = useState(false);
  const [actionPanelOpen, setActionPanelOpen] = useState(false);
  const [actionPanelOpenWithSubmenuId, setActionPanelOpenWithSubmenuId] = useState<string | null>(null);
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [shortcutSettingsOpen, setShortcutSettingsOpen] = useState(false);
  const [globalShortcut, setGlobalShortcut] = useState("Alt+N");
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [title, setTitle] = useState("Untitled");
  const [browseDefaultSearch, setBrowseDefaultSearch] = useState("");
  const [tagBarVisible, setTagBarVisible] = useState(false);
  const {
    currentNote,
    loading,
    loadNotes,
    createNote,
    updateCurrentNoteContent,
    notes,
    switchToNote,
    goBack,
    goForward,
    togglePin,
    showToast,
    autoResizeEnabled,
    toggleAutoResize,
    layoutMode,
    setLayoutMode,
    reloadChangedNotes,
  } = useAppStore();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNoteIdRef = useRef<string | null>(null);
  const importContentRef = useRef<string | null>(null);
  // Tracks whether setContent is being called during a note switch (suppresses auto-save)
  const isLoadingNoteRef = useRef(false);
  // Tracks the previous note id so we can flush its pending save before switching
  const prevNoteIdForFlush = useRef<string | null>(null);

  // Track current note ID without re-triggering editor effects
  useEffect(() => {
    currentNoteIdRef.current = currentNote?.id ?? null;
  }, [currentNote?.id]);

  // Initialize: load notes, open most recent or create first note
  useEffect(() => {
    (async () => {
      await loadNotes();
    })();
  }, [loadNotes]);

  // After notes load, open the most recent one (or create one)
  const initialized = useRef(false);
  useEffect(() => {
    if (loading || initialized.current) return;
    initialized.current = true;
    if (notes.length > 0) {
      switchToNote(notes[0].id);
    } else {
      createNote().catch((error) => {
        console.error("Failed to create initial note", error);
      });
    }
  }, [loading, notes, switchToNote, createNote]);

  // When currentNote changes, load its content into editor
  useEffect(() => {
    if (!editor || !currentNote) return;
    // Clear search when switching notes
    editor.commands.clearSearch();
    setFindBarOpen(false);

    // --- Flush any pending save for the note we're leaving ---
    // At this point the editor still has the OLD note's content; currentNote.id is already new.
    const prevId = prevNoteIdForFlush.current;
    prevNoteIdForFlush.current = currentNote.id;
    if (debounceRef.current !== null && prevId && prevId !== currentNote.id) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      // Save old content immediately so images / resize are not lost
      const oldContent = jsonToMarkdown(editor.getJSON());
      db.updateNote(prevId, oldContent).catch(console.error);
    }

    // Suppress the editor update event fired by setContent so it doesn't re-arm the debounce
    isLoadingNoteRef.current = true;

    // If we have imported HTML content, use it instead of the note's stored content
    if (importContentRef.current) {
      const html = importContentRef.current;
      importContentRef.current = null;
      editor.commands.clearCollapsedHeadings();
      editor.commands.setContent(html);
      isLoadingNoteRef.current = false;
      requestAnimationFrame(() => editor.commands.focus("end"));
      return;
    }

    const noteContent = currentNote.content || "";
    if (noteContent) {
      if (noteContent.trimStart().startsWith("{")) {
        // Legacy TipTap JSON (notes migrated from localStorage)
        try {
          const json = JSON.parse(noteContent);
          editor.commands.clearCollapsedHeadings();
          editor.commands.setContent(json);
        } catch {
          editor.commands.clearCollapsedHeadings();
          editor.commands.setContent("");
        }
      } else {
        // Vault mode: Markdown content (images already resolved to base64 by Swift)
        editor.commands.clearCollapsedHeadings();
        editor.commands.setContent(markdownToHtml(noteContent));
      }
    } else {
      editor.commands.clearCollapsedHeadings();
      editor.commands.setContent("");
    }

    isLoadingNoteRef.current = false;
    // Auto-focus editor at end when switching notes
    requestAnimationFrame(() => editor.commands.focus("end"));
  }, [editor, currentNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep title in sync with saved/current note content
  useEffect(() => {
    setTitle(extractTitle(currentNote?.content ?? ""));
  }, [currentNote?.content]);

  // Update title live from editor content (before debounce save completes)
  useEffect(() => {
    if (!editor) return;
    const syncTitle = () => {
      setTitle(extractTitle(JSON.stringify(editor.getJSON())));
    };
    syncTitle();
    editor.on("update", syncTitle);
    return () => {
      editor.off("update", syncTitle);
    };
  }, [editor]);

  // Auto-save on editor changes with 300ms debounce
  const handleUpdate = useCallback(() => {
    if (!editor || !currentNoteIdRef.current) return;
    // Suppress saves triggered by setContent during a note switch
    if (isLoadingNoteRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const content = jsonToMarkdown(editor.getJSON());
      updateCurrentNoteContent(content);
    }, 300);
  }, [editor, updateCurrentNoteContent]);

  useEffect(() => {
    if (!editor) return;
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor, handleUpdate]);

  const createNoteAndFocus = useCallback(
    async (closePanels: boolean) => {
      try {
        await createNote();
        if (closePanels) {
          setBrowseOpen(false);
          setActionPanelOpen(false);
        }
        editor?.commands.focus();
      } catch (error) {
        console.error("Failed to create note", error);
      }
    },
    [createNote, editor],
  );

  const openBrowse = useCallback(() => {
    setActionPanelOpen(false);
    setBrowseOpen(true);
    loadNotes().catch((error) => {
      console.error("Failed to refresh notes before opening browser", error);
    });
  }, [loadNotes]);

  const handleImportFile = useCallback(async () => {
    const markdown = await bridge.importFile();
    if (!markdown) return;
    importContentRef.current = markdownToHtml(markdown);
    await createNote();
    showToast("Note imported");
  }, [createNote, showToast]);

  const saveGlobalShortcut = useCallback(
    async (shortcut: string) => {
      await bridge.setGlobalShortcut(shortcut);
      setGlobalShortcut(shortcut);
      showToast(`Global shortcut set: ${shortcut}`);
    },
    [showToast],
  );

  // Load global shortcut from backend
  useEffect(() => {
    bridge
      .getGlobalShortcut()
      .then((shortcut) => {
        if (shortcut) setGlobalShortcut(shortcut);
      })
      .catch((error) => {
        console.error("Failed to load global shortcut", error);
      });
  }, []);

  // Reload notes changed externally when window gains focus (vault sync)
  useEffect(() => {
    let lastLoad = Date.now();
    const handler = async () => {
      try {
        const changed = await bridge.vaultGetChanges(lastLoad);
        lastLoad = Date.now();
        if (changed.length > 0) {
          await reloadChangedNotes(changed);
        }
      } catch {
        /* ignore focus-reload errors */
      }
    };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [reloadChangedNotes]);

  // Listen for tray "New Note" event
  useEffect(() => {
    return bridge.on("tray-new-note", () => {
      createNoteAndFocus(true);
    });
  }, [createNoteAndFocus]);

  // Listen for tray "Set Global Shortcut" event
  useEffect(() => {
    return bridge.on("tray-open-shortcut-settings", () => {
      setBrowseOpen(false);
      setActionPanelOpen(false);
      setShortcutSettingsOpen(true);
    });
  }, []);

  // Listen for tray layout change (has detail payload, so use addEventListener directly)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ mode: string }>).detail;
      if (detail?.mode === "single" || detail?.mode === "split") {
        setLayoutMode(detail.mode);
      }
    };
    window.addEventListener("tray-set-layout", handler);
    return () => window.removeEventListener("tray-set-layout", handler);
  }, [setLayoutMode]);

  // Listen for "Filter by Tag" action from ActionPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const tag = (e as CustomEvent<{ tag: string }>).detail?.tag;
      if (!tag) return;
      setBrowseDefaultSearch(tag);
      setBrowseOpen(true);
      setActionPanelOpen(false);
    };
    window.addEventListener("open-notes-with-tag", handler);
    return () => window.removeEventListener("open-notes-with-tag", handler);
  }, []);

  // Window position persistence
  useEffect(() => {
    const saved = localStorage.getItem("windowPos");
    if (saved) {
      try {
        const { x, y } = JSON.parse(saved);
        bridge.setWindowPosition(x, y).catch(() => {});
      } catch {
        /* ignore invalid saved position */
      }
    }
  }, []);

  // Flush any pending auto-save when the layout changes.
  // The layout change causes EditorContent to unmount/remount (different tree position),
  // which re-initializes the TipTap view. We save before that happens so content is safe.
  useEffect(() => {
    if (debounceRef.current === null || !currentNoteIdRef.current || !editor) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
    const content = jsonToMarkdown(editor.getJSON());
    db.updateNote(currentNoteIdRef.current, content).catch(console.error);
  }, [layoutMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush any pending auto-save when the action panel opens.
  // Actions in the panel (New Note, Browse Notes) trigger db.listNotes() which
  // reads disk — if the debounce hasn't fired yet, the image write races with that
  // read. Flushing immediately before any panel action eliminates that window.
  useEffect(() => {
    if (!actionPanelOpen || debounceRef.current === null || !currentNoteIdRef.current || !editor) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
    const content = jsonToMarkdown(editor.getJSON());
    db.updateNote(currentNoteIdRef.current, content).catch(console.error);
  }, [actionPanelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize window when layout mode changes (and on first load)
  useEffect(() => {
    const resize = async () => {
      try {
        const targetWidth = layoutMode === "split" ? 1000 : 650;
        const currentSize = await bridge.getWindowSize();
        const maxH = Math.max(700, Math.floor(window.screen.availHeight * 0.8));
        const nextHeight = Math.max(700, Math.min(currentSize.height, maxH));
        if (
          currentSize.width !== targetWidth ||
          currentSize.height !== nextHeight
        ) {
          await bridge.setWindowSize(targetWidth, nextHeight);
        }
        // Notify Swift to update tray menu checkmarks
        bridge.notifyLayoutMode(layoutMode);
      } catch {
        /* ignore resize errors */
      }
    };
    resize();
  }, [layoutMode]);

  // Auto-resize window height to content
  useEffect(() => {
    if (!autoResizeEnabled || !editor || actionPanelOpen || browseOpen) return;

    const prosemirror = document.querySelector(".ProseMirror");
    if (!prosemirror) return;

    const doResize = async () => {
      const contentH = prosemirror.scrollHeight;
      const formatBarEl = document.querySelector("[data-format-bar]");
      const formatH = formatBarEl
        ? formatBarEl.getBoundingClientRect().height
        : 0;
      const findBarEl = document.querySelector("[data-find-bar]");
      const findBarH = findBarEl
        ? findBarEl.getBoundingClientRect().height
        : 0;
      const total = 48 + contentH + 24 + formatH + findBarH;
      const maxH = window.screen.availHeight * 0.8;
      const clamped = Math.max(700, Math.min(Math.ceil(total), maxH));
      try {
        const targetWidth = layoutMode === "split" ? 1000 : 650;
        await bridge.setWindowSize(targetWidth, clamped);
      } catch {
        /* ignore resize errors */
      }
    };

    let timer: number;
    const scheduleResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(doResize, 50);
    };

    scheduleResize();

    const resizeObs = new ResizeObserver(scheduleResize);
    resizeObs.observe(prosemirror);

    const mutObs = new MutationObserver(scheduleResize);
    mutObs.observe(prosemirror, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      resizeObs.disconnect();
      mutObs.disconnect();
      clearTimeout(timer);
    };
  }, [autoResizeEnabled, editor, actionPanelOpen, browseOpen, layoutMode]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      try {
        const key = (e.key ?? "").toLowerCase();
        const mod = e.metaKey || e.ctrlKey;

        if (shortcutSettingsOpen) {
          if (key === "escape") {
            e.preventDefault();
            setShortcutSettingsOpen(false);
          }
          return;
        }

        // ⌘, — Open Preferences (separate window)
        if (mod && !e.shiftKey && !e.altKey && (key === "," || e.code === "Comma")) {
          e.preventDefault();
          bridge.openPreferences();
          return;
        }
        // ⌥⌘, — Toggle Format Bar
        if (mod && e.altKey && !e.shiftKey && (key === "," || e.code === "Comma")) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("toggle-format-bar"));
          return;
        }

        // Esc / ⌘W — Close browse view first, then action panel, otherwise hide window
        if (key === "escape" || (mod && !e.shiftKey && !e.altKey && (key === "w" || e.code === "KeyW"))) {
          e.preventDefault();
          if (browseOpen) {
            setBrowseOpen(false);
            editor?.commands.focus();
            return;
          }
          if (actionPanelOpen) {
            // ActionPanel's own handler manages Escape (back from submenu, or close).
            // Don't hide the window here — just let it do its thing.
            return;
          }
          setFindBarOpen(false);
          bridge.hideWindow();
          return;
        }
        // ⌘K — Action Panel
        if (mod && !e.shiftKey && !e.altKey && (key === "k" || e.code === "KeyK")) {
          e.preventDefault();
          setActionPanelOpen((o) => !o);
          setBrowseOpen(false);
        }
        // ⌘P — Browse Notes
        if (mod && !e.shiftKey && !e.altKey && (key === "p" || e.code === "KeyP")) {
          e.preventDefault();
          setBrowseOpen((isOpen) => {
            const next = !isOpen;
            if (next) {
              loadNotes().catch((error) => {
                console.error("Failed to refresh notes from shortcut", error);
              });
            }
            return next;
          });
          setActionPanelOpen(false);
        }
        // ⌘F — Find in Note
        if (mod && !e.shiftKey && !e.altKey && (key === "f" || e.code === "KeyF")) {
          e.preventDefault();
          setFindBarOpen(true);
        }
        // ⌘L — Toggle Link
        if (mod && !e.shiftKey && !e.altKey && (key === "l" || e.code === "KeyL")) {
          e.preventDefault();
          if (editor) {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
            } else {
              const url = window.prompt("URL:");
              if (url) {
                editor.chain().focus().setLink({ href: url }).run();
              }
            }
          }
        }
        // ⌘N — New Note
        if (mod && !e.shiftKey && !e.altKey && (key === "n" || e.code === "KeyN")) {
          e.preventDefault();
          createNoteAndFocus(true);
        }
        // ⌘D — Duplicate Note
        if (mod && !e.shiftKey && !e.altKey && (key === "d" || e.code === "KeyD")) {
          e.preventDefault();
          const note = useAppStore.getState().currentNote;
          if (note) {
            useAppStore.getState().duplicateNote(note.id).then(() => {
              showToast("Note duplicated");
              editor?.commands.focus();
            });
          }
        }
        // ⌘[ — Navigate Back
        if (mod && !e.shiftKey && !e.altKey && (key === "[" || e.code === "BracketLeft")) {
          e.preventDefault();
          goBack();
        }
        // ⌘] — Navigate Forward
        if (mod && !e.shiftKey && !e.altKey && (key === "]" || e.code === "BracketRight")) {
          e.preventDefault();
          goForward();
        }
        // ⇧⌘P — Toggle Pin
        if (mod && e.shiftKey && !e.altKey && (key === "p" || e.code === "KeyP")) {
          e.preventDefault();
          const note = useAppStore.getState().currentNote;
          if (note) {
            togglePin(note.id).then(() => {
              showToast(note.is_pinned ? "Note unpinned" : "Note pinned");
            });
          }
        }
        // ⇧⌘C — Copy as Markdown
        if (mod && e.shiftKey && !e.altKey && (key === "c" || e.code === "KeyC")) {
          e.preventDefault();
          if (editor) {
            const tags = useAppStore.getState().currentNote?.tags ?? [];
            copyAsMarkdown(editor, tags).then(() => showToast("Copied as Markdown"));
          }
        }
        // ⇧⌘E — Export (open action panel with Export submenu)
        if (mod && e.shiftKey && !e.altKey && (key === "e" || e.code === "KeyE")) {
          e.preventDefault();
          setActionPanelOpenWithSubmenuId("export-file");
          setActionPanelOpen(true);
        }
        // ⇧⌘/ — Toggle auto-resize
        if (mod && e.shiftKey && !e.altKey && (key === "/" || e.code === "Slash")) {
          e.preventDefault();
          const wasEnabled = useAppStore.getState().autoResizeEnabled;
          toggleAutoResize();
          showToast(wasEnabled ? "Auto-sizing disabled" : "Auto-sizing enabled");
        }
        // ⌘S — Toggle Split Layout
        if (mod && !e.shiftKey && !e.altKey && (key === "s" || e.code === "KeyS")) {
          e.preventDefault();
          const current = useAppStore.getState().layoutMode;
          useAppStore.getState().setLayoutMode(current === "split" ? "single" : "split");
        }
        // ⌘0-⌘9 — Quick access to pinned notes
        if (mod && !e.shiftKey && !e.altKey && e.key >= "0" && e.key <= "9") {
          const pinnedNotes = useAppStore
            .getState()
            .notes.filter((n) => n.is_pinned);
          const idx = e.key === "0" ? 9 : parseInt(e.key) - 1;
          if (idx < pinnedNotes.length) {
            e.preventDefault();
            switchToNote(pinnedNotes[idx].id);
          }
        }
      } catch (error) {
        console.error("Shortcut handler error", error);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [
    createNoteAndFocus,
    editor,
    goBack,
    goForward,
    togglePin,
    showToast,
    switchToNote,
    toggleAutoResize,
    loadNotes,
    browseOpen,
    actionPanelOpen,
    shortcutSettingsOpen,
  ]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#232323]">
        <p className="text-sm text-[#E5E5E7]/40">Loading...</p>
      </div>
    );
  }

  const chromeActive = isPointerInside;

  // Shared overlays rendered in both layout modes
  const overlays = (
    <>
      <NotesBrowser
        open={browseOpen}
        defaultSearch={browseDefaultSearch}
        onClose={() => {
          setBrowseOpen(false);
          setBrowseDefaultSearch("");
        }}
      />
      <ActionPanel
        open={actionPanelOpen}
        onClose={() => {
          setActionPanelOpen(false);
          setActionPanelOpenWithSubmenuId(null);
        }}
        openWithSubmenuId={actionPanelOpenWithSubmenuId}
        onConsumedSubmenuId={() => setActionPanelOpenWithSubmenuId(null)}
        editor={editor}
        onNewNote={() => {
          createNoteAndFocus(true);
        }}
        onBrowseNotes={openBrowse}
        onImportFile={handleImportFile}
      />
      <ShortcutSettings
        open={shortcutSettingsOpen}
        currentShortcut={globalShortcut}
        onClose={() => setShortcutSettingsOpen(false)}
        onSave={saveGlobalShortcut}
      />
      <Toast />
    </>
  );

  const toolbar = (
    <Toolbar
      title={title}
      chromeActive={chromeActive}
      onBrowse={openBrowse}
      onNewNote={() => {
        createNoteAndFocus(true);
      }}
      onActionPanel={() => setActionPanelOpen(true)}
      onToggleTagBar={() => setTagBarVisible((v) => !v)}
      tagBarVisible={tagBarVisible}
    >
      {tagBarVisible && <TagBar inline />}
    </Toolbar>
  );

  // Editor content only (no toolbar) — in split mode toolbar is full-width above
  const editorPaneContent = (
    <>
      {findBarOpen && editor && (
        <FindBar editor={editor} onClose={() => setFindBarOpen(false)} />
      )}
      <Editor editor={editor} />
      <FormatBar editor={editor} chromeActive={chromeActive} />
    </>
  );

  return (
    <div
      className="relative flex h-screen flex-col bg-[#232323]"
      onMouseEnter={() => setIsPointerInside(true)}
      onMouseLeave={() => setIsPointerInside(false)}
    >
      {toolbar}
      <div className={`flex min-h-0 flex-1 ${layoutMode === "split" ? "overflow-hidden" : ""}`}>
        {layoutMode === "split" && <SplitLayout />}
        <div className={`flex flex-col flex-1 ${layoutMode === "split" ? "min-w-0 overflow-hidden" : ""}`}>
          {editorPaneContent}
        </div>
      </div>
      {overlays}
    </div>
  );
}

export default App;
