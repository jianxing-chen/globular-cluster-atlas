// Milky Way Globular Cluster Atlas — Plotter (APJ-style figure workbench)
// 经典脚本(非 module). 依赖页面先加载 ../webdata/plotter_data.js → 全局 PLOTTER_DATA.
// 骨架阶段: 数据加载 + 参数注册表 + 静态 UI; 渲染/交互由后续任务填充(当前为 console.log stub).
(function () {
'use strict';

// ================= DATA =================
const DATA = (typeof PLOTTER_DATA !== 'undefined' && PLOTTER_DATA.clusters) || [];
const META = (typeof PLOTTER_DATA !== 'undefined' && PLOTTER_DATA.meta) || {};
const $ = id => document.getElementById(id);

// 展示名: 主名 = c.name 非空则用之否则 c.id; 别名 = 对 id 做 fmtId 式处理; 不同则 "主名 · 别名"
const fmtId = id => String(id || '').replace(/(NGC)(\d+)/, '$1 $2');   // NGC6205 -> NGC 6205
const mainName = c => (c.name && String(c.name).trim()) ? c.name : c.id;
const aliasOf = c => fmtId(c.id);
const dispOf = c => { const a = aliasOf(c); return a === mainName(c) ? mainName(c) : mainName(c) + ' · ' + a; };

// ================= PARAM REGISTRY =================
// 23 个可绘图参数, X/Y/color/size 下拉共享. get(c) 一律 null-safe:
// const v = c[param.id]; return v==null ? null : v; —— 无轨道星团缺少
// ecc/rperi/rapo/zmax 等平铺字段, 返回 null(渲染时跳过, 绝不 NaN 上屏).
function getParam(c, id) { const v = c[id]; return v == null ? null : v; }
function fmtNum(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (!isFinite(n)) return '—';
  if (Number.isInteger(n)) return String(n);
  return String(+n.toPrecision(3));
}
const PARAMS = [
  { id:'dist',   label:'Heliocentric distance d',            unit:'kpc',      get:c => getParam(c, 'dist'),   fmt:fmtNum },
  { id:'rgc',    label:'Galactocentric radius R_gc',        unit:'kpc',      get:c => getParam(c, 'rgc'),    fmt:fmtNum },
  { id:'feh',    label:'Metallicity [Fe/H]',                unit:'dex',      get:c => getParam(c, 'feh'),    fmt:fmtNum },
  { id:'mv',     label:'Absolute magnitude M_V',            unit:'mag',      get:c => getParam(c, 'MV'),     fmt:fmtNum },
  { id:'V',      label:'Apparent magnitude V',              unit:'mag',      get:c => getParam(c, 'V'),      fmt:fmtNum },
  { id:'ebv',    label:'Reddening E(B−V)',                  unit:'mag',      get:c => getParam(c, 'ebv'),    fmt:fmtNum },
  { id:'l',      label:'Galactic longitude l',              unit:'deg',      get:c => getParam(c, 'l'),      fmt:fmtNum },
  { id:'b',      label:'Galactic latitude b',               unit:'deg',      get:c => getParam(c, 'b'),      fmt:fmtNum },
  { id:'vr',     label:'Radial velocity v_r',               unit:'km s⁻¹',   get:c => getParam(c, 'vr'),     fmt:fmtNum },
  { id:'pmra',   label:'Proper motion μα cos δ',            unit:'mas yr⁻¹', get:c => getParam(c, 'pmra'),   fmt:fmtNum },
  { id:'pmde',   label:'Proper motion μδ',                  unit:'mas yr⁻¹', get:c => getParam(c, 'pmde'),   fmt:fmtNum },
  { id:'mass',   label:'Cluster mass M',                    unit:'M☉',       get:c => getParam(c, 'mass'),   fmt:fmtNum },
  { id:'ml',     label:'Mass-to-light ratio M/L',           unit:'',         get:c => getParam(c, 'ml'),     fmt:fmtNum },
  { id:'rh',     label:'Half-mass radius r_h',              unit:'pc',       get:c => getParam(c, 'rh'),     fmt:fmtNum },
  { id:'sigma0', label:'Central velocity dispersion σ0',    unit:'km s⁻¹',   get:c => getParam(c, 'sigma0'), fmt:fmtNum },
  { id:'vesc',   label:'Escape velocity v_esc',             unit:'km s⁻¹',   get:c => getParam(c, 'vesc'),   fmt:fmtNum },
  { id:'logtrh', label:'Log half-mass relaxation time',     unit:'yr',       get:c => getParam(c, 'logtrh'), fmt:fmtNum },
  { id:'c',      label:'Concentration c',                   unit:'',         get:c => getParam(c, 'c'),      fmt:fmtNum },
  { id:'ecc',    label:'Orbital eccentricity e',            unit:'',         get:c => getParam(c, 'ecc'),    fmt:fmtNum },
  { id:'rperi',  label:'Pericentre r_peri',                 unit:'kpc',      get:c => getParam(c, 'rperi'),  fmt:fmtNum },
  { id:'rapo',   label:'Apocentre r_apo',                   unit:'kpc',      get:c => getParam(c, 'rapo'),   fmt:fmtNum },
  { id:'zmax',   label:'Maximum height z_max',              unit:'kpc',      get:c => getParam(c, 'zmax'),   fmt:fmtNum },
  { id:'nstar',  label:'Star count N',                      unit:'',         get:c => getParam(c, 'nstar'),  fmt:fmtNum },
];
const PARAM_BY_ID = {};
PARAMS.forEach(p => { PARAM_BY_ID[p.id] = p; });

// ================= SELECTION =================
// 骨架阶段: 仅渲染全部未勾选行; 搜索/批量/预设逻辑由 Task 3 填充.
let selected = new Set();           // cluster ids
function selCount() { return selected.size; }

function renderList(filter) {       // filter 参数预留(Task 3 搜索), 当前渲染全部
  const el = $('cluster-list');
  if (!el) return;
  el.textContent = '';
  DATA.forEach(c => {
    const label = document.createElement('label');
    label.className = 'row';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.id = c.id;
    const span = document.createElement('span');
    span.textContent = dispOf(c);
    label.appendChild(cb); label.appendChild(span);
    el.appendChild(label);
  });
  const out = $('sel-count');
  if (out) out.textContent = selCount() + ' / ' + DATA.length;
}

// ================= CONFIG =================
// 默认配置 (Task 4 引入 setCfg 完整接线, 此处为初始 state)
let cfg = {
  type:'scatter',          // scatter | hist | line | heat
  x:'rgc', y:'feh',
  colorParam:'feh', sizeParam:'mv',
  colorMode:false,
  bins:30, logX:false, logY:false, errBars:false,
  overlay:'none', lineMode:'cdf',
  heatLog:false, density:false, heatBins:30,
};

// 参数下拉框由注册表填充(单一来源, 标签与 PARAMS 一致)
function fillParamSelects() {
  [['x-param', cfg.x], ['y-param', cfg.y], ['color-param', cfg.colorParam], ['size-param', cfg.sizeParam]]
    .forEach(([id, def]) => {
      const sel = $(id);
      if (!sel) return;
      sel.textContent = '';
      PARAMS.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label + (p.unit ? ' (' + p.unit + ')' : '');
        opt.selected = (p.id === def);
        sel.appendChild(opt);
      });
    });
}

// ================= RENDER =================
const canvas = $('plot-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function draw() { console.log('stub: draw()'); }

function renderAxes(ctx) { console.log('stub: renderAxes()'); }
function renderScatter() { console.log('stub: renderScatter()'); }
function renderHist()    { console.log('stub: renderHist()'); }
function renderLine()    { console.log('stub: renderLine()'); }
function renderHeat()    { console.log('stub: renderHeat()'); }

// ================= SVG =================
function svgEmit() { console.log('stub: svgEmit()'); }

// ================= INTERACT =================
// Task 6+: hover tooltip / click highlight / wheel zoom / drag pan

// ================= TEMPLATES =================
// Task 4: 6 个科学模板(segmented #templates)

// ================= EXPORT =================
function exportPNG() { console.log('stub: exportPNG()'); }
function exportSVG() { console.log('stub: exportSVG()'); }

// ================= INIT =================
function init() {
  fillParamSelects();
  renderList('');
  draw();
}
init();

})();
