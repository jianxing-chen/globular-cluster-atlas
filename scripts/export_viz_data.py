#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把主星表 + 轨道打包成 webdata/gc_data.js (全局常量 GC_DATA) 与
webdata/plotter_data.js (全局常量 PLOTTER_DATA), 供本地 file:// 直接打开。

plotter 数据不含 orbit.x/y/z 大数组; 轨道标量 (ecc/rperi/rapo/zmax/retro)
平铺在星团对象上, 银河系银心笛卡尔坐标 x/y/z 保留。
"""
import os, json
import numpy as np
import pandas as pd

PRO = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
WEB = os.path.join(os.path.dirname(__file__), "..", "webdata")
os.makedirs(WEB, exist_ok=True)

m = pd.read_pickle(os.path.join(PRO, "master.pkl"))
orbits = json.load(open(os.path.join(PRO, "orbits.json")))["orbits"]

def num(x, nd=4):
    if x is None or (isinstance(x, float) and (np.isnan(x) or np.isinf(x))):
        return None
    try:
        return round(float(x), nd)
    except Exception:
        return None

clusters = []
for _, r in m.iterrows():
    cid = r["id"]
    o = orbits.get(cid)
    clusters.append({
        "id": cid,
        "name": r["name"] if isinstance(r["name"], str) and r["name"] else cid,
        "ra": num(r["ra_deg"], 4), "dec": num(r["dec_deg"], 4),
        "l": num(r["l_deg"], 3), "b": num(r["b_deg"], 3),
        "dist": num(r["dist_kpc"], 3), "dist_src": r["dist_src"] if isinstance(r["dist_src"], str) else "",
        "x": num(r["X_kpc"], 3), "y": num(r["Y_kpc"], 3), "z": num(r["Z_kpc"], 3),
        "rgc": num(r["Rgc_kpc"], 3),
        "V": num(r["V_mag"], 2), "MV": num(r["M_V"], 2),
        "feh": num(r["FeH"], 2), "ebv": num(r["EBV"], 3),
        "vr": num(r["vr_kms"], 1),
        "pmra": num(r["pmRA"], 3), "pmde": num(r["pmDE"], 3),
        "mass": num(r["Mass_Msun"], 0), "ml": num(r["ML_V"], 2),
        "rh": num(r["rh_pc"], 2), "sigma0": num(r["sigma0"], 1),
        "vesc": num(r["Vesc_kms"], 1), "logtrh": num(r["logTRH"], 2),
        "c": num(r["conc_c"], 2),
        "nstar": (int(r["Nstar_gaia"]) if pd.notna(r["Nstar_gaia"]) else None),
        "orbit": ({"x": o["x"], "y": o["y"], "z": o["z"],
                   "rperi": o["r_peri_kpc"], "rapo": o["r_apo_kpc"],
                   "ecc": o["eccentricity"], "zmax": o["z_max_kpc"],
                   "retro": o["retrograde"]} if o else None),
    })

payload = {
    "meta": {
        "title": "Milky Way Globular Cluster Atlas",
        "n": len(clusters),
        "n_orbit": sum(1 for c in clusters if c["orbit"]),
        "r_sun": 8.275,
        "sources": [
            "Harris 1996/2010 (VII/202)",
            "Vasiliev & Baumgardt 2021 (J/MNRAS/505/5978)",
            "Baumgardt & Hilker 2018 (J/MNRAS/478/1520)",
            "Bica et al. 2019 (J/AJ/157/12)",
        ],
        "potential": "MWPotential2014 (Bovy 2015)",
    },
    "clusters": clusters,
}
js = "const GC_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n"
out = os.path.join(WEB, "gc_data.js")
with open(out, "w", encoding="utf-8") as f:
    f.write(js)
print(f"写出 {out}  {os.path.getsize(out)/1024:.0f} KB, 星系数={len(clusters)}, "
      f"含轨道={payload['meta']['n_orbit']}")

# ---- plotter 数据: 去掉 orbit 包装 (无 x/y/z 大数组), 轨道标量平铺到星团对象 ----
plotter_clusters = []
for c in clusters:
    pc = {k: v for k, v in c.items() if k != "orbit"}
    o = c["orbit"]
    if o:
        pc.update({"ecc": o["ecc"], "rperi": o["rperi"], "rapo": o["rapo"],
                   "zmax": o["zmax"], "retro": o["retro"]})
    plotter_clusters.append(pc)

plotter_payload = {"meta": payload["meta"], "clusters": plotter_clusters}
pjs = "const PLOTTER_DATA = " + json.dumps(plotter_payload, separators=(",", ":")) + ";\n"
pout = os.path.join(WEB, "plotter_data.js")
with open(pout, "w", encoding="utf-8") as f:
    f.write(pjs)
print(f"写出 {pout}  {os.path.getsize(pout)/1024:.0f} KB")
