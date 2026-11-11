// فصل «مدينة شكلون» (التعلّم): مدينة مطفأة فيها البيت والهرم والبرج، ثم «المجسم الغامض» الذي ينكشف عن العمارة.
// المجموعة تعمل بجهاز واحد، والتطبيق نفسه يقودها ويوزّع الأدوار بالتناوب: المعلم موجّه وداعم فقط.
// خطوات المحقق لكل مبنى: أتوقع، أتجوّل، أعدّ (بالعدسات الثلاث)، أقارن.
import * as THREE from 'three';
import { Building } from '../buildings.js';
import { createShaklon } from '../shaklon.js';
import { Focuser, Counter, makeGround, makeFog } from './common.js';
import { CITY_ORDER, MYSTERY, ELEMENT_ORDER, FX_LAYER, ELEMENTS } from '../config.js';
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
  ring.layers.enable(FX_LAYER);                 // إطار البوابة يتوهج (القرص المضيء داخله لا، حتى لا يطغى)
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

const CUBE_POS = new THREE.Vector3(0, 0.36, 0.03);
// «الليل»: عتمة المكان خلف المجسمات (stage.setNight). المدينة المطفأة كلها = NIGHT_MAX، وكل مبنى يُضاء يعيد ربع النور.
const NIGHT_MAX = 0.6;
const NIGHT_CUBE = 0.42;               // قبل ضغط المكعب: المكان خافت قليلًا والمكعب وحده يضيء
const TOTAL = CITY_ORDER.length + 1;   // مباني المدينة + المجسم الغامض

/**
 * المكعب المضيء الذي تبدأ به المغامرة: أوجه صفراء، أحرف زرقاء، رؤوس حمراء (ألوان العدسات نفسها).
 * يطفو ويدور حتى يُضغط، ثم يشحن وينفجر ضوءًا فتطلع المدينة. زينة فقط: لا يُعدّ ولا يدخل في مفتاح الإجابة.
 */
export function makeMagicCube(fx) {
  const S = 0.2, h = S / 2;
  const group = new THREE.Group();
  group.position.copy(CUBE_POS);
  const body = new THREE.Group();
  group.add(body);
  const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshBasicMaterial({
      color: ELEMENTS.faces.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    }));
    m.position.set(d[0] * h, d[1] * h, d[2] * h);
    if (d[0]) m.rotation.y = (d[0] * Math.PI) / 2; else if (d[1]) m.rotation.x = (-d[1] * Math.PI) / 2; else if (d[2] < 0) m.rotation.y = Math.PI;
    m.userData.n = new THREE.Vector3(d[0], d[1], d[2]);
    body.add(m);
    return m;
  });
  const edgeMat = new THREE.MeshBasicMaterial({ color: ELEMENTS.edges.color, transparent: true });
  const vertMat = new THREE.MeshBasicMaterial({ color: ELEMENTS.vertices.color, transparent: true });
  for (let a = 0; a < 3; a++) for (const u of [-1, 1]) for (const w of [-1, 1]) {
    const size = [0.011, 0.011, 0.011]; size[a] = S;
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), edgeMat);
    const p = [0, 0, 0]; p[(a + 1) % 3] = u * h; p[(a + 2) % 3] = w * h;
    m.position.set(p[0], p[1], p[2]);
    m.layers.enable(FX_LAYER);
    body.add(m);
  }
  const verts = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 10), vertMat);
    m.position.set(i & 1 ? h : -h, i & 2 ? h : -h, i & 4 ? h : -h);
    m.userData.n = m.position.clone().normalize();
    m.layers.enable(FX_LAYER);
    body.add(m);
    verts.push(m);
  }
  const halo = fx ? fx.glowSprite(0xffe27a, 0.75, 0.4) : null;
  const core = fx ? fx.glowSprite(0xffffff, 0.2, 0.9) : null;
  if (halo) group.add(halo, core);
  const pick = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5));      // مساحة لمس واسعة لإصبع طفل
  pick.visible = false;
  pick.userData = { kind: 'cube' };
  group.add(pick);

  let clock = 0, spin = 0, boost = 0, bursting = false;
  return {
    group, pick,
    update(dt) {
      clock += dt;
      spin += dt * (0.9 + boost * 16);
      body.rotation.set(Math.sin(clock * 0.7) * 0.25, spin, 0);
      group.position.y = CUBE_POS.y + Math.sin(clock * 1.6) * 0.025;
      const pulse = 0.5 + 0.5 * Math.sin(clock * 3.2);
      if (halo && !bursting) { halo.material.opacity = 0.3 + pulse * 0.25; core.scale.setScalar(0.18 + pulse * 0.06); }
    },
    /** يشحن: يدور أسرع وينكمش قليلًا. */
    charge() { return tween({ dur: 0.28, ease: ease.inOutCubic, update: (k) => { boost = k; body.scale.setScalar(1 - 0.3 * k); } }); },
    /** ينفجر: الأوجه تطير على امتداد أعمدتها والرؤوس تنطلق، ثم يختفي. */
    burst() {
      bursting = true;
      return tween({
        dur: 0.7, ease: ease.outCubic,
        update: (k) => {
          body.scale.setScalar(0.7 + k * 0.7);
          for (const f of faces) { f.position.copy(f.userData.n).multiplyScalar(h + k * 0.7); f.scale.setScalar(Math.max(0.001, 1 - k)); f.material.opacity = 0.55 * (1 - k); }
          for (const v of verts) v.position.copy(v.userData.n).multiplyScalar(h * 1.732 + k * 1.0);
          edgeMat.opacity = 1 - k; vertMat.opacity = 1 - k;
          if (halo) { halo.material.opacity = 0.5 * (1 - k); core.material.opacity = 0.9 * (1 - k); }
          if (k >= 1) group.removeFromParent();
        },
      });
    },
  };
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
    this.ground = mode === '3d' ? makeGround({ image: 'assets/targets/mat.png' }) : null;
    if (this.ground) this.root.add(this.ground);
    app.stage.zoomTo(0.62, true);          // العرض العام: السجادة كلها

    this.focuser = new Focuser(this.root, camera);
    const done = new Set(this.session.lit);          // ما أضاءته المجموعة من قبل يبقى مضيئًا
    const fresh = done.size === 0;                   // أول مرة: المدينة تطلع مضيئة ثم تنطفئ أنوارها في intro()
    for (const key of CITY_ORDER) {
      this.focuser.addSlot(new Building(key, { mode: done.has(key) || fresh ? 'lit' : 'dark' }), { ...LAYOUT[key], scale: 0.8 });
    }
    this.blockSlot = this.focuser.addSlot(new Building(MYSTERY, { mode: done.has(MYSTERY) ? 'lit' : 'dark' }), { ...LAYOUT.block, scale: 0.8 });
    this.blockSlot.group.visible = done.has(MYSTERY);
    this.lit = done;
    this.mystery = done.has(MYSTERY) ? 'open' : 'none';        // none ← fog ← open
    this.fx = app.fx || null;
    // أول مرة: المباني تبدأ مخفية، وتطلع واحدًا واحدًا حين يُضغط المكعب (intro)
    if (fresh) for (const s of this.focuser.slots) if (s.group.visible) s.group.scale.setScalar(0.001);
    this.cube = null;
    this.cubeTap = null;
    this.pulse = 0;
    // الليل واليراعات: يتبعان عدد المباني المضيئة (زينة). fliesShow يفرض نسبة اليراعات أثناء عرض البداية.
    this.flies = this.fx?.fireflies() || null;
    this.fliesShow = null;
    this.night = 0;
    this.nightTween = null;
    this.applyNight(fresh ? 0 : this.nightLevel());

    this.portal = makePortal();
    this.root.add(this.portal.group);
    this.shaklon = createShaklon();
    placeShaklon(this.shaklon, done.size > 0);
    this.root.add(this.shaklon.group);

    this.counter = new Counter(this.hud, this.fx);
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

  dispose() {
    this.nightTween?.cancel();
    this.app.stage.setNight?.(0);           // الفصل التالي يبدأ بلا عتمة
    this.flies?.dispose();
    this.root.removeFromParent();
  }

  /** عتمة المكان حسب ما بقي مطفأً: كل مبنى يُضاء يعيد جزءًا من النور، والمدينة المضيئة كلها نهار. */
  nightLevel() { return NIGHT_MAX * (1 - Math.min(1, this.lit.size / TOTAL)); }
  applyNight(k) { this.night = k; this.app.stage.setNight?.(k); }
  nightTo(k, dur = 1.2) {
    const from = this.night;
    this.nightTween?.cancel();
    this.nightTween = tween({ dur, ease: ease.inOutCubic, update: (e) => this.applyNight(lerp(from, k, e)) });
    return this.nightTween;
  }

  /**
   * أول مرة: مكعب متوهج يطفو في مكان خافت. بضغطة ينفجر ضوءًا، فتُبنى المدينة أمام التلاميذ
   * (رؤوس، فأحرف، فأوجه، بألوان العدسات) وتضيء ويخرج شكلون، ثم تنطفئ الأنوار وينزل الليل: هذه هي المهمة.
   */
  async intro() {
    const f = this.focuser, fx = this.fx;
    const slots = f.slots.filter((s) => s.group.visible);
    const floor = new THREE.Vector3(0, 0.004, 0.03);
    f.busy = true;                          // لا لمس للمباني أثناء العرض
    this.fliesShow = 0;
    for (const s of slots) s.shadow.visible = false;
    const cube = makeMagicCube(fx);
    this.root.add(cube.group);
    this.cube = cube;
    this.applyNight(NIGHT_CUBE);
    this.hud.say('tap_cube');
    await new Promise((resolve) => { this.cubeTap = resolve; });      // ننتظر ضغطة التلاميذ
    this.cubeTap = null;

    sfx.power();
    fx?.kick(0.6);
    await cube.charge();
    sfx.boom();
    this.nightTo(0, 0.45);                  // النور يملأ المكان
    fx?.flash(CUBE_POS, 0xffffff, { size: 1.25, dur: 0.3, opacity: 0.9 });
    fx?.rays(CUBE_POS, 0xfff3c4, { size: 1.7, dur: 0.7 });
    fx?.burst(CUBE_POS, 56, { speed: 1.0, size: 0.04, life: 1.0 });
    fx?.ring(floor, 0x7fe3ff, { from: 0.05, to: 1.0, dur: 1.1 });
    fx?.ring(floor, 0xffffff, { from: 0.05, to: 0.62, dur: 0.75, width: 0.02 });
    fx?.kick(0.8);
    cube.burst().then(() => { this.cube = null; });
    this.hud.say('city_build');

    // كرة طاقة من المكعب إلى مكان كل مبنى، وحين تصل يُبنى المبنى من رؤوسه وأحرفه وأوجهه ثم يضيء
    await Promise.all(slots.map(async (s, i) => {
      const spot = new THREE.Vector3(s.home.pos.x, 0.004, s.home.pos.z);
      const travel = 0.34 + i * 0.3;
      fx?.orb(CUBE_POS, spot.clone().setY(0.06), 0xffe27a, { dur: travel, size: 0.07, arc: 0.3 });
      await wait(travel);
      s.group.scale.setScalar(s.home.scale);
      fx?.ring(spot, 0xffe27a, { from: 0.04, to: 0.34, dur: 0.7 });
      let n = 0;
      await s.building.build({
        onStep: (kind) => {
          if (kind === 'edges') return;
          if (kind !== 'lit') { sfx.twinkle(n++); return; }
          s.shadow.visible = true;
          sfx.note(i);
          fx?.beam(spot, 0xffe27a, { height: 0.9, radius: 0.045, dur: 0.9 });
          fx?.rays(spot.clone().setY(0.18), 0xffe27a, { size: 0.6, dur: 0.5, opacity: 0.7 });
          fx?.burst(spot.clone().setY(0.1), 14, { speed: 0.45, size: 0.03 });
          fx?.kick(0.6);
          tween({ dur: 0.35, ease: ease.linear, update: (k) => s.group.scale.setScalar(s.home.scale * (1 + 0.1 * Math.sin(k * Math.PI))) });
        },
      });
    }));
    this.fliesShow = 1;                     // المدينة حيّة: يراعات تسبح فوقها
    sfx.whoosh();
    await this.portal.open();
    sfx.pop();
    fx?.burst(PORTAL.clone().setY(0.17), 16, { colors: [0x7fe3ff, 0xb48cff, 0xffffff], speed: 0.4, size: 0.03 });
    await throughPortal(this.shaklon, this.portal, true);
    this.portal.close();                    // تُغلق فورًا: البوابة أمام الهرم وتحجبه
    this.shaklon.wave(1.2);
    await wait(1.3);                        // لحظة والمدينة حيّة مضيئة

    sfx.down();                             // ثم تنطفئ الأنوار مبنًى مبنًى، وينزل الليل
    this.fliesShow = 0;
    this.nightTo(this.nightLevel(), 1.6);
    fx?.ring(floor, 0x5b6fd0, { from: 0.9, to: 0.05, dur: 0.9 });
    for (const s of slots) { s.building.blackout(); await wait(0.22); }
    await wait(0.8);
    this.fliesShow = null;
    f.busy = false;
  }

  async begin() {
    if (this.lit.size === 0) {              // أول مرة: المكعب، فالمدينة، فانطفاء الأنوار، ثم يعلن شكلون المهمة
      await this.intro();
      this.hud.say('city_intro');
      this.shaklon.wave(3);
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
    if (this.cubeTap) return [this.cube.pick];         // قبل الفتح: المكعب وحده يُضغط
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

  /**
   * زر «تمّ»: عرض «عودة النور»، ويُسجَّل المبنى في سجل المدينة.
   * العرض: المبنى يدور وتبتعد أوجهه عن هيكله ثم تعود (هذه عناصره التي عُدّت)، ثم عمود نور ونوافذ تضيء واحدة واحدة.
   */
  async finish() {
    const f = this.focuser, fx = this.fx;
    const slot = f.current;
    if (!slot || f.busy) return;
    const b = slot.building;
    const c = b.counts();
    this.hidePanels();
    if (f.lifted) await f.setLifted(false);
    this.lit.add(b.key);                    // يُسجَّل أولًا: لو أُغلقت الصفحة أثناء العرض لا يضيع العدّ
    this.session.markLit(b.key, b.def.ar, [c.faces, c.edges, c.vertices]);
    f.busy = true;                          // لا لمس أثناء العرض

    sfx.whoosh();
    const g = b.group, q0 = g.quaternion.clone(), turn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    await tween({
      dur: 1.3, ease: ease.inOutCubic,
      update: (k, raw) => {
        b.explode(Math.sin(Math.min(1, raw) * Math.PI));
        g.quaternion.copy(q0).premultiply(turn.setFromAxisAngle(up, k * Math.PI * 2));
      },
    });
    b.explode(0);
    g.quaternion.copy(q0);

    const base = new THREE.Vector3(f.center.x, 0.004, f.center.z);
    sfx.ding();
    if (fx) {
      fx.flash(fx.at(b.group, 0.05), 0xffe27a, { size: 1.1, dur: 0.5, opacity: 0.7 });
      fx.rays(fx.at(b.group, 0.05), 0xfff3c4, { size: 1.7, dur: 0.85 });
      fx.beam(base, 0xffe27a, { height: 1.7, radius: 0.09, dur: 1.4 });
      fx.ring(base, 0xffe27a, { from: 0.1, to: 0.8, dur: 1.0 });
      fx.kick(1.5);
    }
    this.nightTo(this.nightLevel(), 1.4);   // كل مبنى يُضاء يعيد جزءًا من نور المكان
    let n = 0;
    await b.lightUp(() => { sfx.twinkle(n++); fx?.kick(0.5); });
    fx?.burst(fx.at(b.group, 0.1), 40, { colors: [0xffe27a, 0xffffff, b.color], speed: 0.65, size: 0.04, life: 1.2, gravity: 0.5 });
    f.busy = false;

    this.hud.say('lit');
    await wait(1.3);
    this.app.stage.zoomTo(0.62);
    await f.unfocus();
    this.fog?.setVisible(true);
    // آخر مبنى أُضيء الآن: احتفال المدينة. (resume() يستدعي cityDone(false) بلا احتفال، وهو لمن يعود إلى مدينة مضيئة من قبل.)
    if (CITY_ORDER.every((k) => this.lit.has(k)) && this.lit.has(MYSTERY)) this.cityDone(true);
    else this.resume();
  }

  /** تحدي «المجسم الغامض»: ضباب في وسط المدينة ولغز من شكلون. */
  startMystery() {
    if (this.mystery !== 'none' || this.focuser.current || this.focuser.busy) return;      // busy: عرض البداية أو عرض عودة النور جارٍ
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
    if (this.fx) {
      this.fx.burst(new THREE.Vector3(LAYOUT.block.x, 0.2, LAYOUT.block.z), 30, { speed: 0.6, size: 0.04, life: 1.0 });
      this.fx.ring(new THREE.Vector3(LAYOUT.block.x, 0.004, LAYOUT.block.z), 0xb48cff, { from: 0.05, to: 0.5 });
      this.fx.kick(1);
    }
    this.hud.say('mystery_reveal');
  }

  /** المدينة كلها مضيئة: ننتقل إلى «مهمة المحقق». */
  cityDone(celebrate = true) {
    this.done = true;
    this.nightTo(0, 1.2);                   // عاد النهار
    if (celebrate) {                        // المدينة كلها مضيئة: المباني تقفز بالتتابع وأعمدة نور وألعاب نارية
      sfx.fanfare(); this.hud.confetti(); this.shaklon.celebrate();
      this.fx?.rays(new THREE.Vector3(0, 0.3, 0), 0xfff3c4, { size: 2.0, dur: 1.1 });
      this.fx?.fireworks(new THREE.Vector3(0, 0.15, 0), 8, 0.45);
      this.focuser.slots.filter((s) => s.group.visible).forEach((s, i) => wait(0.2 + i * 0.28).then(() => {
        this.focuser.hop(s);
        sfx.note(i);
        this.fx?.beam(new THREE.Vector3(s.home.pos.x, 0.004, s.home.pos.z), 0xffe27a, { height: 1.1, radius: 0.05, dur: 1.0 });
      }));
    }
    this.hud.say('city_lit', { voice: celebrate });
    this.hud.button('exam', true);
    this.paintTeacher();
  }

  tap(hit) {
    const f = this.focuser;
    if (this.cubeTap) { if (hit?.object.userData.kind === 'cube') this.cubeTap(); return; }
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
    if (this.cube) {
      this.cube.update(dt);
      if (this.cubeTap) {                              // حلقة ضوء تنبض تحت المكعب حتى يُضغط
        this.pulse += dt;
        if (this.pulse > 1.3) { this.pulse = 0; this.fx?.ring(new THREE.Vector3(0, 0.004, 0.03), 0x7fe3ff, { from: 0.04, to: 0.42, dur: 1.2 }); }
      }
    }
    this.fog?.update(dt);
    this.shaklon.update(dt, this.camera);
    const f = this.focuser;
    // اليراعات بقدر ما أُضيء من المدينة، وتختفي أثناء فحص مبنًى حتى لا تشتّت العدّ
    this.flies?.set(this.fliesShow ?? (f.current ? 0 : this.lit.size / TOTAL));
    const top = this.ground?.userData.top.material;
    if (top?.map) {                                    // سجادة وضع 3D تعتم مع الليل (في AR السجادة الحقيقية تعتم مع صورة الكاميرا)
      const n = this.night;
      top.color.setRGB(Math.max(0.06, 1 - n * 1.3), Math.max(0.07, 1 - n * 1.25), Math.max(0.12, 1 - n));
    }
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
