/**
 * 星见塔罗的可测试产品配置与普通脚本工具。
 * 不访问 DOM，也不发起网络请求；file:// 离线模式同样可用。
 */
(function () {
'use strict';

const position = (id, name, english, guidance) => ({ id, name, english, guidance });

// 备份文件格式标识：app 必须一致，version 不得高于当前应用支持的版本。
const IMPORT_APP = 'xingjian-tarot';
const IMPORT_VERSION = 2;

const SPREADS = {
    single: {
        id: 'single', name: '灵光快占', english: 'ONE CARD INSIGHT',
        description: '一张牌，抓住问题最核心的启示',
        positions: [position('insight', '核心启示', 'CORE INSIGHT', '这个问题当下最值得看见的重点与可采取的行动')]
    },
    decision: {
        id: 'decision', name: '二择一', english: 'TWO PATHS',
        description: '看清当下，以及 A、B 两条路各自的能量',
        positions: [
            position('current', '当前处境', 'WHERE YOU STAND', '求问者做选择时的真实处境与核心需求'),
            position('optionA', '选择 A', 'PATH A', '第一条道路的能量、机会、代价与发展倾向，不替求问者做决定'),
            position('optionB', '选择 B', 'PATH B', '第二条道路的能量、机会、代价与发展倾向，不替求问者做决定')
        ]
    },
    trinity: {
        id: 'trinity', name: '圣三角', english: 'PAST · PRESENT · FUTURE',
        description: '沿过去、现在与未来梳理完整的能量轨迹',
        positions: [
            position('past', '过去的影响', 'PAST ENERGY', '问题的根源、已经形成的经验与过去留下的影响'),
            position('present', '现状的投影', 'PRESENT REALITY', '当下真实的局面、阻碍与可以调用的力量'),
            position('future', '未来的指引', 'FUTURE GUIDANCE', '沿当前趋势发展的可能性与下一步建议，而非确定预言')
        ]
    },
    celtic: {
        id: 'celtic', name: '凯尔特十字', english: 'CELTIC CROSS',
        description: '十张牌，深入拆解复杂问题的全貌',
        positions: [
            position('heart', '问题核心', 'THE HEART', '局势的中心与求问者当前最主要的议题'),
            position('crossing', '交叉阻碍', 'THE CROSSING', '横在面前的挑战、矛盾或助力'),
            position('foundation', '深层根基', 'THE FOUNDATION', '潜意识根源、过去形成的基础与深层动因'),
            position('recentPast', '正在远去', 'THE RECENT PAST', '正在消退的过去影响'),
            position('possibility', '显意识目标', 'THE CROWN', '求问者意识到目标、期待或最好的可能'),
            position('nearFuture', '即将来临', 'THE NEAR FUTURE', '接下来一段时间的趋势与临近变化'),
            position('self', '自我姿态', 'THE SELF', '求问者看待自己及处理局势的方式'),
            position('environment', '外在环境', 'THE ENVIRONMENT', '他人、关系及外部环境带来的影响'),
            position('hopesFears', '希望与恐惧', 'HOPES & FEARS', '内心期待与担忧如何共同塑造选择'),
            position('outcome', '综合走向', 'THE OUTCOME', '整合前九张牌后的潜在结果与转化方向，不作宿命式断言')
        ]
    },
    daily: {
        id: 'daily', name: '每日一抽', english: 'CARD OF THE DAY',
        description: '今天的主题、提醒与一件可以践行的小事',
        positions: [position('dailyInsight', '今日指引', 'DAILY GUIDANCE', '今日值得留意的能量、可能遇见的情境和具体的小行动')]
    }
};

const CATEGORY_NAMES = { love: '感情', career: '事业', fortune: '运势', general: '灵性' };

function localDayKey(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isValidSpread(id) {
    return Object.prototype.hasOwnProperty.call(SPREADS, id) && id !== 'daily';
}

// 追问只携带最近的完整问答轮次，并限制上下文字符数。
// 避免聊天轮次增长后撞上代理的消息条数 / 总长度上限，之后每次追问都失败。
function selectRecentChatMessages(history, maxMessages = 24, maxChars = 12000) {
    if (!Array.isArray(history) || maxMessages < 1 || maxChars < 1) return [];
    const selected = [];
    let usedChars = 0;
    for (let end = history.length; end > 0 && selected.length < maxMessages; end -= 2) {
        const pair = history.slice(Math.max(0, end - 2), end);
        const pairChars = pair.reduce((sum, message) => sum + (Array.isArray(message.content)
            ? message.content.reduce((n, item) => n + String(item.text || '').length, 0)
            : 0), 0);
        if (usedChars + pairChars > maxChars) break;
        selected.unshift(...pair);
        usedChars += pairChars;
    }
    return selected;
}

// 全站唯一的高危词表。
// 安全路由（getSafetyRoute）与报告里的「专业领域免责声明」都从这里取，
// app.js 不再维护第二份口径不同的副本。危机词尽量使用明确短语，
// 避免把“笑死”“累死了”等普通表达误判为自伤风险。
const CRISIS_PATTERN = /自杀|轻生|自残|伤害自己|结束(?:自己的)?生命|不想活了|活不下去|不想继续活|寻死|想从.*跳下去/i;
const HIGH_STAKES_PATTERN = /医|病|癌|绝症|伤残|官司|起诉|法院|律师|判刑|股票|基金|借贷|投资|买币|理财|虚拟币|杠杆|赔偿/i;

function getSafetyRoute(text) {
    const value = String(text || '');
    if (CRISIS_PATTERN.test(value)) return 'crisis';
    if (HIGH_STAKES_PATTERN.test(value)) return 'high-stakes';
    return 'general';
}

function getReviewState(record, now) {
    if (!record || !record.reviewAt || !Number.isFinite(Date.parse(record.reviewAt))) return 'none';
    const review = record.review || {};
    if (review.outcome || String(review.text || '').trim()) return 'completed';
    const current = now instanceof Date ? now : new Date(now || Date.now());
    return Date.parse(record.reviewAt) <= current.getTime() ? 'due' : 'upcoming';
}

function filterHistory(records, options) {
    if (!Array.isArray(records)) return [];
    const opts = options || {};
    const query = String(opts.query || '').trim().toLocaleLowerCase();
    return records.filter(item => {
        if (opts.category && opts.category !== 'all' && item.category !== opts.category) return false;
        if (opts.review && opts.review !== 'all' && getReviewState(item, opts.now) !== opts.review) return false;
        if (!query) return true;
        const sections = item.sections || {};
        const haystack = [
            item.question, item.spread, item.note, item.action,
            item.review && item.review.text,
            ...(item.cards || []).map(card => typeof card === 'string' ? card : `${card.position} ${card.name}`),
            ...(sections.positions || []).map(position => `${position.name} ${position.text}`),
            sections.synthesis, sections.blessing, item.synthesis, item.blessing
        ].join(' ').toLocaleLowerCase();
        return haystack.includes(query);
    });
}

// 按 Unicode 码点截断，避免把 emoji 等代理对切成孤立的高/低代理项。
// String.prototype.slice 按 UTF-16 码元计数，正好切在代理对中间时会产出乱码。
function truncateCodePoints(value, max) {
    const text = String(value == null ? '' : value);
    const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : text.length;
    if (text.length <= limit) return text;
    return Array.from(text).slice(0, limit).join('');
}

function cleanText(value, max) {
    return truncateCodePoints(value, max);
}

// 学习页只补充人工维护的象征、误区与观察问题；
// 牌名与正逆位关键词始终从 cards.js 取，避免两处内容漂移。
function getLearningEntry(card, extra) {
    if (!card || !card.id) return null;
    const content = extra && typeof extra === 'object' ? extra : {};
    return {
        id: card.id,
        name: card.name,
        english: card.english,
        upright: card.upright,
        reversed: card.reversed,
        symbolism: cleanText(content.symbolism || card.poetic_desc, 500),
        misconception: cleanText(content.misconception || '任何单张牌都不能替代现实信息；请把它当作观察角度，而不是结论。', 300),
        question: cleanText(content.question || '这张牌让我注意到自己哪一部分真实感受？', 300)
    };
}

// 小阿卡纳的牌义在 cards.js 中以整句保存；展示、解读与分享统一切成短关键词，
// 避免「关键词」标签下出现整段散文，也避免分享文案把整句当作一个线索。
function keywordList(value, max = 6) {
    return String(value == null ? '' : value)
        .split(/[、，,;；]/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, max)
        .join('、');
}

// 只接收本应用认识的字段，并限制数量和长度。渲染仍统一使用 textContent，
// 这里的白名单同时避免异常备份把任意对象或超大数据写进 localStorage。
function prepareHistoryImport(input) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
        if (input.app !== undefined && input.app !== IMPORT_APP) {
            return { records: [], rejected: 1, duplicates: 0, incompatible: true, reason: '这个文件不是星见塔罗导出的备份，无法导入。' };
        }
        if (Number.isFinite(Number(input.version)) && Number(input.version) > IMPORT_VERSION) {
            return { records: [], rejected: 1, duplicates: 0, incompatible: true, reason: '备份来自更新版本的应用，请先升级后再导入。' };
        }
    }
    const source = Array.isArray(input) ? input : (input && Array.isArray(input.history) ? input.history : null);
    if (!source) return { records: [], rejected: 1, duplicates: 0 };
    let rejected = 0;
    let duplicates = 0;
    const records = [];
    const seenIds = new Set();
    for (const item of source.slice(0, 200)) {
        if (!item || typeof item !== 'object' || !Number.isFinite(Date.parse(item.time))) {
            rejected++;
            continue;
        }
        if (!String(item.question || '').trim() && !String(item.spread || '').trim()) {
            rejected++;
            continue;
        }
        const sections = item.sections && typeof item.sections === 'object' ? item.sections : {};
        const review = item.review && typeof item.review === 'object' ? item.review : {};
        const outcome = ['helpful', 'unhelpful', 'unclear'].includes(review.outcome) ? review.outcome : '';
        const feedback = ['helpful', 'unhelpful'].includes(item.feedback) ? item.feedback : '';
        const id = cleanText(item.id, 100) || `imported-${Date.now()}-${records.length}`;
        if (seenIds.has(id)) {
            duplicates++;
            continue;
        }
        seenIds.add(id);
        const spreadId = cleanText(item.spreadId, 40);
        records.push({
            id,
            time: new Date(item.time).toISOString(),
            question: cleanText(item.question, 200),
            category: Object.prototype.hasOwnProperty.call(CATEGORY_NAMES, item.category) ? item.category : 'general',
            spreadId,
            spread: cleanText(item.spread, 80),
            dailyDate: spreadId === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(item.dailyDate || '') ? item.dailyDate : undefined,
            ai: Boolean(item.ai),
            cards: (Array.isArray(item.cards) ? item.cards : []).slice(0, 20).map(card => typeof card === 'string'
                ? { position: '', name: cleanText(card, 120) }
                : { position: cleanText(card && card.position, 100), name: cleanText(card && card.name, 120) }
            ).filter(card => card.position || card.name),
            sections: {
                positions: (Array.isArray(sections.positions) ? sections.positions : []).slice(0, 20).map(position => ({
                    name: cleanText(position && position.name, 100),
                    text: cleanText(position && position.text, 2000)
                })),
                synthesis: cleanText(sections.synthesis || item.synthesis, 2000),
                blessing: cleanText(sections.blessing || item.blessing, 1000)
            },
            action: cleanText(item.action, 500),
            reviewAt: Number.isFinite(Date.parse(item.reviewAt)) ? new Date(item.reviewAt).toISOString() : null,
            note: cleanText(item.note, 2000),
            review: {
                outcome,
                text: cleanText(review.text, 2000),
                updatedAt: Number.isFinite(Date.parse(review.updatedAt)) ? new Date(review.updatedAt).toISOString() : null
            },
            feedback
        });
    }
    if (source.length > 200) rejected += source.length - 200;
    return { records: records.slice(0, 50), rejected, overLimit: Math.max(0, records.length - 50), duplicates };
}

window.TarotFeatures = {
    SPREADS, CATEGORY_NAMES, localDayKey, isValidSpread, selectRecentChatMessages,
    getSafetyRoute, getReviewState, filterHistory, prepareHistoryImport, getLearningEntry,
    keywordList, CRISIS_PATTERN, HIGH_STAKES_PATTERN, truncateCodePoints
};
})();
