// Runs src/zen-tree-tabs.uc.js against a mocked gBrowser / Zen (tabs, split
// groups, pinned + normal containers with fake geometry) and prints the tree
// after each scenario. `·` = one level, `[A|B]` = split view, and in the
// pinned scenarios `|` separates the pinned and normal trees.
//
//   node tests/scenarios.mjs [path/to/zen-tree-tabs.uc.js]
import fs from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const scriptPath = process.argv[2] ?? fileURLToPath(new URL("../src/zen-tree-tabs.uc.js", import.meta.url));
const src = fs.readFileSync(scriptPath, "utf8");
const H = 30; // tab height
class Tab {
  constructor(name) { this.name = name; this.classList = { contains: c => c === "tabbrowser-tab" }; this.documentGlobal = globalThis.window; this.a = { "zen-workspace-id": "s1" }; this.pinned = false; this.isConnected = true;
    this.style = { setProperty() {}, removeProperty() {} }; }
  getAttribute(k) { return k in this.a ? this.a[k] : null; } setAttribute(k, v) { this.a[k] = String(v); }
  removeAttribute(k) { delete this.a[k]; } hasAttribute(k) { return k in this.a; }
  toggleAttribute(k, on) { on ? (this.a[k] = "") : delete this.a[k]; } querySelector() { return null; }
  closest(sel) { return sel === ".tabbrowser-tab" ? this : null; }
  get selected() { return gBrowser.selectedTab === this; }
}
class Split {
  constructor(name, members) { this.name = name; this.a = { "split-view-group": "" }; this.tabs = members; this.group = null; this.isConnected = true;
    this.style = { setProperty() {}, removeProperty() {}, getPropertyValue() { return ""; } }; for (const t of members) t.group = this; }
  getAttribute(k) { return k in this.a ? this.a[k] : null; } setAttribute(k, v) { this.a[k] = String(v); }
  removeAttribute(k) { delete this.a[k]; } hasAttribute(k) { return k in this.a; }
  toggleAttribute(k, on) { on ? (this.a[k] = "") : delete this.a[k]; }
}
const groups = [];
const store = new Map(); let uid = 0;
const handlers = {}; const on = (t, f) => (handlers[t] ??= []).push(f);
const L = new Proxy({}, { get: (_, t) => ev => (handlers[t] ?? []).forEach(f => f({ type: t, isTrusted: true, ...ev })) });
const userInput = () => L.mousedown({ target: { closest: () => null }, button: 0 });
const realNow = Date.now; let clockShift = 0; Date.now = () => realNow() + clockShift;
const lastInputReset = () => (clockShift += 10000);
let restoreDone; const allRestored = new Promise(r => (restoreDone = r));
const tabs = [];
const indicator = { a: { orientation: "horizontal" }, style: { top: "", props: {}, setProperty(k, v) { this.props[k] = v; } },
  getAttribute(k) { return this.a[k] ?? null; }, setAttribute(k, v) { this.a[k] = String(v); }, removeAttribute(k) { delete this.a[k]; } };
const g = globalThis;
let fakeSplit = null; const container = { querySelectorAll: () => [] }; const pinnedBox = { querySelectorAll: () => [] }; const spaceEl = {}; const header = new (class { constructor() { this.a = {}; } getAttribute(k) { return this.a[k] ?? null; } setAttribute(k, v) { this.a[k] = v; } removeAttribute(k) { delete this.a[k]; } hasAttribute(k) { return k in this.a; } })();
g.window = { addEventListener: (t, f) => on(t, f),
  windowUtils: { getBoundsWithoutFlushing: el => {
    const pinRows = (() => { const r = []; for (const t of tabs) { const n = t.group ?? t; if (t.pinned && r.at(-1) !== n && !n.hasAttribute("ztt-hidden")) r.push(n); } return r.length; })();
    if (el === pinnedBox) return { top: 0, bottom: pinRows * H, left: 0, right: 250, height: pinRows * H };
    if (el === container) return { top: pinRows * H, bottom: 1000, left: 0, right: 250, height: 1000 - pinRows * H };
    if (el === spaceEl) return { top: 0, bottom: 2000, left: 0, right: 250, height: 2000 };
    const rows = []; for (const t of tabs) { const n = t.group ?? t; if (rows.at(-1) !== n && !n.hasAttribute("ztt-hidden")) rows.push(n); }
    const i = rows.indexOf(el); const depth = R.get(el)?.depth ?? 0;
    return i < 0 ? { top: -999, height: 0, left: 0, right: 0 } : { top: i * H, height: H, bottom: (i + 1) * H, left: 10 + depth * 14, right: 250 };
  }, loadSheetUsingURIString() {}, AUTHOR_SHEET: 2 } };
g.gZenWorkspaces = g.window.gZenWorkspaces = { promiseInitialized: Promise.resolve(), activeWorkspace: "s1", activeWorkspaceElement: Object.assign(spaceEl, { tabsContainer: container, pinnedTabsContainer: pinnedBox, indicator: header }) };
g.UC_API = { Windows: { waitWindowLoading: async () => {} } };
g.Services = { prefs: { getStringPref: (n, d) => (n === "zen-tree-tabs.newtab-position" ? globalThis.NEWTAB ?? d : d), getBoolPref: (n, d) => d, prefHasUserValue: () => false, getDefaultBranch: () => ({ getBoolPref: n => defaults[n], setBoolPref: (n, v) => (defaults[n] = v) }) }, uuid: { generateUUID: () => `{u${++uid}}` }, dirsvc: { get: () => ({ append() {}, path: "/x" }) } };
g.Ci = {}; g.IOUtils = { readUTF8: async () => "", stat: async () => ({ lastModified: 0 }) };
g.ChromeUtils = { importESModule: () => ({ SessionStore: { promiseAllWindowsRestored: allRestored,
  getCustomTabValue: (t, k) => store.get(t)?.[k], setCustomTabValue: (t, k, v) => ((store.get(t) ?? store.set(t, {}).get(t))[k] = v),
  deleteCustomTabValue: (t, k) => delete store.get(t)?.[k] } }) };
let line = null; const defaults = { "zen.splitView.enable-drag-over-split": true };
g.gNavToolbox = { appendChild: el => (line = el) };
g.document = { querySelector: sel => (sel === "zen-split-fake-tab" ? fakeSplit : null), querySelectorAll: () => [...tabs, header].filter(x => x.hasAttribute("ztt-drop-parent")), documentElement: { getAttribute: () => "true", setAttribute() {}, removeAttribute() {}, style: { setProperty() {} } },
  createXULElement: () => ({}), createElement: () => ({ style: {}, remove() { line = null; } }),
  getElementById: id => (id === "ztt-drop-line" ? line : null) };
g.requestAnimationFrame = f => f();
g.queueMicrotask = f => f();
g.setTimeout = f => f();
const move = (t, i) => { tabs.splice(tabs.indexOf(t), 1); tabs.splice(i, 0, t); L.TabMove?.({ target: t }); };
const elTabs = el => el.tabs ?? [el]; const lift = el => el.group ?? el;
const place = (el, i) => { el = lift(el); const ts = elTabs(el); for (const t of ts) tabs.splice(tabs.indexOf(t), 1); tabs.splice(i(), 0, ...ts); for (const t of ts) L.TabMove({ target: t }); };
g.gBrowser = { get tabs() { return tabs; }, get tabGroups() { return groups; }, isTab: el => el instanceof Tab, selectedTabs: [], selectedTab: null,
  tabContainer: { addEventListener: (t, f) => on(t, f), querySelectorAll: () => tabs.filter(t => t.hasAttribute("ztt-drop-parent")) },
  pinTab: t => { if (t.pinned) return; t.pinned = true; const n = tabs.filter(x => x.pinned && x !== t).length; tabs.splice(tabs.indexOf(t), 1); tabs.splice(n, 0, t); L.TabPinned({ type: "TabPinned", target: t }); },
  unpinTab: t => { if (!t.pinned) return; t.pinned = false; tabs.splice(tabs.indexOf(t), 1); tabs.splice(tabs.filter(x => x.pinned).length, 0, t); L.TabUnpinned({ type: "TabUnpinned", target: t }); },
  moveTabAfter: (t, a) => place(t, () => tabs.indexOf(elTabs(lift(a)).at(-1)) + 1),
  moveTabsAfter: (ts, a) => { for (const t of [...ts].reverse()) g.gBrowser.moveTabAfter(t, a); },
  moveTabsBefore: (ts, b) => { for (const t of ts) place(t, () => tabs.indexOf(elTabs(lift(b))[0])); } };

const named = n => tabs.find(t => t.name === n);
let R;
const show = label => { ZT.render(); const rows = []; for (const t of tabs) { const n = t.group ?? t; if (rows.at(-1) !== n) rows.push(n); }
  console.log(label.padEnd(44), rows.map(n => `${"·".repeat(R.get(n)?.depth ?? 0)}${n.tabs ? "[" + n.tabs.map(t => t.name).join("|") + "]" : n.name}`).join(" ")); };
const open = (name, opener, at) => { const t = new Tab(name); tabs.splice(at ?? tabs.length, 0, t); t.openerTab = opener; L.TabOpen({ target: t }); return t; };

tabs.push(new Tab("P"), new Tab("R"));
eval(src); for (let i = 0; i < 10; i++) await null;
restoreDone(); for (let i = 0; i < 30; i++) await null;
const ZT = window.ZenTreeTabs; R = ZT.rendered;
const P = named("P"); open("C1", P, 1); open("C2", P, 2); open("C1a", named("C1"), 2);
show("setup:");

// Drag: Zen draws the line at boundary index b (between visible tabs b-1 and b); then Zen moves the tab there.
function drag(name, b, dx, zenMovesTo, path = [], textStart = false) {
  const t = named(name);
  t.documentGlobal = window; t._dragData = { screenX: 100 };
  // textStart: the drag begins on a text node, so no tab is in the event path.
  L.dragstart({ target: t, screenX: 100, composedPath: () => (textStart ? [{}] : [{ classList: { contains: c => c === "tabbrowser-tab" } }].map(() => Object.assign(t, { classList: { contains: c => c === "tabbrowser-tab" } }))) });
  const splitDuring = defaults["zen.splitView.enable-drag-over-split"];
  // Optional wild pointer path first (fast moves, sideways while crossing rows).
  const dt = { dropEffect: "", mozGetDataAt: () => t }; const pd = () => {};
  for (const [x, y] of path) L.dragover({ clientX: x, clientY: y, screenX: x, dataTransfer: dt, preventDefault: pd });
  const ev = { clientX: 100 + dx, clientY: b * H, screenX: 100 + dx, dataTransfer: dt, preventDefault: pd };
  L.dragover(ev);
  const preview = drag_slot_depth(); const hl = [...tabs, ...groups].find(x => x.hasAttribute("ztt-drop-parent")); const par = hl ? (hl.name ?? "?") : (header.hasAttribute("ztt-drop-parent") ? "SPACE" : "-");
  g.setTimeout = f => { if (zenMovesTo != null) { const ts = elTabs(lift(t)); for (const x of ts) tabs.splice(tabs.indexOf(x), 1); tabs.splice(Math.min(zenMovesTo, tabs.length), 0, ...ts); } f(); };
  L.drop(ev); g.setTimeout = f => f(); L.dragend({});
  show(`drag ${name} @${b} dx=${dx} [line=${preview} parent=${par} split=${splitDuring}->${defaults["zen.splitView.enable-drag-over-split"]}]:`);
}
const drag_slot_depth = () => (line ? Math.round((parseFloat(line.style.left) - 6 - 10) / 14) : "none");
drag("R", 1, 0, 1);      // between P and C1 -> must become child of P (nest intact)
drag("R", 6, 0, 6);      // back to the end, root
drag("R", 6, 14, 5);     // end, one indent right -> sibling of C2
drag("R", 6, 28, 5);     // two indents right -> child of C2
drag("R", 6, -28, 5);    // dragged left out of the tree -> top level, space header highlighted
drag("C1a", 1, 0, 1);    // depth-2 tab dragged up between P and C1 with no sideways motion -> clamps to child of P
drag("C1", 6, 0, 5);     // C1 (with C1a) to the end -> root, C1a follows
drag("P", 2, 0, 1);      // P dropped inside its own subtree -> nothing breaks
drag("C2", 1, 14, 3, [[180, 150], [40, 20], [230, 90], [90, 10]]);
drag("C1a", 9, 14, null);  // below the last tab, in the empty space: still a tree drop
drag("R", 1, 0, 1, [], true); // drag started on title text: picked up from Firefox's drag data // fast zig-zag then settle: still picks depth

// Ctrl+T with C2 selected: nests under C2.
gBrowser.selectedTab = named("C2"); open("N", null); show("ctrl+t on C2:");
// A foreign move (e.g. keyboard move) of a root tab into P's subtree -> adopts a valid parent.
userInput(); move(named("C1"), 1); show("foreign move C1 between P and R:");
// Close a parent: children up a level.
const C2 = named("C2"); C2.closing = true; L.TabClose({ target: C2 }); tabs.splice(tabs.indexOf(C2), 1); show("close C2:");

console.log("--- split views ---");
tabs.length = 0; groups.length = 0;
const A = new Tab("A"); tabs.push(A); L.TabOpen({ target: A });
const B = open("B", A, 1); const X = open("X", A, 2); const Y = open("Y", X, 3); const Z = new Tab("Z"); tabs.push(Z); L.TabOpen({ target: Z });
show("setup (X opened from A, Y from X):");
const SP = new Split("XY", [X, Y]); groups.push(SP); L.TabGrouped({ type: "TabGrouped", target: X }); show("X+Y become a split (nested under A):");
const Q = open("Q", Y, tabs.indexOf(Y) + 1); show("link from Y -> child of the split:");
drag("X", 5, -14, 4);   show("drag split to the end, one level left:");
drag("Z", 3, 14, 3);    show("drag Z above the split (sibling of B):");
drag("Z", 4, 0, 4);     show("drag Z right below the split -> its child:");
X.closing = true; L.TabClose({ target: X }); tabs.splice(tabs.indexOf(X), 1); SP.tabs = [Y]; show("close X: children stay with the split:");

console.log("--- split by dragging onto a tab ---");
tabs.length = 0; groups.length = 0;
const M = new Tab("M"); tabs.push(M); L.TabOpen({ target: M });
const M1 = open("M1", M, 1); const K = new Tab("K"); tabs.push(K); L.TabOpen({ target: K }); const K1 = open("K1", K, 3);
show("setup:");
// Drag K onto M1's middle: Zen shows its split preview, then on drop makes [M1|K] where M1 was.
L.dragstart({ target: K, screenX: 100, composedPath: () => [K] });
fakeSplit = {}; const dt2 = { dropEffect: "", mozGetDataAt: () => K };
L.dragover({ clientX: 100, clientY: 45, screenX: 100, dataTransfer: dt2, preventDefault() { throw new Error("must not claim the drop during split preview"); } });
const line2 = document.getElementById("ztt-drop-line");
g.setTimeout = f => { tabs.splice(tabs.indexOf(K), 1); tabs.splice(tabs.indexOf(M1) + 1, 0, K); const sp = new Split("M1K", [M1, K]); groups.push(sp); L.TabGrouped({ type: "TabGrouped", target: K }); fakeSplit = null; f(); };
L.drop({ clientX: 100, clientY: 45, screenX: 100, dataTransfer: dt2 }); g.setTimeout = f => f(); L.dragend({});
show(`split made (tree line during preview: ${line2 ? "shown" : "none"}):`);

console.log("--- pinned tabs (| = section boundary) ---");
const showS = label => { ZT.render(); const rows = []; for (const t of tabs) { const n = t.group ?? t; if (rows.at(-1) !== n) rows.push(n); }
  const fmt = n => `${"·".repeat(R.get(n)?.depth ?? 0)}${n.tabs ? "[" + n.tabs.map(t => t.name).join("|") + "]" : n.name}`;
  console.log(label.padEnd(50), rows.filter(n => (n.tabs?.[0] ?? n).pinned).map(fmt).join(" "), " | ", rows.filter(n => !(n.tabs?.[0] ?? n).pinned).map(fmt).join(" ")); };
tabs.length = 0; groups.length = 0;
const mk2 = (name, pinned, opener) => { const t = new Tab(name); t.pinned = pinned; tabs.splice(opener ? tabs.indexOf(opener) + 1 : tabs.length, 0, t); t.openerTab = opener; L.TabOpen({ target: t }); return t; };
const p1 = mk2("p1", true); const p2 = mk2("p2", true, p1); p2.setAttribute("ztt-parent", p1.getAttribute("ztt-id"));
const n1 = mk2("n1", false); const n1a = mk2("n1a", false, n1); const n1b = mk2("n1b", false, n1a); const m = mk2("m", false);
showS("setup:");
userInput(); gBrowser.pinTab(n1); showS("pin n1 (context menu): its subtree follows:");
userInput(); gBrowser.unpinTab(p1); showS("unpin p1: p1 and p2 move to normal, together:");
// Cross-section drag: m (normal) into the pinned tree, right under n1a, one level deeper than n1a.
{
  const t = m; L.dragstart({ target: t, screenX: 100, composedPath: () => [t] });
  const dt = { dropEffect: "", mozGetDataAt: () => t };
  const ev = { clientX: 100, clientY: 2 * H, screenX: 100 + 28, dataTransfer: dt, preventDefault() {}, target: {} };
  L.dragover(ev);
  g.setTimeout = f => { gBrowser.pinTab(t); f(); };   // Zen pins it as part of its drop
  L.drop(ev); g.setTimeout = f => f(); L.dragend({});
}
showS("drag m into pinned, under n1a (2 levels in):");
// And back: drag n1 (pinned, with subtree) into the normal tree as a child of p1.
{
  const t = n1; L.dragstart({ target: t, screenX: 100, composedPath: () => [t] });
  const dt = { dropEffect: "", mozGetDataAt: () => t };
  const rowsPinned = tabs.filter(x => x.pinned).length;
  const ev = { clientX: 100, clientY: (rowsPinned + 1) * H, screenX: 100 + 14, dataTransfer: dt, preventDefault() {}, target: {} };
  L.dragover(ev);
  g.setTimeout = f => { gBrowser.unpinTab(t); f(); };
  L.drop(ev); g.setTimeout = f => f(); L.dragend({});
}
showS("drag n1 tree back into normal, under p1:");

console.log("--- ctrl+t placement ---");
tabs.length = 0; groups.length = 0;
const T = new Tab("T"); tabs.push(T); L.TabOpen({ target: T });
const T1 = open("T1", T, 1); const T1a = open("T1a", T1, 2); const U = new Tab("U"); tabs.push(U); L.TabOpen({ target: U });
show("setup:");
for (const mode of ["sibling", "child", "end"]) {
  globalThis.NEWTAB = mode; gBrowser.selectedTab = T1; const t = open(`new-${mode}`, null);
  show(`ctrl+t on T1, mode=${mode}:`);
}
globalThis.NEWTAB = undefined; gBrowser.selectedTab = T; open("new-default", null); show("ctrl+t on T (root), default:");

console.log("--- restart safety ---");
{
  tabs.length = 0; groups.length = 0;
  const A2 = new Tab("A2"); tabs.push(A2); L.TabOpen({ target: A2 });
  const B2 = open("B2", A2, 1);
  gBrowser.selectedTab = A2; const C3 = open("C3", null);
  show("setup (C3 via Ctrl+T on A2):");
  lastInputReset();                                   // no recent user input
  move(B2, 2); show("Zen moves B2 below C3 by itself -> flat, parent kept:");
  move(B2, 1); show("...Zen moves it back -> nested again:");

  // "Undo close tab": Firefox creates the tab (TabOpen), then hands it its
  // saved values in the same task. The saved id/parent must win, and the tab
  // must not be moved to where a Ctrl+T tab would go.
  gBrowser.selectedTab = C3;
  const X = new Tab("X"); tabs.splice(2, 0, X);      // restored at its old index, under A2
  globalThis.queueMicrotask = f => Promise.resolve().then(f);
  L.TabOpen({ target: X }); store.set(X, { "ztt-id": "saved-x", "ztt-parent": A2.getAttribute("ztt-id") });
  await null; await null; globalThis.queueMicrotask = f => f();
  show(`undo-close X (saved under A2, while on C3), id=${X.getAttribute("ztt-id")}:`);
}
{
  // Saved values that only become readable after startup (Zen settling a
  // space late): the tab nests once Zen reports its spaces restored.
  tabs.length = 0; groups.length = 0;
  const L1 = new Tab("L1"); const L2 = new Tab("L2"); tabs.push(L1, L2);
  store.set(L1, { "ztt-id": "late-1" });
  L.AfterWorkspacesSessionRestore({}); show("before saved values arrive:");
  store.set(L2, { "ztt-id": "late-2", "ztt-parent": "late-1" });
  L.AfterWorkspacesSessionRestore({}); show("after Zen's spaces-restored event:");
}
console.log("--- inactive spaces (Zen 1.22: gBrowser.tabs = active space only) ---");
{
  tabs.length = 0; groups.length = 0;
  const mkIn = (name, space) => { const t = new Tab(name); t.a["zen-workspace-id"] = space; return t; };
  const a1 = mkIn("a1", "s1"), a2 = mkIn("a2", "s1"), b1 = mkIn("b1", "s2"), b2 = mkIn("b2", "s2"), b3 = mkIn("b3", "s2");
  store.set(a1, { "ztt-id": "a1" }); store.set(a2, { "ztt-id": "a2", "ztt-parent": "a1" });
  store.set(b1, { "ztt-id": "b1" }); store.set(b2, { "ztt-id": "b2", "ztt-parent": "b1" }); store.set(b3, { "ztt-id": "b3", "ztt-parent": "b2" });
  const spaceEls = [
    { pinnedTabsContainer: { children: [] }, tabsContainer: { children: [a1, a2] } },
    { pinnedTabsContainer: { children: [] }, tabsContainer: { children: [b1, b2, b3] } },
  ];
  tabs.push(a1, a2);                                  // only the active space is in gBrowser.tabs
  const realQSA = document.querySelectorAll;
  document.querySelectorAll = sel => (sel === "zen-workspace" ? spaceEls : realQSA(sel));
  L.AfterWorkspacesSessionRestore({});
  const d = t => R.get(t)?.depth ?? 0;
  console.log(`active s1: a1(${d(a1)}) a2(${d(a2)})   inactive s2: b1(${d(b1)}) b2(${d(b2)}) b3(${d(b3)})`);
  document.querySelectorAll = realQSA;
}

// Collapse clicks hide the branch, not its siblings, and never select an
// unrelated parent. Collapsing the active branch must leave focus visible.
{
  tabs.length = 0; groups.length = 0;
  const parent = new Tab("parent"); const child = new Tab("child");
  const grandchild = new Tab("grandchild"); const sibling = new Tab("sibling");
  tabs.push(parent, child, grandchild, sibling);
  ZT.setParent(child, parent); ZT.setParent(grandchild, child); ZT.render();
  const twisty = { closest: () => parent };
  const click = () => L.click({
    target: { closest: sel => sel === ".ztt-twisty" ? twisty : null },
    button: 0, stopPropagation() {}, preventDefault() {},
  });
  gBrowser.selectedTab = sibling;
  click();
  assert.equal(parent.hasAttribute("ztt-collapsed"), true);
  assert.equal(child.hasAttribute("ztt-hidden"), true);
  assert.equal(grandchild.hasAttribute("ztt-hidden"), true);
  assert.equal(sibling.hasAttribute("ztt-hidden"), false);
  assert.equal(gBrowser.selectedTab, sibling);
  click();
  assert.equal(child.hasAttribute("ztt-hidden"), false);
  assert.equal(grandchild.hasAttribute("ztt-hidden"), false);
  assert.equal(gBrowser.selectedTab, sibling);
  gBrowser.selectedTab = grandchild;
  click();
  assert.equal(gBrowser.selectedTab, parent);
  assert.equal(parent.hasAttribute("ztt-hidden"), false);
  console.log("collapse click: branch visibility and selection assertions passed");
}
