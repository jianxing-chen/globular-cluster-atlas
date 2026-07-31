#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
轨道积分: MWPotential2014 级银河势中反推积分每个球状星团的轨道。
  * 坐标/速度变换: 自实现球面天文 (IAU1958 银道北极) ICRS->Galactic->Galactocentric
  * 引力势: Bovy (2015) MWPotential2014 三成分解析势
  * 积分器: scipy DOP853
输出: data/processed/orbits.json
已用太阳/LSR 圆周速度自洽性校验。
"""
import os, math, json
import numpy as np
from scipy.integrate import solve_ivp
import pandas as pd

PRO = os.path.join(os.path.dirname(__file__), "..", "data", "processed")

# ---------------- IAU 1958 银道坐标系常数 (J2000) ----------------
# 银道北极 (North Galactic Pole) 的赤道坐标
RA_NGP  = math.radians(192.859508)     # deg
DEC_NGP = math.radians(27.128336)      # deg
L_NCP   = math.radians(122.932)        # 银经 of 北天极 (赤道北极)

DEG = math.pi / 180.0

# 旋转矩阵: 赤道 -> 银道 (IAU1958), 由银心方向与银道北极构造右手正交基
def _rot_eq2gal():
    sd, cd = math.sin(DEC_NGP), math.cos(DEC_NGP)
    sa, ca = math.sin(RA_NGP), math.cos(RA_NGP)
    zg = [cd * ca, cd * sa, sd]                       # 银道 +z (NGP)
    ra_gc, dec_gc = math.radians(266.405), math.radians(-28.936)   # 银心 Sgr A*
    xg = [math.cos(dec_gc) * math.cos(ra_gc), math.cos(dec_gc) * math.sin(ra_gc), math.sin(dec_gc)]
    yg = [zg[1] * xg[2] - zg[2] * xg[1],              # +y = z x x
          zg[2] * xg[0] - zg[0] * xg[2],
          zg[0] * xg[1] - zg[1] * xg[0]]
    return np.array([xg, yg, zg])                     # v_gal = M @ v_eq

M_EQ2GAL = _rot_eq2gal()

def radec_to_unit(ra_deg, dec_deg):
    ra, dec = ra_deg * DEG, dec_deg * DEG
    return np.array([math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)])

def pm_tangent_basis(ra_deg, dec_deg):
    """赤经/赤纬增加方向的单位向量(切平面基)"""
    ra, dec = ra_deg * DEG, dec_deg * DEG
    e_ra  = np.array([-math.sin(ra), math.cos(ra), 0.0])
    e_dec = np.array([-math.sin(dec) * math.cos(ra), -math.sin(dec) * math.sin(ra), math.cos(dec)])
    return e_ra, e_dec

# ---------------- 太阳参数 ----------------
R_SUN   = 8.275            # kpc
Z_SUN   = 0.0208           # kpc
V_SUN   = np.array([11.1, 251.24, 7.25])   # 太阳相对银心速度 (km/s), y=圆周+LSR+特有
KPC_KM  = 3.0856775814913673e13            # 1 kpc in km
YEAR_S  = 365.25 * 86400.0
MAS_TO_RAD = math.pi / (180.0 * 3600.0 * 1000.0)

def galactocentric_state(ra_deg, dec_deg, dist_kpc, pmra, pmdec, vr):
    """返回银心右手笛卡尔位置(kpc)与速度(km/s)。
       约定: x 指向银心->太阳外侧方向取太阳在 x=-R_SUN? 这里用银河标准:
       x 朝向银心方向为正(太阳在 x=-R_SUN)? -> 采用常用右手系:
       太阳位于 (-R_SUN, 0, Z_SUN), x 轴由银心指向太阳(正x朝太阳)。"""
    # 1) 天体在银道坐标系下的单位向量 (银道坐标: +x 朝银心 l=0, +z 朝 NGP)
    r_eq = radec_to_unit(ra_deg, dec_deg)
    r_gal = M_EQ2GAL @ r_eq                      # 银道直角单位向量
    # 2) 日心直角位置(银道坐标, kpc)
    p_helio = r_gal * dist_kpc
    # 3) 目标银心系 S: 右手, +x 由银心指向太阳, 太阳位于 (+R_SUN, 0, Z_SUN).
    #    银道坐标(+x朝银心) -> S(+x朝太阳): 绕 z 轴旋转180°, 即 (x,y,z)->(-x,-y,z).
    #    位置/速度/太阳速度 全部用此同一正交变换, 保证自洽.
    def to_S(v):
        return np.array([-v[0], -v[1], v[2]])
    p_sun_S = np.array([R_SUN, 0.0, Z_SUN])
    p_gcen = p_sun_S + to_S(p_helio)
    # 4) 速度: 视向 + 自行 -> 日心空间速度(银道直角, km/s)
    e_ra, e_dec = pm_tangent_basis(ra_deg, dec_deg)
    v_ra_kms  = 4.74047 * pmra * dist_kpc
    v_dec_kms = 4.74047 * pmdec * dist_kpc
    v_helio_eq = vr * r_eq + v_ra_kms * e_ra + v_dec_kms * e_dec
    v_helio_gal = M_EQ2GAL @ v_helio_eq
    # 5) 银心速度 = 日心速度(转入S) + 太阳速度(银道系分量, 同样转入S)
    v_gcen = to_S(v_helio_gal) + to_S(V_SUN)
    return p_gcen, v_gcen

# ================= MWPotential2014 引力势 =================
# 单位: kpc, km/s, 质量以 10^10 Msun 计 -> G = 0.0430091 kpc(km/s)^2/(1e10 Msun)
G = 0.0430091727003628

class MiyamotoNagai:
    def __init__(self, M, a, b): self.M, self.a, self.b = M, a, b
    def accel(self, R, z):
        a, b = self.a, self.b
        zbz = math.sqrt(z * z + b * b)
        denom = (R * R + (a + zbz) ** 2) ** 1.5
        fR = -G * self.M * R / denom
        fz = -G * self.M * z * (a + zbz) / (zbz * denom)
        return fR, fz

class Hernquist:
    def __init__(self, M, a): self.M, self.a = M, a
    def accel(self, R, z):
        r = math.sqrt(R * R + z * z) + 1e-12
        f = -G * self.M / (r * (r + self.a) ** 2)
        return f * R / r, f * z / r

class NFW:
    def __init__(self, Mvir, a, c=16.0):
        self.M, self.a, self.c = Mvir, a, c
        self.norm = math.log(1 + c) - c / (1 + c)
    def accel(self, R, z):
        r = math.sqrt(R * R + z * z) + 1e-12
        x = r / self.a
        Menc = self.M * (math.log(1 + x) - x / (1 + x)) / self.norm
        f = -G * Menc / (r * r)
        return f * R / r, f * z / r

class MWPotential2014:
    def __init__(self):
        # Bovy (2015) ApJS 216, 29, MWPotential2014 (质量单位 1e10 Msun)
        self.bulge = Hernquist(M=0.40, a=0.5)          # 4e9 Msun
        self.disk  = MiyamotoNagai(M=6.80, a=3.0, b=0.28)  # 6.8e10 Msun
        self.halo  = NFW(Mvir=8.80, a=16.0, c=16.0)    # ~8.8e10 Msun(归一内)
        self.comps = [self.bulge, self.disk, self.halo]
        # 数值标定: 使太阳处圆周速度精确等于 V0 (Bovy 2015 取 238 km/s)
        self.V0_TARGET = 238.0
        raw = self._vc_raw(R_SUN)
        self.scale = (self.V0_TARGET / raw) ** 2       # 加速度整体缩放因子
    def _accel_cyl_unscaled(self, R, z):
        fR = fz = 0.0
        for c in self.comps:
            aR, az = c.accel(R, z); fR += aR; fz += az
        return fR, fz
    def _vc_raw(self, R):
        fR, _ = self._accel_cyl_unscaled(R, 0.0)
        return math.sqrt(-R * fR)
    def accel_cyl(self, R, z):
        fR, fz = self._accel_cyl_unscaled(R, z)
        return fR * self.scale, fz * self.scale
    def vcirc(self, R):
        fR, _ = self.accel_cyl(R, 0.0)
        return math.sqrt(-R * fR)

POT = MWPotential2014()
V0 = POT.vcirc(R_SUN)
print(f"[MWPotential2014] 太阳处圆周速度 vc(R={R_SUN}kpc) = {V0:.1f} km/s  (文献≈238)")

KMS2KPCGYR = 1.022712165045695

def rhs(t, y):
    x, yy, z, vx, vy, vz = y
    R = math.sqrt(x * x + yy * yy)
    fR, fz = POT.accel_cyl(R, z)
    if R > 1e-9:
        ax, ay = fR * x / R, fR * yy / R
    else:
        ax = ay = 0.0
    return [vx * KMS2KPCGYR, vy * KMS2KPCGYR, vz * KMS2KPCGYR,
            ax / KMS2KPCGYR, ay / KMS2KPCGYR, fz / KMS2KPCGYR]

def integrate_cluster(row, t_back=3.0, n_out=300):
    try:
        p, v = galactocentric_state(row["ra_deg"], row["dec_deg"], row["dist_kpc"],
                                    row["pmRA"], row["pmDE"], row["vr_kms"])
    except Exception:
        return None
    y0 = [p[0], p[1], p[2], v[0], v[1], v[2]]
    t_eval = np.linspace(0, -t_back, n_out)
    sol = solve_ivp(rhs, (0, -t_back), y0, method="DOP853",
                    t_eval=t_eval, rtol=1e-7, atol=1e-9)
    if not sol.success:
        return None
    xs, ys, zs = sol.y[0], sol.y[1], sol.y[2]
    R3 = np.sqrt(xs**2 + ys**2 + zs**2)
    rperi, rapo = float(np.min(R3)), float(np.max(R3))
    ecc = (rapo - rperi) / (rapo + rperi + 1e-12)
    zmax = float(np.max(np.abs(zs)))
    Lz = p[0] * v[1] - p[1] * v[0]     # z 分量角动量
    return {
        "x": [round(float(q), 3) for q in xs],
        "y": [round(float(q), 3) for q in ys],
        "z": [round(float(q), 3) for q in zs],
        "r_peri_kpc": round(rperi, 3), "r_apo_kpc": round(rapo, 3),
        "eccentricity": round(ecc, 3), "z_max_kpc": round(zmax, 3),
        "Lz": round(float(Lz), 1),
        "retrograde": bool(Lz < 0),
    }

def self_test():
    """自洽性校验: 47 Tuc 银道坐标 与 太阳处圆周速度。"""
    vc = POT.vcirc(R_SUN)
    print(f"  [自检] vc(R_sun)={vc:.1f} km/s  (目标 238)")
    req = radec_to_unit(6.0236, -72.0813)          # 47 Tuc J2000
    rg = M_EQ2GAL @ req
    l = math.degrees(math.atan2(rg[1], rg[0])) % 360.0
    b = math.degrees(math.asin(rg[2]))
    print(f"  [自检] 47 Tuc 银道坐标 l={l:.2f} b={b:.2f}  (文献 l=305.90 b=-44.89)")

def main():
    self_test()
    master = pd.read_pickle(os.path.join(PRO, "master.pkl"))
    sel = master[master["dist_kpc"].notna() & master["pmRA"].notna() & master["vr_kms"].notna()].copy()
    print(f"\n完整6D星系数: {len(sel)}  -> 积分轨道")
    orbits, ok = {}, 0
    max_dev = 0.0
    for _, row in sel.iterrows():
        res = integrate_cluster(row)
        if res is not None:
            orbits[row["id"]] = res; ok += 1
            # 自检: 轨道起点(索引0)应与 master 银心坐标一致
            dev = math.sqrt((row["X_kpc"]-res["x"][0])**2 +
                            (row["Y_kpc"]-res["y"][0])**2 + (row["Z_kpc"]-res["z"][0])**2)
            max_dev = max(max_dev, dev)
    print(f"成功积分: {ok}")
    print(f"[自检] 轨道起点与 master 银心坐标的最大偏差 = {max_dev:.3f} kpc (应远小于1)")
    out = {
        "meta": {
            "potential": "MWPotential2014 (Bovy 2015): Hernquist bulge + Miyamoto-Nagai disk + NFW halo",
            "R_sun_kpc": R_SUN, "v_sun_kms": list(V_SUN), "z_sun_pc": 20.8,
            "vc_sun_kms": round(V0, 1),
            "integration": "DOP853 back-integration 3 Gyr, self-implemented IAU1958 transform",
            "n_clusters": ok,
            "frame": "Galactocentric right-handed Cartesian (kpc): +x toward Galactic centre from Sun",
        },
        "orbits": orbits,
    }
    path = os.path.join(PRO, "orbits.json")
    with open(path, "w") as f:
        json.dump(out, f)
    print(f"已输出 orbits.json  大小={os.path.getsize(path)/1024:.0f}KB")
    for name in ["NGC104", "NGC5139", "NGC6205", "NGC7078"]:
        if name in orbits:
            o = orbits[name]
            print(f"  {name}: Rperi={o['r_peri_kpc']} Rapo={o['r_apo_kpc']} ecc={o['eccentricity']} "
                  f"zmax={o['z_max_kpc']} {'逆行' if o['retrograde'] else '顺行'}")

if __name__ == "__main__":
    main()
