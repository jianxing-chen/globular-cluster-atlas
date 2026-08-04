# Galactic Plotter — APJ-Style Figure Workbench (Design Spec)

**Date**: 2026-08-04
**Status**: Approved by user (multi-round discussion, 2026-08-04)

## 1. Background & Goal

The repo (`GlobularClusterAtlas`, GitHub Pages) currently ships a master catalog of 176
globular clusters (39 fields + orbit parameters) and a 3D explorer. This spec adds a
**second interactive page**: select clusters (by checking boxes), configure axes/parameters,
and render publication-quality figures in **Astrophysical Journal (AAS/APJ) style** —
exploring relationships such as `R_gc` vs `[Fe/H]`, metallicity distribution, etc.

### Confirmed decisions (from discussion)

| Topic | Decision |
|-------|----------|
| Rendering engine | **Pure Canvas 2D hand-drawn** (zero deps, full APJ control); mirror the draw calls into a **SVG generator** for vector export |
| Interactivity | **APJ style + light interaction**: live redraw on any change, hover tooltip (name + values), click-to-highlight (syncs with selection list), wheel-zoom + drag-pan on canvas |
| Chart types | **Scatter** (color/size mapping, optional error bars, log axes) · **Histogram** (bins, density normalization, log axis, multi-group overlay) · **Line/CDF** (CDF step, x-sorted line, binned trend with error band) · **2D Density heatmap** (bins, log density) |
| Cluster selection | Search + checkbox list (aliases shown) · attribute-condition batch select (apply filter → check all matching) · select all / clear / invert · preset groups (Messier, brightest 15, disc Rgc<8, halo Rgc>8, metal-rich, metal-poor) |
| Color style | **Default grayscale APJ** (multi-groups distinguished by filled/hollow + gray shades); optional **color mode** → color mapped to a chosen parameter with **colorbar** |
| Templates | 6 one-click science templates, then free manual tweaking |
| Page form | Single-page app: `viz/plotter.html` + `viz/plotter.js`, reusing `gc_data.js`; classic scripts, zero install, same "double-click to open" philosophy |
| Entry points | Portal nav adds "Plotter" link; portal hero adds a second button |

### Out of scope (YAGNI)

- Persisting named selection sets (localStorage) — deferred
- 3D plots, fitting/statistics beyond binned means
- Server-side rendering (GitHub Pages is static)

## 2. Architecture

```
viz/plotter.html         — page skeleton: left config panel + right canvas + toolbar
viz/plotter.js           — all logic (single file, classic script, no modules)
viz/gc_data.js           — REUSED as-is: 176 clusters, 39 fields, orbit params (ecc, Rperi, Rapo, zmax)
```

No new data files. All cluster parameters already present in `GC_DATA`.

### Module layout inside plotter.js (single file, clearly sectioned)

1. **Data & helpers** — parameter registry (id, label, unit, formatter), cluster lookup, alias display (`M13 · NGC 6205`)
2. **Selection state** — `Set` of selected ids; list rendering, search filter, batch select, preset groups, counters
3. **Plot config state** — chart type, X/Y/color/size params, type-specific options (bins, log, error bars, overlay grouping)
4. **Canvas renderer** — axes (frame box, inward ticks, major/minor), labels (serif font), data per chart type, legend, colorbar; exposes one `draw()` that both preview canvas and SVG generator consume
5. **SVG generator** — same draw calls emitting SVG elements/attributes (text, line, rect, path, circle)
6. **Interactions** — hover hit-testing (screen-space lookup), click highlight, wheel zoom, drag pan, export buttons
7. **Templates** — 6 presets applying config + optional auto-selection

## 3. Data flow

```
user action (checkbox / slider / template click)
      → update selection or config state
      → invalidate → renderer.draw() (canvas) → same pass drives SVG buffer
      → export: PNG (300 dpi, via canvas.toBlob at scale factor) / SVG (serialized buffer)
```

Cluster data are read-only; the plotter never modifies `GC_DATA`.

## 4. Selection interaction (left panel, top half)

- **Search box**: filters the list by name or alias substring, instant.
- **Checkbox list**: scrollable (~176 rows), shows `main · alias` (e.g. `M13 · NGC 6205`),
  rows dim when filtered out; count header "42 / 176 selected".
- **Bulk buttons**: Select all / Clear / Invert.
- **Attribute batch select**: three range controls — `[Fe/H]`, `R_gc (kpc)`, `M_V ≤`
  with "**Apply filter to selection**" → checks every cluster satisfying all ranges.
- **Preset groups** (dropdown, replaces current selection): Messier · Brightest 15 (by M_V) ·
  Disc (Rgc<8) · Halo (Rgc≥8) · Metal-rich ([Fe/H]>−1) · Metal-poor ([Fe/H]<−1.5).
- Clicking a point on the canvas highlights the cluster and scrolls/scrolls the list to it.

## 5. Plot configuration (left panel, bottom half)

### Unified parameter registry (for X / Y / color / size dropdowns)

| id | label | unit |
|----|-------|------|
| dist | Distance | kpc |
| rgc | Galactocentric radius R_gc | kpc |
| feh | Metallicity [Fe/H] | dex |
| mv | Absolute magnitude M_V | mag |
| V | Integrated V magnitude | mag |
| ebv | Reddening E(B−V) | mag |
| bv | Colour (B−V) | mag |
| vr | Radial velocity | km/s |
| pmra / pmde | Proper motion μα* / μδ | mas/yr |
| mass | Mass | M☉ |
| ml | Mass-to-light M/L_V | — |
| rh | Half-light radius r_h | pc |
| sigma0 | Central σ₀ | km/s |
| vesc | Escape velocity v_esc | km/s |
| logtrh | log relaxation time T_rh | yr |
| c | Concentration c | — |
| ecc | Orbital eccentricity | — |
| rperi / rapo | Pericentre / Apocentre | kpc |
| zmax | Max height | kpc |
| nstar | Gaia member stars | — |

Missing values are skipped from the plot (never NaN-plotted) and counted in the caption.

### Per-type options

- **Scatter**: error bars toggle (dist, pmra, pmde, sigma0 when in Y), log X / log Y toggles.
- **Histogram**: bin slider (5–60), density-normalize toggle, log-Y toggle,
  **overlay grouping**: by disc/halo (Rgc cut) or metal-rich/poor ([Fe/H] cut) — two groups,
  distinguished by grayscale fill / hollow; optional stacked.
- **Line/CDF**: mode — CDF step (of chosen param) / x-sorted line (of X vs Y on selected subset,
  ordered by X) / binned trend (N bins, mean ± 1σ shaded band).
- **Heatmap**: bin slider, log-density toggle; drawn as gray cells (color mode: colormap).
- **Color mode**: switch → "Color by" dropdown (any parameter) + **colorbar** rendered at right
  of plot with min/max labels and a colormap (grayscale default, viridis-like when color mode on).

## 6. APJ rendering & export (right canvas)

- **Canvas**: white figure on dark page background; figure area ~1024×768 CSS px (scales to panel).
- **Typography**: serif (`Georgia, "Times New Roman", serif` fallback chain) — axis labels
  italic-capable via Canvas `italic` style for variables (`R_gc`); tick numbers plain serif.
- **Axes**: 4-side black frame, **inward ticks** (major + minor), axis labels with units,
  `10ⁿ` scientific notation for log axes; label offsets APJ-like (no grid lines).
- **Caption**: below figure, auto-generated "**Fig. 1.**— *X vs Y of the selected 42 globular
  clusters (⋯)*" — editable `<input>` synced to render.
- **Legend**: upper-right, only when >1 group or color mapping; APJ style (short line + symbol).
- **Light interaction**: hover → nearest-point tooltip (name + all visible axes values);
  wheel zoom (around cursor), drag pan; double-click resets view.
- **Export**: "PNG (300 dpi)" via offscreen canvas scale; "SVG" via the mirrored SVG buffer;
  filenames `plot_<type>_<date>.png/svg`.

## 7. Templates (one-click presets)

1. `R_gc vs [Fe/H]` — scatter, X=rgc, Y=feh, all clusters (auto-select all)
2. `Metallicity distribution` — histogram, feh, 30 bins, all
3. `Distance distribution` — histogram, dist, 25 bins, all
4. `M_V vs Mass` — scatter, X=mass(log), Y=mv, all
5. `Eccentricity distribution` — histogram, ecc, 25 bins, clusters with orbits (auto-batch by ecc present)
6. `Pericentre vs Apocentre` — scatter, X=rperi, Y=rapo, orbits only

## 8. Error handling

- Zero clusters selected → canvas shows centered "No clusters selected" in serif italic; export disabled.
- Parameter with no data for selection → "no data" notice in caption; axis auto-ranges to available.
- Auto-ranging: nice ticks (1-2-5 series) with padding; log axes guard against ≤0 values (skip + note).
- All numeric parsing uses existing `gc_data.js` values (null-safe formatters).

## 9. Testing (manual + headless)

- Headless (playwright, system Chrome): load `plotter.html` via `file://` and `https://.../viz/plotter.html`;
  assert zero console/page errors; exercise: select all → template 1 → screenshot;
  toggle color mode → colorbar visible; hover a point → tooltip text; export SVG → non-empty string;
  resize/mobile viewport → no horizontal overflow.
- Validation: spot-check one plotted value (47 Tuc: Rgc≈7.6 kpc, [Fe/H]=−0.76) against catalog.

## 10. Entry points & docs

- Portal (`index.html`): nav adds "Plotter"; hero adds "Plotter" ghost button → `viz/plotter.html`.
- README (EN + zh-CN): new "Plotter" section (what it is, how to use, link).
- `figures/` gains `viz_screenshot_plotter*.png` used by README/portal gallery.

## 11. Deliverables checklist

- [ ] `viz/plotter.html` (skeleton, dark UI, panel + canvas + toolbar)
- [ ] `viz/plotter.js` (all modules above)
- [ ] Portal links (nav + hero button)
- [ ] README updates (EN + zh-CN)
- [ ] Screenshots + headless verification
- [ ] Commit + push (Pages auto-deploys)
