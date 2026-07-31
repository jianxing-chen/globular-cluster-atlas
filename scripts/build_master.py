#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建银河系球状星团统一主星表 (master catalog)
合并: Harris(VII/202) + Vasiliev&Baumgardt(2021) + Baumgardt&Hilker(2018)
      + Bica(2019) 中确认的球状星团
输出: data/processed/master_catalog.csv / .json / .pkl
"""
import os, re, math
import numpy as np
import pandas as pd

PRO = os.path.join(os.path.dirname(__file__), "..", "data", "processed")

R_SUN_KPC = 8.275   # Galactic centre distance (GRAVITY collab. 2021)
Z_SUN_PC  = 20.8    # Sun height above mid-plane (Bennett & Bovy 2019)

# ---------- 别名解析: 把 Messier/常见名映射到主键 ----------
# 以 Harris 的 ID 为准作规范名; Name 列存常用别名
ALIASES = {}   # norm(alias) -> harris key
def build_alias(harris):
    for _, r in harris.iterrows():
        k = r["key"]
        ALIASES[k] = k
        if isinstance(r["altkey"], str) and r["altkey"]:
            ALIASES[r["altkey"]] = k
build_alias(pd.read_pickle(os.path.join(PRO, "harris.pkl")))


def angsep_deg(ra1, de1, ra2, de2):
    """两坐标角距离(度), 小角近似足够。"""
    dra = (ra1 - ra2) * math.cos(math.radians((de1 + de2) / 2))
    dde = de1 - de2
    return math.hypot(dra, dde)


def crossmatch_coord(ref_ra, ref_de, cand_df, ra_col, de_col, tol_arcmin=3.0):
    """在候选表里按坐标找最近匹配, 返回(index, sep_arcmin)。"""
    best, bestsep = None, tol_arcmin
    for idx, r in cand_df.iterrows():
        ra, de = r[ra_col], r[de_col]
        if pd.isna(ra) or pd.isna(de):
            continue
        sep = angsep_deg(ref_ra, ref_de, ra, de) * 60.0
        if sep < bestsep:
            best, bestsep = idx, sep
    return best, bestsep


def main():
    harris = pd.read_pickle(os.path.join(PRO, "harris.pkl"))
    vb     = pd.read_pickle(os.path.join(PRO, "vb2021.pkl"))
    bh     = pd.read_pickle(os.path.join(PRO, "bh2018.pkl"))
    bica   = pd.read_pickle(os.path.join(PRO, "bica2019.pkl"))

    # ---------- 规范名函数(借助 ALIASES 回退到 Harris key) ----------
    def canon(norm):
        if not norm:
            return ""
        return ALIASES.get(norm, norm)

    # 给 VB/BH 建规范键: 先看主名, 未命中 Harris 再看别名
    def make_canon(r):
        c = canon(r["key"])
        if c and c in set(harris["key"]):
            return c
        c2 = canon(r["altkey"])
        if c2:
            return c2
        return c

    vb["canon"] = vb.apply(make_canon, axis=1)
    bh["canon"] = bh.apply(make_canon, axis=1)

    vb_by = {r["canon"]: r for _, r in vb.iterrows()}
    bh_by = {r["canon"]: r for _, r in bh.iterrows()}

    # 坐标索引(用于对名称匹配失败的做坐标交叉匹配)
    vb_coord = vb.dropna(subset=["RAJ2000", "DEJ2000"])
    bh_coord = bh.dropna(subset=["_RA", "_DE"])
    HKEYS = set(harris["key"])

    # ---------- 收集全部规范名 ----------
    all_keys = list(dict.fromkeys(
        list(harris["key"]) + [c for c in vb["canon"] if c] + [c for c in bh["canon"] if c]))

    rows = []
    stats = {"name_match_vb": 0, "coord_match_vb": 0, "name_match_bh": 0, "coord_match_bh": 0}

    for key in all_keys:
        h = harris[harris["key"] == key]
        h = h.iloc[0] if len(h) else None
        # 别名 & 显示名
        common = ""
        if h is not None and isinstance(h["Name"], str) and h["Name"].strip():
            common = h["Name"].strip()
        # ---- 坐标/银道坐标: 优先 VB2021(Gaia), 否则 Harris ----
        ra = dec = glon = glat = np.nan
        v = vb_by.get(key)
        if v is not None and pd.notna(v["RAJ2000"]):
            ra, dec = v["RAJ2000"], v["DEJ2000"]
            stats["name_match_vb"] += 1
        if h is not None:
            if pd.isna(ra) and pd.notna(h["RAdeg"]):
                ra, dec = h["RAdeg"], h["DEdeg"]
            glon, glat = h["GLON"], h["GLAT"]
        # 名称匹配失败 -> 坐标交叉匹配 VB
        if (v is None) and (h is not None) and pd.notna(h["RAdeg"]):
            idx, sep = crossmatch_coord(h["RAdeg"], h["DEdeg"], vb_coord, "RAJ2000", "DEJ2000", 3.0)
            if idx is not None:
                v = vb.loc[idx]; vb_by[key] = v; stats["coord_match_vb"] += 1

        # ---- 距离: 优先 BH2018 Dist, 否则 VB2021 视差, 否则 Harris Rsun ----
        b = bh_by.get(key)
        dist, dist_src = np.nan, ""
        if b is not None and pd.notna(b["Dist"]):
            dist, dist_src = float(b["Dist"]), "BH2018"   # BH Dist 单位 kpc
        if pd.isna(dist) and v is not None and pd.notna(v["dist_plx_kpc"]):
            dist, dist_src = float(v["dist_plx_kpc"]), "GaiaEDR3plx"
        if pd.isna(dist) and h is not None and pd.notna(h["Rsun"]):
            dist, dist_src = float(h["Rsun"]), "Harris"
        # BH 名称匹配失败 -> 坐标匹配
        if (b is None) and (h is not None) and pd.notna(h["RAdeg"]):
            idx, sep = crossmatch_coord(h["RAdeg"], h["DEdeg"], bh_coord, "_RA", "_DE", 3.0)
            if idx is not None:
                b = bh.loc[idx]; bh_by[key] = b; stats["coord_match_bh"] += 1
                if pd.isna(dist) and pd.notna(b["Dist"]):
                    dist, dist_src = b["Dist"] * 1.0, "BH2018"

        # ---- 银心坐标 (kpc): 以银心为原点的右手笛卡尔 ----
        # 银道直角: +x 由银心指向太阳; 太阳位于 (x=R_SUN, y=0, z≈0).
        # 日心量: X_h=dist*cosb*cosl (朝银心为正), Y_h, Z_h.
        # 银心量: x_gc = R_SUN - X_h,  y_gc = -Y_h,  z_gc = Z_h.
        X = Y = Z = Rgc = np.nan
        if pd.notna(glon) and pd.notna(glat) and pd.notna(dist):
            l, bb = math.radians(glon), math.radians(glat)
            X_h = dist * math.cos(bb) * math.cos(l)
            Y_h = dist * math.cos(bb) * math.sin(l)
            Z_h = dist * math.sin(bb)
            X = R_SUN_KPC - X_h     # 银心为原点, +x 指向太阳
            Y = -Y_h                # 保持右手系(银道坐标 x_h×y_h = -z 需翻转)
            Z = Z_h
            Rgc = math.sqrt(X**2 + Y**2 + Z**2)

        # ---- 其余物理量 ----
        def gv(df_r, col):
            return df_r[col] if (df_r is not None and col in df_r and pd.notna(df_r[col])) else np.nan

        rows.append({
            "id": key,
            "name": common if common else key,
            "ra_deg": ra, "dec_deg": dec, "l_deg": glon, "b_deg": glat,
            "dist_kpc": dist, "dist_src": dist_src,
            "X_kpc": X, "Y_kpc": Y, "Z_kpc": Z, "Rgc_kpc": Rgc,
            # Harris 光学/金属/结构
            "V_mag": gv(h, "Vt"), "M_V": gv(h, "MVt"),
            "FeH": gv(h, "[Fe/H]"), "EBV": gv(h, "E(B-V)"),
            "BV": gv(h, "(B-V)t"),
            "vr_kms": gv(h, "Vr"),
            "conc_c": gv(h, "c"), "Rh_arcmin": gv(h, "Rh"),
            "logTh": gv(h, "log(Th)"), "muV": gv(h, "muV"),
            # VB2021 自行
            "pmRA": gv(v, "pmRA"), "pmDE": gv(v, "pmDE"),
            "e_pmRA": gv(v, "e_pmRA"), "e_pmDE": gv(v, "e_pmDE"),
            "plx": gv(v, "plx"),
            "Nstar_gaia": gv(v, "Nstar"),
            # BH2018 动力学
            "Mass_Msun": gv(b, "Mass"), "ML_V": gv(b, "M/LV"),
            "rh_pc": gv(b, "rmlp"), "sigma0": gv(b, "sigma0"),
            "Vesc_kms": gv(b, "Vesc"), "logTRH": gv(b, "logTRH"),
            "RV_bh": gv(b, "<RV>"),
            # 来源标记
            "in_harris": h is not None,
            "in_vb2021": v is not None,
            "in_bh2018": b is not None,
        })

    master = pd.DataFrame(rows)
    # 用 BH 的 RV 填补 Harris 缺失的 vr
    need = master["vr_kms"].isna() & master["RV_bh"].notna()
    master.loc[need, "vr_kms"] = master.loc[need, "RV_bh"]

    # ---------- 排序: 有距离的优先, 再按银心距 ----------
    master["has_dist"] = master["dist_kpc"].notna()
    master = master.sort_values(["has_dist", "Rgc_kpc"], ascending=[False, True]).reset_index(drop=True)

    print("=" * 62)
    print(f"主星表星系数: {len(master)}")
    print(f"  有距离: {master['dist_kpc'].notna().sum()}")
    print(f"  有自行(Gaia): {master['pmRA'].notna().sum()}")
    print(f"  有质量(BH2018): {master['Mass_Msun'].notna().sum()}")
    print(f"  有金属丰度: {master['FeH'].notna().sum()}")
    print(f"  有径向速度: {master['vr_kms'].notna().sum()}")
    print(f"  有完整6D相空间(距离+PM+RV): "
          f"{(master['dist_kpc'].notna() & master['pmRA'].notna() & master['vr_kms'].notna()).sum()}")
    print(f"\n匹配统计: VB名称匹配 {stats['name_match_vb']}, VB坐标补匹配 {stats['coord_match_vb']}, "
          f"BH名称匹配 {stats['name_match_bh']}, BH坐标补匹配 {stats['coord_match_bh']}")

    # ---------- 保存 ----------
    master.to_pickle(os.path.join(PRO, "master.pkl"))
    master.to_csv(os.path.join(PRO, "master_catalog.csv"), index=False, float_format="%.5g")
    # JSON (供 web 可视化; NaN -> null)
    mj = master.drop(columns=["has_dist"]).replace({np.nan: None})
    mj.to_json(os.path.join(PRO, "master_catalog.json"), orient="records", force_ascii=False)
    print(f"\n已输出 master.pkl / master_catalog.csv / master_catalog.json")
    print(f"样例(前3个银心最近星团):")
    print(master.head(3)[["id","name","dist_kpc","Rgc_kpc","FeH","M_V","Mass_Msun"]].to_string(index=False))

if __name__ == "__main__":
    main()
