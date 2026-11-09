// مشهد «الحيّ الجديد» (التقييم): خمسة مبانٍ مرقّمة تدور باللمس فقط.
// لا فصل للأوجه ولا أسماء. وضع المعلم (ضغطة مطوّلة على صورة شكلون) يعرض الإجابات بعد جمع الأوراق.
import * as THREE from 'three';
import { Building } from '../buildings.js';
import { createShaklon } from '../shaklon.js';
import { Focuser, makePlatform, makeBadge } from './common.js';
import { DISTRICT_ORDER, BUILDINGS } from '../config.js';
import { sfx } from '../audio.js';

// المبنى 1 على اليمين (اتجاه القراءة العربي)
const XS = [0.62, 0.31, 0, -0.31, -0.62];
const ZS = [0.12, -0.2, 0.12, -0.2, 0.12];
const YAWS = [0.45, 0, 0, 0.2, 0.5];

export class DistrictScene {
  constructor(app) {
    this.app = app;
    this.hud = app.hud;
    const { world, camera } = app.stage;
    this.root = new THREE.Group();
    this.root.position.y = 0.03;
    world.add(this.root);
    this.root.add(makePlatform({ color: 0xdfe8ff, rim: 0x8aa2ee }));

    this.focuser = new Focuser(this.root, camera);
    DISTRICT_ORDER.forEach((key, i) => {
      this.focuser.addSlot(new Building(key, 'plain'), {
        x: XS[i], z: ZS[i], yaw: YAWS[i], scale: 0.8,
        badge: makeBadge(String(i + 1), BUILDINGS[key].color),
      });
    });

    this.shaklon = createShaklon();
    this.shaklon.group.scale.setScalar(0.24);
    this.shaklon.group.position.set(-0.31, 0, 0.42);
    this.root.add(this.shaklon.group);

    const hud = this.hud;
    hud.nums.show(DISTRICT_ORDER.map((key) => '#' + new THREE.Color(BUILDINGS[key].color).getHexString()));
    hud.nums.onPick = (i) => this.open(this.focuser.slots[i]);
    hud.button('back', false, () => this.close());
    hud.button('answer', false, () => this.showAnswer());
    hud.button('party', false, () => this.party());
    hud.onTeacher = () => this.paintTeacher();
    this.toldRule = false;
  }

  begin() {
    this.hud.say('district_intro');
    this.shaklon.wave(3);
  }

  pickables() {
    return this.focuser.current ? this.focuser.pickables() : [...this.focuser.pickables(), ...this.shaklon.pickables];
  }

  paintTeacher() {
    const on = this.hud.teacher;
    this.hud.button('answer', on && !!this.focuser.current);
    this.hud.button('party', on);
    if (!on && this.focuser.current) this.focuser.tray.returnAll().then(() => this.hud.bag.hide());
  }

  async open(slot) {
    const f = this.focuser;
    if (f.busy || f.current === slot) return;
    sfx.whoosh();
    this.hud.bag.hide();
    await f.focus(slot);
    this.hud.nums.set(slot.index);
    this.hud.title(`المبنى ${slot.index + 1}`);
    this.hud.button('back', true);
    this.paintTeacher();
    if (!this.toldRule) { this.toldRule = true; this.hud.say('district_rule'); }
  }

  async close() {
    const f = this.focuser;
    if (f.busy || !f.current) return;
    this.hud.nums.set(-1);
    this.hud.title(null);
    this.hud.button('back', false);
    this.hud.button('answer', false);
    this.hud.bag.hide();
    await f.unfocus();
  }

  /** للمعلم بعد جمع الأوراق: تُفصل أوجه المبنى لعرض الإجابة. */
  showAnswer() {
    const slot = this.focuser.current;
    if (!slot || this.focuser.busy) return;
    const b = slot.building;
    if (b.detachedCount) {
      this.focuser.tray.returnAll().then(() => this.hud.bag.hide());
      return;
    }
    b.faces.forEach((face, i) => setTimeout(() => {
      if (this.focuser.current !== slot) return;
      sfx.pop();
      this.focuser.tray.add(face, b.faces.length);
      this.hud.bag.found(b.detachedShapes(), face.userData.shape);
    }, i * 220));
  }

  party() {
    sfx.fanfare();
    this.hud.confetti();
    this.hud.say('celebrate');
    this.shaklon.celebrate();
  }

  tap(hit) {
    const f = this.focuser;
    if (f.busy) return;
    const data = hit?.object.userData;
    if (!data) return;
    if (!f.current) {
      if (data.kind === 'shaklon') { this.shaklon.wave(); this.hud.repeat(); return; }
      const slot = f.slotOf(hit.object);
      if (slot) this.open(slot);
      return;
    }
    if (data.building === f.current.building) { sfx.whoosh(); f.spin(); }
  }

  drag(dx, dy, startHit) {
    const f = this.focuser;
    if (f.busy) return;
    if (f.current) f.rotateBy(dx, dy);
    else if (!startHit) this.app.stage.orbit(dx * 3);
  }

  update(dt) {
    this.focuser.update(dt);
    this.shaklon.update(dt, this.app.stage.camera);
  }
}
