// فصل «مهمة المحقق» (التقييم داخل التطبيق، بلا ورقة): جهاز واحد للمجموعة يتناوب عليه أعضاؤها.
// كل تلميذ يأخذ الجهاز، يختار اسمه، ثم يحلّل مبانيه وحده في وقته المحدد ويكتب أعداد الأوجه والأحرف والرؤوس.
// لا عدسات ولا عدّادات ولا تلميحات: المبنى يرتفع قليلًا ويدور ببطء حتى يظهر أسفله، ويستطيع التلميذ تدويره بإصبعه.
// وقت كل تلميذ = مدة التقييم الكلية ÷ عدد أعضاء المجموعة (ناقص وقت تسليم الجهاز). النتائج تُحفظ على الجهاز فقط.
import * as THREE from 'three';
import { Building } from '../buildings.js';
import { createShaklon } from '../shaklon.js';
import { cameraAxisIn, trackball, makeGround } from './common.js';
import { makePortal, throughPortal, placeShaklon } from './city.js';
import { BUILDINGS, ELEMENTS, ELEMENT_ORDER, EXAM_COLORS, ANSWERS } from '../config.js';
import { isCorrect, level } from '../session.js';
import { esc } from '../hud.js';
import { sfx } from '../audio.js';
import { tween, ease, wait } from '../tween.js';

const RADIUS = 0.36;          // حجم المبنى
const FLOAT = 0.14;           // «يرتفع قليلًا»
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const axis = new THREE.Vector3();
const qPitch = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), qTarget = new THREE.Quaternion();

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

export class ExamScene {
  constructor(app) {
    this.app = app;
    this.hud = app.hud;
    this.session = app.session;
    const { world, camera, mode } = app.stage;
    this.camera = camera;
    this.root = new THREE.Group();
    world.add(this.root);
    if (mode === '3d') this.root.add(makeGround({ image: 'assets/targets/mat.png' }));
    app.stage.zoomTo(0.8, true);

    this.holder = new THREE.Group();
    this.holder.position.set(0, 0, 0.03);
    this.root.add(this.holder);
    this.portal = makePortal();
    this.root.add(this.portal.group);
    this.shaklon = createShaklon();
    placeShaklon(this.shaklon, true);
    this.root.add(this.shaklon.group);

    this.turn = null;             // دور التلميذ الجاري: {i, tasks, idx, items, values, left, total}
    this.building = null;
    this.phase = 0;
    this.manual = 0;              // ثوانٍ باقية قبل أن يعود الدوران التلقائي بعد سحب التلميذ

    const hud = this.hud;
    hud.predict.onChange = (kind, delta) => {
      if (!this.turn) return;
      const v = this.turn.values[kind];
      this.turn.values[kind] = v === null ? (delta > 0 ? 1 : 0) : Math.max(0, Math.min(20, v + delta));
      hud.predict.show(this.turn.values);
    };
    hud.button('next', false, () => this.next());
    hud.button('results', false, () => this.showResults());
    hud.button('wipe', false, () => {
      if (confirm('مسح تقدّم هذه المجموعة ونتائج تقييمها؟')) { this.session.wipe(); location.reload(); }
    });
    hud.onTeacher = () => this.paintTeacher();
  }

  dispose() { this.root.removeFromParent(); }

  begin() {
    this.hud.say('exam_who');
    this.shaklon.wave(3);
    this.who();
  }

  paintTeacher() {
    const on = this.hud.teacher && !this.turn;
    this.hud.button('results', on);
    this.hud.button('wipe', on);
  }

  /** «من المحقق الآن؟»: التلميذ يختار اسمه. من أنهى يظهر بعلامة ✓. */
  who() {
    const s = this.session;
    if (s.allDone()) { this.finale(); return; }
    const grid = el('div', { className: 'grid-btns' });
    s.members().forEach((name, i) => {
      const done = !!s.result(i);
      const b = el('button', { textContent: name, className: done ? 'done' : '' });
      b.onclick = () => {
        sfx.tick();
        if (!done) this.ready(i);
        else if (this.hud.teacher && confirm(`إعادة تقييم ${name}؟ ستُمسح إجابته السابقة.`)) { s.clearResult(i); this.who(); }
      };
      grid.append(b);
    });
    this.hud.dialog({
      title: 'من المحقق الآن؟', lead: 'خذ الجهاز واختر اسمك', body: grid,
      actions: [{ label: 'للمعلم: النتائج', ghost: true, onClick: () => this.showResults() }],
    });
  }

  ready(i) {
    const s = this.session;
    const tasks = s.tasks(i);
    const seconds = s.seconds();
    const body = el('div', {},
      el('div', { className: 'time-big', textContent: clock(seconds) }),
      el('p', { className: 'small-note', textContent: 'يبدأ الوقت عند الضغط على «ابدأ»' }));
    this.hud.dialog({
      title: s.members()[i],
      lead: `مهمتك: عُدّ أوجه وأحرف ورؤوس ${tasks.length === 1 ? 'مبنى واحد' : tasks.length === 2 ? 'مبنيين' : `${tasks.length} مبانٍ`}، وحدك.`,
      body,
      actions: [
        { label: 'ابدأ', onClick: () => this.run(i, tasks, seconds) },
        { label: 'لستُ أنا', ghost: true, onClick: () => this.who() },
      ],
    });
  }

  run(i, tasks, seconds) {
    this.hud.dialog(null);
    this.turn = { i, tasks, idx: 0, items: [], values: null, left: seconds, total: seconds };
    this.paintTeacher();
    this.hud.say('exam_go');
    this.showTask();
  }

  showTask() {
    const t = this.turn;
    this.clearBuilding();
    const b = new Building(t.tasks[t.idx], { mode: 'plain', color: EXAM_COLORS[t.idx % EXAM_COLORS.length] });
    this.building = b;
    const s = RADIUS / b.radius;
    this.holder.add(b.group);
    this.holder.position.y = FLOAT - b.bottom * s;
    tween({ dur: 0.6, ease: ease.outBack, update: (k) => this.holder.scale.setScalar(Math.max(0.001, s * k)) });
    sfx.pop();
    this.phase = 0;
    this.manual = 0;
    t.values = { faces: null, edges: null, vertices: null };
    this.hud.title(`المبنى ${t.idx + 1} من ${t.tasks.length}`);
    this.hud.predict.show(t.values);
    this.hud.button('next', true, null, t.idx < t.tasks.length - 1 ? 'التالي' : 'أنهيت');
  }

  clearBuilding() {
    if (this.building) { this.building.dispose(); this.building = null; }
  }

  /** زر «التالي»: يحفظ أعداد هذا المبنى وينتقل. */
  next() {
    const t = this.turn;
    if (!t) return;
    if (ELEMENT_ORDER.some((k) => t.values[k] === null)) {
      sfx.boing();
      this.hud.toast('اكتب الأعداد الثلاثة أولًا');
      return;
    }
    t.items.push({ key: t.tasks[t.idx], answer: ELEMENT_ORDER.map((k) => t.values[k]) });
    t.idx++;
    if (t.idx < t.tasks.length) this.showTask();
    else this.endTurn(false);
  }

  /** نهاية دور التلميذ (أنهى أو انتهى وقته): تُحفظ إجابته ويُسلَّم الجهاز. */
  endTurn(timeUp) {
    const t = this.turn;
    const s = this.session;
    if (t.items.length < t.tasks.length && t.values) {            // ما كتبه في المبنى الذي لم يكمله
      t.items.push({ key: t.tasks[t.idx], answer: ELEMENT_ORDER.map((k) => t.values[k]) });
    }
    while (t.items.length < t.tasks.length) t.items.push({ key: t.tasks[t.items.length], answer: [null, null, null] });
    s.saveResult(t.i, t.items, Math.round(t.total - Math.max(0, t.left)));
    const name = s.members()[t.i];
    this.turn = null;
    this.clearBuilding();
    this.hud.predict.show(null);
    this.hud.button('next', false);
    this.hud.title(null);
    this.hud.timer(null);
    sfx.ding();
    this.hud.say(timeUp ? 'exam_time' : 'exam_saved');
    const badge = el('div', { className: 'badge-big', innerHTML: '<svg><use href="#i-star"/></svg>' });
    const last = s.allDone();
    this.hud.dialog({
      title: `أحسنت يا ${name}!`,
      lead: `${timeUp ? 'انتهى الوقت. ' : ''}حُفظت إجابتك. ${last ? 'أنهت مجموعتكم المهمة!' : 'سلّم الجهاز لزميلك.'}`,
      body: badge, bot: false,
      actions: [{ label: last ? 'النهاية' : 'التالي', onClick: () => this.who() }],
    });
    this.paintTeacher();
  }

  /** نهاية المغامرة: شارات للجميع ووداع شكلون عبر البوابة. */
  async finale() {
    const hud = this.hud;
    hud.dialog(null);
    sfx.fanfare();
    hud.confetti();
    hud.say('city_done');
    this.shaklon.celebrate();
    await this.portal.open();
    await wait(2.4);
    await throughPortal(this.shaklon, this.portal, false);
    this.portal.close();
    const names = el('ul', { className: 'names' }, ...this.session.members().map((n) => el('li', { textContent: `★ ${n}` })));
    hud.dialog({
      title: 'أنتم الآن محققون!', lead: 'أضأتم مدينة شكلون وأنهيتم المهمة. نادوا المعلم.', body: names,
      actions: [{ label: 'للمعلم: النتائج', ghost: true, onClick: () => this.showResults() }],
    });
  }

  /** نتائج المجموعة للمعلم، مع رمز ينقلها إلى صفحة المعلم. */
  showResults() {
    const s = this.session;
    const names = s.members();
    const rows = names.map((name, i) => {
      const r = s.result(i);
      if (!r) return `<tr><th>${esc(name)}</th><td colspan="2" class="empty">لم يُقيَّم بعد</td></tr>`;
      const ok = r.items.filter((it) => isCorrect(it.key, it.answer)).length;
      const cells = r.items.map((it) => {
        const good = isCorrect(it.key, it.answer);
        const a = it.answer.map((v) => (v === null ? '–' : v)).join(' · ');
        return `<span class="${good ? 'ok' : 'no'}">${esc(BUILDINGS[it.key].ar)}: ${a} ${good ? '✓' : `✕ (${ANSWERS[it.key].join(' · ')})`}</span>`;
      }).join('<br>');
      return `<tr><th>${esc(name)}</th><td style="font-size:15px;text-align:start">${cells}</td><td>${ok}/${r.items.length}<br><small>${level(ok, r.items.length)}</small></td></tr>`;
    }).join('');
    const body = el('div');
    body.innerHTML = `<table class="tbl"><thead><tr><th>التلميذ</th><th>${ELEMENT_ORDER.map((k) => ELEMENTS[k].ar).join(' · ')}</th><th>الصحيح</th></tr></thead><tbody>${rows}</tbody></table>`;
    if (s.doneCount() && window.qrcode) {
      const url = new URL('teacher/', location.href.split(/[?#]/)[0]).href + '#r=' + s.resultsCode();
      const qr = window.qrcode(0, 'L');
      qr.addData(url);
      qr.make();
      body.append(
        el('div', { className: 'qr-box', innerHTML: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) }),
        el('p', { className: 'small-note', textContent: 'امسح الرمز بجهازك لتنتقل نتائج هذه المجموعة إلى صفحة المعلم.' }));
    }
    this.hud.dialog({
      title: `نتائج ${s.groupLabel()}`, body, bot: false,
      actions: [{ label: 'إغلاق', onClick: () => this.afterResults() }],
    });
  }

  afterResults() {
    this.hud.dialog(null);
    if (!this.session.allDone()) this.who();
  }

  pickables() {
    return this.building ? this.building.pickablesFor(null) : this.shaklon.pickables;
  }

  tap(hit) {
    if (hit?.object.userData.kind === 'shaklon') { this.shaklon.wave(); this.hud.repeat(); }
  }

  drag(dx, dy) {
    if (!this.building) { this.app.stage.orbit(dx * 3); return; }
    this.manual = 4;
    trackball(this.building.group, this.holder, this.camera, dx, dy);
  }

  update(dt) {
    this.portal.update(dt);
    this.shaklon.update(dt, this.camera);
    const t = this.turn;
    const b = this.building;
    if (!t || !b) return;

    // الدوران التلقائي: دورة حول نفسه مع ميل دوري يُظهر الأسفل
    if (this.manual > 0) this.manual -= dt;
    else {
      this.phase += dt;
      cameraAxisIn(this.holder, this.camera, X, axis);
      qPitch.setFromAxisAngle(axis, -0.6 + 0.75 * Math.cos(this.phase * 0.5));
      qYaw.setFromAxisAngle(Y, this.phase * 0.7);
      qTarget.copy(qPitch).multiply(qYaw);
      b.group.quaternion.slerp(qTarget, 1 - Math.exp(-dt * 5));
    }

    t.left -= dt;
    this.hud.timer(Math.max(0, t.left / t.total));
    if (t.left <= 0) this.endTurn(true);
  }
}
