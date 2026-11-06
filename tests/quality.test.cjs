'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'features.js'), 'utf8'), sandbox);
const { getSafetyRoute, SPREADS } = sandbox.window.TarotFeatures;
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'reading-quality-cases.json'), 'utf8'));

test('AI 解读质量评审用例结构完整且安全路由符合预期', () => {
    assert.ok(cases.length >= 8);
    assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
    for (const item of cases) {
        assert.ok(item.question && item.category && item.spreadId);
        assert.ok(item.review.length >= 2, `${item.id} 缺少评审标准`);
        assert.equal(getSafetyRoute(item.question), item.route, item.id);
    }
});

test('固定质量用例引用的牌阵位置职责完整且不串位', () => {
    for (const item of cases) {
        const spread = SPREADS[item.spreadId];
        assert.ok(spread, `${item.id} 引用了不存在的牌阵 ${item.spreadId}`);
        assert.ok(spread.positions.length >= 1);
        assert.equal(new Set(spread.positions.map(position => position.id)).size, spread.positions.length);
        for (const position of spread.positions) {
            assert.ok(position.id && position.name && position.english && position.guidance, `${item.id} 位置字段不完整`);
            assert.ok(position.guidance.length >= 12, `${item.id} 的位置 ${position.id} 职责过短`);
        }
    }
});
