// Milky Way Globular Cluster Atlas — 3D interactive explorer
// 经典脚本(非 module), 全局 THREE + THREE.OrbitControls. 任何浏览器 file:// 直开可用.
(function () {
'use strict';
if (typeof THREE === 'undefined') { alert('three.min.js 未加载'); return; }

const D = GC_DATA, CL = D.clusters, RSUN = D.meta.r_sun;

// ---------- M/NGC 名称互通: 解析 Messier 编号, 生成显示名与搜索键 ----------
const normKey = s => (s || '').toLowerCase().replace(/\s+/g, '');
const fmtId = id => id.replace(/(NGC)(\d+)/, '$1 $2');   // NGC6205 -> NGC 6205
CL.forEach(c => {
  const nm = c.name || '';
  // Messier 编号: 名称里 "M 13" / "M13" 或 ID 形如 M13
  let msg = null;
  const m = nm.match(/M\s?(\d+)/i) || (c.id && c.id.match(/^M\s?(\d+)$/i));
  if (m) msg = 'M' + m[1];
  c.msg = msg;
  // 主名/别名: 常用名( Messier > 昵称 )为主, NGC 编号为辅
  let main, sub = [];
  if (msg) {
    main = msg;
    if (fmtId(c.id) !== msg) sub.push(fmtId(c.id));
  } else if (nm && nm !== c.id) {
    main = nm;
    sub.push(fmtId(c.id));
  } else {
    main = fmtId(c.id);
  }
  c.main = main; c.sub = sub;
  // 显示名: "M13 · NGC 6205" / "47 Tuc · NGC 104" / "NGC 104"
  c.disp = sub.length ? main + ' · ' + sub[0] : main;
  // 搜索键: 归一化名称/ID/Messier/纯数字
  c.keys = [normKey(nm), normKey(c.id), msg ? normKey(msg) : '', c.id.replace(/\D/g, '')].filter(Boolean);
});
const $ = id => document.getElementById(id);

// ---------- renderer / scene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
scene.fog = new THREE.FogExp2(0x05070f, 0.0032);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 800);
camera.position.set(26, 18, 34);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.minDistance = 0.5; controls.maxDistance = 400;

// bloom 开关 -> 仅切换发光强度(用发光纹理实现, 无后处理依赖)
let bloomOn = true;

// ---------- coordinate: three.js Y-up. map data (x,y,z)->(x, z, -y) so z_gc(NGP)=+Y ----------
const V = (x, y, z) => new THREE.Vector3(x, z, -y);

// ---------- galaxy disc glow (sprite + rings) ----------
function makeDisc() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  grd.addColorStop(0.00, 'rgba(255,235,200,0.30)');   // 中心压低, 避免淹没轨道
  grd.addColorStop(0.12, 'rgba(255,215,160,0.22)');
  grd.addColorStop(0.30, 'rgba(200,180,220,0.12)');
  grd.addColorStop(0.60, 'rgba(120,140,220,0.05)');
  grd.addColorStop(1.00, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.5 });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(90, 34, 1);          // 扁盘
  sp.position.set(0, 0, 0);
  sp.material.rotation = 0;
  // 让 sprite 平躺: 用 mesh 更稳 -> 改用平面贴图
  const geo = new THREE.PlaneGeometry(95, 95);
  const pmat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.24 });
  const plane = new THREE.Mesh(geo, pmat);
  plane.rotation.x = -Math.PI / 2;  // 躺到银道面
  return plane;
}
const disc = makeDisc(); scene.add(disc);

// ================= 银河系旋臂与中心棒 (科学仿真) =================
// 参数: Reid et al. 2019 (ApJ 885,131, VLBI 视差实测) + Vallée 2017 + Wegg+2015 (棒)
// 方位角 β 从"太阳方向(+x银心轴)"起, 顺银河自转方向增大; 对数螺旋 R=R_ref*exp(-(β-β_ref)*tanψ)
const ARM_DEFS = [
  // name, β_ref(deg), R_ref(kpc), pitch(deg), β范围(deg), 颜色, 强度, 宽度
  { n:'Scutum-Centaurus', bref:23,  rref:4.91, pitch:14.0, b0:-150, b1:104, col:'#7fa0ff', I:1.00, w:1.0 },
  { n:'Sagittarius-Carina', bref:24, rref:6.04, pitch:16.0, b0:-170, b1:97,  col:'#6f95ff', I:0.95, w:1.0 },
  { n:'Perseus',          bref:40,  rref:8.87, pitch:11.0, b0:-140, b1:115, col:'#93abff', I:0.90, w:1.0 },
  { n:'Norma-Outer',      bref:18,  rref:4.46, pitch:14.0, b0:-120, b1:60,  col:'#a9bcff', I:0.78, w:0.9 },
  { n:'Outer',            bref:18,  rref:12.24,pitch:8.0,  b0:-90,  b1:71,  col:'#7c8cd8', I:0.50, w:1.1 },
  { n:'Local (Orion Spur)',bref:9,  rref:8.26, pitch:11.0, b0:-40,  b1:60,  col:'#bcd2ff', I:0.55, w:0.6 },
];
const D2R = Math.PI / 180;
function armPoint(a, betaDeg) {
  const beta = betaDeg * D2R, bref = a.bref * D2R;
  const R = a.rref * Math.exp(-(beta - bref) * Math.tan(a.pitch * D2R));
  // 银心坐标: +x 朝太阳(β=0), +y 朝自转方向
  const x = R * Math.cos(beta), y = R * Math.sin(beta);
  return { x, y, R };
}
// 高斯软圆点纹理
let _dotTex = null;
function dotTexture() {
  if (_dotTex) return _dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.4,'rgba(255,255,255,0.4)');
  gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0,0,64,64);
  _dotTex = new THREE.CanvasTexture(c); return _dotTex;
}
const armsGroup = new THREE.Group(); scene.add(armsGroup);
function buildArms() {
  const tex = dotTexture();
  ARM_DEFS.forEach(a => {
    const pos = [], colr = new THREE.Color(a.col), cols = [], sizes = [];
    const step = 1.1;                       // 方位角步进(度)
    for (let b = a.b0; b <= a.b1; b += step) {
      const p = armPoint(a, b);
      // 沿臂宽度方向(offset)撒点 + 强度随半径包络
      const width = 0.55 * a.w + 0.03 * p.R;   // 臂半宽, 外臂略宽
      const env = Math.exp(-Math.pow((p.R - 7) / 9, 2)) * Math.min(1, p.R / 3.2); // 强度包络, 峰在太阳圈附近, 内端(R<3.2kpc)线性抑制避免中心过亮
      const nHere = Math.max(2, Math.round(6 * a.I * env));
      for (let k = 0; k < nHere; k++) {
        const off = (Math.random() + Math.random() - 1) * width;  // 近似高斯横向偏移
        const perp = (b + 90) * D2R;
        const ox = off * Math.cos(perp), oy = off * Math.sin(perp);
        const z = (Math.random() - 0.5) * 0.18;                    // 薄盘厚度
        pos.push(p.x + ox, z, -(p.y + oy));                        // V(x,y,z)=(x,z,-y)
        const fade = a.I * (0.4 + 0.6 * env) * (0.5 + 0.5 * Math.random());
        cols.push(colr.r * fade, colr.g * fade, colr.b * fade);
        sizes.push(0.5 + Math.random() * 0.9);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.PointsMaterial({ size: 0.6, map: tex, vertexColors: true,
      transparent: true, opacity: 0.17, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true });
    armsGroup.add(new THREE.Points(g, m));
  });
  // HII 亮星团块: 沿主臂点缀的亮斑(年轻恒星形成区)
  const hpos = [], hcol = [];
  ARM_DEFS.slice(0, 4).forEach(a => {
    for (let b = a.b0; b <= a.b1; b += 6) {
      if (Math.random() < 0.55) continue;
      const p = armPoint(a, b + Math.random() * 4);
      hpos.push(p.x, (Math.random()-0.5)*0.12, -p.y);
      const w = 0.75 + Math.random() * 0.5;
      hcol.push(1.0 * w, 0.85 * w, 0.95 * w);   // 微粉白 HII
    }
  });
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(hpos, 3));
  hg.setAttribute('color', new THREE.Float32BufferAttribute(hcol, 3));
  armsGroup.add(new THREE.Points(hg, new THREE.PointsMaterial({ size: 1.2, map: tex,
    vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false,
    blending: THREE.AdditiveBlending })));
}
buildArms();

// 中心棒 (Wegg+2015: 半长5kpc, 相对太阳-银心线偏28°) + 核球
// 低亮度渲染: 点数减半 + opacity 大幅调低 + 单点强度减半, 避免加法混合中心过曝
const barGroup = new THREE.Group(); scene.add(barGroup);
function buildBar() {
  const tex = dotTexture(), pos = [], cols = [];
  const L = 5.0, W = 1.15;                       // 半长/半宽 kpc
  const th = 208 * D2R;                          // 棒方位(近端在太阳对侧 -x, 偏28°)
  const ca = Math.cos(th), sa = Math.sin(th);
  const colr = new THREE.Color('#ffd9a8');
  for (let i = 0; i < 2400; i++) {
    // 沿棒长高斯分布
    let s = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;  // ~三角分布
    const along = s * L;
    const across = (Math.random() + Math.random() - 1) * W * (1 - Math.abs(s) * 0.6);
    const x0 = along, y0 = across;
    const x = x0 * ca - y0 * sa, y = x0 * sa + y0 * ca;
    const z = (Math.random() - 0.5) * 0.5 * (1 - Math.abs(s) * 0.5);  // b/p 增厚
    pos.push(x, z, -y);
    const I = (1 - Math.abs(s) * 0.7) * (0.22 + 0.28 * Math.random());
    cols.push(colr.r * I, colr.g * I, colr.b * I * 0.9);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  barGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.7, map: tex,
    vertexColors: true, transparent: true, opacity: 0.05, depthWrite: false,
    blending: THREE.AdditiveBlending })));
  // 核球(bulge): 半径~2kpc 椭球暖光, 低亮度
  const bp = [], bc = [];
  for (let i = 0; i < 1600; i++) {
    const r = Math.pow(Math.random(), 0.4) * 2.1;
    const u = Math.random() * Math.PI * 2, vphi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(vphi) * Math.cos(u), y = r * Math.sin(vphi) * Math.sin(u);
    const z = r * Math.cos(vphi) * 0.62;        // 垂直略压扁
    bp.push(x, z, -y);
    const I = Math.max(0, 1 - r / 2.2) * (0.2 + 0.25 * Math.random());
    bc.push(1.0 * I, 0.82 * I, 0.6 * I);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
  barGroup.add(new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.55, map: tex,
    vertexColors: true, transparent: true, opacity: 0.03, depthWrite: false,
    blending: THREE.AdditiveBlending })));
}
buildBar();

// ================= 恒星流 (galstreams, Mateu 2023) =================
// 球状星团/矮星系被潮汐撕裂的遗迹. 青色=一般流, 金色=祖源为球状星团.
const streamsGroup = new THREE.Group(); streamsGroup.visible = false; scene.add(streamsGroup);
const streamLabels = new THREE.Group(); streamLabels.visible = false; streamsGroup.add(streamLabels);
const STREAM_COL = 0x37e0d8, STREAM_PROG_COL = 0xffb454;
function streamSmooth(pts) {
  if (pts.length < 4) return pts;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  return curve.getPoints(Math.max(160, pts.length * 2));
}
function buildStreams() {
  if (typeof STREAMS_DATA === 'undefined') return;
  const tex = dotTexture();
  STREAMS_DATA.streams.forEach(s => {
    const raw = [];
    for (let i = 0; i < s.x.length; i++) raw.push(V(s.x[i], s.y[i], s.z[i]));
    const pts = streamSmooth(raw);                       // 平滑骨架
    const isProg = !!s.progenitor;
    const colr = new THREE.Color(isProg ? STREAM_PROG_COL : STREAM_COL);
    // ---- 把骨架撒成细密点带 (沿流线加密 + 横向高斯散布模拟流宽) ----
    const pos = [], cols = [];
    const width = isProg ? 0.22 : 0.4;                   // 流半宽(kpc), 星团流更窄
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const segLen = a.distanceTo(b);
      const nSub = Math.max(1, Math.round(segLen / 0.18));  // 每~0.18kpc一个撒点层
      // 切向与法向
      const tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
      const tl = Math.hypot(tx, ty, tz) || 1;
      // 取一个垂直于切向的平面基
      let px = -ty, py = tx, pz = 0;
      const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl;
      const qx = ty * pz - tz * py, qy = tz * px - tx * pz, qz = tx * py - ty * px;
      for (let k = 0; k < nSub; k++) {
        const t = k / nSub;
        const cx = a.x + tx * t, cy = a.y + ty * t, cz = a.z + tz * t;
        // 每层撒 1-2 个点, 横向高斯
        const nHere = 1 + (Math.random() < 0.5 ? 1 : 0);
        for (let m = 0; m < nHere; m++) {
          const g1 = (Math.random() + Math.random() - 1) * width;
          const g2 = (Math.random() + Math.random() - 1) * width * 0.5;
          pos.push(cx + px * g1 + qx * g2, cy + py * g1 + qy * g2, cz + pz * g1 + qz * g2);
          const fade = (isProg ? 0.85 : 0.5) * (0.45 + 0.55 * Math.random());
          cols.push(colr.r * fade, colr.g * fade, colr.b * fade);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({
      size: isProg ? 0.9 : 0.7, map: tex, vertexColors: true,
      transparent: true, opacity: isProg ? 0.7 : 0.38,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    m.userData.stream = s;
    streamsGroup.add(m);
    // 流名标签(放中点)
    const mid = pts[Math.floor(pts.length / 2)];
    const lab = makeLabel(s.name, mid);
    lab.scale.multiplyScalar(0.8);
    streamLabels.add(lab);
  });
}
buildStreams();

// ================= 矮星系 (LVDB, Pace 2025) =================
// MW 矮星系/M31矮星系/近场矮星系/大星系本体, 渲染为半透明椭球光斑(按半光半径).
const dwarfGroup = new THREE.Group(); dwarfGroup.visible = true; scene.add(dwarfGroup);
const dwarfLabels = new THREE.Group(); dwarfLabels.visible = false; dwarfGroup.add(dwarfLabels);
const DWARF_COLS = { mw: 0x9fb4ff, m31: 0xffb08a, field: 0x8adfC8, galaxy: 0xffd27f };
const DWARF_OPACITY = { mw: 0.8, m31: 0.5, field: 0.4, galaxy: 0.85 };
// 默认只显示 MW 矮星系(最重要); M31/field 用分类开关单独控制
const dwarfClsVisible = { mw: true, m31: false, field: false, galaxy: true };
function buildDwarfs() {
  if (typeof DWARF_DATA === 'undefined') return;
  const tex = dotTexture();
  DWARF_DATA.dwarfs.forEach(d => {
    const colr = new THREE.Color(DWARF_COLS[d.cls] || 0x9fb4ff);
    const v = V(d.x, d.y, d.z);
    // 光斑大小: 半光半径 rh(pc)->kpc 映射到场景, 太大(LMC/SMC/Sgr)限幅
    let rh_kpc = d.rh ? d.rh / 1000.0 : 0.4;
    rh_kpc = Math.max(0.35, Math.min(rh_kpc, 3.0));
    // 弥散光斑: 沿随机方向撒点成椭球
    const n = 60, pos = [], cols = [];
    for (let i = 0; i < n; i++) {
      const u = Math.random()*Math.PI*2, cv = Math.random()*2-1, sv = Math.sqrt(1-cv*cv);
      const rr = Math.pow(Math.random(), 0.5) * rh_kpc;
      pos.push(v.x + rr*sv*Math.cos(u), v.y + rr*cv*0.7, v.z + rr*sv*Math.sin(u));
      const I = (1 - rr/rh_kpc*0.7) * (0.4 + 0.5*Math.random());
      cols.push(colr.r*I, colr.g*I, colr.b*I);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, map: tex,
      vertexColors: true, transparent: true, opacity: DWARF_OPACITY[d.cls] || 0.6,
      depthWrite: false, blending: THREE.AdditiveBlending }));
    m.userData.dwarf = d; m.userData.cls = d.cls;
    dwarfGroup.add(m);
    // 中心亮点
    const core = star('rgba(255,255,255,0.9)', Math.max(0.8, rh_kpc*1.2));
    core.position.copy(v); core.userData.cls = d.cls;
    dwarfGroup.add(core);
    // 名称标签
    const lab = makeLabel(d.name, v); lab.scale.multiplyScalar(0.85);
    lab.position.y += rh_kpc + 0.4; lab.userData.cls = d.cls;
    dwarfLabels.add(lab);
  });
  applyDwarfCls();
}
// 按分类控制可见性
function applyDwarfCls() {
  const master = dwarfGroup.visible;
  dwarfGroup.children.forEach(o => {
    if (o === dwarfLabels) return;
    if (o.userData.cls) o.visible = master && dwarfClsVisible[o.userData.cls];
  });
  dwarfLabels.children.forEach(o => {
    if (o.userData.cls) o.visible = dwarfClsVisible[o.userData.cls] && $('t-label').checked;
  });
}
buildDwarfs();

// ---------- galactic centre + sun ----------
function star(color, size) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1); return s;
}
const gc = star('rgba(255,225,170,0.55)', 2.2); gc.position.set(0, 0, 0); scene.add(gc);
const sun = star('rgba(150,200,255,1)', 2.6); sun.position.copy(V(RSUN, 0, 0)); scene.add(sun);

// ---------- reference rings (R=4,8,12,16,20,30 kpc) ----------
const ringGroup = new THREE.Group();
[4, 8.275, 12, 16, 20, 30].forEach((r, i) => {
  const pts = [];
  for (let a = 0; a <= 128; a++) {
    const t = a / 128 * Math.PI * 2;
    pts.push(V(r * Math.cos(t), r * Math.sin(t), 0));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  // 太阳圈环更亮(0.75), 其余参考环 0.4; 颜色提亮以便在深色背景可见
  const mat = new THREE.LineBasicMaterial({ color: i === 1 ? 0x7fa8e8 : 0x5a74b8,
    transparent: true, opacity: i === 1 ? 0.75 : 0.4 });
  ringGroup.add(new THREE.Line(geo, mat));
  // 太阳圈 (R=R☉=8.275kpc, 太阳绕银心公转轨道圈) 加标签, 避免与太阳系混淆
  if (i === 1) {
    const lab = makeLabel('Solar circle R=R☉', V(r, 0, 0));
    lab.scale.multiplyScalar(0.65);
    ringGroup.add(lab);
  }
});
scene.add(ringGroup);

// ---------- background starfield ----------
(function starfield() {
  const n = 2600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 320 + Math.random() * 260, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
    pos[i*3+1] = r * Math.cos(ph);
    pos[i*3+2] = r * Math.sin(ph) * Math.sin(th);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8a9cd0, size: 0.9,
    sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(p);
})();

// ---------- colour scales (按金属丰度红=富 / 蓝=贫, 与静态图一致) ----------
function lerpC(a, b, t) { return a.clone().lerp(b, clamp01(t)); }
const C_FEH_LO = new THREE.Color(0x3a6bff),   // 贫金属 蓝
      C_FEH_MID = new THREE.Color(0xf0e6c8),  // 中间 暖白
      C_FEH_HI = new THREE.Color(0xff4a35);   // 富金属 红橙
function fehColor(t) {
  t = clamp01(t);
  return t < 0.5 ? lerpC(C_FEH_LO, C_FEH_MID, t * 2) : lerpC(C_FEH_MID, C_FEH_HI, (t - 0.5) * 2);
}
const C = {
  feh:  t => fehColor(t),
  mv:   t => new THREE.Color().setHSL(0.72 - 0.55 * clamp01(t), 0.75, 0.45 + 0.25 * clamp01(t)),
  mass: t => new THREE.Color().setHSL(0.5 - 0.45 * clamp01(t), 0.8, 0.45 + 0.2 * clamp01(t)),
  ecc:  t => new THREE.Color().setHSL(0.62 - 0.55 * clamp01(t), 0.8, 0.5 + 0.15 * clamp01(t)),
  pop:  null,
};
const clamp01 = v => Math.max(0, Math.min(1, v));
function fehT(f){ return clamp01((f + 2.4) / 2.1); }      // -2.4..-0.3 -> 0..1 (0=poor,1=rich)
function popColor(c){ // population: bulge/disc (rich,inner) vs halo
  if (c.feh != null && c.feh > -1.0 && c.rgc != null && c.rgc < 8) return new THREE.Color(0xff5d47);
  return new THREE.Color(0x5b8cff);
}

let colorBy = 'feh';
function colorOf(c) {
  switch (colorBy) {
    case 'feh':  return C.feh(fehT(c.feh == null ? -1.3 : c.feh));
    case 'mv':   return C.mv(clamp01((c.MV == null ? -7 : -c.MV - 3) / 8));
    case 'mass': return C.mass(c.mass ? clamp01((Math.log10(c.mass) - 4) / 2.4) : 0.4);
    case 'ecc':  return C.ecc(c.orbit ? c.orbit.ecc : 0.5);
    case 'pop':  return popColor(c);
  }
}

// ---------- cluster point cloud (custom shader, round soft points) ----------
const N = CL.length;
const pos = new Float32Array(N * 3), col = new Float32Array(N * 3),
      siz = new Float32Array(N), vis = new Float32Array(N);
CL.forEach((c, i) => {
  const v = V(c.x || 0, c.y || 0, c.z || 0);
  pos[i*3] = v.x; pos[i*3+1] = v.y; pos[i*3+2] = v.z;
  vis[i] = 1;
});
// 相对大小编码物理参数: M_V(光度) / Mass / r_h(物理半径) / Equal
// 所有模式统一映射到相同尺寸范围 [S0, S0+RANGE], 仅相对分布不同
let sizeBy = 'mv';
const S0 = 6.0, SRANGE = 9.0;
function computeSizes() {
  for (let i = 0; i < N; i++) {
    const c = CL[i];
    let t;   // 物理参数归一化到 0..1
    switch (sizeBy) {
      case 'mass':                       // log10(M/M☉): 4 -> 1e4, 6.55 -> 3.5e6
        t = clamp01(((c.mass != null ? Math.log10(c.mass) : 5) - 4) / 2.55);
        break;
      case 'rh':                         // 半光半径 0..8 pc
        t = clamp01((c.rh != null ? c.rh : 2) / 8);
        break;
      case 'equal': t = 0.5; break;      // 统一中等尺寸
      case 'mv':
      default: {                         // M_V: -3(暗) .. -10.5(亮)
        const m = c.MV == null ? -6 : c.MV;
        t = clamp01((-m - 3) / 7.5);
      }
    }
    siz[i] = S0 + t * SRANGE;
  }
  if (geo) geo.attributes.aSize.needsUpdate = true;
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
geo.setAttribute('aVis', new THREE.BufferAttribute(vis, 1));
// hover 高亮: 每点一个 0/1 标志, 配合放大+发光
const hl = new Float32Array(N).fill(0);
geo.setAttribute('aHl', new THREE.BufferAttribute(hl, 1));
computeSizes();
const ptsMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: true, blending: THREE.NormalBlending,
  uniforms: { uScale: { value: 1 } },
  vertexShader: `
    attribute vec3 aColor; attribute float aSize; attribute float aVis; attribute float aHl;
    varying vec3 vC; varying float vA; varying float vHl;
    uniform float uScale;
    void main(){
      vC = aColor; vA = aVis; vHl = aHl;
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      float boost = 1.0 + aHl * 1.3;             // hover 放大 ~2.3x
      gl_PointSize = aSize * uScale * boost * (46.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vC; varying float vA; varying float vHl;
    void main(){
      vec2 uv = gl_PointCoord - 0.5; float d = length(uv);
      float a = smoothstep(0.5, 0.08, d);
      float core = smoothstep(0.16, 0.0, d);
      vec3 col = mix(vC, vec3(1.0), core*0.45);
      // hover: 提亮 + 白色发光环
      float ring = smoothstep(0.5, 0.42, d) - smoothstep(0.34, 0.26, d);
      col = mix(col, vec3(1.0), core*0.45 + vHl*0.55);
      col += vec3(1.0) * ring * vHl * 0.9;
      a = max(a, ring * vHl);
      gl_FragColor = vec4(col, a * vA);
      if (gl_FragColor.a < 0.02) discard;
    }`,
});
const points = new THREE.Points(geo, ptsMat);
scene.add(points);

function refreshColors() {
  for (let i = 0; i < N; i++) {
    const c = colorOf(CL[i]);
    col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
  }
  geo.attributes.aColor.needsUpdate = true;
}
refreshColors();

// ---------- labels (for brightest, toggle) ----------
const labelGroup = new THREE.Group(); labelGroup.visible = false; scene.add(labelGroup);
function makeLabel(text, v) {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = '600 26px "SF Mono",monospace'; const w = g.measureText(text).width + 22;
  c.width = w; c.height = 40;
  const gg = c.getContext('2d');
  gg.font = '600 26px "SF Mono",monospace'; gg.fillStyle = 'rgba(220,235,255,0.92)';
  gg.fillText(text, 11, 28);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(w / 40 * 0.9, 0.9, 1); s.position.copy(v); s.position.y += 1.2;
  return s;
}
CL.forEach(c => {
  if (c.MV != null && c.MV < -8.3) labelGroup.add(makeLabel(c.msg || c.name || c.id, V(c.x, c.y, c.z)));
});

// ---------- orbits ----------
const orbitGroup = new THREE.Group(); orbitGroup.visible = false; scene.add(orbitGroup);
const orbitLines = {};
// 用 CatmullRom 样条把折线点插值成平滑曲线 (n_out 目标采样数)
function smoothOrbitPts(rawPts, nOut = 600) {
  if (rawPts.length < 4) return rawPts;
  const curve = new THREE.CatmullRomCurve3(rawPts, false, 'centripetal', 0.5);
  return curve.getPoints(Math.max(nOut, rawPts.length * 2));
}

function buildOrbit(c) {
  if (!c.orbit) return null;
  const o = c.orbit, raw = [];
  for (let i = 0; i < o.x.length; i++) raw.push(V(o.x[i], o.y[i], o.z[i]));
  const pts = smoothOrbitPts(raw, 600);
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const colr = o.retro ? 0xff6a55 : 0x6fb7ff;
  const m = new THREE.LineBasicMaterial({ color: colr, transparent: true, opacity: 0.5 });
  const line = new THREE.Line(g, m);
  line.userData.cid = c.id;
  return line;
}
CL.forEach(c => { if (c.orbit) { const l = buildOrbit(c); if (l) { orbitLines[c.id] = l; orbitGroup.add(l); } } });

// 轨道跟随筛选: 只显示筛选后可见星团的轨道
function updateOrbitVisibility() {
  for (let i = 0; i < N; i++) {
    const line = orbitLines[CL[i].id];
    if (!line) continue;
    line.visible = visArr[i] > 0.5;      // 筛选隐藏的星团, 其轨道也隐藏
  }
}
// 调试/验证钩子: 返回可见轨道数
window.__orbitStats = () => {
  let vis = 0, total = 0;
  for (let i = 0; i < N; i++) {
    const line = orbitLines[CL[i].id];
    if (!line) continue;
    total++;
    if (line.visible) vis++;
  }
  return { visible: vis, total };
};

// single highlighted orbit (for selection)
let selOrbit = null;
function showSelOrbit(c) {
  if (selOrbit) { scene.remove(selOrbit); selOrbit.geometry.dispose(); selOrbit = null; }
  if (!c || !c.orbit) return;
  const o = c.orbit, raw = [];
  for (let i = 0; i < o.x.length; i++) raw.push(V(o.x[i], o.y[i], o.z[i]));
  const pts = smoothOrbitPts(raw, 900);
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  selOrbit = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0.95 }));
  scene.add(selOrbit);
}

// ---------- selection ----------
const ray = new THREE.Raycaster(); ray.params.Points.threshold = 0.55;
const mouse = new THREE.Vector2(); let selected = null;
const selMarker = star('rgba(255,255,255,0.9)', 2.2); selMarker.visible = false; scene.add(selMarker);

function cell(k, v, unit='') {
  return `<div class="i-cell"><div class="k">${k}</div><div class="v">${v}<small> ${unit}</small></div></div>`;
}
// LaTeX 风格数学符号: 衬线斜体变量 + 下标
const mx = (s, sub) => `<i class="mx">${s}</i>${sub ? `<sub>${sub}</sub>` : ''}`;
function fmt(v, nd = 2, na = '—') { return (v == null || isNaN(v)) ? na : (+v).toFixed(nd); }

function showInfo(c) {
  selected = c;
  $('i-name').innerHTML = `${c.main || c.name}<span class="als">${c.sub.length ? c.sub.join(' · ') : ''}</span>`;
  $('i-alias').textContent = '';
  const o = c.orbit;
  $('i-grid').innerHTML =
    cell('Distance', fmt(c.dist, 2), 'kpc') +
    cell(mx('R', 'gc'), fmt(c.rgc, 2), 'kpc') +
    cell('[Fe/H]', fmt(c.feh, 2), 'dex') +
    cell(mx('M', 'V'), fmt(c.MV, 2), 'mag') +
    cell('Mass', c.mass ? (c.mass/1e5).toFixed(2)+'e5' : '—', 'M☉') +
    cell(mx('r', 'h'), fmt(c.rh, 2), 'pc') +
    cell(mx('V', 'r'), fmt(c.vr, 1), 'km/s') +
    cell(mx('σ', '0'), fmt(c.sigma0, 1), 'km/s') +
    (o ? cell(mx('e'), fmt(o.ecc, 3)) + cell(mx('R','peri')+' / '+mx('R','apo'), fmt(o.rperi,1)+' / '+fmt(o.apo?o.apo:o.rapo,1), 'kpc') : '') +
    cell(mx('l'), fmt(c.l, 1), '°') + cell(mx('b'), fmt(c.b, 1), '°');
  $('info').classList.add('show');
  // marker
  selMarker.position.copy(V(c.x, c.y, c.z)); selMarker.visible = true;
  showSelOrbit(c);
}
// ---------- 矮星系信息面板 ----------
const DWARF_TYPE = { mw: 'MW satellite', m31: 'M31 satellite', field: 'Local Volume field', galaxy: 'galaxy' };
function showDwarfInfo(d) {
  selected = { x: d.x, y: d.y, z: d.z, _dwarf: d };          // 供 Center view / Full data 用
  $('i-name').innerHTML = `${d.name}<span class="als">${d.host ? d.host : ''}</span>`;
  $('i-alias').textContent = DWARF_TYPE[d.cls] || d.cls;
  $('i-grid').innerHTML =
    cell('Type', DWARF_TYPE[d.cls] || d.cls) +
    cell('Distance', fmt(d.dist, 1), 'kpc') +
    cell(mx('R', 'gc'), fmt(d.rgc, 1), 'kpc') +
    cell(mx('M', 'V'), fmt(d.MV, 2), 'mag') +
    cell('[Fe/H]', fmt(d.feh, 2), 'dex') +
    cell(mx('r', 'h'), fmt(d.rh, 1), 'pc') +
    cell(mx('V', 'r'), fmt(d.vr, 1), 'km/s') +
    cell('log M★', fmt(d.mass, 2), 'M☉');
  $('info').classList.add('show');
  selMarker.position.copy(V(d.x, d.y, d.z)); selMarker.visible = true;
  showSelOrbit(null);                              // 矮星系无轨道
}
$('i-close').onclick = () => { $('info').classList.remove('show'); selMarker.visible = false; showSelOrbit(null); selected = null; };
$('i-goto').onclick = () => { if (selected) flyTo(V(selected.x, selected.y, selected.z), 6); };

// ---------- Full data detail panel ----------
function row2(k, v, unit = '') {
  return `<tr><td class="dk">${k}</td><td class="dv">${v}<span class="du">${unit}</span></td></tr>`;
}
function showDetail(c) {
  const o = c.orbit || {};
  const has = v => v != null && !isNaN(v);
  let html = '<table class="d-table">';
  html += `<tr class="d-sec"><td colspan="2">Position &amp; Distance</td></tr>`;
  html += row2('RA (J2000)', fmt(c.ra, 3), '°') + row2('Dec (J2000)', fmt(c.dec, 3), '°');
  html += row2(mx('l'), fmt(c.l, 2), '°') + row2(mx('b'), fmt(c.b, 2), '°');
  html += row2('Distance', fmt(c.dist, 2), 'kpc') + row2('dist src', c.dist_src || '—');
  html += row2(mx('R', 'gc'), fmt(c.rgc, 2), 'kpc');
  html += `<tr class="d-sec"><td colspan="2">Photometry &amp; Metallicity</td></tr>`;
  html += row2(mx('V'), fmt(c.V, 2), 'mag') + row2(mx('M', 'V'), fmt(c.MV, 2), 'mag');
  html += row2('[Fe/H]', fmt(c.feh, 2), 'dex') + row2(mx('E')+'('+mx('B')+'−'+mx('V')+')', fmt(c.ebv, 3), 'mag');
  html += `<tr class="d-sec"><td colspan="2">Kinematics (Gaia EDR3)</td></tr>`;
  html += row2(mx('μ','α*'), fmt(c.pmra, 3), 'mas/yr') + row2(mx('μ','δ'), fmt(c.pmde, 3), 'mas/yr');
  html += row2(mx('V','r'), fmt(c.vr, 1), 'km/s') + row2(mx('N','★'), has(c.nstar) ? c.nstar : '—');
  html += `<tr class="d-sec"><td colspan="2">Structure &amp; Dynamics</td></tr>`;
  html += row2('Mass', has(c.mass) ? (c.mass/1e5).toFixed(2)+'×10⁵' : '—', 'M☉');
  html += row2(mx('M')+'/'+mx('L','V'), fmt(c.ml, 2)) + row2(mx('r','h'), fmt(c.rh, 2), 'pc');
  html += row2(mx('σ','0'), fmt(c.sigma0, 1), 'km/s') + row2(mx('v','esc'), fmt(c.vesc, 1), 'km/s');
  html += row2(mx('c'), fmt(c.c, 2)) + row2('log '+mx('T','rh'), fmt(c.logtrh, 2), 'yr');
  if (c.orbit) {
    html += `<tr class="d-sec"><td colspan="2">Orbit (MWPotential2014, 3 Gyr)</td></tr>`;
    html += row2(mx('R','peri'), fmt(o.rperi, 2), 'kpc') + row2(mx('R','apo'), fmt(o.apo, 2), 'kpc');
    html += row2(mx('e'), fmt(o.ecc, 3)) + row2(mx('z','max'), fmt(o.zmax, 2), 'kpc');
    html += row2('sense', o.retro ? 'retrograde 逆行' : 'prograde 顺行');
  }
  html += '</table>';
  $('detail-body').innerHTML = html;
  $('detail').classList.add('show');
}
// ---------- 矮星系专属详情 ----------
function showDwarfDetail(d) {
  const has = v => v != null && !isNaN(v);
  let html = '<table class="d-table">';
  html += `<tr class="d-sec"><td colspan="2">Classification</td></tr>`;
  html += row2('Type', DWARF_TYPE[d.cls] || d.cls) + row2('Host', d.host || '—');
  html += `<tr class="d-sec"><td colspan="2">Position &amp; Distance</td></tr>`;
  html += row2('Distance', fmt(d.dist, 1), 'kpc') + row2(mx('R', 'gc'), fmt(d.rgc, 1), 'kpc');
  html += `<tr class="d-sec"><td colspan="2">Photometry &amp; Metallicity</td></tr>`;
  html += row2(mx('M', 'V'), fmt(d.MV, 2), 'mag') + row2('[Fe/H]', fmt(d.feh, 2), 'dex');
  html += `<tr class="d-sec"><td colspan="2">Structure &amp; Kinematics</td></tr>`;
  html += row2(mx('r', 'h'), fmt(d.rh, 1), 'pc') + row2(mx('V', 'r'), fmt(d.vr, 1), 'km/s');
  html += row2('log M★', has(d.mass) ? fmt(d.mass, 2) : '—', 'M☉');
  html += `<tr class="d-sec"><td colspan="2">Source</td></tr>`;
  html += row2('Catalog', 'LVDB v1.1.0 (Pace 2025)');
  html += '</table>';
  $('detail-body').innerHTML = html;
  $('detail').classList.add('show');
}
$('i-detail').onclick = () => { if (!selected) return;
  if (selected._dwarf) showDwarfDetail(selected._dwarf); else showDetail(selected); };
$('detail-close').onclick = () => $('detail').classList.remove('show');

// ---------- picking ----------
let downPos = null;
renderer.domElement.addEventListener('pointerdown', e => { downPos = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  downPos = null;
  if (moved > 5) return;                    // drag, not click
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  ray.setFromCamera(mouse, camera);
  // 先测球状星团(优先, 点云)
  const hit = ray.intersectObject(points);
  if (hit.length) {
    const c = CL[hit[0].index];
    if (visArr[hit[0].index] > 0.5) { showInfo(c); return; }
  }
  // 再测矮星系
  if (dwarfGroup.visible) {
    const dh = ray.intersectObjects(dwarfGroup.children.filter(o => o.isPoints), false);
    if (dh.length && dh[0].object.userData.dwarf) { showDwarfInfo(dh[0].object.userData.dwarf); return; }
  }
});
// hover: 点亮星团 + 悬浮信息卡
const htip = $('htip');
let hoverIdx = -1;
function setHover(idx) {
  if (idx === hoverIdx) return;
  if (hoverIdx >= 0) hl[hoverIdx] = 0;
  hoverIdx = idx;
  if (idx >= 0) hl[idx] = 1;
  geo.attributes.aHl.needsUpdate = true;
}
renderer.domElement.addEventListener('pointermove', e => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObject(points);
  let shown = false;
  if (hits.length) {
    // 取可见且最近的命中
    for (const h of hits) {
      const i = h.index;
      if (visArr[i] > 0.5) {
        const c = CL[i];
        setHover(i);
        htip.innerHTML = `<div class="ht-name">${c.main || c.name}<span class="als">${c.sub.length ? c.sub.join(' · ') : ''}</span></div>` +
          (c.id !== c.name ? `<div class="ht-id">${c.id}</div>` : '') +
          `<div class="ht-row"><span>${mx('d')}</span><b>${fmt(c.dist,2)} kpc</b></div>` +
          `<div class="ht-row"><span>[Fe/H]</span><b>${fmt(c.feh,2)}</b></div>` +
          `<div class="ht-row"><span>${mx('M','V')}</span><b>${fmt(c.MV,2)}</b></div>` +
          `<div class="ht-hint">click for details</div>`;
        htip.style.opacity = 1;
        // 防止超出屏幕右/下边缘
        const x = Math.min(e.clientX + 16, innerWidth - 190);
        const y = Math.min(e.clientY + 12, innerHeight - 150);
        htip.style.left = x + 'px'; htip.style.top = y + 'px';
        renderer.domElement.style.cursor = 'pointer'; shown = true;
        break;
      }
    }
  }
  if (!shown) { setHover(-1); htip.style.opacity = 0; renderer.domElement.style.cursor = 'grab'; }
});

// ---------- filters ----------
const visArr = vis;
let F = { fehLo: -2.6, fehHi: 0.3, rgcLo: 0, rgcHi: 130, mvLo: -11, mvHi: -3,
          massLo: 0, massHi: 35, sigLo: 0, sigHi: 25, ebvLo: 0, ebvHi: 2.0,
          rhLo: 0.2, rhHi: 5 };
function applyFilters() {
  let n = 0;
  for (let i = 0; i < N; i++) {
    const c = CL[i];
    let ok = true;
    if (c.feh != null && (c.feh < F.fehLo || c.feh > F.fehHi)) ok = false;
    if (c.rgc != null && (c.rgc < F.rgcLo || c.rgc > F.rgcHi)) ok = false;
    if (c.MV != null && (c.MV < F.mvLo || c.MV > F.mvHi)) ok = false;
    // 质量(以 1e5 M☉ 计, 滑块值)
    if (c.mass != null && (c.mass/1e5 < F.massLo || c.mass/1e5 > F.massHi)) ok = false;
    if (c.sigma0 != null && (c.sigma0 < F.sigLo || c.sigma0 > F.sigHi)) ok = false;
    if (c.ebv != null && (c.ebv < F.ebvLo || c.ebv > F.ebvHi)) ok = false;
    if (c.rh != null && (c.rh < F.rhLo || c.rh > F.rhHi)) ok = false;   // 半光半径(arcmin)
    if (c.x == null) ok = false;
    visArr[i] = ok ? 1 : 0; if (ok) n++;
  }
  geo.attributes.aVis.needsUpdate = true;
  $('n-vis').textContent = n;
  updateOrbitVisibility();          // 轨道跟随筛选
}

// ---------- UI wiring ----------
// 图例渐变直接从渲染颜色函数采样生成, 保证与星团实际颜色严格一致
function legendGradient(fn, n = 7) {
  const stops = [];
  for (let i = 0; i < n; i++) stops.push('#' + fn(i / (n - 1)).getHexString());
  return `linear-gradient(90deg,${stops.join(',')})`;
}
function updateLegend() {
  const L = { feh: ['Metallicity [Fe/H]', '−2.4', '−1.3', '−0.3', legendGradient(t => fehColor(t))],
    mv: ['Luminosity M_V', '−11', '−7', '−3', legendGradient(t => C.mv(t))],
    mass: ['Mass (M☉)', '1e4', '1e5', '1e6+', legendGradient(t => C.mass(t))],
    ecc: ['Eccentricity', '0', '0.5', '1', legendGradient(t => C.ecc(t))],
    pop: ['Population', 'Halo', '', 'Bulge/Disc', 'linear-gradient(90deg,#5b8cff,#5b8cff,#ff5d47,#ff5d47)'] }[colorBy];
  $('leg-ttl').textContent = L[0]; $('leg-lo').textContent = L[1];
  $('leg-mid').textContent = L[2]; $('leg-hi').textContent = L[3];
  $('leg-bar').style.background = L[4];
}
$('seg-color').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  [...$('seg-color').children].forEach(x => x.classList.remove('on'));
  b.classList.add('on'); colorBy = b.dataset.v; refreshColors();
  updateLegend();
});
$('seg-size').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  [...$('seg-size').children].forEach(x => x.classList.remove('on'));
  b.classList.add('on'); sizeBy = b.dataset.v; computeSizes();
});
// ---------- 双滑块 range 联动 ----------
// 通用: 两个 input 叠放同轨道, 中间填充高亮显示选中区间
function bindDualRange(loId, hiId, min, max, key, fillId) {
  const lo = $(loId), hi = $(hiId), fill = $(fillId);
  const updateFill = () => {
    const pctLo = (lo.value - min) / (max - min) * 100;
    const pctHi = (hi.value - min) / (max - min) * 100;
    fill.style.left = pctLo + '%'; fill.style.width = (pctHi - pctLo) + '%';
  };
  lo.oninput = () => { if (+lo.value > +hi.value) lo.value = hi.value; F[key+'Lo'] = +lo.value; updDual(key, updateFill); };
  hi.oninput = () => { if (+hi.value < +lo.value) hi.value = lo.value; F[key+'Hi'] = +hi.value; updDual(key, updateFill); };
  return { lo, hi, updateFill };
}
function updDual(key, updateFill) {
  updateFill();
  const full = { feh: [-2.6, 0.3], mv: [-11, -3], mass: [0, 35], sig: [0, 25],
                 ebv: [0, 2.0], rgc: [0, 130], rh: [0.2, 5] }[key];
  if (!full) { applyFilters(); return; }
  const lo = F[key+'Lo'], hi = F[key+'Hi'];
  const isAll = lo <= full[0] && hi >= full[1];
  const outId = { feh: 'o-feh', mv: 'o-mv', mass: 'o-mass', sig: 'o-sig',
                  ebv: 'o-ebv', rgc: 'o-rgc', rh: 'o-rh' }[key];
  $(outId).textContent = isAll ? 'all' : `${lo.toFixed(lo < 10 && key !== 'rh' ? 1 : 1)}…${hi.toFixed(1)}`;
  applyFilters();
}
const fehDual = bindDualRange('r-feh-lo', 'r-feh-hi', -2.6, 0.3, 'feh', 'trk-feh');
const mvDual  = bindDualRange('r-mv-lo', 'r-mv-hi', -11, -3, 'mv', 'trk-mv');
const massDual = bindDualRange('r-mass-lo', 'r-mass-hi', 0, 35, 'mass', 'trk-mass');
const sigDual  = bindDualRange('r-sig-lo', 'r-sig-hi', 0, 25, 'sig', 'trk-sig');
const ebvDual  = bindDualRange('r-ebv-lo', 'r-ebv-hi', 0, 2.0, 'ebv', 'trk-ebv');
const rgcDual  = bindDualRange('r-rgc-lo', 'r-rgc-hi', 0, 130, 'rgc', 'trk-rgc');
const rhDual   = bindDualRange('r-rh-lo', 'r-rh-hi', 0.2, 5, 'rh', 'trk-rh');
fehDual.updateFill(); mvDual.updateFill(); massDual.updateFill(); sigDual.updateFill();
ebvDual.updateFill(); rgcDual.updateFill(); rhDual.updateFill();
$('t-orbit').onchange = e => { orbitGroup.visible = e.target.checked; };
$('t-arms').onchange = e => { armsGroup.visible = barGroup.visible = e.target.checked; };
$('t-streams').onchange = e => { streamsGroup.visible = e.target.checked;
  streamLabels.visible = e.target.checked && $('t-label').checked; };
$('t-dwarf').onchange = e => { dwarfClsVisible.mw = e.target.checked;
  dwarfClsVisible.galaxy = e.target.checked; applyDwarfCls(); };
$('t-dwarf-m31').onchange = e => { dwarfClsVisible.m31 = e.target.checked; applyDwarfCls(); };
$('t-dwarf-field').onchange = e => { dwarfClsVisible.field = e.target.checked; applyDwarfCls(); };
$('t-disc').onchange = e => { disc.visible = e.target.checked; };
$('t-ring').onchange = e => { ringGroup.visible = e.target.checked; };
$('t-label').onchange = e => { labelGroup.visible = e.target.checked;
  streamLabels.visible = e.target.checked && $('t-streams').checked;
  applyDwarfCls(); };
$('t-bloom').onchange = e => { bloomOn = e.target.checked; };

// view presets
function flyTo(target, dist = null) {
  const t = target.clone();
  const dir = camera.position.clone().sub(controls.target).normalize();
  const d = dist != null ? dist : camera.position.distanceTo(controls.target);
  const toPos = t.clone().add(dir.multiplyScalar(d));
  animateCam(controls.target.clone(), t, camera.position.clone(), toPos, 1100);
}
function setView(name) {
  const T = new THREE.Vector3(0, 0, 0);
  let p;
  if (name === 'home') p = new THREE.Vector3(26, 18, 34);
  else if (name === 'face') p = new THREE.Vector3(0.01, 62, 0.01);
  else if (name === 'edge') p = new THREE.Vector3(0.01, 1.2, 66);
  else if (name === 'sun') { p = V(RSUN, 0, 0).add(new THREE.Vector3(2, 1.5, 3)); }
  animateCam(controls.target.clone(), T, camera.position.clone(), p, 1400);
}
$('seg-view').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) setView(b.dataset.v);
});
let camAnim = null;
function animateCam(t0, t1, p0, p1, dur) {
  camAnim = { t0, t1, p0, p1, start: performance.now(), dur };
}
function stepCam() {
  if (!camAnim) return;
  let k = (performance.now() - camAnim.start) / camAnim.dur;
  if (k >= 1) k = 1;
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;  // easeInOutCubic
  controls.target.lerpVectors(camAnim.t0, camAnim.t1, e);
  camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
  if (k === 1) camAnim = null;
}

// tools
let autoRot = false;
$('btn-rot').onclick = () => { autoRot = !autoRot; controls.autoRotate = autoRot; controls.autoRotateSpeed = 0.6; $('btn-rot').classList.toggle('on', autoRot); };
$('btn-full').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); };
$('btn-panel').onclick = () => $('panel').classList.toggle('hidden');
$('p-collapse').onclick = () => $('panel').classList.toggle('hidden');

// ---------- 恢复初始状态 ----------
function resetAll() {
  // 1. 关闭信息卡/详情/选中
  $('info').classList.remove('show'); $('detail').classList.remove('show');
  selMarker.visible = false; showSelOrbit(null); selected = null; setHover(-1);
  // 2. 相机回初始
  controls.target.set(0, 0, 0);
  animateCam(controls.target.clone(), new THREE.Vector3(0, 0, 0),
             camera.position.clone(), new THREE.Vector3(26, 18, 34), 1200);
  controls.autoRotate = false; autoRot = false; $('btn-rot').classList.remove('on');
  // 3. 着色/大小回默认
  colorBy = 'feh';
  [...$('seg-color').children].forEach(x => x.classList.toggle('on', x.dataset.v === 'feh'));
  refreshColors();
  updateLegend();
  sizeBy = 'mv';
  [...$('seg-size').children].forEach(x => x.classList.toggle('on', x.dataset.v === 'mv'));
  computeSizes();
  // 4. 筛选回默认
  F = { fehLo: -2.6, fehHi: 0.3, rgcLo: 0, rgcHi: 130, mvLo: -11, mvHi: -3,
        massLo: 0, massHi: 35, sigLo: 0, sigHi: 25, ebvLo: 0, ebvHi: 2.0,
        rhLo: 0.2, rhHi: 5 };
  $('r-feh-lo').value = -2.6; $('r-feh-hi').value = 0.3;
  $('r-mv-lo').value = -11; $('r-mv-hi').value = -3;
  $('r-mass-lo').value = 0; $('r-mass-hi').value = 35;
  $('r-sig-lo').value = 0; $('r-sig-hi').value = 25;
  $('r-ebv-lo').value = 0; $('r-ebv-hi').value = 2.0;
  $('r-rgc-lo').value = 0; $('r-rgc-hi').value = 130;
  $('r-rh-lo').value = 0.2; $('r-rh-hi').value = 5;
  $('o-feh').textContent = 'all'; $('o-rgc').textContent = 'all'; $('o-mv').textContent = 'all';
  $('o-mass').textContent = 'all'; $('o-sig').textContent = 'all';
  $('o-ebv').textContent = 'all'; $('o-rh').textContent = 'all';
  fehDual.updateFill(); mvDual.updateFill(); massDual.updateFill(); sigDual.updateFill();
  ebvDual.updateFill(); rgcDual.updateFill(); rhDual.updateFill();
  applyFilters();
  // 5. 开关回默认
  const defs = { 't-orbit': false, 't-streams': false, 't-arms': true,
                 't-dwarf': true, 't-dwarf-m31': false, 't-dwarf-field': false,
                 't-disc': true, 't-ring': true, 't-label': false, 't-bloom': true };
  for (const [id, v] of Object.entries(defs)) {
    const el = $(id);
    if (el.checked !== v) { el.checked = v; el.dispatchEvent(new Event('change')); }
  }
}
$('btn-reset').onclick = resetAll;

// search
const q = $('q'), sugg = $('sugg');
function doSearch(s) {
  s = s.trim().toLowerCase();
  if (!s) { sugg.classList.remove('show'); return; }
  // 归一化匹配: "M13" == "M 13", "ngc 6205" == "ngc6205" == "6205"
  const nq = s.replace(/\s+/g, '');
  const hits = CL.filter(c => c.keys.some(k => k.includes(nq))).slice(0, 8);
  if (!hits.length) { sugg.classList.remove('show'); return; }
  sugg.innerHTML = hits.map(c => `<div class="it" data-id="${c.id}"><span>${c.main || c.name}<small class="als">${c.sub.length ? c.sub.join(' · ') : ''}</small></span><small>${fmt(c.dist,1)}k</small></div>`).join('');
  sugg.classList.add('show');
  [...sugg.children].forEach(el => el.onclick = () => {
    const c = CL.find(x => x.id === el.dataset.id);
    sugg.classList.remove('show'); q.value = c.disp || c.name;
    showInfo(c); flyTo(V(c.x, c.y, c.z), 8);
  });
}
q.addEventListener('input', e => doSearch(e.target.value));
q.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const f = sugg.querySelector('.it'); if (f) f.click(); }
  if (e.key === 'Escape') { q.blur(); sugg.classList.remove('show'); }
});
addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); }
  if (e.key === 'Escape' && document.activeElement !== q) {
    // 优先关详情/信息卡, 其次退出 Center view 回全局视角
    if ($('detail').classList.contains('show')) $('detail-close').click();
    else if ($('info').classList.contains('show')) $('i-close').click();
    else resetAll();
  }
  if ((e.key === 'r' || e.key === 'R') && document.activeElement !== q) resetAll();
});

// ---------- resize / loop ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

$('n-cl').textContent = D.meta.n;
updateLegend();   // 初始图例与渲染一致(不依赖 CSS 默认值)
applyFilters();
document.getElementById('loader').classList.add('done');
setTimeout(() => $('hint').style.opacity = 0, 9000);

function loop() {
  requestAnimationFrame(loop);
  stepCam();
  controls.update();
  renderer.render(scene, camera);
}
loop();

})();  // end IIFE
