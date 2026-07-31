#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
解析 VizieR TSV -> pandas.DataFrame, 并做数据校验与跨表抽查。
输出 data/processed/*.pkl 供后续构建主星表使用。
"""
import os, re, math
import numpy as np
import pandas as pd

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
PRO = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
os.makedirs(PRO, exist_ok=True)


def read_vizier_tsv(path):
    """读取 asu-tsv 文件: 跳过头部的'#Column'等, 用列名行做表头。"""
    with open(path, encoding="utf-8") as f:
        lines = [l.rstrip("\n") for l in f if not l.startswith("#")]
    # 找分隔线(整行仅由 - 与 tab 组成)
    sep_idx = next(i for i, l in enumerate(lines)
                   if l.strip() and set(l.strip()) <= set("-\t "))
    header = lines[sep_idx - 2].split("\t")     # 列名行(单位行之上)
    header = [h.strip() for h in header]
    rows = [l.split("\t") for l in lines[sep_idx + 1:] if l.strip()]
    df = pd.DataFrame(rows, columns=header)
    # 去空列名
    df = df.loc[:, [c for c in df.columns if c != ""]]
    for c in df.columns:
        df[c] = df[c].str.strip()
        # 尝试转数值
        conv = pd.to_numeric(df[c].replace({"": np.nan, "------": np.nan}), errors="coerce")
        if conv.notna().sum() >= max(1, int(0.5 * df[c].notna().sum())):
            df[c] = conv
    return df.reset_index(drop=True)


def hms_to_deg(hms):
    """'HH MM SS.s' -> 度"""
    try:
        h, m, s = hms.split()
        return (float(h) + float(m) / 60 + float(s) / 3600) * 15.0
    except Exception:
        return np.nan


def dms_to_deg(dms):
    """'+DD MM SS' -> 度"""
    try:
        dms = dms.strip()
        sign = -1 if dms.startswith("-") else 1
        d, m, s = dms.lstrip("+-").split()
        return sign * (float(d) + float(m) / 60 + float(s) / 3600)
    except Exception:
        return np.nan


def norm_name(s):
    """名称规范化用于跨表匹配: 去空白/大小写, 统一 NGC/Pal/ESO 等。"""
    if not isinstance(s, str) or not s.strip():
        return ""
    s = s.strip().upper()
    s = re.sub(r"\s+", " ", s)
    # 常见等价写法
    s = s.replace("NGC", "NGC ").replace("PAL", "PAL ").replace("  ", " ")
    s = re.sub(r"\s+", "", s)          # 去全部空格
    return s


def main():
    # ---------- 1. Harris ----------
    harris = read_vizier_tsv(os.path.join(RAW, "harris_vii202_catalog.tsv"))
    harris["RAdeg"] = harris["RAJ2000"].apply(hms_to_deg)
    harris["DEdeg"] = harris["DEJ2000"].apply(dms_to_deg)
    harris["key"] = harris["ID"].apply(norm_name)
    harris["altkey"] = harris["Name"].apply(norm_name)

    # ---------- 2. Vasiliev & Baumgardt 2021 ----------
    vb = read_vizier_tsv(os.path.join(RAW, "vb2021_pm_dist.tsv"))
    vb["key"] = vb["Name"].apply(norm_name)
    vb["altkey"] = vb["OName"].apply(norm_name)
    # 距离: 优先 1/视差; 视差不可靠时稍后由 Harris 距离回填
    with np.errstate(divide="ignore", invalid="ignore"):
        vb["dist_plx_kpc"] = np.where(vb["plx"] > 0.02, 1.0 / vb["plx"], np.nan)

    # ---------- 3. Baumgardt & Hilker 2018 ----------
    bh = read_vizier_tsv(os.path.join(RAW, "bh2018_mass.tsv"))
    bh["key"] = bh["Cluster"].apply(norm_name)
    bh["altkey"] = bh["SimbadName"].apply(norm_name)

    # ---------- 4. Bica 2019 ----------
    bica = read_vizier_tsv(os.path.join(RAW, "bica2019_clusters.tsv"))
    bica["key"] = bica["Name"].apply(norm_name)

    # ---------- 校验 ----------
    print("=" * 62)
    print("行数核对")
    print(f"  Harris VII/202          : {len(harris)}  (预期 147)")
    print(f"  Vasiliev&Baumgardt 2021 : {len(vb)}  (预期 170)")
    print(f"  Baumgardt&Hilker 2018   : {len(bh)}  (预期 112)")
    print(f"  Bica 2019 table3        : {len(bica)}  (预期 10978)")

    print("\n已知星团抽查 (47 Tuc / NGC 5139 ω Cen / NGC 6205 M13)")
    for label, key in [("47 Tuc / NGC 104", "NGC104"),
                       ("ω Cen / NGC 5139", "NGC5139"),
                       ("M13 / NGC 6205", "NGC6205")]:
        h = harris[harris["key"] == key]
        v = vb[vb["key"] == key]
        b = bh[bh["key"] == key]
        print(f"\n  ▶ {label}")
        if len(h):
            r = h.iloc[0]
            print(f"    Harris : l={r['GLON']:.2f} b={r['GLAT']:.2f} Rsun={r['Rsun']}kpc "
                  f"[Fe/H]={r['[Fe/H]']} Vt={r['Vt']} Vr={r['Vr']}km/s")
        else:
            print("    Harris : 未找到!")
        if len(v):
            r = v.iloc[0]
            print(f"    VB2021 : pmRA={r['pmRA']} pmDE={r['pmDE']} plx={r['plx']} "
                  f"(d≈{r['dist_plx_kpc']:.2f}kpc) Nstar={int(r['Nstar']) if pd.notna(r['Nstar']) else '?'}")
        else:
            print("    VB2021 : 未找到!")
        if len(b):
            r = b.iloc[0]
            print(f"    BH2018 : Mass={r['Mass']:.2e}Msun M/LV={r['M/LV']} r_h={r['rmlp']}pc Vesc={r['Vesc']}km/s")
        else:
            print("    BH2018 : 未找到(该团不在112样本内)")

    # ---------- 跨表匹配覆盖率 ----------
    hkeys = set(harris["key"]) | set(harris["altkey"])
    vkeys = set(vb["key"]) | set(vb["altkey"])
    bkeys = set(bh["key"]) | set(bh["altkey"])
    overlap_hv = len(hkeys & vkeys)
    overlap_hb = len(hkeys & bkeys)
    overlap_vb = len(vkeys & bkeys)
    print("\n跨表名称匹配覆盖(去空白后名称交集):")
    print(f"  Harris ∩ VB2021 : {overlap_hv}")
    print(f"  Harris ∩ BH2018 : {overlap_hb}")
    print(f"  VB2021 ∩ BH2018 : {overlap_vb}")

    # ---------- 坐标一致性抽查(匹配上的星团) ----------
    merged = vb.merge(harris, on="key", how="inner", suffixes=("_v", "_h"))
    if len(merged):
        dra = (merged["RAJ2000_v"] - merged["RAdeg"]) * np.cos(np.radians(merged["DEdeg"]))
        dde = merged["DEJ2000_v"] - merged["DEdeg"]
        dist_arcmin = np.sqrt(dra**2 + dde**2) * 60
        print(f"\n坐标一致性(Harris vs VB2021, {len(merged)} 个直接匹配团):")
        print(f"  角距离中位数 = {np.nanmedian(dist_arcmin):.3f} arcmin, "
              f"最大 = {np.nanmax(dist_arcmin):.3f} arcmin")

    # ---------- 保存 ----------
    harris.to_pickle(os.path.join(PRO, "harris.pkl"))
    vb.to_pickle(os.path.join(PRO, "vb2021.pkl"))
    bh.to_pickle(os.path.join(PRO, "bh2018.pkl"))
    bica.to_pickle(os.path.join(PRO, "bica2019.pkl"))
    print(f"\n已保存解析结果到 {PRO}")

    return harris, vb, bh, bica


if __name__ == "__main__":
    main()
