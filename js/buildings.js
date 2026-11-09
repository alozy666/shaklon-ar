// المجسمات الخمسة مولّدة بالكود. كل وجه مسطّح Mesh مستقل يمكن فصله،
// والجزء المنحني Mesh واحد لا ينفصل.
// هذا الملف هو مفتاح الإجابة داخل الأداة: يجب أن يطابق docs/lesson.md.
import * as THREE from 'three';
import { SHAPES, BUILDINGS } from './config.js';
import { tween, ease } from './tween.js';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const neg = (v) => v.clone().negate();

const DARK = 0x39446e;        // لون المبنى المطفأ
const DARK_EDGE = 0x9fb3f5;
const CORE = 0x161c36;        // يظهر مكان الوجه بعد فصله
const WINDOW = 0xffe27a;

/** اتجاه وجه مسطّح: محوره Z المحلي = العمود على الوجه. */
function orient(normal, upHint) {
  const z = normal.clone().normalize();
  const x = new THREE.Vector3().crossVectors(upHint, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function poly(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return new THREE.ShapeGeometry(s);
}
const rectGeo = (w, h) => poly([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]);
const triGeo = (b, t) => poly([[-b / 2, -t / 3], [b / 2, -t / 3], [0, (2 * t) / 3]]);
const discGeo = (r) => new THREE.CircleGeometry(r, 56);

const face = (shape, geo, w, h, normal, dist, upHint, pos) => ({
  shape, geo, w, h, normal: normal.clone().normalize(),
  pos: pos || normal.clone().normalize().multiplyScalar(dist),
  quat: orient(normal, upHint),
});

// ---- تعريف المجسمات (وحدة القياس = عرض بطاقة التتبّع) ----
const SOLIDS = {
  // البيت: مكعب ← 6 مربعات
  cube() {
    const s = 0.3;
    const normals = [Z, X, neg(Z), neg(X), Y, neg(Y)];
    return {
      faces: normals.map((n) => face('square', rectGeo(s, s), s, s, n, s / 2, n.y ? Z : Y)),
      curved: [],
      core: new THREE.BoxGeometry(s, s, s),
      bottom: -s / 2,
    };
  },
  // العمارة: متوازي مستطيلات بأبعاد مختلفة كلها ← 6 مستطيلات، ولا وجه مربع
  cuboid() {
    const w = 0.26, h = 0.44, d = 0.16;
    return {
      faces: [
        face('rectangle', rectGeo(w, h), w, h, Z, d / 2, Y),
        face('rectangle', rectGeo(d, h), d, h, X, w / 2, Y),
        face('rectangle', rectGeo(w, h), w, h, neg(Z), d / 2, Y),
        face('rectangle', rectGeo(d, h), d, h, neg(X), w / 2, Y),
        face('rectangle', rectGeo(w, d), w, d, Y, h / 2, Z),
        face('rectangle', rectGeo(w, d), w, d, neg(Y), h / 2, Z),
      ],
      curved: [],
      core: new THREE.BoxGeometry(w, h, d),
      bottom: -h / 2,
    };
  },
  // البرج: أسطوانة ← دائرتان + جزء منحنٍ
  cylinder() {
    const r = 0.14, h = 0.42;
    return {
      faces: [
        face('circle', discGeo(r), 2 * r, 2 * r, Y, h / 2, Z),
        face('circle', discGeo(r), 2 * r, 2 * r, neg(Y), h / 2, Z),
      ],
      curved: [new THREE.CylinderGeometry(r, r, h, 56, 1, true)],
      core: new THREE.CylinderGeometry(r, r, h, 56),
      bottom: -h / 2,
      rings: [0.1, 0, -0.1].map((y) => ({ y, r })),
    };
  },
  // كشك الآيس كريم: مخروط ← دائرة واحدة + جزء منحنٍ
  cone() {
    const r = 0.17, h = 0.36;
    return {
      faces: [face('circle', discGeo(r), 2 * r, 2 * r, neg(Y), h / 2, Z)],
      curved: [new THREE.ConeGeometry(r, h, 56, 1, true)],
      core: new THREE.ConeGeometry(r, h, 56),
      bottom: -h / 2,
      rings: [-0.1, 0.02].map((y) => ({ y, r: (r * (h / 2 - y)) / h })),
    };
  },
  // الخيمة: منشور ثلاثي ← مثلثان + 3 مستطيلات
  prism() {
    const b = 0.34, t = 0.3, L = 0.56;
    const slant = Math.hypot(b / 2, t);
    const tri = new THREE.Shape();
    tri.moveTo(-b / 2, -t / 3); tri.lineTo(b / 2, -t / 3); tri.lineTo(0, (2 * t) / 3); tri.closePath();
    const core = new THREE.ExtrudeGeometry(tri, { depth: L, bevelEnabled: false });
    core.translate(0, 0, -L / 2);
    const nR = new THREE.Vector3(t, b / 2, 0);
    const nL = new THREE.Vector3(-t, b / 2, 0);
    return {
      faces: [
        face('triangle', triGeo(b, t), b, t, Z, L / 2, Y),
        face('rectangle', rectGeo(slant, L), slant, L, nR, 0, Z, new THREE.Vector3(b / 4, t / 6, 0)),
        face('rectangle', rectGeo(slant, L), slant, L, nL, 0, Z, new THREE.Vector3(-b / 4, t / 6, 0)),
        face('triangle', triGeo(b, t), b, t, neg(Z), L / 2, Y),
        face('rectangle', rectGeo(b, L), b, L, neg(Y), t / 3, Z),
      ],
      curved: [],
      core,
      bottom: -t / 3,
    };
  },
};

let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,236,160,0.9)');
  grad.addColorStop(0.45, 'rgba(255,214,110,0.28)');
  grad.addColorStop(1, 'rgba(255,214,110,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

export class Building {
  /** mode: 'dark' مطفأ | 'plain' بلونه | 'lit' مضيء بنوافذ */
  constructor(key, mode = 'plain') {
    this.key = key;
    this.def = BUILDINGS[key];
    this.mode = mode;
    this.group = new THREE.Group();
    this.faces = [];
    this.curved = [];
    this.decor = [];
    const solid = SOLIDS[this.def.solid]();
    this.bottom = solid.bottom;
    this.maxFaceDim = Math.max(...solid.faces.map((f) => Math.max(f.w, f.h)));

    solid.core.computeBoundingSphere();
    const bs = solid.core.boundingSphere;
    this.radius = bs.center.length() + bs.radius;

    // لبّ داكن أصغر قليلًا: يبقى المبنى مصمتًا بعد فصل الأوجه
    this.core = new THREE.Mesh(solid.core, new THREE.MeshStandardMaterial({ color: CORE, roughness: 0.9 }));
    this.core.scale.setScalar(0.985);
    this.core.userData = { kind: 'core', building: this };
    this.group.add(this.core);

    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(solid.core, 25),
      new THREE.LineBasicMaterial({ color: DARK_EDGE }),
    );
    this.edges.scale.setScalar(1.003);
    this.group.add(this.edges);

    solid.faces.forEach((f, index) => {
      const mesh = new THREE.Mesh(f.geo, new THREE.MeshStandardMaterial({
        roughness: 0.7, metalness: 0, side: THREE.DoubleSide,
      }));
      mesh.position.copy(f.pos);
      mesh.quaternion.copy(f.quat);
      // حافة بيضاء تظهر حول الوجه بعد فصله (شكل «ملصق»)
      const rim = new THREE.Mesh(f.geo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      rim.scale.setScalar(1.12);
      rim.position.z = -0.004;
      rim.visible = false;
      mesh.add(rim);
      mesh.userData = {
        kind: 'face', shape: f.shape, building: this, index, attached: true, rim,
        home: { pos: f.pos.clone(), quat: f.quat.clone() },
      };
      this.group.add(mesh);
      this.faces.push(mesh);
      this.addWindows(mesh, f);
    });

    solid.curved.forEach((geo) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }));
      mesh.userData = { kind: 'curved', building: this };
      this.group.add(mesh);
      this.curved.push(mesh);
    });

    // حلقات مضيئة للمجسمات المنحنية في النسخة المضيئة
    (solid.rings || []).forEach(({ y, r }) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.004, 0.007, 8, 48),
        new THREE.MeshBasicMaterial({ color: WINDOW }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.group.add(ring);
      this.decor.push(ring);
    });

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55,
    }));
    this.glow.scale.setScalar(this.radius * 3.6);
    this.group.add(this.glow);

    this.setMode(mode);
  }

  /** نوافذ تظهر فقط في النسخة المضيئة، حتى لا تُحسب أشكالًا أثناء التحليل. */
  addWindows(mesh, f) {
    if (Math.abs(f.normal.y) > 0.3) return;            // الأسقف والأرضيات بلا نوافذ
    const mat = new THREE.MeshBasicMaterial({ color: WINDOW });
    const add = (geo, x, y) => {
      const w = new THREE.Mesh(geo, mat);
      w.position.set(x, y, 0.003);
      mesh.add(w);
      this.decor.push(w);
    };
    if (f.shape === 'triangle') {
      add(triGeo(f.w * 0.3, f.h * 0.42), 0, -f.h / 3 + (f.h * 0.42) / 3 + 0.012);
      return;
    }
    const cols = f.w > 0.2 ? 2 : 1;
    const rows = f.h > 0.35 ? 3 : 2;
    const cw = f.w / cols, ch = f.h / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        add(rectGeo(cw * 0.42, ch * 0.42), -f.w / 2 + cw * (c + 0.5), -f.h / 2 + ch * (r + 0.5));
      }
    }
  }

  get pickables() { return [...this.faces.filter((f) => f.userData.attached), ...this.curved, this.core]; }
  get detachedCount() { return this.faces.filter((f) => !f.userData.attached).length; }

  /** عدد الأوجه المفصولة من كل شكل، مثل {square: 6}. */
  detachedShapes() {
    const counts = {};
    for (const f of this.faces) {
      if (!f.userData.attached) counts[f.userData.shape] = (counts[f.userData.shape] || 0) + 1;
    }
    return counts;
  }

  baseColor() { return this.mode === 'dark' ? DARK : this.def.color; }

  paintFace(mesh) {
    const m = mesh.material;
    if (mesh.userData.attached) {
      m.color.setHex(this.baseColor());
      m.emissive.setHex(this.mode === 'lit' ? this.def.color : 0x000000);
      m.emissiveIntensity = this.mode === 'lit' ? 0.35 : 0;
    } else {
      const c = SHAPES[mesh.userData.shape].color;
      m.color.setHex(c);
      m.emissive.setHex(c);
      m.emissiveIntensity = 0.18;
    }
    mesh.userData.rim.visible = !mesh.userData.attached;
    for (const child of mesh.children) {
      if (child !== mesh.userData.rim) child.visible = this.mode === 'lit' && mesh.userData.attached;
    }
  }

  setMode(mode) {
    this.mode = mode;
    const lit = mode === 'lit';
    this.faces.forEach((f) => this.paintFace(f));
    for (const c of this.curved) {
      c.material.color.setHex(this.baseColor());
      c.material.emissive.setHex(lit ? this.def.color : 0x000000);
      c.material.emissiveIntensity = lit ? 0.35 : 0;
    }
    for (const d of this.decor) d.visible = lit && (d.parent === this.group || d.parent.userData.attached);
    this.glow.visible = lit;
    this.edges.material.color.setHex(mode === 'dark' ? DARK_EDGE : 0xffffff);
    this.edges.material.transparent = true;
    this.edges.material.opacity = mode === 'dark' ? 0.9 : 0.55;
  }

  /** إظهار أو إخفاء جسم المبنى كله (يستخدمه مشهد الضباب). */
  setBodyVisible(visible) {
    this.core.visible = visible;
    this.edges.visible = visible;
    this.curved.forEach((c) => (c.visible = visible));
  }

  /** وميض قصير لوجه مسطّح عند لمسه. */
  pulse(mesh) {
    const m = mesh.material;
    const hex = this.baseColor();
    tween({
      dur: 0.9,
      update: (k) => {
        if (!mesh.userData.attached) return;
        const a = Math.sin(k * Math.PI);
        m.emissive.setHex(0xfff0a8);
        m.emissiveIntensity = a * 0.95;
        m.color.setHex(hex).lerp(new THREE.Color(0xfff6cf), a * 0.55);
        if (k >= 1) this.paintFace(mesh);
      },
    });
  }

  /** اهتزاز: «هذا الجزء لا ينفصل». */
  wobble() {
    tween({
      dur: 0.45, ease: ease.linear,
      update: (k) => { this.group.position.x = Math.sin(k * 22) * 0.022 * (1 - k); },
    });
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.group.removeFromParent();
  }
}
