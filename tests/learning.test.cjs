'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ['cards.js', 'features.js', 'learning.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}

const { ALL_TAROT_CARDS } = sandbox.window.TarotCards;
const { LEARNING } = sandbox.window.TarotLearning;
const { getLearningEntry } = sandbox.window.TarotFeatures;

test('牌义学习内容覆盖全部 78 张牌且 ID 与 cards.js 一致', () => {
    assert.equal(Object.keys(LEARNING).length, 78);
    assert.equal(
        Object.keys(LEARNING).sort().join(','),
        ALL_TAROT_CARDS.map(card => card.id).sort().join(',')
    );
    for (const card of ALL_TAROT_CARDS) {
        const content = LEARNING[card.id];
        assert.ok(content, `${card.id} 缺少学习内容`);
        for (const field of ['symbolism', 'misconception', 'question']) {
            assert.equal(typeof content[field], 'string', `${card.id}.${field} 应为字符串`);
            assert.ok(content[field].trim().length >= 8, `${card.id}.${field} 内容过短`);
        }
    }
});

test('学习条目从 cards.js 读取正逆位关键词，不在学习文件里复制一份', () => {
    const sample = ALL_TAROT_CARDS.find(card => card.id === 'm10');
    const entry = getLearningEntry(sample, LEARNING.m10);
    assert.equal(entry.id, 'm10');
    assert.equal(entry.name, '命运之轮');
    assert.equal(entry.upright, sample.upright);
    assert.equal(entry.reversed, sample.reversed);
    assert.equal(entry.symbolism, LEARNING.m10.symbolism);
    assert.equal(entry.misconception, LEARNING.m10.misconception);
    assert.equal(entry.question, LEARNING.m10.question);
});

test('学习内容不把逆位直接等同于坏结果，并保留非决定论语气', () => {
    const forbidden = /逆位(?:一定|必然|就是|代表)(?:坏|失败|厄运|灾难)/;
    for (const [id, content] of Object.entries(LEARNING)) {
        const text = `${content.symbolism}${content.misconception}${content.question}`;
        assert.ok(!forbidden.test(text), `${id} 出现逆位决定论表达`);
        assert.ok(!/必然发生|命中注定|一定会/.test(text), `${id} 出现宿命式断言`);
    }
});

test('学习条目缺失时回退到牌库意象而不是空白', () => {
    const card = ALL_TAROT_CARDS.find(item => item.id === 'w01');
    const entry = getLearningEntry(card, null);
    assert.equal(entry.symbolism, card.poetic_desc);
    assert.ok(entry.misconception && entry.question);
    assert.equal(getLearningEntry(null, {}), null);
});