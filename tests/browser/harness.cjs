'use strict';

/**
 * 零依赖浏览器回归测试工具。
 *
 * 设计边界：
 * - 只启动本机临时静态服务器和 headless Chrome，不连接真实模型网关；
 * - 固定时间、固定随机种子、固定 localStorage 测试数据；
 * - 通过 Chrome DevTools Protocol 驱动页面，不要求 npm install。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const FIXED_NOW = Date.parse('2026-10-28T02:00:00.000Z'); // Asia/Shanghai 10:00
const FIXED_DAY = '2026-10-28';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const ROOT_FILES = new Set([
    '/', '/index.html', '/style.css', '/app.js', '/cards.js', '/features.js', '/insights.js',
    '/learning.js', '/audio.js'
]);

// 与 server.js 的白名单保持一致：只放行页面真正需要的牌面 WebP/SVG、加载清单、
// 分享图与 vendor。母版（tarot-cards/、masters/）、授权文档与生成脚本一律 404。
// 测试服务器比生产宽松会掩盖「页面请求了白名单外资源」这类回归。
const ASSET_FILES = new Set(['/assets/share-card.png', '/assets/cards/manifest.js']);
const CARD_ASSET_PREFIXES = ['/assets/cards/webp/', '/assets/cards/fallback/'];

function isAssetAllowed(pathname) {
    return ASSET_FILES.has(pathname)
        || CARD_ASSET_PREFIXES.some(prefix => pathname.startsWith(prefix))
        || pathname.startsWith('/vendor/');
}

function sendJson(res, status, value, headers = {}) {
    const body = JSON.stringify(value);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...headers
    });
    res.end(body);
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function mockAiText(long = false) {
    const sections = [];
    const longTail = long
        ? `这是一段用于验证长文本排版的固定内容。它不会访问真实模型网关，只检查报告在窄屏下是否换行、是否出现横向溢出，以及逐位解读和串联是否仍然完整。${'保持可读、允许暂停、把选择交还给使用者。'.repeat(30)}`
        : '';
    for (let index = 1; index <= 10; index++) {
        sections.push(`【牌${index}】\nE2E-MOCK-AI-${index}：这是固定测试解读，用来验证重试会更新同一条档案，而不是新增记录。${longTail}`);
    }
    sections.push(`【串联】\nE2E-MOCK-SYNTHESIS：固定测试串联内容，不访问真实模型网关。${longTail}`);
    sections.push(`【祝福】\nE2E-MOCK-BLESSING：把注意力放回今天可以完成的一小步。${longTail}`);
    return sections.join('\n');
}

async function startMockServer() {
    const state = {
        aiAvailable: false,
        failNext: 0,
        failStatus: 502,
        retryAfter: 0,
        longAi: false,
        chatCalls: 0,
        configCalls: 0,
        lastChatBody: null,
        usage: {},
        delayMs: 0,
        aiText: null
    };

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const pathname = decodeURIComponent(url.pathname);

        if (pathname === '/api/config') {
            state.configCalls++;
            // 与真实 server 保持一致：只告知是否在线，不下发模型名。
            return sendJson(res, 200, { ai: state.aiAvailable });
        }

        if (pathname === '/api/usage') {
            return sendJson(res, 200, state.usage);
        }

        if (pathname === '/api/chat') {
            if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
            state.chatCalls++;
            const raw = await readRequestBody(req);
            try { state.lastChatBody = JSON.parse(raw); } catch { state.lastChatBody = raw; }
            if (state.failNext > 0) {
                state.failNext--;
                const headers = {};
                if (state.retryAfter > 0) headers['Retry-After'] = String(state.retryAfter);
                return sendJson(res, state.failStatus || 502, { error: 'E2E 固定失败一次' }, headers);
            }
            if (state.delayMs > 0) await new Promise(resolve => setTimeout(resolve, state.delayMs));
            return sendJson(res, 200, {
                output: [{ type: 'message', content: [{ type: 'output_text', text: state.aiText || mockAiText(state.longAi) }] }]
            });
        }

        if (pathname === '/__test/reset') {
            state.aiAvailable = url.searchParams.get('ai') === '1';
            state.failNext = Number(url.searchParams.get('failNext')) || 0;
            state.longAi = url.searchParams.get('longAi') === '1';
            state.chatCalls = 0;
            state.configCalls = 0;
            state.lastChatBody = null;
            state.usage = {};
            return sendJson(res, 200, { ok: true });
        }

        if (pathname === '/__test/state') {
            return sendJson(res, 200, {
                aiAvailable: state.aiAvailable,
                failNext: state.failNext,
                longAi: state.longAi,
                chatCalls: state.chatCalls,
                configCalls: state.configCalls,
                lastChatBody: state.lastChatBody
            });
        }

        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });

        let filePath = null;
        if (ROOT_FILES.has(pathname)) {
            filePath = path.join(PROJECT_ROOT, pathname === '/' ? 'index.html' : pathname.slice(1));
        } else if (pathname.startsWith('/assets/') || pathname.startsWith('/vendor/')) {
            const normalized = path.posix.normalize(pathname);
            if (!isAssetAllowed(normalized)) {
                return sendJson(res, 404, { error: 'not found' });
            }
            filePath = path.join(PROJECT_ROOT, normalized.slice(1));
        }

        if (!filePath) return sendJson(res, 404, { error: 'not found' });
        const relative = path.relative(PROJECT_ROOT, filePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return sendJson(res, 403, { error: 'forbidden' });
        }

        fs.readFile(filePath, (err, data) => {
            if (err) return sendJson(res, 404, { error: 'not found' });
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            res.end(data);
        });
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    const port = server.address().port;
    return {
        state,
        baseUrl: `http://127.0.0.1:${port}`,
        async reset(options = {}) {
            state.aiAvailable = Boolean(options.ai);
            state.failNext = Number(options.failNext) || 0;
            state.failStatus = Number(options.failStatus) || 502;
            state.retryAfter = Number(options.retryAfter) || 0;
            state.longAi = Boolean(options.longAi);
            state.chatCalls = 0;
            state.configCalls = 0;
            state.lastChatBody = null;
            state.usage = options.usage && typeof options.usage === 'object' ? options.usage : {};
            state.delayMs = Number(options.delayMs) || 0;
            state.aiText = typeof options.aiText === 'string' ? options.aiText : null;
        },
        async close() {
            await new Promise(resolve => server.close(resolve));
        }
    };
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

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Set();
        ws.addEventListener('message', event => {
            let message;
            try { message = JSON.parse(String(event.data)); } catch { return; }
            if (message.id) {
                const pending = this.pending.get(message.id);
                if (!pending) return;
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
                else pending.resolve(message.result);
                return;
            }
            for (const listener of this.listeners) listener(message);
        });
        ws.addEventListener('close', () => {
            for (const pending of this.pending.values()) pending.reject(new Error('CDP connection closed'));
            this.pending.clear();
        });
    }

    static connect(url) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            const timer = setTimeout(() => reject(new Error('CDP 连接超时')), 10000);
            ws.addEventListener('open', () => {
                clearTimeout(timer);
                resolve(new CDP(ws));
            }, { once: true });
            ws.addEventListener('error', () => {
                clearTimeout(timer);
                reject(new Error('CDP 连接失败'));
            }, { once: true });
        });
    }

    send(method, params = {}, sessionId) {
        const id = this.nextId++;
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify(payload));
        });
    }

    on(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    close() {
        try { this.ws.close(); } catch { /* ignore */ }
    }
}

function buildInitScript({ seedStorage = {}, fixedNow = FIXED_NOW }) {
    const storage = JSON.stringify(seedStorage);
    return `(() => {
        const FIXED_NOW = ${fixedNow};
        const RealDate = Date;
        class E2EDate extends RealDate {
            constructor(...args) {
                if (args.length === 0) super(FIXED_NOW);
                else super(...args);
            }
            static now() { return FIXED_NOW; }
        }
        window.Date = E2EDate;

        let seed = 0x9e3779b9;
        Math.random = function () {
            seed ^= seed << 13;
            seed ^= seed >>> 17;
            seed ^= seed << 5;
            return (seed >>> 0) / 4294967296;
        };

        window.__e2e = { fixedNow: FIXED_NOW, downloads: [], lastBlob: null };
        const originalCreateObjectURL = URL.createObjectURL.bind(URL);
        URL.createObjectURL = function (blob) {
            window.__e2e.lastBlob = blob;
            return originalCreateObjectURL(blob);
        };
        const originalAnchorClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
            if (this.download) {
                window.__e2e.downloads.push({ name: this.download, href: this.href });
                return;
            }
            return originalAnchorClick.call(this);
        };

        try {
            if (!sessionStorage.getItem('__e2e_seeded')) {
                localStorage.clear();
                const seedStorage = ${storage};
                for (const [key, value] of Object.entries(seedStorage)) {
                    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                }
                sessionStorage.setItem('__e2e_seeded', '1');
            }
        } catch (error) {
            console.warn('E2E seed failed', error);
        }
    })();`;
}

async function launchBrowser() {
    const chrome = findChrome();
    if (!chrome) throw new Error('未找到 Chrome/Edge，无法运行浏览器回归测试。');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xingjian-e2e-'));
    const args = [
        '--headless=new',
        // 一次性无头测试实例：在受限令牌/CI 环境下 Chrome 自身沙盒会导致 GPU 进程 FATAL 崩溃，
        // 该实例使用临时 profile 且仅访问本地 mock 服务，关闭沙盒不影响项目代码。
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-pings',
        '--disable-extensions',
        '--window-size=1280,900',
        '--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1',
        'about:blank'
    ];
    const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk); });

    const portFile = path.join(userDataDir, 'DevToolsActivePort');
    let portInfo = null;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        try {
            const lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
            if (lines[0] && lines[1]) {
                portInfo = { port: Number(lines[0]), path: lines[1] };
                break;
            }
        } catch { /* wait */ }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!portInfo) {
        try { child.kill(); } catch { /* ignore */ }
        throw new Error(`Chrome 未启动 DevTools 端口。${stderr.slice(-1000)}`);
    }

    const browser = await CDP.connect(`ws://127.0.0.1:${portInfo.port}${portInfo.path}`);
    return {
        browser,
        client: browser,
        child,
        userDataDir,
        async close() {
            browser.close();
            try { child.kill(); } catch { /* ignore */ }
            spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    };
}

class Page {
    constructor(browser, sessionId, targetId) {
        this.browser = browser;
        this.sessionId = sessionId;
        this.targetId = targetId;
        this.exceptions = [];
        this.consoleErrors = [];
        this.networkFailures = [];
        this.requests = [];
        this._unsubscribe = browser.on(message => this._handleEvent(message));
    }

    _handleEvent(message) {
        if (message.sessionId !== this.sessionId) return;
        if (message.method === 'Runtime.exceptionThrown') {
            const details = message.params.exceptionDetails;
            this.exceptions.push(details.exception?.description || details.text || 'unknown exception');
        }
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            const text = message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ');
            this.consoleErrors.push(text);
        }
        if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
            this.consoleErrors.push(message.params.entry.text);
        }
        if (message.method === 'Network.loadingFailed') {
            this.networkFailures.push(message.params);
        }
        if (message.method === 'Network.requestWillBeSent') {
            this.requests.push({
                url: message.params.request.url,
                type: message.params.type,
                timestamp: message.params.timestamp
            });
        }
    }

    send(method, params = {}) {
        return this.browser.send(method, params, this.sessionId);
    }

    async init({ width = 1280, height = 900, mobile = false, reduceMotion = false, seedStorage = {}, extraInit = '', blockUrls = [] } = {}) {
        await this.send('Page.enable');
        await this.send('Runtime.enable');
        await this.send('Log.enable');
        await this.send('Network.enable');
        await this.send('Network.setCacheDisabled', { cacheDisabled: true });
        await this.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });
        await this.send('Emulation.setDeviceMetricsOverride', {
            width, height, deviceScaleFactor: 1, mobile
        });
        await this.send('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-reduced-motion', value: reduceMotion ? 'reduce' : 'no-preference' }]
        });
        await this.send('Network.setBlockedURLs', {
            urls: [
                'https://fonts.googleapis.com/*',
                'https://fonts.gstatic.com/*',
                ...blockUrls
            ]
        });
        const source = buildInitScript({ seedStorage }) + (extraInit ? `\n${extraInit}` : '');
        await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
    }

    async goto(url) {
        await this.send('Page.navigate', { url });
        await this.waitFor(() => document.readyState === 'complete', 10000);
        await this.waitFor(() => Boolean(document.getElementById('btn-next-step')), 10000);
    }

    async eval(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
        });
        if (result.exceptionDetails) {
            const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
            throw new Error(`页面脚本执行失败: ${description}`);
        }
        return result.result.value;
    }

    async waitFor(expression, timeout = 6000) {
        const deadline = Date.now() + timeout;
        let lastError = null;
        const source = typeof expression === 'function' ? `(${expression})()` : expression;
        while (Date.now() < deadline) {
            try {
                if (await this.eval(`Boolean(${source})`)) return true;
            } catch (error) {
                lastError = error;
            }
            await new Promise(resolve => setTimeout(resolve, 60));
        }
        throw new Error(`等待超时: ${source}${lastError ? ` (${lastError.message})` : ''}`);
    }

    async waitForText(selector, text, timeout = 6000) {
        return this.waitFor(
            `document.querySelector(${JSON.stringify(selector)})?.textContent.includes(${JSON.stringify(text)})`,
            timeout
        );
    }

    async click(selector) {
        // 用真实鼠标事件而不是 el.click()：后者会绕过命中测试，
        // 元素被浮层遮挡、被 overflow 裁掉或 pointer-events:none 时仍然“成功”。
        // 先滚动到视口中央，再用 elementFromPoint 确认目标确实可被点到。
        const info = await this.eval(`(async () => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return { error: 'not-found' };
            if (el.disabled) return { error: 'disabled' };
            el.scrollIntoView({ block: 'center', inline: 'center' });
            // 等位置稳定：scrollIntoView 与视图过渡/入场动画都可能让元素继续移动，
            // 只等固定两帧仍可能把鼠标事件派发到移动前的坐标上（粘性顶栏尤其明显）。
            const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
            let rect = el.getBoundingClientRect();
            let lastSignature = '';
            let stableFrames = 0;
            // 视图切换的 500ms 过渡会让按钮持续移动；要求连续 3 帧位置一致，
            // 并给足 40 帧（约 660ms）覆盖过渡时长，避免把鼠标事件派发到旧坐标。
            for (let i = 0; i < 40; i++) {
                await frame();
                rect = el.getBoundingClientRect();
                const signature = [rect.left, rect.top, rect.width, rect.height].join(':');
                if (signature === lastSignature) {
                    stableFrames += 1;
                    if (stableFrames >= 3) break;
                } else {
                    stableFrames = 0;
                    lastSignature = signature;
                }
            }
            if (rect.width === 0 || rect.height === 0) return { error: 'zero-size' };
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const hit = document.elementFromPoint(x, y);
            return {
                x, y,
                hitTag: hit ? hit.tagName : null,
                hitId: hit ? hit.id : '',
                hitClass: hit ? String(hit.className || '') : '',
                contains: Boolean(hit && (hit === el || el.contains(hit))),
                rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
            };
        })()`);
        if (info.error === 'not-found') throw new Error(`找不到可点击元素: ${selector}`);
        if (info.error === 'disabled') throw new Error(`元素处于禁用状态，无法点击: ${selector}`);
        if (info.error === 'zero-size') throw new Error(`元素尺寸为 0，无法点击: ${selector}`);
        if (!info.contains) {
            throw new Error(
                `点击目标被遮挡或不可命中: ${selector} ` +
                `(中心 ${info.x.toFixed(1)},${info.y.toFixed(1)} 命中 ` +
                `${info.hitTag || 'null'}#${info.hitId || ''}.${info.hitClass || ''})`
            );
        }
        await this.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: info.x, y: info.y, buttons: 0
        });
        await this.send('Input.dispatchMouseEvent', {
            type: 'mousePressed', x: info.x, y: info.y, button: 'left', buttons: 1, clickCount: 1
        });
        await this.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: info.x, y: info.y, button: 'left', buttons: 0, clickCount: 1
        });
    }

    async focus(selector) {
        const focused = await this.eval(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return false;
            el.focus();
            return document.activeElement === el;
        })()`);
        if (!focused) throw new Error(`无法聚焦元素: ${selector}`);
    }

    async fill(selector, text) {
        await this.focus(selector);
        await this.eval(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
        await this.send('Input.insertText', { text });
    }

    async press(key, options = {}) {
        const keyMap = {
            Enter: { code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' },
            Escape: { code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
            Tab: { code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
            ' ': { code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' },
            ArrowDown: { code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 }
        };
        const info = keyMap[key] || { code: key, windowsVirtualKeyCode: 0, nativeVirtualKeyCode: 0 };
        const base = {
            key,
            code: info.code,
            windowsVirtualKeyCode: info.windowsVirtualKeyCode,
            nativeVirtualKeyCode: info.nativeVirtualKeyCode,
            modifiers: options.modifiers || 0
        };
        await this.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            ...base,
            ...(info.text ? { text: info.text } : {})
        });
        await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    }

    async pressTab(shift = false) {
        await this.press('Tab', { modifiers: shift ? 8 : 0 });
    }

    async setViewport(width, height, mobile = false) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width, height, deviceScaleFactor: 1, mobile
        });
    }

    async close() {
        this._unsubscribe();
        try { await this.browser.send('Target.closeTarget', { targetId: this.targetId }); } catch { /* ignore */ }
    }
}

async function createPage(browser, options = {}) {
    const client = browser.client || browser;
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(client, sessionId, targetId);
    await page.init(options);
    if (options.url) await page.goto(options.url);
    return page;
}

async function importRawFile(page, selector, text, filename = 'backup.json') {
    await page.eval(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        const dt = new DataTransfer();
        dt.items.add(new File([${JSON.stringify(String(text))}], ${JSON.stringify(filename)}, { type: 'application/json' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);
}

async function importJsonFile(page, selector, content, filename = 'backup.json') {
    return importRawFile(page, selector, JSON.stringify(content), filename);
}

async function readLastDownload(page) {
    await page.waitFor(() => window.__e2e && window.__e2e.lastBlob, 5000);
    return page.eval(`window.__e2e.lastBlob.text()`);
}

module.exports = {
    PROJECT_ROOT,
    FIXED_NOW,
    FIXED_DAY,
    startMockServer,
    launchBrowser,
    createPage,
    importJsonFile,
    importRawFile,
    readLastDownload
};