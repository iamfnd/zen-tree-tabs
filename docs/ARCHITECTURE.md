# Architecture

How Zen Tree Tabs works, and which Zen/Firefox internals it depends on. Read this before changing the script or when a Zen update breaks something.

## Loading

- fx-autoconfig loads `chrome/JS/zen-tree-tabs.uc.js` into every browser window. The `// @ignorecache` header makes it read the file from disk at each start (no startup-cache clearing).
- The whole script is one async IIFE. It first calls `window.ZenTreeTabs?.destroy()`, so loading it again replaces the running instance — that's how **Ctrl+Alt+Shift+R** hot-reloads: it loads `chrome://userscripts/content/zen-tree-tabs.uc.js?<timestamp>` (a `chrome:` URL; the subscript loader refuses `file:` URLs) and the new copy tears the old one down. If loading fails, the old instance keeps running.
- All listeners are registered with one `AbortController` signal; `destroy()` aborts it and removes the stylesheet.
- The CSS is read from `chrome/resources/zen-tree-tabs.css` with `IOUtils` and applied as a `data:` URI author sheet, so it's never cached either.

## Data model

- **Nodes.** The tree is made of nodes: a plain tab, or a whole split view (Zen's `tab-group[split-view-group]`).
- **State lives on tabs**, as attributes mirrored to SessionStore custom tab values:
  - `ztt-id` — stable id per tab,
  - `ztt-parent` — the parent's id (any tab id of the parent node),
  - `ztt-collapsed`.
  All tabs of a split carry the same parent/collapsed values (`syncNodeState`), and a child may point at either tab of a split, so a split keeps its children when one tab leaves.
- **Saved values win until a tab is claimed.** Firefox hands a restored tab its saved values *after* creating it (after `TabOpen`), and `SSTabRestoring` only fires once its content loads — never, for tabs that stay unloaded. So the mod treats SessionStore as the truth for any tab it hasn't `claim()`ed yet: claiming reads the saved values onto the tab first; only claimed tabs are ever written back. Nothing is claimed before `SessionStore.promiseAllWindowsRestored`, `SSWindowRestored` re-claims a window, and `TabOpen` decides "new vs restored" in a microtask (after Firefox applied any saved values). `SSTabRestoring` never deletes saved values.
- **Only your actions rewrite the tree.** Move repairs, pin/unpin subtree moves and folder exits run only within 1.5 s of trusted user input (mouse, key, menu command, drop) and after startup; Zen moves/pins tabs on its own during restore, sync and space changes.
- **Sections.** Each space has two independent trees: pinned tabs and normal tabs (`sectionOf()`). Tabs in Zen folders, Essentials, Glance and Zen's empty tab are not tree tabs (`isTreeTab()`).

## Rendering

`render()` is a pure function of tab order + parent ids (it never rewrites parent ids):

- Walk each section's nodes in order with a stack of open ancestors. A node nests only if its parent is on the stack, i.e. directly above its subtree; otherwise it renders at depth 0. A node without a parent clears the stack.
- Depth → `--zen-folder-indent` on the node element (Zen's own indent property — its CSS applies `margin-inline-start: var(--zen-folder-indent)` to tabs and split groups when the sidebar is expanded). The element gets `ztt-indented` so we only ever remove indents we set (Zen folders use the same property).
- Guide lines are a `::before` on nested nodes, drawn in the indent margin with a repeating gradient (one line per level, centred in its column). Tabs sit edge to edge, so lines join up across a subtree.
- The collapse button and hidden-count badge are injected into `.tab-content` before the close button, not into the favicon stack. The HTML button supports Enter/Space and exposes `aria-expanded`; capture-phase mouse handlers keep collapse clicks out of tab selection/drag handling. The chevron takes no width off-hover, allowing the title to extend; hovering the tab or focusing the button restores its width. Chevron and close/reset widths, padding and opacity ease over 180 ms in both directions; reduced-motion users get instant changes. Close/reset buttons keep their native display rules but shrink off-hover instead of using layout collapse, avoiding a jump in the title.
- The chevron uses a `currentColor` mask to match the close icon without SVG context-fill crossing an HTML/XUL boundary. The badge centers its text with `text-align` / `align-content` and trims font leading with `text-box: trim-both cap alphabetic`, centering the visible digits rather than the font's line box.
- Collapsed subtrees are hidden with `ztt-hidden` → `display: none`. Selecting a hidden tab expands its ancestors.

Renders are batched with `requestAnimationFrame` (`scheduleRender`).

## Placement rules

A slot is a gap between two nodes `prev` / `next` of a section. Valid depths for something dropped there:

- `maxDepth` = depth(prev) + 1 (child of prev), or depth(prev) if prev is collapsed,
- `minDepth` = min(depth(next), maxDepth) — shallower would cut `next` off from its parent.

The parent at depth *d* is prev's ancestor at depth *d − 1* (`parentAt`).

- **Opening:** links → last child of the opener; Ctrl+T → per `newtab-position` (sibling/child/end). The tab is moved right after the base's whole subtree.
- **Closing:** children re-link to another tab of the same split if one remains, otherwise to the closed tab's parent (one level up).
- **Foreign moves** (Zen, keyboard shortcuts, unpreviewed drops) go through `repair()`: keep the parent if still valid at the new spot, else take `minDepth`; the subtree is carried along.
- **Pin/unpin** from anywhere moves the node and its whole subtree to the other section's top level (`on_TabPinChanged` → `carrySubtree`, which pins/unpins descendants first). If Zen made it an Essential or put it in a folder instead, its children move up a level.

## Drag & drop

The mod owns the preview while a tree node is dragged over a tab list:

1. **Pickup:** `dragstart` finds the tab via `event.composedPath()` (drags can start on a text node or a split's frame). Fallback: the first `dragover` reads the dragged tab from Firefox's drag data (`application/x-moz-tabbrowser-tab`) and the start position from `tab._dragData.screenX`.
2. **Preview** (every `dragover`): the section comes from which container the pointer is over (`space.pinnedTabsContainer` / `space.tabsContainer` + the empty space below); the gap from the pointer's height (upper/lower half of the node under it); the depth from sideways distance since pickup (`DRAG_LEVEL_PX`, equal to the indent). We draw `#ztt-drop-line`, hide Zen's `#zen-drag-indicator`, highlight the future parent (or the space header for depth 0), and `preventDefault()` so the drop always fires.
3. **Hand-off to Zen:** the preview clears when Zen shows its split preview (`zen-split-fake-tab` exists), when the pointer is over/next to a `zen-folder`, or outside the tab lists — Zen's own drop applies there.
4. **Drop:** after Zen's own drop handler has run (`setTimeout 0`), `applyDrop` pins/unpins as needed, moves the node + subtree to the previewed slot and sets the parent. If the drop made a split, the split takes the target tab's place in the tree.

Optional: `block-tab-split` turns Zen's drag-over split off while dragging by flipping the **default** of `zen.splitView.enable-drag-over-split` (never written to disk; skipped if the user set that pref).

## Zen / Firefox internals relied on

Checked against Zen 1.22.3b (Firefox 156). If something breaks after an update, start here.

| Internal | Used for |
|---|---|
| `gZenWorkspaces.promiseInitialized`, `.activeWorkspace`, `.activeWorkspaceElement` (`.tabsContainer`, `.pinnedTabsContainer`, `.indicator`) | waiting for Zen, drop areas, space header highlight |
| `zen-workspace` elements' `.pinnedTabsContainer` / `.tabsContainer` children | `allTabs()`: every space's tabs. **`gBrowser.tabs` only holds the active space's tabs** in Zen 1.22, so it can't be used for the tree |
| `zen-workspace-id`, `zen-essential`, `zen-glance-tab`, `zen-empty-tab` tab attributes | sections and exclusions |
| `--zen-folder-indent` + Zen's `margin-inline-start` rule | indentation |
| `tab-group[split-view-group]`, `group.tabs` | split nodes |
| `gBrowser.moveTabsAfter/Before`, `moveTabAfter` (Zen-patched to treat splits as units) | placing nodes |
| `gBrowser.pinTab/unpinTab` (Zen pins whole splits via `gZenFolders.handleTabPin`) | section moves |
| `tab.openerTab` (set before `TabOpen` fires) | link nesting |
| `SessionStore.get/set/deleteCustomTabValue`, `SSTabRestoring` | persistence |
| `#zen-drag-indicator`, `zen-split-fake-tab`, `zen-folder` | drag hand-off |
| `tab._dragData.screenX`, drag type `application/x-moz-tabbrowser-tab` | drag pickup fallback |
| `.tab-content`, `.tab-close-button`, `.tab-reset-button` | trailing collapse button & count, native close/reset layout |

## Tests

`tests/scenarios.mjs` evaluates the script against a mocked `gBrowser`/Zen (tabs, split groups, pinned/normal containers with fake geometry, a fake drop line) and prints the resulting tree after each scenario (`·` = one level, `[A|B]` = split, `|` = pinned/normal boundary). It covers nesting, closing, drag depth picking, drops into the empty space, text-node drag starts, splits, split-by-drag, pinned trees, cross-section drags and new-tab placement. Collapse clicks have assertions for descendant visibility, sibling isolation and selection; the other scenarios print output for inspection. Native layout and keyboard activation require a Zen chrome smoke check.
