/**
 * 星见塔罗 —— 程序化音效（零音频资产）
 * 洗牌 / 抽牌 / 翻牌全部由 Web Audio 实时合成，file:// 下同样可用。
 * AudioContext 只在用户手势中创建或 resume；开关默认静音，状态存 localStorage。
 */
(function () {
'use strict';

const STORAGE_KEY = 'xingjian_sound';
const reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let enabled = false;
let context = null;
let button = null;
// Safari 在来电、切后台或音频路由变化后会把 AudioContext 置为 'interrupted'。
// 只有曾经真正 running 过（已解锁）的上下文才值得在回到前台时尝试恢复。
let unlocked = false;

function readPreference() {
    try { return localStorage.getItem(STORAGE_KEY) === 'on'; } catch { return false; }
}

function updateButton() {
    if (!button) return;
    button.setAttribute('aria-pressed', String(enabled));
    button.classList.toggle('sound-on', enabled);
    button.title = enabled ? '关闭音效'
        : (reduceMotion ? '系统已开启减少动态效果，音效默认关闭；点击仍可开启' : '开启音效');
    button.setAttribute('aria-label', enabled ? '关闭音效' : '开启音效（默认静音）');
}

// 只在开关点击或抽牌等用户手势里调用；页面加载阶段绝不创建 AudioContext。
function markRunning(ctx) {
    if (ctx && ctx.state === 'running') unlocked = true;
}

// Safari 的 'interrupted' 与标准 'suspended' 都需要 resume；失败时静默，
// 等下一次用户手势或页面回到前台再试。
function resumeContext(ctx) {
    if (!ctx || typeof ctx.resume !== 'function') return;
    if (ctx.state !== 'suspended' && ctx.state !== 'interrupted') return;
    try {
        const resumed = ctx.resume();
        if (resumed && typeof resumed.then === 'function') {
            resumed.then(() => markRunning(ctx)).catch(() => {});
        } else {
            markRunning(ctx);
        }
    } catch { /* 自动恢复失败不阻塞抽牌，下一次手势会再试 */ }
}

function resumeIfNeeded() {
    if (!enabled || !context || !unlocked) return;
    resumeContext(context);
}

function ensureContext() {
    try {
        if (!enabled) return null;
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return null;
        if (context && context.state === 'closed') {
            context = null;
            unlocked = false;
        }
        if (!context) context = new AudioCtor();
        markRunning(context);
        resumeContext(context);
        return context;
    } catch { return null; }
}

// 页面回到前台时，若上下文已被浏览器挂起/中断且此前已解锁，尝试恢复。
// 不主动创建上下文；首次创建仍然只发生在用户手势里。
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeIfNeeded();
});
window.addEventListener('pageshow', resumeIfNeeded);

function playShuffleSound(ctx) {
    const duration = 0.08;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 1200; filter.Q.value = 0.9;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    source.start(now); source.stop(now + duration);
}

function playDrawSound(ctx) {
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(528, now);
    oscillator.frequency.exponentialRampToValueAtTime(792, now + 0.15);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(now); oscillator.stop(now + 0.16);
}

function playFlipSound(ctx, reversed) {
    const now = ctx.currentTime;
    const duration = reversed ? 0.6 : 0.5;
    // 正位 432/648/864Hz 清亮泛音；逆位整体降八度，听感更沉静。
    const base = reversed ? 216 : 432;
    [1, 1.5, 2].forEach((ratio, index) => {
        const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(base * ratio, now);
        const peak = (reversed ? 0.045 : 0.055) / (index + 1);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(gain); gain.connect(ctx.destination);
        oscillator.start(now); oscillator.stop(now + duration + 0.02);
    });
}

function play(synth, ...args) {
    if (!enabled) return;
    try {
        const ctx = ensureContext();
        if (ctx) synth(ctx, ...args);
    } catch { /* 音效失败静默降级，不影响抽牌 */ }
}

const api = {
    isEnabled() { return enabled; },
    toggle() {
        enabled = !enabled;
        try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* 仅本次生效 */ }
        if (enabled) ensureContext();
        updateButton();
        return enabled;
    },
    playShuffle() { play(playShuffleSound); },
    playDraw() { play(playDrawSound); },
    playFlip(reversed) { play(playFlipSound, Boolean(reversed)); },
    init() {
        button = document.getElementById('btn-sound');
        enabled = readPreference();
        if (!button) return;
        button.addEventListener('click', () => api.toggle());
        updateButton();
    }
};

window.Xingjian = window.Xingjian || {};
window.Xingjian.audio = api;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.init);
else api.init();
})();