/**
 * 星见塔罗 —— 星图洞察（纯本地统计，无网络、无 AI 调用）
 *
 * 统计只读取命运档案馆已有的 xingjian_history 记录，牌名与花色全部从 cards.js
 * 的 78 张牌数据派生，不复制第二份牌库。computeStats 不依赖 DOM，可在 Node vm 中单测；
 * render 只在浏览器中调用，负责用纯 SVG 绘制占比条。
 */
(function () {
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY_MS = 24 * 60 * 60 * 1000;
const GUARDIAN_WINDOW_DAYS = 30;

// 四元素 + 大阿卡纳（灵性课题）。花色到元素的映射来自 cards.js 的 suit 字段。
const ELEMENTS = [
    { key: 'fire', label: '火 · 权杖', suit: 'wands', color: '#e08a4b' },
    { key: 'water', label: '水 · 圣杯', suit: 'cups', color: '#5aa9d6' },
    { key: 'air', label: '风 · 宝剑', suit: 'swords', color: '#b491ff' },
    { key: 'earth', label: '土 · 星币', suit: 'pentacles', color: '#7fbf7f' },
    { key: 'spirit', label: '灵性课题', suit: 'major', color: '#dfb73c' }
];
const ELEMENT_BY_SUIT = { wands: 'fire', cups: 'water', swords: 'air', pentacles: 'earth' };

function emptyStats() {
    return {
        totalReadings: 0,
        totalCards: 0,
        reversedCards: 0,
        reversalRate: 0,
        elements: ELEMENTS.map(element => ({ ...element, count: 0, percent: 0 })),
        elementTotal: 0,
        unknownCards: 0,
        guardian: null,
        action: { withAction: 0, completed: 0, rate: 0 }
    };
}

// 档案里的牌面是「正位·星星」这样的字符串，旧备份也可能是纯牌名。
// 统一解析出牌名与正逆位，避免统计逻辑依赖某一种写入格式。
function parseCardName(value) {
    if (value && typeof value === 'object') {
        const name = String(value.name || '');
        return {
            name: name.replace(/^(正位|逆位)[·・\s]*/, '').trim(),
            reversed: value.orientation === 'reversed' || /^逆位/.test(name)
        };
    }
    const text = String(value == null ? '' : value).trim();
    return {
        name: text.replace(/^(正位|逆位)[·・\s]*/, '').trim(),
        reversed: /^逆位/.test(text)
    };
}

function buildCardIndex(cards) {
    const index = new Map();
    for (const card of Array.isArray(cards) ? cards : []) {
        if (card && card.name) index.set(card.name, card);
    }
    return index;
}

function hasReview(record) {
    const review = record && record.review;
    return Boolean(review && (review.outcome || String(review.text || '').trim()));
}

function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return String(Math.round(number * 10) / 10);
}

function computeStats(records, options) {
    const list = Array.isArray(records) ? records : [];
    const opts = options || {};
    const index = buildCardIndex(opts.cards);
    const now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
    const nowTime = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
    const cutoff = nowTime - GUARDIAN_WINDOW_DAYS * DAY_MS;
    const counts = {};
    ELEMENTS.forEach(element => { counts[element.key] = 0; });
    const guardianCounts = new Map();
    const guardianLatest = new Map();
    let totalCards = 0;
    let reversedCards = 0;
    let unknownCards = 0;
    let withAction = 0;
    let completed = 0;
    let totalReadings = 0;

    for (const record of list) {
        if (!record || typeof record !== 'object') continue;
        const time = Date.parse(record.time);
        // 统计口径：time 无法解析的记录不进入任何指标，避免总数与牌数/行动数口径不一致。
        if (!Number.isFinite(time)) continue;
        totalReadings++;
        if (String(record.action || '').trim()) {
            withAction++;
            if (hasReview(record)) completed++;
        }
        const inWindow = time >= cutoff && time <= nowTime;
        const entries = Array.isArray(record.cards) ? record.cards : [];
        for (const entry of entries) {
            const parsed = parseCardName(entry);
            if (!parsed.name) continue;
            totalCards++;
            if (parsed.reversed) reversedCards++;
            const card = index.get(parsed.name);
            if (card) {
                if (card.type === 'major') counts.spirit++;
                else if (ELEMENT_BY_SUIT[card.suit]) counts[ELEMENT_BY_SUIT[card.suit]]++;
            } else {
                // 未知牌只进入 totalCards / unknownCards，不进入元素分布，也不参与 elementTotal 分母；
                // 守护牌保留原始牌名，便于用户发现无法识别的旧数据。
                unknownCards++;
            }
            if (inWindow) {
                const key = card ? card.name : parsed.name;
                guardianCounts.set(key, (guardianCounts.get(key) || 0) + 1);
                guardianLatest.set(key, Math.max(guardianLatest.get(key) || 0, time));
            }
        }
    }

    const elementTotal = ELEMENTS.reduce((sum, element) => sum + counts[element.key], 0);
    const elements = ELEMENTS.map(element => ({
        ...element,
        count: counts[element.key],
        percent: elementTotal ? (counts[element.key] / elementTotal) * 100 : 0
    }));

    // 近 30 天出现最多的牌；次数相同取最近出现的一张，再按牌名稳定排序。
    const guardian = [...guardianCounts.entries()]
        .map(([name, count]) => {
            const card = index.get(name);
            return {
                id: card ? card.id : '',
                name,
                english: card ? card.english : '',
                count
            };
        })
        .sort((a, b) => b.count - a.count
            || (guardianLatest.get(b.name) || 0) - (guardianLatest.get(a.name) || 0)
            || a.name.localeCompare(b.name, 'zh-CN'))[0] || null;

    return {
        totalReadings,
        totalCards,
        reversedCards,
        reversalRate: totalCards ? reversedCards / totalCards : 0,
        elements,
        elementTotal,
        unknownCards,
        guardian,
        action: { withAction, completed, rate: withAction ? completed / withAction : 0 }
    };
}

function elementRow(doc, element) {
    const row = doc.createElement('div');
    row.className = 'insight-element';
    const label = doc.createElement('span');
    label.className = 'insight-element-label';
    label.textContent = element.label;

    const bar = doc.createElement('div');
    bar.className = 'insight-bar';
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 8');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const track = doc.createElementNS(SVG_NS, 'rect');
    track.setAttribute('x', '0');
    track.setAttribute('y', '0');
    track.setAttribute('width', '100');
    track.setAttribute('height', '8');
    track.setAttribute('rx', '4');
    track.setAttribute('fill', 'rgba(255, 255, 255, 0.08)');
    const fill = doc.createElementNS(SVG_NS, 'rect');
    fill.setAttribute('x', '0');
    fill.setAttribute('y', '0');
    fill.setAttribute('height', '8');
    fill.setAttribute('rx', '4');
    fill.setAttribute('fill', element.color);
    // 有牌但占比极小时仍留 1.5% 的可见宽度，避免条形完全消失。
    fill.setAttribute('width', String(element.count ? Math.max(1.5, element.percent) : 0));
    svg.append(track, fill);
    bar.appendChild(svg);

    const value = doc.createElement('span');
    value.className = 'insight-element-value';
    value.textContent = `${element.count} 张 · ${formatPercent(element.percent)}%`;
    row.append(label, bar, value);
    return row;
}

function metricCard(doc, title, value, note) {
    const card = doc.createElement('div');
    card.className = 'insight-metric';
    const heading = doc.createElement('span');
    heading.className = 'insight-metric-title';
    heading.textContent = title;
    const strong = doc.createElement('strong');
    strong.className = 'insight-metric-value';
    strong.textContent = value;
    const detail = doc.createElement('small');
    detail.className = 'insight-metric-note';
    detail.textContent = note;
    card.append(heading, strong, detail);
    return card;
}

function render(container, stats) {
    if (!container || !container.ownerDocument) return;
    const doc = container.ownerDocument;
    container.textContent = '';
    const data = stats && typeof stats === 'object' ? stats : emptyStats();

    if (!data.totalReadings) {
        const empty = doc.createElement('p');
        empty.className = 'insights-empty';
        empty.textContent = '完成一次占卜后，这里会长出你的星图';
        container.appendChild(empty);
        return;
    }

    const summary = doc.createElement('p');
    summary.className = 'insights-summary';
    summary.textContent = `已收录 ${data.totalReadings} 次占卜 · ${data.totalCards} 张牌`
        + (data.unknownCards ? `（其中 ${data.unknownCards} 张无法识别，未计入元素分布）` : '');
    container.appendChild(summary);

    const elements = doc.createElement('div');
    elements.className = 'insights-elements';
    const elementsTitle = doc.createElement('h4');
    elementsTitle.textContent = '四元素分布';
    elements.appendChild(elementsTitle);
    data.elements.forEach(element => elements.appendChild(elementRow(doc, element)));
    container.appendChild(elements);

    const grid = doc.createElement('div');
    grid.className = 'insights-grid';
    const guardianTitle = data.guardian && data.guardian.count > 1 ? '高频守护牌' : '近期守护牌';
    grid.append(
        metricCard(doc, guardianTitle,
            data.guardian ? data.guardian.name : '暂无',
            data.guardian ? `近 30 天出现 ${data.guardian.count} 次` : '近 30 天还没有重复出现的守护牌'),
        metricCard(doc, '逆位比例',
            data.totalCards ? `${formatPercent(data.reversalRate * 100)}%` : '—',
            data.totalCards ? `${data.reversedCards} / ${data.totalCards} 张逆位` : '还没有可统计的牌面'),
        metricCard(doc, '行动转化率',
            data.action.withAction ? `${formatPercent(data.action.rate * 100)}%` : '—',
            data.action.withAction
                ? `${data.action.completed} / ${data.action.withAction} 份已设行动的档案完成复盘`
                : '还没有设置行动的档案')
    );
    container.appendChild(grid);
}

window.Xingjian = window.Xingjian || {};
window.Xingjian.insights = {
    ELEMENTS,
    GUARDIAN_WINDOW_DAYS,
    emptyStats,
    parseCardName,
    computeStats,
    render
};
})();