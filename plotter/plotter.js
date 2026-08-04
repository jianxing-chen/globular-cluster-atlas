// Milky Way Globular Cluster Atlas — Plotter (APJ-style figure workbench)
// 经典脚本(非 module). 依赖页面先加载 ../webdata/plotter_data.js → 全局 PLOTTER_DATA.
// Task 5: APJ 画布核心(坐标轴/刻度/标签/图注/图例/colorbar); 数据点渲染待 Task 6.
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
// XML/HTML 转义(工具提示 + SVG 文本内容)
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
// 选中集合(Set of cluster ids) + 搜索/批量/预设. 勾选状态变化 → applySelection() 同步 UI → draw() 桩(Task 5 前无实际绘图).
let selected = new Set();           // cluster ids
function selCount() { return selected.size; }

// 名称/别名子串匹配(不区分大小写; 忽略空白, 使 "m13" 命中 "M 13")
function matchDisplay(c, q) {
  const s = String(q || '').replace(/\s+/g, '').toLowerCase();
  if (!s) return true;
  return (mainName(c) + ' ' + aliasOf(c)).replace(/\s+/g, '').toLowerCase().includes(s);
}

// 按搜索词渲染列表: 不匹配的行保留但加 .dim(勾选态仍可用); 勾选态由 selected 同步
function renderList(filter = '') {
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
    if (filter && !matchDisplay(c, filter)) label.classList.add('dim');
  });
  applySelection();
}

// 将 selected 同步到列表勾选态 + #sel-count(就地更新, 不重建 DOM)
function applySelection() {
  const el = $('cluster-list');
  if (el) {
    el.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.checked = selected.has(cb.dataset.id);
    });
  }
  const out = $('sel-count');
  if (out) out.textContent = selCount() + ' / ' + DATA.length;
}

// 原地替换集合内容: 保持 selected 单一对象身份(window 测试钩子始终同步)
function setSel(ids) {
  selected.clear();
  for (const id of ids) selected.add(id);
}
function selectAll() {
  setSel(DATA.map(c => c.id));
  applySelection(); draw();
}
function clearSel() {
  selected.clear();
  applySelection(); draw();
}
function invertSel() {
  setSel(DATA.filter(c => !selected.has(c.id)).map(c => c.id));
  applySelection(); draw();
}

// 批量条件: 输入为空字符串 → 不约束(null); 全部条件 AND; 被约束参数为 null 的星团不命中
function batchSelect() {
  const num = id => {
    const v = $(id).value.trim();
    return v === '' ? null : Number(v);
  };
  const lo = num('batch-feh-lo'), hi = num('batch-feh-hi');
  const rgc = num('batch-rgc'), mv = num('batch-mv');
  setSel(DATA.filter(c =>
    (lo == null || (c.feh != null && c.feh > lo)) &&
    (hi == null || (c.feh != null && c.feh < hi)) &&
    (rgc == null || (c.rgc != null && c.rgc <= rgc)) &&
    (mv  == null || (c.MV  != null && c.MV  <= mv))
  ).map(c => c.id));
  applySelection(); draw();
}

// 预置分组(替换当前选中):
//   messier  : 名称/别名去空白后匹配 /^M\d+$/i(覆盖 "M13" 与 "M 13")
//   bright15 : MV 非空的按 MV 升序(最亮在前)取前 15
//   disc     : rgc < 8   |   halo: rgc >= 8
//   rich     : feh > -1  |   poor: feh < -1.5
const isMNumber = s => /^M\d+$/i.test(String(s || '').replace(/\s+/g, ''));
const PRESETS = {
  messier:  () => DATA.filter(c => isMNumber(c.name) || isMNumber(c.id)).map(c => c.id),
  bright15: () => DATA.filter(c => c.MV != null).sort((a, b) => a.MV - b.MV).slice(0, 15).map(c => c.id),
  disc:     () => DATA.filter(c => c.rgc != null && c.rgc < 8).map(c => c.id),
  halo:     () => DATA.filter(c => c.rgc != null && c.rgc >= 8).map(c => c.id),
  rich:     () => DATA.filter(c => c.feh != null && c.feh > -1).map(c => c.id),
  poor:     () => DATA.filter(c => c.feh != null && c.feh < -1.5).map(c => c.id),
};
function presetApply(name) {
  const fn = PRESETS[name];
  if (!fn) return;
  setSel(fn());
  applySelection(); draw();
}

// 控件接线: 搜索(即时过滤) · checkbox(事件委托, 行随 renderList 重建) · 批量按钮 · 预设下拉
function wireSelection() {
  const search = $('list-search');
  if (search) search.addEventListener('input', e => renderList(e.target.value));

  const list = $('cluster-list');
  if (list) list.addEventListener('change', e => {
    const cb = e.target;
    if (cb.type !== 'checkbox' || !cb.dataset.id) return;
    if (cb.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
    applySelection();
    draw();
  });

  const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  bind('btn-all', selectAll);
  bind('btn-clear', clearSel);
  bind('btn-invert', invertSel);
  bind('btn-batch', batchSelect);

  const preset = $('preset-sel');
  if (preset) preset.addEventListener('change', e => {
    const v = e.target.value;
    if (!v) return;
    presetApply(v);
    e.target.value = '';   // 复位, 允许重复选择同一预置
  });
}

// ================= CONFIG =================
// 绘图配置状态: cfg 是唯一事实源, 一切控件变更经 setCfg(patch) 合并 → 同步控件显示 → draw().
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

// 把 cfg 同步到控件显示状态(只写控件, 不触发事件循环; 供 setCfg/init 调用)
function syncCfgControls() {
  const seg = $('chart-type');
  if (seg) seg.querySelectorAll('button[data-type]').forEach(b => {
    b.classList.toggle('on', b.dataset.type === cfg.type);
  });
  const setVal = (id, v) => { const el = $(id); if (el) el.value = v; };
  const setCb = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
  setVal('x-param', cfg.x);
  setVal('y-param', cfg.y);
  setVal('color-param', cfg.colorParam);
  setVal('size-param', cfg.sizeParam);
  setCb('color-mode', cfg.colorMode);
  setCb('log-x', cfg.logX);
  setCb('log-y', cfg.logY);
  setCb('err-bars', cfg.errBars);
  setVal('overlay-group', cfg.overlay);
  setVal('line-mode', cfg.lineMode);
  const bins = $('bin-count');
  if (bins) bins.value = String(cfg.bins);
  const binOut = $('bin-out');
  if (binOut) binOut.textContent = String(cfg.bins);
  // hist 无 Y 轴: 保持 Y/color/size 下拉可见但禁用
  const histOnly = cfg.type === 'hist';
  ['y-param', 'color-param', 'size-param'].forEach(id => {
    const el = $(id);
    if (el) el.disabled = histOnly;
  });
}

// 合并配置补丁: Object.assign 到 cfg → 控件同步 → 重绘. 所有绘图控件都经此入口,
// 保证 cfg 与控件永远一致(Task 5 渲染直接读 cfg). 轴定义变更(类型/参数/对数)使
// 交互视图失效 → view 复位为 null(自动范围), 避免缩放窗口错位到新轴的参数域.
const AXIS_PATCH = ['type', 'x', 'y', 'logX', 'logY'];
function setCfg(patch) {
  Object.assign(cfg, patch);
  if (AXIS_PATCH.some(k => Object.prototype.hasOwnProperty.call(patch, k))) view = null;
  syncCfgControls();
  draw();
}

// 控件接线: 分段(chart-type/templates)用事件委托, 下拉/滑块/开关统一走 setCfg
function wireCfgControls() {
  const segClick = (id, sel, map) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', e => {
      const b = e.target.closest(sel);
      if (!b) return;
      const patch = map(b);
      if (patch) setCfg(patch);
    });
  };
  segClick('chart-type', 'button[data-type]', b => ({ type: b.dataset.type }));
  // 模板按钮是动作不是状态: apply() 自行 setCfg + 设选中集, 不再二次 setCfg
  segClick('templates', 'button[data-i]', b => {
    const t = TEMPLATES[+b.dataset.i];
    if (t) t.apply();
    return null;
  });
  const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', fn); };
  bind('x-param',      e => setCfg({ x: e.target.value }));
  bind('y-param',      e => setCfg({ y: e.target.value }));
  bind('color-param',  e => setCfg({ colorParam: e.target.value }));
  bind('size-param',   e => setCfg({ sizeParam: e.target.value }));
  bind('color-mode',   e => setCfg({ colorMode: e.target.checked }));
  bind('bin-count',    e => setCfg({ bins: Number(e.target.value) }));
  bind('log-x',        e => setCfg({ logX: e.target.checked }));
  bind('log-y',        e => setCfg({ logY: e.target.checked }));
  bind('err-bars',     e => setCfg({ errBars: e.target.checked }));
  bind('overlay-group', e => setCfg({ overlay: e.target.value }));
  bind('line-mode',    e => setCfg({ lineMode: e.target.value }));
}

// ================= RENDER =================
// APJ 风格画布核心(Task 5): 布局/刻度/轴/图注/图例/colorbar; 数据点渲染由 Task 6 填充
// (renderScatter 等仍为桩, draw() 保持调用链完整). 灰度默认: 框/刻度/文字 #000.
const canvas = $('plot-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

const MARGINS = { l: 64, r: 16, t: 12, b: 44 };
const INK = '#000';
const SERIES = ['#000', '#666', '#aaa', '#333'];        // 多系列灰度色板
const VIRIDIS_STOPS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const TICK_FONT = '12px Georgia, "Times New Roman", serif';
const LABEL_FONT = 'italic 14px Georgia, "Times New Roman", serif';

// 当前帧状态(draw() 每次计算, 各渲染函数共享). axisX/axisY: min/max 为数据范围,
// lo/hi 为刻度尺端点(线性 = 数据范围 ±5% padding; 对数 = 无 padding 的 10 的整幂).
let plotRect = { x: MARGINS.l, y: MARGINS.t, w: 0, h: 0 };
let axisX = { min: 0, max: 1, lo: 0, hi: 1, log: false, label: 'x' };
let axisY = { min: 0, max: 1, lo: 0, hi: 1, log: false, label: 'y' };

// 选中星团在参数 id 上的数据范围(posOnly: 只取正值, 供对数轴); 全缺失 → null
function paramRange(id, posOnly) {
  const p = PARAM_BY_ID[id];
  if (!p) return null;
  let min = Infinity, max = -Infinity;
  DATA.forEach(c => {
    if (!selected.has(c.id)) return;
    const v = p.get(c);
    if (v == null || !isFinite(v)) return;
    if (posOnly && v <= 0) return;
    if (v < min) min = v;
    if (v > max) max = v;
  });
  return isFinite(min) ? { min, max } : null;
}

// 退化范围(空 → fallback; 单点 → 两边各扩 10%) 保证轴有宽度
function spreadRange(r, fallback) {
  if (!r) return { min: fallback[0], max: fallback[1] };
  if (r.min === r.max) {
    const d = Math.abs(r.min) < 1e-9 ? 0.5 : Math.abs(r.min) * 0.1;
    return { min: r.min - d, max: r.max + d };
  }
  return r;
}

// 轴标签: "参数名 (单位)", 如 "Galactocentric radius R_gc (kpc)" / "Metallicity [Fe/H] (dex)"
function axisLabel(id) {
  const p = PARAM_BY_ID[id];
  if (!p) return String(id);
  return p.label + (p.unit ? ' (' + p.unit + ')' : '');
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// viridis 调色板: 锚点列表线性插值(brief 指定), t∈[0,1] → 'rgb(r,g,b)'
function viridis(t) {
  const c = Math.max(0, Math.min(1, t));
  const f = c * (VIRIDIS_STOPS.length - 1);
  const i = Math.min(VIRIDIS_STOPS.length - 2, Math.floor(f));
  const u = f - i;
  const a = hexRgb(VIRIDIS_STOPS[i]), b = hexRgb(VIRIDIS_STOPS[i + 1]);
  const ch = k => Math.round(a[k] + (b[k] - a[k]) * u);
  return 'rgb(' + ch(0) + ',' + ch(1) + ',' + ch(2) + ')';
}

// 1-2-5 序列"漂亮"刻度: step ∈ {1,2,5}×10^k, 覆盖 [min,max], 数量 ≈ nTicks
function niceTicks(min, max, nTicks) {
  if (nTicks == null) nTicks = 5;
  if (!isFinite(min) || !isFinite(max)) return { ticks: [], step: 1 };
  if (min === max) { min -= 0.5; max += 0.5; }
  if (min > max) { const t = min; min = max; max = t; }
  const raw = (max - min) / Math.max(1, nTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3.5) step = 2 * mag;
  else if (norm < 7.5) step = 5 * mag;
  else step = 10 * mag;
  const t0 = Math.ceil(min / step) * step;
  const n = Math.floor((max - t0) / step + 1e-9);
  const ticks = [];
  for (let i = 0; i <= n; i++) ticks.push(+(t0 + i * step).toPrecision(12));
  return { ticks, step };
}

// 对数轴刻度: 主刻度 10^n, 次刻度 2..9 × 10^k
function logTickInfo(min, max) {
  const lo = Math.ceil(Math.log10(min)), hi = Math.floor(Math.log10(max));
  if (!isFinite(lo) || !isFinite(hi)) return { majors: [], minors: [] };
  const majors = [];
  for (let e = lo; e <= hi; e++) majors.push(Math.pow(10, e));
  if (!majors.length) majors.push(Math.pow(10, lo));
  const minors = [];
  for (let e = lo; e <= hi - 1; e++) {
    for (let f = 2; f <= 9; f++) minors.push(f * Math.pow(10, e));
  }
  return { majors, minors };
}

// 归一化 t∈[0,1]: 线性带 pad(默认 5%), 对数在 log10 空间
function linT(v, min, max, pad) {
  if (pad == null) pad = 0.05;
  const span = (max - min) || 1;
  const lo = min - span * pad, hi = max + span * pad;
  return (v - lo) / (hi - lo);
}
function logT(v, min, max) {
  const lg = x => Math.log10(Math.max(x, 1e-300));
  const span = (lg(max) - lg(min)) || 1;
  return (lg(v) - lg(min)) / span;
}

// 数据值 → 像素坐标(基于当前 plotRect). 线性: linScale(v,min,max,pad=0.05);
// 对数: logScale(v,min,max) 的 min/max 为原始(正值)数据值.
function linScale(v, min, max, pad) {
  if (pad == null) pad = 0.05;
  return plotRect.x + linT(v, min, max, pad) * plotRect.w;
}
function logScale(v, min, max) {
  return plotRect.x + logT(v, min, max) * plotRect.w;
}

// 当前帧刻度闭包(draw 的本地 xScale/yScale 提升为模块级, draw/hitTest/svgEmit 共用;
// axisX/axisY/plotRect 是模块态, draw 后即当前帧, 渲染器中途重置 axisY 也自动生效)
function xScaleAt(v) { return axisX.log ? logScale(v, axisX.min, axisX.max) : linScale(v, axisX.min, axisX.max); }
function yScaleAt(v) {
  const t = axisY.log ? logT(v, axisY.min, axisY.max) : linT(v, axisY.min, axisY.max);
  return plotRect.y + plotRect.h - t * plotRect.h;
}

// 刻度文字: 十进制 ≤3 位有效数字; 对数轴 → "10^n"
function fmtTick(v, isLog) {
  if (isLog) return '10^' + Math.round(Math.log10(v));
  if (v === 0) return '0';
  if (!isFinite(v)) return '—';
  return String(+v.toPrecision(3));
}

// 主绘图入口: 清空 → 布局 → 数据范围(view 优先) → 刻度尺 → 坐标轴 → 类型渲染 → 图例
// → colorbar → 高亮环 → 图注. target 缺省用主画布 ctx; 导出时传入离屏 3× 上下文.
// view 非空时直接采用 view 的数据范围(zoom/pan 的精确窗口), 跳过 10 的整幂取整.
function draw(target) {
  const g = target || ctx;
  if (!g || !canvas) return;
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  plotRect = { x: MARGINS.l, y: MARGINS.t, w: W - MARGINS.l - MARGINS.r, h: H - MARGINS.t - MARGINS.b };

  // 空选中态: 画布中央一行灰色斜体提示(衬线), 不画坐标轴/数据; 导出按钮统一禁用
  if (selected.size === 0) {
    g.fillStyle = '#666';
    g.font = 'italic 20px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('No clusters selected', W / 2, H / 2);
    updateExportButtons();
    return;
  }

  const hist = cfg.type === 'hist';
  let xr = spreadRange(paramRange(cfg.x, cfg.logX), [0, 1]);
  let yr = hist ? { min: 0, max: 1 } : spreadRange(paramRange(cfg.y, cfg.logY), [0, 1]);
  if (view) {
    xr = { min: view.xmin, max: view.xmax };
    yr = { min: view.ymin, max: view.ymax };
  } else if (cfg.logX) {
    xr.min = Math.pow(10, Math.floor(Math.log10(Math.max(xr.min, 1e-300)))); xr.max = Math.pow(10, Math.ceil(Math.log10(Math.max(xr.max, 1e-300))));
    if (cfg.logY && !hist) { yr.min = Math.pow(10, Math.floor(Math.log10(Math.max(yr.min, 1e-300)))); yr.max = Math.pow(10, Math.ceil(Math.log10(Math.max(yr.max, 1e-300)))); }
  } else if (cfg.logY && !hist) {
    yr.min = Math.pow(10, Math.floor(Math.log10(Math.max(yr.min, 1e-300)))); yr.max = Math.pow(10, Math.ceil(Math.log10(Math.max(yr.max, 1e-300))));
  }
  const xSpan = (xr.max - xr.min) || 1, ySpan = (yr.max - yr.min) || 1;
  // 线性轴: 刻度尺端点 = 数据范围 ±5% padding; 对数轴: 无 padding(端点 = 10 的整幂)
  axisX = { min: xr.min, max: xr.max, log: cfg.logX, label: axisLabel(cfg.x) };
  axisY = { min: yr.min, max: yr.max, log: cfg.logY && !hist, label: hist ? 'N' : axisLabel(cfg.y) };
  axisX.lo = axisX.log ? axisX.min : axisX.min - xSpan * 0.05;
  axisX.hi = axisX.log ? axisX.max : axisX.max + xSpan * 0.05;
  axisY.lo = axisY.log ? axisY.min : axisY.min - ySpan * 0.05;
  axisY.hi = axisY.log ? axisY.max : axisY.max + ySpan * 0.05;

  renderAxes(g, xScaleAt, yScaleAt);
  if (cfg.type === 'scatter') renderScatter(g, xScaleAt, yScaleAt);
  else if (cfg.type === 'hist') renderHist(g, xScaleAt, yScaleAt);
  else if (cfg.type === 'line') renderLine(g, xScaleAt, yScaleAt);
  else if (cfg.type === 'heat') renderHeat(g, xScaleAt, yScaleAt);
  renderLegend(g);
  renderColorbar(g);
  renderHighlight(g);
  updateCaption();
  updateExportButtons();
}

// 导出按钮可用态: 空选中(selected.size === 0)时禁用 #btn-png/#btn-svg,
// 恢复选中后重新启用. draw() 末尾统一调用, 与画布状态始终同步.
function updateExportButtons() {
  const empty = selected.size === 0;
  ['btn-png', 'btn-svg'].forEach(id => {
    const el = $(id);
    if (el) el.disabled = empty;
  });
}

// 四边黑框 + 向内主/次刻度 + 轴标签(变量斜体 Georgia serif, 含单位); 无网格线
function renderAxes(ctx, xScale, yScale) {
  const { x, y, w, h } = plotRect;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1;

  // 四边黑框(0.5 偏移保证 1px 落在像素内)
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // 刻度集合: 线性 → niceTicks(刻度尺端点); 对数 → 10^n
  const xT = axisX.log ? logTickInfo(axisX.lo, axisX.hi) : niceTicks(axisX.lo, axisX.hi);
  const yT = axisY.log ? logTickInfo(axisY.lo, axisY.hi) : niceTicks(axisY.lo, axisY.hi);
  const xMaj = axisX.log ? xT.majors : xT.ticks;
  const yMaj = axisY.log ? yT.majors : yT.ticks;
  const MAJ = 5, MIN = 3;

  ctx.font = TICK_FONT;
  // X 主刻度: 底边向内 + 顶边向内(顶无标签)
  xMaj.forEach(t => {
    const px = Math.round(xScale(t));
    ctx.beginPath(); ctx.moveTo(px, y + h); ctx.lineTo(px, y + h - MAJ); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + MAJ); ctx.stroke();
  });
  // X 刻度标签
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  xMaj.forEach(t => ctx.fillText(fmtTick(t, axisX.log), Math.round(xScale(t)), y + h + 7));

  // Y 主刻度: 左边向内 + 右边向内(右无标签); 刻度标签右对齐
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  yMaj.forEach(t => {
    const py = Math.round(yScale(t));
    ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + MAJ, py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w, py); ctx.lineTo(x + w - MAJ, py); ctx.stroke();
    ctx.fillText(fmtTick(t, axisY.log), x - 8, py);
  });

  // 次刻度(向内, 无标签): 线性按主步长细分(步长 1/5 → 每格 4 个, 2 → 中点 1 个);
  // 对数 → 2..9 × 10^k
  const linFracs = step => {
    const m = step / Math.pow(10, Math.floor(Math.log10(step) + 1e-9));
    if (Math.abs(m - 1) < 1e-9) return [0.2, 0.4, 0.6, 0.8];
    if (Math.abs(m - 2) < 1e-9) return [0.5];
    return [0.2, 0.4, 0.6, 0.8];
  };
  const xMinorAt = (v, drawTop) => {
    const px = Math.round(xScale(v));
    ctx.beginPath(); ctx.moveTo(px, y + h); ctx.lineTo(px, y + h - MIN); ctx.stroke();
    if (drawTop) { ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + MIN); ctx.stroke(); }
  };
  const yMinorAt = v => {
    const py = Math.round(yScale(v));
    ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + MIN, py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w, py); ctx.lineTo(x + w - MIN, py); ctx.stroke();
  };
  if (axisX.log) {
    xT.minors.forEach(v => xMinorAt(v, true));
  } else {
    xT.ticks.forEach(t => linFracs(xT.step).forEach(f => {
      const v = t + f * xT.step;
      if (v <= axisX.hi + 1e-9 && v >= axisX.lo - 1e-9) xMinorAt(v, true);
    }));
  }
  if (axisY.log) {
    yT.minors.forEach(v => yMinorAt(v));
  } else {
    yT.ticks.forEach(t => linFracs(yT.step).forEach(f => {
      const v = t + f * yT.step;
      if (v <= axisY.hi + 1e-9 && v >= axisY.lo - 1e-9) yMinorAt(v);
    }));
  }

  // 轴标题: 变量斜体 Georgia serif, 含单位; X 居中于底边下方, Y 旋转 -90° 居中于左边
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(axisX.label, x + w / 2, y + h + 30);
  ctx.save();
  ctx.translate(x - 44, y + h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(axisY.label, 0, 0);
  ctx.restore();

  ctx.restore();
}

// ============ 数据与样式辅助 (Task 6) ============
// 选中星团中某参数的非空有限值列表
function dataFor(paramId) {
  const p = PARAM_BY_ID[paramId];
  if (!p) return [];
  const out = [];
  DATA.forEach(c => {
    if (!selected.has(c.id)) return;
    const v = p.get(c);
    if (v == null || !isFinite(v)) return;
    out.push({ c, v });
  });
  return out;
}

// 分组: overlay 'disc' → Rgc<8 为组0; 'rich' → [Fe/H]>-1 为组0; 'none' → null
function groupOf(c) {
  if (cfg.overlay === 'disc') return c.rgc != null && c.rgc < 8 ? 0 : 1;
  if (cfg.overlay === 'rich') return c.feh != null && c.feh > -1 ? 0 : 1;
  return null;
}

// v 在 [min,max] 上归一化到 [0,1]
function norm01(v, min, max) {
  if (min === max) return 0.5;
  return (v - min) / (max - min);
}

// 点色: colorMode → viridis(colorParam 归一化); 否则灰度 SERIES[组]
function pointColor(c) {
  if (cfg.colorMode) {
    const r = paramRange(cfg.colorParam, false);
    const v = getParam(c, cfg.colorParam);
    if (r && v != null) return viridis(norm01(v, r.min, r.max));
    return '#666';
  }
  const g = groupOf(c);
  return SERIES[g == null ? 0 : g];
}

// 点大小: sizeParam 归一化到 2.5-7 px
function pointRadius(c) {
  const r = paramRange(cfg.sizeParam, false);
  const v = getParam(c, cfg.sizeParam);
  if (!r || v == null) return 4.5;
  return 2.5 + 4.5 * norm01(v, r.min, r.max);
}

// 示意性误差棒幅度(数据源无误差列; 图注标注 illustrative)
function errOf(paramId) {
  switch (paramId) {
    case 'dist':   return { f: 0.05, abs: null, label: '5%' };
    case 'pmra': case 'pmde': return { f: null, abs: 0.05, label: '0.05 mas/yr' };
    case 'sigma0': return { f: 0.10, abs: null, label: '10%' };
    default: return null;
  }
}

// ctx 参数 = 目标上下文(draw 传主画布或 3× 离屏导出上下文); 函数体直接用该参数
function renderScatter(ctx, xScale, yScale) {
  const pts = dataFor(cfg.x).filter(d => {
    const yv = getParam(d.c, cfg.y);
    return yv != null && isFinite(yv);
  });
  const e = cfg.errBars ? errOf(cfg.y) : null;
  ctx.save();
  pts.forEach(d => {
    const c = d.c, yv = getParam(c, cfg.y);
    const x = xScale(d.v), y = yScale(yv);
    const g = groupOf(c), col = pointColor(c);
    if (e) {
      const err = e.abs != null ? e.abs : e.f * Math.abs(yv);
      ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yScale(yv - err)); ctx.lineTo(x, yScale(yv + err)); ctx.stroke();
    }
    ctx.beginPath();
    ctx.fillStyle = col;
    if (g === 1) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      ctx.arc(x, y, pointRadius(c), 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.arc(x, y, pointRadius(c), 0, Math.PI * 2); ctx.fill();
    }
  });
  ctx.restore();
}

function renderHist(ctx, xScale, yScale) {
  const ds = dataFor(cfg.x);
  const n = ds.length;
  if (!n) return;
  let lo = Infinity, hi = -Infinity;
  ds.forEach(d => { if (d.v < lo) lo = d.v; if (d.v > hi) hi = d.v; });
  const bins = Math.max(1, cfg.bins);
  const binW = (hi - lo) / bins || 1;
  // counts[bin][group]
  const counts = Array.from({ length: bins }, () => [0, 0]);
  ds.forEach(d => {
    let b = Math.floor((d.v - lo) / binW);
    if (b >= bins) b = bins - 1;
    if (b < 0) b = 0;
    const g = groupOf(d.c);
    counts[b][g == null ? 0 : g]++;
  });
  const maxCount = Math.max(1, ...counts.flat());
  // 密度模式峰值 = 实际最大密度(max over bins of cnt/(n·binW)); 不可固定 1, 峰值密度可 >1
  const peakDens = cfg.density
    ? Math.max(...counts.map(b => (b[0] + b[1]) / (n * binW)))
    : maxCount;
  // 重设 Y 轴为实际计数(或密度)范围, 重画坐标轴(闭包捕获 axisY 引用, 自动生效).
  // yScale 内部用 linT(v, axisY.min, axisY.max) 带默认 pad=0.05, 有效范围是
  // [min−0.05·span, max+0.05·span]; 线性模式 lo/hi 必须与之对齐(lo 为负 → y=0 刻度仍在框内):
  //   计数: min=0, max=maxCount, lo=−0.05·maxCount, hi=1.05·maxCount
  //   密度: min=0, max=peakDens,  lo=−0.05·peakDens, hi=1.05·peakDens
  // logY: 保持现有逻辑(10 的整幂端点, 无 padding)
  axisY = {
    min: cfg.logY ? (cfg.density ? 0.01 : 1) : 0,
    max: cfg.logY ? Math.pow(10, Math.ceil(Math.log10(Math.max(peakDens, 1)))) : peakDens,
    log: cfg.logY,
    lo: cfg.logY ? (cfg.density ? 0.01 : 1) : -0.05 * peakDens,
    hi: cfg.logY ? Math.pow(10, Math.ceil(Math.log10(Math.max(peakDens, 1)))) : peakDens * 1.05,
    label: cfg.density ? 'Normalized density' : 'N',
  };
  renderAxes(ctx, xScale, yScale);
  ctx.save();
  const bwFull = plotRect.w / bins, bwDraw = bwFull * 0.9, base = plotRect.y + plotRect.h;
  const yOf = cnt => yScale(cfg.density ? cnt / (n * binW) : cnt);
  for (let b = 0; b < bins; b++) {
    const x0 = xScale(lo + b * binW);
    const c0 = counts[b][0], c1 = counts[b][1];
    if (c0 > 0) { ctx.fillStyle = '#000'; ctx.fillRect(x0 + bwFull * 0.05, yOf(c0), bwDraw, base - yOf(c0)); }
    if (c1 > 0) { ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1; ctx.strokeRect(x0 + bwFull * 0.05, yOf(c1), bwDraw, base - yOf(c1)); }
  }
  ctx.restore();
}

function renderLine(ctx, xScale, yScale) {
  const ds = dataFor(cfg.x);
  if (!ds.length) return;
  const mode = cfg.lineMode;
  ctx.save();
  if (mode === 'cdf') {
    // 累积分布阶梯: 对 x 参数值排序, 累积分数 0→1
    const vals = ds.map(d => d.v).sort((a, b) => a - b);
    axisY = { min: 0, max: 1, log: false, lo: 0, hi: 1, label: 'Cumulative fraction' };
    renderAxes(ctx, xScale, yScale);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath();
    // 标准阶梯 ECDF: moveTo(vals[0], 0) → 对每个 i: 垂直跳变 lineTo(vals[i], frac_i),
    // 再对 i<n-1: 水平延伸 lineTo(vals[i+1], frac_i); 最后 lineTo(vals[n-1], 1)
    ctx.moveTo(xScale(vals[0]), yScale(0));
    for (let i = 0; i < vals.length; i++) {
      ctx.lineTo(xScale(vals[i]), yScale(i / vals.length));
      if (i < vals.length - 1) ctx.lineTo(xScale(vals[i + 1]), yScale(i / vals.length));
    }
    ctx.lineTo(xScale(vals[vals.length - 1]), yScale(1));
    ctx.stroke();
  } else if (mode === 'sorted') {
    // 按 X 排序连线
    const pts = ds.map(d => ({ x: d.v, y: getParam(d.c, cfg.y) }))
                  .filter(p => p.y != null && isFinite(p.y))
                  .sort((a, b) => a.x - b.x);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath();
    pts.forEach((p, i) => {
      const X = xScale(p.x), Y = yScale(p.y);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    });
    ctx.stroke();
  } else {
    // trend: cfg.bins 个 bin 的均值 ±1σ 阴影带 + 均值连线
    const pts = ds.map(d => ({ x: d.v, y: getParam(d.c, cfg.y) }))
                  .filter(p => p.y != null && isFinite(p.y));
    if (!pts.length) { ctx.restore(); return; }
    const lo = Math.min(...pts.map(p => p.x)), hi = Math.max(...pts.map(p => p.x));
    const bins = Math.max(1, cfg.bins), bw = (hi - lo) / bins || 1;
    const bwPx = plotRect.w / bins;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    let started = false;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let b = 0; b < bins; b++) {
      const bv = pts.filter(p => p.x >= lo + b * bw && p.x < lo + (b + 1) * bw);
      if (!bv.length) continue;
      const mean = bv.reduce((s, p) => s + p.y, 0) / bv.length;
      const sd = Math.sqrt(bv.reduce((s, p) => s + (p.y - mean) ** 2, 0) / bv.length);
      const X = xScale(lo + (b + 0.5) * bw);
      const yTop = yScale(mean + sd), yBot = yScale(mean - sd);
      ctx.fillRect(X - bwPx / 2, yTop, bwPx, yBot - yTop);
      if (started) ctx.lineTo(X, yScale(mean)); else { ctx.moveTo(X, yScale(mean)); started = true; }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function renderHeat(ctx, xScale, yScale) {
  const ds = dataFor(cfg.x).filter(d => {
    const yv = getParam(d.c, cfg.y);
    return yv != null && isFinite(yv);
  });
  if (!ds.length) return;
  const xs = ds.map(d => d.v), ys = ds.map(d => getParam(d.c, cfg.y));
  const xlo = Math.min(...xs), xhi = Math.max(...xs);
  const ylo = Math.min(...ys), yhi = Math.max(...ys);
  const nb = Math.max(2, cfg.heatBins);
  const bw = (xhi - xlo) / nb || 1, bh = (yhi - ylo) / nb || 1;
  const counts = Array.from({ length: nb }, () => Array(nb).fill(0));
  ds.forEach(d => {
    let bx = Math.floor((d.v - xlo) / bw); if (bx >= nb) bx = nb - 1; if (bx < 0) bx = 0;
    const yv = getParam(d.c, cfg.y);
    let by = Math.floor((yv - ylo) / bh); if (by >= nb) by = nb - 1; if (by < 0) by = 0;
    counts[bx][by]++;
  });
  const maxC = Math.max(1, ...counts.flat());
  const cw = plotRect.w / nb, ch = plotRect.h / nb;
  ctx.save();
  for (let i = 0; i < nb; i++) for (let j = 0; j < nb; j++) {
    const c = counts[i][j];
    if (!c) continue;
    const t = cfg.heatLog ? Math.log10(c) / Math.log10(maxC) : c / maxC;
    if (cfg.colorMode) { ctx.fillStyle = viridis(t); ctx.globalAlpha = 0.85; }
    else { ctx.fillStyle = '#000'; ctx.globalAlpha = 0.06 + 0.94 * t; }
    const x0 = xScale(xlo + i * bw);
    const y0 = yScale(ylo + (j + 1) * bh), y1 = yScale(ylo + j * bh);
    ctx.fillRect(x0, y0, cw + 0.5, y1 - y0);
  }
  ctx.restore();
}

// 图注: "Fig. <#fig-no>.— <描述>. Selected N clusters; missing M values skipped."
// #fig-no 与 #caption-input 均可编辑; 每次 draw() 重生成.
function updateCaption() {
  const capEl = $('caption-input');
  if (!capEl) return;
  if (document.activeElement === capEl) return;   // 用户正在编辑图注: 任何重绘不得覆盖 textarea
  const figEl = $('fig-no');
  const figNo = (figEl && figEl.value) ? figEl.value : '1';
  const need = cfg.type === 'hist' ? [cfg.x] : [cfg.x, cfg.y];
  let missing = 0;
  DATA.forEach(c => {
    if (!selected.has(c.id)) return;
    if (need.some(id => PARAM_BY_ID[id].get(c) == null)) missing++;
  });
  const desc = cfg.type === 'hist'
    ? 'Distribution of ' + axisLabel(cfg.x)
    : axisLabel(cfg.x) + ' vs ' + axisLabel(cfg.y);
  capEl.value = 'Fig. ' + figNo + '.— ' + desc + '. Selected ' + selected.size +
    ' clusters; missing ' + missing + ' values skipped.';
  if (cfg.type === 'scatter' && cfg.errBars && errOf(cfg.y)) {
    capEl.value += ' Error bars illustrative (' + errOf(cfg.y).label + ').';
  }
}

// 图例: 仅多组(overlay ≠ none)或 colorMode 时, 右上角(plot rect 内)黑框 + 色块 + 文字
function renderLegend(ctx) {
  const multi = cfg.overlay !== 'none' || cfg.colorMode;
  if (!multi) return;
  const { x, y, w, h } = plotRect;
  const rows = [];
  if (cfg.overlay !== 'none') {
    const NAMES = { disc: 'Disc (Rgc<8)', halo: 'Halo (Rgc≥8)', rich: 'Metal-rich', poor: 'Metal-poor' };
    rows.push({ label: NAMES[cfg.overlay] || cfg.overlay, swatch: SERIES[1] });
  }
  if (cfg.colorMode) rows.push({ label: 'Color: ' + axisLabel(cfg.colorParam), swatch: 'gradient' });
  ctx.save();
  ctx.font = TICK_FONT;
  const pad = 8, rh = 16, sw = 12;
  let tw = 0;
  rows.forEach(r => { tw = Math.max(tw, ctx.measureText(r.label).width); });
  const bw = tw + sw + pad * 3, bh = rows.length * rh + pad;
  const off = cfg.colorMode ? 40 : 8;                       // colorbar 在右缘, 图例让位
  const bx = x + w - bw - off, by = y + 8;
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = INK;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  rows.forEach((r, i) => {
    const ry = by + pad / 2 + i * rh;
    if (r.swatch === 'gradient') {
      for (let k = 0; k < sw; k++) {
        ctx.fillStyle = viridis(k / Math.max(1, sw - 1));
        ctx.fillRect(bx + pad, ry + 2, 1, 10);
      }
    } else {
      ctx.fillStyle = r.swatch;
      ctx.fillRect(bx + pad, ry + 2, sw, 10);
    }
    ctx.fillStyle = INK;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(r.label, bx + pad + sw + 6, ry + 7);
  });
  ctx.restore();
}

// Colorbar: 仅 colorMode; plot rect 右缘内侧竖直渐变条(viridis, 下=min 上=max) + 两端 fmtTick 标签
function renderColorbar(ctx) {
  if (!cfg.colorMode) return;
  const r = paramRange(cfg.colorParam);
  if (!r) return;
  const { x, y, w, h } = plotRect;
  const cw = 12, gap = 8, inset = 6;
  const cx = x + w - cw - gap, cy = y + inset, ch = h - inset * 2;
  for (let i = 0; i < ch; i++) {
    ctx.fillStyle = viridis(1 - i / Math.max(1, ch - 1));
    ctx.fillRect(cx, cy + i, cw, 1);
  }
  ctx.strokeStyle = INK;
  ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
  ctx.fillStyle = INK;
  ctx.font = TICK_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(fmtTick(r.max, false), cx + cw / 2, cy - 3);
  ctx.textBaseline = 'top';
  ctx.fillText(fmtTick(r.min, false), cx + cw / 2, cy + ch + 4);
}

// 悬停/聚焦点高亮环(hover 细红环; focus 更粗的深红环, 优先于 hover). 环画在数据之上,
// 随每次 draw 重绘; 导出(SVG/PNG)前会临时清空 hoverId/focusId, 不进入成品图.
function renderHighlight(g) {
  const id = focusId || hoverId;
  if (!id) return;
  const pts = plotPoints();
  const p = pts && pts.find(q => q.id === id);
  if (!p) return;
  const c = DATA.find(cl => cl.id === id);
  const r = (c && pointRadius(c)) || 4.5;
  const focus = id === focusId;
  g.save();
  g.strokeStyle = focus ? '#a02020' : '#d33';
  g.lineWidth = focus ? 2.5 : 1.5;
  g.beginPath();
  g.arc(xScaleAt(p.x), yScaleAt(p.y), r + (focus ? 5 : 3), 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

// ================= SVG =================
// svgEmit(): 镜像 draw() 的当前帧(axisX/axisY/plotRect 为模块态, draw 后即当前帧) →
// 完整 SVG 字符串. 坐标 r2 两位小数; 文本 Georgia serif; 交互高亮环不入导出图.
function svgEmit() {
  if (!canvas) return '';
  const W = canvas.width, H = canvas.height;
  const S = [];
  const r2 = v => (+v).toFixed(2);
  const TX = 'font-family="Georgia, serif"';
  const push = s => S.push(s);

  push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">');
  push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>');

  // ---- 轴: 四边框 + 主/次刻度 + 刻度标签 + 轴标题(与 renderAxes 同几何) ----
  const { x, y, w, h } = plotRect;
  push('<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) + '" fill="none" stroke="#000000"/>');
  const xT = axisX.log ? logTickInfo(axisX.lo, axisX.hi) : niceTicks(axisX.lo, axisX.hi);
  const yT = axisY.log ? logTickInfo(axisY.lo, axisY.hi) : niceTicks(axisY.lo, axisY.hi);
  const xMaj = axisX.log ? xT.majors : xT.ticks;
  const yMaj = axisY.log ? yT.majors : yT.ticks;
  const MAJ = 5, MIN = 3;
  const tick = (x1, y1, x2, y2) => push('<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '" stroke="#000000"/>');
  xMaj.forEach(t => { const px = xScaleAt(t); tick(px, y + h, px, y + h - MAJ); tick(px, y, px, y + MAJ); });
  yMaj.forEach(t => { const py = yScaleAt(t); tick(x, py, x + MAJ, py); tick(x + w, py, x + w - MAJ, py); });
  xMaj.forEach(t => push('<text x="' + r2(xScaleAt(t)) + '" y="' + r2(y + h + 7) + '" ' + TX + ' font-size="12" text-anchor="middle" dominant-baseline="hanging">' + esc(fmtTick(t, axisX.log)) + '</text>'));
  yMaj.forEach(t => push('<text x="' + r2(x - 8) + '" y="' + r2(yScaleAt(t)) + '" ' + TX + ' font-size="12" text-anchor="end" dominant-baseline="central">' + esc(fmtTick(t, axisY.log)) + '</text>'));
  const linFracs = step => {
    const m = step / Math.pow(10, Math.floor(Math.log10(step) + 1e-9));
    if (Math.abs(m - 1) < 1e-9) return [0.2, 0.4, 0.6, 0.8];
    if (Math.abs(m - 2) < 1e-9) return [0.5];
    return [0.2, 0.4, 0.6, 0.8];
  };
  if (axisX.log) xT.minors.forEach(v => { const px = xScaleAt(v); tick(px, y + h, px, y + h - MIN); tick(px, y, px, y + MIN); });
  else xT.ticks.forEach(t => linFracs(xT.step).forEach(f => {
    const v = t + f * xT.step;
    if (v <= axisX.hi + 1e-9 && v >= axisX.lo - 1e-9) { const px = xScaleAt(v); tick(px, y + h, px, y + h - MIN); tick(px, y, px, y + MIN); }
  }));
  if (axisY.log) yT.minors.forEach(v => { const py = yScaleAt(v); tick(x, py, x + MIN, py); tick(x + w, py, x + w - MIN, py); });
  else yT.ticks.forEach(t => linFracs(yT.step).forEach(f => {
    const v = t + f * yT.step;
    if (v <= axisY.hi + 1e-9 && v >= axisY.lo - 1e-9) { const py = yScaleAt(v); tick(x, py, x + MIN, py); tick(x + w, py, x + w - MIN, py); }
  }));
  push('<text x="' + r2(x + w / 2) + '" y="' + r2(y + h + 30) + '" ' + TX + ' font-style="italic" font-size="14" text-anchor="middle" dominant-baseline="hanging">' + esc(axisX.label) + '</text>');
  push('<text transform="translate(' + r2(x - 44) + ',' + r2(y + h / 2) + ') rotate(-90)" ' + TX + ' font-style="italic" font-size="14" text-anchor="middle" dominant-baseline="hanging">' + esc(axisY.label) + '</text>');

  // ---- 数据(与各 render* 同几何) ----
  if (cfg.type === 'scatter') {
    const pts = dataFor(cfg.x).filter(d => {
      const yv = getParam(d.c, cfg.y);
      return yv != null && isFinite(yv);
    });
    const e = cfg.errBars ? errOf(cfg.y) : null;
    pts.forEach(d => {
      const c = d.c, yv = getParam(d.c, cfg.y);
      const X = r2(xScaleAt(d.v)), Y = r2(yScaleAt(yv));
      if (e) {
        const err = e.abs != null ? e.abs : e.f * Math.abs(yv);
        push('<line x1="' + X + '" y1="' + r2(yScaleAt(yv - err)) + '" x2="' + X + '" y2="' + r2(yScaleAt(yv + err)) + '" stroke="#999999"/>');
      }
      const g = groupOf(c), col = pointColor(c), r = r2(pointRadius(c));
      if (g === 1) push('<circle cx="' + X + '" cy="' + Y + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="1.2"/>');
      else push('<circle cx="' + X + '" cy="' + Y + '" r="' + r + '" fill="' + col + '"/>');
    });
  } else if (cfg.type === 'hist') {
    const ds = dataFor(cfg.x);
    if (ds.length) {
      let lo = Infinity, hi = -Infinity;
      ds.forEach(d => { if (d.v < lo) lo = d.v; if (d.v > hi) hi = d.v; });
      const bins = Math.max(1, cfg.bins);
      const binW = (hi - lo) / bins || 1;
      const counts = Array.from({ length: bins }, () => [0, 0]);
      ds.forEach(d => {
        let b = Math.floor((d.v - lo) / binW);
        if (b >= bins) b = bins - 1;
        if (b < 0) b = 0;
        const g = groupOf(d.c);
        counts[b][g == null ? 0 : g]++;
      });
      const n = ds.length;
      const maxCount = Math.max(1, ...counts.flat());
      const peakDens = cfg.density
        ? Math.max(...counts.map(b => (b[0] + b[1]) / (n * binW)))
        : maxCount;
      const bwFull = plotRect.w / bins, bwDraw = bwFull * 0.9, base = plotRect.y + plotRect.h;
      const yOf = cnt => yScaleAt(cfg.density ? cnt / (n * binW) : cnt);
      for (let b = 0; b < bins; b++) {
        const x0 = xScaleAt(lo + b * binW);
        const c0 = counts[b][0], c1 = counts[b][1];
        if (c0 > 0) push('<rect x="' + r2(x0 + bwFull * 0.05) + '" y="' + r2(yOf(c0)) + '" width="' + r2(bwDraw) + '" height="' + r2(base - yOf(c0)) + '" fill="#000000"/>');
        if (c1 > 0) push('<rect x="' + r2(x0 + bwFull * 0.05) + '" y="' + r2(yOf(c1)) + '" width="' + r2(bwDraw) + '" height="' + r2(base - yOf(c1)) + '" fill="none" stroke="#bbbbbb"/>');
      }
    }
  } else if (cfg.type === 'line') {
    const ds = dataFor(cfg.x);
    if (ds.length) {
      const poly = pts => push('<polyline points="' + pts.map(p => r2(p[0]) + ',' + r2(p[1])).join(' ') + '" fill="none" stroke="#000000" stroke-width="1.5"/>');
      if (cfg.lineMode === 'cdf') {
        const vals = ds.map(d => d.v).sort((a, b) => a - b);
        const P = [[vals[0], 0]];
        for (let i = 0; i < vals.length; i++) {
          P.push([vals[i], i / vals.length]);
          if (i < vals.length - 1) P.push([vals[i + 1], i / vals.length]);
        }
        P.push([vals[vals.length - 1], 1]);
        poly(P.map(p => [xScaleAt(p[0]), yScaleAt(p[1])]));
      } else if (cfg.lineMode === 'sorted') {
        const pts = ds.map(d => ({ x: d.v, y: getParam(d.c, cfg.y) }))
                      .filter(p => p.y != null && isFinite(p.y))
                      .sort((a, b) => a.x - b.x);
        poly(pts.map(p => [xScaleAt(p.x), yScaleAt(p.y)]));
      } else {
        const pts = ds.map(d => ({ x: d.v, y: getParam(d.c, cfg.y) }))
                      .filter(p => p.y != null && isFinite(p.y));
        if (pts.length) {
          const lo = Math.min(...pts.map(p => p.x)), hi = Math.max(...pts.map(p => p.x));
          const bins = Math.max(1, cfg.bins), bw = (hi - lo) / bins || 1;
          const bwPx = plotRect.w / bins;
          const means = [];
          for (let b = 0; b < bins; b++) {
            const bv = pts.filter(p => p.x >= lo + b * bw && p.x < lo + (b + 1) * bw);
            if (!bv.length) continue;
            const mean = bv.reduce((s, p) => s + p.y, 0) / bv.length;
            const sd = Math.sqrt(bv.reduce((s, p) => s + (p.y - mean) ** 2, 0) / bv.length);
            const X = xScaleAt(lo + (b + 0.5) * bw);
            push('<rect x="' + r2(X - bwPx / 2) + '" y="' + r2(yScaleAt(mean + sd)) + '" width="' + r2(bwPx) + '" height="' + r2(yScaleAt(mean - sd) - yScaleAt(mean + sd)) + '" fill="#000000" fill-opacity="0.15"/>');
            means.push([X, yScaleAt(mean)]);
          }
          if (means.length) poly(means);
        }
      }
    }
  } else if (cfg.type === 'heat') {
    const ds = dataFor(cfg.x).filter(d => {
      const yv = getParam(d.c, cfg.y);
      return yv != null && isFinite(yv);
    });
    if (ds.length) {
      const xs = ds.map(d => d.v), ys = ds.map(d => getParam(d.c, cfg.y));
      const xlo = Math.min(...xs), xhi = Math.max(...xs);
      const ylo = Math.min(...ys), yhi = Math.max(...ys);
      const nb = Math.max(2, cfg.heatBins);
      const bw = (xhi - xlo) / nb || 1, bh = (yhi - ylo) / nb || 1;
      const counts = Array.from({ length: nb }, () => Array(nb).fill(0));
      ds.forEach(d => {
        let bx = Math.floor((d.v - xlo) / bw); if (bx >= nb) bx = nb - 1; if (bx < 0) bx = 0;
        const yv = getParam(d.c, cfg.y);
        let by = Math.floor((yv - ylo) / bh); if (by >= nb) by = nb - 1; if (by < 0) by = 0;
        counts[bx][by]++;
      });
      const maxC = Math.max(1, ...counts.flat());
      const cw = plotRect.w / nb, ch = plotRect.h / nb;
      for (let i = 0; i < nb; i++) for (let j = 0; j < nb; j++) {
        const c = counts[i][j];
        if (!c) continue;
        const t = cfg.heatLog ? Math.log10(c) / Math.log10(maxC) : c / maxC;
        const x0 = xScaleAt(xlo + i * bw);
        const y0 = yScaleAt(ylo + (j + 1) * bh), y1 = yScaleAt(ylo + j * bh);
        push('<rect x="' + r2(x0) + '" y="' + r2(y0) + '" width="' + r2(cw + 0.5) + '" height="' + r2(y1 - y0) + '" fill="' + (cfg.colorMode ? viridis(t) : '#000000') + '" fill-opacity="' + (cfg.colorMode ? '0.85' : (0.06 + 0.94 * t).toFixed(3)) + '"/>');
      }
    }
  }

  // ---- 图例(overlay/colorMode 时, 同 renderLegend 几何) ----
  if (cfg.overlay !== 'none' || cfg.colorMode) {
    const rows = [];
    if (cfg.overlay !== 'none') {
      const NAMES = { disc: 'Disc (Rgc<8)', halo: 'Halo (Rgc≥8)', rich: 'Metal-rich', poor: 'Metal-poor' };
      rows.push({ label: NAMES[cfg.overlay] || cfg.overlay, swatch: SERIES[1] });
    }
    if (cfg.colorMode) rows.push({ label: 'Color: ' + axisLabel(cfg.colorParam), swatch: 'gradient' });
    const pad = 8, rh = 16, sw = 12;
    let tw = 0;
    rows.forEach(r => { tw = Math.max(tw, r.label.length * 6.2); });   // 12px Georgia 近似字宽
    const bw = tw + sw + pad * 3, bh = rows.length * rh + pad;
    const off = cfg.colorMode ? 40 : 8;
    const bx = x + w - bw - off, by = y + 8;
    push('<rect x="' + r2(bx) + '" y="' + r2(by) + '" width="' + r2(bw) + '" height="' + r2(bh) + '" fill="#ffffff" stroke="#000000"/>');
    rows.forEach((r, i) => {
      const ry = by + pad / 2 + i * rh;
      if (r.swatch === 'gradient') {
        for (let k = 0; k < sw; k++) push('<rect x="' + r2(bx + pad + k) + '" y="' + r2(ry + 2) + '" width="1" height="10" fill="' + viridis(k / Math.max(1, sw - 1)) + '"/>');
      } else {
        push('<rect x="' + r2(bx + pad) + '" y="' + r2(ry + 2) + '" width="' + sw + '" height="10" fill="' + r.swatch + '"/>');
      }
      push('<text x="' + r2(bx + pad + sw + 6) + '" y="' + r2(ry + 7) + '" ' + TX + ' font-size="12" text-anchor="start" dominant-baseline="central">' + esc(r.label) + '</text>');
    });
  }

  // ---- colorbar(colorMode 时, 同 renderColorbar 几何) ----
  if (cfg.colorMode) {
    const r = paramRange(cfg.colorParam);
    if (r) {
      const cw = 12, gap = 8, inset = 6;
      const cx = x + w - cw - gap, cy = y + inset, chh = h - inset * 2;
      for (let i = 0; i < chh; i++) push('<rect x="' + r2(cx) + '" y="' + r2(cy + i) + '" width="' + cw + '" height="1" fill="' + viridis(1 - i / Math.max(1, chh - 1)) + '"/>');
      push('<rect x="' + r2(cx) + '" y="' + r2(cy) + '" width="' + cw + '" height="' + r2(chh) + '" fill="none" stroke="#000000"/>');
      push('<text x="' + r2(cx + cw / 2) + '" y="' + r2(cy - 3) + '" ' + TX + ' font-size="12" text-anchor="middle">' + esc(fmtTick(r.max, false)) + '</text>');
      push('<text x="' + r2(cx + cw / 2) + '" y="' + r2(cy + chh + 4) + '" ' + TX + ' font-size="12" text-anchor="middle" dominant-baseline="hanging">' + esc(fmtTick(r.min, false)) + '</text>');
    }
  }

  push('</svg>');
  return S.join('\n');
}

// ================= INTERACT =================
// Task 7: hover tooltip / click-to-focus / wheel zoom / drag pan / dblclick reset.
// view = 当前数据窗口(数据坐标); null = 自动范围(draw 内 paramRange 计算).
let view = null;
let hoverId = null;          // 悬停高亮(mousemove)
let focusId = null;          // 点击聚焦(focus 环优先于 hover 环)

// 像素 → 数据值(逆用 linT/logT): 线性走 lo/hi 刻度端点(含 5% pad), 对数走 min/max
function screenToData(x, y) {
  const tx = (x - plotRect.x) / plotRect.w;
  const ty = (plotRect.y + plotRect.h - y) / plotRect.h;
  const unLog = (t, lo, hi) => {
    const L = Math.log10(Math.max(lo, 1e-300)), H = Math.log10(Math.max(hi, 1e-300));
    return Math.pow(10, L + t * (H - L));
  };
  return {
    x: axisX.log ? unLog(tx, axisX.lo, axisX.hi) : axisX.lo + tx * (axisX.hi - axisX.lo),
    y: axisY.log ? unLog(ty, axisY.lo, axisY.hi) : axisY.lo + ty * (axisY.hi - axisY.lo),
  };
}

// 当前图型的数据点列表(数据坐标 + cluster id): scatter → 全部点; line → cdf 用累计
// 分数(与渲染阶梯一致), 其余模式用 X/Y 参数值; hist/heat 无单点语义 → []
function fracLe(sorted, v) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
  return lo;
}
function plotPoints() {
  if (cfg.type === 'scatter') {
    return dataFor(cfg.x)
      .filter(d => { const yv = getParam(d.c, cfg.y); return yv != null && isFinite(yv); })
      .map(d => ({ id: d.c.id, x: d.v, y: getParam(d.c, cfg.y) }));
  }
  if (cfg.type === 'line') {
    const ds = dataFor(cfg.x);
    if (!ds.length) return [];
    if (cfg.lineMode === 'cdf') {
      const vals = ds.map(d => d.v).sort((a, b) => a - b);
      const n = vals.length;
      return ds.map(d => ({ id: d.c.id, x: d.v, y: fracLe(vals, d.v) / n }));
    }
    return ds
      .filter(d => { const yv = getParam(d.c, cfg.y); return yv != null && isFinite(yv); })
      .map(d => ({ id: d.c.id, x: d.v, y: getParam(d.c, cfg.y) }));
  }
  return [];
}

// 命中测试: 距光标 ≤12 px 的最近点 → cluster id; scatter/line 之外返回 null
function hitTest(x, y) {
  if (cfg.type !== 'scatter' && cfg.type !== 'line') return null;
  const pts = plotPoints();
  if (!pts.length) return null;
  let best = null, bestD = 12 * 12;
  for (const p of pts) {
    const dx = xScaleAt(p.x) - x, dy = yScaleAt(p.y) - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = p.id; }
  }
  return best;
}

// 悬停高亮(重绘以画/清高亮环; id 不变则跳过重绘)
function setHover(id) {
  if (hoverId === id) return;
  hoverId = id || null;
  draw();
}

// 点击聚焦: 高亮 + 加入选中集(勾选 checkbox) + 列表行滚动到可视区
function setFocus(id) {
  focusId = id || null;
  if (focusId) {
    selected.add(focusId);
    applySelection();
    const list = $('cluster-list');
    const cb = list && list.querySelector('input[data-id="' + focusId + '"]');
    const row = cb && cb.closest('.row');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }
  draw();
}

// ---- tooltip(#tooltip, 绝对定位于 #canvas-wrap 内, 随光标移动) ----
let tip = null;
function ensureTip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.id = 'tooltip';
  tip.style.cssText = 'position:absolute;display:none;pointer-events:none;z-index:50;max-width:360px;' +
    'background:rgba(13,20,38,.96);color:#dfe7ff;border:1px solid rgba(120,160,255,.35);' +
    'border-radius:6px;padding:6px 9px;font:12px Georgia,"Times New Roman",serif;' +
    'line-height:1.5;box-shadow:0 4px 14px rgba(0,0,0,.5)';
  const wrap = $('canvas-wrap');
  if (wrap) wrap.appendChild(tip);
  return tip;
}
function hideTooltip() { if (tip) tip.style.display = 'none'; }
function showTooltip(c, dx, dy, clientX, clientY) {
  const t = ensureTip();
  const pX = PARAM_BY_ID[cfg.x], pY = PARAM_BY_ID[cfg.y];
  const val = (p, v) => (p ? ' · ' + p.label + ' = ' + fmtNum(v) + (p.unit ? ' ' + p.unit : '') : '');
  t.innerHTML = '<b>' + esc(dispOf(c)) + '</b>' +
    (cfg.type === 'hist' ? val(pX, dx) : val(pX, dx) + val(pY, dy));
  const wrap = $('canvas-wrap');
  const wr = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0, width: 1024, height: 768 };
  t.style.display = 'block';
  const tw = t.offsetWidth, th = t.offsetHeight;
  let left = clientX - wr.left + 14, top = clientY - wr.top + 14;
  if (left + tw > wr.width - 4) left = clientX - wr.left - tw - 14;
  if (top + th > wr.height - 4) top = clientY - wr.top - th - 14;
  t.style.left = Math.max(2, left) + 'px';
  t.style.top = Math.max(2, top) + 'px';
}

// ---- 视图操作: 缩放(以光标为中心 ×1.2) / 平移(按数据增量) / 复位 ----
// y 轴是否跟随视图: hist 与 line-cdf 的 y 由渲染器自动接管(计数/累计分数), 不随视图
function yViewDriven() {
  if (cfg.type === 'hist') return false;
  if (cfg.type === 'line' && cfg.lineMode === 'cdf') return false;
  return true;
}
// 一维区间按像素增量平移: 线性平移数值, 对数在 log10 空间平移(再还原)
function shiftRange(min, max, log, dPx, pxSpan) {
  const lo = log ? Math.log10(Math.max(min, 1e-300)) : min;
  const hi = log ? Math.log10(Math.max(max, 1e-300)) : max;
  const span = (hi - lo) || 1;
  const d = dPx * span / (pxSpan || 1);
  if (log) return [Math.pow(10, lo - d), Math.pow(10, hi - d)];
  return [min - d, max - d];
}
function panFrom(base, dx, dy) {
  const [xmin, xmax] = shiftRange(base.xmin, base.xmax, cfg.logX, dx, plotRect.w);
  const v = { xmin, xmax, ymin: base.ymin, ymax: base.ymax };
  if (yViewDriven()) {
    const [ymin, ymax] = shiftRange(base.ymin, base.ymax, cfg.logY, dy, plotRect.h);
    v.ymin = ymin; v.ymax = ymax;
  }
  return v;
}
// 一维区间以数据点 c 为中心缩放 factor(>1 放大); 对数轴在 log10 空间缩放
function zoom1d(min, max, c, log, factor) {
  const lo = log ? Math.log10(Math.max(min, 1e-300)) : min;
  const hi = log ? Math.log10(Math.max(max, 1e-300)) : max;
  const cT = log ? Math.log10(Math.max(c, 1e-300)) : c;
  const span = (hi - lo) || 1;
  const frac = (cT - lo) / span;
  const nspan = span / factor;
  let n0 = cT - frac * nspan, n1 = n0 + nspan;
  if (log) { n0 = Math.pow(10, n0); n1 = Math.pow(10, n1); }
  return [n0, n1];
}
function zoomAt(p, factor) {
  const base = view || { xmin: axisX.min, xmax: axisX.max, ymin: axisY.min, ymax: axisY.max };
  const d = screenToData(p.x, p.y);
  const [xmin, xmax] = zoom1d(base.xmin, base.xmax, d.x, cfg.logX, factor);
  const v = { xmin, xmax, ymin: base.ymin, ymax: base.ymax };
  if (yViewDriven()) {
    const [ymin, ymax] = zoom1d(base.ymin, base.ymax, d.y, cfg.logY, factor);
    v.ymin = ymin; v.ymax = ymax;
  }
  view = v;
  draw();
}

// ---- canvas 监听 ----
// 画布 CSS 显示尺寸可能 ≠ 1024×768 buffer(自适应缩放), 事件坐标按 rect 比例换算
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
}
let drag = null;             // {sx, sy, base, moved}
let suppressClick = false;   // 拖拽平移后抑制随后的 click

function onMouseMove(e) {
  const p = canvasPos(e);
  if (drag) {
    if (drag.moved) { view = panFrom(drag.base, p.x - drag.sx, p.y - drag.sy); draw(); }
    else if (Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy) > 3) drag.moved = true;
    return;
  }
  const id = hitTest(p.x, p.y);
  setHover(id);
  if (id) {
    const q = plotPoints().find(pp => pp.id === id);
    const c = DATA.find(cl => cl.id === id);
    if (q && c) showTooltip(c, q.x, q.y, e.clientX, e.clientY);
  } else hideTooltip();
}
function onMouseDown(e) {
  if (e.button !== 0) return;
  const p = canvasPos(e);
  drag = {
    sx: p.x, sy: p.y, moved: false,
    base: view || { xmin: axisX.min, xmax: axisX.max, ymin: axisY.min, ymax: axisY.max },
  };
}
function onMouseUp() {
  if (drag) { suppressClick = drag.moved; drag = null; }
}
function onClick(e) {
  if (suppressClick) { suppressClick = false; return; }
  const p = canvasPos(e);
  setFocus(hitTest(p.x, p.y));
}
function onWheel(e) {
  e.preventDefault();
  // 滚轮向上(deltaY<0) = 放大 ×1.2; 向下 = 缩小 ÷1.2
  zoomAt(canvasPos(e), e.deltaY < 0 ? 1.2 : 1 / 1.2);
}
function onDblClick() {
  view = null;
  draw();
}
function onMouseLeave() {
  setHover(null);
  hideTooltip();
}

// 接线: 导出按钮 + 画布交互事件
function wireInteract() {
  if (!canvas) return;
  const btn = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  btn('btn-png', exportPNG);
  btn('btn-svg', exportSVG);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDblClick);
  canvas.addEventListener('mouseleave', onMouseLeave);
}

// ================= TEMPLATES =================
// 6 个科学模板(segmented #templates, 按钮 data-i 索引). 每个 apply(): 先 setCfg 定图形
// 参数(经统一入口保证控件同步), 再设选中集. 模板 5/6 只选有轨道参数的星团
// (ecc/rperi 为 null 的 41 个无轨道星团被排除).
const TEMPLATES = [
  { name: 'R_gc vs [Fe/H]',
    apply() { setCfg({ type: 'scatter', x: 'rgc', y: 'feh' }); selectAll(); } },
  { name: 'Metallicity distribution',
    apply() { setCfg({ type: 'hist', x: 'feh', bins: 30 }); selectAll(); } },
  { name: 'Distance distribution',
    apply() { setCfg({ type: 'hist', x: 'dist', bins: 25 }); selectAll(); } },
  { name: 'M_V vs Mass',
    apply() { setCfg({ type: 'scatter', x: 'mass', y: 'mv', logX: true }); selectAll(); } },
  { name: 'Eccentricity distribution',
    apply() {
      setCfg({ type: 'hist', x: 'ecc', bins: 25 });
      setSel(DATA.filter(c => c.ecc != null).map(c => c.id));
      applySelection(); draw();
    } },
  { name: 'Pericentre vs Apocentre',
    apply() {
      setCfg({ type: 'scatter', x: 'rperi', y: 'rapo' });
      setSel(DATA.filter(c => c.rperi != null).map(c => c.id));
      applySelection(); draw();
    } },
];

// ================= EXPORT =================
// 文件名时间戳: plot_<type>_<YYYYMMDD>.<ext>(本地日期)
function dateStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}
// 触发 <a download> 下载(测试钩子可替换 anchor.click 捕获 href/download)
function downloadDataURL(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// 离屏 3× 画布重绘(≈300 dpi) → PNG dataURL → 下载; 返回 dataURL 供测试断言.
// 导出前临时清空 hover/focus 高亮, 成品图为干净帧.
function exportPNG() {
  if (!canvas) return null;
  if (selected.size === 0) return null;   // 空选中无可导出内容(按钮已禁用, 双保险)
  const SCALE = 3;
  const off = document.createElement('canvas');
  off.width = canvas.width * SCALE;
  off.height = canvas.height * SCALE;
  const g = off.getContext('2d');
  g.scale(SCALE, SCALE);
  const sh = hoverId, sf = focusId;
  hoverId = focusId = null;
  try { draw(g); } finally { hoverId = sh; focusId = sf; }
  const url = off.toDataURL('image/png');
  downloadDataURL(url, 'plot_' + cfg.type + '_' + dateStamp() + '.png');
  return url;
}

// svgEmit() → Blob 下载; 返回 SVG 字符串供测试断言
function exportSVG() {
  if (selected.size === 0) return null;   // 空选中无可导出内容(按钮已禁用, 双保险)
  const svg = svgEmit();
  if (!svg) return null;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  downloadDataURL(url, 'plot_' + cfg.type + '_' + dateStamp() + '.svg');
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return svg;
}

// ================= INIT =================
function init() {
  fillParamSelects();
  wireSelection();
  wireCfgControls();
  wireInteract();
  renderList('');
  syncCfgControls();
  draw();
}
init();

// ================= TEST SURFACE =================
// 无头测试钩子(Task 3/4): 把选择 API + 配置状态暴露到 window, 供页面上下文断言
// (brief 测试片段直接调用 selCount()/batchSelect()/presetApply()/selected, 以及
// cfg/setCfg/TEMPLATES). cfg 按引用暴露, 与闭包状态永远同步. Task 5 起新增
// 渲染核心钩子: niceTicks/fmtTick/linScale/logScale/viridis/draw/getPlotState.
Object.assign(window, {
  selected, selCount, applySelection,
  selectAll, clearSel, invertSel, batchSelect,
  PRESETS, presetApply, renderList, matchDisplay,
  cfg, setCfg, TEMPLATES, syncCfgControls,
  niceTicks, fmtTick, linScale, logScale, viridis,
  draw, renderAxes,
  dataFor, plotPoints,
  screenToData, hitTest, setHover, setFocus,
  svgEmit, exportPNG, exportSVG,
  getPlotState: () => ({
    plotRect: { ...plotRect },
    axisX: { ...axisX },
    axisY: { ...axisY },
  }),
});
// view 是 let 绑定(zoom/pan 整体替换对象), 用 getter 暴露当前值供测试读取
Object.defineProperty(window, 'view', { configurable: true, get: () => view });

})();
