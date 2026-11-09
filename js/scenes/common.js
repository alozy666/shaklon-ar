// ما تشترك فيه المشاهد: المنصة، الظل، شارة الرقم، رف الأوجه المفصولة (Tray)، والتركيز على مبنى (Focuser).
import * as THREE from 'three';
import { tween, ease, lerp } from '../tween.js';

export const FOCUS = new THREE.Vector3(0, 0.62, 0);   // مكان المبنى أثناء فحصه، مرفوعًا ليُرى وجهه السفلي
const FOCUS_RADIUS = 0.4;                              // كل المباني تُكبَّر لتملأ هذا الحجم
const IDENTITY = new THREE.Quaternion();

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const va = new THREE.Vector3();

/** دوران يجعل الجسم مواجهًا للكاميرا، محسوبًا في إحداثيات أبيه. */
export function billboardIn(parent, camera, out) {
  parent.getWorldQuaternion(qa).invert();
  camera.getWorldQuaternion(qb);
  return out.copy(qa).multiply(qb);
}

/** اتجاه من فضاء الكاميرا (مثل يمينها أو أعلاها) محوَّلًا إلى إحداثيات جسم. */
function cameraAxisIn(parent, camera, axis, out) {
  camera.getWorldQuaternion(qb);
  parent.getWorldQuaternion(qa).invert();
  return out.copy(axis).applyQuaternion(qb).applyQuaternion(qa).normalize();
}

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

/** منصة المدينة: سطحها العلوي عند y = 0. */
export function makePlatform({ w = 1.7, d = 1.15, color, rim }) {
  const group = new THREE.Group();
  const slab = (ww, dd, depth, hex, y) => {
    const geo = new THREE.ExtrudeGeometry(roundedRect(ww, dd, 0.14), { depth, bevelEnabled: false, curveSegments: 12 });
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85 }));
    mesh.position.y = y;
    return mesh;
  };
  const top = slab(w, d, 0.03, color, 0);
  const base = slab(w + 0.06, d + 0.06, 0.03, rim, -0.03);
  group.add(top, base);
  group.userData.top = top;
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

/** شارة دائرية برقم المبنى (كما في ورقة «شهادة المحقق»). */
export function makeBadge(text, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(80, 80, 72, 0, Math.PI * 2);
  g.fillStyle = '#ffffff'; g.fill();
  g.beginPath(); g.arc(80, 80, 60, 0, Math.PI * 2);
  g.fillStyle = '#' + new THREE.Color(color).getHexString(); g.fill();
  g.fillStyle = '#ffffff';
  g.font = '800 92px "Baloo Bhaijaan 2", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 80, 88);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.setScalar(0.15);
  return sprite;
}

/** رف يواجه الكاميرا دائمًا حول المبنى، تُعرض عليه الأوجه المفصولة بشكلها الحقيقي. */
export class Tray {
  constructor(root, camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.position.copy(FOCUS);
    root.add(this.group);
    this.items = [];
  }

  slot(i, total) {
    const rows = Math.ceil(total / 2);
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? 1 : -1;       // الأول على اليمين (اتجاه القراءة العربي)
    return new THREE.Vector3(side * 0.66, ((rows - 1) / 2 - row) * 0.33, 0.05);
  }

  /** ينقل وجهًا من المبنى إلى الرف مع الحفاظ على موضعه الحالي كبداية للحركة. */
  add(face, total) {
    const b = face.userData.building;
    face.userData.attached = false;
    this.group.attach(face);
    b.paintFace(face);
    const target = this.slot(this.items.length, total);
    this.items.push(face);
    const size = 0.27 / b.maxFaceDim;
    const p0 = face.position.clone(), q0 = face.quaternion.clone(), s0 = face.scale.x;
    return tween({
      dur: 0.7, ease: ease.outCubic,
      update: (k) => {
        face.position.lerpVectors(p0, target, k);
        face.position.z += Math.sin(k * Math.PI) * 0.25;      // قوس نحو الناظر حتى لا يخترق المبنى
        face.quaternion.slerpQuaternions(q0, IDENTITY, k);
        face.scale.setScalar(lerp(s0, size, k));
      },
    });
  }

  /** يعيد كل الأوجه إلى أماكنها على المبنى. */
  returnAll() {
    const items = this.items;
    this.items = [];
    return Promise.all(items.map((face, i) => {
      const b = face.userData.building;
      b.group.attach(face);
      const { pos, quat } = face.userData.home;
      const p0 = face.position.clone(), q0 = face.quaternion.clone(), s0 = face.scale.x;
      return tween({
        dur: 0.55, delay: i * 0.06, ease: ease.inOutCubic,
        update: (k) => {
          face.position.lerpVectors(p0, pos, k);
          face.quaternion.slerpQuaternions(q0, quat, k);
          face.scale.setScalar(lerp(s0, 1, k));
          if (k >= 1) { face.userData.attached = true; b.paintFace(face); }
        },
      });
    }));
  }

  update(dt) {
    billboardIn(this.group.parent, this.camera, qa);
    this.group.quaternion.slerp(qa, 1 - Math.exp(-dt * 10));
  }
}

/** يدير المباني في المشهد: عرضها كلها، أو تقريب واحد منها وتدويره. */
export class Focuser {
  constructor(root, camera) {
    this.root = root;
    this.camera = camera;
    this.tray = new Tray(root, camera);
    this.slots = [];
    this.current = null;
    this.busy = false;
    this.spinning = null;
    this.spinCount = 0;
  }

  addSlot(building, { x, z, scale = 1, yaw = 0, badge = null }) {
    const group = new THREE.Group();
    const y = -building.bottom * scale;
    group.position.set(x, y, z);
    group.scale.setScalar(scale);
    building.group.rotation.y = yaw;
    group.add(building.group);
    const shadow = makeShadow(building.radius);
    shadow.position.y = building.bottom + 0.004;
    group.add(shadow);
    if (badge) {
      badge.position.y = building.radius + 0.13;
      group.add(badge);
    }
    this.root.add(group);
    const slot = {
      group, building, shadow, badge, index: this.slots.length,
      home: { pos: group.position.clone(), scale, quat: building.group.quaternion.clone() },
    };
    this.slots.push(slot);
    return slot;
  }

  slotOf(object) {
    const b = object?.userData?.building;
    return b ? this.slots.find((s) => s.building === b) : null;
  }

  /** الأجسام القابلة للّمس الآن. */
  pickables() {
    if (this.current) return this.current.building.pickables;
    return this.slots.flatMap((s) => s.building.pickables);
  }

  async focus(slot) {
    if (this.busy || this.current === slot) return;
    if (this.current) await this.unfocus();
    this.busy = true;
    this.current = slot;
    slot.shadow.visible = false;
    if (slot.badge) slot.badge.visible = false;
    const fs = FOCUS_RADIUS / slot.building.radius;
    const p0 = slot.group.position.clone(), s0 = slot.group.scale.x;
    const others = this.slots.filter((s) => s !== slot);
    const os = others.map((s) => s.group.scale.x);
    await tween({
      dur: 0.65, ease: ease.outCubic,
      update: (k) => {
        slot.group.position.lerpVectors(p0, FOCUS, k);
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
    await this.tray.returnAll();
    const b = slot.building;
    const p0 = slot.group.position.clone(), s0 = slot.group.scale.x, q0 = b.group.quaternion.clone();
    const others = this.slots.filter((s) => s !== slot);
    others.forEach((s) => (s.group.visible = true));
    await tween({
      dur: 0.6, ease: ease.inOutCubic,
      update: (k) => {
        slot.group.position.lerpVectors(p0, slot.home.pos, k);
        slot.group.scale.setScalar(lerp(s0, slot.home.scale, k));
        b.group.quaternion.slerpQuaternions(q0, slot.home.quat, k);
        others.forEach((s) => s.group.scale.setScalar(lerp(0.001, s.home.scale, k)));
      },
    });
    slot.shadow.visible = true;
    if (slot.badge) slot.badge.visible = true;
    this.current = null;
    this.busy = false;
  }

  stopSpin() {
    if (this.spinning) { this.spinning.cancel(); this.spinning = null; }
  }

  /** سحب الإصبع: يدور المبنى حول محوري الشاشة، فيصل التلميذ إلى أي وجه حتى السفلي. */
  rotateBy(dx, dy) {
    const slot = this.current;
    if (!slot) return;
    this.stopSpin();
    const g = slot.building.group;
    cameraAxisIn(slot.group, this.camera, va.set(0, 1, 0), va);
    g.quaternion.premultiply(qa.setFromAxisAngle(va, dx * 4.2));
    cameraAxisIn(slot.group, this.camera, va.set(1, 0, 0), va);
    g.quaternion.premultiply(qa.setFromAxisAngle(va, dy * 4.2));
  }

  /** لمسة: دورة كاملة. تتناوب بين الدوران الأفقي والانقلاب لإظهار الأعلى والأسفل. */
  spin() {
    const slot = this.current;
    if (!slot || this.spinning) return;
    const g = slot.building.group;
    const flip = this.spinCount++ % 2 === 1;
    const axis = new THREE.Vector3();
    if (flip) cameraAxisIn(slot.group, this.camera, va.set(1, 0, 0), axis);
    else axis.set(0, 1, 0);
    let last = 0;
    this.spinning = tween({
      dur: 2.6, ease: ease.inOutCubic,
      update: (k) => {
        g.quaternion.premultiply(qa.setFromAxisAngle(axis, (k - last) * Math.PI * 2));
        last = k;
        if (k >= 1) this.spinning = null;
      },
    });
  }

  /** قفزة صغيرة لمبنى في مكانه (مبنى مضيء يحيّي من يلمسه). */
  hop(slot) {
    const y0 = slot.home.pos.y;
    tween({ dur: 0.5, ease: ease.linear, update: (k) => { slot.group.position.y = y0 + Math.sin(k * Math.PI) * 0.08; } });
  }

  update(dt) {
    this.tray.update(dt);
  }
}
