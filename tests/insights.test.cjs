'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ['cards.js', 'insights.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}
const { ALL_TAROT_CARDS } = sandbox.window.TarotCards;
const { computeStats, parseCardName, ELEMENTS, GUARDIAN_WINDOW_DAYS } = sandbox.window.Xingjian.insights;

const NOW = new Date('2026-10-28T02:00:00.000Z');
const CUTOFF = NOW.getTime() - GUARDIAN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function record(overrides = {}) {
    return {
        id: 'insight-record',
        time: '2026-10-28T01:00:00.000Z',
        question: '星图洞察测试',
        action: '',
        review: { outcome: '', text: '', updatedAt: null },
        cards: [],
        ...overrides
    };
}

function statsOf(records) {
    return computeStats(records, { cards: ALL_TAROT_CARDS, now: NOW });
}

test('空数组与非数组返回稳定的空统计', () => {
    for (const input of [[], null, undefined, 'not an array', {}, 42]) {
        const stats = statsOf(input);
        assert.equal(stats.totalReadings, 0);
        assert.equal(stats.totalCards, 0);
        assert.equal(stats.reversedCards, 0);
        assert.equal(stats.reversalRate, 0);
        assert.equal(stats.elementTotal, 0);
        assert.equal(stats.guardian, null);
        assert.deepEqual({ ...stats.action }, { withAction: 0, completed: 0, rate: 0 });
        assert.deepEqual([...stats.elements.map(element => element.count)], [0, 0, 0, 0, 0]);
        assert.deepEqual([...stats.elements.map(element => element.percent)], [0, 0, 0, 0, 0]);
    }
});

test('单条记录：元素、守护牌、逆位与行动转化率', () => {
    const stats = statsOf([record({
        cards: [{ position: '核心启示', name: '正位·权杖王牌' }],
        action: '今晚写下三件可控的小事',
        review: { outcome: 'helpful', text: '确实有帮助', updatedAt: '2026-10-29T00:00:00.000Z' }
    })]);
    assert.equal(stats.totalReadings, 1);
    assert.equal(stats.totalCards, 1);
    assert.equal(stats.reversedCards, 0);
    assert.equal(stats.reversalRate, 0);
    assert.deepEqual([...stats.elements.map(element => element.count)], [1, 0, 0, 0, 0]);
    assert.deepEqual([...stats.elements.map(element => element.percent)], [100, 0, 0, 0, 0]);
    assert.equal(stats.elementTotal, 1);
    assert.deepEqual(
        { name: stats.guardian.name, count: stats.guardian.count, english: stats.guardian.english },
        { name: '权杖王牌', count: 1, english: 'Ace of Wands' }
    );
    assert.deepEqual({ ...stats.action }, { withAction: 1, completed: 1, rate: 1 });
});

test('四元素与大阿卡纳按 cards.js 的花色派生，百分比合计 100', () => {
    const stats = statsOf([record({
        cards: [
            { name: '正位·权杖王牌' },
            { name: '逆位·圣杯二' },
            { name: '正位·宝剑三' },
            { name: '逆位·星币四' },
            { name: '正位·愚人' }
        ]
    })]);
    assert.deepEqual([...stats.elements.map(element => element.key)], ['fire', 'water', 'air', 'earth', 'spirit']);
    assert.deepEqual([...stats.elements.map(element => element.count)], [1, 1, 1, 1, 1]);
    assert.deepEqual([...stats.elements.map(element => element.percent)], [20, 20, 20, 20, 20]);
    assert.equal(stats.elementTotal, 5);
    assert.equal(stats.totalCards, 5);
    assert.equal(stats.reversedCards, 2);
    assert.equal(stats.reversalRate, 0.4);
    assert.equal(ELEMENTS.length, 5);
});

test('高频守护牌只统计近 30 天，边界内包含、边界外排除', () => {
    const inside = record({
        time: new Date(CUTOFF).toISOString(),
        cards: [{ name: '正位·星星' }, { name: '正位·星星' }]
    });
    const outside = record({
        time: new Date(CUTOFF - 1).toISOString(),
        cards: [
            { name: '逆位·月亮' }, { name: '逆位·月亮' }, { name: '逆位·月亮' },
            { name: '逆位·月亮' }, { name: '逆位·月亮' }
        ]
    });
    const stats = statsOf([inside, outside]);
    assert.equal(stats.totalReadings, 2);
    assert.equal(stats.totalCards, 7);
    assert.equal(stats.guardian.name, '星星', '边界外的 5 次月亮不应成为守护牌');
    assert.equal(stats.guardian.count, 2);
    assert.equal(stats.elements.find(element => element.key === 'spirit').count, 7);
});

test('全正位与全逆位分别得到 0% 与 100% 逆位比例', () => {
    const upright = statsOf([record({
        cards: [{ name: '正位·星星' }, { name: '正位·太阳' }, { name: '正位·权杖王牌' }]
    })]);
    assert.equal(upright.reversedCards, 0);
    assert.equal(upright.reversalRate, 0);

    const reversed = statsOf([record({
        cards: [{ name: '逆位·星星' }, { name: '逆位·太阳' }, { name: '逆位·权杖王牌' }]
    })]);
    assert.equal(reversed.reversedCards, 3);
    assert.equal(reversed.reversalRate, 1);
});

test('行动转化率只统计已设行动的档案，完成复盘看结论或文字', () => {
    const stats = statsOf([
        record({ action: '行动一', review: { outcome: 'helpful', text: '' } }),
        record({ action: '行动二', review: { outcome: '', text: '后来确实发生了' } }),
        record({ action: '行动三', review: { outcome: '', text: '' } }),
        record({ action: '', review: { outcome: 'helpful', text: '未设行动不算分母' } })
    ]);
    assert.deepEqual({ ...stats.action }, { withAction: 3, completed: 2, rate: 2 / 3 });
});

test('兼容旧版字符串牌面与未知牌名，不抛异常', () => {
    const stats = statsOf([record({
        cards: ['正位·星星', '逆位·月亮', { name: '正位·不存在的牌' }, { name: '逆位·不存在的牌' }]
    })]);
    assert.equal(stats.totalCards, 4);
    assert.equal(stats.reversedCards, 2);
    assert.equal(stats.elements.find(element => element.key === 'spirit').count, 2);
    assert.equal(stats.guardian.name, '不存在的牌');
    assert.equal(stats.guardian.count, 2);
});

test('牌名解析覆盖正位、逆位、纯牌名与对象格式', () => {
    assert.deepEqual({ ...parseCardName('正位·星星') }, { name: '星星', reversed: false });
    assert.deepEqual({ ...parseCardName('逆位·月亮') }, { name: '月亮', reversed: true });
    assert.deepEqual({ ...parseCardName('太阳') }, { name: '太阳', reversed: false });
    assert.deepEqual({ ...parseCardName({ name: '星星', orientation: 'reversed' }) }, { name: '星星', reversed: true });
    assert.deepEqual({ ...parseCardName(null) }, { name: '', reversed: false });
});