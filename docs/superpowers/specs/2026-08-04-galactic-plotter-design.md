# Galactic Plotter — APJ-Style Figure Workbench (Design Spec)

**Date**: 2026-08-04
**Status**: Approved by user (multi-round discussion) · v2: architecture revised to
independent app + homepage hub redesign (user request, 2026-08-04)

## 1. Background & Goal

The repo (`GlobularClusterAtlas`, GitHub Pages) ships a master catalog of 176 globular
clusters (39 fields + orbit parameters) and a 3D explorer. This spec adds a **second
interactive application**: select clusters (check boxes), configure axes/parameters,
and render publication-quality figures in **Astrophysical Journal (APJ) style** —
exploring e.g. `R_gc` vs `[Fe/H]`, metallicity distribution.

**v2 architecture decision (user-directed)**: the plotter is an **independent app** in its
own top-level directory, and the homepage is reorganized as an **app hub** — visitors
choose between the 3D explorer and the plotter from the landing page.

### Confirmed decisions (from discussion)

| Topic | Decision |
|-------|----------|
| Rendering engine | **Pure Canvas 2D hand-drawn** (zero deps, full APJ control); same draw calls mirrored to an **SVG generator** for vector export |
| Interactivity | **APJ style + light interaction**: live redraw, hover tooltip (name + values), click-to-highlight (syncs with selection list), wheel-zoom + drag-pan |
| Chart types | **Scatter** (color/size mapping, optional error bars, log axes) · **Histogram** (bins, density norm, log axis, multi-group overlay) · **Line/CDF** (CDF step / x-sorted line / binned trend + error band) · **2D Density heatmap** |
| Cluster selection | Search + checkbox list (aliases) · attribute-condition batch select · select all / clear / invert · preset groups (Messier, brightest 15, disc Rgc<8, halo Rgc≥8, metal-rich, metal-poor) |
| Color style | **Default grayscale APJ** (groups via filled/hollow + gray shades); optional **color mode** → color mapped to a parameter with **colorbar** |
| Templates | 6 one-click science templates, then manual tweaking |
| Page form | Independent single-page app: `plotter/index.html` + `plotter/plotter.js` + `plotter/plotter_data.js`; classic scripts, zero install |
| Homepage | Redesigned as **app hub**: hero + dual entry cards (3D Explorer / Plotter), nav gets Plotter links |

### Out of scope (YAGNI)

- Named selection sets (localStorage) — deferred
- 3D plots, statistics beyond binned means
- Server-side rendering (static Pages)

## 2. Architecture (v2)

```
jianxing-chen.github.io/globular-cluster-atlas/
├── index.html        # ★ App hub: hero + dual entry cards → [3D Explorer] [Plotter]
├── viz/              # App 1: 3D explorer (unchanged)
│   ├── index.html · app.js · gc_data.js · streams_data.js · assets/
├── plotter/          # App 2: APJ figure workbench (NEW, self-contained)
│   ├── index.html        # URL: .../plotter/
│   ├── plotter.js        # all logic (single classic script)
│   ├── plotter_data.js   # parameter-only data (~100 KB, NO orbit track arrays)
│   └── assets/           # shared style vars; no external libs
├── data/ scripts/ figures/ docs/ README*  (unchanged)
```

### Data organization

- `scripts/export_viz_data.py` is extended to also emit **`plotter/plotter_data.js`**:
  the same 176 clusters × 39 fields **without the 3-D orbit track arrays** (which dominate
  `gc_data.js`'s 884 KB) — keeping the plotter app fully self-contained (~100 KB).
- Single source of truth: one export script generates both data files; no duplicated
  hand-maintained data.

### plotter.js module layout (single file, clearly sectioned)

1. **Data & helpers** — parameter registry (id, label, unit, formatter), cluster lookup, alias display
2. **Selection state** — `Set` of ids; list rendering, search, batch select, presets, counters
3. **Plot config state** — chart type, X/Y/color/size params, type-specific options
4. **Canvas renderer** — APJ axes (frame box, inward ticks, serif), data per type, legend, colorbar
5. **SVG generator** — same draw calls emitting SVG elements
6. **Interactions** — hover hit-testing, click highlight, wheel zoom, drag pan, export
7. **Templates** — 6 presets

## 3. Data flow

```
user action (checkbox / slider / template)
   → update selection or config → invalidate → renderer.draw()
   → same pass drives SVG buffer → export PNG (300 dpi) / SVG
```

Cluster data read-only; plotter never mutates `PLOTTER_DATA`.

## 4. Selection interaction (left panel, top half)

- Search box (name/alias, instant filter); checkbox list (~176 rows, `M13 · NGC 6205` style);
  header counter "42 / 176 selected"; Select all / Clear / Invert.
- **Attribute batch select**: ranges for `[Fe/H]`, `R_gc (kpc)`, `M_V ≤` → "Apply filter to
  selection" checks every cluster satisfying all ranges.
- **Preset groups** (dropdown, replaces selection): Messier · Brightest 15 · Disc (Rgc<8) ·
  Halo (Rgc≥8) · Metal-rich ([Fe/H]>−1) · Metal-poor ([Fe/H]<−1.5).
- Canvas click → highlight + scroll list to row.

## 5. Plot configuration (left panel, bottom half)

**Unified parameter registry** (X / Y / color / size dropdowns):
`dist, rgc, feh, mv, V, ebv, bv, vr, pmra, pmde, mass, ml, rh, sigma0, vesc, logtrh, c, ecc, rperi, rapo, zmax, nstar`

Missing values skipped (never NaN-plotted), counted in caption.

**Per-type options**:
- Scatter: error bars toggle (dist/pmra/pmde/sigma0 when in Y), log X / log Y.
- Histogram: bin slider 5–60, density-normalize, log-Y, overlay grouping (disc/halo or
  rich/poor) with grayscale/hollow distinction, optional stacked.
- Line/CDF: CDF step / x-sorted line / binned trend (N bins, mean ± 1σ band).
- Heatmap: bin slider, log-density, gray cells (colormap in color mode).
- Color mode: switch → "Color by" dropdown (any param) + **colorbar** (gradient + min/max).

## 6. APJ rendering & export (right canvas)

- White figure on dark UI; figure ~1024×768 px.
- Serif typography (Georgia/"Times New Roman" fallback): italic axis variables, plain tick digits.
- Four-side black frame, **inward ticks** (major+minor), axis labels with units, `10ⁿ` log
  notation, no grid lines.
- Auto caption "**Fig. 1.**— *X vs Y of the selected 42 globular clusters (⋯)*", editable.
- Legend upper-right (only multi-group or color mapping).
- Light interaction: nearest-point tooltip; wheel zoom about cursor; drag pan; dbl-click reset.
- Export: PNG (300 dpi) + SVG; filename `plot_<type>_<date>.png/svg`.

## 7. Templates

1. `R_gc vs [Fe/H]` scatter (auto-select all) 2. `Metallicity distribution` hist (30 bins)
3. `Distance distribution` hist (25 bins) 4. `M_V vs Mass` scatter (log mass)
5. `Eccentricity distribution` hist (orbit clusters only) 6. `Pericentre vs Apocentre` scatter (orbits only)

## 8. Error handling

- Zero selected → centered "No clusters selected" (serif italic), export disabled.
- Param missing for selection → noted in caption; axis auto-range on available data.
- Nice ticks (1-2-5) with padding; log axes skip ≤0 with note.
- Null-safe formatters on `PLOTTER_DATA`.

## 9. Homepage redesign (app hub)

Current homepage becomes the hub for two apps:

- **Hero**: keep title + tagline + big 3-D screenshot (click → viz, the visual signature);
  primary buttons become **"Launch 3D Atlas"** and **"Open Plotter"** (new, ghost style).
- **New "Apps" section** (nav anchor `#apps`): two large entry cards side by side —
  - **3D Explorer**: `viz_screenshot_home.png`, "Interactive 3D atlas — 176 clusters,
    135 orbits, 124 streams, spiral arms & bar", button → `viz/`
  - **Plotter**: new `figures/viz_screenshot_plotter.png`, "APJ-style figure workbench —
    check clusters, choose parameters, export publication figures", button → `plotter/`
- **Nav**: links become `Overview · Apps · Data · Sources · Galaxy · Validation · Gallery ·
  Reproduce`; the CTA button becomes a small **"Apps"** shortcut (or two mini-buttons 3D/Plotter).
- Stats strip, catalog/sources/model/validation/gallery/reproduce sections and footer remain,
  with any needed spacing/typography polish; keep full-English, lightbox, responsive rules.
- README (EN + zh-CN) updated: two apps, URLs, screenshots.

## 10. Testing (headless + manual)

- Playwright + system Chrome on both `file://` and live URLs:
  - plotter: zero console/page errors; select-all → template 1 → screenshot; color mode →
    colorbar; hover → tooltip; SVG export non-empty; mobile no horizontal overflow.
  - homepage: both entry cards link correctly; no regressions (lightbox, nav).
- Value spot-check: 47 Tuc (Rgc≈7.6 kpc, [Fe/H]=−0.76) matches catalog.

## 11. Deliverables

- [ ] `plotter/index.html` + `plotter/plotter.js` + `plotter/plotter_data.js` (via export script)
- [ ] Homepage hub redesign (hero dual buttons, Apps section, nav update)
- [ ] README bilingual updates
- [ ] Screenshots (plotter) + headless verification
- [ ] Commit + push (Pages auto-deploys)
