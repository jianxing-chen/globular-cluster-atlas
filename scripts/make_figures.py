#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
出版级静态科学图: figures/
  1. 全天 Aitoff 投影(银道坐标), 按金属丰度着色
  2. 银道面俯视 (X-Y) + 侧视 (X-Z / R-Z), 含太阳/银心/轨道
  3. 金属丰度分布(双峰) + [Fe/H] vs Rgc
  4. 光度函数 (M_V 分布)
  5. 轨道相空间 (Lz vs E / Rperi vs Rapo) + 偏心率分布
  6. 质量-半径 / 结构参数关系
"""
import os, json, math
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
from matplotlib.collections import LineCollection

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 11,
    "axes.linewidth": 0.9, "figure.dpi": 130,
    "savefig.dpi": 160, "savefig.bbox": "tight",
})

PRO  = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
FIG  = os.path.join(os.path.dirname(__file__), "..", "figures")
os.makedirs(FIG, exist_ok=True)

m = pd.read_pickle(os.path.join(PRO, "master.pkl"))
orbits = json.load(open(os.path.join(PRO, "orbits.json")))["orbits"]

DARK = "#0b1026"; ACC = "#7fd4ff"


def feh_color(feh):
    return feh

# ============ 1. Aitoff 全天图 ============
def fig_aitoff():
    d = m[m["l_deg"].notna()].copy()
    l = d["l_deg"].values.copy()
    l[l > 180] -= 360.0
    b = d["b_deg"].values
    feh = d["FeH"].values
    fig = plt.figure(figsize=(11, 6))
    ax = fig.add_subplot(111, projection="aitoff")
    ax.grid(True, alpha=0.3, lw=0.5)
    lam, phi = np.radians(-l), np.radians(b)
    mask = ~np.isnan(feh)
    sc = ax.scatter(lam[mask], phi[mask], c=feh[mask], cmap="RdYlBu_r",
                    s=18 + 6 * np.nan_to_num(-d["M_V"][mask], nan=5), alpha=0.85,
                    edgecolor="k", linewidth=0.2, vmin=-2.4, vmax=-0.3)
    ax.scatter(lam[~mask], phi[~mask], s=14, color="gray", alpha=0.5, edgecolor="k", linewidth=0.2)
    cb = fig.colorbar(sc, ax=ax, orientation="horizontal", pad=0.08, fraction=0.05)
    cb.set_label("[Fe/H]  (dex)")
    ax.set_title("Galactic Globular Clusters — All-sky (Galactic coordinates, Aitoff)\n"
                 f"n = {len(d)}, colour = metallicity, size = luminosity", pad=18)
    # 标注几个名团
    for name, lab in [("NGC104","47 Tuc"),("NGC5139","ω Cen"),("NGC6205","M13"),("NGC7078","M15")]:
        r = d[d["id"]==name]
        if len(r):
            ll=r["l_deg"].values[0]; ll=ll-360 if ll>180 else ll
            bb=r["b_deg"].values[0]
            ax.annotate(lab,(np.radians(-ll),np.radians(bb)),textcoords="offset points",
                        xytext=(8,8),fontsize=9,color="navy",weight="bold")
    fig.savefig(os.path.join(FIG, "01_aitoff_sky.png")); plt.close(fig)
    print("  01_aitoff_sky.png")

# ============ 2. 银道面俯视 + 侧视 ============
def fig_xyz():
    d = m[m["X_kpc"].notna()].copy()
    # master 的 X_kpc/Y_kpc/Z_kpc 已是银心右手笛卡尔(+x 由银心指向太阳), 太阳在 (R_SUN,0,0)
    R_SUN = 8.275
    Xg = d["X_kpc"]; Yg = d["Y_kpc"]; Zg = d["Z_kpc"]
    feh = d["FeH"].values

    fig, axes = plt.subplots(1, 3, figsize=(19, 6.4))
    # --- 俯视 X-Y ---
    ax = axes[0]
    ax.set_facecolor("#f7f7f9")
    sc = ax.scatter(Xg, Yg, c=feh, cmap="RdYlBu_r", s=26, alpha=0.85,
                    edgecolor="k", linewidth=0.2, vmin=-2.4, vmax=-0.3)
    ax.scatter([0],[0], marker="*", s=500, color="gold", edgecolor="k", zorder=5, label="Galactic Centre")
    ax.scatter([R_SUN],[0], marker="o", s=140, color="royalblue", edgecolor="k", zorder=5, label="Sun")
    for r in [2,4,8,12,16,20]:
        ax.add_patch(Circle((0,0), r, fill=False, color="gray", lw=0.5, ls="--", alpha=0.5))
        ax.text(r*0.707, r*0.707, f"{r}", color="gray", fontsize=8)
    ax.set_xlim(-22,22); ax.set_ylim(-22,22); ax.set_aspect("equal")
    ax.set_xlabel("x (kpc)  → Galactic centre"); ax.set_ylabel("y (kpc)  → rotation")
    ax.set_title("Face-on (Galactic plane)")
    ax.legend(loc="upper right", fontsize=9)

    # --- 侧视 X-Z ---
    ax = axes[1]
    ax.scatter(Xg, Zg, c=feh, cmap="RdYlBu_r", s=26, alpha=0.85,
               edgecolor="k", linewidth=0.2, vmin=-2.4, vmax=-0.3)
    ax.scatter([0],[0], marker="*", s=500, color="gold", edgecolor="k", zorder=5)
    ax.scatter([R_SUN],[0], marker="o", s=140, color="royalblue", edgecolor="k", zorder=5)
    ax.axhline(0, color="gray", lw=0.6, ls="--")
    ax.set_xlim(-22,22); ax.set_ylim(-22,22); ax.set_aspect("equal")
    ax.set_xlabel("x (kpc)"); ax.set_ylabel("z (kpc)  → NGP")
    ax.set_title("Edge-on (x–z)")

    # --- R-Z ---
    ax = axes[2]
    Rg = np.sqrt(Xg**2 + Yg**2)
    ax.scatter(Rg, Zg, c=feh, cmap="RdYlBu_r", s=26, alpha=0.85,
               edgecolor="k", linewidth=0.2, vmin=-2.4, vmax=-0.3)
    ax.scatter([0],[0], marker="*", s=500, color="gold", edgecolor="k", zorder=5)
    ax.scatter([R_SUN],[0], marker="o", s=140, color="royalblue", edgecolor="k", zorder=5)
    ax.axhline(0, color="gray", lw=0.6, ls="--")
    ax.set_xlim(0,30); ax.set_ylim(-22,22)
    ax.set_xlabel("R (kpc)  cylindrical"); ax.set_ylabel("z (kpc)")
    ax.set_title("Meridional (R–z)")
    fig.colorbar(sc, ax=axes, orientation="vertical", fraction=0.02, pad=0.01, label="[Fe/H]")
    fig.suptitle("Spatial Distribution of Galactic Globular Clusters (Galactocentric)", y=1.0, fontsize=14, weight="bold")
    fig.savefig(os.path.join(FIG, "02_galactocentric_xyz.png")); plt.close(fig)
    print("  02_galactocentric_xyz.png")

# ============ 3. 金属丰度双峰 + [Fe/H]-Rgc ============
def fig_metallicity():
    d = m[m["FeH"].notna()].copy()
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.2))
    ax = axes[0]
    ax.hist(d["FeH"], bins=28, color="steelblue", edgecolor="k", alpha=0.8)
    ax.set_xlabel("[Fe/H] (dex)"); ax.set_ylabel("Number")
    ax.set_title("Metallicity Distribution (bimodal)")
    # KDE
    from scipy.stats import gaussian_kde
    xs = np.linspace(-2.6, 0.2, 300)
    kde = gaussian_kde(d["FeH"], bw_method=0.12)
    ax2 = ax.twinx(); ax2.plot(xs, kde(xs)*len(d)*(xs[1]-xs[0]), color="crimson", lw=2)
    ax2.set_yticks([])
    ax = axes[1]
    Rg = d["Rgc_kpc"]
    ax.scatter(Rg, d["FeH"], s=30, c=d["M_V"], cmap="viridis", edgecolor="k", linewidth=0.2, alpha=0.85)
    ax.axhline(-1.0, color="gray", ls="--", lw=0.8)
    ax.text(0.5,-0.95,"disc/bulge metal-rich",fontsize=8,color="gray")
    ax.text(0.5,-1.6,"halo metal-poor",fontsize=8,color="gray")
    ax.set_xlabel("R$_{gc}$ (kpc)"); ax.set_ylabel("[Fe/H] (dex)")
    ax.set_title("Metallicity vs Galactocentric Distance")
    cb = fig.colorbar(ax.collections[0], ax=ax); cb.set_label("M$_V$")
    fig.tight_layout()
    fig.savefig(os.path.join(FIG, "03_metallicity.png")); plt.close(fig)
    print("  03_metallicity.png")

# ============ 4. 光度函数 + 质量分布 ============
def fig_luminosity_mass():
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.2))
    d = m[m["M_V"].notna()]
    axes[0].hist(d["M_V"], bins=24, color="darkviolet", edgecolor="k", alpha=0.8)
    axes[0].axvline(-7.4, color="crimson", ls="--", lw=1.5)
    axes[0].text(-7.4, axes[0].get_ylim()[1]*0.6, "  peak ≈ -7.4", color="crimson")
    axes[0].set_xlabel("Absolute V magnitude M$_V$"); axes[0].set_ylabel("Number")
    axes[0].set_title("Globular Cluster Luminosity Function")
    dm = m[m["Mass_Msun"].notna()]
    axes[1].hist(np.log10(dm["Mass_Msun"]), bins=20, color="seagreen", edgecolor="k", alpha=0.8)
    axes[1].set_xlabel("log$_{10}$(M / M$_\\odot$)"); axes[1].set_ylabel("Number")
    axes[1].set_title(f"Mass Distribution (n={len(dm)}, Baumgardt & Hilker 2018)")
    fig.tight_layout()
    fig.savefig(os.path.join(FIG, "04_luminosity_mass.png")); plt.close(fig)
    print("  04_luminosity_mass.png")

# ============ 5. 轨道相空间 ============
def fig_orbits():
    rows = []
    for cid, o in orbits.items():
        rows.append({"id": cid, "rperi": o["r_peri_kpc"], "rapo": o["r_apo_kpc"],
                     "ecc": o["eccentricity"], "zmax": o["z_max_kpc"], "Lz": o["Lz"]})
    df = pd.DataFrame(rows).merge(m[["id","FeH","M_V"]], on="id", how="left")
    fig, axes = plt.subplots(1, 3, figsize=(19, 5.6))
    ax = axes[0]
    sc = ax.scatter(df["Lz"], df["rapo"], c=df["FeH"], cmap="RdYlBu_r",
                    s=28, edgecolor="k", linewidth=0.2, vmin=-2.4, vmax=-0.3, alpha=0.85)
    ax.axvline(0, color="gray", ls="--", lw=0.8)
    ax.set_xlabel("L$_z$ (kpc km s$^{-1}$)"); ax.set_ylabel("R$_{apo}$ (kpc)")
    ax.set_title("R$_{apo}$ vs L$_z$  (retrograde ← Lz<0)")
    fig.colorbar(sc, ax=ax, label="[Fe/H]")
    ax = axes[1]
    ax.scatter(df["rperi"], df["rapo"], c=df["ecc"], cmap="plasma",
               s=28, edgecolor="k", linewidth=0.2, alpha=0.85)
    lim=[0, max(df["rapo"].max(), df["rperi"].max())*1.05]
    ax.plot(lim, lim, color="gray", ls="--", lw=0.8)
    ax.text(lim[1]*0.5, lim[1]*0.9, "circular", rotation=25, color="gray", fontsize=9)
    ax.set_xlabel("R$_{peri}$ (kpc)"); ax.set_ylabel("R$_{apo}$ (kpc)")
    ax.set_title("Apo-Pericentre (colour = eccentricity)")
    fig.colorbar(ax.collections[0], ax=ax, label="e")
    ax = axes[2]
    ax.hist(df["ecc"], bins=22, color="teal", edgecolor="k", alpha=0.85)
    ax.set_xlabel("Orbital eccentricity"); ax.set_ylabel("Number")
    ax.set_title("Eccentricity Distribution")
    fig.suptitle(f"Orbital Properties (MWPotential2014, n={len(df)})", fontsize=14, weight="bold")
    fig.tight_layout()
    fig.savefig(os.path.join(FIG, "05_orbital_phase.png")); plt.close(fig)
    print("  05_orbital_phase.png")

# ============ 6. 结构参数关系 ============
def fig_structure():
    d = m[m["Mass_Msun"].notna() & m["rh_pc"].notna()].copy()
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.4))
    ax = axes[0]
    sc = ax.scatter(d["rh_pc"], d["Mass_Msun"], c=d["FeH"], cmap="RdYlBu_r",
                    s=30, edgecolor="k", linewidth=0.2, vmin=-2.4, vmax=-0.3, alpha=0.85)
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("Half-light radius r$_h$ (pc)"); ax.set_ylabel("Mass (M$_\\odot$)")
    ax.set_title("Mass–Size Relation")
    fig.colorbar(sc, ax=ax, label="[Fe/H]")
    ax = axes[1]
    d2 = m[m["sigma0"].notna() & m["Vesc_kms"].notna()]
    ax.scatter(d2["sigma0"], d2["Vesc_kms"], s=30, c=d2["logTRH"], cmap="cividis",
               edgecolor="k", linewidth=0.2, alpha=0.85)
    ax.set_xlabel("Central velocity dispersion σ$_0$ (km s$^{-1}$)")
    ax.set_ylabel("Central escape velocity v$_{esc}$ (km s$^{-1}$)")
    ax.set_title("σ$_0$ vs v$_{esc}$ (colour = log relaxation time)")
    fig.colorbar(ax.collections[0], ax=ax, label="log T$_{rh}$")
    fig.tight_layout()
    fig.savefig(os.path.join(FIG, "06_structure.png")); plt.close(fig)
    print("  06_structure.png")

if __name__ == "__main__":
    print("生成出版级静态图 ...")
    fig_aitoff(); fig_xyz(); fig_metallicity(); fig_luminosity_mass(); fig_orbits(); fig_structure()
    print(f"全部输出到 {FIG}")
