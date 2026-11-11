// الصوت: مؤثرات مولّدة بالكود + صوت شكلون (تسجيل المعلم، أو نطق آلي كبديل مؤقت).
import { TTS_FALLBACK } from './config.js';

let ctx = null;
let master = null;
let muted = false;
let current = null;            // تسجيل يعمل الآن
let recorded = new Set();      // مفاتيح الرسائل التي لها ملف mp3
let ttsOn = TTS_FALLBACK;

try { muted = localStorage.getItem('shaklon-muted') === '1'; } catch { /* التخزين غير متاح */ }

export async function initAudio({ tts = true } = {}) {
  ttsOn = TTS_FALLBACK && tts;
  if ('speechSynthesis' in window) speechSynthesis.getVoices();   // تحميل قائمة الأصوات مبكرًا
  try {
    const res = await fetch('assets/audio/manifest.json', { cache: 'no-store' });
    if (res.ok) recorded = new Set((await res.json()).recorded || []);
  } catch { /* لا تسجيلات بعد */ }
}

/** يُستدعى من داخل ضغطة المستخدم الأولى، وإلا يمنع المتصفح الصوت. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try { localStorage.setItem('shaklon-muted', value ? '1' : '0'); } catch { /* تجاهل */ }
  if (muted) stopVoice();
}

/** نغمة واحدة على أي سياق صوتي: السياق الحي، أو سياق خارج الزمن الحقيقي (tools/dev-capture.js يرفق الصوت بفيديو مسجَّل). */
export function synth(ac, out, { f, f2, type = 'sine', dur = 0.15, vol = 0.2 }, t0) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

let toneTap = null;
/** للاختبار فقط: يُبلَّغ بكل نغمة تُطلب، حتى والصوت مقفل أو مكتوم. */
export function onTone(fn) { toneTap = fn; }

function tone(p) {
  toneTap?.(p);
  if (!ctx || muted) return;
  synth(ctx, master, p, ctx.currentTime + (p.delay || 0));
}

export const sfx = {
  tick: () => tone({ f: 660, dur: 0.07, vol: 0.12 }),
  pop: () => tone({ f: 480, f2: 960, dur: 0.13, vol: 0.22 }),
  back: () => tone({ f: 720, f2: 420, dur: 0.14, vol: 0.14 }),
  boing: () => { tone({ f: 240, f2: 120, type: 'triangle', dur: 0.28, vol: 0.25 }); },
  whoosh: () => tone({ f: 300, f2: 620, type: 'triangle', dur: 0.25, vol: 0.07 }),
  ding: () => { tone({ f: 880, dur: 0.35, vol: 0.2 }); tone({ f: 1320, dur: 0.5, vol: 0.16, delay: 0.12 }); },
  fanfare: () => [523, 659, 784, 1047, 1319].forEach((f, i) =>
    tone({ f, type: 'triangle', dur: i === 4 ? 0.6 : 0.2, vol: 0.2, delay: i * 0.13 })),
  // مؤثرات العرض: شحن المكعب، انفجاره، نغمة لكل مبنى يظهر، وميض نافذة، وانطفاء الأنوار
  power: () => tone({ f: 180, f2: 760, type: 'triangle', dur: 0.32, vol: 0.18 }),
  boom: () => { tone({ f: 150, f2: 45, dur: 0.55, vol: 0.4 }); [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone({ f, dur: 0.8, vol: 0.1, delay: i * 0.05 })); },
  note: (i) => { const f = [523.25, 587.33, 659.25, 783.99, 880, 1046.5][i % 6]; tone({ f, f2: f * 1.5, dur: 0.22, vol: 0.22 }); },
  twinkle: (i) => tone({ f: 1250 + (i % 8) * 110, dur: 0.07, vol: 0.09 }),
  down: () => { tone({ f: 420, f2: 70, type: 'triangle', dur: 0.7, vol: 0.2 }); tone({ f: 210, f2: 45, dur: 0.8, vol: 0.2, delay: 0.1 }); },
};

export function stopVoice() {
  if (current) { try { current.stop(); } catch { /* انتهى */ } current = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

const buffers = new Map();
/** التسجيلات تُشغَّل عبر AudioContext لأنه يبقى مفتوحًا بعد ضغطة «ابدأ» (مهم على iPad). */
async function playRecording(key) {
  if (!ctx) return;
  if (!buffers.has(key)) {
    const res = await fetch(`assets/audio/${key}.mp3`);
    buffers.set(key, await ctx.decodeAudioData(await res.arrayBuffer()));
  }
  if (muted) return;
  const source = ctx.createBufferSource();
  source.buffer = buffers.get(key);
  source.connect(master);
  source.start();
  current = source;
}

export function speak(key, text) {
  stopVoice();
  if (muted) return;
  if (recorded.has(key)) {
    playRecording(key).catch((err) => console.warn('voice file failed', key, err));
    return;
  }
  if (!ttsOn || !('speechSynthesis' in window)) return;
  const voice = speechSynthesis.getVoices().find((v) => (v.lang || '').toLowerCase().startsWith('ar'));
  if (!voice) return;          // لا صوت عربي على الجهاز: نكتفي بالنص
  const u = new SpeechSynthesisUtterance(text.replace(/[«»]/g, ''));
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.92;
  u.pitch = 1.2;
  speechSynthesis.speak(u);
}
