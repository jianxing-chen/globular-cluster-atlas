#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
处理 LVDB (Local Volume Database) 矮星系 -> 项目银心坐标, 导出 viz/dwarf_data.js
数据: Pace 2025 (LVDB v1.1.0, CC0), github.com/apace7/local_volume_database
坐标: 与项目相同的 IAU1958 银道变换 (ICRS -> 银心右手笛卡尔, +x 朝太阳)
"""
import os, json, math
import numpy as np
import pandas as pd

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
VIZ = os.path.join(os.path.dirname(__file__), "..", "viz")

# 与 integrate_orbits.py / process_streams.py 相同的银道变换
RA_NGP  = math.radians(192.859508)
DEC_NGP = math.radians(27.128336)
def _rot_eq2gal():
    sd, cd = math.sin(DEC_NGP), math.cos(DEC_NGP)
    sa, ca = math.sin(RA_NGP), math.cos(RA_NGP)
    zg = [cd*ca, cd*sa, sd]
    ra_gc, dec_gc = math.radians(266.405), math.radians(-28.936)
    xg = [math.cos(dec_gc)*math.cos(ra_gc), math.cos(dec_gc)*math.sin(ra_gc), math.sin(dec_gc)]
    yg = [zg[1]*xg[2]-zg[2]*xg[1], zg[2]*xg[0]-zg[0]*xg[2], zg[0]*xg[1]-zg[1]*xg[0]]
    return np.array([xg, yg, zg])
M_EQ2GAL = _rot_eq2gal()
R_SUN, Z_SUN = 8.275, 0.0208
def radec_to_unit(ra, dec):
    ra, dec = math.radians(ra), math.radians(dec)
    return np.array([math.cos(dec)*math.cos(ra), math.cos(dec)*math.sin(ra), math.sin(dec)])
def icrs_to_galcen(ra, dec, dist):
    r = M_EQ2GAL @ radec_to_unit(ra, dec)
    p = r * dist
    return np.array([R_SUN, 0.0, Z_SUN]) + np.array([-p[0], -p[1], p[2]])

def num(x, nd=3):
    try:
        v = float(x)
        return None if (math.isnan(v) or math.isinf(v)) else round(v, nd)
    except Exception:
        return None

def main():
    df = pd.read_csv(os.path.join(RAW, "lvdb_comb_all.csv"), low_memory=False)
    # 选择: 银河系矮星系 + M31矮星系 + 近场矮星系 + 大星系本体(misc 里的 M31/M33/LMC/SMC)
    keep_tables = ["dwarf_mw", "dwarf_m31", "dwarf_local_field", "misc"]
    d = df[df["table"].isin(keep_tables)].copy()
    # 只保留有距离和坐标的
    d = d[d["ra"].notna() & d["dec"].notna() & d["distance"].notna()]
    print(f"候选天体: {len(d)}")

    out = []
    for _, r in d.iterrows():
        ra, dec, dist = float(r["ra"]), float(r["dec"]), float(r["distance"])
        if dist <= 0 or dist > 3000:      # 本星系群范围
            continue
        p = icrs_to_galcen(ra, dec, dist)
        # 分类标签
        tbl = r["table"]
        cls = {"dwarf_mw": "mw", "dwarf_m31": "m31",
               "dwarf_local_field": "field", "misc": "galaxy"}[tbl]
        name = str(r["name"]) if pd.notna(r["name"]) else str(r.get("key",""))
        out.append({
            "name": name,
            "cls": cls,
            "host": str(r["host"]) if pd.notna(r.get("host")) else "",
            "x": round(float(p[0]),2), "y": round(float(p[1]),2), "z": round(float(p[2]),2),
            "dist": round(dist, 1),
            "rgc": round(float(np.sqrt((p**2).sum())), 1),
            "MV": num(r.get("M_V"), 2),
            "feh": num(r.get("metallicity"), 2),
            "rh": num(r.get("rhalf_physical"), 1),        # 半光半径 pc
            "vr": num(r.get("vlos_systemic"), 1),
            "mass": num(r.get("mass_stellar"), 2),         # log10 Msun
            "confirmed": bool(r.get("confirmed_galaxy")==1 or r.get("confirmed_real")==1),
        })
    # 统计
    from collections import Counter
    cnt = Counter(o["cls"] for o in out)
    print("分类:", dict(cnt))
    payload = {
        "meta": {"source": "Local Volume Database v1.1.0 (Pace 2025, CC0)",
                 "n": len(out), "frame": "Galactocentric kpc, +x toward Sun"},
        "dwarfs": out,
    }
    js = "const DWARF_DATA = " + json.dumps(payload, separators=(",",":")) + ";\n"
    path = os.path.join(VIZ, "dwarf_data.js")
    with open(path, "w") as f: f.write(js)
    print(f"写出 {path}  {os.path.getsize(path)/1024:.0f} KB, 天体数={len(out)}")
    # 著名矮星系校验
    print("\n著名矮星系校验(银心距, kpc):")
    for o in out:
        if o["name"] in ["Sagittarius","LMC","SMC","Fornax","Sculptor","Draco","Ursa Minor","Bootes I","Carina"]:
            print(f"  {o['name']:14s} d={o['dist']:6.1f} Rgc={o['rgc']:6.1f} M_V={o['MV']} [Fe/H]={o['feh']}")

if __name__ == "__main__":
    main()
