# 🌌 银河系球状星团大星表 · 轨道 · 恒星流 · 3D 交互可视化

[English](README.md) | **中文**

> 一个**数据精确、完全本地、可交互**的银河系球状星团综合项目：从国际权威天文数据库
> （CDS VizieR + galstreams）抓取多个权威星表，交叉证认合并成统一主星表（176 个星团），
> 在标准银河引力势（MWPotential2014）中做轨道积分（135 条平滑轨道），叠加 124 条银河恒星流，
> 并以**科学参数化的旋臂/棒模型**呈现在一个零安装、双击即开的 **3D Web 应用**（Three.js）中。
> 完全离线、完全自包含。

[![在线演示](https://img.shields.io/badge/🔴_在线演示-jianxing--chen.github.io-4f8dff)](https://jianxing-chen.github.io/globular-cluster-atlas/)
[![许可证](https://img.shields.io/badge/许可证-MIT-37e0d8)](LICENSE)
[![Stars](https://img.shields.io/github/stars/jianxing-chen/globular-cluster-atlas?style=social)](https://github.com/jianxing-chen/globular-cluster-atlas)

![3D 可视化](figures/viz_screenshot_home.png)

---

## 🔴 在线演示

| 入口 | 地址 |
|------|------|
| **项目门户**（落地页） | https://jianxing-chen.github.io/globular-cluster-atlas/ |
| **3D 可视化**（直达） | https://jianxing-chen.github.io/globular-cluster-atlas/viz/ |

托管于 GitHub Pages——纯静态、无需构建、无后端。

---

## ✨ 亮点

| 项目 | 内容 |
|------|------|
| **统一主星表** | **176** 个球状星团，4 个星表交叉证认合并 |
| **6D 相空间** | **135** 个星团拥有完整 位置+自行+视向速度 |
| **轨道积分** | **135** 条平滑轨道，MWPotential2014 反推 3 Gyr |
| **恒星流** | **124** 条银河恒星流（galstreams），18 条关联祖源星团 |
| **银河系结构** | 4 主旋臂 + 本地臂 + Outer 臂 + 中心棒 + 核球 |
| **静态科学图** | 6 张出版级 PNG |
| **3D Web 应用** | 完全本地、双击即开、~120 fps |
| **项目门户** | 英文落地页，含图片 lightbox 与文献引用链接 |

---

## 🚀 快速开始

### 3D 可视化（无需安装，双击即开）
```bash
git clone git@github.com:jianxing-chen/globular-cluster-atlas.git
cd globular-cluster-atlas
open viz/index.html        # macOS
# start viz\index.html     # Windows
# xdg-open viz/index.html  # Linux
```
> 任何现代浏览器（Chrome / Edge / Firefox / Safari）从 `file://` 直接打开即可——
> 纯经典脚本、无 ES module、无网络请求，完全离线自包含。

### 交互
- **拖拽** 旋转 · **滚轮** 缩放 · **点击星团** 弹出完整信息卡
- **`/`** 聚焦搜索框，输入名称（如 `47 Tuc`、`omega Cen`、`M13`）→ 回车飞过去
- **`R`** 或 ⟲ 按钮重置视图与筛选 · **`Esc`** 关闭信息卡 / 取消选中
- 左侧面板：5 种着色（金属丰度/光度/质量/偏心率/星族）、金属丰度/银心距/光度筛选、
  轨道开关、**旋臂**、**恒星流**、银河盘、参考环、标签、Bloom、4 种视角预设
  （Home / Face-on / Edge-on / From-Sun）
- 信息卡：**Toggle orbit** 显示该星团平滑轨道，**Fly to** 飞向它

### 复现数据流水线（可选）
```bash
cd scripts
python3 download_catalogs.py    # 1 从 VizieR 下载原始星表
python3 parse_and_validate.py   # 2 解析 + 校验
python3 build_master.py         # 3 合并成统一主星表
python3 integrate_orbits.py     # 4 轨道积分 (MWPotential2014)
python3 process_streams.py      # 5 恒星流 (先 clone galstreams 到 /tmp/galstreams)
python3 make_figures.py         # 6 静态图
python3 export_viz_data.py      # 7 打包给 Web 应用
```
依赖：`numpy pandas matplotlib scipy`（轨道/绘图全自实现，无需 astropy/galpy）。

---

## 📊 数据来源

所有星表均经 CDS VizieR 官方目录号逐一核实。

| 星表 | VizieR 目录 | 内容 | 行数 |
|------|------------|------|------|
| [Harris 1996/2010](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/202) | `VII/202/catalog` | 坐标/距离/光度/[Fe/H]/E(B-V)/视向速度/结构/弛豫时间/密度（38 列） | 147 |
| [Vasiliev & Baumgardt 2021](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/MNRAS/505/5978) | `J/MNRAS/505/5978/tablea1` | Gaia EDR3 自行 + 视差（→距离） | 170 |
| [Baumgardt & Hilker 2018](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/MNRAS/478/1520) | `J/MNRAS/478/1520/table2` | 质量/质光比/半光半径/弛豫时间/逃逸速度/速度弥散 | 112 |
| [Bica et al. 2019](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/AJ/157/12) | `J/AJ/157/12/table3` | 银河系星团与候选总表（含新发现球状星团候选） | 10978 |
| [galstreams (Mateu 2023)](https://github.com/cmateu/galstreams) | `github.com/cmateu/galstreams` | 银河恒星流 6D 轨迹汇编（GD-1/Pal5/Orphan-Chenab 等） | 124 条流 |

**合并策略**：名称规范化（Messier/常用名 → Harris 主键）+ 坐标交叉匹配（容差 3″）。
距离优先级 `Baumgardt&Hilker > Gaia 视差 > Harris`；坐标/自行取 Gaia EDR3；
金属丰度/消光/颜色取 Harris；质量/结构取 Baumgardt & Hilker。

**主星表字段覆盖**（176 个星团）：
有距离 170 · 有自行 170 · 有质量 118 · 有金属丰度 139 · 有视向速度 141 · 完整 6D **135**。

---

## 🌠 银河系结构仿真

银河盘并非示意，而是按**权威文献参数**做的粒子仿真：

- **旋臂**：4 条主臂（Scutum-Centaurus、Sagittarius-Carina、Perseus、Norma-Outer）
  + Outer 臂 + 本地臂（猎户支臂），对数螺旋 `R(β)=R_ref·exp(−(β−β_ref)·tan ψ)`，
  螺距角 8–16°——参数取自 **Reid et al. 2019**（VLBI 视差实测）与 **Vallée 2017** 综述。
- **中心棒**：半长 5 kpc、偏 28°（**Wegg et al. 2015**）+ 花生状核球。
- **HII 亮斑**：沿主臂点缀的年轻恒星形成区。

### 恒星流（galstreams）
叠加了 **124 条银河恒星流**轨迹（Mateu 2023）——球状星团/矮星系被银河系潮汐撕裂的遗迹，
与（被吸积的）球状星团物理上同源，共同讲述银河系的并合历史。
- **青色** = 一般恒星流；**金色** = 祖源为球状星团的流（Pal5、ω Cen-Fimbulthul、
  NGC3201-Gjöll 等，已自动关联到主星表）
- 以散点密度渲染（平滑骨架 + 横向高斯散布模拟流宽）

---

## 🔬 轨道积分

- **引力势**：`MWPotential2014`（Bovy 2015）= Hernquist 核球 + Miyamoto-Nagai 盘 + NFW 晕，
  数值标定至 v_c(R☉)=238 km/s。
- **坐标变换**：自实现 IAU 1958 银道变换（经 47 Tuc 校验），日心→银心右手笛卡尔。
- **积分器**：scipy `DOP853`（8 阶 Runge-Kutta），反推 3 Gyr，rtol=1e-7。
- **太阳参数**：R☉=8.275 kpc，v☉=(11.1, 251.24, 7.25) km/s，z☉=20.8 pc。
- **输出**：平滑轨道 + R_peri / R_apo / 偏心率 / z_max / 顺逆行。

---

## ✅ 数据精确性校验

| 校验项 | 结果 | 状态 |
|--------|------|------|
| 各星表行数 vs VizieR | 147 / 170 / 112 / 10978 | ✓ 一致 |
| 坐标一致性（Harris vs Gaia EDR3） | 角距离中位数 0.048′（≈3″） | ✓ 可靠 |
| 太阳处圆周速度 | 238.0 km/s | ✓ MWPotential2014 |
| 47 Tuc 银道坐标 | l=305.89°, b=−44.89° | ✓ 文献 305.90, −44.89 |
| 轨道起点 vs 主星表坐标 | 偏差 ≈ 0.02 kpc | ✓ 同一参考系 |
| 在线 3D 应用（无头实测） | 176 星团 / 124 流 / 0 JS 错误 / 120 fps | ✓ 通过 |

**著名星团抽查**（与文献一致）：

| 星团 | 距离 | [Fe/H] | 质量 | 偏心率 |
|------|------|--------|------|--------|
| 47 Tuc (NGC 104) | 4.41 kpc | −0.76 | 7.79×10⁵ M☉ | 0.12（盘轨道）|
| ω Cen (NGC 5139) | 5.20 kpc | −1.62 | 3.55×10⁶ M☉（银河系最大）| 0.69 |
| M13 (NGC 6205) | 6.60 kpc | −1.54 | 4.53×10⁵ M☉ | 0.81 |

---

## 🌐 项目门户（落地页）

仓库根目录提供一个**英文项目门户**（`index.html`）：
- 英雄区 + 统计 + 3D 预览（点击进入）
- 主星表字段覆盖与著名星团抽查表
- **可点击的来源卡片**（链接到各 VizieR 目录 / GitHub / ADS 文献）
- 银河系模型与轨道摘要、数据校验表
- **带 lightbox 的图画廊**（点击放大，←/→ 或 Esc 导航）
- 复现说明

---

## 📁 目录结构

```
GlobularClusterAtlas/
├── index.html               # ★ 项目门户（落地页，英文）
├── viz/                     # ★ 3D Web 应用（自包含，打开 viz/index.html）
│   ├── index.html
│   ├── app.js               # Three.js 应用（纯经典脚本，无 module）
│   ├── gc_data.js           # 176 球状星团 + 135 轨道
│   ├── streams_data.js      # 124 恒星流
│   └── assets/              # three.min.js + OrbitControls（本地化，离线可用）
├── data/
│   ├── raw/                 # VizieR 原始 TSV（4 个星表）
│   └── processed/           # master_catalog.csv/.json/.pkl, orbits.json
├── scripts/                 # 7 个流水线脚本
├── figures/                 # 6 张静态图 + Web 应用截图
├── README.md                # English README
├── README.zh-CN.md          # 本文件（中文）
├── LICENSE                  # MIT
└── .gitignore
```

---

## 🖼️ 图集

| | |
|---|---|
| ![全天](figures/01_aitoff_sky.png) | ![银心坐标](figures/02_galactocentric_xyz.png) |
| 全天 Aitoff 投影（金属丰度） | 银心俯视/侧视 |
| ![金属丰度](figures/03_metallicity.png) | ![光度质量](figures/04_luminosity_mass.png) |
| 金属丰度双峰 | 光度/质量函数 |
| ![轨道相空间](figures/05_orbital_phase.png) | ![结构](figures/06_structure.png) |
| 轨道相空间 | 质量-半径/动力学 |

### Web 应用截图

| | |
|---|---|
| ![Home](figures/viz_screenshot_home.png) | ![旋臂](figures/viz_screenshot_arms.png) |
| 3/4 视角总览 | 旋臂科学仿真 |
| ![轨道](figures/viz_screenshot_orbits.png) | ![恒星流](figures/viz_screenshot_streams.png) |
| 135 条平滑轨道 | 124 条恒星流 |
| ![边视](figures/viz_screenshot_edgeon.png) | ![选中](figures/viz_screenshot_select.png) |
| Edge-on 盘轨道 | 信息卡 + 搜索 |

---

## ⚠️ 说明与局限

- 距离/自行/视向速度的不确定度未纳入轨道积分（输出为标称轨道中心值）。
- 银河势为静态轴对称模型，未含银棒、旋臂、LMC 潮汐等非轴对称/时变项。
- 少数星团（主要为 Bica 2019 新候选）缺 Gaia 6D 数据，故无轨道。
- 坐标变换与引力势为独立自实现（规避 astropy/galpy 依赖），关键量已经文献值校验。
- 旋臂/棒/核球为**科学参数化的粒子仿真**（示意性分布，非逐星实测）。

## 📚 参考文献

- Harris W.E. 1996, AJ, 112, 1487（2010 修订）
- Vasiliev E. & Baumgardt H. 2021, MNRAS, 505, 5978
- Baumgardt H. & Hilker M. 2018, MNRAS, 478, 1520
- Bica E. et al. 2019, AJ, 157, 12
- Bovy J. 2015, ApJS, 216, 29（MWPotential2014）
- Reid M.J. et al. 2019, ApJ, 885, 131（旋臂）
- Vallée J.P. 2017（旋臂综述）
- Wegg C. et al. 2015, MNRAS, 450, 4050（中心棒）
- Mateu C. 2023, MNRAS, 520, 5225（galstreams）
- 数据经由 [CDS VizieR](https://vizier.cds.unistra.fr/)（斯特拉斯堡天文数据中心）获取

---

## 📄 许可证

[MIT](LICENSE) © Jianxing Chen. 数据版权归原作者所有（见 LICENSE 附注）。

*Made with Three.js · 数据精确 · 完全本地 · 开放可视化*
