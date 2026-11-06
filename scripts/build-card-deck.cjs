'use strict';
/**
 * 星见塔罗 · 78 张完整牌面发布资产生成器（v1.0）
 *
 * 输入：
 *   cards.js                     78 张牌数据库（ID / 名称 / 牌型 / 数值）
 *   assets/cards/webp/*.webp     发布用 WebP（由 AI 母版经白边修复 + 缩放 + 压缩生成）
 *
 * 输出：
 *   assets/cards/fallback/*.svg  统一风格的 SVG 兼容回退（78 张）
 *   assets/cards/manifest.js     页面加载清单（78 张，含逐牌 bytes/sha256）
 *   assets/cards/LICENSE.md      授权清单（78 行逐牌登记）
 *
 * 运行：node scripts/build-card-deck.cjs
 * 说明：零第三方依赖；v0.1 的 6 张程序样张生成器（build-card-assets.cjs）已被本脚本取代。
 */
const crypto = require('node:crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CARD_ROOT = path.join(ROOT, 'assets', 'cards');
const FALLBACK_DIR = path.join(CARD_ROOT, 'fallback');
const WEBP_DIR = path.join(CARD_ROOT, 'webp');
const MASTER_DIR = path.join(CARD_ROOT, 'tarot-cards');
const VERSION = '1.0.1';
const GENERATED_AT = '2026-11-06';

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'cards.js'), 'utf8'), sandbox, { filename: 'cards.js' });
const cards = sandbox.window.TarotCards.ALL_TAROT_CARDS;
if (cards.length !== 78) throw new Error(`cards.js 应包含 78 张牌，实际 ${cards.length}`);

// 发布 WebP 必须是非空文件且带合法 RIFF/WEBP 头；同时返回字节数与 sha256，
// 供 manifest 记录逐文件完整性，页面运行时不依赖这些字段。
function readPublishedWebp(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length === 0) throw new Error(`发布 WebP 为空文件：${filePath}`);
    if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
        throw new Error(`发布 WebP 头非法（需要 RIFF....WEBP）：${filePath}`);
    }
    return {
        bytes: buffer.length,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex')
    };
}

const GOLD = '#dfb73c';

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
    'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
const COURT_RANK = { 11: 'PAGE', 12: 'KNIGHT', 13: 'QUEEN', 14: 'KING' };

function starPath(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.42;
        pts.push(`${(cx + rr * Math.cos(ang)).toFixed(1)},${(cy + rr * Math.sin(ang)).toFixed(1)}`);
    }
    return `M${pts.join('L')}Z`;
}

function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 花色符号（以 0,0 为中心，金色线刻，与发布牌面风格呼应） */
function suitSymbol(suit) {
    if (suit === 'wands') {
        return `<g fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round">`
            + `<line x1="0" y1="-30" x2="0" y2="34"/>`
            + `<path d="M0 -30 C 16 -42 20 -56 12 -68 C 1 -58 -4 -44 0 -30 Z" fill="${GOLD}" stroke="none"/>`
            + `<path d="M0 6 C -12 0 -18 -8 -16 -18" stroke-width="3"/></g>`;
    }
    if (suit === 'cups') {
        return `<g fill="none" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round">`
            + `<path d="M-24 -30 H24 C24 -4 13 8 5 13 L5 24 L16 32 H-16 L-5 24 L-5 13 C-13 8 -24 -4 -24 -30 Z"/>`
            + `<line x1="-24" y1="-30" x2="24" y2="-30"/></g>`;
    }
    if (suit === 'swords') {
        return `<g fill="none" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">`
            + `<path d="M0 -38 L8 6 L0 16 L-8 6 Z" fill="${GOLD}" fill-opacity="0.25"/>`
            + `<line x1="-18" y1="18" x2="18" y2="18"/>`
            + `<line x1="0" y1="18" x2="0" y2="34"/></g>`;
    }
    // pentacles
    return `<g fill="none" stroke="${GOLD}" stroke-width="4">`
        + `<circle cx="0" cy="0" r="28"/>`
        + `<path d="${starPath(0, 0, 21)}" stroke-width="3"/></g>`;
}

/** 数字牌 1-10 的对称 pip 布局（相对中心 0,0） */
function pipLayout(n) {
    if (n === 1) return [[0, 0]];
    const pos = [];
    const rows = Math.ceil(n / 2);
    const dy = Math.min(140, 430 / Math.max(rows - 1, 1));
    let placed = 0;
    for (let r = 0; r < rows; r++) {
        const y = (r - (rows - 1) / 2) * dy;
        if (n - placed === 1) { pos.push([0, y]); placed += 1; }
        else { pos.push([-95, y], [95, y]); placed += 2; }
    }
    return pos;
}

function starfield(seed) {
    const rnd = mulberry(seed);
    const parts = [];
    for (let i = 0; i < 34; i++) {
        const x = 46 + rnd() * 508;
        const y = 46 + rnd() * 680;
        const r = 0.8 + rnd() * 1.4;
        const o = 0.35 + rnd() * 0.45;
        parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${GOLD}" opacity="${o.toFixed(2)}"/>`);
    }
    for (let i = 0; i < 5; i++) {
        const x = 60 + rnd() * 480;
        const y = 60 + rnd() * 640;
        const s = 4 + rnd() * 4;
        parts.push(`<path d="M${x.toFixed(1)} ${(y - s).toFixed(1)} L${(x + s * 0.28).toFixed(1)} ${(y - s * 0.28).toFixed(1)} L${(x + s).toFixed(1)} ${y.toFixed(1)} L${(x + s * 0.28).toFixed(1)} ${(y + s * 0.28).toFixed(1)} L${x.toFixed(1)} ${(y + s).toFixed(1)} L${(x - s * 0.28).toFixed(1)} ${(y + s * 0.28).toFixed(1)} L${(x - s).toFixed(1)} ${y.toFixed(1)} L${(x - s * 0.28).toFixed(1)} ${(y - s * 0.28).toFixed(1)} Z" fill="${GOLD}" opacity="0.75"/>`);
    }
    return parts.join('');
}

function centerEmblem(card) {
    if (card.type === 'major') {
        const num = parseInt(card.id.slice(1), 10);
        return `<g fill="none" stroke="${GOLD}">`
            + `<circle cx="300" cy="360" r="86" stroke-width="2.5" opacity="0.9"/>`
            + `<circle cx="300" cy="360" r="72" stroke-width="1.2" opacity="0.55"/>`
            + `<path d="${starPath(300, 360, 52)}" fill="${GOLD}" fill-opacity="0.16" stroke-width="2.5"/>`
            + `</g>`
            + `<text x="300" y="596" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" `
            + `font-size="58" letter-spacing="6" fill="${GOLD}">${ROMAN[num]}</text>`;
    }
    if (card.value <= 10) {
        return pipLayout(card.value)
            .map(([dx, dy]) => `<g transform="translate(${300 + dx} ${460 + dy})">${suitSymbol(card.suit)}</g>`)
            .join('');
    }
    return `<g transform="translate(300 400) scale(1.7)">${suitSymbol(card.suit)}</g>`
        + `<text x="300" y="600" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" `
        + `font-size="44" letter-spacing="10" fill="${GOLD}">${COURT_RANK[card.value]}</text>`;
}

function fallbackSvg(card, index) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000" width="600" height="1000" role="img" aria-label="${card.name}牌面回退图">
<defs>
<radialGradient id="bg" cx="50%" cy="34%" r="85%">
<stop offset="0%" stop-color="#1b1436"/>
<stop offset="55%" stop-color="#120e26"/>
<stop offset="100%" stop-color="#0a0716"/>
</radialGradient>
</defs>
<rect width="600" height="1000" fill="url(#bg)"/>
<g fill="none" stroke="${GOLD}" opacity="0.14">${[70, 105, 140, 175].map(r => `<circle cx="300" cy="250" r="${r}"/>`).join('')}</g>
${starfield(index * 97 + 13)}
<rect x="16" y="16" width="568" height="968" rx="30" fill="none" stroke="${GOLD}" stroke-width="2.5"/>
<rect x="30" y="30" width="540" height="940" rx="24" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.65"/>
<circle cx="300" cy="62" r="30" fill="none" stroke="${GOLD}" stroke-width="1.5" opacity="0.8"/>
<path d="${starPath(300, 62, 19)}" fill="${GOLD}"/>
<line x1="42" y1="752" x2="558" y2="752" stroke="${GOLD}" stroke-width="1.5" opacity="0.8"/>
${centerEmblem(card)}
</svg>
`;
}

fs.mkdirSync(FALLBACK_DIR, { recursive: true });
const assets = {};
cards.forEach((card, index) => {
    const webpPath = path.join(WEBP_DIR, `${card.id}.webp`);
    const masterPath = path.join(MASTER_DIR, `${card.id}.jpg`);
    if (!fs.existsSync(webpPath)) throw new Error(`缺少发布 WebP：${webpPath}`);
    if (!fs.existsSync(masterPath)) throw new Error(`缺少 AI 母版：${masterPath}`);
    const webp = readPublishedWebp(webpPath);
    fs.writeFileSync(path.join(FALLBACK_DIR, `${card.id}.svg`), fallbackSvg(card, index), 'utf8');
    assets[card.id] = {
        webp: `assets/cards/webp/${card.id}.webp`,
        fallback: `assets/cards/fallback/${card.id}.svg`,
        width: 600,
        height: 1000,
        bytes: webp.bytes,
        sha256: webp.sha256,
        alt: `「${card.name}」（${card.english}）星见原创牌面插画。`,
        version: VERSION
    };
});

const manifest = {
    version: VERSION,
    style: '星见 · 紫金星空装饰艺术（AI 生成位图）',
    published: cards.length,
    total: 78,
    generatedAt: GENERATED_AT,
    license: 'CC BY 4.0',
    author: '星见塔罗项目',
    assets
};
fs.writeFileSync(
    path.join(CARD_ROOT, 'manifest.js'),
    `/* 由 scripts/build-card-deck.cjs 生成；登记全部 78 张已完成的原创牌面。 */\nwindow.TarotCardArt = ${JSON.stringify(manifest, null, 4)};\n`,
    'utf8'
);

const rows = cards.map(card =>
    `| \`${card.id}\` | ${card.name} | \`tarot-cards/${card.id}.jpg\` | \`webp/${card.id}.webp\` | \`fallback/${card.id}.svg\` | ${VERSION} |`
).join('\n');
const license = `# 牌面资产授权清单

本清单覆盖 \`assets/cards/\` 下当前发布的全部 78 张牌面（v${VERSION}，${GENERATED_AT}）。

## 1. 统一授权

- 作者/署名：星见塔罗项目（XINGJIAN TAROT）
- 来源：78 张牌面均为项目所有者撰写提示词、使用 Google Gemini 生成的原创位图；不含第三方图片、照片、字体文件或描摹素材。AI 母版保存于 \`tarot-cards/\`（不随页面发布）。
- 后期处理：边缘白底修复、统一缩放至 600×1000、标题安全区归一化（\`scripts/normalize-card-safe-zone.py\`，分隔线统一到 y=752）、WebP 压缩（quality 84 起阶梯下调，单张 ≤62KB（61,440B））；SVG 回退由 \`scripts/build-card-deck.cjs\` 程序生成。
- 授权：**CC BY 4.0**（Creative Commons Attribution 4.0 International）
- 授权文本：https://creativecommons.org/licenses/by/4.0/
- 发布时保留署名"牌面：星见塔罗项目，CC BY 4.0"。如后续需要改为项目专有授权，应由项目所有者统一更新本清单和发布页署名，不得只改其中一处。
- 修改记录：v0.1.0（2026-10-28）程序生成 6 张样张；v1.0.0（2026-10-29）AI 生成全套 78 张牌面并取代样张，旧样张母版（\`masters/\`）与旧生成脚本仅作历史留档；v1.0.1（${GENERATED_AT}）78 张 WebP 的标题安全区归一化，分隔线统一到 y=752。

## 2. 逐文件清单（作者均为「星见塔罗项目」，授权均为 CC BY 4.0）

| 卡牌 ID | 名称 | AI 母版（不发布） | 发布 WebP | SVG 回退 | 版本 |
|---|---|---|---|---|---|
${rows}

## 3. 发布边界

- \`tarot-cards/\`（AI 母版）与 \`masters/\`（历史样张）不进入静态服务器白名单，不作为页面资源发布。
- 页面只允许读取 \`webp/\`、\`fallback/\` 与 \`manifest.js\`。
- 未列入本清单的牌面不得临时下载、热链或混入来源不明的图片。
`;
fs.writeFileSync(path.join(CARD_ROOT, 'LICENSE.md'), license, 'utf8');

console.log(`完成：${cards.length} 张 fallback SVG + manifest.js + LICENSE.md（v${VERSION}）`);