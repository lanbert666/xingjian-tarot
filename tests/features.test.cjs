'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ['cards.js', 'features.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}
const { ALL_TAROT_CARDS } = sandbox.window.TarotCards;
const {
    SPREADS, localDayKey, isValidSpread, selectRecentChatMessages,
    getSafetyRoute, getReviewState, filterHistory, prepareHistoryImport, truncateCodePoints
} = sandbox.window.TarotFeatures;
const { classifyStorageError } = sandbox.window.TarotFeatures;

test('牌库完整且 id 不重复', () => {
    assert.equal(ALL_TAROT_CARDS.length, 78);
    assert.equal(new Set(ALL_TAROT_CARDS.map(card => card.id)).size, 78);
});

test('四种可选牌阵的张数和位置正确', () => {
    const expected = { single: 1, decision: 3, trinity: 3, celtic: 10 };
    assert.deepEqual(Object.keys(expected).filter(isValidSpread), Object.keys(expected));
    for (const [id, count] of Object.entries(expected)) {
        assert.equal(SPREADS[id].positions.length, count);
        assert.equal(new Set(SPREADS[id].positions.map(position => position.id)).size, count);
        for (const position of SPREADS[id].positions) {
            assert.ok(position.name && position.english && position.guidance);
        }
    }
});

test('每日牌阵独立且不作为普通问题牌阵', () => {
    assert.equal(SPREADS.daily.positions.length, 1);
    assert.equal(isValidSpread('daily'), false);
    assert.equal(isValidSpread('__proto__'), false);
});

test('连续天数使用本地日历日期而非 UTC 日期', () => {
    assert.equal(localDayKey(new Date(2026, 9, 28, 0, 1)), '2026-10-28');
    assert.equal(localDayKey(new Date(2026, 9, 28, 23, 59)), '2026-10-28');
    assert.equal(localDayKey(new Date(2026, 0, 3)), '2026-01-03');
});


function recentChatMessages(...args) {
    return [...selectRecentChatMessages(...args)];
}

function chatMessage(role, text) {
    return { role, content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }] };
}

test('追问历史裁剪能安全处理空值与非数组', () => {
    assert.deepEqual(recentChatMessages([]), []);
    assert.deepEqual(recentChatMessages(null), []);
    assert.deepEqual(recentChatMessages('not an array'), []);
});

test('追问历史只保留最近完整轮次并限制上下文字符数', () => {
    const history = Array.from({ length: 40 }, (_, index) => chatMessage(index % 2 ? 'assistant' : 'user', `message-${index}`));
    const recent = recentChatMessages(history);
    assert.equal(recent.length, 24);
    assert.deepEqual(recent, history.slice(-24));

    const mixedLength = [
        chatMessage('user', 'old-question'),
        chatMessage('assistant', 'old-answer'),
        chatMessage('user', 'new'),
        chatMessage('assistant', 'reply')
    ];
    assert.deepEqual(recentChatMessages(mixedLength, 24, 8), mixedLength.slice(-2));
    assert.deepEqual(recentChatMessages(mixedLength.slice(-2), 24, 4), []);
});

test('安全路由识别明确危机且不误判普通夸张表达', () => {
    assert.equal(getSafetyRoute('我不想活了'), 'crisis');
    assert.equal(getSafetyRoute('我想伤害自己'), 'crisis');
    assert.equal(getSafetyRoute('今天上班累死了'), 'general');
    assert.equal(getSafetyRoute('死神牌是不是不吉利'), 'general');
    assert.equal(getSafetyRoute('我该买哪只股票'), 'high-stakes');
    assert.equal(getSafetyRoute('我该如何和伴侣沟通'), 'general');
});

test('复盘状态按提醒日期与复盘内容计算', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    assert.equal(getReviewState({}, now), 'none');
    assert.equal(getReviewState({ reviewAt: '2026-10-20T00:00:00Z' }, now), 'due');
    assert.equal(getReviewState({ reviewAt: '2026-11-01T00:00:00Z' }, now), 'upcoming');
    assert.equal(getReviewState({ reviewAt: '2026-10-20T00:00:00Z', review: { outcome: 'helpful' } }, now), 'completed');
    assert.equal(getReviewState({ reviewAt: 'invalid' }, now), 'none');
});

test('档案搜索覆盖问题、牌面、行动和笔记并支持组合筛选', () => {
    const records = [
        { id: '1', question: '关系如何沟通', category: 'love', cards: [{ name: '正位·恋人' }], note: '先倾听', reviewAt: '2026-10-01T00:00:00Z' },
        { id: '2', question: '职业选择', category: 'career', action: '整理优缺点', sections: { synthesis: '保持耐心' }, reviewAt: '2026-12-01T00:00:00Z' }
    ];
    assert.equal(filterHistory(records, { query: '恋人' }).length, 1);
    assert.equal(filterHistory(records, { query: '优缺点' })[0].id, '2');
    assert.equal(filterHistory(records, { query: '倾听', category: 'love' })[0].id, '1');
    assert.equal(filterHistory(records, { review: 'due', now: new Date('2026-10-28T00:00:00Z') })[0].id, '1');
    assert.deepEqual([...filterHistory(null, {})], []);
});

test('备份导入采用字段白名单、限制内容并拒绝异常结构', () => {
    const valid = {
        id: 'a', time: '2026-10-01T00:00:00.000Z', question: '测试问题', category: 'love', spread: '灵光快占',
        cards: [{ position: '核心', name: '正位·星星' }], sections: { positions: [], synthesis: '解读', blessing: '祝福' },
        action: '一步', reviewAt: '2026-10-08T00:00:00.000Z', review: { outcome: 'helpful', text: '有收获' }, feedback: 'helpful', unexpected: 'drop'
    };
    const result = prepareHistoryImport({ history: [valid, null, { time: 'bad', question: '无效' }] });
    assert.equal(result.records.length, 1);
    assert.equal(result.rejected, 2);
    assert.equal(result.records[0].unexpected, undefined);
    assert.equal(result.records[0].review.outcome, 'helpful');
    assert.equal(prepareHistoryImport('not json').rejected, 1);
    assert.deepEqual([...prepareHistoryImport({ history: [] }).records], []);
});

test('备份导入区分「无效记录」与「超出上限的有效记录」', () => {
    const records = Array.from({ length: 52 }, (_, index) => ({
        id: `bulk-${index}`,
        time: '2026-10-01T00:00:00.000Z',
        question: `批量问题 ${index}`,
        spread: '灵光快占'
    }));
    const result = prepareHistoryImport({ history: records });
    assert.equal(result.records.length, 50, '最多保留 50 条');
    assert.equal(result.overLimit, 2, '超出的 2 条是有效记录，不是无效记录');
    assert.equal(result.rejected, 0, '不应把超上限的有效记录算作无效');
});

test('按码点截断不会劈开 emoji 代理对', () => {
    const emoji = '😀';
    // 199 个 BMP 字符 + emoji + 1 个字符：UTF-16 长度 202，码点长度 201。
    const text = 'a'.repeat(199) + emoji + 'b';
    const cut = truncateCodePoints(text, 200);
    assert.equal(Array.from(cut).length, 200);
    assert.equal(cut.endsWith(emoji), true, '第 200 个码点应完整保留 emoji');
    assert.equal(/[\uD800-\uDBFF]$/.test(cut), false, '结尾不能是孤立的高代理项');
    assert.equal(/^[\uDC00-\uDFFF]/.test(cut), false, '开头不能是孤立的低代理项');

    // 边界正好落在 emoji 之前：应直接丢弃 emoji，而不是留下半个代理对。
    const beforeEmoji = truncateCodePoints('a'.repeat(200) + emoji, 200);
    assert.equal(beforeEmoji, 'a'.repeat(200));
    assert.equal(beforeEmoji.length, 200);

    // 导入路径使用同一套码点截断。
    const result = prepareHistoryImport([{
        time: '2026-10-01T00:00:00.000Z',
        question: 'q'.repeat(199) + emoji + 'x',
        spread: '灵光快占'
    }]);
    assert.equal(result.records[0].question.endsWith(emoji), true);
    assert.equal(Array.from(result.records[0].question).length, 200);
});

test('备份导入兼容旧版字符串牌面', () => {
    const result = prepareHistoryImport([{
        time: '2026-10-01T00:00:00.000Z', question: '旧档案', spread: '灵光快占', cards: ['正位·星星']
    }]);
    assert.deepEqual({ ...result.records[0].cards[0] }, { position: '', name: '正位·星星' });
});

// V1.3.1：高危词表收敛为单一导出，避免安全路由与免责声明口径不一致
test('高危词表统一：免责声明与安全路由共用同一份词表', () => {
    const { HIGH_STAKES_PATTERN, CRISIS_PATTERN } = sandbox.window.TarotFeatures;
    // vm 沙箱与测试文件属于不同 realm，instanceof RegExp 会失效，改用鸭子类型判断
    assert.equal(Object.prototype.toString.call(HIGH_STAKES_PATTERN), '[object RegExp]', '应导出 HIGH_STAKES_PATTERN');
    assert.equal(Object.prototype.toString.call(CRISIS_PATTERN), '[object RegExp]', '应导出 CRISIS_PATTERN');

    // 专业领域词：安全路由判为 high-stakes，报告也应附免责声明
    for (const text of ['我该不该投资这只股票', '这个官司能赢吗', '我的病什么时候好', '要不要加杠杆买币']) {
        assert.equal(getSafetyRoute(text), 'high-stakes', text);
        assert.equal(HIGH_STAKES_PATTERN.test(text), true, text);
    }

    // 纯情绪表达不进入专业免责声明（危机由 CRISIS_PATTERN 单独处理）
    assert.equal(HIGH_STAKES_PATTERN.test('我最近很痛苦'), false);
    assert.equal(getSafetyRoute('我最近很痛苦'), 'general');

    // 危机词优先级最高
    assert.equal(getSafetyRoute('我不想活了'), 'crisis');
    assert.equal(CRISIS_PATTERN.test('我不想活了'), true);
});

test('高危词表单一来源：app.js 不再维护第二份敏感词表', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert.ok(!/SENSITIVE_WORDS/.test(source), 'app.js 不应再定义 SENSITIVE_WORDS');
    assert.ok(/HIGH_STAKES_PATTERN\.test\(userQuestion\)/.test(source), 'app.js 应引用统一词表');
});

test('存储错误分类：配额已满', () => {
    assert.equal(classifyStorageError({ name: 'QuotaExceededError' }), 'quota');
    assert.equal(classifyStorageError({ code: 22 }), 'quota');
    assert.equal(classifyStorageError({ code: 1014 }), 'quota');
});

test('存储错误分类：存储不可用或被禁用', () => {
    assert.equal(classifyStorageError({ name: 'SecurityError' }), 'unavailable');
    assert.equal(classifyStorageError({ name: 'NotSupportedError' }), 'unavailable');
});

test('存储错误分类：其它错误归为 other', () => {
    assert.equal(classifyStorageError({ name: 'TypeError', message: 'boom' }), 'other');
    assert.equal(classifyStorageError({ code: 5 }), 'other');
});

test('存储错误分类：null 与 undefined 不抛异常且归为 other', () => {
    assert.doesNotThrow(() => classifyStorageError(null));
    assert.equal(classifyStorageError(null), 'other');
    assert.doesNotThrow(() => classifyStorageError(undefined));
    assert.equal(classifyStorageError(undefined), 'other');
});

test('存储错误分类：普通字符串不抛异常且归为 other', () => {
    assert.doesNotThrow(() => classifyStorageError('QuotaExceededError'));
    assert.equal(classifyStorageError('QuotaExceededError'), 'other');
    assert.equal(classifyStorageError(''), 'other');
});

test('存储错误分类是纯函数：不读取 localStorage 且重复调用结果稳定', () => {
    const sandboxWithoutStorage = { window: {} };
    vm.createContext(sandboxWithoutStorage);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'features.js'), 'utf8'), sandboxWithoutStorage, { filename: 'features.js' });
    const isolated = sandboxWithoutStorage.window.TarotFeatures.classifyStorageError;
    assert.equal(isolated({ name: 'QuotaExceededError' }), 'quota');
    assert.equal(isolated({ name: 'SecurityError' }), 'unavailable');
    const sample = { name: 'QuotaExceededError' };
    assert.equal(classifyStorageError(sample), classifyStorageError(sample));
});
