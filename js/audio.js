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

function tone({ f, f2, type = 'sine', dur = 0.15, vol = 0.2, delay = 0 }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
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
