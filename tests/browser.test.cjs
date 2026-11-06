'use strict';

/**
 * 确定性浏览器回归测试。
 *
 * 运行：npm run test:browser
 * 依赖：本机 Chrome/Edge + Node 22（WebSocket 全局可用），不需要 npm install。
 * 不连接真实模型网关：/api/* 由 tests/browser/harness.cjs 的本地 mock 提供。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
    PROJECT_ROOT,
    FIXED_DAY,
    startMockServer,
    launchBrowser,
    createPage,
    importJsonFile,
    importRawFile,
    readLastDownload
} = require('./browser/harness.cjs');

// 性能预算：阈值刻意比实测宽松，避免 CI/机器抖动造成误报；
// 真正要守住的是「首屏不请求牌面」和「新增功能不把首屏体积翻倍」。
// 实测基线（2026-10，无头 Chrome + 本地 mock）：DOMContentLoaded ≈ 130ms，
// 首屏传输 ≈ 490KB，请求 ≈ 12 次。阈值留出约 2~8 倍余量。
const DOM_CONTENT_LOADED_BUDGET_MS = 1000;
// 首屏预算含可访问性修复带来的少量 HTML/JS 增量；仍应显著低于引入牌面资源后的体积。
const FIRST_SCREEN_TRANSFER_BUDGET_BYTES = 520 * 1024;
const FIRST_SCREEN_MAX_REQUESTS = 16;

let mock;
let browser;

test.before(async () => {
    mock = await startMockServer();
    browser = await launchBrowser();
}, { timeout: 30000 });

test.after(async () => {
    if (browser) await browser.close();
    if (mock) await mock.close();
});

async function newPage(t, options = {}) {
    await mock.reset({
        ai: Boolean(options.ai),
        failNext: options.failNext || 0,
        failStatus: options.failStatus || 502,
        retryAfter: options.retryAfter || 0,
        longAi: Boolean(options.longAi),
        usage: options.usage || {},
        delayMs: options.delayMs || 0,
        aiText: options.aiText
    });
    const page = await createPage(browser, {
        url: mock.baseUrl + '/',
        reduceMotion: options.reduceMotion !== false,
        width: options.width || 1280,
        height: options.height || 900,
        mobile: options.mobile || false,
        seedStorage: options.seedStorage || {},
        blockUrls: options.blockUrls || [],
        extraInit: options.extraInit || ''
    });
    t.after(() => page.close());
    return page;
}

function assertClean(page, allowedConsoleErrors = []) {
    assert.deepEqual(page.exceptions, [], `页面出现未捕获异常：${page.exceptions.join('\n')}`);
    const unexpected = page.consoleErrors.filter(text =>
        !allowedConsoleErrors.some(pattern => pattern.test(text))
    );
    assert.deepEqual(unexpected, [], `页面出现控制台错误：${unexpected.join('\n')}`);
}

async function assertNoHorizontalOverflow(page, selectors, label = '') {
    const overflow = await page.eval(`(() => {
        const selectors = ${JSON.stringify(selectors)};
        return selectors.flatMap(selector => {
            const el = document.querySelector(selector);
            if (!el) return [{ selector, missing: true }];
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return [];
            return el.scrollWidth > el.clientWidth + 1
                ? [{ selector, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }]
                : [];
        });
    })()`);
    assert.deepEqual(overflow, [], `${label} 出现横向溢出：${JSON.stringify(overflow)}`);
}

async function waitForCardReady(page, expectedCards = 1) {
    await page.waitFor(`(() => {
        const cards = document.querySelectorAll('#reveal-cards-display .tarot-card-3d');
        if (cards.length !== ${expectedCards}) return false;
        const rect = cards[0].getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    })()`);
}

async function selectSpread(page, spreadId) {
    await page.click(`.spread-option[data-spread="${spreadId}"]`);
}

async function startDraw(page, { question, spread = 'single' } = {}) {
    await page.fill('#user-question', question);
    await selectSpread(page, spread);
    await page.click('#btn-next-step');
    await page.waitFor(() => document.getElementById('step-draw')?.classList.contains('active'));
    await page.waitFor(() => !document.getElementById('btn-auto-draw')?.disabled, 20000);
}

async function autoDrawAndReveal(page, expectedCards) {
    await page.click('#btn-auto-draw');
    await page.waitFor(() => !document.getElementById('btn-go-reveal')?.classList.contains('hidden'), 30000);
    await page.click('#btn-go-reveal');
    await page.waitFor(() => document.getElementById('step-reveal')?.classList.contains('active'));
    await page.waitFor(
        `document.querySelectorAll('#reveal-cards-display .tarot-card-3d').length === ${expectedCards}`,
        10000
    );
    const count = await page.eval(`document.querySelectorAll('#reveal-cards-display .tarot-card-3d').length`);
    for (let index = 0; index < count; index += 1) {
        await page.click('#reveal-cards-display .tarot-card-3d:not(.flipped)');
    }
    await page.waitFor(() => !document.getElementById('reading-report')?.classList.contains('hidden'), 10000);
    await page.waitFor(`document.querySelectorAll('#reading-blocks .reading-block').length >= ${expectedCards + 2}`);
}

async function finishSingleReading(page, question = 'E2E 固定测试问题') {
    await startDraw(page, { question, spread: 'single' });
    await autoDrawAndReveal(page, 1);
}

function historyRecord(overrides = {}) {
    return {
        id: 'e2e-record-1',
        time: '2026-10-27T02:00:00.000Z',
        question: 'E2E 备份问题一',
        category: 'love',
        spreadId: 'single',
        spread: '灵光快占',
        ai: false,
        cards: [{ position: '核心启示', name: '正位·星星' }],
        sections: {
            positions: [{ name: '核心启示', text: 'E2E 备份解读一' }],
            synthesis: 'E2E 备份串联一',
            blessing: 'E2E 备份祝福一'
        },
        action: '',
        reviewAt: null,
        note: '',
        review: { outcome: '', text: '', updatedAt: null },
        feedback: '',
        ...overrides
    };
}

test('普通牌阵：灵光快占生成正确节数且无脚本异常', { timeout: 40000 }, async t => {
    const page = await newPage(t);
    await finishSingleReading(page, 'E2E 灵光快占');
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .reading-block').length`), 3);
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .card-headline').length`), 1);
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .block-title').length`), 3);
    assertClean(page);
});

test('普通牌阵：二择一生成 3 个位置与串联祝福', { timeout: 40000 }, async t => {
    const page = await newPage(t);
    await startDraw(page, { question: 'E2E 二择一', spread: 'decision' });
    await autoDrawAndReveal(page, 3);
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .card-headline').length`), 3);
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .reading-block').length`), 5);
    assert.match(await page.eval(`document.querySelector('#reading-blocks').textContent`), /当前处境/);
    assert.match(await page.eval(`document.querySelector('#reading-blocks').textContent`), /选择 A/);
    assert.match(await page.eval(`document.querySelector('#reading-blocks').textContent`), /选择 B/);
    assertClean(page);
});

test('普通牌阵：圣三角生成 3 个位置与串联祝福', { timeout: 40000 }, async t => {
    const page = await newPage(t);
    await startDraw(page, { question: 'E2E 圣三角', spread: 'trinity' });
    await autoDrawAndReveal(page, 3);
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .card-headline').length`), 3);
    assert.match(await page.eval(`document.querySelector('#reading-blocks').textContent`), /过去的影响/);
    assert.match(await page.eval(`document.querySelector('#reading-blocks').textContent`), /未来的指引/);
    assertClean(page);
});

test('普通牌阵：凯尔特十字生成 10 个位置与串联祝福', { timeout: 60000 }, async t => {
    const page = await newPage(t);
    await startDraw(page, { question: 'E2E 凯尔特十字', spread: 'celtic' });
    await autoDrawAndReveal(page, 10);
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .card-headline').length`), 10);
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .reading-block').length`), 12);
    assert.equal(await page.eval(`document.querySelectorAll('#report-position-links button').length`), 10);
    assert.match(await page.eval(`document.querySelector('#reading-blocks').textContent`), /问题核心/);
    assert.match(await page.eval(`document.querySelector('#reading-blocks').textContent`), /综合走向/);
    assertClean(page);
});

test('file:// 离线模式：不依赖服务器仍可完成抽牌与报告', { timeout: 40000 }, async t => {
    const fileUrl = 'file:///' + path.join(PROJECT_ROOT, 'index.html').replace(/\\/g, '/');
    const page = await createPage(browser, {
        url: fileUrl,
        reduceMotion: true,
        width: 1280,
        height: 900
    });
    t.after(() => page.close());
    await page.waitFor(() => document.readyState === 'complete');
    assert.equal(await page.eval(`location.protocol`), 'file:');
    assert.equal(await page.eval(`window.TarotCardArt && window.TarotCardArt.published`), 78);
    await finishSingleReading(page, 'E2E file 离线模式');
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .card-headline').length`), 1);
    assert.equal(await page.eval(`document.getElementById('ai-status-badge').classList.contains('offline')`), true);
    await page.click('#btn-sound');
    assert.equal(await page.eval(`document.getElementById('btn-sound').getAttribute('aria-pressed')`), 'true', 'file:// 下音效开关也应可用');

    await page.eval(`localStorage.setItem('xingjian_daily', JSON.stringify({
        date: '${FIXED_DAY}', lastDrawDate: '2026-10-27', streak: 1,
        cards: [{ cardId: 'm00', orientation: 'upright' }]
    }))`);
    await page.click('#btn-daily');
    await waitForCardReady(page);
    await page.click('#reveal-cards-display .tarot-card-3d');
    await page.waitFor(() => !document.getElementById('reading-report').classList.contains('hidden'));
    await page.waitFor(() => document.querySelector('.card-front')?.dataset.artStatus === 'loaded', 10000);
    assert.match(await page.eval(`document.querySelector('.card-art').currentSrc`), /^file:\/\/\/.*m00\.webp$/);
    assertClean(page);
});

test('性能预算：首屏 DOMContentLoaded、请求次数与传输体积', { timeout: 40000 }, async t => {
    const page = await newPage(t);
    const metrics = await page.eval(`(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const resources = performance.getEntriesByType('resource').map(entry => ({
            name: entry.name,
            transferSize: entry.transferSize || 0,
            encodedBodySize: entry.encodedBodySize || 0
        }));
        return { protocol: location.protocol, domContentLoaded: nav.domContentLoadedEventEnd || 0, resources };
    })()`);
    const cardRequests = page.requests.filter(item => /\/assets\/cards\/(webp|fallback)\//.test(item.url));
    assert.equal(cardRequests.length, 0,
        `首屏不得请求牌面资源，实际：${cardRequests.map(item => item.url).join(', ')}`);
    assert.ok(metrics.domContentLoaded > 0, '未采集到首屏 DOMContentLoaded 时间');
    assert.ok(metrics.domContentLoaded < DOM_CONTENT_LOADED_BUDGET_MS,
        `首屏 DOMContentLoaded ${metrics.domContentLoaded.toFixed(1)}ms 超出预算 ${DOM_CONTENT_LOADED_BUDGET_MS}ms`);
    const requestCount = metrics.resources.length + 1; // Resource Timing 不含文档本身
    assert.ok(requestCount <= FIRST_SCREEN_MAX_REQUESTS,
        `首屏请求 ${requestCount} 次超出预算 ${FIRST_SCREEN_MAX_REQUESTS} 次：${metrics.resources.map(item => item.name).join(', ')}`);
    if (metrics.protocol !== 'file:') {
        assert.ok(metrics.resources.length > 0, 'http 首屏应能采集 Resource Timing');
        const transfer = metrics.resources.reduce((sum, item) => sum + (item.transferSize || item.encodedBodySize || 0), 0);
        assert.ok(transfer < FIRST_SCREEN_TRANSFER_BUDGET_BYTES,
            `首屏传输 ${(transfer / 1024).toFixed(1)}KB 超出预算 ${FIRST_SCREEN_TRANSFER_BUDGET_BYTES / 1024}KB`);
    }

    // file:// 下 Resource Timing 可能为空：只查请求次数与牌面资源，跳过体积断言。
    const fileUrl = 'file:///' + path.join(PROJECT_ROOT, 'index.html').replace(/\\/g, '/');
    const filePage = await createPage(browser, {
        url: fileUrl,
        reduceMotion: true,
        width: 1280,
        height: 900
    });
    t.after(() => filePage.close());
    await filePage.waitFor(() => document.readyState === 'complete');
    const fileMetrics = await filePage.eval(`(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        return {
            protocol: location.protocol,
            domContentLoaded: nav.domContentLoadedEventEnd || 0,
            resources: performance.getEntriesByType('resource').length
        };
    })()`);
    assert.equal(fileMetrics.protocol, 'file:');
    if (fileMetrics.domContentLoaded > 0) {
        assert.ok(fileMetrics.domContentLoaded < DOM_CONTENT_LOADED_BUDGET_MS,
            `file:// 首屏 DOMContentLoaded ${fileMetrics.domContentLoaded.toFixed(1)}ms 超出预算 ${DOM_CONTENT_LOADED_BUDGET_MS}ms`);
    }
    const fileCardRequests = filePage.requests.filter(item => /\/assets\/cards\/(webp|fallback)\//.test(item.url));
    assert.equal(fileCardRequests.length, 0,
        `file:// 首屏不得请求牌面资源，实际：${fileCardRequests.map(item => item.url).join(', ')}`);
    const fileRequestCount = fileMetrics.resources > 0 ? fileMetrics.resources + 1 : filePage.requests.length;
    assert.ok(fileRequestCount <= FIRST_SCREEN_MAX_REQUESTS,
        `file:// 首屏请求 ${fileRequestCount} 次超出预算 ${FIRST_SCREEN_MAX_REQUESTS} 次`);
    assertClean(page);
    assertClean(filePage);
});

test('星图洞察：打开档案后渲染统计且无脚本异常', { timeout: 40000 }, async t => {
    const page = await newPage(t, {
        seedStorage: {
            xingjian_history: [
                historyRecord({
                    id: 'insight-1',
                    time: '2026-10-27T02:00:00.000Z',
                    cards: [{ position: '核心启示', name: '正位·星星' }],
                    action: '今晚写下三件可控的小事',
                    review: { outcome: 'helpful', text: '确实有帮助', updatedAt: '2026-10-28T00:00:00.000Z' }
                }),
                historyRecord({
                    id: 'insight-2',
                    time: '2026-10-20T02:00:00.000Z',
                    cards: [{ position: '过去的影响', name: '逆位·权杖王牌' }, { position: '未来的指引', name: '正位·圣杯二' }]
                }),
                historyRecord({
                    id: 'insight-3',
                    time: '2026-09-01T02:00:00.000Z',
                    cards: [{ position: '核心启示', name: '正位·宝剑三' }]
                })
            ]
        }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    const insights = await page.eval(`(() => {
        const panel = document.getElementById('insights-panel');
        const body = document.getElementById('insights-body');
        return {
            visible: Boolean(panel && panel.getClientRects().length),
            text: body.textContent,
            bars: body.querySelectorAll('.insight-bar svg rect').length,
            fills: [...body.querySelectorAll('.insight-bar svg rect:nth-child(2)')].map(rect => Number(rect.getAttribute('width'))),
            metrics: body.querySelectorAll('.insight-metric').length,
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth
        };
    })()`);
    assert.equal(insights.visible, true, '星图洞察默认显示');
    assert.match(insights.text, /已收录 3 次占卜 · 4 张牌/);
    assert.match(insights.text, /四元素分布/);
    assert.match(insights.text, /近期守护牌/);
    assert.doesNotMatch(insights.text, /高频守护牌/, '只出现 1 次不应称为高频守护牌');
    assert.match(insights.text, /逆位比例/);
    assert.match(insights.text, /行动转化率/);
    assert.match(insights.text, /星星/, '近 30 天守护牌应来自档案');
    assert.match(insights.text, /近 30 天出现 1 次/);
    assert.match(insights.text, /1 \/ 4 张逆位/);
    assert.match(insights.text, /1 \/ 1 份已设行动的档案完成复盘/);
    assert.deepEqual(insights.fills, [25, 25, 25, 0, 25], 'SVG 占比条宽度应等于元素百分比');
    assert.equal(insights.bars, 10, '五个元素各一条 SVG 底轨与占比条');
    assert.equal(insights.metrics, 3);
    assert.equal(insights.noOverflow, true, '星图洞察不得横向溢出');
    assertClean(page);

    const emptyPage = await newPage(t);
    await emptyPage.click('#btn-history');
    await emptyPage.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    assert.equal(
        await emptyPage.eval(`document.getElementById('insights-body').textContent.trim()`),
        '完成一次占卜后，这里会长出你的星图',
        '空档案应显示引导文案'
    );
    assert.equal(
        await emptyPage.eval(`Boolean(document.getElementById('insights-panel').getClientRects().length)`),
        true,
        '空档案时星图洞察仍默认显示'
    );
    assertClean(emptyPage);
});

test('用量账本：档案馆底部显示本月调用与 token 汇总，file:// 静默隐藏', { timeout: 40000 }, async t => {
    const page = await newPage(t, {
        usage: {
            '2026-10-01': { requests: 2, total_tokens: 1200 },
            '2026-10-28': { requests: 1, total_tokens: 300 },
            '2026-09-30': { requests: 9, total_tokens: 9000 }
        }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('usage-summary').classList.contains('hidden'));
    assert.equal(
        await page.eval(`document.getElementById('usage-summary').textContent`),
        '本月 AI 调用 3 次 · 消耗 1,500 tokens',
        '只汇总本月数据'
    );

    const fileUrl = 'file:///' + path.join(PROJECT_ROOT, 'index.html').replace(/\\/g, '/');
    const filePage = await createPage(browser, {
        url: fileUrl,
        reduceMotion: true,
        width: 1280,
        height: 900
    });
    t.after(() => filePage.close());
    await filePage.waitFor(() => document.readyState === 'complete');
    await filePage.click('#btn-history');
    await filePage.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    assert.equal(
        await filePage.eval(`document.getElementById('usage-summary').classList.contains('hidden')`),
        true,
        'file:// 下用量请求失败时应静默隐藏'
    );
    assert.equal(
        await filePage.eval(`document.getElementById('insights-body').textContent.trim()`),
        '完成一次占卜后，这里会长出你的星图',
        'file:// 下星图洞察也应正常渲染'
    );
    assertClean(page);
    assertClean(filePage);
});

test('音效开关：默认静音、开启后完成一次抽牌且无脚本异常', { timeout: 40000 }, async t => {
    const page = await newPage(t, {
        extraInit: `(() => {
            const Real = window.AudioContext || window.webkitAudioContext;
            window.__audioCreated = 0;
            if (!Real) return;
            const Wrapped = function (...args) { window.__audioCreated++; return new Real(...args); };
            Wrapped.prototype = Real.prototype;
            window.AudioContext = Wrapped;
        })();`
    });
    const soundButton = () => page.eval(`(() => {
        const button = document.getElementById('btn-sound');
        return { pressed: button.getAttribute('aria-pressed'), title: button.title };
    })()`);
    const before = await soundButton();
    assert.equal(before.pressed, 'false', '音效默认静音');
    assert.match(before.title, /减少动态效果/, 'reduce 模式应提示默认关闭原因');
    assert.equal(await page.eval(`window.__audioCreated`), 0, '页面加载时不得创建 AudioContext');

    await page.click('#btn-sound');
    const after = await soundButton();
    assert.equal(after.pressed, 'true');
    assert.equal(await page.eval(`localStorage.getItem('xingjian_sound')`), 'on');
    assert.equal(await page.eval(`window.__audioCreated >= 1`), true, '首次用户手势后才创建 AudioContext');

    await finishSingleReading(page, 'E2E 音效开关');
    assert.equal(await page.eval(`window.Xingjian.audio.isEnabled()`), true);
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .card-headline').length`), 1);

    await page.goto(mock.baseUrl + '/');
    await page.waitFor(() => document.readyState === 'complete');
    assert.equal(await page.eval(`document.getElementById('btn-sound').getAttribute('aria-pressed')`), 'true', '音效开关状态应持久化');
    assert.equal(await page.eval(`window.__audioCreated`), 0, '刷新加载时仍不得创建 AudioContext');
    assertClean(page);
});

test('每日一抽：固定日期与牌面在刷新后保持一致', { timeout: 40000 }, async t => {
    const page = await newPage(t, {
        seedStorage: {
            xingjian_daily: {
                date: FIXED_DAY,
                lastDrawDate: '2026-10-27',
                streak: 4,
                cards: [{ cardId: 'm10', orientation: 'reversed' }]
            }
        }
    });
    await page.click('#btn-daily');
    await waitForCardReady(page);
    await page.click('#reveal-cards-display .tarot-card-3d');
    await page.waitFor(() => !document.getElementById('reading-report')?.classList.contains('hidden'));
    const headline = await page.eval(`document.querySelector('.card-headline').textContent`);
    assert.match(headline, /逆位/);
    assert.match(headline, /命运之轮/);
    assert.match(await page.eval(`document.getElementById('daily-entry-status').textContent`), /连续观星 4 天/);

    await page.goto(mock.baseUrl + '/');
    // 刷新后回看：这张牌已经翻过、档案里也有结果，应直接展示解读，不再要求重复翻牌。
    await page.click('#btn-daily');
    await page.waitFor(() => !document.getElementById('reading-report')?.classList.contains('hidden'), 10000);
    assert.match(await page.eval(`document.querySelector('.card-headline').textContent`), /逆位.*命运之轮/);
    const savedDaily = await page.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]').find(item => item.dailyDate === '${FIXED_DAY}')`);
    assert.ok(savedDaily, '每日一抽应写入当天档案');
    assert.equal(savedDaily.cards[0].name, '逆位·命运之轮');
    assertClean(page);
});

test('每日一抽：揭示页可直接返回首页，回看已翻过的牌不再要求重新翻牌', { timeout: 40000 }, async t => {
    const page = await newPage(t);
    await page.click('#btn-daily');
    await waitForCardReady(page);
    await page.waitFor(() => document.getElementById('step-reveal').classList.contains('active'));
    // 还没翻牌也能直接回首页，不必滚到报告底部找「再启星轨」
    assert.equal(await page.eval(`document.getElementById('btn-reveal-back').offsetParent !== null`), true);
    await page.click('#btn-reveal-back');
    await page.waitFor(() => document.getElementById('step-listen').classList.contains('active'));
    assert.equal(await page.eval(`document.querySelectorAll('#reveal-cards-display .tarot-card-3d').length`), 0);
    assert.equal(await page.eval(`document.getElementById('reading-report').classList.contains('hidden')`), true);

    // 只抽了牌、还没翻过：保留亲手揭牌的仪式感
    await page.click('#btn-daily');
    await waitForCardReady(page);
    await page.waitFor(() => document.getElementById('step-reveal').classList.contains('active'));
    assert.equal(await page.eval(`document.querySelector('.tarot-card-3d').classList.contains('flipped')`), false);

    // 翻开并写入档案后，再回看应直接展示结果
    await page.click('#reveal-cards-display .tarot-card-3d');
    await page.waitFor(() => !document.getElementById('reading-report').classList.contains('hidden'));
    await page.click('#btn-reveal-back');
    await page.waitFor(() => document.getElementById('step-listen').classList.contains('active'));
    await page.click('#btn-daily');
    await page.waitFor(() => !document.getElementById('reading-report').classList.contains('hidden'), 10000);
    assert.match(await page.eval(`document.querySelector('.card-headline').textContent`), /(正位|逆位)/);
    assertClean(page);
});

test('复盘持久化：保存行动与 7 天提醒，刷新后仍可读取', { timeout: 40000 }, async t => {
    const page = await newPage(t);
    await finishSingleReading(page, 'E2E 复盘持久化');
    const action = 'E2E 行动：今晚写下三件可控的小事。';
    await page.fill('#action-input', action);
    await page.eval(`(() => {
        const select = document.getElementById('review-offset');
        select.value = '7';
        select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.click('#btn-save-reflection');
    await page.waitFor(() => document.getElementById('reflection-save-status').textContent.includes('已保存'));
    const saved = await page.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]')[0]`);
    assert.equal(saved.action, action);
    assert.ok(saved.reviewAt, '应保存复盘日期');
    assert.match(saved.reviewAt, /^2026-11-04/);

    await page.goto(mock.baseUrl + '/');
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    await page.click('.history-item');
    const persisted = await page.eval(`document.querySelector('.history-reflection textarea').value`);
    assert.equal(persisted, action);
    assert.match(await page.eval(`document.querySelector('.history-item .h-review').textContent`), /未到复盘日/);
    assertClean(page);
});

test('AI 重试：失败后重试更新同一条档案而不是新增记录', { timeout: 50000 }, async t => {
    const page = await newPage(t, { ai: true, failNext: 1 });
    await page.waitFor(() => document.getElementById('ai-status-badge').classList.contains('online'));
    await finishSingleReading(page, 'E2E AI 重试');
    await page.waitFor(() => !document.getElementById('btn-ai-retry').classList.contains('hidden'), 10000);
    const before = await page.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]')`);
    assert.equal(before.length, 1);
    assert.equal(before[0].ai, false);
    const originalId = before[0].id;

    await page.click('#btn-ai-retry');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    const after = await page.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]')`);
    assert.equal(after.length, 1, 'AI 重试不得新增档案');
    assert.equal(after[0].id, originalId, 'AI 重试应更新同一条档案');
    assert.equal(after[0].ai, true);
    assert.match(after[0].sections.synthesis, /E2E-MOCK-SYNTHESIS/);
    assert.equal(mock.state.chatCalls, 2);
    // 第一次 AI 请求由 mock 固定返回 502，浏览器会为此打印一条资源加载错误。
    assertClean(page, [/Failed to load resource: the server responded with a status of 502/]);
});

test('匿名分享：图片预览与自动配文不泄露原始问题，完整模式才显示', { timeout: 40000 }, async t => {
    const page = await newPage(t);
    const question = 'E2E-UNIQUE-QUESTION-不要出现在匿名分享里';
    await finishSingleReading(page, question);
    await page.focus('#btn-share-report');
    await page.press('Enter');
    await page.waitFor(() => !document.getElementById('share-panel').classList.contains('hidden'));
    const anonymousPreview = await page.eval(`document.getElementById('share-preview').textContent`);
    const anonymousCaption = await page.eval(`document.getElementById('share-caption').value`);
    assert.ok(!anonymousPreview.includes(question), '匿名分享预览不得包含原始问题');
    assert.ok(!anonymousCaption.includes(question), '匿名分享配文不得包含原始问题');
    assert.match(anonymousPreview, /一份只属于自己的星语/);

    await page.eval(`(() => {
        const radio = document.querySelector('input[name="share-privacy"][value="full"]');
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.ok((await page.eval(`document.getElementById('share-preview').textContent`)).includes(question));
    assert.ok((await page.eval(`document.getElementById('share-caption').value`)).includes(question));

    await page.press('Escape');
    await page.waitFor(() => document.getElementById('share-panel').classList.contains('hidden'));
    assert.equal(await page.eval(`document.activeElement.id`), 'btn-share-report');
    assertClean(page);
});

test('备份导入导出：导出可重新导入，异常文件不修改现有档案', { timeout: 50000 }, async t => {
    const page = await newPage(t, {
        seedStorage: {
            xingjian_history: [
                historyRecord(),
                historyRecord({
                    id: 'e2e-record-2',
                    time: '2026-10-26T02:00:00.000Z',
                    question: 'E2E 备份问题二',
                    category: 'career',
                    cards: [{ position: '核心启示', name: '逆位·隐士' }],
                    sections: {
                        positions: [{ name: '核心启示', text: 'E2E 备份解读二' }],
                        synthesis: 'E2E 备份串联二',
                        blessing: 'E2E 备份祝福二'
                    }
                })
            ]
        }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    await page.click('#btn-history-export');
    await page.waitFor(() => window.__e2e.downloads.length === 1, 5000);
    const exportedText = await readLastDownload(page);
    const exported = JSON.parse(exportedText);
    assert.equal(exported.app, 'xingjian-tarot');
    assert.equal(exported.version, 2);
    assert.equal(exported.history.length, 2);
    assert.equal(exported.history[0].question, 'E2E 备份问题一');

    const importPage = await newPage(t, {
        seedStorage: {
            xingjian_history: [historyRecord({
                id: 'e2e-existing',
                time: '2026-10-25T02:00:00.000Z',
                question: 'E2E 导入前已有档案'
            })]
        }
    });
    await importPage.click('#btn-history');
    await importPage.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    await importJsonFile(importPage, '#history-import-file', exported, 'e2e-backup.json');
    await importPage.waitForText('#toast', '已合并 2 条新档案', 10000);
    assert.equal(await importPage.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]').length`), 3);
    assert.equal(await importPage.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]').some(item => item.id === 'e2e-existing')`), true);

    await importJsonFile(importPage, '#history-import-file', { unexpected: true }, 'bad.json');
    await importPage.waitForText('#toast', '没有找到可导入的有效档案', 10000);
    assert.equal(await importPage.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]').length`), 3);

    await importRawFile(importPage, '#history-import-file', '{not valid json', 'broken.json');
    await importPage.waitForText('#toast', '文件不是有效的 JSON', 10000);
    assert.equal(await importPage.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]').length`), 3);
    assertClean(page);
    assertClean(importPage);
});

test('危机安全路由：不进入抽牌、不发送 AI，关闭后焦点回到触发按钮', { timeout: 30000 }, async t => {
    const page = await newPage(t, { ai: true });
    await page.waitFor(() => document.getElementById('ai-status-badge').classList.contains('online'));
    await page.fill('#user-question', '我不想活了，抽牌告诉我怎么办');
    await page.focus('#btn-next-step');
    await page.press('Enter');
    await page.waitFor(() => !document.getElementById('safety-panel').classList.contains('hidden'));
    assert.equal(await page.eval(`document.getElementById('step-listen').classList.contains('active')`), true);
    assert.equal(await page.eval(`document.getElementById('step-draw').classList.contains('active')`), false);
    assert.equal(await page.eval(`document.activeElement.id`), 'btn-safety-understood');
    assert.equal(mock.state.chatCalls, 0, '危机输入不得发送给 AI');
    assert.equal(await page.eval(`localStorage.getItem('xingjian_history')`), null);
    assert.match(await page.eval(`document.getElementById('safety-panel').textContent`), /120 \/ 110/);

    await page.press('Escape');
    await page.waitFor(() => document.getElementById('safety-panel').classList.contains('hidden'));
    assert.equal(await page.eval(`document.activeElement.id`), 'btn-next-step');
    assertClean(page);
});

test('键盘手动抽牌：牌堆可获得焦点并完成翻牌', { timeout: 40000 }, async t => {
    const page = await newPage(t);
    await startDraw(page, { question: 'E2E 键盘手动抽牌', spread: 'single' });
    await page.focus('.stacked-card');
    await page.press('Enter');
    await page.waitFor(() => document.getElementById('draw-status').textContent.includes('1 / 1'), 10000);
    await page.waitFor(() => !document.getElementById('btn-go-reveal').classList.contains('hidden'), 10000);
    await page.waitFor(() => document.activeElement.id === 'btn-go-reveal', 5000);
    await page.press('Enter');
    await page.waitFor(() => document.getElementById('step-reveal').classList.contains('active'));
    await waitForCardReady(page);
    await page.focus('#reveal-cards-display .tarot-card-3d');
    await page.press('Enter');
    await page.waitFor(() => !document.getElementById('reading-report').classList.contains('hidden'));
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .card-headline').length`), 1);
    assertClean(page);
});

test('360px、键盘流程、弹窗焦点约束与减少动态效果', { timeout: 60000 }, async t => {
    const page = await newPage(t, { width: 360, height: 800, mobile: true, reduceMotion: true });
    assert.equal(await page.eval(`document.documentElement.scrollWidth <= window.innerWidth`), true, '首页不得横向溢出');
    const ringDuration = await page.eval(`getComputedStyle(document.querySelector('.avatar-ring')).animationDuration`);
    const ringSeconds = ringDuration.endsWith('ms') ? parseFloat(ringDuration) / 1000 : parseFloat(ringDuration);
    assert.ok(ringSeconds <= 0.01, `减少动态效果应几乎关闭动画，实际 ${ringDuration}`);

    await page.focus('.spread-option[data-spread="single"]');
    await page.press('Enter');
    await page.click('#user-question');
    await page.send('Input.insertText', { text: 'E2E 键盘流程' });
    await page.pressTab();
    assert.equal(await page.eval(`document.activeElement.id`), 'btn-next-step');
    await page.press('Enter');
    await page.waitFor(() => document.getElementById('step-draw')?.classList.contains('active'));
    await page.waitFor(() => !document.getElementById('btn-auto-draw')?.disabled, 20000);
    assert.equal(
        await page.eval(`document.getElementById('step-draw').contains(document.activeElement)`),
        true,
        '进入抽牌视图后焦点应留在新视图内'
    );

    await page.focus('#btn-auto-draw');
    await page.press('Enter');
    await page.waitFor(() => !document.getElementById('btn-go-reveal')?.classList.contains('hidden'), 30000);
    assert.equal(await page.eval(`document.activeElement.id`), 'btn-go-reveal', '自动抽牌完成后焦点应落在揭示按钮');
    await page.press('Enter');
    await page.waitFor(() => document.getElementById('step-reveal')?.classList.contains('active'));
    await waitForCardReady(page);
    assert.equal(
        await page.eval(`document.getElementById('step-reveal').contains(document.activeElement)`),
        true,
        '进入翻牌视图后焦点应留在新视图内'
    );
    for (let index = 0; index < 4; index++) {
        if (await page.eval(`document.activeElement.classList.contains('tarot-card-3d')`)) break;
        await page.pressTab();
    }
    assert.equal(await page.eval(`document.activeElement.classList.contains('tarot-card-3d')`), true, 'Tab 应能到达卡牌');
    await page.press('Enter');
    await page.waitFor(() => !document.getElementById('reading-report')?.classList.contains('hidden'));
    assert.equal(await page.eval(`document.activeElement.id`), 'reading-report', '报告出现后焦点应移到报告容器');
    assert.equal(await page.eval(`document.getElementById('particle-layer').children.length`), 0, '减少动态效果时不应生成粒子');
    await assertNoHorizontalOverflow(page, ['#reading-report', '.ai-chat-input-row', '#reading-blocks'], '360px 报告');

    await page.click('#action-input');
    await page.send('Input.insertText', { text: 'E2E 键盘保存行动' });
    await page.pressTab();
    await page.pressTab();
    assert.equal(await page.eval(`document.activeElement.id`), 'btn-save-reflection');
    await page.press('Enter');
    await page.waitFor(() => document.getElementById('reflection-save-status').textContent.includes('已保存'));

    await page.focus('#btn-history');
    await page.press('Enter');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    assert.equal(await page.eval(`document.getElementById('history-panel').contains(document.activeElement)`), true);
    const mobileHistoryLayout = await page.eval(`(() => {
        const list = document.getElementById('history-list');
        const insights = document.getElementById('insights-panel');
        return {
            listHeight: list.getBoundingClientRect().height,
            insightsVisible: Boolean(insights && insights.getClientRects().length),
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth
        };
    })()`);
    assert.ok(mobileHistoryLayout.listHeight > 0,
        `洞察面板不应压扁档案列表，实际列表高度 ${mobileHistoryLayout.listHeight}px`);
    assert.equal(mobileHistoryLayout.insightsVisible, true, '窄屏下星图洞察仍默认显示');
    assert.equal(mobileHistoryLayout.noOverflow, true, '档案页不得横向溢出');
    for (let index = 0; index < 18; index++) {
        await page.pressTab();
        assert.equal(
            await page.eval(`document.getElementById('history-panel').contains(document.activeElement)`),
            true,
            `第 ${index + 1} 次 Tab 后焦点不应离开弹窗`
        );
    }
    assert.equal(await page.eval(`document.documentElement.scrollWidth <= window.innerWidth`), true, '档案弹窗不得横向溢出');
    await page.press('Escape');
    await page.waitFor(() => document.getElementById('history-panel').classList.contains('hidden'));
    assert.equal(await page.eval(`document.activeElement.id`), 'btn-history');
    assertClean(page);
});

test('320px：AI 追问输入行不横向溢出，发送按钮可真实点击', { timeout: 50000 }, async t => {
    const page = await newPage(t, { ai: true, width: 320, height: 568, mobile: true });
    await finishSingleReading(page, 'E2E 320px 追问');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    await assertNoHorizontalOverflow(
        page,
        ['#reading-report', '.ai-chat-input-row', '#reading-blocks'],
        '320px 报告'
    );
    const before = mock.state.chatCalls;
    await page.fill('#ai-chat-input', 'E2E 320px 追问消息');
    await page.click('#ai-chat-send');
    await page.waitFor(() => document.querySelectorAll('#ai-chat-messages .ai-msg').length >= 2, 10000);
    assert.equal(mock.state.chatCalls, before + 1, '真实点击发送按钮应触发一次 AI 请求');
    assert.equal(await page.eval(`document.getElementById('ai-chat-input').value`), '');
    assertClean(page);
});

test('正常动态效果下仍可完成一次抽牌与阅读', { timeout: 40000 }, async t => {
    const page = await newPage(t, { reduceMotion: false });
    await finishSingleReading(page, 'E2E 正常动效');
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .card-headline').length`), 1);
    assertClean(page);
});

test('牌义学习页：78 张牌、分组筛选、关键词一致与焦点管理', { timeout: 40000 }, async t => {
    const page = await newPage(t, { width: 360, height: 800, mobile: true });
    await page.focus('#btn-learning');
    await page.press('Enter');
    await page.waitFor(() => !document.getElementById('learning-panel').classList.contains('hidden'));
    assert.equal(await page.eval(`document.activeElement.id`), 'learning-search');
    assert.equal(await page.eval(`document.querySelectorAll('#learning-list details.learning-card').length`), 78);
    assert.match(await page.eval(`document.getElementById('learning-count').textContent`), /78 \/ 78/);
    // 纵向布局回归：列表是高度受限的 flex 列容器，卡片一旦被 flex-shrink 压扁，
    // 文本仍能读到（只断言 textContent 会漏掉），必须检查实际渲染高度与可滚动性。
    const learningLayout = await page.eval(`(() => {
        const list = document.getElementById('learning-list');
        const card = list.querySelector('details.learning-card');
        return {
            cardHeight: card ? card.getBoundingClientRect().height : 0,
            scrollHeight: list.scrollHeight,
            clientHeight: list.clientHeight
        };
    })()`);
    assert.ok(learningLayout.cardHeight >= 40, `学习卡片高度异常：${learningLayout.cardHeight}px（疑似 flex 塌陷）`);
    assert.ok(learningLayout.scrollHeight > learningLayout.clientHeight, '学习列表应可滚动，而不是把卡片压扁');
    await page.click('#learning-spreads summary');
    const spreadText = await page.eval(`document.getElementById('learning-spreads-body').textContent`);
    assert.match(spreadText, /选择 A/);
    assert.match(spreadText, /未来的指引/);
    assert.match(spreadText, /综合走向/);
    assert.equal(mock.state.chatCalls, 0, '打开学习页不得请求 AI');

    await page.click('[data-learning-filter="major"]');
    assert.equal(await page.eval(`document.querySelectorAll('#learning-list details.learning-card').length`), 22);
    await page.click('[data-learning-filter="court"]');
    assert.equal(await page.eval(`document.querySelectorAll('#learning-list details.learning-card').length`), 16);
    await page.click('[data-learning-filter="wands"]');
    assert.equal(await page.eval(`document.querySelectorAll('#learning-list details.learning-card').length`), 14);
    await page.click('[data-learning-filter="all"]');
    await page.fill('#learning-search', '命运之轮');
    await page.waitFor(() => document.querySelectorAll('#learning-list details.learning-card').length === 1);
    const learning = await page.eval(`(() => {
        const card = window.TarotCards.ALL_TAROT_CARDS.find(item => item.id === 'm10');
        const details = document.getElementById('learning-card-m10');
        details.open = true;
        return {
            upright: card.upright,
            reversed: card.reversed,
            text: details.textContent,
            art: details.querySelector('.learning-art img')?.getAttribute('src') || ''
        };
    })()`);
    assert.ok(learning.text.includes(learning.upright), '学习页正位关键词应来自 cards.js');
    assert.ok(learning.text.includes(learning.reversed), '学习页逆位关键词应来自 cards.js');
    assert.match(learning.text, /核心象征/);
    assert.match(learning.text, /常见误区/);
    assert.match(learning.text, /自我观察问题/);
    assert.match(learning.art, /m10\.webp$/);
    assert.equal(await page.eval(`document.documentElement.scrollWidth <= window.innerWidth`), true, '学习页不得横向溢出');

    await page.press('Escape');
    await page.waitFor(() => document.getElementById('learning-panel').classList.contains('hidden'));
    assert.equal(await page.eval(`document.activeElement.id`), 'btn-learning');
    assertClean(page);
});

test('报告解读依据：逐位展示牌名、位置职责、正逆位和关键词，不额外请求 AI', { timeout: 40000 }, async t => {
    const page = await newPage(t);
    await finishSingleReading(page, 'E2E 解读依据');
    const basis = await page.eval(`(() => {
        const details = document.querySelector('.reading-basis');
        const wasOpen = details.open;
        details.open = true;
        const headline = document.querySelector('.card-headline').textContent;
        const cardName = headline.replace(/^【[^】]+】/, '').split(' (')[0];
        const card = window.TarotCards.ALL_TAROT_CARDS.find(item => item.name === cardName);
        const orientation = headline.startsWith('【正位】') ? 'upright' : 'reversed';
        return {
            wasOpen,
            text: details.textContent,
            headline,
            cardName,
            orientation,
            keyword: document.getElementById('basis-insight-keywords').textContent,
            expectedKeyword: window.TarotFeatures.keywordList(orientation === 'upright' ? card.upright : card.reversed, 6),
            upright: card.upright,
            reversed: card.reversed,
            navCount: document.querySelectorAll('#report-position-links button').length
        };
    })()`);
    assert.equal(basis.wasOpen, false, '解读依据默认不展开');
    assert.match(basis.text, /当前牌/);
    assert.match(basis.text, /位置职责/);
    assert.match(basis.text, /正逆位/);
    assert.match(basis.text, /本次关键词/);
    assert.ok(basis.text.includes(basis.cardName));
    assert.ok(basis.text.includes('这个问题当下最值得看见的重点与可采取的行动'));
    assert.equal(basis.keyword, basis.expectedKeyword);
    assert.equal(basis.navCount, 1);
    assert.equal(mock.state.chatCalls, 0, '展开解读依据不得请求 AI');

    await page.click('#btn-report-reflection');
    assert.equal(await page.eval(`document.activeElement.id`), 'reflection-card');
    await page.click('#btn-report-top');
    assert.equal(await page.eval(`document.activeElement.id`), 'reading-report');
    assertClean(page);
});

test('原创牌面按需加载：只请求当前牌，逆位只旋转图像', { timeout: 40000 }, async t => {
    const page = await newPage(t, {
        seedStorage: {
            xingjian_daily: {
                date: FIXED_DAY,
                lastDrawDate: '2026-10-27',
                streak: 1,
                cards: [{ cardId: 'm00', orientation: 'reversed' }]
            }
        }
    });
    const before = page.requests.filter(item => /\/assets\/cards\/(webp|fallback)\//.test(item.url));
    assert.equal(before.length, 0, '翻牌前不应请求牌面图片');
    await page.click('#btn-daily');
    await waitForCardReady(page);
    await page.click('#reveal-cards-display .tarot-card-3d');
    await page.waitFor(() => !document.getElementById('reading-report').classList.contains('hidden'));
    await page.waitFor(() => document.querySelector('.card-front')?.dataset.artStatus === 'loaded', 10000);
    const art = await page.eval(`(() => {
        const front = document.querySelector('.card-front');
        const image = front.querySelector('.card-art');
        return {
            status: front.dataset.artStatus,
            currentSrc: image.currentSrc,
            naturalWidth: image.naturalWidth,
            reversed: front.classList.contains('is-reversed'),
            name: front.querySelector('.card-name-cn').textContent,
            alt: image.alt,
            manifestAlt: window.TarotCardArt.assets['m00'].alt
        };
    })()`);
    assert.equal(art.status, 'loaded');
    assert.match(art.currentSrc, /m00\.webp$/);
    assert.ok(art.naturalWidth > 0);
    assert.equal(art.reversed, true);
    assert.equal(art.name, '愚人');
    // 回归 V-38：牌面 alt 应使用 manifest 的文案，而不是留空或通用文案
    assert.equal(art.alt, art.manifestAlt, '牌面 alt 应等于 manifest 的 alt');
    assert.match(art.alt, /愚人/);
    const cardRequests = page.requests.filter(item => /\/assets\/cards\/(webp|fallback)\//.test(item.url));
    assert.ok(cardRequests.length >= 1);
    assert.ok(cardRequests.every(item => /\/m00\.(webp|svg)$/.test(item.url)), '只应请求当前牌面');
    assertClean(page);
});

test('牌面加载失败：显示文字回退且不阻断抽牌与报告', { timeout: 40000 }, async t => {
    const page = await newPage(t, {
        blockUrls: ['*assets/cards/webp/*', '*assets/cards/fallback/*'],
        seedStorage: {
            xingjian_daily: {
                date: FIXED_DAY,
                lastDrawDate: '2026-10-27',
                streak: 1,
                cards: [{ cardId: 'm00', orientation: 'upright' }]
            }
        }
    });
    await page.click('#btn-daily');
    await waitForCardReady(page);
    await page.click('#reveal-cards-display .tarot-card-3d');
    await page.waitFor(() => document.querySelector('.card-front')?.dataset.artStatus === 'fallback', 10000);
    assert.match(await page.eval(`document.querySelector('.card-art-fallback').textContent`), /牌面暂时无法加载/);
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .reading-block').length`), 3);
    assert.equal(await page.eval(`!document.getElementById('reading-report').classList.contains('hidden')`), true);
    assertClean(page);
});

test('WebP 加载失败：二择一牌阵自动回退 SVG 牌面，不再显示文字回退', { timeout: 60000 }, async t => {
    // 回归：<picture> 的 <source> 选中 WebP 后，加载失败不会自动回退到 <img src> 的 SVG，
    // 旧实现会直接显示「牌面暂时无法加载」。这里只屏蔽 WebP，SVG 必须顶上。
    const page = await newPage(t, { blockUrls: ['*assets/cards/webp/*'] });
    await startDraw(page, { question: 'E2E 二择一 WebP 回退', spread: 'decision' });
    await autoDrawAndReveal(page, 3);
    await page.waitFor(
        () => [...document.querySelectorAll('#reveal-cards-display .card-front')]
            .every(front => front.dataset.artStatus === 'loaded'),
        15000
    );
    const cards = await page.eval(`(() => [...document.querySelectorAll('#reveal-cards-display .card-front')].map(front => ({
        status: front.dataset.artStatus,
        currentSrc: front.querySelector('.card-art').currentSrc,
        naturalWidth: front.querySelector('.card-art').naturalWidth,
        fallbackHidden: front.querySelector('.card-art-fallback').hidden,
        fallbackText: front.querySelector('.card-art-fallback').textContent.trim()
    })))()`);
    assert.equal(cards.length, 3);
    for (const card of cards) {
        assert.equal(card.status, 'loaded');
        assert.match(card.currentSrc, /\/assets\/cards\/fallback\/[a-z0-9]+\.svg$/);
        assert.ok(card.naturalWidth > 0, 'SVG 牌面应真正解码成功');
        assert.equal(card.fallbackHidden, true, '回退成功时不应显示文字回退');
        assert.doesNotMatch(card.fallbackText, /牌面暂时无法加载/);
    }
    assertClean(page);
});

test('360px 长 AI 文本：报告完整且无横向溢出', { timeout: 50000 }, async t => {
    const page = await newPage(t, { ai: true, longAi: true, width: 360, height: 800, mobile: true });
    await page.waitFor(() => document.getElementById('ai-status-badge').classList.contains('online'));
    await finishSingleReading(page, 'E2E 长 AI 文本');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    const textLength = await page.eval(`document.getElementById('reading-blocks').textContent.length`);
    assert.ok(textLength > 2500, `长 AI 文本应完整渲染，实际 ${textLength} 字符`);
    assert.equal(await page.eval(`document.querySelectorAll('#reading-blocks .reading-block').length`), 3);
    assert.equal(await page.eval(`document.documentElement.scrollWidth <= window.innerWidth`), true, '长 AI 文本不得横向溢出');
    assertClean(page);
});

test('360px 长问题与横屏布局：不溢出且报告可读', { timeout: 50000 }, async t => {
    const page = await newPage(t, { width: 360, height: 800, mobile: true });
    const question = '长问题'.repeat(66);
    await finishSingleReading(page, question);
    assert.match(await page.eval(`document.getElementById('reveal-question-display').textContent`), /长问题/);
    assert.equal(await page.eval(`document.documentElement.scrollWidth <= window.innerWidth`), true, '长问题不得横向溢出');
    const saved = await page.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]')[0]`);
    assert.ok(saved.question.length <= 200);

    const landscape = await newPage(t, { width: 800, height: 360, mobile: true });
    assert.equal(await landscape.eval(`document.documentElement.scrollWidth <= window.innerWidth`), true, '横屏首页不得横向溢出');
    await finishSingleReading(landscape, 'E2E 横屏');
    assert.equal(await landscape.eval(`document.documentElement.scrollWidth <= window.innerWidth`), true, '横屏报告不得横向溢出');
    await landscape.click('#btn-history');
    await landscape.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    const landscapeHistory = await landscape.eval(`(() => {
        const list = document.getElementById('history-list');
        const inner = document.querySelector('.history-panel-inner');
        return {
            listHeight: list.getBoundingClientRect().height,
            innerScrollable: inner.scrollHeight > inner.clientHeight,
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth
        };
    })()`);
    assert.ok(landscapeHistory.listHeight > 0,
        `横屏档案列表不应被压扁，实际 ${landscapeHistory.listHeight}px`);
    assert.equal(landscapeHistory.innerScrollable, true, '横屏档案弹窗应可滚动');
    assert.equal(landscapeHistory.noOverflow, true, '横屏档案弹窗不得横向溢出');
    await landscape.press('Escape');
    assertClean(page);
    assertClean(landscape);
});

test('图片生成失败：给出明确提示并恢复按钮', { timeout: 40000 }, async t => {
    const page = await newPage(t, { blockUrls: ['*vendor/html2canvas.min.js'] });
    await finishSingleReading(page, 'E2E 图片生成失败');
    await page.click('#btn-share-report');
    await page.waitFor(() => !document.getElementById('share-panel').classList.contains('hidden'));
    await page.click('#btn-share-image');
    await page.waitForText('#toast', '图片生成失败', 10000);
    assert.equal(await page.eval(`document.getElementById('btn-share-image').disabled`), false);
    assert.match(await page.eval(`document.getElementById('toast').textContent`), /复制文案/);
    await page.press('Escape');
    assertClean(page, [/分享卡片生成失败/]);
});

test('长图导出：reduceMotion:false 时正文不被 opacity 动画吞掉', { timeout: 60000 }, async t => {
    // 回归 V2-01：.animate-slide-up 从 opacity:0 进入，html2canvas 克隆文档时
    // 动画不会按预期播放，旧实现导出的长图只有标题、没有解读正文。
    const page = await newPage(t, {
        reduceMotion: false,
        extraInit: `(() => {
            const original = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function (...args) {
                window.__lastExportCanvas = { width: this.width, height: this.height };
                return original.apply(this, args);
            };
        })();`
    });
    await finishSingleReading(page, 'E2E 长图正文');
    await page.click('#btn-save-report');
    await page.waitFor(() => window.__e2e.downloads.length > 0, 60000);
    await page.waitFor(() => !document.getElementById('btn-save-report').disabled, 15000);

    const result = await page.eval(`(async () => {
        const download = window.__e2e.downloads[window.__e2e.downloads.length - 1];
        const image = new Image();
        image.src = download.href;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const panel = document.querySelector('.console-box');
        const panelRect = panel.getBoundingClientRect();
        const scaleX = image.width / panelRect.width;
        const scaleY = image.height / panelRect.height;
        const samples = [...document.querySelectorAll('#reading-blocks .reading-block')].map(block => {
            const text = block.querySelector('[id$="-text"]');
            const rect = text.getBoundingClientRect();
            const x = Math.max(0, Math.round((rect.left - panelRect.left) * scaleX));
            const y = Math.max(0, Math.round((rect.top - panelRect.top) * scaleY));
            const w = Math.max(1, Math.min(canvas.width - x, Math.round(rect.width * scaleX)));
            const h = Math.max(1, Math.min(canvas.height - y, Math.round(rect.height * scaleY)));
            const data = ctx.getImageData(x, y, w, h).data;
            let bright = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] + data[i + 1] + data[i + 2] > 180) bright += 1;
            }
            return { bright, total: w * h, text: text.textContent.slice(0, 12) };
        });
        return {
            name: download.name,
            width: image.width,
            height: image.height,
            canvas: window.__lastExportCanvas,
            samples
        };
    })()`);

    assert.equal(result.samples.length, 3, '应采样三个解读正文块');
    for (const sample of result.samples) {
        assert.ok(sample.total > 100, `正文区域应有面积：${JSON.stringify(sample)}`);
        assert.ok(sample.bright > 20,
            `正文「${sample.text}」在导出图中几乎全黑，说明 opacity 动画被克隆进 canvas：${JSON.stringify(sample)}`);
    }
    assert.ok(result.width * result.height <= 16000000,
        `导出 canvas 像素应受 16M 上限约束，实际 ${result.width}×${result.height}`);
    assert.equal(result.canvas.width, result.width);
    assert.equal(result.canvas.height, result.height);
    assert.match(result.name, /^星见塔罗占卜报告_.*\.png$/);
    assertClean(page);
});

test('长图导出：凯尔特十字按 16M 像素上限降采样且正文可读', { timeout: 90000 }, async t => {
    // 回归 V2-04：固定 scale:2 在 10 张凯尔特十字上会超过 iOS canvas 像素上限。
    // 动态 scale 必须把最终 canvas 压到 16M 以内，同时正文仍然清晰可读。
    const page = await newPage(t, { reduceMotion: false });
    await startDraw(page, { question: 'E2E 凯尔特长图', spread: 'celtic' });
    await autoDrawAndReveal(page, 10);
    await page.click('#btn-save-report');
    await page.waitFor(() => window.__e2e.downloads.length > 0, 90000);
    await page.waitFor(() => !document.getElementById('btn-save-report').disabled, 15000);

    const result = await page.eval(`(async () => {
        const download = window.__e2e.downloads[window.__e2e.downloads.length - 1];
        const image = new Image();
        image.src = download.href;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const panel = document.querySelector('.console-box');
        const panelRect = panel.getBoundingClientRect();
        const scaleX = image.width / panelRect.width;
        const scaleY = image.height / panelRect.height;
        const samples = [...document.querySelectorAll('#reading-blocks .reading-block')].slice(0, 3).map(block => {
            const text = block.querySelector('[id$="-text"]');
            const rect = text.getBoundingClientRect();
            const x = Math.max(0, Math.round((rect.left - panelRect.left) * scaleX));
            const y = Math.max(0, Math.round((rect.top - panelRect.top) * scaleY));
            const w = Math.max(1, Math.min(canvas.width - x, Math.round(rect.width * scaleX)));
            const h = Math.max(1, Math.min(canvas.height - y, Math.round(rect.height * scaleY)));
            const data = ctx.getImageData(x, y, w, h).data;
            let bright = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] + data[i + 1] + data[i + 2] > 180) bright += 1;
            }
            return { bright, total: w * h, text: text.textContent.slice(0, 12) };
        });
        return { name: download.name, width: image.width, height: image.height, samples };
    })()`);

    assert.ok(result.width * result.height <= 16000000,
        `凯尔特长图应受 16M 像素上限约束，实际 ${result.width}×${result.height}`);
    assert.ok(result.width >= 1500,
        `动态 scale 不应把长图压得过小（宽度 ${result.width}）`);
    for (const sample of result.samples) {
        assert.ok(sample.total > 100, `正文区域应有面积：${JSON.stringify(sample)}`);
        assert.ok(sample.bright > 20,
            `正文「${sample.text}」在降采样后几乎全黑：${JSON.stringify(sample)}`);
    }
    assert.match(result.name, /^星见塔罗占卜报告_.*\.png$/);
    assertClean(page);
});

test('系统分享：预渲染后在点击栈内同步调用 navigator.share', { timeout: 60000 }, async t => {
    // 回归 V2-02：旧实现先 await 渲染图片再调用 navigator.share，用户激活已过期。
    // 这里用 stub 记录调用时的 userActivation.isActive，并断言图片文件已带上。
    const page = await newPage(t, {
        reduceMotion: false,
        extraInit: `(() => {
            window.__shareCalls = [];
            Object.defineProperty(navigator, 'share', {
                configurable: true,
                value: data => {
                    window.__shareCalls.push({
                        files: data.files ? data.files.length : 0,
                        fileName: data.files && data.files[0] ? data.files[0].name : null,
                        text: data.text,
                        activation: navigator.userActivation ? navigator.userActivation.isActive : null
                    });
                    return Promise.resolve();
                }
            });
            Object.defineProperty(navigator, 'canShare', {
                configurable: true,
                value: data => Boolean(data && data.files && data.files.length)
            });
        })();`
    });
    await finishSingleReading(page, 'E2E 系统分享');
    await page.click('#btn-share-report');
    await page.waitFor(() => !document.getElementById('share-panel').classList.contains('hidden'));
    await page.waitFor(() => {
        const button = document.getElementById('btn-share-native');
        return !button.disabled && button.textContent === '系统分享';
    }, 30000);
    await page.click('#btn-share-native');
    await page.waitFor(() => (window.__shareCalls || []).length === 1, 10000);

    const call = await page.eval(`window.__shareCalls[0]`);
    assert.equal(call.files, 1, '应把预渲染好的 PNG 文件一起分享');
    assert.equal(call.activation, true, 'navigator.share 必须在用户点击的同步调用栈内调用');
    assert.match(call.fileName, /^星见塔罗_.*\.png$/);
    assert.match(call.text, /灵光快占/);
    assertClean(page);
});

test('档案容错：根 JSON 损坏时提示已忽略且不崩溃', { timeout: 40000 }, async t => {
    // 回归 V2-23：JSON.parse 失败或根不是数组时，旧实现静默返回空列表。
    const page = await newPage(t, {
        seedStorage: { xingjian_history: '{bad json' }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    await page.waitForText('#toast', '档案数据损坏', 5000);
    const state = await page.eval(`({
        items: document.querySelectorAll('#history-list .history-item').length,
        toastHidden: document.getElementById('toast').classList.contains('hidden')
    })`);
    assert.equal(state.items, 0);
    assert.equal(state.toastHidden, false, '损坏提示应保持可见，而不是一闪而过');
    assertClean(page);
});

test('本地存储失败：明确提示且不阻断报告与行动输入', { timeout: 40000 }, async t => {
    const page = await newPage(t, {
        extraInit: `Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError'); };`
    });
    await finishSingleReading(page, 'E2E 存储失败');
    await page.waitForText('#toast', '浏览器存储不可用', 10000);
    assert.equal(await page.eval(`localStorage.getItem('xingjian_history')`), null);
    assert.equal(await page.eval(`!document.getElementById('reading-report').classList.contains('hidden')`), true);
    await page.fill('#action-input', 'E2E 存储失败时仍可输入行动');
    await page.click('#btn-save-reflection');
    await page.waitForText('#toast', '浏览器存储不可用', 10000);
    assert.equal(await page.eval(`document.getElementById('action-input').value`), 'E2E 存储失败时仍可输入行动');
    assertClean(page);
});

test('全部 78 张牌面已发布：样张之外的牌也能加载牌图', { timeout: 30000 }, async t => {
    const page = await newPage(t, {
        seedStorage: {
            xingjian_daily: {
                date: FIXED_DAY,
                lastDrawDate: '2026-10-27',
                streak: 1,
                cards: [{ cardId: 'm01', orientation: 'upright' }]
            }
        }
    });
    await page.click('#btn-daily');
    await waitForCardReady(page);
    await page.click('#reveal-cards-display .tarot-card-3d');
    await page.waitFor(() => !document.getElementById('reading-report').classList.contains('hidden'));
    await page.waitFor(() => document.querySelector('.card-front')?.dataset.artStatus === 'loaded', 10000);
    const art = await page.eval(`(() => {
        const front = document.querySelector('.card-front');
        return {
            status: front.dataset.artStatus,
            currentSrc: front.querySelector('.card-art').currentSrc,
            name: front.querySelector('.card-name-cn').textContent
        };
    })()`);
    assert.equal(art.status, 'loaded');
    assert.match(art.currentSrc, /m01\.webp$/);
    assert.equal(art.name, '魔术师');
    assertClean(page);
});

// ==========================================================================
// V1.3.1 修复回归
// ==========================================================================

test('牌面比例：所有牌阵与断点下卡牌都锁定 3:5，与牌面原图一致', { timeout: 120000 }, async t => {
    const cases = [
        { width: 1280, spread: 'single', cards: 1 },
        { width: 1280, spread: 'trinity', cards: 3 },
        { width: 1280, spread: 'celtic', cards: 10 },
        { width: 390, spread: 'trinity', cards: 3 },
        { width: 390, spread: 'celtic', cards: 10 }
    ];
    for (const item of cases) {
        const page = await newPage(t, { width: item.width, height: 900 });
        await startDraw(page, { question: 'E2E 牌面比例 ' + item.spread, spread: item.spread });
        await autoDrawAndReveal(page, item.cards);

        const measured = await page.eval([
            "(() => [...document.querySelectorAll('#reveal-cards-display .tarot-card-3d')].map(card => {",
            "  const box = card.getBoundingClientRect();",
            "  const art = card.querySelector('.card-art-frame');",
            "  const artBox = art ? art.getBoundingClientRect() : null;",
            "  return {",
            "    ratio: box.width / box.height,",
            "    artRatio: artBox ? artBox.width / artBox.height : null,",
            "    size: Math.round(box.width) + 'x' + Math.round(box.height)",
            "  };",
            "}))()"
        ].join('\n'));

        assert.equal(measured.length, item.cards, item.spread + ' 应渲染 ' + item.cards + ' 张牌');
        const label = item.spread + '@' + item.width + 'px';
        for (const card of measured) {
            // 牌面原图是 600×1000 = 3:5，卡牌容器必须一致，否则 object-fit: cover 会裁掉画面
            assert.ok(Math.abs(card.ratio - 0.6) < 0.005,
                label + ' 卡牌比例应为 3:5，实际 ' + card.ratio.toFixed(4) + ' (' + card.size + ')');
            // 内层牌面框只差 2px 边框，允许 1% 误差
            assert.ok(Math.abs(card.artRatio - 0.6) < 0.01,
                label + ' 牌面框比例应接近 3:5，实际 ' + card.artRatio.toFixed(4));
        }
        const distinct = new Set(measured.map(card => card.ratio.toFixed(3)));
        assert.equal(distinct.size, 1, label + ' 同一次翻牌内所有卡牌比例必须一致');
        assertClean(page);
    }
});

test('幽灵抽牌：返回修改牌阵后旧抽牌链必须停止', { timeout: 60000 }, async t => {
    // 必须使用真实动效时长：减少动态效果会把 900ms 抽牌间隔压成 0，时序无法复现。
    // 另外 harness 冻结了 Date.now()，会让「聆听命运」的 600ms 防连点永远命中，
    // 这里让 Date.now() 随真实时间前进（new Date() 仍返回固定时间）。
    const page = await newPage(t, {
        reduceMotion: false,
        extraInit: 'Date.now = (t0 => () => t0 + Math.floor(performance.now()))(Date.now());'
    });
    await startDraw(page, { question: 'E2E 幽灵抽牌', spread: 'celtic' });
    assert.equal(await page.eval("document.querySelectorAll('#tarot-deck .stacked-card').length"), 22);

    // 启动自动抽牌后立刻退回上一步
    await page.click('#btn-auto-draw');
    await page.click('#btn-back-to-question');
    await page.waitFor(() => document.getElementById('step-listen')?.classList.contains('active'), 10000);

    // 重新进入抽牌：initializeDeck() 会 shuffleToken++，旧定时器链必须作废
    await page.click('#btn-next-step');
    await page.waitFor(() => document.getElementById('step-draw')?.classList.contains('active'), 10000);

    // 静置：凯尔特十字自动抽牌原本要 10 × 900ms，这里给足时间
    await new Promise(resolve => setTimeout(resolve, 6000));

    const state = await page.eval("({ filled: document.querySelectorAll('.slot-card.filled').length, stacked: document.querySelectorAll('#tarot-deck .stacked-card').length, revealShown: !document.getElementById('btn-go-reveal').classList.contains('hidden') })");
    assert.equal(state.filled, 0, '重新进入后不应有任何牌被自动抽走');
    assert.equal(state.stacked, 22, '牌堆应保持 22 张完整');
    assert.equal(state.revealShown, false, '不应自动出现「揭示天机」');
    assertClean(page);
});

test('档案容错：混入 null 与坏记录时面板仍可打开并跳过坏记录', { timeout: 40000 }, async t => {
    const page = await newPage(t, {
        seedStorage: {
            xingjian_history: JSON.stringify([
                null,
                'not-an-object',
                { time: '2026-10-27T02:00:00.000Z', question: '缺少 id 的坏记录' },
                historyRecord({ id: 'e2e-good-1', question: 'E2E 正常记录' })
            ])
        }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'), 10000);
    const state = await page.eval("({ items: document.querySelectorAll('#history-list .history-item').length, summary: document.getElementById('history-review-summary').textContent })");
    assert.equal(state.items, 1, '只有合法记录应被渲染');
    assert.match(state.summary, /3 条记录结构异常/, '应提示跳过的坏记录数量，实际：' + state.summary);
    assertClean(page);
});

test('档案容错：非法时间显示「时间未知」而不是 NaN', { timeout: 40000 }, async t => {
    const page = await newPage(t, {
        seedStorage: {
            xingjian_history: JSON.stringify([historyRecord({ id: 'e2e-bad-time', time: 'not-a-date' })])
        }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'), 10000);
    const meta = await page.eval("document.querySelector('#history-list .h-meta').textContent");
    assert.match(meta, /时间未知/, '非法时间应回退为「时间未知」，实际：' + meta);
    assert.ok(!/NaN/.test(meta), '不应渲染 NaN，实际：' + meta);
    assertClean(page);
});

test('可访问性：追问输入框有可访问名称', { timeout: 40000 }, async t => {
    const page = await newPage(t, { ai: true });
    await finishSingleReading(page, 'E2E 追问可访问名称');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 15000);
    const label = await page.eval("document.getElementById('ai-chat-input').getAttribute('aria-label')");
    assert.equal(label, '就这次占卜继续追问');
    assertClean(page);
});

// 说明：无头 Chrome 不会把 :focus 样式写进 getComputedStyle（连既有的
// .input-wrapper input:focus 也测不出来），因此这里改为断言 CSSOM：
// 规则存在、声明正确、选择器能命中真实元素。真实浏览器中 :focus 正常生效。
test('可访问性：复盘下拉框有 :focus 边框样式且能命中真实元素', { timeout: 40000 }, async t => {
    const page = await newPage(t);
    await finishSingleReading(page, 'E2E 焦点样式');

    const rules = await page.eval([
        "(() => {",
        "  const targets = ['.reflection-controls select', '.history-reflection select'];",
        "  const out = [];",
        "  for (const sheet of document.styleSheets) {",
        "    let list; try { list = sheet.cssRules; } catch { continue; }",
        "    for (const rule of list) {",
        "      if (rule.type !== 1 || !rule.selectorText) continue;",
        "      const selectors = rule.selectorText.split(',').map(s => s.trim());",
        "      for (const target of targets) {",
        "        if (selectors.includes(target)) out.push({ target, focus: false, border: rule.style.border, borderColor: rule.style.borderColor });",
        "        if (selectors.includes(target + ':focus')) out.push({ target, focus: true, border: rule.style.border, borderColor: rule.style.borderColor });",
        "      }",
        "    }",
        "  }",
        "  return out;",
        "})()"
    ].join('\n'));

    for (const target of ['.reflection-controls select', '.history-reflection select']) {
        const base = rules.find(rule => rule.target === target && !rule.focus);
        const focus = rules.find(rule => rule.target === target && rule.focus);
        assert.ok(base, target + ' 应有默认边框规则');
        assert.ok(focus, target + ' 应有 :focus 规则');
        assert.equal(focus.borderColor, 'var(--gold)', target + ' 的 :focus 应使用 --gold');
        assert.match(base.border, /var\(--border-color\)/, target + ' 的默认边框应使用 --border-color');
    }

    // 选择器确实能命中真实元素（否则规则写了也不会生效）
    const matches = await page.eval("(() => { const el = document.getElementById('review-offset'); el.focus(); return el.matches('.reflection-controls select:focus'); })()");
    assert.equal(matches, true, ':focus 选择器应命中 #review-offset');
    assertClean(page);
});

test('每日一抽：重启过渡期内点击也能停在揭示页并显示牌面', { timeout: 40000 }, async t => {
    // 回归 V-26：重启的「揭示页 → 提问页」500ms 切走动画还没结束就点每日一抽，
    // 旧实现会把牌渲染进即将被隐藏的区块，500ms 后牌静默消失。
    const page = await newPage(t, { reduceMotion: false });
    await finishSingleReading(page, 'E2E 每日竞态');
    await page.click('#btn-restart');
    await new Promise(resolve => setTimeout(resolve, 60));
    await page.click('#btn-daily');
    await page.waitFor(() => document.getElementById('step-reveal')?.classList.contains('active'), 5000);
    await waitForCardReady(page);
    const state = await page.eval(`({
        active: [...document.querySelectorAll('.step-section.active')].map(section => section.id),
        revealDisplay: getComputedStyle(document.getElementById('step-reveal')).display,
        cards: document.querySelectorAll('#reveal-cards-display .tarot-card-3d').length,
        daily: Boolean(localStorage.getItem('xingjian_daily'))
    })`);
    assert.deepEqual(state.active, ['step-reveal'], '每日一抽应停留在揭示页，而不是被重启动画切回提问页');
    assert.equal(state.revealDisplay, 'flex', '揭示页应保持可见');
    assert.equal(state.cards, 1, '每日一抽的牌应正常渲染');
    assert.equal(state.daily, true, '当天的一抽应已记录');
    assertClean(page);
});

test('分享：切换隐私选项不覆盖用户编辑的配文', { timeout: 40000 }, async t => {
    // 回归 V-27：隐私单选切换只应刷新预览，不应把用户手改的配文重置成模板。
    const page = await newPage(t);
    await finishSingleReading(page, 'E2E 分享配文');
    await page.click('#btn-share-report');
    await page.waitFor(() => !document.getElementById('share-panel').classList.contains('hidden'), 10000);
    await page.eval(`(() => {
        const el = document.getElementById('share-caption');
        el.value = '我自己改过的配文';
        el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await page.eval(`(() => {
        const el = document.querySelector('input[name="share-privacy"][value="full"]');
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const state = await page.eval(`({
        caption: document.getElementById('share-caption').value,
        question: document.getElementById('share-question').textContent
    })`);
    assert.equal(state.caption, '我自己改过的配文', '用户编辑过的配文不应被隐私切换覆盖');
    assert.match(state.question, /E2E 分享配文/, '切换隐私仍应更新预览里的问题');
    assertClean(page);
});

// ---------------------------------------------------------------------------
// 本轮 UX 审计回归用例（audit-ux/fix-log.md 中逐条对应）
// ---------------------------------------------------------------------------

test('档案：空存储首次打开不再误报「档案数据损坏」', { timeout: 30000 }, async t => {
    // UF-01 / A-01 / A11Y-01：JSON.parse(null) 曾返回 null，被误判为损坏。
    const page = await newPage(t);
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    const state = await page.eval(`({
        toast: document.getElementById('toast').textContent,
        items: document.querySelectorAll('.history-item').length
    })`);
    assert.equal(state.items, 0, '空档案不应渲染条目');
    assert.doesNotMatch(state.toast, /档案数据损坏/, '首次打开空档案不应提示损坏');
    assertClean(page);
});

test('返回首页：AI 生成中离开也会保存本次占卜', { timeout: 50000 }, async t => {
    // UF-02：AI 在线时，生成中返回首页曾让本次占卜完全不落档。
    const page = await newPage(t, { ai: true, delayMs: 2000 });
    await startDraw(page, { question: 'E2E AI 生成中返回', spread: 'single' });
    await autoDrawAndReveal(page, 1);
    await page.waitFor(() => /星见正在感应星轨/.test(document.getElementById('reading-synthesis-text').textContent));
    await page.click('#btn-reveal-back');
    await page.waitFor(() => document.getElementById('step-listen').classList.contains('active'));
    const history = await page.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]')`);
    assert.equal(history.length, 1, 'AI 生成中返回也应留下一条本地档案');
    assert.equal(history[0].ai, false, '未等到 AI 结果时应按本地解读落档');
    assert.match(history[0].sections.synthesis, /星见正在感应星轨|E2E/, '档案应保存当前可见的本地解读');
    assertClean(page);
});

test('自动抽牌：返回修改问题时取消后台抽牌', { timeout: 50000 }, async t => {
    // UF-03：自动抽牌期间返回，后台仍继续抽牌并点亮隐藏区的揭示按钮。
    const page = await newPage(t, { reduceMotion: false });
    await startDraw(page, { question: 'E2E 取消自动抽牌', spread: 'celtic' });
    await page.click('#btn-auto-draw');
    await new Promise(resolve => setTimeout(resolve, 150));
    await page.click('#btn-back-to-question');
    await page.waitFor(() => document.getElementById('step-listen').classList.contains('active'));
    await new Promise(resolve => setTimeout(resolve, 2500));
    const state = await page.eval(`({
        filled: document.querySelectorAll('#slots-container .slot-card.filled').length,
        stacked: document.querySelectorAll('#tarot-deck .stacked-card').length,
        goHidden: document.getElementById('btn-go-reveal').classList.contains('hidden'),
        toast: document.getElementById('toast').textContent
    })`);
    assert.equal(state.filled, 0, '返回后不应再往槽位里填牌');
    assert.equal(state.stacked, 22, '牌堆应恢复到 22 张');
    assert.equal(state.goHidden, true, '隐藏区的「揭示天机」不应被点亮');
    assert.match(state.toast, /已取消自动抽牌/, '应明确告知自动抽牌已取消');
    assertClean(page);
});

test('档案：写入第 51 条时提示淘汰最旧记录', { timeout: 40000 }, async t => {
    // A-02：超过 50 条上限时曾静默丢弃最旧一条。
    const seeded = Array.from({ length: 50 }, (_, index) => historyRecord({
        id: `seed-${index}`,
        time: new Date(Date.parse('2026-10-27T02:00:00.000Z') - index * 3600000).toISOString(),
        question: `E2E 旧档案 ${index}`
    }));
    const page = await newPage(t, { seedStorage: { xingjian_history: seeded } });
    await finishSingleReading(page, 'E2E 第 51 条档案');
    const state = await page.eval(`({
        length: JSON.parse(localStorage.getItem('xingjian_history') || '[]').length,
        toast: document.getElementById('toast').textContent
    })`);
    assert.equal(state.length, 50, '档案仍应保持 50 条上限');
    assert.match(state.toast, /已自动移除最早的 1 条/, '淘汰旧档案时应给出提示');
    assertClean(page);
});

test('导入：超出上限时提示现有档案被淘汰', { timeout: 40000 }, async t => {
    // A-03：导入合并超 50 条时曾静默淘汰现有档案，toast 只统计导入侧。
    const seeded = Array.from({ length: 50 }, (_, index) => historyRecord({
        id: `seed-${index}`,
        time: new Date(Date.parse('2026-10-27T02:00:00.000Z') - index * 3600000).toISOString(),
        question: `E2E 旧档案 ${index}`
    }));
    const page = await newPage(t, { seedStorage: { xingjian_history: seeded } });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    const additions = [
        historyRecord({ id: 'import-1', time: '2026-10-28T01:00:00.000Z', question: 'E2E 导入一' }),
        historyRecord({ id: 'import-2', time: '2026-10-28T00:30:00.000Z', question: 'E2E 导入二' })
    ];
    await importJsonFile(page, '#history-import-file', {
        app: 'xingjian-tarot', version: 2, exportedAt: '2026-10-28T02:00:00.000Z', history: additions
    }, 'e2e-overflow.json');
    await page.waitForText('#toast', '2 条较早的现有档案被移除', 10000);
    assert.equal(await page.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]').length`), 50);
    assertClean(page);
});

test('320px：复盘提醒下拉框不越出反思卡', { timeout: 40000 }, async t => {
    // A11Y-02：320px 宽时 #review-offset 曾越出 .reflection-card 19.4px。
    const page = await newPage(t, { width: 320, height: 720 });
    await finishSingleReading(page, 'E2E 320 复盘卡');
    const state = await page.eval(`(() => {
        const card = document.querySelector('.reflection-card').getBoundingClientRect();
        const select = document.getElementById('review-offset').getBoundingClientRect();
        return {
            cardLeft: card.left, cardRight: card.right,
            selectLeft: select.left, selectRight: select.right,
            overflow: document.documentElement.scrollWidth > window.innerWidth
        };
    })()`);
    assert.ok(state.selectRight <= state.cardRight + 1, `下拉框右侧越界 ${state.selectRight - state.cardRight}px`);
    assert.ok(state.selectLeft >= state.cardLeft - 1, '下拉框左侧不应越出卡片');
    assert.equal(state.overflow, false, '320px 不应出现横向滚动');
    assertClean(page);
});

test('可访问性：原生 summary 也有可见焦点环', { timeout: 30000 }, async t => {
    // A11Y-03：报告/学习页的裸 <summary> 曾落到深色 UA 默认焦点环。
    const page = await newPage(t);
    const rule = await page.eval(`(() => {
        const walk = rules => {
            for (const rule of rules) {
                if (rule.cssRules) { const found = walk(rule.cssRules); if (found) return found; }
                if (rule.selectorText && rule.selectorText.includes('summary:focus-visible')) return rule.cssText;
            }
            return '';
        };
        for (const sheet of document.styleSheets) {
            try { const found = walk(sheet.cssRules); if (found) return found; } catch { /* 跨域样式表 */ }
        }
        return '';
    })()`);
    assert.match(rule, /summary:focus-visible/, '应为原生 summary 提供 focus-visible 样式');
    assert.match(rule, /outline/, '焦点环应有可见轮廓');
    assertClean(page);
});

test('档案：条目不再用 role=button 包裹交互控件', { timeout: 30000 }, async t => {
    // A11Y-04：article[role=button] 曾把 textarea/select/button 吞进同一个按钮。
    const page = await newPage(t, { seedStorage: { xingjian_history: [historyRecord()] } });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    const state = await page.eval(`({
        legacy: document.querySelectorAll('.history-item[role="button"]').length,
        toggles: document.querySelectorAll('.history-toggle').length,
        expanded: document.querySelector('.history-toggle')?.getAttribute('aria-expanded'),
        nested: [...document.querySelectorAll('[role="button"]')]
            .filter(el => el.querySelector('textarea, select, button, input')).length
    })`);
    assert.equal(state.legacy, 0, 'article 不应再是 role=button');
    assert.equal(state.toggles, 1, '应使用真实 button 承载展开');
    assert.equal(state.expanded, 'false', '初始应为收起状态');
    assert.equal(state.nested, 0, 'role=button 内不应嵌套交互控件');
    assertClean(page);
});

test('档案：保存笔记后焦点回到该条目', { timeout: 30000 }, async t => {
    // A11Y-05：保存后 renderHistory 重建，焦点曾掉到 BODY。
    const page = await newPage(t, { seedStorage: { xingjian_history: [historyRecord()] } });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    await page.click('.history-toggle');
    await page.fill('.history-item.open textarea[data-history-field="note"]', 'E2E 保存后的焦点');
    await page.click('.history-item.open .review-actions .mystic-btn');
    await page.waitForText('#toast', '已保存', 10000);
    const state = await page.eval(`(() => {
        const active = document.activeElement;
        return {
            tag: active ? active.tagName : '',
            className: active ? String(active.className) : '',
            itemId: active && active.closest('.history-item') ? active.closest('.history-item').dataset.historyId : ''
        };
    })()`);
    assert.equal(state.itemId, 'e2e-record-1', '焦点应回到刚保存的档案条目');
    assert.match(state.className, /history-toggle/, '焦点应落在展开按钮上');
    assertClean(page);
});

test('档案：搜索重建后 aria-expanded 与展开状态同步', { timeout: 30000 }, async t => {
    // A11Y-06 / A-07：重建后视觉展开但 aria-expanded 仍是 false。
    const page = await newPage(t, {
        seedStorage: { xingjian_history: [historyRecord({ question: 'E2E 搜索保持展开' })] }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    await page.click('.history-toggle');
    await page.fill('#history-search', 'E2E');
    await page.waitFor(() => document.querySelector('.history-item')?.classList.contains('open'));
    const state = await page.eval(`({
        open: document.querySelector('.history-item')?.classList.contains('open'),
        expanded: document.querySelector('.history-toggle')?.getAttribute('aria-expanded')
    })`);
    assert.equal(state.open, true, '重建后应保持展开');
    assert.equal(state.expanded, 'true', 'aria-expanded 应同步为 true');
    assertClean(page);
});

test('安全面板：对话框有关联描述', { timeout: 30000 }, async t => {
    // A11Y-07：role=dialog 曾没有 aria-describedby。
    const page = await newPage(t);
    const state = await page.eval(`({
        describedby: document.getElementById('safety-panel').getAttribute('aria-describedby'),
        exists: Boolean(document.getElementById('safety-description')),
        text: document.getElementById('safety-description')?.textContent || ''
    })`);
    assert.equal(state.describedby, 'safety-description');
    assert.equal(state.exists, true, '描述元素应存在');
    assert.ok(state.text.trim().length > 0, '描述不应为空');
    assertClean(page);
});

test('弹窗：关闭按钮触控目标不小于 24px', { timeout: 50000 }, async t => {
    // A11Y-08：四个弹窗关闭按钮曾只有 13×21px。
    const page = await newPage(t);
    const measure = async id => page.eval(`(() => {
        const rect = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    })()`);
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    const history = await measure('btn-history-close');
    await page.press('Escape');
    await page.waitFor(() => document.getElementById('history-panel').classList.contains('hidden'));
    await page.click('#btn-learning');
    await page.waitFor(() => !document.getElementById('learning-panel').classList.contains('hidden'));
    const learning = await measure('btn-learning-close');
    await page.press('Escape');
    await page.waitFor(() => document.getElementById('learning-panel').classList.contains('hidden'));
    await finishSingleReading(page, 'E2E 弹窗关闭按钮');
    await page.click('#btn-share-report');
    await page.waitFor(() => !document.getElementById('share-panel').classList.contains('hidden'));
    const share = await measure('btn-share-close');
    await page.press('Escape');
    await page.waitFor(() => document.getElementById('share-panel').classList.contains('hidden'));
    // 分享面板关闭后仍停在揭示页，提问框在隐藏的倾听页里；重新载入回到首页。
    await page.goto(mock.baseUrl + '/');
    await page.fill('#user-question', '我想自杀');
    await page.click('#btn-next-step');
    await page.waitFor(() => !document.getElementById('safety-panel').classList.contains('hidden'));
    const safety = await measure('btn-safety-close');
    for (const [name, rect] of Object.entries({ history, learning, share, safety })) {
        assert.ok(rect.width >= 24 && rect.height >= 24, `${name} 关闭按钮应至少 24×24，实际 ${rect.width}×${rect.height}`);
    }
    assertClean(page);
});

test('AI：分段缺失时不残留占位符', { timeout: 50000 }, async t => {
    // AI-01：AI 只返回部分分段时，其余位置曾保留「✦ 星见正在感应星轨…」并写入档案。
    const page = await newPage(t, {
        ai: true,
        aiText: '【牌1】\nAI-ONLY-FIRST\n【串联】\nAI-ONLY-SYNTHESIS'
    });
    await finishSingleReading(page, 'E2E AI 缺段');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    const state = await page.eval(`({
        blocks: document.getElementById('reading-blocks').textContent,
        position: document.querySelector('#reading-blocks .reading-block')?.textContent || '',
        synthesis: document.getElementById('reading-synthesis-text').textContent,
        blessing: document.getElementById('reading-blessing-text').textContent
    })`);
    assert.doesNotMatch(state.blocks, /星见正在感应星轨/, '报告里不应残留 AI 占位符');
    assert.match(state.position, /AI-ONLY-FIRST/, '已返回的位置应使用 AI 文本');
    assert.match(state.synthesis, /AI-ONLY-SYNTHESIS/, '串联应使用 AI 文本');
    assert.doesNotMatch(state.synthesis, /【串联】/, '串联正文不应带字面量标记');
    assert.ok(state.blessing.trim().length > 0, '缺失的祝福应回退到本地解读而不是空着');
    assert.doesNotMatch(state.blessing, /星见正在感应星轨/, '祝福不应保留占位符');
    assertClean(page);
});

test('每日一抽：回看已揭示的牌不重复请求 AI', { timeout: 50000 }, async t => {
    // UF-13：每次回看都重新请求 AI。
    const page = await newPage(t, { ai: true });
    await page.click('#btn-daily');
    await waitForCardReady(page);
    await page.click('#reveal-cards-display .tarot-card-3d');
    await page.waitFor(() => !document.getElementById('reading-report').classList.contains('hidden'));
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    assert.equal(mock.state.chatCalls, 1, '首次揭示应请求一次 AI');
    await page.click('#btn-reveal-back');
    await page.waitFor(() => document.getElementById('step-listen').classList.contains('active'));
    await page.click('#btn-daily');
    await page.waitFor(() => !document.getElementById('reading-report').classList.contains('hidden'), 10000);
    assert.equal(mock.state.chatCalls, 1, '回看已揭示的牌不应再次请求 AI');
    assert.match(await page.eval(`document.getElementById('reading-synthesis-text').textContent`), /E2E-MOCK-SYNTHESIS/);
    assertClean(page);
});

test('报告：滚动到中部后返回首页按钮仍可见', { timeout: 40000 }, async t => {
    // UF-12：报告滚到中部后「← 返回首页」曾滚出视口（top=-475）。
    const page = await newPage(t);
    await finishSingleReading(page, 'E2E 滚动返回首页');
    await page.eval(`(() => {
        const report = document.getElementById('reading-report');
        window.scrollTo(0, report.offsetTop + 600);
    })()`);
    await new Promise(resolve => setTimeout(resolve, 150));
    const state = await page.eval(`(() => {
        const rect = document.getElementById('btn-reveal-back').getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, innerHeight: window.innerHeight };
    })()`);
    assert.ok(state.top >= 0, `返回按钮不应滚出视口顶部，实际 top=${state.top}`);
    assert.ok(state.bottom <= state.innerHeight, '返回按钮应完整留在视口内');
    assertClean(page);
});

test('每日一抽：已抽未揭示时入口文案为「揭示今日牌」', { timeout: 40000 }, async t => {
    // A-04：入口曾把「已抽未翻」也显示成「回看」。
    const page = await newPage(t);
    await page.click('#btn-daily');
    await waitForCardReady(page);
    await page.waitFor(() => document.getElementById('step-reveal').classList.contains('active'));
    await page.click('#btn-reveal-back');
    await page.waitFor(() => document.getElementById('step-listen').classList.contains('active'));
    const text = await page.eval(`document.getElementById('btn-daily-entry').textContent`);
    assert.match(text, /揭示今日牌/, '已抽但未揭示时应提示去揭示');
    assert.doesNotMatch(text, /回看今日牌/, '未揭示时不应说回看');
    assertClean(page);
});

test('抽牌：状态文案不重复「位置」', { timeout: 30000 }, async t => {
    // UF-05：「过去的影响位置已落牌」曾重复「位置」。
    const page = await newPage(t);
    await startDraw(page, { question: 'E2E 抽牌文案', spread: 'trinity' });
    // 扇形叠牌的中心点会被相邻牌盖住，用键盘抽牌避免命中测试误判。
    await page.focus('#tarot-deck .stacked-card');
    await page.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 100));
    const text = await page.eval(`document.getElementById('draw-status').textContent`);
    assert.match(text, /过去的影响已落牌/, '位置名后不应再补一个「位置」');
    assert.doesNotMatch(text, /影响位置已落牌/, '不应出现「位置位置」式重复');
    assertClean(page);
});

test('空问题：提示优先于防连点', { timeout: 30000 }, async t => {
    // UF-06：空问题 600ms 内再点，提示曾变成「星轨正在校准」。
    const page = await newPage(t);
    await page.click('#btn-next-step');
    await page.click('#btn-next-step');
    const toast = await page.eval(`document.getElementById('toast').textContent`);
    assert.match(toast, /命运需要倾听你的诉求/, '空问题应始终提示先写困惑');
    assert.doesNotMatch(toast, /星轨正在校准/, '空问题不应被防连点提示覆盖');
    assertClean(page);
});

test('档案：meta 的「解读」与复盘状态之间有空格', { timeout: 30000 }, async t => {
    // A-06 / A11Y-15：「本地解读· 待复盘」曾缺空格。
    const page = await newPage(t, {
        seedStorage: {
            xingjian_history: [historyRecord({ reviewAt: '2026-11-04T02:00:00.000Z' })]
        }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    const meta = await page.eval(`document.querySelector('.h-meta').textContent`);
    assert.match(meta, /本地解读 · /, '「解读」与分隔点之间应有空格');
    assert.doesNotMatch(meta, /解读·/, '不应出现「解读·」粘连');
    assertClean(page);
});

test('用量账本：AI 调用次数使用千分位', { timeout: 30000 }, async t => {
    // A-14：requests 曾直接输出 1234。
    const page = await newPage(t, {
        usage: { '2026-10-28': { requests: 1234, total_tokens: 5678 } }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('usage-summary').classList.contains('hidden'), 10000);
    const text = await page.eval(`document.getElementById('usage-summary').textContent`);
    assert.match(text, /1,234 次/, '调用次数应使用千分位');
    assert.match(text, /5,678 tokens/);
    assertClean(page);
});

test('每日一抽：本地记录损坏时给出提示', { timeout: 30000 }, async t => {
    // A-15：每日一抽 JSON 损坏曾静默清零 streak。
    const page = await newPage(t, { seedStorage: { xingjian_daily: '{bad json' } });
    await page.waitForText('#toast', '每日一抽记录损坏', 5000);
    assertClean(page);
});

test('安全面板：120/110 是 tel 链接', { timeout: 30000 }, async t => {
    // A11Y-23：紧急电话曾只是纯文本。
    const page = await newPage(t);
    const state = await page.eval(`({
        emergency: Boolean(document.querySelector('#safety-panel a[href="tel:120"]')),
        police: Boolean(document.querySelector('#safety-panel a[href="tel:110"]'))
    })`);
    assert.equal(state.emergency, true, '120 应是可拨打的 tel 链接');
    assert.equal(state.police, true, '110 应是可拨打的 tel 链接');
    assertClean(page);
});

test('AI：报告显示解读来源', { timeout: 40000 }, async t => {
    // AI-04：报告曾没有任何「本地/AI」来源标注。
    const page = await newPage(t, { ai: true });
    await finishSingleReading(page, 'E2E 解读来源');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    const text = await page.eval(`document.getElementById('report-source').textContent`);
    assert.match(text, /AI 解读/, 'AI 成功时应标注 AI 解读');
    assertClean(page);
});

test('占位符：问题输入框不再使用 ASCII 省略号', { timeout: 30000 }, async t => {
    // A11Y-16：中文界面混用 ASCII ...。
    const page = await newPage(t);
    const placeholder = await page.eval(`document.getElementById('user-question').placeholder`);
    assert.doesNotMatch(placeholder, /\.\.\./, '用户可见文案不应使用 ASCII 省略号');
    assert.match(placeholder, /…/, '应使用中文省略号');
    assertClean(page);
});

test('AI：生成中禁用保存长图，完成后恢复', { timeout: 50000 }, async t => {
    // UF-11：AI 生成中「保存长图」曾未置灰。
    const page = await newPage(t, { ai: true, delayMs: 2000 });
    await startDraw(page, { question: 'E2E 生成中保存长图', spread: 'single' });
    await autoDrawAndReveal(page, 1);
    await page.waitFor(() => /星见正在感应星轨/.test(document.getElementById('reading-synthesis-text').textContent));
    assert.equal(await page.eval(`document.getElementById('btn-save-report').disabled`), true, 'AI 生成中应禁用保存长图');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    assert.equal(await page.eval(`document.getElementById('btn-save-report').disabled`), false, 'AI 完成后应恢复保存长图');
    assertClean(page);
});

test('AI：重试成功后焦点回到报告', { timeout: 50000 }, async t => {
    // UF-10：AI 重试成功后焦点曾掉到 BODY。
    const page = await newPage(t, { ai: true, failNext: 1 });
    await finishSingleReading(page, 'E2E 重试焦点');
    await page.waitFor(() => !document.getElementById('btn-ai-retry').classList.contains('hidden'), 10000);
    await page.click('#btn-ai-retry');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    const activeId = await page.eval(`document.activeElement ? document.activeElement.id : ''`);
    assert.equal(activeId, 'reading-report', '重试成功后焦点应回到报告');
    assertClean(page, [/502/]);
});

test('AI 追问：空输入发送时给出提示', { timeout: 40000 }, async t => {
    // UF-08：追问空输入点发送曾完全无反馈。
    const page = await newPage(t, { ai: true });
    await finishSingleReading(page, 'E2E 空追问');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    await page.click('#ai-chat-send');
    const toast = await page.eval(`document.getElementById('toast').textContent`);
    assert.match(toast, /先写下你想追问的内容/, '空追问应提示用户输入');
    assertClean(page);
});

test('分享：日期使用中文年月日格式', { timeout: 40000 }, async t => {
    // UF-14 / A11Y-14：分享日期曾输出 2026/10/28。
    const page = await newPage(t);
    await finishSingleReading(page, 'E2E 分享日期');
    await page.click('#btn-share-report');
    await page.waitFor(() => !document.getElementById('share-panel').classList.contains('hidden'));
    const text = await page.eval(`document.getElementById('share-date').textContent`);
    assert.match(text, /2026年10月28日/, '分享日期应使用中文年月日');
    assert.doesNotMatch(text, /2026\/10\/28/, '不应混用斜杠日期');
    assertClean(page);
});

test('学习图鉴：0 结果时不再提示展开卡片', { timeout: 30000 }, async t => {
    // A-12：0 结果时计数仍提示「展开任意一张…」。
    const page = await newPage(t);
    await page.click('#btn-learning');
    await page.waitFor(() => !document.getElementById('learning-panel').classList.contains('hidden'));
    await page.fill('#learning-search', 'zzzz-no-match');
    await page.waitFor(() => document.querySelector('.learning-empty'));
    const text = await page.eval(`document.getElementById('learning-count').textContent`);
    assert.match(text, /没有匹配的牌/, '0 结果应说明没有匹配');
    assert.doesNotMatch(text, /展开任意一张/, '0 结果不应再提示展开');
    assertClean(page);
});

test('档案：关闭面板时提示未保存草稿已丢弃', { timeout: 30000 }, async t => {
    // A-08：关闭面板后草稿仍保留且无提示。
    const page = await newPage(t, { seedStorage: { xingjian_history: [historyRecord()] } });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    await page.click('.history-toggle');
    await page.fill('.history-item.open textarea[data-history-field="note"]', 'E2E 未保存草稿');
    await page.click('#btn-history-close');
    await page.waitForText('#toast', '未保存的笔记草稿已丢弃', 5000);
    assertClean(page);
});

test('分享：新一轮占卜恢复匿名隐私选项', { timeout: 50000 }, async t => {
    // A-13：隐私选项曾跨会话保留 full，下次默认带出问题原文。
    const page = await newPage(t);
    await finishSingleReading(page, 'E2E 隐私复位一');
    await page.click('#btn-share-report');
    await page.waitFor(() => !document.getElementById('share-panel').classList.contains('hidden'));
    await page.eval(`(() => {
        const el = document.querySelector('input[name="share-privacy"][value="full"]');
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.press('Escape');
    await page.waitFor(() => document.getElementById('share-panel').classList.contains('hidden'));
    await page.click('#btn-restart');
    await page.waitFor(() => document.getElementById('step-listen').classList.contains('active'));
    // 测试环境的 Date.now 被固定，600ms 防连点会永久命中；让时钟随真实时间前进。
    await page.eval(`(() => {
        const base = Date.now();
        Date.now = () => base + Math.floor(performance.now());
    })()`);
    await finishSingleReading(page, 'E2E 隐私复位二');
    await page.click('#btn-share-report');
    await page.waitFor(() => !document.getElementById('share-panel').classList.contains('hidden'));
    const checked = await page.eval(`document.querySelector('input[name="share-privacy"]:checked').value`);
    assert.equal(checked, 'private', '新一轮占卜应恢复匿名选项');
    assertClean(page);
});

test('可访问性：触控目标不小于 24px', { timeout: 30000 }, async t => {
    // A11Y-09：音效/每日入口/学习筛选/summary 触控高度曾小于 24px。
    const page = await newPage(t);
    await page.click('#btn-learning');
    await page.waitFor(() => !document.getElementById('learning-panel').classList.contains('hidden'));
    const state = await page.eval(`(() => {
        const ids = ['btn-sound', 'btn-daily-entry'];
        const selectors = ['.learning-filter', '.learning-summary'];
        const items = [
            ...ids.map(id => ({ name: id, el: document.getElementById(id) })),
            ...selectors.map(selector => ({ name: selector, el: document.querySelector(selector) }))
        ];
        return items.filter(item => item.el).map(item => {
            const rect = item.el.getBoundingClientRect();
            return { name: item.name, width: rect.width, height: rect.height };
        });
    })()`);
    for (const item of state) {
        assert.ok(item.height >= 24, `${item.name} 触控高度应至少 24px，实际 ${item.height}`);
    }
    assertClean(page);
});

test('可访问性：页脚免责声明对比度提升', { timeout: 30000 }, async t => {
    // A11Y-12：.disclaimer 曾使用 0.5 alpha，对比度 3.24:1。
    const page = await newPage(t);
    const color = await page.eval(`getComputedStyle(document.querySelector('.disclaimer')).color`);
    assert.match(color, /0\.72\)/, `免责声明应使用更高对比度，实际 ${color}`);
    assertClean(page);
});

test('档案：长问题悬停可查看全文', { timeout: 30000 }, async t => {
    // A11Y-19：长问题只显示省略号，没有全文入口。
    const question = 'E2E 很长的问题'.repeat(10);
    const page = await newPage(t, { seedStorage: { xingjian_history: [historyRecord({ question })] } });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    const title = await page.eval(`document.querySelector('.h-q').title`);
    assert.equal(title, question, '长问题应通过 title 提供全文');
    assertClean(page);
});

test('星图洞察：无牌档案不再显示 0 / 0 张逆位', { timeout: 30000 }, async t => {
    // A-11：没有牌面的档案曾显示「0 / 0 张逆位」。
    const page = await newPage(t, {
        seedStorage: { xingjian_history: [historyRecord({ cards: [], sections: { positions: [], synthesis: '', blessing: '' } })] }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    const text = await page.eval(`document.getElementById('insights-body').textContent`);
    assert.doesNotMatch(text, /0 \/ 0 张逆位/, '没有牌面时不应显示 0 / 0');
    assert.match(text, /还没有可统计的牌面/, '应说明暂无可统计牌面');
    assertClean(page);
});

test('可访问性：减少动效时动画延迟归零', { timeout: 30000 }, async t => {
    // A11Y-18：reduced-motion 下仍保留 0.15–0.9s 的 animation-delay。
    const page = await newPage(t);
    const rule = await page.eval(`(() => {
        const walk = rules => {
            for (const rule of rules) {
                if (rule.cssRules) { const found = walk(rule.cssRules); if (found) return found; }
                if (rule.style && rule.style.getPropertyValue('animation-delay') === '0s'
                    && rule.style.getPropertyPriority('animation-delay') === 'important') {
                    return rule.cssText;
                }
            }
            return '';
        };
        for (const sheet of document.styleSheets) {
            try { const found = walk(sheet.cssRules); if (found) return found; } catch { /* 跨域样式表 */ }
        }
        return '';
    })()`);
    assert.match(rule, /animation-delay:\s*0s\s*!important/, '减少动效时应清除动画延迟');
    assertClean(page);
});

test('可访问性：报告容器有可读名称', { timeout: 30000 }, async t => {
    // A11Y-21：#reading-report 的焦点名曾是一千多字的整篇报告。
    const page = await newPage(t);
    const label = await page.eval(`document.getElementById('reading-report').getAttribute('aria-label')`);
    assert.equal(label, '本次占卜解读报告');
    assertClean(page);
});

test('可访问性：反馈按钮组使用 group 角色', { timeout: 30000 }, async t => {
    // A11Y-22：aria-label 曾用在 generic div 上，读屏器可能忽略。
    const page = await newPage(t);
    const role = await page.eval(`document.querySelector('.quality-feedback').getAttribute('role')`);
    assert.equal(role, 'group');
    assertClean(page);
});

test('可访问性：输入框占位符对比度提升', { timeout: 30000 }, async t => {
    // A11Y-13：placeholder 曾只有 4.31–4.39:1。
    const page = await newPage(t);
    const color = await page.eval(`getComputedStyle(document.getElementById('user-question'), '::placeholder').color`);
    assert.match(color, /0\.66\)/, `占位符应使用更高对比度，实际 ${color}`);
    assertClean(page);
});

test('档案：只展开不编辑时关闭面板不提示草稿丢弃', { timeout: 30000 }, async t => {
    // t7 F1：toggle() 曾把「展开」也标成未保存草稿，关闭面板误报「草稿已丢弃」。
    const page = await newPage(t, { seedStorage: { xingjian_history: [historyRecord()] } });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    await page.click('.history-toggle');
    await page.waitFor(() => document.querySelector('.history-item').classList.contains('open'));
    await page.click('#btn-history-close');
    await page.waitFor(() => document.getElementById('history-panel').classList.contains('hidden'));
    await new Promise(resolve => setTimeout(resolve, 120));
    const toast = await page.eval(`({
        text: document.getElementById('toast').textContent,
        hidden: document.getElementById('toast').classList.contains('hidden')
    })`);
    assert.doesNotMatch(toast.text, /未保存的笔记草稿已丢弃/, '只展开不编辑不应提示草稿被丢弃');
    assert.ok(toast.hidden || !/未保存/.test(toast.text), '关闭后不应出现草稿丢弃 toast');
    assertClean(page);
});

test('AI：只返回祝福时串联保留本地文案', { timeout: 50000 }, async t => {
    // t7 F2：AI 只返回【祝福】时，串联曾回退成整段原文并残留【祝福】字面量。
    const page = await newPage(t, {
        ai: true,
        aiText: '【祝福】\nAI-ONLY-BLESSING'
    });
    await finishSingleReading(page, 'E2E AI 仅祝福');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    const state = await page.eval(`({
        synthesis: document.getElementById('reading-synthesis-text').textContent,
        blessing: document.getElementById('reading-blessing-text').textContent,
        blocks: document.getElementById('reading-blocks').textContent
    })`);
    assert.match(state.blessing, /AI-ONLY-BLESSING/, '祝福应使用 AI 文本');
    assert.doesNotMatch(state.synthesis, /AI-ONLY-BLESSING/, '串联不应重复祝福内容');
    assert.doesNotMatch(state.synthesis, /【祝福】/, '串联不应残留字面量标记');
    assert.match(state.synthesis, /围绕「E2E AI 仅祝福」/, '串联应保留本地解读');
    assert.doesNotMatch(state.blocks, /星见正在感应星轨/, '报告里不应残留占位符');
    assertClean(page);
});

test('UF-04：自动抽牌全程焦点不落到 body，抽满后交给揭示按钮', { timeout: 40000 }, async t => {
    // 审计实测：点「自动抽牌」后按钮被禁用，焦点掉到 BODY，键盘用户丢失位置。
    const page = await newPage(t, { reduceMotion: false });
    await startDraw(page, { question: 'E2E UF-04 焦点', spread: 'single' });
    await page.eval(`(() => {
        window.__focusSamples = [];
        window.__statusSamples = [];
        window.__focusTimer = setInterval(() => {
            const el = document.activeElement;
            window.__focusSamples.push(el ? (el.id || el.tagName) : 'null');
            const status = document.getElementById('draw-status');
            window.__statusSamples.push(status ? status.textContent : '');
        }, 60);
    })()`);
    await page.click('#btn-auto-draw');
    await page.waitFor(() => !document.getElementById('btn-go-reveal').classList.contains('hidden'), 30000);
    const samples = await page.eval(`(() => {
        clearInterval(window.__focusTimer);
        return {
            focus: window.__focusSamples,
            status: window.__statusSamples,
            active: document.activeElement.id,
            statusText: document.getElementById('draw-status').textContent
        };
    })()`);
    assert.ok(samples.focus.length > 3, '应采集到抽牌过程中的焦点样本');
    assert.ok(!samples.focus.includes('BODY') && !samples.focus.includes('null'),
        `自动抽牌期间焦点不应落到 body：${samples.focus.join(',')}`);
    assert.ok(samples.status.some(text => /已抽取/.test(text)), '抽牌期间状态区应可感知进度');
    assert.equal(samples.active, 'btn-go-reveal', '抽满后焦点应交给「揭示天机」');
    assert.match(samples.statusText, /所有位置已落牌/);
    assertClean(page);
});

test('UF-07：问题按码点计数，emoji 计 1，超限明确提示', { timeout: 30000 }, async t => {
    // 审计实测：120 个 emoji 按 UTF-16 只算 100，且超限被 maxlength 静默截断。
    const page = await newPage(t);
    await page.fill('#user-question', '🌟'.repeat(120));
    let state = await page.eval(`({
        value: document.getElementById('user-question').value,
        counter: document.getElementById('question-counter').textContent
    })`);
    assert.equal([...state.value].length, 120, 'emoji 应按码点计数，不应被截成 100');
    assert.match(state.counter, /120 \/ 200/);

    await page.fill('#user-question', '长'.repeat(210));
    state = await page.eval(`({
        value: document.getElementById('user-question').value,
        counter: document.getElementById('question-counter').textContent,
        toast: document.getElementById('toast').textContent
    })`);
    assert.equal([...state.value].length, 200, '超限应按码点截断到 200');
    assert.match(state.counter, /200 \/ 200/);
    assert.match(state.toast, /最多 200 字/, '超限时应明确提示而不是静默截断');
    assertClean(page);
});

test('UF-09：追问 Enter 发送、Shift+Enter 换行且保留多行', { timeout: 50000 }, async t => {
    // 审计实测：单行 input 无法换行，Shift+Enter 等同 Enter。
    const page = await newPage(t, { ai: true });
    await finishSingleReading(page, 'E2E UF-09 多行追问');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    await page.fill('#ai-chat-input', '第一行');
    await page.press('Enter', { modifiers: 8 });
    const afterShift = await page.eval(`({
        value: document.getElementById('ai-chat-input').value,
        height: document.getElementById('ai-chat-input').style.height
    })`);
    assert.match(afterShift.value, /第一行\n/, 'Shift+Enter 应插入换行而不是发送');
    assert.ok(afterShift.height && parseFloat(afterShift.height) > 0, 'textarea 应自动调整高度');

    await page.eval(`(() => {
        const el = document.getElementById('ai-chat-input');
        el.setRangeText('第二行', el.value.length, el.value.length, 'end');
        el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const callsBefore = mock.state.chatCalls;
    await page.press('Enter');
    await page.waitFor(() => document.querySelectorAll('#ai-chat-messages .ai-msg.user').length === 1, 10000);
    const sent = await page.eval(`({
        text: document.querySelector('#ai-chat-messages .ai-msg.user').textContent,
        value: document.getElementById('ai-chat-input').value,
        whiteSpace: getComputedStyle(document.querySelector('#ai-chat-messages .ai-msg.user')).whiteSpace
    })`);
    assert.equal(sent.text, '第一行\n第二行', '多行内容不应被压成空格');
    assert.equal(sent.value, '', '发送后输入框应清空');
    assert.equal(sent.whiteSpace, 'pre-wrap');
    assert.equal(mock.state.chatCalls, callsBefore + 1, 'Enter 应触发一次发送');
    assertClean(page);
});

test('A11Y-10：320×568 下正文与标签字号不小于 12px 且无横向滚动', { timeout: 40000 }, async t => {
    // 审计实测：320×568 学习面板有 355 个 <12px 节点。
    const page = await newPage(t, { width: 320, height: 568, mobile: true });
    await page.click('#btn-learning');
    await page.waitFor(() => !document.getElementById('learning-panel').classList.contains('hidden'));
    const tiny = await page.eval(`(() => {
        const roots = ['learning-panel', 'step-listen'].map(id => document.getElementById(id)).filter(Boolean);
        const out = [];
        const seen = new Set();
        roots.forEach(root => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const text = (node.textContent || '').trim();
                if (!text) continue;
                const el = node.parentElement;
                if (!el || seen.has(el)) continue;
                seen.add(el);
                if (el.closest('.sr-only')) continue;
                const style = getComputedStyle(el);
                if (style.visibility === 'hidden' || style.display === 'none') continue;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                const size = parseFloat(style.fontSize);
                if (size < 11.99) out.push({ tag: el.tagName, cls: String(el.className || ''), size, text: text.slice(0, 12) });
            }
        });
        return out;
    })()`);
    assert.deepEqual(tiny, [], `存在小于 12px 的可见文本：${JSON.stringify(tiny.slice(0, 10))}`);
    await assertNoHorizontalOverflow(page, ['#step-listen', '#learning-panel', '#learning-panel .learning-panel-inner'], '320px 学习面板');

    // 报告页同样要覆盖：复盘反馈里的 small 曾因 UA 0.833em 落到 10.13px。
    await page.click('#btn-learning-close');
    await page.waitFor(() => document.getElementById('learning-panel').classList.contains('hidden'));
    await finishSingleReading(page, 'E2E A11Y-10 报告字号');
    await page.waitFor(() => !document.getElementById('reading-report').classList.contains('hidden'), 10000);
    const tinyReport = await page.eval(`(() => {
        const root = document.getElementById('reading-report');
        const out = [];
        const seen = new Set();
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const text = (node.textContent || '').trim();
            if (!text) continue;
            const el = node.parentElement;
            if (!el || seen.has(el)) continue;
            seen.add(el);
            if (el.closest('.sr-only')) continue;
            const style = getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const size = parseFloat(style.fontSize);
            if (size < 11.99) out.push({ tag: el.tagName, cls: String(el.className || ''), size, text: text.slice(0, 12) });
        }
        return out;
    })()`);
    assert.deepEqual(tinyReport, [], `报告页存在小于 12px 的可见文本：${JSON.stringify(tinyReport.slice(0, 10))}`);
    const feedbackSmall = await page.eval(`parseFloat(getComputedStyle(document.querySelector('.quality-feedback small')).fontSize)`);
    assert.ok(feedbackSmall >= 11.99, `复盘反馈小字应不小于 12px，实际 ${feedbackSmall}`);
    assertClean(page);
});

test('A11Y-11：568×320 横屏页头不高于 140px 且内部不溢出', { timeout: 30000 }, async t => {
    // 审计实测：header 191px，内部横向溢出 5px，首屏内容被挤出。
    const page = await newPage(t, { width: 568, height: 320, mobile: true });
    const metrics = await page.eval(`(() => {
        const header = document.querySelector('.app-header');
        const listen = document.getElementById('step-listen');
        const input = document.getElementById('user-question');
        const profile = document.querySelector('.oracle-profile');
        const rect = header.getBoundingClientRect();
        return {
            headerHeight: rect.height,
            headerOverflow: header.scrollWidth - header.clientWidth,
            listenOverflow: listen.scrollWidth - listen.clientWidth,
            subtitle: getComputedStyle(document.querySelector('.subtitle')).display,
            profileTop: profile.getBoundingClientRect().top,
            profileBottom: profile.getBoundingClientRect().bottom,
            inputTop: input.getBoundingClientRect().top,
            inputBottom: input.getBoundingClientRect().bottom,
            viewport: innerHeight
        };
    })()`);
    assert.ok(metrics.headerHeight <= 140, `页头高度应 ≤140px，实际 ${metrics.headerHeight}`);
    assert.ok(metrics.headerOverflow <= 1, `页头内部不应横向溢出，实际 ${metrics.headerOverflow}`);
    assert.ok(metrics.listenOverflow <= 1, `首屏不应横向溢出，实际 ${metrics.listenOverflow}`);
    assert.equal(metrics.subtitle, 'none', '横屏小屏应隐藏副标题');
    assert.ok(metrics.profileTop < metrics.viewport && metrics.profileBottom > 0, '首屏应能看到占卜入口内容');
    // 关键：必须在任何滚动之前断言，否则 scrollIntoView 会掩盖首屏放不下的问题。
    assert.ok(metrics.inputTop >= 0 && metrics.inputBottom <= metrics.viewport,
        `首屏问答输入应完整可见，实际 top=${metrics.inputTop} bottom=${metrics.inputBottom} viewport=${metrics.viewport}`);
    await page.eval(`document.getElementById('user-question').scrollIntoView({ block: 'center' })`);
    const input = await page.eval(`(() => {
        const rect = document.getElementById('user-question').getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, viewport: innerHeight };
    })()`);
    assert.ok(input.top >= 0 && input.bottom <= input.viewport, '滚动后问答输入应完整可见');
    assertClean(page);
});

test('AI-06：生成中显示进度与取消，取消后保留本地解读', { timeout: 60000 }, async t => {
    const page = await newPage(t, { ai: true, delayMs: 4000 });
    await finishSingleReading(page, 'E2E AI-06 取消');
    await page.waitFor(() => !document.getElementById('ai-progress').classList.contains('hidden'), 10000);
    const progress = await page.eval(`({
        text: document.getElementById('ai-progress-text').textContent,
        cancelVisible: !document.getElementById('btn-ai-cancel').classList.contains('hidden')
    })`);
    assert.match(progress.text, /已等待 \d+ 秒/, '生成中应显示已等待秒数');
    assert.ok(progress.cancelVisible, '生成中应提供取消按钮');

    await page.click('#btn-ai-cancel');
    await page.waitFor(() => document.getElementById('ai-progress').classList.contains('hidden'), 10000);
    const state = await page.eval(`({
        source: document.getElementById('report-source').textContent,
        footer: document.getElementById('report-source-footer-text').textContent,
        blocks: document.getElementById('reading-blocks').textContent,
        toast: document.getElementById('toast').textContent,
        history: JSON.parse(localStorage.getItem('xingjian_history') || '[]')
    })`);
    assert.equal(state.source, '本地解读');
    assert.equal(state.footer, '本地解读');
    assert.doesNotMatch(state.blocks, /星见正在感应星轨/, '取消后不应残留占位符');
    assert.match(state.toast, /已取消 AI 生成/);
    assert.equal(state.history.length, 1, '取消后应保留一条档案');
    assert.equal(state.history[0].ai, false, '取消后档案应标记为本地解读');
    // 焦点移交发生在 finally 里，等它真正落到报告容器再断言，避免读到取消按钮的旧焦点。
    await page.waitFor(() => document.activeElement && document.activeElement.id === 'reading-report', 3000);
    const focus = await page.eval(`({
        id: document.activeElement.id,
        tag: document.activeElement.tagName,
        insideProgress: document.getElementById('ai-progress').contains(document.activeElement),
        progressHidden: document.getElementById('ai-progress').classList.contains('hidden'),
        cancelOffsetParent: document.getElementById('btn-ai-cancel').offsetParent
    })`);
    assert.equal(focus.id, 'reading-report', '取消后焦点应移到报告容器');
    assert.equal(focus.insideProgress, false, '取消后焦点不应留在已隐藏的进度区');
    assert.equal(focus.progressHidden, true, '取消后进度条应隐藏');
    assert.equal(focus.cancelOffsetParent, null, '取消后取消按钮应不可见');
    assertClean(page);
});

test('AI-06：AI 超时提示明确并回退本地解读', { timeout: 60000 }, async t => {
    const page = await newPage(t, {
        ai: true,
        delayMs: 5000,
        extraInit: 'window.__XINGJIAN_AI_TIMEOUT_MS = 400;'
    });
    await finishSingleReading(page, 'E2E AI-06 超时');
    await page.waitFor(() => /超时/.test(document.getElementById('toast').textContent), 15000);
    const state = await page.eval(`({
        toast: document.getElementById('toast').textContent,
        source: document.getElementById('report-source').textContent,
        retry: !document.getElementById('btn-ai-retry').classList.contains('hidden')
    })`);
    assert.match(state.toast, /AI 回应超时（\d+ 秒）/, '超时提示应包含等待秒数');
    assert.equal(state.source, '本地解读');
    assert.ok(state.retry, '超时后应给出重试入口');
    const timeoutFocus = await page.eval(`({ id: document.activeElement.id, tag: document.activeElement.tagName })`);
    assert.notEqual(timeoutFocus.tag, 'BODY', '超时后焦点不应掉到 BODY');
    assertClean(page);
});

test('AI-07：长解读保存时提示已精简', { timeout: 60000 }, async t => {
    const longText = '【牌1】\n' + '长'.repeat(2500) + '\n【串联】\n短串联\n【祝福】\n短祝福';
    const page = await newPage(t, { ai: true, aiText: longText });
    await finishSingleReading(page, 'E2E AI-07 长文');
    await page.waitFor(() => /已精简/.test(document.getElementById('toast').textContent), 15000);
    const state = await page.eval(`({
        toast: document.getElementById('toast').textContent,
        record: JSON.parse(localStorage.getItem('xingjian_history') || '[]')[0]
    })`);
    assert.match(state.toast, /部分解读内容过长，已精简保存/);
    assert.equal([...state.record.sections.positions[0].text].length, 2000, '落盘应按码点截断到 2000');
    assertClean(page);
});

test('AI-07：导入超长解读时告知被精简的条数', { timeout: 30000 }, async t => {
    const page = await newPage(t);
    const longRecord = historyRecord({
        id: 'e2e-overlong',
        sections: {
            positions: [{ name: '核心启示', text: '长'.repeat(2500) }],
            synthesis: '短串联',
            blessing: '短祝福'
        }
    });
    await page.click('#btn-history');
    await page.waitFor(() => !document.getElementById('history-panel').classList.contains('hidden'));
    await importJsonFile(page, '#history-import-file', { app: 'xingjian-tarot', version: 2, history: [longRecord] });
    await page.waitFor(() => /已精简/.test(document.getElementById('toast').textContent), 10000);
    const toast = await page.eval(`document.getElementById('toast').textContent`);
    assert.match(toast, /1 条解读内容过长已精简/);
    assertClean(page);
});

test('AI-10：追问草稿刷新后恢复且不写入长期存储', { timeout: 60000 }, async t => {
    const page = await newPage(t, { ai: true });
    await finishSingleReading(page, 'E2E AI-10 草稿');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    const chatHeight = await page.eval(`document.getElementById('ai-chat-input').getBoundingClientRect().height`);
    assert.ok(chatHeight >= 40, `追问输入框首次显示应有正常高度，实际 ${chatHeight}`);

    // UF-07 追问侧：按码点计数 + 超限提示。
    await page.fill('#ai-chat-input', '长'.repeat(510));
    let chatState = await page.eval(`({
        value: document.getElementById('ai-chat-input').value,
        counter: document.getElementById('ai-chat-counter').textContent,
        toast: document.getElementById('toast').textContent
    })`);
    assert.equal([...chatState.value].length, 500, '追问应按码点截断到 500');
    assert.match(chatState.counter, /500 \/ 500/);
    assert.match(chatState.toast, /最多 500 字/);

    await page.fill('#ai-chat-input', '隐私草稿-不要落盘');
    const before = await page.eval(`({
        session: sessionStorage.getItem('xingjian_chat_draft'),
        localKeys: Object.keys(localStorage)
    })`);
    assert.equal(before.session, '隐私草稿-不要落盘', '草稿应写入 sessionStorage');
    assert.ok(!before.localKeys.some(key => /draft|草稿/i.test(key)), '草稿不应写入 localStorage');

    await page.goto(mock.baseUrl + '/');
    const restored = await page.eval(`document.getElementById('ai-chat-input').value`);
    assert.equal(restored, '隐私草稿-不要落盘', '刷新后应恢复追问草稿');
    assertClean(page);
});

test('AI-02：429 显示冷却倒计时，结束后自动恢复', { timeout: 60000 }, async t => {
    const page = await newPage(t, { ai: true, failNext: 1, failStatus: 429, retryAfter: 3 });
    await finishSingleReading(page, 'E2E AI-02 冷却');
    await page.waitFor(() => !document.getElementById('btn-ai-retry').classList.contains('hidden'), 10000);
    let state = await page.eval(`({
        toast: document.getElementById('toast').textContent,
        disabled: document.getElementById('btn-ai-retry').disabled,
        label: document.getElementById('btn-ai-retry').textContent,
        source: document.getElementById('report-source').textContent
    })`);
    assert.match(state.toast, /请求过于频繁，请 3 秒后再试/);
    assert.equal(state.disabled, true, '冷却期间重试按钮应禁用');
    assert.match(state.label, /冷却中 \d+ 秒/);
    assert.equal(state.source, '本地解读');

    await new Promise(resolve => setTimeout(resolve, 3600));
    state = await page.eval(`({
        disabled: document.getElementById('btn-ai-retry').disabled,
        label: document.getElementById('btn-ai-retry').textContent
    })`);
    assert.equal(state.disabled, false, '冷却结束后按钮应自动恢复');
    assert.doesNotMatch(state.label, /冷却中/);
    assertClean(page, [/429/]);
});

test('AI-02：追问 429 时禁用发送并显示冷却倒计时', { timeout: 60000 }, async t => {
    const page = await newPage(t, { ai: true });
    await finishSingleReading(page, 'E2E AI-02 追问冷却');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    mock.state.failNext = 1;
    mock.state.failStatus = 429;
    mock.state.retryAfter = 2;
    await page.fill('#ai-chat-input', 'E2E 追问 429');
    await page.click('#ai-chat-send');
    await page.waitFor(() => document.querySelector('#ai-chat-messages .ai-msg.error'), 10000);
    let state = await page.eval(`({
        disabled: document.getElementById('ai-chat-send').disabled,
        label: document.getElementById('ai-chat-send').textContent,
        error: (document.querySelector('#ai-chat-messages .ai-msg.error') || {}).textContent || '',
        toast: document.getElementById('toast').textContent
    })`);
    assert.equal(state.disabled, true);
    assert.match(state.label, /冷却中 \d+ 秒/);
    assert.match(state.error, /请求过于频繁，请 2 秒后再试/);
    assert.match(state.toast, /请求过于频繁/);

    await new Promise(resolve => setTimeout(resolve, 2600));
    state = await page.eval(`({
        disabled: document.getElementById('ai-chat-send').disabled,
        label: document.getElementById('ai-chat-send').textContent
    })`);
    assert.equal(state.disabled, false);
    assert.doesNotMatch(state.label, /冷却中/);
    assertClean(page, [/429/]);
});

test('AI-03：追问气泡与报告正文字号同一层级', { timeout: 50000 }, async t => {
    const page = await newPage(t, { ai: true });
    await finishSingleReading(page, 'E2E AI-03 字号');
    await page.waitFor(() => !document.getElementById('ai-chat-block').classList.contains('hidden'), 10000);
    await page.fill('#ai-chat-input', '字号对比');
    await page.click('#ai-chat-send');
    await page.waitFor(() => document.querySelectorAll('#ai-chat-messages .ai-msg.xingjian').length >= 1, 10000);
    const sizes = await page.eval(`({
        bubble: parseFloat(getComputedStyle(document.querySelector('#ai-chat-messages .ai-msg.xingjian')).fontSize),
        body: parseFloat(getComputedStyle(document.querySelector('#reading-blocks .block-text')).fontSize)
    })`);
    assert.equal(sizes.bubble, sizes.body, '追问气泡应与报告正文同字号');
    assert.ok(sizes.bubble >= 16, `字号不应低于 16px，实际 ${sizes.bubble}`);
    assertClean(page);
});

test('AI-04：长报告滚动后仍能看到来源标注', { timeout: 60000 }, async t => {
    const page = await newPage(t, { ai: true, longAi: true });
    await finishSingleReading(page, 'E2E AI-04 来源');
    await page.waitFor(() => /AI 解读/.test(document.getElementById('report-source').textContent), 15000);
    await page.eval(`(() => {
        const report = document.getElementById('reading-report');
        report.scrollIntoView({ block: 'start' });
        window.scrollBy(0, 900);
    })()`);
    await new Promise(resolve => setTimeout(resolve, 300));
    const state = await page.eval(`(() => {
        const badge = document.getElementById('report-source').getBoundingClientRect();
        return {
            top: badge.top,
            bottom: badge.bottom,
            viewport: innerHeight,
            footer: document.getElementById('report-source-footer-text').textContent
        };
    })()`);
    assert.ok(state.top >= 0 && state.bottom <= state.viewport,
        `滚动到报告中段后来源徽标仍应在视口内：${JSON.stringify(state)}`);
    assert.equal(state.footer, 'AI 解读', '来源徽标不应暴露具体模型名称');
    assertClean(page);
});

test('Q-01：星图洞察不再作为 live region 重复播报', { timeout: 30000 }, async t => {
    const page = await newPage(t);
    const state = await page.eval(`({
        insightsLive: document.getElementById('insights-body').getAttribute('aria-live'),
        summaryRole: document.getElementById('history-review-summary').getAttribute('role')
    })`);
    assert.equal(state.insightsLive, null, '洞察区不应整体作为 live region');
    assert.equal(state.summaryRole, 'status', '摘要行应承担播报职责');
    assertClean(page);
});

test('AI-06：超时使用单一 deadline，响应头与响应体分段延迟不会翻倍', { timeout: 60000 }, async t => {
    // 修复前 armTimeout 在响应头到达后会重置完整 limit，最坏等 2×limit。
    const extraInit = `(() => {
        window.__XINGJIAN_AI_TIMEOUT_MS = 2000;
        const OrigAC = window.AbortController;
        window.AbortController = class extends OrigAC {
            constructor() { super(); window.__lastAC = this; }
        };
        const origFetch = window.fetch;
        window.fetch = async (url, opts) => {
            const isChat = String(url).includes('/api/chat');
            if (isChat && window.__aiFetchStart === undefined) window.__aiFetchStart = performance.now();
            const r = await origFetch(url, opts);
            if (!isChat) return r;
            const origJson = r.json.bind(r);
            r.json = () => new Promise((resolve, reject) => {
                const signal = window.__lastAC && window.__lastAC.signal;
                const timer = setTimeout(() => { origJson().then(resolve, reject); }, 2200);
                if (signal) signal.addEventListener('abort', () => {
                    clearTimeout(timer);
                    const err = new Error('aborted');
                    err.name = 'AbortError';
                    reject(err);
                }, { once: true });
            });
            return r;
        };
    })()`;
    const page = await newPage(t, { ai: true, delayMs: 1200, extraInit });
    await finishSingleReading(page, 'E2E AI-06 单一超时');
    await page.waitFor(() => /超时/.test(document.getElementById('toast').textContent), 15000);
    const state = await page.eval(`({
        elapsed: performance.now() - window.__aiFetchStart,
        toast: document.getElementById('toast').textContent
    })`);
    assert.match(state.toast, /AI 回应超时（2 秒）/);
    assert.ok(state.elapsed <= 2300, `总等待不应超过 1.15×limit，实际 ${state.elapsed.toFixed(0)}ms`);
    assertClean(page);
});

test('AI-06：旧局请求晚到不会清掉新局的进度与保存锁', { timeout: 120000 }, async t => {
    // 第一局请求忽略 abort 并延迟 6s；返回首页后开第二局（延迟 12s）。
    // 第一局 settle 时第二局仍在生成，旧 finally 不得清掉新局的进度/保存锁。
    const extraInit = `(() => {
        // 同一页面连续两次提问：E2E 固定时钟会让 600ms 防连点判断永远命中，
        // 这里让 Date.now 跟随单调时钟前进（new Date() 仍固定，日期逻辑不变）。
        const base = Date.now();
        const started = performance.now();
        Date.now = () => base + (performance.now() - started);
        window.__tl = { settled1: false };
        let chatCount = 0;
        const origFetch = window.fetch;
        window.fetch = (url, opts) => {
            if (String(url).includes('/api/chat')) {
                chatCount++;
                const n = chatCount;
                const next = Object.assign({}, opts);
                if (n === 1) delete next.signal;
                return origFetch(url, next).then(r => new Promise(resolve => {
                    setTimeout(() => {
                        // 第一局请求真正交还给页面时打点，供用例等待，代替固定 sleep。
                        if (n === 1) window.__tl.settled1 = true;
                        resolve(r);
                    }, n === 1 ? 6000 : 12000);
                }));
            }
            return origFetch(url, opts);
        };
    })()`;
    const page = await newPage(t, { ai: true, extraInit });
    await finishSingleReading(page, 'E2E 跨局第一局');
    await page.waitFor(() => !document.getElementById('ai-progress').classList.contains('hidden'), 10000);
    await page.click('#btn-reveal-back');
    await page.waitFor(() => document.getElementById('step-listen').classList.contains('active'), 10000);
    await finishSingleReading(page, 'E2E 跨局第二局');
    await page.waitFor(() => !document.getElementById('ai-progress').classList.contains('hidden'), 10000);
    // 等第一局请求真正 settle（约 6s），此时第二局仍在生成；不用固定 sleep 猜时间。
    await page.waitFor(() => window.__tl && window.__tl.settled1 === true, 20000);
    // 让旧局的 catch/finally 微任务与两帧渲染跑完，再检查新局状态。
    await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const mid = await page.eval(`({
        progressHidden: document.getElementById('ai-progress').classList.contains('hidden'),
        progressText: document.getElementById('ai-progress-text').textContent,
        saveDisabled: document.getElementById('btn-save-report').disabled,
        aiLock: document.getElementById('btn-save-report').dataset.aiLock || null
    })`);
    assert.equal(mid.progressHidden, false, '旧局 settle 后新局进度条应仍可见');
    assert.match(mid.progressText, /已等待 \d+ 秒/, '新局计时不应被旧局清掉');
    assert.equal(mid.saveDisabled, true, '新局生成中应保持保存锁定');
    assert.equal(mid.aiLock, '1', '新局生成中应保持 aiLock');
    await page.waitFor(() => /AI 解读/.test(document.getElementById('report-source').textContent), 30000);
    const history = await page.eval(`JSON.parse(localStorage.getItem('xingjian_history') || '[]')`);
    assert.equal(history.length, 2, '两局应各留一条档案');
    assert.equal(new Set(history.map(record => record.id)).size, 2, '两局档案不应重复');
    assertClean(page);
});

test('AI-06：取消在途 AI 后回看每日档案，保存长图仍可用', { timeout: 90000 }, async t => {
    // 回归 F6：旧请求的 finally 被 session 守卫跳过后，保存锁必须由切局点主动清掉；
    // 每日回看的复用分支直接 return，也要兜底清锁，否则保存长图永久禁用。
    const dailyRecord = historyRecord({
        id: 'e2e-daily-lock',
        time: '2026-10-28T02:00:00.000Z',
        question: '今日指引 · 2026年10月28日',
        category: 'general',
        spreadId: 'daily',
        spread: '每日一抽',
        dailyDate: FIXED_DAY,
        ai: false,
        cards: [{ position: '今日指引', name: '逆位·命运之轮' }],
        sections: {
            positions: [{ name: '今日指引', text: 'E2E 每日回看解读' }],
            synthesis: 'E2E 每日回看串联',
            blessing: 'E2E 每日回看祝福'
        }
    });
    const page = await newPage(t, {
        ai: true,
        delayMs: 4000,
        seedStorage: {
            xingjian_daily: {
                date: FIXED_DAY,
                lastDrawDate: '2026-10-27',
                streak: 4,
                cards: [{ cardId: 'm10', orientation: 'reversed' }]
            },
            xingjian_history: [dailyRecord]
        }
    });
    // 第一局 AI 生成中直接返回首页：旧请求稍后 settle 时 session 已变，finally 会跳过。
    await finishSingleReading(page, 'E2E 保存锁第一局');
    await page.waitFor(() => !document.getElementById('ai-progress').classList.contains('hidden'), 10000);
    await page.click('#btn-reveal-back');
    await page.waitFor(() => document.getElementById('step-listen').classList.contains('active'), 10000);

    // 回看今日牌：复用档案，不发起新的 AI 请求。
    await page.click('#btn-daily');
    await page.waitFor(() => !document.getElementById('reading-report').classList.contains('hidden'), 10000);
    const before = await page.eval(`({
        disabled: document.getElementById('btn-save-report').disabled,
        aiLock: document.getElementById('btn-save-report').dataset.aiLock || null
    })`);
    assert.equal(before.disabled, false, '复用档案后保存按钮应可用');
    assert.equal(before.aiLock, null, '复用档案后不应残留 aiLock');

    // 点击保存：若被 .ai-generating 守卫拦截会弹「还在编织解读」，这里必须真正开始导出。
    await page.click('#btn-save-report');
    await page.waitFor(() => window.__e2e.downloads.length > 0, 60000);
    const toast = await page.eval(`document.getElementById('toast').textContent`);
    assert.doesNotMatch(toast, /还在编织解读/, '保存不应被 AI 生成守卫拦截');
    assertClean(page);
});
