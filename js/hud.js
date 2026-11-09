// طبقة الواجهة فوق المشهد: فقاعة شكلون، خطوات المحقق، حقيبة الأشكال، لوحة المقارنة، وغيرها.
import { SHAPES, SHAPE_ORDER, LINES } from './config.js';
import { speak, sfx, isMuted, setMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const icon = (id) => `<svg><use href="#${id}"/></svg>`;

function chip(shape, { count = null, tag = 'span', cls = '', mark = null } = {}) {
  const el = document.createElement(tag);
  el.className = `chip ${cls}`.trim();
  el.dataset.shape = shape;
  el.innerHTML = `${icon('s-' + shape)}<span>${SHAPES[shape].ar}</span>`
    + (count !== null ? `<span class="n">${count}</span>` : '')
    + (mark ? `<span class="mark ${mark.cls}">${mark.text}</span>` : '');
  return el;
}

export function createHud() {
  const el = {
    hud: $('hud'), bubble: $('bubble'), text: $('bubble-text'), avatar: $('avatar'),
    toast: $('toast'), hint: $('hint'), title: $('title-chip'),
    bag: $('bag'), bagLabel: $('bag-label'), bagChips: $('bag-chips'),
    steps: $('steps'), nums: $('nums'), compare: $('compare'),
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

    button(name, visible, onClick) {
      const b = $('btn-' + name);
      b.hidden = !visible;
      if (onClick) b.onclick = () => { sfx.tick(); onClick(); };
    },

    // ---- خطوات المحقق ----
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

    // ---- حقيبة الأشكال: في «أتوقع» أزرار اختيار، وبعدها عدّاد لما فُصل ----
    bag: {
      onToggle: null,
      hide() { el.bag.hidden = true; },
      predict(selected) {
        el.bag.hidden = false;
        el.bag.classList.add('predict');
        el.bagLabel.textContent = 'أتوقع أن أجد';
        el.bagChips.replaceChildren(...SHAPE_ORDER.map((s) => {
          const c = chip(s, { tag: 'button', cls: selected.has(s) ? 'on' : '' });
          c.onclick = () => { sfx.tick(); hud.bag.onToggle?.(s); };
          return c;
        }));
      },
      found(counts, bump = null) {
        el.bag.hidden = false;
        el.bag.classList.remove('predict');
        el.bagLabel.textContent = 'حقيبة الأشكال';
        el.bagChips.replaceChildren(...SHAPE_ORDER.map((s) =>
          chip(s, { count: counts[s] || 0, cls: `${counts[s] ? '' : 'off'} ${bump === s ? 'bump' : ''}` })));
      },
    },

    // ---- أرقام مباني الحيّ الجديد ----
    nums: {
      onPick: null,
      show(colors) {
        el.nums.hidden = !colors;
        if (!colors) return;
        el.nums.replaceChildren(...colors.map((c, i) => {
          const b = document.createElement('button');
          b.textContent = String(i + 1);
          b.style.setProperty('--c', c);
          b.setAttribute('aria-label', `المبنى ${i + 1}`);
          b.onclick = () => { sfx.tick(); hud.nums.onPick?.(i); };
          return b;
        }));
      },
      set(active) { [...el.nums.children].forEach((b, i) => b.classList.toggle('active', i === active)); },
    },

    // ---- لوحة «أقارن» ----
    compare: {
      open(predicted, found, onDone) {
        const foundShapes = SHAPE_ORDER.filter((s) => found[s]);
        const p = $('cmp-predicted'), f = $('cmp-found');
        const predictedList = SHAPE_ORDER.filter((s) => predicted.has(s));
        p.replaceChildren(...(predictedList.length
          ? predictedList.map((s) => found[s]
            ? chip(s, { mark: { cls: 'ok', text: '✓' } })
            : chip(s, { cls: 'miss', mark: { cls: 'no', text: '✕' } }))
          : [Object.assign(document.createElement('span'), { className: 'empty', textContent: 'لم نتوقع شيئًا' })]));
        f.replaceChildren(...foundShapes.map((s) => chip(s, {
          count: found[s], mark: predicted.has(s) ? { cls: 'ok', text: '✓' } : { cls: 'new', text: '!' },
        })));
        el.compare.hidden = false;
        $('btn-done').onclick = () => onDone();
      },
      close() { el.compare.hidden = true; },
      get isOpen() { return !el.compare.hidden; },
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
