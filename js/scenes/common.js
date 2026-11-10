// ما تشترك فيه المشاهد: أرض المدينة، الظل، الضباب، والتركيز على مبنى (Focuser) مع رفعه وتدويره،
// ومنطق العدّ بالعدسات (Counter).
import * as THREE from 'three';
import { tween, ease, lerp } from '../tween.js';
import { LINES, ELEMENT_ORDER } from '../config.js';
import { sfx } from '../audio.js';

export const LIFT_Y = 0.66;            // ارتفاع المبنى عند «ارفع المبنى»
const FOCUS_RADIUS = 0.4;              // كل المباني تُكبَّر لتملأ هذا الحجم عند فحصها
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const va = new THREE.Vector3();

/** اتجاه من فضاء الكاميرا (يمينها أو أعلاها) محوَّلًا إلى إحداثيات جسم. */
export function cameraAxisIn(parent, camera, axis, out) {
  camera.getWorldQuaternion(qb);
  parent.getWorldQuaternion(qa).invert();
  return out.copy(axis).applyQuaternion(qb).applyQuaternion(qa).normalize();
}

/** دوران حر بالسحب حول محوري الشاشة. */
export function trackball(object, parent, camera, dx, dy) {
  cameraAxisIn(parent, camera, Y, va);
  object.quaternion.premultiply(qa.setFromAxisAngle(va, dx * 4.2));
  cameraAxisIn(parent, camera, X, va);
  object.quaternion.premultiply(qa.setFromAxisAngle(va, dy * 4.2));
}

const yawQuat = (yaw) => new THREE.Quaternion().setFromAxisAngle(Y, yaw);

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

/**
 * أرض المشهد في وضع 3D (في وضع AR الأرض هي السجادة المطبوعة نفسها).
 * image: صورة السجادة لتُرسم على السطح، أو null للون مصمت.
 */
export function makeGround({ w = 1, d = 0.75, color = 0x1c2552, rim = 0x3f4fa6, image = null }) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRect(w + 0.06, d + 0.06, 0.05), { depth: 0.04, bevelEnabled: false, curveSegments: 10 }),
    new THREE.MeshStandardMaterial({ color: rim, roughness: 0.85 }),
  );
  base.geometry.rotateX(Math.PI / 2);
  base.position.y = -0.004;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  top.rotation.x = -Math.PI / 2;
  group.add(base, top);
  if (image) {
    new THREE.TextureLoader().load(image, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      top.material.map = tex;
      top.material.color.setHex(0xffffff);
      top.material.needsUpdate = true;
    }, undefined, () => { /* لا صورة: يبقى اللون */ });
  }
  return group;
}

let shadowTexture = null;
function makeShadow(radius) {
  if (!shadowTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    shadowTexture = new THREE.CanvasTexture(c);
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2.6, radius * 2.6),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

let fogTexture = null;
/** كرات ضبابية تخفي ما بداخلها. ترجع {sprites, update(dt), disperse()}. */
export function makeFog(root, center, { count = 44, radius = 0.3 } = {}) {
  if (!fogTexture) {
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
  }
  const sprites = [];
  let clock = 0;
  for (let i = 0; i < count; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: fogTexture, transparent: true, depthWrite: false, opacity: 0,
      color: new THREE.Color().setHSL(0.63, 0.35, 0.86 + Math.random() * 0.12),
    }));
    const dir = new THREE.Vector3().randomDirection().multiplyScalar(radius * (0.25 + Math.random() * 0.75));
    dir.y = Math.abs(dir.y) * 0.9;
    sprite.position.copy(center).add(dir);
    sprite.scale.setScalar(radius * (1.1 + Math.random() * 0.8));
    sprite.userData = { base: sprite.position.clone(), phase: Math.random() * 6.3, speed: 0.4 + Math.random() * 0.6 };
    sprite.renderOrder = 5;
    root.add(sprite);
    sprites.push(sprite);
    tween({ dur: 0.9, delay: Math.random() * 0.5, update: (k) => { sprite.material.opacity = 0.9 * k; } });
  }
  return {
    setVisible(v) { sprites.forEach((s) => (s.visible = v)); },
    update(dt) {
      clock += dt;
      for (const s of sprites) {
        const u = s.userData;
        s.position.x = u.base.x + Math.sin(clock * u.speed + u.phase) * radius * 0.08;
        s.position.y = u.base.y + Math.cos(clock * u.speed * 0.8 + u.phase) * radius * 0.06;
      }
    },
    disperse() {
      for (const s of sprites.splice(0)) {
        const p0 = s.position.clone();
        const out = p0.clone().sub(center).normalize().multiplyScalar(radius * 2.4).add(p0);
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
    },
  };
}

/** يدير مباني المشهد: عرضها كلها، أو تقريب واحد منها لفحصه، ورفعه وتدويره. */
export class Focuser {
  constructor(root, camera, center = new THREE.Vector3(0, 0, 0.03)) {
    this.root = root;
    this.camera = camera;
    this.center = center;
    this.slots = [];
    this.current = null;
    this.busy = false;
    this.lifted = false;
    this.spinning = null;
  }

  addSlot(building, { x, z, scale = 1, yaw = 0 }) {
    const group = new THREE.Group();
    group.position.set(x, -building.bottom * scale, z);
    group.scale.setScalar(scale);
    building.group.quaternion.copy(yawQuat(yaw));
    group.add(building.group);
    const shadow = makeShadow(building.radius);
    shadow.position.y = building.bottom + 0.004;
    group.add(shadow);
    this.root.add(group);
    const slot = { group, building, shadow, index: this.slots.length, yaw, home: { pos: group.position.clone(), scale, yaw } };
    this.slots.push(slot);
    return slot;
  }

  slotOf(object) {
    const b = object?.userData?.building;
    return b ? this.slots.find((s) => s.building === b) : null;
  }

  /** في العرض العام: أجسام كل المباني الظاهرة. */
  overviewPickables() {
    return this.slots.filter((s) => s.group.visible).flatMap((s) => s.building.pickablesFor(null));
  }

  /** يقرّب المبنى إلى وسط السجادة ويكبّره، واقفًا على الأرض. */
  async focus(slot) {
    if (this.busy || this.current === slot) return;
    if (this.current) await this.unfocus();
    this.busy = true;
    this.current = slot;
    this.lifted = false;
    const fs = FOCUS_RADIUS / slot.building.radius;
    const p0 = slot.group.position.clone(), s0 = slot.group.scale.x;
    const p1 = new THREE.Vector3(this.center.x, -slot.building.bottom * fs, this.center.z);
    const others = this.slots.filter((s) => s !== slot && s.group.visible);
    this.hidden = others;
    const os = others.map((s) => s.group.scale.x);
    await tween({
      dur: 0.65, ease: ease.outCubic,
      update: (k) => {
        slot.group.position.lerpVectors(p0, p1, k);
        slot.group.scale.setScalar(lerp(s0, fs, k));
        others.forEach((s, i) => {
          s.group.scale.setScalar(Math.max(0.001, lerp(os[i], 0, k)));
          if (k >= 1) s.group.visible = false;
        });
      },
    });
    this.busy = false;
  }

  async unfocus() {
    const slot = this.current;
    if (!slot || this.busy) return;
    this.busy = true;
    this.stopSpin();
    const g = slot.building.group;
    const p0 = slot.group.position.clone(), s0 = slot.group.scale.x, q0 = g.quaternion.clone();
    const q1 = yawQuat(slot.home.yaw);
    const others = this.hidden || [];
    others.forEach((s) => (s.group.visible = true));
    await tween({
      dur: 0.6, ease: ease.inOutCubic,
      update: (k) => {
        slot.group.position.lerpVectors(p0, slot.home.pos, k);
        slot.group.scale.setScalar(lerp(s0, slot.home.scale, k));
        g.quaternion.slerpQuaternions(q0, q1, k);
        others.forEach((s) => s.group.scale.setScalar(lerp(0.001, s.home.scale, k)));
      },
    });
    slot.yaw = slot.home.yaw;
    slot.shadow.visible = true;
    this.lifted = false;
    this.current = null;
    this.busy = false;
  }

  /** «ارفع المبنى»: يرتفع ويميل نحو الناظر ليظهر وجهه السفلي وأحرفه ورؤوسه. */
  async setLifted(on) {
    const slot = this.current;
    if (!slot || this.busy || this.lifted === on) return;
    this.busy = true;
    this.stopSpin();
    this.lifted = on;
    slot.shadow.visible = !on;
    const g = slot.building.group;
    const fs = slot.group.scale.x;
    const p0 = slot.group.position.clone();
    const p1 = new THREE.Vector3(this.center.x, on ? LIFT_Y : -slot.building.bottom * fs, this.center.z);
    const q0 = g.quaternion.clone();
    const q1 = yawQuat(slot.yaw);
    if (on) {
      cameraAxisIn(slot.group, this.camera, X, va);
      q1.premultiply(qa.setFromAxisAngle(va, -1.15));       // سالب = أسفل المبنى نحو الناظر
    }
    await tween({
      dur: 0.7, ease: ease.inOutCubic,
      update: (k) => { slot.group.position.lerpVectors(p0, p1, k); g.quaternion.slerpQuaternions(q0, q1, k); },
    });
    this.busy = false;
  }

  stopSpin() {
    if (this.spinning) { this.spinning.cancel(); this.spinning = null; }
  }

  /** السحب: على الأرض يدور المبنى حول نفسه فقط (كأنك تمشي حوله)، ومرفوعًا يدور بحرية. */
  rotateBy(dx, dy) {
    const slot = this.current;
    if (!slot || this.busy) return;
    this.stopSpin();
    const g = slot.building.group;
    if (this.lifted) trackball(g, slot.group, this.camera, dx, dy);
    else { slot.yaw += dx * 4.2; g.quaternion.copy(yawQuat(slot.yaw)); }
  }

  /** لمسة في خطوة «أتجوّل»: دورة كاملة ببطء. */
  spin() {
    const slot = this.current;
    if (!slot || this.spinning || this.busy) return;
    const g = slot.building.group;
    const axis = new THREE.Vector3(0, 1, 0);
    const lifted = this.lifted;
    if (lifted) cameraAxisIn(slot.group, this.camera, Y, axis);
    let last = 0;
    this.spinning = tween({
      dur: 3, ease: ease.inOutCubic,
      update: (k) => {
        const step = (k - last) * Math.PI * 2;
        last = k;
        if (lifted) g.quaternion.premultiply(qa.setFromAxisAngle(axis, step));
        else { slot.yaw += step; g.quaternion.copy(yawQuat(slot.yaw)); }
        if (k >= 1) this.spinning = null;
      },
    });
  }

  /** قفزة صغيرة لمبنى في مكانه (مبنى مضيء يحيّي من يلمسه). */
  hop(slot) {
    const y0 = slot.home.pos.y;
    tween({ dur: 0.5, ease: ease.linear, update: (k) => { slot.group.position.y = y0 + Math.sin(k * Math.PI) * 0.08; } });
  }
}

/**
 * منطق العدّ بالعدسات، مشترك بين المدينة ووضع المعلم في التقييم.
 * العدسة تضيء عنصرها فقط، وما أُضيء لا يُعدّ مرتين.
 */
export class Counter {
  constructor(hud) {
    this.hud = hud;
    this.lens = 'faces';
    this.building = null;
    this.onChange = null;
  }

  attach(building) {
    this.building = building;
    this.hud.lenses.show(building.counts(), this.lens);
  }
  detach() {
    this.building = null;
    this.hud.lenses.show(null);
  }
  setLens(lens, speak = true) {
    this.lens = lens;
    if (this.building) this.hud.lenses.show(this.building.counts(), lens);
    if (speak) this.hud.say('lens_' + lens);
  }

  /** لمسة على المبنى. viaSwipe: جاءت من تمرير الإصبع على حرف. */
  touch(hit, viaSwipe = false) {
    const b = this.building;
    const d = hit?.object.userData;
    if (!b || !d || d.building !== b) return false;
    if (d.el && d.el.kind === this.lens) {
      if (!b.light(d.el)) {
        if (!viaSwipe) { sfx.tick(); b.bump(d.el); this.hud.toast(LINES.already, 1.2); }
        return false;
      }
      sfx.pop();
      this.hud.lenses.show(b.counts(), this.lens, this.lens);
      this.onChange?.();
      return true;
    }
    if (viaSwipe) return false;
    if (this.lens === 'faces' && d.kind === 'curved') { sfx.boing(); b.wobble(); this.hud.say('not_face'); }
    else if (this.lens === 'edges' && d.kind === 'rim') { sfx.boing(); b.wobble(); this.hud.say('not_edge'); }
    return false;
  }

  /** تمرير الإصبع على حرف: يضيء عندما يغطي الإصبع جزءًا كافيًا من طوله. */
  swipe(hit) {
    const el = hit?.object.userData.el;
    if (!el || el.kind !== 'edges' || el.lit || this.lens !== 'edges') return;
    const t = el.proxy.worldToLocal(hit.point.clone()).y / el.length;
    el.swipe = el.swipe ? { min: Math.min(el.swipe.min, t), max: Math.max(el.swipe.max, t) } : { min: t, max: t };
    if (el.swipe.max - el.swipe.min >= 0.35) this.touch(hit, true);
  }
  endSwipe() {
    this.building?.els.edges.forEach((el) => (el.swipe = null));
  }

  /** تلميح يتكيّف مع ما عدّه التلميذ حتى الآن. */
  hintKey(lifted) {
    const b = this.building;
    const miss = b.missing(this.lens);
    if (miss.length) {
      if (this.lens === 'faces' && !lifted && miss.every((e) => e.bottom)) return 'hint_lift';
      return 'hint_more_' + this.lens;
    }
    const next = ELEMENT_ORDER.find((k) => b.missing(k).length);
    return next ? 'hint_try_' + next : 'count_done';
  }

  /** للمعلم: يضيء كل العناصر واحدًا بعد الآخر مع العدّ. */
  async revealAll() {
    const b = this.building;
    for (const kind of ELEMENT_ORDER) {
      this.lens = kind;
      for (const el of b.els[kind]) {
        if (this.building !== b) return;
        if (b.light(el)) { sfx.pop(); this.hud.lenses.show(b.counts(), kind, kind); await tween({ dur: 0.16, update() {} }); }
      }
    }
  }
}
