# 牌面资产授权清单

本清单覆盖 `assets/cards/` 下当前发布的全部 78 张牌面（v1.0.1，2026-11-06）。

## 1. 统一授权

- 作者/署名：星见塔罗项目（XINGJIAN TAROT）
- 来源：78 张牌面均为项目所有者撰写提示词、使用 Google Gemini 生成的原创位图；不含第三方图片、照片、字体文件或描摹素材。AI 母版保存于 `tarot-cards/`（不随页面发布）。
- 后期处理：边缘白底修复、统一缩放至 600×1000、标题安全区归一化（`scripts/normalize-card-safe-zone.py`，分隔线统一到 y=752）、WebP 压缩（quality 84 起阶梯下调，单张 ≤62KB（61,440B））；SVG 回退由 `scripts/build-card-deck.cjs` 程序生成。
- 授权：**CC BY 4.0**（Creative Commons Attribution 4.0 International）
- 授权文本：https://creativecommons.org/licenses/by/4.0/
- 发布时保留署名"牌面：星见塔罗项目，CC BY 4.0"。如后续需要改为项目专有授权，应由项目所有者统一更新本清单和发布页署名，不得只改其中一处。
- 修改记录：v0.1.0（2026-10-28）程序生成 6 张样张；v1.0.0（2026-10-29）AI 生成全套 78 张牌面并取代样张，旧样张母版（`masters/`）与旧生成脚本仅作历史留档；v1.0.1（2026-11-06）78 张 WebP 的标题安全区归一化，分隔线统一到 y=752。

## 2. 逐文件清单（作者均为「星见塔罗项目」，授权均为 CC BY 4.0）

| 卡牌 ID | 名称 | AI 母版（不发布） | 发布 WebP | SVG 回退 | 版本 |
|---|---|---|---|---|---|
| `m00` | 愚人 | `tarot-cards/m00.jpg` | `webp/m00.webp` | `fallback/m00.svg` | 1.0.1 |
| `m01` | 魔术师 | `tarot-cards/m01.jpg` | `webp/m01.webp` | `fallback/m01.svg` | 1.0.1 |
| `m02` | 女祭司 | `tarot-cards/m02.jpg` | `webp/m02.webp` | `fallback/m02.svg` | 1.0.1 |
| `m03` | 皇后 | `tarot-cards/m03.jpg` | `webp/m03.webp` | `fallback/m03.svg` | 1.0.1 |
| `m04` | 皇帝 | `tarot-cards/m04.jpg` | `webp/m04.webp` | `fallback/m04.svg` | 1.0.1 |
| `m05` | 教皇 | `tarot-cards/m05.jpg` | `webp/m05.webp` | `fallback/m05.svg` | 1.0.1 |
| `m06` | 恋人 | `tarot-cards/m06.jpg` | `webp/m06.webp` | `fallback/m06.svg` | 1.0.1 |
| `m07` | 战车 | `tarot-cards/m07.jpg` | `webp/m07.webp` | `fallback/m07.svg` | 1.0.1 |
| `m08` | 力量 | `tarot-cards/m08.jpg` | `webp/m08.webp` | `fallback/m08.svg` | 1.0.1 |
| `m09` | 隐士 | `tarot-cards/m09.jpg` | `webp/m09.webp` | `fallback/m09.svg` | 1.0.1 |
| `m10` | 命运之轮 | `tarot-cards/m10.jpg` | `webp/m10.webp` | `fallback/m10.svg` | 1.0.1 |
| `m11` | 正义 | `tarot-cards/m11.jpg` | `webp/m11.webp` | `fallback/m11.svg` | 1.0.1 |
| `m12` | 倒吊人 | `tarot-cards/m12.jpg` | `webp/m12.webp` | `fallback/m12.svg` | 1.0.1 |
| `m13` | 死神 | `tarot-cards/m13.jpg` | `webp/m13.webp` | `fallback/m13.svg` | 1.0.1 |
| `m14` | 节制 | `tarot-cards/m14.jpg` | `webp/m14.webp` | `fallback/m14.svg` | 1.0.1 |
| `m15` | 恶魔 | `tarot-cards/m15.jpg` | `webp/m15.webp` | `fallback/m15.svg` | 1.0.1 |
| `m16` | 塔 | `tarot-cards/m16.jpg` | `webp/m16.webp` | `fallback/m16.svg` | 1.0.1 |
| `m17` | 星星 | `tarot-cards/m17.jpg` | `webp/m17.webp` | `fallback/m17.svg` | 1.0.1 |
| `m18` | 月亮 | `tarot-cards/m18.jpg` | `webp/m18.webp` | `fallback/m18.svg` | 1.0.1 |
| `m19` | 太阳 | `tarot-cards/m19.jpg` | `webp/m19.webp` | `fallback/m19.svg` | 1.0.1 |
| `m20` | 审判 | `tarot-cards/m20.jpg` | `webp/m20.webp` | `fallback/m20.svg` | 1.0.1 |
| `m21` | 世界 | `tarot-cards/m21.jpg` | `webp/m21.webp` | `fallback/m21.svg` | 1.0.1 |
| `w01` | 权杖王牌 | `tarot-cards/w01.jpg` | `webp/w01.webp` | `fallback/w01.svg` | 1.0.1 |
| `w02` | 权杖二 | `tarot-cards/w02.jpg` | `webp/w02.webp` | `fallback/w02.svg` | 1.0.1 |
| `w03` | 权杖三 | `tarot-cards/w03.jpg` | `webp/w03.webp` | `fallback/w03.svg` | 1.0.1 |
| `w04` | 权杖四 | `tarot-cards/w04.jpg` | `webp/w04.webp` | `fallback/w04.svg` | 1.0.1 |
| `w05` | 权杖五 | `tarot-cards/w05.jpg` | `webp/w05.webp` | `fallback/w05.svg` | 1.0.1 |
| `w06` | 权杖六 | `tarot-cards/w06.jpg` | `webp/w06.webp` | `fallback/w06.svg` | 1.0.1 |
| `w07` | 权杖七 | `tarot-cards/w07.jpg` | `webp/w07.webp` | `fallback/w07.svg` | 1.0.1 |
| `w08` | 权杖八 | `tarot-cards/w08.jpg` | `webp/w08.webp` | `fallback/w08.svg` | 1.0.1 |
| `w09` | 权杖九 | `tarot-cards/w09.jpg` | `webp/w09.webp` | `fallback/w09.svg` | 1.0.1 |
| `w10` | 权杖十 | `tarot-cards/w10.jpg` | `webp/w10.webp` | `fallback/w10.svg` | 1.0.1 |
| `w11` | 权杖侍从 | `tarot-cards/w11.jpg` | `webp/w11.webp` | `fallback/w11.svg` | 1.0.1 |
| `w12` | 权杖骑士 | `tarot-cards/w12.jpg` | `webp/w12.webp` | `fallback/w12.svg` | 1.0.1 |
| `w13` | 权杖皇后 | `tarot-cards/w13.jpg` | `webp/w13.webp` | `fallback/w13.svg` | 1.0.1 |
| `w14` | 权杖国王 | `tarot-cards/w14.jpg` | `webp/w14.webp` | `fallback/w14.svg` | 1.0.1 |
| `c01` | 圣杯王牌 | `tarot-cards/c01.jpg` | `webp/c01.webp` | `fallback/c01.svg` | 1.0.1 |
| `c02` | 圣杯二 | `tarot-cards/c02.jpg` | `webp/c02.webp` | `fallback/c02.svg` | 1.0.1 |
| `c03` | 圣杯三 | `tarot-cards/c03.jpg` | `webp/c03.webp` | `fallback/c03.svg` | 1.0.1 |
| `c04` | 圣杯四 | `tarot-cards/c04.jpg` | `webp/c04.webp` | `fallback/c04.svg` | 1.0.1 |
| `c05` | 圣杯五 | `tarot-cards/c05.jpg` | `webp/c05.webp` | `fallback/c05.svg` | 1.0.1 |
| `c06` | 圣杯六 | `tarot-cards/c06.jpg` | `webp/c06.webp` | `fallback/c06.svg` | 1.0.1 |
| `c07` | 圣杯七 | `tarot-cards/c07.jpg` | `webp/c07.webp` | `fallback/c07.svg` | 1.0.1 |
| `c08` | 圣杯八 | `tarot-cards/c08.jpg` | `webp/c08.webp` | `fallback/c08.svg` | 1.0.1 |
| `c09` | 圣杯九 | `tarot-cards/c09.jpg` | `webp/c09.webp` | `fallback/c09.svg` | 1.0.1 |
| `c10` | 圣杯十 | `tarot-cards/c10.jpg` | `webp/c10.webp` | `fallback/c10.svg` | 1.0.1 |
| `c11` | 圣杯侍从 | `tarot-cards/c11.jpg` | `webp/c11.webp` | `fallback/c11.svg` | 1.0.1 |
| `c12` | 圣杯骑士 | `tarot-cards/c12.jpg` | `webp/c12.webp` | `fallback/c12.svg` | 1.0.1 |
| `c13` | 圣杯皇后 | `tarot-cards/c13.jpg` | `webp/c13.webp` | `fallback/c13.svg` | 1.0.1 |
| `c14` | 圣杯国王 | `tarot-cards/c14.jpg` | `webp/c14.webp` | `fallback/c14.svg` | 1.0.1 |
| `s01` | 宝剑王牌 | `tarot-cards/s01.jpg` | `webp/s01.webp` | `fallback/s01.svg` | 1.0.1 |
| `s02` | 宝剑二 | `tarot-cards/s02.jpg` | `webp/s02.webp` | `fallback/s02.svg` | 1.0.1 |
| `s03` | 宝剑三 | `tarot-cards/s03.jpg` | `webp/s03.webp` | `fallback/s03.svg` | 1.0.1 |
| `s04` | 宝剑四 | `tarot-cards/s04.jpg` | `webp/s04.webp` | `fallback/s04.svg` | 1.0.1 |
| `s05` | 宝剑五 | `tarot-cards/s05.jpg` | `webp/s05.webp` | `fallback/s05.svg` | 1.0.1 |
| `s06` | 宝剑六 | `tarot-cards/s06.jpg` | `webp/s06.webp` | `fallback/s06.svg` | 1.0.1 |
| `s07` | 宝剑七 | `tarot-cards/s07.jpg` | `webp/s07.webp` | `fallback/s07.svg` | 1.0.1 |
| `s08` | 宝剑八 | `tarot-cards/s08.jpg` | `webp/s08.webp` | `fallback/s08.svg` | 1.0.1 |
| `s09` | 宝剑九 | `tarot-cards/s09.jpg` | `webp/s09.webp` | `fallback/s09.svg` | 1.0.1 |
| `s10` | 宝剑十 | `tarot-cards/s10.jpg` | `webp/s10.webp` | `fallback/s10.svg` | 1.0.1 |
| `s11` | 宝剑侍从 | `tarot-cards/s11.jpg` | `webp/s11.webp` | `fallback/s11.svg` | 1.0.1 |
| `s12` | 宝剑骑士 | `tarot-cards/s12.jpg` | `webp/s12.webp` | `fallback/s12.svg` | 1.0.1 |
| `s13` | 宝剑皇后 | `tarot-cards/s13.jpg` | `webp/s13.webp` | `fallback/s13.svg` | 1.0.1 |
| `s14` | 宝剑国王 | `tarot-cards/s14.jpg` | `webp/s14.webp` | `fallback/s14.svg` | 1.0.1 |
| `p01` | 星币王牌 | `tarot-cards/p01.jpg` | `webp/p01.webp` | `fallback/p01.svg` | 1.0.1 |
| `p02` | 星币二 | `tarot-cards/p02.jpg` | `webp/p02.webp` | `fallback/p02.svg` | 1.0.1 |
| `p03` | 星币三 | `tarot-cards/p03.jpg` | `webp/p03.webp` | `fallback/p03.svg` | 1.0.1 |
| `p04` | 星币四 | `tarot-cards/p04.jpg` | `webp/p04.webp` | `fallback/p04.svg` | 1.0.1 |
| `p05` | 星币五 | `tarot-cards/p05.jpg` | `webp/p05.webp` | `fallback/p05.svg` | 1.0.1 |
| `p06` | 星币六 | `tarot-cards/p06.jpg` | `webp/p06.webp` | `fallback/p06.svg` | 1.0.1 |
| `p07` | 星币七 | `tarot-cards/p07.jpg` | `webp/p07.webp` | `fallback/p07.svg` | 1.0.1 |
| `p08` | 星币八 | `tarot-cards/p08.jpg` | `webp/p08.webp` | `fallback/p08.svg` | 1.0.1 |
| `p09` | 星币九 | `tarot-cards/p09.jpg` | `webp/p09.webp` | `fallback/p09.svg` | 1.0.1 |
| `p10` | 星币十 | `tarot-cards/p10.jpg` | `webp/p10.webp` | `fallback/p10.svg` | 1.0.1 |
| `p11` | 星币侍从 | `tarot-cards/p11.jpg` | `webp/p11.webp` | `fallback/p11.svg` | 1.0.1 |
| `p12` | 星币骑士 | `tarot-cards/p12.jpg` | `webp/p12.webp` | `fallback/p12.svg` | 1.0.1 |
| `p13` | 星币皇后 | `tarot-cards/p13.jpg` | `webp/p13.webp` | `fallback/p13.svg` | 1.0.1 |
| `p14` | 星币国王 | `tarot-cards/p14.jpg` | `webp/p14.webp` | `fallback/p14.svg` | 1.0.1 |

## 3. 发布边界

- `tarot-cards/`（AI 母版）与 `masters/`（历史样张）不进入静态服务器白名单，不作为页面资源发布。
- 页面只允许读取 `webp/`、`fallback/` 与 `manifest.js`。
- 未列入本清单的牌面不得临时下载、热链或混入来源不明的图片。
