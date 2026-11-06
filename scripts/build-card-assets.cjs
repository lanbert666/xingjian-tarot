'use strict';

/**
 * 星见塔罗原创牌面样张生成器（零第三方素材）。
 *
 * 只生成当前已确认的 6 张样张：
 *   愚人 m00、恋人 m06、命运之轮 m10、
 *   宝剑四 s04、圣杯侍从 c11、星币十 p10。
 *
 * 输出：
 *   assets/cards/masters/*.svg   原始矢量母版（不随页面发布）
 *   assets/cards/fallback/*.svg  页面兼容回退（发布）
 *   assets/cards/webp/*.webp     页面主用格式（发布）
 *   assets/cards/manifest.js     页面加载清单（发布）
 *
 * 需要本机 Chrome/Edge 与 Python Pillow。生成结果已提交到仓库，
 * 页面运行时不需要执行本脚本。
 *
 * 注意：检测到 v1.0.0/更高版本清单时，本脚本默认拒绝；确需覆盖必须显式加
 * --force-replace，普通 --force 只允许重建 v0.1 样张。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CARD_ROOT = path.join(ROOT, 'assets', 'cards');
const MASTER_DIR = path.join(CARD_ROOT, 'masters');
const FALLBACK_DIR = path.join(CARD_ROOT, 'fallback');
const WEBP_DIR = path.join(CARD_ROOT, 'webp');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'xingjian-card-build-'));

const GOLD = '#dfb73c';
const GOLD_LIGHT = '#f6e08c';
const GOLD_DARK = '#8f6f1c';
const PURPLE = '#814de5';
const PURPLE_LIGHT = '#b491ff';
const INK = '#07050e';
const CREAM = '#f1d5b0';

function esc(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    })[char]);
}

function stars(seed, count = 78) {
    let state = seed >>> 0;
    const next = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
    const items = [];
    for (let index = 0; index < count; index++) {
        const x = 36 + next() * 528;
        const y = 120 + next() * 620;
        const radius = next() < 0.85 ? 1.1 : 2.1;
        const opacity = 0.22 + next() * 0.55;
        items.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}" fill="${next() < 0.18 ? PURPLE_LIGHT : GOLD_LIGHT}" opacity="${opacity.toFixed(2)}"/>`);
    }
    return `<g>${items.join('')}</g>`;
}

function pentacle(cx, cy, radius, opacity = 1) {
    const points = [];
    for (let index = 0; index < 5; index++) {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
        points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
    const star = [];
    for (let index = 0; index < 5; index++) {
        const point = points[(index * 2) % 5];
        star.push(`${point[0].toFixed(1)},${point[1].toFixed(1)}`);
    }
    return `<g opacity="${opacity}"><circle cx="${cx}" cy="${cy}" r="${radius * 1.35}" fill="none" stroke="${GOLD}" stroke-width="2"/><polygon points="${star.join(' ')}" fill="none" stroke="${GOLD_LIGHT}" stroke-width="2"/></g>`;
}

function sword(cx, cy, length, rotation = 0) {
    return `<g transform="translate(${cx} ${cy}) rotate(${rotation})" stroke="${GOLD_LIGHT}" stroke-width="3" fill="none">
        <path d="M0 ${-length / 2} L0 ${length / 2}" />
        <path d="M-22 ${-length / 2 + 18} L22 ${-length / 2 + 18}" />
        <path d="M-12 ${length / 2 - 12} L0 ${length / 2} L12 ${length / 2 - 12}" />
        <circle cx="0" cy="${-length / 2 - 9}" r="6" fill="${GOLD}" stroke="none"/>
    </g>`;
}

function cup(cx, cy, scale = 1) {
    return `<g transform="translate(${cx} ${cy}) scale(${scale})" fill="none" stroke="${GOLD_LIGHT}" stroke-width="3">
        <path d="M-42 -34 Q-38 30 0 38 Q38 30 42 -34 Z" fill="rgba(129,77,229,.18)"/>
        <path d="M0 38 L0 66 M-22 70 L22 70"/>
        <path d="M-42 -34 Q0 -16 42 -34"/>
        <path d="M-30 -20 Q0 4 30 -20" opacity=".55"/>
    </g>`;
}

function wand(cx, cy, rotation = 0) {
    return `<g transform="translate(${cx} ${cy}) rotate(${rotation})" stroke="${GOLD}" stroke-width="5" fill="none">
        <path d="M0 -78 L0 78"/>
        <path d="M-18 -52 L18 -52" stroke-width="3"/>
        <path d="M-12 -78 Q0 -98 12 -78" fill="rgba(223,183,60,.18)"/>
        <circle cx="0" cy="-86" r="7" fill="${GOLD_LIGHT}" stroke="none"/>
    </g>`;
}

function frame() {
    return `
    <rect x="16" y="16" width="568" height="968" rx="22" fill="none" stroke="url(#gold)" stroke-width="2"/>
    <rect x="29" y="29" width="542" height="942" rx="15" fill="none" stroke="${GOLD}" stroke-opacity=".28"/>
    <path d="M16 92 Q16 16 92 16 M508 16 Q584 16 584 92 M584 908 Q584 984 508 984 M92 984 Q16 984 16 908" fill="none" stroke="${GOLD_LIGHT}" stroke-opacity=".55" stroke-width="2"/>
    <g fill="${GOLD}" opacity=".8">
        <path d="M300 40 l6 12 13 2 -9 9 2 13 -12 -6 -12 6 2 -13 -9 -9 13 -2z"/>
        <circle cx="300" cy="70" r="2.5"/>
    </g>`;
}

function wrapper(card, art) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000" viewBox="0 0 600 1000" role="img" aria-labelledby="title desc">
<title id="title">${esc(card.name)} · ${esc(card.english)}</title>
<desc id="desc">${esc(card.alt)}</desc>
<defs>
    <radialGradient id="bg" cx="50%" cy="34%" r="88%">
        <stop offset="0" stop-color="#1b133b"/>
        <stop offset=".52" stop-color="#0d0921"/>
        <stop offset="1" stop-color="#05040c"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${GOLD_LIGHT}"/>
        <stop offset=".48" stop-color="${GOLD}"/>
        <stop offset="1" stop-color="${GOLD_DARK}"/>
    </linearGradient>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${INK}" stop-opacity="0"/>
        <stop offset=".55" stop-color="${INK}" stop-opacity=".72"/>
        <stop offset="1" stop-color="${INK}" stop-opacity=".96"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="7" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
</defs>
<rect width="600" height="1000" fill="url(#bg)"/>
${stars(card.seed)}
<circle cx="300" cy="430" r="238" fill="none" stroke="${PURPLE}" stroke-opacity=".12" stroke-width="1"/>
<circle cx="300" cy="430" r="205" fill="none" stroke="${GOLD}" stroke-opacity=".1" stroke-width="1"/>
${art}
<rect x="0" y="760" width="600" height="240" fill="url(#veil)"/>
${frame()}
<text x="300" y="112" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" letter-spacing="8" fill="${GOLD_LIGHT}">${esc(card.rank)}</text>
</svg>`;
}

const CARDS = [
    {
        id: 'm00',
        name: '愚人',
        english: 'The Fool',
        rank: '0',
        seed: 100,
        alt: '悬崖边的旅人、白犬与初升太阳构成的原创星图牌面。',
        art: `
        <g>
            <circle cx="462" cy="230" r="76" fill="${GOLD}" opacity=".22" filter="url(#glow)"/>
            <circle cx="462" cy="230" r="52" fill="none" stroke="${GOLD_LIGHT}" stroke-width="2" opacity=".8"/>
            <path d="M0 760 L118 646 L198 674 L302 596 L412 654 L520 584 L600 640 L600 1000 L0 1000Z" fill="#0a0719"/>
            <path d="M0 780 L120 664 L206 694 L310 616 L420 674 L528 604 L600 660" fill="none" stroke="${PURPLE}" stroke-opacity=".45" stroke-width="3"/>
            <path d="M302 596 L360 760 M302 596 L250 760" stroke="${GOLD}" stroke-opacity=".22" stroke-width="2" stroke-dasharray="6 10"/>
            <g transform="translate(300 492)">
                <circle cx="0" cy="-76" r="23" fill="${CREAM}"/>
                <path d="M-18 -52 Q0 -32 18 -52 L30 62 L-30 62 Z" fill="${PURPLE}" stroke="${PURPLE_LIGHT}" stroke-width="2"/>
                <path d="M-12 62 L-28 128 M12 62 L28 128" stroke="${CREAM}" stroke-width="8" stroke-linecap="round"/>
                <path d="M-32 -20 L-104 -92" stroke="${GOLD_DARK}" stroke-width="6" stroke-linecap="round"/>
                <circle cx="-112" cy="-100" r="21" fill="${GOLD}" opacity=".8"/>
                <path d="M-112 -100 Q-132 -128 -108 -142" fill="none" stroke="${GOLD_LIGHT}" stroke-width="3"/>
                <path d="M-18 -52 Q-34 -28 -42 8" fill="none" stroke="${PURPLE_LIGHT}" stroke-opacity=".5" stroke-width="2"/>
            </g>
            <g transform="translate(390 654)" fill="#f5f4f9">
                <ellipse cx="0" cy="0" rx="35" ry="20"/>
                <circle cx="28" cy="-12" r="15"/>
                <path d="M37 -24 l10 -16 6 18z"/>
                <path d="M-34 -2 Q-56 -18 -52 8 Q-46 22 -28 12" fill="none" stroke="#f5f4f9" stroke-width="7" stroke-linecap="round"/>
                <circle cx="32" cy="-14" r="2.5" fill="${INK}"/>
            </g>
            <g fill="${GOLD_LIGHT}" opacity=".85">
                <path d="M196 300 q10 -18 20 0 q-10 18 -20 0z"/>
                <path d="M228 350 q7 -13 14 0 q-7 13 -14 0z"/>
                <path d="M176 380 q6 -11 12 0 q-6 11 -12 0z"/>
            </g>
            <path d="M120 760 Q220 710 300 740 T480 730" fill="none" stroke="${GOLD}" stroke-opacity=".18" stroke-width="2"/>
        </g>`
    },
    {
        id: 'm06',
        name: '恋人',
        english: 'The Lovers',
        rank: 'VI',
        seed: 200,
        alt: '天使羽翼、两位旅人与生命树构成的原创恋人牌面。',
        art: `
        <g>
            <circle cx="300" cy="246" r="112" fill="${GOLD}" opacity=".13" filter="url(#glow)"/>
            <circle cx="300" cy="246" r="64" fill="${GOLD_LIGHT}" opacity=".72"/>
            <g fill="none" stroke="${PURPLE_LIGHT}" stroke-opacity=".55" stroke-width="3">
                <path d="M300 250 Q210 168 150 214 Q186 292 300 286"/>
                <path d="M300 250 Q390 168 450 214 Q414 292 300 286"/>
                <path d="M300 250 Q228 196 190 232 Q224 280 300 280"/>
                <path d="M300 250 Q372 196 410 232 Q376 280 300 280"/>
            </g>
            <path d="M300 260 L300 414" stroke="${GOLD_LIGHT}" stroke-width="3"/>
            <circle cx="300" cy="274" r="16" fill="${CREAM}"/>
            <path d="M300 290 L270 360 L330 360 Z" fill="${GOLD}" opacity=".8"/>
            <path d="M0 770 Q150 700 300 744 Q450 788 600 712 L600 1000 L0 1000Z" fill="#0a0718"/>
            <g transform="translate(218 574)">
                <circle cx="0" cy="-74" r="22" fill="${CREAM}"/>
                <path d="M-18 -50 Q0 -32 18 -50 L28 96 L-28 96 Z" fill="#2c1f58" stroke="${PURPLE_LIGHT}" stroke-width="2"/>
                <path d="M-28 96 L-36 156 M28 96 L36 156" stroke="${CREAM}" stroke-width="7"/>
                <path d="M18 -20 Q58 -44 82 -14" fill="none" stroke="${CREAM}" stroke-width="6" stroke-linecap="round"/>
                <path d="M-18 -20 Q-52 -36 -70 -6" fill="none" stroke="${CREAM}" stroke-width="6" stroke-linecap="round"/>
            </g>
            <g transform="translate(382 574)">
                <circle cx="0" cy="-74" r="22" fill="${CREAM}"/>
                <path d="M-18 -50 Q0 -32 18 -50 L28 96 L-28 96 Z" fill="#3b245c" stroke="${GOLD}" stroke-width="2"/>
                <path d="M-28 96 L-36 156 M28 96 L36 156" stroke="${CREAM}" stroke-width="7"/>
                <path d="M-18 -20 Q-58 -44 -82 -14" fill="none" stroke="${CREAM}" stroke-width="6" stroke-linecap="round"/>
                <path d="M18 -20 Q52 -36 70 -6" fill="none" stroke="${CREAM}" stroke-width="6" stroke-linecap="round"/>
            </g>
            <g transform="translate(108 620)" fill="none" stroke="${GOLD}" stroke-width="3">
                <path d="M0 120 L0 -110"/>
                <path d="M0 -30 Q-54 -72 -64 -12 Q-42 28 0 4"/>
                <path d="M0 -10 Q56 -58 68 0 Q46 36 0 12"/>
                <circle cx="-40" cy="-38" r="8" fill="${GOLD}"/>
                <circle cx="42" cy="-30" r="8" fill="${GOLD}"/>
                <circle cx="-22" cy="8" r="6" fill="${GOLD}"/>
            </g>
            <path d="M300 456 Q282 438 266 456 Q250 474 300 516 Q350 474 334 456 Q318 438 300 456Z" fill="none" stroke="${GOLD_LIGHT}" stroke-width="2" opacity=".7"/>
        </g>`
    },
    {
        id: 'm10',
        name: '命运之轮',
        english: 'Wheel of Fortune',
        rank: 'X',
        seed: 300,
        alt: '巨大命运之轮、云层与四方守护构成的原创星图牌面。',
        art: `
        <g>
            <circle cx="300" cy="456" r="190" fill="${PURPLE}" opacity=".08"/>
            <circle cx="300" cy="456" r="172" fill="none" stroke="${GOLD}" stroke-width="4"/>
            <circle cx="300" cy="456" r="146" fill="none" stroke="${GOLD_LIGHT}" stroke-opacity=".45" stroke-width="2"/>
            <circle cx="300" cy="456" r="56" fill="none" stroke="${GOLD_LIGHT}" stroke-width="3"/>
            <g stroke="${GOLD_LIGHT}" stroke-width="3" opacity=".8">
                ${[0, 45, 90, 135].map(angle => `<path d="M300 456 L300 288" transform="rotate(${angle} 300 456)"/>`).join('')}
            </g>
            <g fill="${GOLD}" opacity=".9">
                ${[0, 45, 90, 135, 180, 225, 270, 315].map(angle => `<circle cx="300" cy="284" r="7" transform="rotate(${angle} 300 456)"/>`).join('')}
            </g>
            <g transform="translate(300 456)" fill="none" stroke="${GOLD_LIGHT}" stroke-width="3">
                <path d="M0 -32 L9 -10 L32 -10 L14 4 L21 27 L0 13 L-21 27 L-14 4 L-32 -10 L-9 -10 Z" fill="rgba(223,183,60,.22)"/>
                <circle cx="0" cy="0" r="38" stroke-opacity=".35"/>
            </g>
            <g fill="${PURPLE_LIGHT}" opacity=".55">
                <path d="M96 650 q42 -50 84 0 q-42 50 -84 0z"/>
                <path d="M420 650 q42 -50 84 0 q-42 50 -84 0z"/>
                <path d="M96 270 q42 -50 84 0 q-42 50 -84 0z"/>
                <path d="M420 270 q42 -50 84 0 q-42 50 -84 0z"/>
            </g>
            <g fill="${GOLD_LIGHT}" opacity=".8">
                <circle cx="138" cy="650" r="4"/><circle cx="462" cy="650" r="4"/>
                <circle cx="138" cy="270" r="4"/><circle cx="462" cy="270" r="4"/>
            </g>
            <g fill="none" stroke="${GOLD}" stroke-opacity=".35" stroke-width="2">
                <path d="M58 760 Q150 700 300 726 Q450 752 542 700"/>
                <path d="M58 790 Q150 730 300 756 Q450 782 542 730"/>
            </g>
            <g fill="${GOLD}" opacity=".18">
                <path d="M300 190 l8 18 20 3 -15 14 4 20 -17 -9 -17 9 4 -20 -15 -14 20 -3z"/>
            </g>
        </g>`
    },
    {
        id: 's04',
        name: '宝剑四',
        english: 'Four of Swords',
        rank: 'IV',
        seed: 400,
        alt: '石棺上休憩的骑士、四把宝剑与彩窗构成的原创宝剑四牌面。',
        art: `
        <g>
            <path d="M126 286 L126 720 L474 720 L474 286 Q300 190 126 286Z" fill="#0a0719" stroke="${PURPLE}" stroke-opacity=".3" stroke-width="2"/>
            <circle cx="300" cy="330" r="78" fill="none" stroke="${GOLD}" stroke-width="2" opacity=".75"/>
            <circle cx="300" cy="330" r="54" fill="none" stroke="${PURPLE_LIGHT}" stroke-width="2" opacity=".55"/>
            <g stroke="${GOLD_LIGHT}" stroke-width="2" opacity=".6">
                <path d="M300 252 L300 408 M222 330 L378 330 M246 276 L354 384 M354 276 L246 384"/>
            </g>
            <circle cx="300" cy="330" r="18" fill="${GOLD}" opacity=".6"/>
            ${sword(190, 540, 260, 0)}
            ${sword(410, 540, 260, 0)}
            ${sword(250, 570, 230, 0)}
            ${sword(350, 570, 230, 0)}
            <g transform="translate(300 650)">
                <rect x="-128" y="-34" width="256" height="96" rx="14" fill="#17102e" stroke="${GOLD}" stroke-width="2"/>
                <path d="M-128 10 L128 10" stroke="${GOLD}" stroke-opacity=".35"/>
                <g transform="translate(-42 -12)">
                    <circle cx="0" cy="-20" r="18" fill="${CREAM}"/>
                    <path d="M-34 -2 Q0 -34 34 -2 L28 30 L-28 30 Z" fill="#2c1f58" stroke="${PURPLE_LIGHT}" stroke-width="2"/>
                    <path d="M-28 30 L-70 38" stroke="${CREAM}" stroke-width="7" stroke-linecap="round"/>
                </g>
                <path d="M-10 4 Q42 -8 82 16" fill="none" stroke="${GOLD_LIGHT}" stroke-width="3" opacity=".55"/>
            </g>
            <g fill="${GOLD}" opacity=".85">
                <path d="M148 650 q8 -18 16 0 q-8 18 -16 0z"/>
                <path d="M452 650 q8 -18 16 0 q-8 18 -16 0z"/>
            </g>
            <g stroke="${GOLD_LIGHT}" stroke-width="2" opacity=".5">
                <path d="M104 740 L104 690 M96 700 L112 700"/>
                <path d="M496 740 L496 690 M488 700 L504 700"/>
            </g>
        </g>`
    },
    {
        id: 'c11',
        name: '圣杯侍从',
        english: 'Page of Cups',
        rank: 'PAGE',
        seed: 500,
        alt: '年轻侍从、跃出小鱼的圣杯与海浪构成的原创圣杯侍从牌面。',
        art: `
        <g>
            <path d="M0 720 Q90 660 180 720 T360 720 T540 720 T720 720 L720 1000 L0 1000Z" fill="#0b1630" opacity=".8"/>
            <g fill="none" stroke="${PURPLE_LIGHT}" stroke-opacity=".4" stroke-width="2">
                <path d="M0 748 Q90 688 180 748 T360 748 T540 748 T720 748"/>
                <path d="M0 780 Q90 720 180 780 T360 780 T540 780 T720 780"/>
            </g>
            <g transform="translate(300 520)">
                <circle cx="0" cy="-78" r="24" fill="${CREAM}"/>
                <path d="M-20 -50 Q0 -30 20 -50 L34 104 L-34 104 Z" fill="#1d3b5c" stroke="${GOLD}" stroke-width="2"/>
                <path d="M-34 104 L-44 166 M34 104 L44 166" stroke="${CREAM}" stroke-width="7"/>
                <path d="M20 -18 Q72 -52 92 -20" fill="none" stroke="${CREAM}" stroke-width="6" stroke-linecap="round"/>
                ${cup(104, -26, 0.9)}
                <g transform="translate(104 -74) rotate(-12)">
                    <ellipse cx="0" cy="0" rx="22" ry="10" fill="${GOLD_LIGHT}" opacity=".85"/>
                    <path d="M20 0 L38 -12 L36 12 Z" fill="${GOLD}" opacity=".9"/>
                    <circle cx="-10" cy="-2" r="2" fill="${INK}"/>
                </g>
                <path d="M-20 -18 Q-58 -34 -76 -10" fill="none" stroke="${CREAM}" stroke-width="6" stroke-linecap="round"/>
            </g>
            <g fill="${GOLD_LIGHT}" opacity=".7">
                <path d="M160 420 q8 -16 16 0 q-8 16 -16 0z"/>
                <path d="M440 420 q8 -16 16 0 q-8 16 -16 0z"/>
                <path d="M196 380 q6 -12 12 0 q-6 12 -12 0z"/>
                <path d="M404 380 q6 -12 12 0 q-6 12 -12 0z"/>
            </g>
            <g fill="none" stroke="${GOLD}" stroke-opacity=".55" stroke-width="2">
                <path d="M120 760 Q180 720 240 760"/>
                <path d="M360 760 Q420 720 480 760"/>
            </g>
        </g>`
    },
    {
        id: 'p10',
        name: '星币十',
        english: 'Ten of Pentacles',
        rank: 'X',
        seed: 600,
        alt: '拱门、家族、生命树与十枚星币构成的原创星币十牌面。',
        art: `
        <g>
            <path d="M96 720 L96 430 Q300 208 504 430 L504 720" fill="none" stroke="${GOLD}" stroke-width="4"/>
            <path d="M120 720 L120 444 Q300 238 480 444 L480 720" fill="none" stroke="${PURPLE}" stroke-opacity=".45" stroke-width="2"/>
            <g fill="${GOLD}" opacity=".16">
                <circle cx="300" cy="420" r="150"/>
            </g>
            <g transform="translate(300 470)" fill="none" stroke="${GOLD_LIGHT}" stroke-width="3">
                <path d="M0 130 L0 -96"/>
                <path d="M0 -56 Q-70 -110 -92 -28 Q-62 38 0 12"/>
                <path d="M0 -30 Q74 -94 98 -8 Q64 46 0 18"/>
                <circle cx="-58" cy="-56" r="9" fill="${GOLD}"/>
                <circle cx="62" cy="-48" r="9" fill="${GOLD}"/>
                <circle cx="-34" cy="2" r="7" fill="${GOLD}"/>
            </g>
            <g fill="#17102e" stroke="${GOLD}" stroke-width="2">
                <circle cx="300" cy="590" r="20"/>
                <path d="M282 610 Q300 590 318 610 L326 690 L274 690 Z"/>
                <circle cx="238" cy="620" r="14"/>
                <path d="M226 634 Q238 620 250 634 L256 690 L220 690 Z"/>
                <circle cx="362" cy="620" r="14"/>
                <path d="M350 634 Q362 620 374 634 L380 690 L344 690 Z"/>
                <circle cx="204" cy="650" r="10"/>
                <path d="M194 660 Q204 650 214 660 L218 700 L190 700 Z"/>
                <circle cx="396" cy="650" r="10"/>
                <path d="M386 660 Q396 650 406 660 L410 700 L382 700 Z"/>
            </g>
            ${[
                [180, 300], [240, 250], [300, 228], [360, 250], [420, 300],
                [160, 390], [440, 390], [190, 510], [410, 510], [300, 730]
            ].map(([x, y]) => pentacle(x, y, 17, 0.95)).join('')}
            <path d="M96 720 L504 720" stroke="${GOLD}" stroke-width="3"/>
            <g fill="none" stroke="${GOLD}" stroke-opacity=".35" stroke-width="2">
                <path d="M140 720 L140 680 M460 720 L460 680"/>
                <path d="M180 720 L180 690 M420 720 L420 690"/>
            </g>
            <g fill="${GOLD_LIGHT}" opacity=".8">
                <circle cx="300" cy="180" r="4"/>
                <path d="M300 160 l5 12 13 2 -10 9 3 13 -11 -6 -11 6 3 -13 -10 -9 13 -2z"/>
            </g>
        </g>`
    }
];

function writeSvg(card) {
    const svg = wrapper(card, card.art);
    fs.writeFileSync(path.join(MASTER_DIR, `${card.id}.svg`), svg, 'utf8');
    fs.writeFileSync(path.join(FALLBACK_DIR, `${card.id}.svg`), svg, 'utf8');
    return svg;
}

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].filter(Boolean);
    return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function rasterize(card, chrome) {
    const svgPath = path.join(FALLBACK_DIR, `${card.id}.svg`);
    const pngPath = path.join(TMP_DIR, `${card.id}.png`);
    const profile = path.join(TMP_DIR, `profile-${card.id}`);
    const url = `file:///${svgPath.replace(/\\/g, '/')}`;
    const result = spawnSync(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--force-device-scale-factor=1',
        `--user-data-dir=${profile}`,
        '--window-size=600,1000',
        `--screenshot=${pngPath}`,
        url
    ], { encoding: 'utf8', timeout: 30000 });
    if (result.status !== 0 || !fs.existsSync(pngPath)) {
        throw new Error(`Chrome 渲染 ${card.id} 失败：${result.stderr || result.error || 'unknown'}`);
    }
    return pngPath;
}

// 防呆：本脚本只生成 v0.1 的 6 张样张，已被 build-card-deck.cjs 取代。
// 它会覆盖 manifest.js 以及同名 WebP/SVG；如果当前项目已经接入完整 78 张牌面，
// 直接运行就会把生产清单打回 6 条、把已发布的牌面覆盖成旧样张。
// 因此先读现有 manifest：登记数量超过样张数或版本 >= 1.0.0 时，普通 --force
// 不再放行，必须显式加 --force-replace 做二次确认。
function assertSafeToRun() {
    if (process.argv.includes('--force-replace')) {
        console.warn('警告：--force-replace 将用 v0.1 样张覆盖已发布牌面；建议先备份 assets/cards。');
        return;
    }
    const force = process.argv.includes('--force');
    const manifestPath = path.join(CARD_ROOT, 'manifest.js');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(
            '拒绝运行：未找到 assets/cards/manifest.js，无法确认当前牌面版本。\n' +
            '如需生成完整牌面/清单，请运行 node scripts/build-card-deck.cjs；\n' +
            '如确实要覆盖现有牌面，请显式加 --force-replace。'
        );
    }
    const sandbox = { window: {} };
    try {
        vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync(manifestPath, 'utf8'), sandbox, { filename: 'manifest.js' });
    } catch {
        throw new Error(
            '拒绝运行：assets/cards/manifest.js 无法解析，无法确认当前牌面版本。\n' +
            '请先修复清单或运行 node scripts/build-card-deck.cjs；\n' +
            '如确实要覆盖现有牌面，请显式加 --force-replace。'
        );
    }
    const manifest = sandbox.window.TarotCardArt || {};
    const published = Number(manifest.published) || 0;
    const version = String(manifest.version || '');
    const major = Number.parseInt(version.split('.')[0], 10) || 0;
    if (published > CARDS.length || major >= 1) {
        throw new Error(
            `拒绝运行：检测到已发布牌面 v${version || '未知'}（${published} 张），而本脚本只生成 ${CARDS.length} 张 v0.1 样张。\n` +
            '继续运行会覆盖 manifest.js 与同名 WebP/SVG，把正式牌面降级回旧样张。\n' +
            '如需更新回退/清单，请运行 node scripts/build-card-deck.cjs；\n' +
            '如确实要覆盖正式牌面，请显式加 --force-replace（普通 --force 不再放行）。'
        );
    }
    if (!force) {
        throw new Error(
            `拒绝运行：本脚本只生成 ${CARDS.length} 张 v0.1 样张，当前清单为 v${version || '未知'}（${published} 张）。\n` +
            '如确实要重新生成旧样张，请显式加 --force；如要覆盖正式牌面，请用 --force-replace。'
        );
    }
}

function main() {
    assertSafeToRun();
    for (const dir of [MASTER_DIR, FALLBACK_DIR, WEBP_DIR]) fs.mkdirSync(dir, { recursive: true });
    for (const card of CARDS) writeSvg(card);

    const chrome = findChrome();
    if (!chrome) throw new Error('未找到 Chrome/Edge，无法生成 WebP。');
    const pngs = CARDS.map(card => ({ id: card.id, png: rasterize(card, chrome) }));

    const python = [
        'from PIL import Image',
        'import json, sys',
        'items = json.loads(sys.argv[1])',
        'for item in items:',
        '    image = Image.open(item["png"]).convert("RGB")',
        '    image.save(item["out"], "WEBP", quality=84, method=6)',
        '    print(item["id"], image.size)'
    ].join('\n');
    const args = JSON.stringify(pngs.map(item => ({
        id: item.id,
        png: item.png,
        out: path.join(WEBP_DIR, `${item.id}.webp`)
    })));
    const converted = spawnSync('python', ['-c', python, args], { encoding: 'utf8' });
    if (converted.status !== 0) {
        throw new Error(`WebP 转换失败：${converted.stderr || converted.stdout}`);
    }
    process.stdout.write(converted.stdout);

    const manifest = {
        version: '0.1.0',
        style: '星见原创星图线刻',
        published: CARDS.length,
        total: 78,
        generatedAt: '2026-10-28',
        license: 'CC BY 4.0',
        author: '星见塔罗项目',
        assets: Object.fromEntries(CARDS.map(card => [card.id, {
            webp: `assets/cards/webp/${card.id}.webp`,
            fallback: `assets/cards/fallback/${card.id}.svg`,
            width: 600,
            height: 1000,
            alt: card.alt,
            version: '0.1.0'
        }]))
    };
    fs.writeFileSync(
        path.join(CARD_ROOT, 'manifest.js'),
        `/* 由 scripts/build-card-assets.cjs 生成；只登记已完成的原创样张。 */\nwindow.TarotCardArt = ${JSON.stringify(manifest, null, 4)};\n`,
        'utf8'
    );
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    console.log(`已生成 ${CARDS.length} 张原创样张。`);
}

main();