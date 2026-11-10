// «عدسة المحقق على صفّنا»: ينقل التلميذ العدّ من المدينة إلى شيء حقيقي.
// يلتقط صورة للشيء (تبقى على الشاشة فقط ولا تُحفظ)، ثم يعلّم بنفسه أوجهه (أصفر) وأحرفه (أزرق) ورؤوسه (أحمر)
// بالألوان والعدّادات نفسها. «صورة أخرى» تُبقي العدّ ليعدّ ما لم يظهر في الصورة الأولى.
import { ELEMENTS, ANSWERS, BUILDINGS, CITY_ORDER, MYSTERY } from '../config.js';
import { sfx } from '../audio.js';

export async function startLens(app, container) {
  const hud = app.hud;
  container.classList.add('lens');
  const video = Object.assign(document.createElement('video'), { autoplay: true, muted: true, playsInline: true });
  video.setAttribute('playsinline', '');
  const photo = document.createElement('img');
  photo.hidden = true;
  const canvas = document.createElement('canvas');
  container.replaceChildren(video, photo, canvas);
  const g = canvas.getContext('2d');

  // بديل إن لم تتوفر الكاميرا الحية: التقاط صورة بكاميرا النظام
  const picker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
  picker.setAttribute('capture', 'environment');
  container.appendChild(picker);

  let live = false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
    video.srcObject = stream;
    await video.play();
    live = true;
  } catch (err) {
    console.warn('lens: no live camera', err);
    video.hidden = true;
  }

  const counts = { faces: 0, edges: 0, vertices: 0 };
  let marks = [];              // علامات الصورة الحالية
  let lens = 'faces';
  let frozen = false;
  let draft = null;            // خط حرف أثناء رسمه

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function line(m, alpha = 1) {
    g.globalAlpha = alpha;
    g.lineCap = 'round';
    g.strokeStyle = '#ffffff'; g.lineWidth = 11;
    g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x2, m.y2); g.stroke();
    g.strokeStyle = ELEMENTS.edges.css; g.lineWidth = 7;
    g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x2, m.y2); g.stroke();
    g.globalAlpha = 1;
  }

  function draw() {
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (const m of marks) {
      if (m.kind === 'edges') line(m);
      else {
        const r = m.kind === 'faces' ? 26 : 13;
        g.beginPath(); g.arc(m.x, m.y, r + 3, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
        g.beginPath(); g.arc(m.x, m.y, r, 0, Math.PI * 2); g.fillStyle = ELEMENTS[m.kind].css; g.fill();
        if (m.kind === 'faces') {
          g.fillStyle = '#1f2a5a'; g.font = '800 26px "Baloo Bhaijaan 2", sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(String(m.n), m.x, m.y + 2);
        }
      }
    }
    if (draft) line(draft, 0.6);
  }

  function paint() {
    hud.lenses.show(frozen ? counts : null, lens);
    hud.button('shutter', !frozen);
    hud.button('undo', frozen && marks.length > 0);
    hud.button('again', frozen);
    hud.button('fresh', frozen);
    hud.button('which', frozen && counts.faces + counts.edges + counts.vertices > 0);
    draw();
  }

  function add(mark) {
    counts[mark.kind]++;
    if (mark.kind === 'faces') mark.n = counts.faces;
    marks.push(mark);
    sfx.pop();
    hud.lenses.show(counts, lens, mark.kind);
    paint();
  }

  function freeze() {
    frozen = true;
    if (live) video.pause();
    sfx.ding();
    hud.say('lens_mark');
    paint();
  }

  function unfreeze(resetCounts) {
    frozen = false;
    marks = [];
    if (resetCounts) counts.faces = counts.edges = counts.vertices = 0;
    photo.hidden = true;
    if (live) { video.hidden = false; video.play(); }
    hud.say(resetCounts ? 'lens_intro' : 'lens_again');
    paint();
  }

  picker.onchange = () => {
    const file = picker.files[0];
    if (!file) return;
    photo.src = URL.createObjectURL(file);        // في الذاكرة فقط
    photo.hidden = false;
    video.hidden = true;
    freeze();
  };

  // اللمس: نقرة = وجه أو رأس، سحب = حرف
  let down = null;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => { if (frozen) { down = pos(e); canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || lens !== 'edges') return;
    const p = pos(e);
    draft = { kind: 'edges', x: down.x, y: down.y, x2: p.x, y2: p.y };
    draw();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const p = pos(e);
    const len = Math.hypot(p.x - down.x, p.y - down.y);
    if (lens === 'edges') { if (len > 36) add({ kind: 'edges', x: down.x, y: down.y, x2: p.x, y2: p.y }); }
    else if (len < 16) add({ kind: lens, x: p.x, y: p.y });
    down = null; draft = null;
    draw();
  });
  canvas.addEventListener('pointercancel', () => { down = null; draft = null; draw(); });

  hud.lenses.onPick = (k) => { lens = k; hud.lenses.show(counts, lens); hud.say('lens_' + k, { voice: false }); };
  hud.button('shutter', true, () => (live ? freeze() : picker.click()));
  hud.button('undo', false, () => {
    const m = marks.pop();
    if (m) { counts[m.kind]--; paint(); }
  });
  hud.button('again', false, () => (live ? unfreeze(false) : picker.click()));
  hud.button('fresh', false, () => unfreeze(true));
  hud.button('which', false, () => {
    hud.say('lens_which');
    const rows = [...CITY_ORDER, MYSTERY].map((k) => ({ name: BUILDINGS[k].ar, counts: ANSWERS[k] }));
    hud.log.open(rows, [counts.faces, counts.edges, counts.vertices]);
  });

  window.addEventListener('resize', resize);
  resize();
  hud.say('lens_intro');
  paint();
  app.lens = { counts, get frozen() { return frozen; }, get marks() { return marks; }, freeze };
}
