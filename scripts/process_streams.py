#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
处理 galstreams 恒星流轨迹 -> 项目银心坐标, 导出 viz/streams_data.js
数据: github.com/cmateu/galstreams (Mateu 2023, galstreams 库, 汇总 95+ 条恒星流)
坐标: 与项目轨道积分完全相同的 IAU1958 银道变换 (ICRS -> 银心右手笛卡尔, +x 朝太阳)
"""
import os, re, json, math, glob
import numpy as np
import pandas as pd

TRACKS = "/tmp/galstreams/galstreams/tracks"
PRO = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
VIZ = os.path.join(os.path.dirname(__file__), "..", "viz")

# ---------- 与 integrate_orbits.py 完全一致的银道变换 ----------
RA_NGP  = math.radians(192.859508)
DEC_NGP = math.radians(27.128336)
def _rot_eq2gal():
    sd, cd = math.sin(DEC_NGP), math.cos(DEC_NGP)
    sa, ca = math.sin(RA_NGP), math.cos(RA_NGP)
    zg = [cd * ca, cd * sa, sd]
    ra_gc, dec_gc = math.radians(266.405), math.radians(-28.936)
    xg = [math.cos(dec_gc)*math.cos(ra_gc), math.cos(dec_gc)*math.sin(ra_gc), math.sin(dec_gc)]
    yg = [zg[1]*xg[2]-zg[2]*xg[1], zg[2]*xg[0]-zg[0]*xg[2], zg[0]*xg[1]-zg[1]*xg[0]]
    return np.array([xg, yg, zg])
M_EQ2GAL = _rot_eq2gal()
R_SUN, Z_SUN = 8.275, 0.0208

def radec_to_unit(ra_deg, dec_deg):
    ra, dec = math.radians(ra_deg), math.radians(dec_deg)
    return np.array([math.cos(dec)*math.cos(ra), math.cos(dec)*math.sin(ra), math.sin(dec)])

def icrs_to_galcen(ra_deg, dec_deg, dist_kpc):
    """返回银心右手笛卡尔 (+x 由银心指向太阳), 与 master/orbits 一致。"""
    r_gal = M_EQ2GAL @ radec_to_unit(ra_deg, dec_deg)
    p_helio = r_gal * dist_kpc
    # 银道(+x朝银心) -> 本系(+x朝太阳): (x,y,z)->(-x,-y,z)
    p = np.array([R_SUN, 0.0, Z_SUN]) + np.array([-p_helio[0], -p_helio[1], p_helio[2]])
    return p

# ---------- 解析 ecsv ----------
def read_ecsv(path):
    with open(path, encoding="utf-8") as f:
        lines = [l.rstrip("\n") for l in f]
    # 列名行 = 第一个非#行
    hdr_i = next(i for i, l in enumerate(lines) if l.strip() and not l.startswith("#"))
    cols = [c.strip() for c in lines[hdr_i].split(",")]
    rows = [l.split(",") for l in lines[hdr_i+1:] if l.strip() and not l.startswith("#")]
    df = pd.DataFrame(rows, columns=cols)
    for c in df.columns:
        if c not in ("StreamName", "StreamShortName", "InfoFlags"):
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df

# ---------- 祖源星团映射 (流名 -> master id) ----------
PROGENITOR = {
    "Pal5": "PAL5", "NGC3201": "NGC3201", "NGC3201-Gjoll": "NGC3201",
    "OmegaCen-Fimbulthul": "NGC5139", "Fimbulthul": "NGC5139",
    "NGC1261": "NGC1261", "TucanaIII": None, "Tucana-III": None,
    "NGC5466": "NGC5466",
}
# 以星团名开头/包含的自动匹配
def find_progenitor(stream_name, master_ids):
    for key, mid in PROGENITOR.items():
        if stream_name.startswith(key) and mid:
            return mid
    # 自动: 流名含 NGCxxxx / PalX
    m = re.search(r"NGC[-_ ]?(\d{3,4})", stream_name)
    if m:
        cand = "NGC" + m.group(1)
        if cand in master_ids: return cand
    m = re.search(r"Pal(?:omar)?[-_ ]?(\d{1,2})", stream_name, re.I)
    if m:
        cand = "PAL" + m.group(1)
        if cand in master_ids: return cand
    return None

def smooth(pts, factor=3):
    """简单滑动平均平滑(保端点)。"""
    pts = np.asarray(pts, float)
    if len(pts) < 5: return pts
    k = max(3, len(pts)//(factor*8))
    if k % 2 == 0: k += 1
    pad = k//2
    out = pts.copy()
    for d in range(pts.shape[1]):
        p = np.pad(pts[:,d], pad, mode="edge")
        ker = np.hanning(k); ker/=ker.sum()
        out[:,d] = np.convolve(p, ker, mode="valid")
    return out

def main():
    master = pd.read_pickle(os.path.join(PRO, "master.pkl"))
    master_ids = set(master["id"])
    # 每条流选"点最多"的轨迹文件(通常 ibata2024 最新最全)
    files = sorted(glob.glob(os.path.join(TRACKS, "track.st.*.ecsv")))
    files = [f for f in files if not f.endswith(".summary.ecsv")]
    by_stream = {}
    for f in files:
        base = os.path.basename(f)[len("track.st."):-len(".ecsv")]
        # base 形如 GD-1.ibata2021 / Pal5.pricewhelan2019
        name = base.rsplit(".", 1)[0]
        ref  = base.rsplit(".", 1)[1]
        try:
            n = sum(1 for l in open(f) if l.strip() and not l.startswith("#")) - 1
        except Exception:
            n = 0
        if name not in by_stream or n > by_stream[name][1]:
            by_stream[name] = (f, n, ref)
    print(f"独立恒星流: {len(by_stream)} 条")

    streams = []
    kept = 0
    for name, (f, npts, ref) in sorted(by_stream.items()):
        if npts < 4:   # 太少点的跳过
            continue
        try:
            df = read_ecsv(f)
        except Exception as e:
            continue
        if not {"ra","dec","distance"}.issubset(df.columns):
            continue
        df = df.dropna(subset=["ra","dec","distance"])
        if len(df) < 4:
            continue
        # 限点数(过长抽稀到 ~120 点), 排序按 ra
        df = df.sort_values("ra").reset_index(drop=True)
        if len(df) > 120:
            idx = np.linspace(0, len(df)-1, 120).astype(int)
            df = df.iloc[idx].reset_index(drop=True)
        pts = np.array([icrs_to_galcen(r.ra, r.dec, r.distance) for r in df.itertuples()])
        pts = smooth(pts)
        # 距离范围(剔除离谱远点, 多为坏数据)
        R = np.sqrt((pts**2).sum(1))
        if np.nanmax(R) > 120 or np.nanmin(R) < 0.1:
            good = (R > 0.5) & (R < 120)
            if good.sum() < 4: continue
            pts = pts[good]; df = df[good].reset_index(drop=True)
        # 稳健距离: 用轨迹点银心距中位数(distance 列常有坏值, 不可靠)
        Rgc_med = float(np.median(np.sqrt((pts**2).sum(1))))
        dist_show = Rgc_med
        prog = find_progenitor(name, master_ids)
        streams.append({
            "name": name, "ref": ref, "n": len(pts),
            "dist": round(dist_show, 2),
            "progenitor": prog,
            "x": [round(float(p[0]),3) for p in pts],
            "y": [round(float(p[1]),3) for p in pts],
            "z": [round(float(p[2]),3) for p in pts],
        })
        kept += 1
    print(f"成功处理并保留: {kept} 条流")
    nprog = sum(1 for s in streams if s["progenitor"])
    print(f"其中识别出祖源球状星团: {nprog} 条")

    payload = {
        "meta": {"source": "galstreams (Mateu 2023) - github.com/cmateu/galstreams",
                 "n": kept, "frame": "Galactocentric kpc, +x toward Sun (same as GC atlas)"},
        "streams": streams,
    }
    js = "const STREAMS_DATA = " + json.dumps(payload, separators=(",",":")) + ";\n"
    out = os.path.join(VIZ, "streams_data.js")
    with open(out, "w") as fp: fp.write(js)
    print(f"写出 {out}  {os.path.getsize(out)/1024:.0f} KB")
    # 列出有祖源的流
    print("\n祖源关联示例:")
    for s in streams:
        if s["progenitor"]:
            print(f"  {s['name']:24s} -> {s['progenitor']}  (d={s['dist']}kpc, {s['n']}点)")

if __name__ == "__main__":
    main()
