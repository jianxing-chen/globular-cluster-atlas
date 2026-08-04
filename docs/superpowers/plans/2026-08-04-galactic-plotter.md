# Galactic Plotter + Homepage Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent APJ-style figure workbench (`plotter/`) plus a unified `webdata/` data layer, and redesign the homepage as an app hub with dual entry cards.

**Architecture:** Three deliverables in one flow: (1) migrate browser data into `webdata/` (single export script, no duplication), (2) a zero-dependency Canvas/SVG plotting app that renders publication-quality ApJ-style figures from user-selected clusters and parameters, (3) homepage hero/Apps-section/nav redesign linking to both apps.

**Tech Stack:** Plain HTML/CSS/JS (classic scripts, no modules, no build), Canvas 2D + hand-written SVG generator, existing `gc_data.js` data, Playwright + system Chrome for headless verification.

## Global Constraints

- All web apps must run from `file://` double-click AND GitHub Pages — no ES modules, no fetch of local files, no external CDN at runtime. (viz already meets this; plotter must too.)
- Zero runtime dependencies: no chart libraries, no framework.
- Data single-source: `scripts/export_viz_data.py` is the ONLY generator of all `webdata/*.js` files; app directories never hand-edit data.
- Browser data lives in `webdata/`; `data/` remains Python-pipeline-only (raw TSV + processed csv/json/pkl).
- plotter must be 100% English UI; ApJ style: serif font (Georgia/"Times New Roman" fallback), four-side black frame, inward ticks, no grid lines, caption `Fig. 1.— …`.
- Plotter parameter set (X/Y/color/size dropdowns share this registry): `dist, rgc, feh, mv, V, ebv, bv?, vr, pmra, pmde, mass, ml, rh, sigma0, vesc, logtrh, c, ecc, rperi, rapo, zmax, nstar`. NOTE: `bv` is NOT in gc_data fields (confirmed: 28 fields, no `bv`) — drop `bv` from the registry; the 22 usable params are: dist, rgc, feh, mv, V, ebv, vr, pmra, pmde, mass, ml, rh, sigma0, vesc, logtrh, c, ecc, rperi, rapo, zmax, nstar (21) + `l` (Galactic longitude) and `b` (latitude) available too — final registry: dist, rgc, feh, mv, V, ebv, l, b, vr, pmra, pmde, mass, ml, rh, sigma0, vesc, logtrh, c, ecc, rperi, rapo, zmax, nstar (23 params).
- GC field names in data (exact, from `gc_data.js`): `id, name, ra, dec, l, b, dist, dist_src, x, y, z, rgc, V, MV, feh, ebv, vr, pmra, pmde, mass, ml, rh, sigma0, vesc, logtrh, c, nstar, orbit` where `orbit = {x,y,z (arrays of 300), rperi, rapo, ecc, zmax, retro}`. Orbit scalar params live inside `c.orbit.*`.
- Display name helper (already in viz/app.js): main name + alias, e.g. `M13 · NGC 6205`; derive from `id`/`name` fields.
- The `viz/index.html` script tags MUST be updated to `../webdata/gc_data.js` and `../webdata/streams_data.js` as part of Task 1, and the 3D app must still pass headless smoke test afterwards.

---

### Task 1: Unified webdata/ layer + export script extension

**Files:**
- Create: `webdata/` (directory), `webdata/plotter_data.js` (generated)
- Modify: `scripts/export_viz_data.py` (output dir + new file), `viz/index.html:322-323` (script src)
- Move: `viz/gc_data.js` → `webdata/gc_data.js`, `viz/streams_data.js` → `webdata/streams_data.js` (git mv)
- Test: headless smoke of `viz/index.html` via file:// (must show 176 clusters, zero console errors)

**Interfaces:**
- Produces: `webdata/plotter_data.js` defining `const PLOTTER_DATA = {meta:{...}, clusters:[{...}]}` where each cluster carries ALL fields EXCEPT `orbit.x/y/z` arrays; orbit scalars kept as `ecc, rperi, rapo, zmax, retro` flat on the cluster object (drop the `orbit` wrapper for plotter simplicity).
- Produces: `scripts/export_viz_data.py` now writes `webdata/gc_data.js`, `webdata/streams_data.js`, `webdata/plotter_data.js`.

- [ ] **Step 1: Update `scripts/export_viz_data.py`**

Change output dir `VIZ` → `WEB = os.path.join(os.path.dirname(__file__), "..", "webdata")`; keep `gc_data.js` and `streams_data.js` emission identical but into `WEB`. Add plotter emission: for each cluster, build dict with all scalar fields plus orbit scalars flattened (`c["ecc"]=o["ecc"]`, `c["rperi"]=o["r_peri_kpc"]`, `c["rapo"]=o["r_apo_kpc"]`, `c["zmax"]=o["z_max_kpc"]`, `c["retro"]=o["retro"]` when orbit exists), drop `x`,`y`,`z` galactic position? NO — keep `x,y,z` (galactocentric, useful as params) but drop `orbit` wrapper. Emit `const PLOTTER_DATA = ...;` to `WEB/plotter_data.js`.

- [ ] **Step 2: Move existing data files and update viz references**

```bash
cd /Users/jianxing/Documents/Zcode/GlobularClusterAtlas
git mv viz/gc_data.js webdata/gc_data.js
git mv viz/streams_data.js webdata/streams_data.js
```
Edit `viz/index.html` lines 322-323 to:
```html
<script src="../webdata/gc_data.js"></script>
<script src="../webdata/streams_data.js"></script>
```

- [ ] **Step 3: Run export + verify sizes**

```bash
cd scripts && python3 export_viz_data.py
ls -la ../webdata/
```
Expected: three files; `plotter_data.js` ≲ 150 KB; `gc_data.js` ≈ 884 KB.

- [ ] **Step 4: Headless smoke of migrated 3D app (file://, no special flags)**

Playwright + system Chrome loading `file:///.../viz/index.html`; assert `GC_DATA.clusters.length===176`, loader hidden, zero `pageerror`/console errors. Use the same pattern as earlier session tests (no `--allow-file-access-from-files` needed for classic scripts).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(webdata): unified data layer — move gc/streams data, add plotter_data.js, update viz paths"
```

---

### Task 2: plotter page skeleton + dark UI + data load

**Files:**
- Create: `plotter/index.html`, `plotter/plotter.js` (skeleton with clear module section comments), `plotter/style.css`? — NO, inline `<style>` in index.html per spec (no assets dir).
- Test: headless load file:// → zero errors, left panel + canvas visible, no horizontal overflow at 1280×860.

**Interfaces:**
- Produces: global `const P = { ... }` plotter namespace? Simpler: plain top-level functions in one IIFE; page exposes nothing to window except reading `PLOTTER_DATA`.
- Produces: `plotter/index.html` loads, in order: `../webdata/plotter_data.js`, then `plotter.js` (classic scripts).
- Produces: DOM ids used by later tasks: `#list-search`, `#cluster-list`, `#sel-count`, `#btn-all`, `#btn-clear`, `#btn-invert`, `#batch-feh-lo`, `#batch-feh-hi`, `#batch-rgc`, `#batch-mv`, `#btn-batch`, `#preset-sel`, `#chart-type` (segmented), `#x-param`, `#y-param`, `#color-param`, `#size-param`, `#color-mode`, `#bin-count`, `#log-x`, `#log-y`, `#err-bars`, `#overlay-group`, `#line-mode`, `#templates` (segmented), `#canvas-wrap`, `#plot-canvas`, `#caption-input`, `#btn-png`, `#btn-svg`, `#fig-no`.

- [ ] **Step 1: Write `plotter/index.html`**

Layout: left sidebar (~340px, scrollable, collapsible) with two sections — "SELECTION" (search, list, bulk buttons, batch filters, presets) and "PLOT" (chart type seg, param dropdowns, options, color mode, templates); right side: toolbar (export buttons + fig-no), `#canvas-wrap` with `#plot-canvas` (white bg), caption input below. Dark UI palette identical to viz (`#05070f` bg, `--acc:#7fd4ff`, panels `#0d1426`, serif for canvas only). Include `#legend`, `#colorbar` as absolutely-positioned divs INSIDE `#canvas-wrap` (canvas-drawn instead — see Task 6; no DOM legend needed). Keep minimal now; later tasks fill the JS.

- [ ] **Step 2: Write `plotter.js` skeleton**

IIFE; section comments: DATA · PARAM REGISTRY · SELECTION · CONFIG · RENDER · SVG · INTERACT · TEMPLATES · EXPORT. Define `PARAMS` registry (23 entries: `{id, label, unit, get(c), fmt(v)}`) with `get` extracting from cluster object (`c.dist`, `c.feh`, `c.ecc`, etc.). Define empty stubs `draw()`, `renderAxes(ctx)`, `renderScatter()`, `renderHist()`, `renderLine()`, `renderHeat()`, `svgEmit()`, `exportPNG()`, `exportSVG()` — all logging "stub" to console for now.

- [ ] **Step 3: Wire static UI → state, load data, initial draw**

`const DATA = PLOTTER_DATA.clusters;` render cluster list (Task 3 does full logic; here just render all rows unchecked with `main · alias` display). Set default config: chartType='scatter', X='rgc', Y='feh', color param 'feh', size 'mv', colorMode=false. Call `draw()` stub.

- [ ] **Step 4: Headless verify**

Load `file:///.../plotter/index.html`: zero pageerror; `#cluster-list` has 176 rows; `#plot-canvas` present; `document.documentElement.scrollWidth <= innerWidth`.

- [ ] **Step 5: Commit**

```bash
git add plotter/
git commit -m "feat(plotter): skeleton page, dark UI, param registry, data load"
```

---

### Task 3: Selection interaction (search · checkboxes · batch · presets)

**Files:**
- Modify: `plotter/plotter.js` (SELECTION section), `plotter/index.html` (fill selection controls if stubbed)
- Test: headless DOM assertions

**Interfaces:**
- Produces: `let selected = new Set()` (cluster ids); `function selCount()`, `function applySelection()` (re-render list check states + `#sel-count`), `function selectAll()/clearSel()/invertSel()`, `function batchSelect()` (reads `#batch-*` inputs, checks clusters satisfying ALL ranges; values `null` when inputs empty), `PRESETS = {messier, bright15, disc, halo, rich, poor}` (functions replacing selection), `function presetApply(name)`, `function renderList(filter='')`, `function matchDisplay(c, q)` (name/alias substring, case-insensitive).
- Display name: `const mainName = c => c.name && c.name.trim() ? c.name : c.id;` alias from id (`fmtId` style: `NGC6205` → `NGC 6205`); display string `mainName · alias` when different, else main.

- [ ] **Step 1: Implement SELECTION functions** (per Interfaces above). Messier preset: clusters whose display/alias matches `/^M\d+$/`; bright15: top 15 by `MV` (non-null); disc: `rgc<8`; halo: `rgc>=8`; rich: `feh>-1`; poor: `feh<-1.5`.

- [ ] **Step 2: Wire HTML controls** to these functions; list row = `<label><input type="checkbox" data-id> <span>display</span></label>`; row dims when filtered out by search.

- [ ] **Step 3: Headless test**

```js
// in page context:
document.getElementById('btn-all').click() → selCount()===176
document.getElementById('btn-clear').click() → selCount()===0
// set batch feh lo=-1 → batchSelect() → every selected has feh>-1 (count matches Python precompute)
// presets: presetApply('messier') → count matches Python list of M-numbered clusters
// search 'm13' → visible rows all contain m13; checkbox for NGC6205 toggles selected
```
Python precompute for expected counts (run once, paste numbers into plan? — instead assert invariants programmatically: e.g. for batch, verify `[...selected].every(id => cluster.feh > lo)`).

- [ ] **Step 4: Commit**

```bash
git add plotter/
git commit -m "feat(plotter): selection — search, checkboxes, bulk, batch filters, presets"
```

---

### Task 4: Plot config state + templates

**Files:**
- Modify: `plotter/plotter.js` (CONFIG + TEMPLATES sections), `plotter/index.html` (controls)
- Test: headless state assertions after clicking templates

**Interfaces:**
- Produces: `let cfg = { type:'scatter', x:'rgc', y:'feh', colorParam:'feh', sizeParam:'mv', colorMode:false, bins:30, logX:false, logY:false, errBars:false, overlay:'none', lineMode:'cdf', heatLog:false, density:false, heatBins:30 }`; `function setCfg(patch)` (merges + re-renders controls + draw); `TEMPLATES = [{name, apply()}]` ×6 per spec §7.
- Templates (exact): 
  1. `R_gc vs [Fe/H]` — setCfg({type:'scatter',x:'rgc',y:'feh'}), selectAll()
  2. `Metallicity distribution` — setCfg({type:'hist',x:'feh',bins:30}), selectAll()
  3. `Distance distribution` — setCfg({type:'hist',x:'dist',bins:25}), selectAll()
  4. `M_V vs Mass` — setCfg({type:'scatter',x:'mass',y:'mv',logX:true}), selectAll()
  5. `Eccentricity distribution` — setCfg({type:'hist',x:'ecc',bins:25}), select only clusters with `ecc!=null`
  6. `Pericentre vs Apocentre` — setCfg({type:'scatter',x:'rperi',y:'rapo'}), select only clusters with `rperi!=null`

- [ ] **Step 1: Implement CONFIG state + `setCfg`**; wire all dropdowns/segments/toggles to `setCfg` (param dropdowns populate from PARAMS labels; hide Y/color/size dropdowns when type==='hist'? — keep visible but unused for hist; simpler: disable them).

- [ ] **Step 2: Implement TEMPLATES** per above; segmented `#templates` buttons call `TEMPLATES[i].apply()`.

- [ ] **Step 3: Headless test** — click template 1: `cfg.type==='scatter' && cfg.x==='rgc' && cfg.y==='feh' && selCount()===176`; template 5: every selected has `ecc!=null`; template 2: `cfg.type==='hist'`.

- [ ] **Step 4: Commit**

```bash
git add plotter/
git commit -m "feat(plotter): config state + 6 science templates"
```

---

### Task 5: Canvas APJ renderer core (axes, ticks, labels, caption, legend, colorbar)

**Files:**
- Modify: `plotter/plotter.js` (RENDER section — axes infrastructure)
- Test: headless screenshot inspection (file://), assert canvas non-blank via pixel sampling (center pixel differs from white, some dark pixels present)

**Interfaces:**
- Produces: `function draw()` (clears canvas, computes layout: margins {l:64,r:16,t:12,b:44}, plot rect, calls renderAxes + type renderer + renderLegend + renderColorbar + caption update), `function niceTicks(min,max,nTicks=5)` → `{ticks:[...], step}` using 1-2-5 series, `function renderAxes(ctx, xScale, yScale)` (frame + inward ticks + labels), `function linScale(v,min,max,pad=0.05)` and `logScale(v,min,max)` returning pixel coords given rect; `function fmtTick(v, isLog)` (decimal ≤3 sig figs; log → `10^n` via `10^${exp}` text), `function updateCaption()` (builds "Fig. 1.— " + description; `#fig-no` editable number, `#caption-input` editable text; append "selected N clusters" and "missing M values skipped").
- Colors: grayscale default — frame/tick/label `#000`, series palette `['#000','#666','#aaa','#333']` with fill/hollow alternation; color mode palette: viridis-like via `function viridis(t)` returning `rgb(r,g,b)` (hardcode 6-stop lerp: #440154,#3b528b,#21918c,#5ec962,#fde725 — interpolate).

- [ ] **Step 1: Implement layout + `niceTicks` + `linScale/logScale` + `renderAxes`** (draw for a fake dataset: y = [0..100]). Assert visually via screenshot: frame box, inward major+minor ticks, axis labels "Galactocentric radius R_gc (kpc)" / "Metallicity [Fe/H] (dex)", serif font (`ctx.font = 'italic 14px Georgia, "Times New Roman", serif'` for variables).

- [ ] **Step 2: Implement `updateCaption`, `renderLegend`, `renderColorbar`** (colorbar drawn on canvas at right inside plot rect: gradient strip + min/max labels `fmtTick`; only when `cfg.colorMode`).

- [ ] **Step 3: Screenshot verify** — save `figures/_plot_axes.png`; check: white bg, black frame, inward ticks, legend absent (single group), colorbar absent; then set colorMode=true programmatically → colorbar visible.

- [ ] **Step 4: Commit**

```bash
git add plotter/
git commit -m "feat(plotter): APJ canvas core — axes, inward ticks, serif labels, caption, colorbar"
```

---

### Task 6: Four chart-type renderers

**Files:**
- Modify: `plotter/plotter.js` (RENDER — per-type functions)
- Test: screenshot per type + value assertions

**Interfaces:**
- Produces: `function dataFor(param)` → array of `{c, v}` for selected clusters with non-null v; `function renderScatter(ctx)`, `renderHist(ctx)`, `renderLine(ctx)`, `renderHeat(ctx)`; `function groupOf(c)` → 0/1 based on `cfg.overlay` ('none'→null, 'disc'→rgc<8, 'rich'→feh>-1); `function pointRadius(c)` (size mapping: `cfg.sizeParam` → r in [2.5,7] normalized by min/max of visible data; 'mv' default), `function pointColor(c)` (grayscale or viridis by `cfg.colorParam` normalized).
- Scatter: points as circles; hollow when `groupOf(c)===1` (stroke only) vs filled; error bars when `cfg.errBars` and Y in {dist, pmra, pmde, sigma0} using per-cluster errors — NOTE gc_data has NO error columns (only `e_pmRA/e_pmDE` were in source tables but not exported!). DECISION: error bars use fixed fractional values (dist: 5%, pmra/pmde: 0.05 mas/yr, sigma0: 10%) labeled "illustrative" in caption — documented limitation, avoids inventing data columns.
- Hist: bins from `cfg.bins`; group overlay: two series, gray fills (`#000`/`#bbb`) hollow-stroke; `cfg.density` normalizes to 1; `cfg.logY` log-scale y.
- Line: `cfg.lineMode` — 'cdf': step plot of cumulative fraction of chosen param; 'sorted': x vs y sorted by x, connected line; 'trend': N=cfg.bins bins, mean±1σ shaded band.
- Heat: `cfg.heatBins` grid, gray cell alpha by count (log when `cfg.heatLog`), outline frame.

- [ ] **Step 1: Implement `dataFor` + color/size/group helpers**
- [ ] **Step 2: Implement `renderScatter`** (+error bars) — verify: 47 Tuc point at (rgc≈7.6, feh≈−0.76) exists within 2 px of expected canvas coords (compute via scales in test).
- [ ] **Step 3: Implement `renderHist`** (single + overlay + density + logY)
- [ ] **Step 4: Implement `renderLine`** (cdf/sorted/trend)
- [ ] **Step 5: Implement `renderHeat`**
- [ ] **Step 6: Screenshot each type** (save `figures/_plot_scatter.png`, `_plot_hist.png`, `_plot_line.png`, `_plot_heat.png`); verify non-blank & plausible distributions; commit

```bash
git add plotter/
git commit -m "feat(plotter): scatter/histogram/line-cdf/heatmap renderers"
```

---

### Task 7: Interactions (hover · click · zoom · pan) + SVG/PNG export

**Files:**
- Modify: `plotter/plotter.js` (INTERACT + EXPORT + SVG sections)
- Test: headless interaction + export assertions

**Interfaces:**
- Produces: `function screenToData(x,y)` (inverse of scales), `function hitTest(x,y)` → cluster id (nearest within 12 px, scatter/line only; hist/heat return null), `function setHover(id)`, `function setFocus(id)` (highlights + scrolls list row into view + checks its checkbox), canvas listeners: mousemove (hover tooltip div `#tooltip` absolutely positioned), click (setFocus), wheel (zoom ×1.2 about cursor, re-plot), mousedown/mousemove/mouseup (pan by data delta), dblclick (reset view), `let view = {xmin,xmax,ymin,ymax}` (zoom/pan mutate view then draw).
- `function svgEmit()` → string: mirror draw calls (axis lines/ticks as `<line>`, labels as `<text font-family="Georgia, serif">`, points as `<circle>`/`<path>`, hist bars as `<rect>`, heat cells as `<rect fill="rgb(...)">`, colorbar as `<rect>`s + text); returns full `<svg xmlns=... viewBox="0 0 W H" width="W" height="H">…</svg>`.
- `function exportPNG()` — offscreen canvas at 3× scale (300 dpi equivalent), `toDataURL('image/png')` → download `plot_<type>_<YYYYMMDD>.png`; `function exportSVG()` — Blob download of svgEmit().

- [ ] **Step 1: Implement view state + zoom/pan/dblclick**
- [ ] **Step 2: Implement hover tooltip + click-to-focus (list scroll + checkbox sync)**
- [ ] **Step 3: Implement `svgEmit`** covering all four types (scatter: circles; hist: rects; line: polyline/path + band rects; heat: rects)
- [ ] **Step 4: Implement `exportPNG`/`exportSVG`** buttons
- [ ] **Step 5: Headless test** — hover over known point (47 Tuc screen coords from scales): tooltip contains "47 Tuc"; click: list row checked + scrolled; wheel: view xmin/xmax changed; dblclick: view reset; `exportSVG()` string length > 500 and starts with `<svg`; PNG dataURL prefix `data:image/png`.
- [ ] **Step 6: Commit**

```bash
git add plotter/
git commit -m "feat(plotter): interactions (hover/zoom/pan) + SVG/PNG export"
```

---

### Task 8: Homepage hub redesign

**Files:**
- Modify: `index.html` (hero buttons, new Apps section, nav), (no CSS file — inline style additions)
- Test: headless — both cards link correctly, nav has Apps anchor, no regressions (lightbox, sections), no horizontal overflow

- [ ] **Step 1: Hero** — primary buttons: `Launch 3D Atlas` → `viz/index.html` (main), `Open Plotter` → `plotter/` (ghost). Keep hero big screenshot (click → viz).
- [ ] **Step 2: Apps section** — `<section class="wrap" id="apps">` after hero/stats: two `.appcard` side-by-side (grid, minmax(320px,1fr)): 3D Explorer card (img `figures/viz_screenshot_home.png`, title, 1-line desc, button `→ viz/`) and Plotter card (img `figures/viz_screenshot_plotter.png` — placeholder: use `figures/viz_screenshot_arms.png` until Task 9 screenshot lands, then swap), desc "APJ-style figure workbench — check clusters, choose parameters, export publication figures", button `→ plotter/`. Cards styled like `.src` cards (panel bg, border, hover lift).
- [ ] **Step 3: Nav** — links: `Overview · Apps · Data · Sources · Galaxy · Validation · Gallery · Reproduce`; CTA nav button text "Apps" href `#apps`.
- [ ] **Step 4: Headless verify** — `#apps` section has 2 cards; card hrefs correct; click nav `#apps` anchor scrolls (scrollY changes); lightbox still works on gallery; no hScroll at 1280 and 390 widths.
- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(home): app-hub redesign — dual entry cards, Apps section, nav update"
```

---

### Task 9: Screenshots · README (EN+zh-CN) · final verification · push

**Files:**
- Modify: `README.md`, `README.zh-CN.md`
- Create: `figures/viz_screenshot_plotter.png`, `figures/viz_screenshot_plotter_hist.png` (headless captures); swap placeholder in Task 8 if needed

- [ ] **Step 1: Capture plotter screenshots** (headless: template 1 scatter w/ color mode + template 2 hist) → `figures/viz_screenshot_plotter*.png`; update `index.html` Apps card image if placeholder used.
- [ ] **Step 2: README.md** — add "Plotter" to Highlights table row (or new row "Figure workbench"); Quick Start: add plotter URL + one-line usage; structure tree: add `webdata/` + `plotter/`; gallery add plotter screenshots; entry table: add `.../plotter/`.
- [ ] **Step 3: README.zh-CN.md** — mirror the same updates in Chinese.
- [ ] **Step 4: Final headless regression** — homepage (hub cards, lightbox, no overflow) + viz (176 clusters, zero errors) + plotter (all four types render, export SVG non-empty), all via file://.
- [ ] **Step 5: Commit + push** — Pages auto-deploys; verify live URLs return 200 for `/`, `/viz/`, `/plotter/` (via headless browser).

```bash
git add -A
git commit -m "docs: plotter in README (EN+zh), screenshots, final polish"
git push origin main
```

---

## Self-Review Notes (fill during plan writing)

- Spec coverage: §2 architecture → Task 1 (webdata) + Task 2 (plotter dir); §4 selection → Task 3; §5 config/params/templates → Task 4; §6 APJ rendering/export → Tasks 5-7; §9 homepage hub → Task 8; §10 testing → per-task headless steps + Task 9; §11 deliverables → all tasks.
- Placeholder check: no TBD; error-bar decision resolved (illustrative fractional errors, documented in caption).
- Type consistency: `cfg` fields, `PARAMS` registry, `selected` Set, `view` object referenced identically across tasks.
