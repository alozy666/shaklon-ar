// مشهد «المجسم الغامض»: مبنى مخفي في الضباب، يظهر وجه مع كل لمسة،
// ثم ينكشف المبنى كاملًا في اللمسة الأخيرة.
import * as THREE from 'three';
import { Building } from '../buildings.js';
import { createShaklon } from '../shaklon.js';
import { Tray, FOCUS, makePlatform } from './common.js';
import { MYSTERY_ORDER } from '../config.js';
import { sfx } from '../audio.js';
import { tween, ease, lerp } from '../tween.js';

let fogTexture = null;
function getFogTexture() {
  if (fogTexture) return fogTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(240,244,255,0.55)');
  grad.addColorStop(1, 'rgba(240,244,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  fogTexture = new THREE.CanvasTexture(c);
  return fogTexture;
}

export class MysteryScene {
  constructor(app) {
    this.app = app;
    this.hud = app.hud;
    const { world, camera } = app.stage;
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.position.y = 0.03;
    world.add(this.root);
    this.root.add(makePlatform({ color: 0x3b2f7a, rim: 0x6a5bc4 }));

    this.tray = new Tray(this.root, camera);
    this.holder = new THREE.Group();          // يحمل المبنى في موضع الفحص
    this.holder.position.copy(FOCUS);
    this.root.add(this.holder);

    this.shaklon = createShaklon();
    this.shaklon.group.scale.setScalar(0.28);
    this.shaklon.group.position.set(0.6, 0, 0.36);
    this.root.add(this.shaklon.group);

    this.fog = [];
    this.round = 0;
    this.busy = false;
    this.hud.button('next', false, () => this.next());
    this.setup();
  }

  begin() {
    this.hud.say('mystery_intro');
    this.shaklon.wave(3);
  }

  setup() {
    const key = MYSTERY_ORDER[this.round % MYSTERY_ORDER.length];
    this.building = new Building(key, 'plain');
    const b = this.building;
    this.holder.scale.setScalar(0.4 / b.radius);
    b.group.rotation.set(0.25, 0.6, 0);
    this.holder.add(b.group);
    b.setBodyVisible(false);
    b.faces.forEach((f) => (f.visible = false));
    b.glow.visible = false;
    this.revealed = 0;
    this.open = false;

    // ضباب: كرات ضبابية تغطي المبنى تمامًا
    const tex = getFogTexture();
    for (let i = 0; i < 46; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0.9,
        color: new THREE.Color().setHSL(0.63, 0.35, 0.86 + Math.random() * 0.12),
      }));
      const dir = new THREE.Vector3().randomDirection().multiplyScalar(0.12 + Math.random() * 0.34);
      dir.y *= 0.8;
      sprite.position.copy(FOCUS).add(dir);
      sprite.scale.setScalar(0.42 + Math.random() * 0.3);
      sprite.userData = { base: sprite.position.clone(), phase: Math.random() * 6.3, speed: 0.4 + Math.random() * 0.6, kind: 'fog' };
      sprite.renderOrder = 5;
      this.root.add(sprite);
      this.fog.push(sprite);
    }
  }

  pickables() {
    return this.open ? this.building.pickables : [];
  }

  tap() {
    if (this.busy) return;
    const b = this.building;
    if (this.open) { sfx.whoosh(); this.spin(); return; }
    if (this.revealed < b.faces.length) this.revealFace(b.faces[this.revealed++]);
    else this.revealAll();
  }

  /** وجه يخرج من الضباب ويستقر على الرف. */
  revealFace(face) {
    const b = this.building;
    sfx.pop();
    face.visible = true;
    face.scale.setScalar(0.05);
    face.position.set(0, 0, 0);
    this.tray.add(face, b.faces.length);
    this.pulseFog();
    const last = this.revealed === b.faces.length;
    this.hud.say(last ? 'mystery_guess' : 'mystery_more', { voice: last });
    this.busy = true;
    tween({ dur: 0.45, update: (k) => { if (k >= 1) this.busy = false; } });
  }

  pulseFog() {
    for (const s of this.fog) {
      const o0 = s.material.opacity;
      tween({ dur: 0.5, update: (k) => { s.material.opacity = o0 * (1 - 0.1 * k); } });
    }
  }

  async revealAll() {
    const b = this.building;
    this.busy = true;
    sfx.fanfare();
    for (const s of this.fog) {
      const p0 = s.position.clone();
      const out = p0.clone().sub(FOCUS).normalize().multiplyScalar(0.9).add(p0);
      const o0 = s.material.opacity, s0 = s.scale.x;
      tween({
        dur: 1.1, ease: ease.outCubic,
        update: (k) => {
          s.position.lerpVectors(p0, out, k);
          s.material.opacity = o0 * (1 - k);
          s.scale.setScalar(lerp(s0, s0 * 1.6, k));
          if (k >= 1) { s.material.dispose(); s.removeFromParent(); }
        },
      });
    }
    this.fog = [];
    b.setBodyVisible(true);
    const hs = this.holder.scale.x;
    tween({ dur: 0.7, ease: ease.outBack, update: (k) => this.holder.scale.setScalar(lerp(hs * 0.2, hs, k)) });
    await this.tray.returnAll();
    b.setMode('lit');
    this.open = true;
    this.busy = false;
    this.hud.say('mystery_reveal');
    this.hud.confetti();
    this.hud.button('next', true);
    this.shaklon.celebrate();
    this.spin();
  }

  spin() {
    if (this.spinning) return;
    const g = this.building.group;
    let last = 0;
    this.spinning = tween({
      dur: 3, ease: ease.inOutCubic,
      update: (k) => { g.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), (k - last) * Math.PI * 2); last = k; if (k >= 1) this.spinning = null; },
    });
  }

  /** مبنى غامض آخر. */
  next() {
    if (this.busy) return;
    if (this.spinning) { this.spinning.cancel(); this.spinning = null; }
    this.building.dispose();
    this.round++;
    this.hud.button('next', false);
    this.setup();
    this.hud.say('mystery_intro');
  }

  drag(dx, dy) {
    if (this.open && !this.busy) {
      if (this.spinning) { this.spinning.cancel(); this.spinning = null; }
      const g = this.building.group;
      g.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), dx * 4.2);
      g.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), dy * 4.2);
    } else this.app.stage.orbit(dx * 3);
  }

  update(dt) {
    this.tray.update(dt);
    this.shaklon.update(dt, this.camera);
    this.clock = (this.clock || 0) + dt;
    for (const s of this.fog) {
      const u = s.userData;
      s.position.x = u.base.x + Math.sin(this.clock * u.speed + u.phase) * 0.03;
      s.position.y = u.base.y + Math.cos(this.clock * u.speed * 0.8 + u.phase) * 0.025;
    }
  }
}
