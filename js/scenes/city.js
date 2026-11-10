// فصل «مدينة شكلون» (التعلّم): مدينة مطفأة فيها البيت والهرم والبرج، ثم «المجسم الغامض» الذي ينكشف عن العمارة.
// المجموعة تعمل بجهاز واحد، والتطبيق نفسه يقودها ويوزّع الأدوار بالتناوب: المعلم موجّه وداعم فقط.
// خطوات المحقق لكل مبنى: أتوقع، أتجوّل، أعدّ (بالعدسات الثلاث)، أقارن.
import * as THREE from 'three';
import { Building } from '../buildings.js';
import { createShaklon } from '../shaklon.js';
import { Focuser, Counter, makeGround, makeFog } from './common.js';
import { CITY_ORDER, MYSTERY, ELEMENT_ORDER } from '../config.js';
import { sfx } from '../audio.js';
import { tween, ease, wait, lerp } from '../tween.js';

// أماكن المباني على السجادة (تطابق القطع المرسومة عليها في tools/build-targets.html)
const LAYOUT = {
  house:   { x: 0.33, z: 0.17, yaw: 0.4 },
  tower:   { x: 0.33, z: -0.19, yaw: 0 },
  pyramid: { x: -0.33, z: -0.19, yaw: 0.3 },
  block:   { x: 0, z: -0.02, yaw: 0.35 },       // وسط المدينة: مكان المجسم الغامض
};
const PORTAL = new THREE.Vector3(-0.36, 0, 0.1);
const SHAKLON_HOME = new THREE.Vector3(-0.33, 0, 0.27);
const SHAKLON_SCALE = 0.24;
// الأدوار داخل كل مبنى، تتناوب عليها المجموعة: المتوقِّع، ثم عدسة الأوجه، الأحرف، الرؤوس، ثم المقارِن
const ROLE = { predict: 0, walk: 0, faces: 1, edges: 2, vertices: 3, compare: 4 };

export function makePortal() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(120,220,255,0.85)');
  grad.addColorStop(0.8, 'rgba(123,91,214,0.55)');
  grad.addColorStop(1, 'rgba(123,91,214,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(64, 64, 18 + i * 14, i * 2, i * 2 + 2.4); g.stroke(); }
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 12, 48), new THREE.MeshBasicMaterial({ color: 0x7fe3ff }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.145, 40), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  group.add(ring, disc);
  group.position.copy(PORTAL).setY(0.17);
  group.visible = false;
  group.scale.setScalar(0.001);
  const scaleTo = (to) => {
    const from = group.scale.x;
    group.visible = true;
    return tween({ dur: 0.6, ease: to ? ease.outBack : ease.inOutCubic,
      update: (k) => { group.scale.setScalar(Math.max(0.001, lerp(from, to, k))); if (k >= 1 && !to) group.visible = false; } });
  };
  return { group, open: () => scaleTo(1), close: () => scaleTo(0), update: (dt) => { disc.rotation.z += dt * 2.2; } };
}

/** شكلون يخرج من البوابة أو يعود إليها. */
export async function throughPortal(shaklon, portal, out) {
  const g = shaklon.group;
  const from = g.position.clone(), s0 = g.scale.x;
  const to = out ? SHAKLON_HOME : PORTAL;
  await tween({ dur: 0.9, ease: out ? ease.outBack : ease.inOutCubic, update: (k) => {
    g.position.lerpVectors(from, to, k);
    g.scale.setScalar(Math.max(0.001, out ? SHAKLON_SCALE * k : s0 * (1 - k)));
  } });
}

export function placeShaklon(shaklon, atHome) {
  shaklon.group.position.copy(atHome ? SHAKLON_HOME : PORTAL);
  shaklon.group.scale.setScalar(atHome ? SHAKLON_SCALE : 0.001);
}

export class CityScene {
  constructor(app) {
    this.app = app;
    this.hud = app.hud;
    this.session = app.session;
    const { world, camera, mode } = app.stage;
    this.camera = camera;
    this.root = new THREE.Group();
    world.add(this.root);
    if (mode === '3d') this.root.add(makeGround({ image: 'assets/targets/mat.png' }));
    app.stage.zoomTo(0.62, true);          // العرض العام: السجادة كلها

    this.focuser = new Focuser(this.root, camera);
    const done = new Set(this.session.lit);          // ما أضاءته المجموعة من قبل يبقى مضيئًا
    for (const key of CITY_ORDER) {
      this.focuser.addSlot(new Building(key, { mode: done.has(key) ? 'lit' : 'dark' }), { ...LAYOUT[key], scale: 0.8 });
    }
    this.blockSlot = this.focuser.addSlot(new Building(MYSTERY, { mode: done.has(MYSTERY) ? 'lit' : 'dark' }), { ...LAYOUT.block, scale: 0.8 });
    this.blockSlot.group.visible = done.has(MYSTERY);
    this.lit = done;
    this.mystery = done.has(MYSTERY) ? 'open' : 'none';        // none ← fog ← open

    this.portal = makePortal();
    this.root.add(this.portal.group);
    this.shaklon = createShaklon();
    placeShaklon(this.shaklon, done.size > 0);
    this.root.add(this.shaklon.group);

    this.counter = new Counter(this.hud);
    this.counter.onChange = () => this.counted();
    this.step = null;
    this.predicted = { faces: null, edges: null, vertices: null };
    this.fog = null;
    this.idle = 0;
    this.hintAfter = 14;
    this.nudge = 0;
    this.done = false;

    const hud = this.hud;
    hud.steps.onPick = (step) => this.setStep(step);
    hud.predict.onChange = (kind, delta) => {
      const v = this.predicted[kind];
      this.predicted[kind] = v === null ? (delta > 0 ? 1 : 0) : Math.max(0, Math.min(20, v + delta));
      hud.predict.show(this.predicted);
      if (ELEMENT_ORDER.every((k) => this.predicted[k] !== null)) hud.steps.pulse('walk');
    };
    hud.lenses.onPick = (lens) => { this.counter.setLens(lens); this.idle = 0; this.showTurn(lens); };
    hud.button('back', false, () => this.close());
    hud.button('lift', false, () => this.toggleLift());
    hud.button('challenge', false, () => this.startMystery());
    hud.button('exam', false, () => app.go('exam'));
    hud.button('wipe', false, () => {
      if (confirm('مسح تقدّم هذه المجموعة ونتائج تقييمها؟')) { this.session.wipe(); location.reload(); }
    });
    hud.button('log', true, () => hud.log.open(this.session.log));
    hud.onTeacher = () => this.paintTeacher();
  }

  dispose() { this.root.removeFromParent(); }

  async begin() {
    if (this.lit.size === 0) {              // أول مرة: البوابة تنفتح ويخرج منها شكلون
      sfx.whoosh();
      await this.portal.open();
      sfx.pop();
      await throughPortal(this.shaklon, this.portal, true);
      this.hud.say('city_intro');
      this.shaklon.wave(3);
      wait(1.5).then(() => this.portal.close());
      return;
    }
    this.resume();
  }

  /** يكمل المغامرة من حيث توقفت المجموعة. */
  resume() {
    const cityLit = CITY_ORDER.every((k) => this.lit.has(k));
    if (cityLit && this.lit.has(MYSTERY)) this.cityDone(false);
    else if (cityLit && this.mystery === 'none') this.startMystery();
    else { this.paintTeacher(); this.hud.say('city_pick', { voice: false }); }
  }

  /** المبنى المقترح التالي بترتيب الدرس: البيت، ثم الهرم، ثم البرج. */
  nextSlot() {
    return this.focuser.slots.find((s) => s.group.visible && !this.lit.has(s.building.key)) || null;
  }

  paintTeacher() {
    const on = this.hud.teacher && !this.focuser.current;
    this.hud.button('challenge', on && this.mystery === 'none');
    this.hud.button('wipe', on);
  }

  /** «الدور على فلان» حسب الخطوة أو العدسة، ويتبدّل ترتيب الأدوار مع كل مبنى. */
  showTurn(role) {
    const names = this.session.members();
    this.hud.turn(names[(this.round + ROLE[role]) % names.length]);
  }

  pickables() {
    const f = this.focuser;
    if (f.current) return f.current.building.pickablesFor(this.step === 'count' ? this.counter.lens : null);
    const list = [...f.overviewPickables(), ...this.shaklon.pickables];
    if (this.fogPick) list.push(this.fogPick);
    return list;
  }

  async open(slot) {
    const hud = this.hud;
    if (this.focuser.busy) return;
    sfx.whoosh();
    this.predicted = { faces: null, edges: null, vertices: null };
    this.round = this.lit.size;
    this.counter.lens = 'faces';
    this.fog?.setVisible(false);
    hud.button('challenge', false);
    hud.button('wipe', false);
    hud.button('exam', false);
    this.app.stage.zoomTo(1);
    await this.focuser.focus(slot);
    hud.steps.show(true);
    hud.button('back', true);
    this.setStep('predict');
  }

  hidePanels() {
    const hud = this.hud;
    hud.compare.close();
    hud.steps.show(false);
    hud.predict.show(null);
    hud.turn(null);
    this.counter.detach();
    hud.button('lift', false, null, 'ارفع المبنى');
    hud.button('back', false);
    this.step = null;
  }

  async close() {
    const f = this.focuser;
    if (f.busy || !f.current) return;
    f.current.building.clearLights();
    this.hidePanels();
    this.app.stage.zoomTo(0.62);
    await f.unfocus();
    this.fog?.setVisible(true);
    this.paintTeacher();
    this.hud.button('exam', this.done);
    if (!this.done) this.hud.say('city_pick', { voice: false });
  }

  setStep(step) {
    const hud = this.hud;
    const f = this.focuser;
    const slot = f.current;
    if (!slot || f.busy) return;
    const b = slot.building;
    hud.compare.close();
    for (const s of ['walk', 'count', 'compare']) hud.steps.pulse(s, false);

    if (step === 'compare' && !b.complete()) {          // لا تعود الأنوار قبل عدّ كل شيء
      sfx.boing();
      this.hint();
      return;
    }
    this.step = step;
    this.idle = 0;
    hud.steps.set(step);
    hud.predict.show(step === 'predict' ? this.predicted : null);
    hud.button('lift', step === 'walk' || step === 'count');
    if (step === 'count') {
      this.counter.attach(b);
      hud.say('lens_' + this.counter.lens);
      this.showTurn(this.counter.lens);
    } else {
      this.counter.detach();
      hud.say(step);
      this.showTurn(step);
    }
    if (step === 'compare') hud.compare.open(this.predicted, b.counts(), () => this.finish());
  }

  async toggleLift() {
    const f = this.focuser;
    if (f.busy) return;
    sfx.whoosh();
    await f.setLifted(!f.lifted);
    this.hud.button('lift', true, null, f.lifted ? 'أنزل المبنى' : 'ارفع المبنى');
    if (this.step === 'walk') this.hud.steps.pulse('count');
    this.idle = 0;
  }

  counted() {
    this.idle = 0;
    if (this.focuser.current.building.complete()) {
      this.hud.say('count_done');
      this.hud.steps.pulse('compare');
    }
  }

  /** تلميح شكلون حسب ما بقي دون عدّ. */
  hint() {
    if (!this.counter.building) this.counter.building = this.focuser.current.building;
    this.hud.say(this.counter.hintKey(this.focuser.lifted));
    if (this.step !== 'count') this.counter.building = null;
    this.idle = 0;
    this.hintAfter = 22;
  }

  /** زر «تمّ»: يضيء المبنى ويُسجَّل في سجل المدينة. */
  async finish() {
    const f = this.focuser;
    const slot = f.current;
    if (!slot || f.busy) return;
    const b = slot.building;
    const c = b.counts();
    this.hidePanels();
    if (f.lifted) await f.setLifted(false);
    b.clearLights();
    b.setMode('lit');
    sfx.ding();
    this.hud.say('lit');
    this.lit.add(b.key);
    this.session.markLit(b.key, b.def.ar, [c.faces, c.edges, c.vertices]);
    await wait(1.4);
    this.app.stage.zoomTo(0.62);
    await f.unfocus();
    this.fog?.setVisible(true);
    this.resume();
  }

  /** تحدي «المجسم الغامض»: ضباب في وسط المدينة ولغز من شكلون. */
  startMystery() {
    if (this.mystery !== 'none' || this.focuser.current) return;
    this.mystery = 'fog';
    this.hud.button('challenge', false);
    const center = new THREE.Vector3(LAYOUT.block.x, 0.05, LAYOUT.block.z);
    this.fog = makeFog(this.root, center, { radius: 0.24 });
    this.fogPick = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8));
    this.fogPick.position.copy(center).setY(0.2);
    this.fogPick.visible = false;
    this.fogPick.userData = { kind: 'fog' };
    this.root.add(this.fogPick);
    sfx.whoosh();
    this.hud.say('mystery_riddle');
    this.shaklon.wave(3);
  }

  revealMystery() {
    if (this.mystery !== 'fog') return;
    this.mystery = 'open';
    this.fog.disperse();
    this.fog = null;
    this.fogPick.removeFromParent();
    this.fogPick = null;
    const slot = this.blockSlot;
    slot.group.visible = true;
    tween({ dur: 0.8, ease: ease.outBack, update: (k) => slot.group.scale.setScalar(Math.max(0.001, slot.home.scale * k)) });
    sfx.ding();
    this.hud.say('mystery_reveal');
  }

  /** المدينة كلها مضيئة: ننتقل إلى «مهمة المحقق». */
  cityDone(celebrate = true) {
    this.done = true;
    if (celebrate) { sfx.fanfare(); this.hud.confetti(); this.shaklon.celebrate(); }
    this.hud.say('city_lit', { voice: celebrate });
    this.hud.button('exam', true);
    this.paintTeacher();
  }

  tap(hit) {
    const f = this.focuser;
    if (f.busy) return;
    const data = hit?.object.userData;
    if (!f.current) {
      if (!data) return;
      if (data.kind === 'shaklon') { this.shaklon.wave(); this.hud.repeat(); return; }
      if (data.kind === 'fog') { this.revealMystery(); return; }
      const slot = f.slotOf(hit.object);
      if (!slot) return;
      if (this.lit.has(slot.building.key)) { sfx.tick(); f.hop(slot); return; }
      this.open(slot);
      return;
    }
    if (this.step === 'count') { this.counter.touch(hit); return; }
    if (this.step === 'walk' && data) { sfx.whoosh(); f.spin(); this.hud.steps.pulse('count'); }
  }

  drag(dx, dy, startHit, pickNow) {
    const f = this.focuser;
    if (f.busy) return;
    if (!f.current) { if (!startHit) this.app.stage.orbit(dx * 3); return; }
    if (this.step === 'predict') return;
    // في عدسة الأحرف: السحب الذي يبدأ على المبنى تمريرٌ على الأحرف لا تدوير
    if (this.step === 'count' && this.counter.lens === 'edges' && startHit) { this.counter.swipe(pickNow()); return; }
    f.rotateBy(dx, dy);
    this.idle = 0;
  }

  dragEnd() { this.counter.endSwipe(); }

  update(dt) {
    this.portal.update(dt);
    this.fog?.update(dt);
    this.shaklon.update(dt, this.camera);
    const f = this.focuser;
    if (this.step === 'count' && f.current && !f.busy && !f.current.building.complete()) {
      this.idle += dt;
      if (this.idle > this.hintAfter) this.hint();
    }
    // المبنى التالي يقفز كل بضع ثوانٍ ليعرف التلاميذ من أين يبدؤون
    if (!f.current && !f.busy && this.mystery !== 'fog') {
      this.nudge += dt;
      if (this.nudge > 3.5) { this.nudge = 0; const next = this.nextSlot(); if (next) f.hop(next); }
    }
  }
}
