#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GlobularClusterAtlas -- 下载全部银河系球状星团原始星表
数据来源: CDS VizieR (vizier.cds.unistra.fr)
所有目录号均已通过 VizieR TAP / asu 元数据逐一核实。
"""
import os, time, urllib.request, urllib.parse, sys

BASE = "https://vizier.cds.unistra.fr/viz-bin/asu-tsv"
OUT  = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
os.makedirs(OUT, exist_ok=True)

# (输出文件名, VizieR表名, 说明, 预期行数下限)
TABLES = [
    # ---- Harris 1996/2010 (VII/202) 三个子表 ----
    ("harris_vii202_catalog.tsv", "VII/202/catalog",
     "Harris 主表(38列全): 坐标/距离/光度/[Fe/H]/E(B-V)/Vr/结构/弛豫/密度", 147),
    # ---- Vasiliev & Baumgardt 2021 (J/MNRAS/505/5978) ----
    ("vb2021_pm_dist.tsv", "J/MNRAS/505/5978/tablea1",
     "Gaia EDR3 自行 + 视差(=>距离) 170个球状星团", 165),
    # ---- Baumgardt & Hilker 2018 (J/MNRAS/478/1520) ----
    ("bh2018_mass.tsv", "J/MNRAS/478/1520/table2",
     "质量/质光比/半光半径/弛豫时间/逃逸速度/径向速度", 110),
    # ---- Bica et al. 2019 (J/AJ/157/12) ----
    ("bica2019_clusters.tsv", "J/AJ/157/12/table3",
     "银河系星团/候选总表(含新发现球状星团候选)", 10000),
]

def fetch(table, outfile, retries=3):
    q = urllib.parse.urlencode({
        "-source": table,
        "-out.all": "1",          # 全部列
        "-out.max": "50000",      # 行数上限
        "-oc.form": "sexa",       # 坐标也输出十进制
    })
    url = f"{BASE}?{q}"
    for attempt in range(1, retries + 1):
        try:
            print(f"  [{attempt}/{retries}] GET {table}")
            req = urllib.request.Request(url, headers={"User-Agent": "GlobularClusterAtlas/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read().decode("utf-8", "replace")
            if "Error=Table or Catalog not found" in data:
                raise RuntimeError(f"目录不存在: {table}")
            with open(outfile, "w", encoding="utf-8") as f:
                f.write(data)
            return data
        except Exception as e:
            print(f"    !! 失败: {e}")
            if attempt < retries:
                time.sleep(4 * attempt)
    raise SystemExit(f"下载失败: {table}")

def count_rows(path):
    """统计 VizieR TSV 数据行: 唯一全'-'分隔行之后、非#非空的行数。
    列名中可能含 '-' (如 E(B-V)), 故只把'整行均由-组成'视为分隔线。"""
    n = 0
    started = False
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            s = line.strip()
            if not started and s and set(s) <= set("-\t "):
                started = True
                continue
            if started and s:
                n += 1
    return n

def main():
    report = []
    for fname, table, desc, minrows in TABLES:
        out = os.path.join(OUT, fname)
        print(f"\n=== {fname}\n    {desc}")
        if os.path.exists(out) and os.path.getsize(out) > 2000:
            print("    (已存在, 跳过)")
        else:
            fetch(table, out)
            time.sleep(2)  # 礼貌限速
        n = count_rows(out)
        size = os.path.getsize(out)
        ok = "OK" if n >= minrows else f"!! 行数偏少(<{minrows})"
        print(f"    行数={n}  大小={size/1024:.0f}KB  {ok}")
        report.append((fname, table, n, ok))
    print("\n" + "=" * 60)
    print("下载汇总:")
    for fname, table, n, ok in report:
        print(f"  {fname:28s} {n:6d} 行  {ok}")

if __name__ == "__main__":
    main()
