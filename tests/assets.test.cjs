'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CARD_ROOT = path.join(ROOT, 'assets', 'cards');
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ['cards.js', 'assets/cards/manifest.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}
const { ALL_TAROT_CARDS } = sandbox.window.TarotCards;
const manifest = sandbox.window.TarotCardArt;
const cardIds = new Set(ALL_TAROT_CARDS.map(card => card.id));

test('牌面清单登记全部 78 张牌，文件名与卡牌 ID 稳定绑定', () => {
    assert.equal(manifest.published, 78);
    assert.equal(manifest.total, 78);
    assert.equal(Object.keys(manifest.assets).length, 78);
    const manifestIds = new Set(Object.keys(manifest.assets));
    assert.deepEqual([...manifestIds].sort(), [...cardIds].sort(), '清单与 cards.js 的牌号不完全对应');
    for (const [id, asset] of Object.entries(manifest.assets)) {
        assert.ok(cardIds.has(id), `${id} 不在 cards.js 中`);
        assert.equal(asset.webp, `assets/cards/webp/${id}.webp`);
        assert.equal(asset.fallback, `assets/cards/fallback/${id}.svg`);
        assert.equal(asset.width, 600);
        assert.equal(asset.height, 1000);
        assert.ok(asset.alt.length >= 8);
    }
});

test('78 张牌面的 WebP、SVG 回退均存在且体积在预算内（母版存在时一并校验）', () => {
    let totalWebp = 0;
    const masterDir = path.join(CARD_ROOT, 'tarot-cards');
    // 母版按 README 声明不随发布仓库分发，缺失时跳过母版校验
    const hasMasters = fs.existsSync(masterDir);
    for (const [id, asset] of Object.entries(manifest.assets)) {
        const webpPath = path.join(ROOT, asset.webp);
        const fallbackPath = path.join(ROOT, asset.fallback);
        const masterPath = path.join(masterDir, `${id}.jpg`);
        for (const file of [webpPath, fallbackPath]) {
            assert.ok(fs.existsSync(file), `${file} 不存在`);
        }
        const webp = fs.readFileSync(webpPath);
        assert.equal(webp.subarray(0, 4).toString('ascii'), 'RIFF');
        assert.equal(webp.subarray(8, 12).toString('ascii'), 'WEBP');
        assert.ok(webp.length <= 61440, `${id} WebP 超过 62KB（61,440B）预算`);
        totalWebp += webp.length;
        if (hasMasters) {
            assert.ok(fs.existsSync(masterPath), `${masterPath} 不存在`);
            const master = fs.readFileSync(masterPath);
            assert.equal(master[0], 0xff, `${id} 母版不是 JPEG`);
            assert.equal(master[1], 0xd8, `${id} 母版不是 JPEG`);
        }
        const svg = fs.readFileSync(fallbackPath, 'utf8');
        assert.match(svg, /^<svg[\s>]/);
        assert.ok(!/<image[^>]+href=["']https?:/i.test(svg), `${id} 回退 SVG 含外链图片`);
    }
    assert.ok(totalWebp <= 4 * 1024 * 1024, '牌面总体积超过 4MB 预算');
});

test('发布目录不混入清单之外的牌面，母版与授权文档不进入清单', () => {
    const webpFiles = fs.readdirSync(path.join(CARD_ROOT, 'webp')).sort();
    const fallbackFiles = fs.readdirSync(path.join(CARD_ROOT, 'fallback')).sort();
    const expected = Object.keys(manifest.assets).map(id => `${id}.webp`).sort();
    const expectedFallback = Object.keys(manifest.assets).map(id => `${id}.svg`).sort();
    assert.deepEqual(webpFiles, expected);
    assert.deepEqual(fallbackFiles, expectedFallback);
    for (const asset of Object.values(manifest.assets)) {
        assert.ok(!asset.webp.includes('/masters/'));
        assert.ok(!asset.fallback.includes('/masters/'));
        assert.ok(!asset.webp.includes('/tarot-cards/'));
        assert.ok(!asset.webp.includes('LICENSE'));
    }
});
