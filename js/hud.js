// طبقة الواجهة فوق المشهد: فقاعة شكلون، خطوات المحقق، لوحة الأعداد (توقع أو إجابة)، العدسات الثلاث بعدّاداتها،
// لوحة المقارنة، سجل المدينة، شريط الوقت، «الدور على فلان»، والنافذة العامة.
import { ELEMENTS, ELEMENT_ORDER, LINES } from './config.js';
import { speak, sfx, isMuted, setMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const icon = (id) => `<svg><use href="#${id}"/></svg>`;
/** الأسماء يكتبها المعلم وتصل عبر رابط: لا تُوضع في HTML إلا بعد تنظيفها. */
export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createHud() {
  const el = {
    hud: $('hud'), bubble: $('bubble'), text: $('bubble-text'), avatar: $('avatar'),
    toast: $('toast'), hint: $('hint'), title: $('title-chip'), timer: $('timer'),
    predict: $('predict'), lenses: $('lenses'), steps: $('steps'), turn: $('turn'),
    compare: $('compare'), log: $('log'),
    scan: $('scan'), scanText: $('scan-text'), loading: $('loading'), confetti: $('confetti'),
  };
  let lastLine = null;
  let toastTimer = 0;

  const hud = {
    show(visible) { el.hud.hidden = !visible; },
    loading(visible) { el.loading.hidden = !visible; },

    /** شكلون يقول رسالة: نص في الفقاعة + صوت. */
    say(key, { voice = true } = {}) {
      const text = LINES[key] || key;
      lastLine = { key, text };
      el.text.textContent = text;
      el.bubble.hidden = false;
      el.bubble.classList.remove('pop');
      void el.bubble.offsetWidth;
      el.bubble.classList.add('pop');
      if (voice) speak(key, text);
    },
    repeat() { if (lastLine) speak(lastLine.key, lastLine.text); },

    toast(text, seconds = 1.8) {
      el.toast.textContent = text;
      el.toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (el.toast.hidden = true), seconds * 1000);
    },
    hint(text) { el.hint.hidden = !text; if (text) el.hint.textContent = text; },
    title(text) { el.title.hidden = !text; if (text) el.title.textContent = text; },
    scan(visible, text) { el.scan.hidden = !visible; if (text) el.scanText.textContent = text; },
    /** شريط الوقت في التقييم: كسر من 1 إلى 0، أو null لإخفائه. */
    timer(fraction) {
      el.timer.hidden = fraction === null;
      if (fraction !== null) el.timer.firstElementChild.style.width = `${fraction * 100}%`;
    },

    /** زر جانبي أو علوي: إظهار/إخفاء، ومعالج النقر وتسميته اختياريان. */
    button(name, visible, onClick, label) {
      const b = $('btn-' + name);
      b.hidden = !visible;
      if (onClick) b.onclick = () => { sfx.tick(); onClick(); };
      if (label) b.querySelector('span').textContent = label;
    },

    // ---- خطوات المحقق: أتوقع، أتجوّل، أعدّ، أقارن ----
    steps: {
      onPick: null,
      show(visible) { el.steps.hidden = !visible; },
      set(step) {
        el.steps.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('active', b.dataset.step === step);
          if (b.dataset.step === step) b.classList.remove('pulse');
        });
      },
      pulse(step, on = true) { el.steps.querySelector(`[data-step="${step}"]`).classList.toggle('pulse', on); },
    },

    // ---- «أتوقع»: ثلاثة أعداد يختارها التلميذ ----
    predict: {
      onChange: null,
      show(values) {
        el.predict.hidden = !values;
        if (!values) return;
        el.predict.querySelectorAll('.stepper').forEach((s) => {
          const v = values[s.dataset.kind];
          s.querySelector('b').textContent = v === null ? '؟' : v;
        });
      },
    },

    // ---- العدسات الثلاث وعدّاد كل منها ----
    lenses: {
      onPick: null,
      show(counts, active, bump) {
        el.lenses.hidden = !counts;
        if (!counts) return;
        el.lenses.querySelectorAll('button').forEach((b) => {
          const k = b.dataset.lens;
          const n = b.querySelector('b');
          n.textContent = counts[k];
          b.classList.toggle('active', k === active);
          if (k === bump) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }
        });
      },
    },

    /** «الدور على فلان»: تناوب أعضاء المجموعة على الجهاز. */
    turn(name) {
      const changed = !!name && el.turn.dataset.name !== name;
      el.turn.hidden = !name;
      if (!name) { el.turn.dataset.name = ''; return; }
      el.turn.dataset.name = name;
      el.turn.replaceChildren('الدور على ', Object.assign(document.createElement('b'), { textContent: name }));
      if (changed) { el.turn.classList.remove('pop'); void el.turn.offsetWidth; el.turn.classList.add('pop'); }
    },

    /**
     * نافذة في وسط الشاشة. null تغلقها.
     * {title, lead, body: عنصر أو نص HTML, actions: [{label, ghost, onClick}], bot: إظهار شكلون}
     */
    dialog(opts) {
      const box = $('dialog');
      box.hidden = !opts;
      if (!opts) return;
      $('dialog-bot').style.display = opts.bot === false ? 'none' : '';
      $('dialog-title').textContent = opts.title || '';
      $('dialog-lead').textContent = opts.lead || '';
      $('dialog-lead').hidden = !opts.lead;
      const body = $('dialog-body');
      if (typeof opts.body === 'string') body.innerHTML = opts.body;
      else body.replaceChildren(...(opts.body ? [opts.body] : []));
      $('dialog-actions').replaceChildren(...(opts.actions || []).map((a) => {
        const b = document.createElement('button');
        b.className = a.ghost ? 'link-btn' : 'big-btn';
        b.textContent = a.label;
        b.onclick = () => { sfx.tick(); a.onClick(); };
        return b;
      }));
    },

    /** يخفي كل اللوحات والأزرار الجانبية (عند الانتقال بين فصول المغامرة). */
    reset() {
      for (const id of ['predict', 'lenses', 'steps', 'compare', 'log', 'timer', 'turn', 'title-chip', 'hint']) $(id).hidden = true;
      document.querySelectorAll('.side .pill, #btn-next, #btn-shutter, #btn-log').forEach((b) => (b.hidden = true));
      hud.dialog(null);
      hud.steps.onPick = hud.predict.onChange = hud.lenses.onPick = hud.onTeacher = null;
    },

    // ---- لوحة «أقارن»: ما توقعناه مقابل ما عددناه ----
    compare: {
      open(predicted, counted, onDone) {
        $('cmp-rows').innerHTML = ELEMENT_ORDER.map((k) => {
          const p = predicted[k];
          const ok = p === counted[k];
          return `<tr><th><i class="ico ${k}"></i>${ELEMENTS[k].ar}</th><td>${p === null ? '؟' : p}</td><td class="strong">${counted[k]}</td>`
            + `<td>${p === null ? '' : `<span class="mark ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✕'}</span>`}</td></tr>`;
        }).join('');
        el.compare.hidden = false;
        $('btn-done').onclick = () => onDone();
      },
      close() { el.compare.hidden = true; },
      get isOpen() { return !el.compare.hidden; },
    },

    // ---- سجل المدينة. mine: أعداد شيء حقيقي لمقارنتها بالمباني (عدسة المحقق) ----
    log: {
      open(rows, mine = null) {
        const row = (name, c, cls = '') => `<tr class="${cls}"><th>${esc(name)}</th><td>${c[0]}</td><td>${c[1]}</td><td>${c[2]}</td></tr>`;
        const same = (c) => mine && c[0] === mine[0] && c[1] === mine[1] && c[2] === mine[2];
        let html = mine ? row('ما عددناه', mine, 'mine') : '';
        html += rows.map((r) => row(r.name, r.counts, same(r.counts) ? 'match' : '')).join('');
        if (!rows.length && !mine) html = '<tr><td colspan="4" class="empty">لم نُضئ أي مبنى بعد</td></tr>';
        $('log-rows').innerHTML = html;
        el.log.hidden = false;
      },
      close() { el.log.hidden = true; },
    },

    /** ضغطة مطوّلة على صورة شكلون تفتح وضع المعلم؛ نقرة عادية تعيد الرسالة. */
    onTeacher: null,
    teacher: false,

    confetti() {
      const canvas = el.confetti;
      const g = canvas.getContext('2d');
      const w = (canvas.width = canvas.clientWidth), h = (canvas.height = canvas.clientHeight);
      const colors = ['#4f6fe3', '#f5a623', '#18a589', '#8e44ad', '#db3a78', '#ffe27a'];
      const bits = Array.from({ length: 140 }, (_, i) => ({
        x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.45,
        vx: (Math.random() - 0.5) * w * 0.9, vy: -(0.35 + Math.random() * 0.75) * h,
        size: 8 + Math.random() * 10, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
        color: colors[i % colors.length], kind: i % 3,
      }));
      let last = performance.now(), life = 0;
      const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now; life += dt;
        g.clearRect(0, 0, w, h);
        for (const b of bits) {
          b.vy += h * 1.3 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
          g.save(); g.translate(b.x, b.y); g.rotate(b.rot); g.fillStyle = b.color;
          g.globalAlpha = Math.max(0, 1 - life / 3.2);
          if (b.kind === 0) g.fillRect(-b.size / 2, -b.size / 2, b.size, b.size);
          else if (b.kind === 1) { g.beginPath(); g.arc(0, 0, b.size / 2, 0, 7); g.fill(); }
          else { g.beginPath(); g.moveTo(0, -b.size / 2); g.lineTo(b.size / 2, b.size / 2); g.lineTo(-b.size / 2, b.size / 2); g.fill(); }
          g.restore();
        }
        if (life < 3.2) requestAnimationFrame(frame); else g.clearRect(0, 0, w, h);
      };
      requestAnimationFrame(frame);
    },
  };

  el.steps.querySelectorAll('button').forEach((b) => {
    b.onclick = () => { sfx.tick(); hud.steps.onPick?.(b.dataset.step); };
  });
  el.lenses.querySelectorAll('button').forEach((b) => {
    b.onclick = () => { sfx.tick(); hud.lenses.onPick?.(b.dataset.lens); };
  });
  el.predict.querySelectorAll('.stepper button').forEach((b) => {
    b.onclick = () => { sfx.tick(); hud.predict.onChange?.(b.parentElement.dataset.kind, Number(b.dataset.d)); };
  });
  $('btn-log-close').onclick = () => { sfx.tick(); hud.log.close(); };

  // الصوت
  const soundBtn = $('btn-sound');
  const paintSound = () => (soundBtn.innerHTML = icon(isMuted() ? 'i-mute' : 'i-sound'));
  soundBtn.onclick = () => { setMuted(!isMuted()); paintSound(); if (!isMuted()) sfx.tick(); };
  paintSound();

  // صورة شكلون: نقرة = أعد الرسالة، ضغطة مطوّلة = وضع المعلم
  let pressTimer = 0, longPressed = false;
  el.avatar.addEventListener('pointerdown', () => {
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      hud.teacher = !hud.teacher;
      el.avatar.classList.toggle('teacher', hud.teacher);
      sfx.ding();
      hud.onTeacher?.(hud.teacher);
    }, 1200);
  });
  const endPress = () => clearTimeout(pressTimer);
  el.avatar.addEventListener('pointerup', () => { endPress(); if (!longPressed) hud.repeat(); });
  el.avatar.addEventListener('pointerleave', endPress);
  el.avatar.addEventListener('contextmenu', (e) => e.preventDefault());

  return hud;
}
