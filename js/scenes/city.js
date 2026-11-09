// مشهد «مدينة شكلون» (إجراءات الدرس): مدينة مطفأة فيها البيت والبرج والخيمة.
// يحلّل التلميذ كل مبنى بخطوات المحقق الأربع: أتوقع، أدوّر، أفصل، أقارن.
import * as THREE from 'three';
import { Building } from '../buildings.js';
import { createShaklon } from '../shaklon.js';
import { Focuser, makePlatform } from './common.js';
import { CITY_ORDER, LINES } from '../config.js';
import { sfx } from '../audio.js';
import { tween, wait } from '../tween.js';

const LAYOUT = {
  house: { x: 0.5, z: 0.08, yaw: 0.45 },
  tower: { x: 0, z: -0.3, yaw: 0 },
  tent: { x: -0.5, z: 0.08, yaw: 0.2 },      // الوجه المثلث نحو الناظر: يستدرج توقع «مثلث فقط»
};

export class CityScene {
  constructor(app) {
    this.app = app;
    this.hud = app.hud;
    const { world, camera } = app.stage;
    this.root = new THREE.Group();
    this.root.position.y = 0.03;
    world.add(this.root);

    this.platform = makePlatform({ color: 0x1c2552, rim: 0x3f4fa6 });
    this.root.add(this.platform);

    this.focuser = new Focuser(this.root, camera);
    for (const key of CITY_ORDER) this.focuser.addSlot(new Building(key, 'dark'), LAYOUT[key]);

    this.shaklon = createShaklon();
    this.shaklon.group.scale.setScalar(0.27);
    this.shaklon.group.position.set(0, 0, 0.44);
    this.root.add(this.shaklon.group);

    this.step = null;
    this.predicted = new Set();
    this.lit = new Set();

    const hud = this.hud;
    hud.steps.onPick = (step) => this.setStep(step);
    hud.bag.onToggle = (shape) => {
      this.predicted.has(shape) ? this.predicted.delete(shape) : this.predicted.add(shape);
      hud.bag.predict(this.predicted);
    };
    hud.button('back', false, () => this.close());
  }

  begin() {
    this.hud.say('city_intro');
    this.shaklon.wave(3);
  }

  pickables() {
    return this.focuser.current ? this.focuser.pickables() : [...this.focuser.pickables(), ...this.shaklon.pickables];
  }

  async open(slot) {
    const hud = this.hud;
    sfx.whoosh();
    this.predicted = new Set();
    await this.focuser.focus(slot);
    hud.steps.show(true);
    hud.button('back', true);
    this.setStep('predict');
  }

  async close() {
    const hud = this.hud;
    if (this.focuser.busy || !this.focuser.current) return;
    hud.compare.close();
    hud.steps.show(false);
    hud.bag.hide();
    hud.button('back', false);
    this.step = null;
    await this.focuser.unfocus();
    if (this.lit.size < CITY_ORDER.length) hud.say('city_pick', { voice: false });
  }

  setStep(step) {
    const hud = this.hud;
    const slot = this.focuser.current;
    if (!slot || this.focuser.busy) return;
    const b = slot.building;
    hud.compare.close();
    hud.steps.pulse('compare', false);

    if (step === 'compare' && b.detachedCount < b.faces.length) {
      sfx.boing();
      hud.say('compare_missing');
      return;
    }
    this.step = step;
    hud.steps.set(step);
    hud.say(step);
    if (step === 'predict') hud.bag.predict(this.predicted);
    else if (step === 'compare') {
      hud.bag.hide();
      hud.compare.open(this.predicted, b.detachedShapes(), () => this.finish());
    } else hud.bag.found(b.detachedShapes());
  }

  detach(face) {
    const hud = this.hud;
    const b = face.userData.building;
    sfx.pop();
    this.focuser.tray.add(face, b.faces.length);
    hud.bag.found(b.detachedShapes(), face.userData.shape);
    if (b.detachedCount === b.faces.length) {
      hud.say('split_done');
      hud.steps.pulse('compare');
    }
  }

  /** زر «تمّ»: تعود الأوجه ويضيء المبنى. */
  async finish() {
    const hud = this.hud;
    const slot = this.focuser.current;
    if (!slot || this.focuser.busy) return;
    const b = slot.building;
    hud.compare.close();
    hud.steps.show(false);
    hud.button('back', false);
    this.step = null;
    this.focuser.busy = true;
    await this.focuser.tray.returnAll();
    b.setMode('lit');
    sfx.ding();
    hud.say('lit');
    this.lit.add(b.key);
    await wait(1.5);
    this.focuser.busy = false;
    await this.focuser.unfocus();
    if (this.lit.size === CITY_ORDER.length) this.celebrate();
    else hud.say('city_pick', { voice: false });
  }

  celebrate() {
    const top = this.platform.userData.top.material;
    const from = top.color.clone(), to = new THREE.Color(0x3d57c9);
    tween({ dur: 1.2, update: (k) => top.color.copy(from).lerp(to, k) });
    sfx.fanfare();
    this.hud.confetti();
    this.hud.say('city_done');
    this.shaklon.celebrate();
  }

  tap(hit) {
    const f = this.focuser;
    if (f.busy) return;
    const data = hit?.object.userData;
    if (!f.current) {
      if (!data) return;
      if (data.kind === 'shaklon') { this.shaklon.wave(); this.hud.repeat(); return; }
      const slot = f.slotOf(hit.object);
      if (!slot) return;
      if (this.lit.has(slot.building.key)) { sfx.tick(); f.hop(slot); return; }
      this.open(slot);
      return;
    }
    if (!data || data.building !== f.current.building) return;
    const b = data.building;
    if (this.step === 'predict') {
      if (data.kind === 'face') { sfx.tick(); b.pulse(hit.object); }
    } else if (this.step === 'split') {
      if (data.kind === 'face') this.detach(hit.object);
      else if (data.kind === 'curved') { sfx.boing(); b.wobble(); this.hud.toast(LINES.curved); }
    } else {
      sfx.whoosh();
      f.spin();
    }
  }

  drag(dx, dy, startHit) {
    const f = this.focuser;
    if (f.busy) return;
    if (f.current && this.step !== 'predict') f.rotateBy(dx, dy);
    else if (!f.current && !startHit) this.app.stage.orbit(dx * 3);
  }

  update(dt) {
    this.focuser.update(dt);
    this.shaklon.update(dt, this.app.stage.camera);
  }
}
