import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const collapsibleHeadingsKey = new PluginKey<Set<number>>("collapsibleHeadings");

function isSupportedHeading(node: { type: { name: string }; attrs: { level?: number } }) {
  return (
    node.type.name === "heading" &&
    (node.attrs.level === 1 || node.attrs.level === 2 || node.attrs.level === 3)
  );
}

function buildDecorations(doc: Parameters<typeof DecorationSet.create>[0], collapsed: Set<number>) {
  const decorations: Decoration[] = [];
  const headings: Array<{ pos: number; level: number; nodeSize: number }> = [];

  doc.forEach((node, pos) => {
    if (!isSupportedHeading(node)) return;
    headings.push({
      pos,
      level: node.attrs.level as number,
      nodeSize: node.nodeSize,
    });
  });

  for (const heading of headings) {
    const isCollapsed = collapsed.has(heading.pos);
    decorations.push(
      Decoration.node(heading.pos, heading.pos + heading.nodeSize, {
        class: `collapsible-heading${isCollapsed ? " is-collapsed" : ""}`,
        "data-heading-level": String(heading.level),
      }),
    );

    decorations.push(
      Decoration.widget(
        heading.pos + 1,
        () => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "heading-collapse-toggle";
          button.contentEditable = "false";
          button.draggable = false;
          button.dataset.headingToggle = "true";
          button.dataset.headingPos = String(heading.pos);
          button.setAttribute(
            "aria-label",
            isCollapsed ? "Expand section" : "Collapse section",
          );
          button.setAttribute("title", isCollapsed ? "Expand section" : "Collapse section");
          button.textContent = isCollapsed ? "▸" : "▾";
          return button;
        },
        { side: -1 },
      ),
    );

    if (!isCollapsed) continue;

    const start = heading.pos + heading.nodeSize;
    let end = doc.content.size;

    for (const candidate of headings) {
      if (candidate.pos <= heading.pos) continue;
      if (candidate.level <= heading.level) {
        end = candidate.pos;
        break;
      }
    }

    doc.forEach((node, pos) => {
      const nodeEnd = pos + node.nodeSize;
      if (pos >= start && nodeEnd <= end) {
        decorations.push(
          Decoration.node(pos, nodeEnd, {
            class: "collapsed-heading-content",
          }),
        );
      }
    });
  }

  return DecorationSet.create(doc, decorations);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    collapsibleHeadings: {
      toggleHeadingCollapse: (pos: number) => ReturnType;
      clearCollapsedHeadings: () => ReturnType;
    };
  }
}

export const CollapsibleHeadings = Extension.create({
  name: "collapsibleHeadings",

  addCommands() {
    return {
      toggleHeadingCollapse:
        (pos: number) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          tr.setMeta(collapsibleHeadingsKey, { type: "toggle", pos });
          dispatch(tr);
          return true;
        },

      clearCollapsedHeadings:
        () =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          tr.setMeta(collapsibleHeadingsKey, { type: "clear" });
          dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: collapsibleHeadingsKey,
        state: {
          init: () => new Set<number>(),
          apply(tr, value, _oldState, newState) {
            let next = new Set<number>();

            for (const pos of value) {
              const mapped = tr.mapping.mapResult(pos, 1);
              if (!mapped.deleted) next.add(mapped.pos);
            }

            const meta = tr.getMeta(collapsibleHeadingsKey) as
              | { type: "toggle"; pos: number }
              | { type: "clear" }
              | undefined;

            if (meta?.type === "clear") {
              next = new Set<number>();
            }

            if (meta?.type === "toggle") {
              const mappedPos = tr.mapping.map(meta.pos, 1);
              if (next.has(mappedPos)) next.delete(mappedPos);
              else next.add(mappedPos);
            }

            for (const pos of Array.from(next)) {
              const node = newState.doc.nodeAt(pos);
              if (!node || !isSupportedHeading(node)) {
                next.delete(pos);
              }
            }

            return next;
          },
        },
        props: {
          decorations(state) {
            const collapsed = collapsibleHeadingsKey.getState(state) ?? new Set<number>();
            return buildDecorations(state.doc, collapsed);
          },
          handleDOMEvents: {
            mousedown(view, event) {
              const target = event.target as HTMLElement | null;
              const button = target?.closest("[data-heading-toggle='true']") as
                | HTMLElement
                | null;
              const pos = button?.dataset.headingPos ? Number(button.dataset.headingPos) : NaN;
              if (!button || Number.isNaN(pos)) return false;

              event.preventDefault();
              view.dispatch(view.state.tr.setMeta(collapsibleHeadingsKey, { type: "toggle", pos }));
              return true;
            },
          },
        },
      }),
    ];
  },
});
