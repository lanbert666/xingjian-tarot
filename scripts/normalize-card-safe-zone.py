#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
星见塔罗 · 牌面「底部标题安全区」归一化（一次性资产后处理）

背景
----
78 张发布 WebP 的插图底边（分隔线）高度并不统一（668~807px），
而逆位渲染只是 `transform: rotate(180deg)`（style.css:919）。
旋转后，底部的标题安全区跑到顶部，于是每张逆位牌上方的留白都不一样。

做法
----
1. 保持金色边框不动：外框贴边、内框顶线 ft、内框底线（y≈960，位于标题带内）。
2. 只把「插图区」[ft, b] 垂直拉伸/压缩到统一的分隔线 TARGET_B。
3. 标题带按需裁切或补底色，使 [TARGET_B, 1000] 恒为 252px 且内框底线留在原位。

结果：所有牌面分隔线统一在 y=752（与 fallback SVG 的 line y=752 一致），
      逆位时顶部留白恒为 248px。

用法
----
  python scripts/normalize-card-safe-zone.py                # 试运行，只打印统计
  python scripts/normalize-card-safe-zone.py --apply        # 写回 assets/cards/webp/
  python scripts/normalize-card-safe-zone.py --apply --out <目录>   # 写到别处

改完 WebP 后必须重新生成清单：
  node scripts/build-card-deck.cjs
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

W, H = 600, 1000
TARGET_B = 752          # 统一分隔线位置（= fallback SVG 的 line y=752）
MAX_BYTES = 61440       # 单张 WebP 预算 62KB
TOTAL_BUDGET = 4 * 1024 * 1024
QUALITY_LADDER = [84, 82, 80, 78, 76, 74, 72, 70, 68, 66, 64, 62, 60]
# 重采样用 BILINEAR：拉伸量只有 ±13%，双线性几乎不引入振铃，
# 而 LANCZOS 的锐化会让重编码体积涨 10%~30%，直接顶穿单张 62KB 预算。
RESAMPLE = Image.BILINEAR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBP_DIR = os.path.join(ROOT, 'assets', 'cards', 'webp')


def luminance(im):
    a = np.asarray(im.convert('RGB'), dtype=np.float32)
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def detect_frame_top(L):
    """内框顶线：x∈[60,540] 中亮度>110 的像素占比>0.45，且连续两行成立。

    从 y=6 起扫，跳过贴边外框（部分牌面外框占 0~5 行）。
    """
    frac = (L[:, 60:540] > 110).mean(axis=1)
    ok = frac > 0.45
    for y in range(6, 130):
        if ok[y] and ok[y + 1]:
            return y
    return 25


def detect_divider(L):
    """插图底边 / 分隔线：x∈[72,528] 行内 ink>0.08 的最后一行。

    ink = 偏离该行中位亮度超过 10 的像素占比；限定 400..900 以避开内框底线（y≈960）。
    """
    row = L[:, 72:528]
    med = np.median(row, axis=1, keepdims=True)
    ink = (np.abs(row - med) > 10).mean(axis=1)
    ys = np.where(ink[400:900] > 0.08)[0]
    if len(ys) == 0:
        raise RuntimeError('无法定位分隔线')
    return int(ys[-1] + 400)


def band_color(im, b):
    """标题带底色：取分隔线下方 20~80 行的中位色（避开分隔线辉光）。"""
    lo = min(b + 20, H - 1)
    hi = min(b + 80, H)
    patch = np.asarray(im.convert('RGB').crop((40, lo, 560, hi)), dtype=np.float32)
    med = np.median(patch.reshape(-1, 3), axis=0)
    return tuple(int(round(v)) for v in med)


def band_cut(L, b):
    """标题带的起点：跳过分隔线本身及其下方的装饰线/残影。

    分隔线常比检测到的 b 低 1~4 行，少数牌面（如 m16）还有第二条装饰线低 12 行。
    以 [b+20, b+80] 的行均值为标题带基准，取 [b, b+40) 内最后一处明显更亮的行的下一行。
    """
    means = L[:, 72:528].mean(axis=1)
    lo = min(b + 20, H - 1)
    hi = min(b + 80, H)
    thresh = float(np.median(means[lo:hi])) + 25.0
    cut = b
    for y in range(b, min(H - 1, b + 40)):
        if means[y] > thresh:
            cut = y + 3
    return max(cut, b + 1)


def recompose(im, ft, b, target=TARGET_B):
    """把插图区 [ft, b] 拉伸到 [ft, target]，标题带贴回 target 以下。"""
    if b == target:
        return im.copy(), 1.0
    k = (target - ft) / float(b - ft)
    out = Image.new('RGB', (W, H))
    out.paste(im.crop((0, 0, W, ft)), (0, 0))
    out.paste(im.crop((0, ft, W, b)).resize((W, target - ft), RESAMPLE), (0, ft))
    if b < target:
        # 标题带整体上移：只保留 [target, 1000]，内框底线 y≈960 原位不动
        out.paste(im.crop((0, target, W, H)), (0, target))
    else:
        # 标题带整体下移：缺口 [target, cut] 用标题带底色填充，
        # 从 cut 起贴原带（跳过 b 下方的分隔线残影/第二道装饰线）
        cut = band_cut(luminance(im), b)
        out.paste(Image.new('RGB', (W, cut - target), band_color(im, b)), (0, target))
        out.paste(im.crop((0, cut, W, H)), (0, cut))
    return out, k


def encode(im, start_quality):
    """按质量阶梯编码，返回 (bytes, quality)。"""
    import io
    for q in [q for q in QUALITY_LADDER if q <= start_quality]:
        buf = io.BytesIO()
        im.save(buf, format='WEBP', quality=q, method=6)
        data = buf.getvalue()
        if len(data) <= MAX_BYTES:
            return data, q
    raise RuntimeError('即使在最低质量下仍超过 %d 字节' % MAX_BYTES)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='真正写盘（默认只试运行）')
    ap.add_argument('--out', default=None, help='输出目录（默认覆盖 assets/cards/webp）')
    ap.add_argument('--start-quality', type=int, default=84)
    args = ap.parse_args()

    out_dir = args.out or WEBP_DIR
    ids = sorted(f[:-5] for f in os.listdir(WEBP_DIR) if f.endswith('.webp'))
    if len(ids) != 78:
        raise SystemExit('期望 78 张 WebP，实际 %d' % len(ids))
    if args.apply:
        os.makedirs(out_dir, exist_ok=True)

    print('id      ft    b  safe      k   q    bytes   orig')
    total = 0
    total_orig = 0
    ks, safes, qs = [], [], []
    for cid in ids:
        path = os.path.join(WEBP_DIR, cid + '.webp')
        orig_bytes = os.path.getsize(path)
        im = Image.open(path)
        mode = im.mode
        im = im.convert('RGB')
        L = luminance(im)
        ft = detect_frame_top(L)
        b = detect_divider(L)
        out, k = recompose(im, ft, b)
        data, q = encode(out, args.start_quality)
        total += len(data)
        total_orig += orig_bytes
        ks.append(k)
        safes.append(H - TARGET_B)
        qs.append(q)
        print('%-5s %4d %4d %5d  %5.3f %3d %7d %6d' % (cid, ft, b, H - b, k, q, len(data), orig_bytes))
        if args.apply:
            dest = os.path.join(out_dir, cid + '.webp')
            with open(dest, 'wb') as fh:
                fh.write(data)
            if mode != 'RGB':
                print('  ! 原图 mode=%s，已按 RGB 输出' % mode)

    ks_sorted = sorted(ks)
    print()
    print('k: min %.4f  med %.4f  max %.4f' % (ks_sorted[0], ks_sorted[len(ks) // 2], ks_sorted[-1]))
    print('|k-1|>0.08: %d   >0.10: %d' % (sum(1 for k in ks if abs(k - 1) > 0.08),
                                          sum(1 for k in ks if abs(k - 1) > 0.10)))
    from collections import Counter
    print('质量分布:', dict(sorted(Counter(qs).items())))
    print('总字节 %d / 预算 %d（%.1f%%）；原总字节 %d（变化 %+d）' % (
        total, TOTAL_BUDGET, total * 100.0 / TOTAL_BUDGET, total_orig, total - total_orig))
    if total > TOTAL_BUDGET:
        print('!! 超出 4MB 总预算')
    print('安全区统一为 %dpx，分隔线 y=%d' % (H - TARGET_B, TARGET_B))
    if not args.apply:
        print('\n（试运行，未写盘；加 --apply 生效）')


if __name__ == '__main__':
    main()