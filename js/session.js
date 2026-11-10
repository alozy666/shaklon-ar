// جلسة الصف على هذا الجهاز: المجموعات وأسماء أعضائها، المجموعة المختارة، تقدّم المغامرة، ونتائج التقييم.
// كل شيء يُحفظ في متصفح هذا الجهاز فقط (localStorage). لا خادم ولا إرسال.
// المعلم يوزّع المجموعات من صفحة teacher/ فتنتقل إلى الأجهزة داخل الرابط نفسه (بعد علامة #، فلا تصل لأي خادم).
import { ANSWERS } from './config.js';

const KEY = 'shaklon-session-v2';
const HANDOVER = 20;                      // ثوانٍ لتسليم الجهاز بين تلميذين
export const TASK_KEYS = ['house', 'block', 'pyramid', 'tower', 'kiosk', 'tank'];
const POLY = ['block', 'pyramid', 'house'];       // متعددات أوجه
const ROUND = ['kiosk', 'tank', 'tower'];         // فيها سطح منحنٍ
const DEMO = ['المحقق 1', 'المحقق 2', 'المحقق 3', 'المحقق 4', 'المحقق 5'];

// ---- ترميز يصلح لرابط أو رمز QR ----
export function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unpack(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

/** الوقت المتاح لكل تلميذ: مدة التقييم ÷ عدد أعضاء المجموعة، ناقص وقت تسليم الجهاز. */
export function secondsPerStudent(minutes, members) {
  const raw = (minutes * 60) / Math.max(1, members) - HANDOVER;
  return Math.max(60, Math.floor(raw / 10) * 10);
}

/** مباني التلميذ رقم i: متعدد أوجه ثم مجسم منحنٍ، مختلفة بين أعضاء المجموعة حتى لا تُنقل الإجابات. */
export function tasksFor(i, per = 2) {
  const list = [POLY[i % 3], ROUND[(i + Math.floor(i / 3)) % 3], POLY[(i + 1) % 3]];
  return list.slice(0, Math.max(1, Math.min(3, per)));
}

export const isCorrect = (key, answer) => ANSWERS[key].every((v, k) => v === answer[k]);

/** مستوى تحقق الهدف من نسبة المباني الصحيحة (كما في الروبرك: ثلاثة أرباع فأكثر = حقّق). */
export function level(correct, total) {
  const r = total ? correct / total : 0;
  return r >= 0.75 ? 'حقّق الهدف' : r >= 0.5 ? 'حقّقه جزئيًا' : 'لم يحققه';
}

const blank = () => ({ klass: null, group: null, lit: [], log: [], results: {} });
let state = blank();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* التخزين غير متاح */ }
}

export const session = {
  /** يحمّل الجلسة، ويستورد توزيع المعلم إن جاء في الرابط (#c=...). */
  init() {
    try { state = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { state = blank(); }
    const match = location.hash.match(/[#&]c=([\w-]+)/);
    if (match) {
      try {
        const k = unpack(match[1]);
        if (Array.isArray(k.g) && k.g.length) {
          if (!state.klass || state.klass.id !== k.id) state = blank();          // صف أو جلسة جديدة
          state.klass = { id: k.id, title: k.t || '', minutes: k.m || 15, per: k.p || 2, groups: k.g };
          save();
        }
      } catch (err) { console.warn('رمز الصف غير صالح', err); }
      history.replaceState(null, '', location.pathname + location.search);
    }
  },

  get klass() { return state.klass; },
  get hasClass() { return !!state.klass; },
  get group() { return state.group; },
  get needsGroup() { return !!state.klass && state.group === null; },
  setGroup(i) {
    if (state.group !== i) { state.group = i; state.lit = []; state.log = []; state.results = {}; save(); }
  },
  groupLabel() { return state.klass && state.group !== null ? `المجموعة ${state.group + 1}` : 'مجموعة تجريبية'; },
  members() {
    return state.klass && state.group !== null ? state.klass.groups[state.group] : DEMO;
  },
  minutes() { return state.klass ? state.klass.minutes : 15; },
  per() { return state.klass ? state.klass.per : 2; },
  seconds() { return secondsPerStudent(this.minutes(), this.members().length); },
  tasks(i) { return tasksFor(i, this.per()); },

  // ---- تقدّم المغامرة (يبقى لو أُعيد فتح الصفحة) ----
  get lit() { return state.lit; },
  get log() { return state.log; },
  markLit(key, name, counts) {
    if (!state.lit.includes(key)) { state.lit.push(key); state.log.push({ name, counts }); save(); }
  },

  // ---- نتائج التقييم ----
  result(i) { return state.results[i] || null; },
  saveResult(i, items, seconds) { state.results[i] = { items, seconds }; save(); },
  clearResult(i) { delete state.results[i]; save(); },
  doneCount() { return Object.keys(state.results).length; },
  allDone() { return this.doneCount() >= this.members().length; },
  /** يمسح التقدّم والنتائج لهذه المجموعة (للمعلم). */
  wipe() { state.lit = []; state.log = []; state.results = {}; save(); },

  /** نتائج المجموعة في نص قصير يُعرض رمز QR لصفحة المعلم. */
  resultsCode() {
    const names = this.members();
    return pack({
      v: 2, id: state.klass ? state.klass.id : 'demo', g: state.group ?? 0, n: names,
      r: Object.entries(state.results).map(([i, r]) => [
        Number(i), r.seconds, r.items.map((it) => [TASK_KEYS.indexOf(it.key), ...it.answer.map((v) => (v === null ? -1 : v))]),
      ]),
    });
  },
};
