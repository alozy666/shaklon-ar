// المجسمات مولّدة بالكود. لكل مجسم ثلاثة أنواع من العناصر يمكن «إضاءتها» وعدّها:
// الأوجه (faces)، الأحرف (edges)، الرؤوس (vertices). السطح المنحني والحافة المنحنية لا يُعدّان.
// هذا الملف هو مفتاح الإجابة داخل الأداة، ويتحقق عند التشغيل من مطابقة ANSWERS في config.js.
import * as THREE from 'three';
import { BUILDINGS, ELEMENTS, ANSWERS, FX_LAYER } from './config.js';
import { tween, ease } from './tween.js';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

const DARK = 0x39446e;          // لون المبنى المطفأ
const CORE = 0x161c36;
const WINDOW = 0xffe27a;
const LINE_DARK = 0xa9b9f2;     // خطوط الأحرف قبل إضاءتها
const EDGE_R = 0.0045;          // نصف سُمك خط الحرف
const EDGE_PICK = 0.03;         // مساحة لمس الحرف (غير مرئية، أوسع ليناسب إصبع طفل)
const VERTEX_R = 0.024;
const VERTEX_PICK = 0.05;

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function polyGeo(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/** وجه مضلّع من نقاطه في الفضاء: هندسة مستوية + موضع واتجاه يضعانها على المجسم. */
function polyFace(pts) {
  const c = pts.reduce((a, p) => a.add(p), v3(0, 0, 0)).divideScalar(pts.length);
  const n = v3(0, 0, 0).crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0])).normalize();
  const x = Math.abs(n.y) > 0.99 ? X.clone() : v3(0, 0, 0).crossVectors(Y, n).normalize();
  const y = v3(0, 0, 0).crossVectors(n, x);
  const local = pts.map((p) => { const d = p.clone().sub(c); return [d.dot(x), d.dot(y)]; });
  const xs = local.map((p) => p[0]), ys = local.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  return {
    geo: polyGeo(local), pos: c, normal: n, w, h,
    quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n)),
    shape: pts.length === 3 ? 'triangle' : 'rect',
  };
}

function disc(r, normal, y) {
  return {
    geo: new THREE.CircleGeometry(r, 56), pos: v3(0, y, 0), normal: normal.clone(), w: 2 * r, h: 2 * r,
    quat: new THREE.Quaternion().setFromUnitVectors(Z, normal), shape: 'circle',
  };
}

/** متعدد أوجه من رؤوسه وقائمة أوجهه (كل وجه قائمة أرقام رؤوس بالترتيب). */
function polyhedron(verts, faceIdx) {
  const loops = faceIdx.map((idx) => {
    let pts = idx.map((i) => verts[i]);
    const c = pts.reduce((a, p) => a.add(p), v3(0, 0, 0)).divideScalar(pts.length);
    const n = v3(0, 0, 0).crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0]));
    if (n.dot(c) < 0) pts = pts.slice().reverse();          // نجعل العمود يتجه للخارج
    return pts;
  });
  const keys = new Set();
  for (const idx of faceIdx) {
    idx.forEach((a, i) => { const b = idx[(i + 1) % idx.length]; keys.add(a < b ? `${a}-${b}` : `${b}-${a}`); });
  }
  const pos = [];
  for (const loop of loops) {
    for (let i = 1; i < loop.length - 1; i++) pos.push(...loop[0].toArray(), ...loop[i].toArray(), ...loop[i + 1].toArray());
  }
  const core = new THREE.BufferGeometry();
  core.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  core.computeVertexNormals();
  return {
    faces: loops.map(polyFace),
    edges: [...keys].map((k) => k.split('-').map((i) => verts[+i])),
    verts, core, curved: [], rims: [], rings: [],
    bottom: Math.min(...verts.map((p) => p.y)),
  };
}

function box(w, h, d) {
  const a = w / 2, b = h / 2, c = d / 2;
  return polyhedron(
    [v3(-a, -b, -c), v3(a, -b, -c), v3(a, b, -c), v3(-a, b, -c), v3(-a, -b, c), v3(a, -b, c), v3(a, b, c), v3(-a, b, c)],
    [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]],
  );
}

// ---- تعريف المجسمات (وحدة القياس = عرض الصورة المطبوعة) ----
const SOLIDS = {
  // البيت: مكعب ← 6 أوجه، 12 حرفًا، 8 رؤوس
  cube: () => box(0.3, 0.3, 0.3),
  // العمارة: متوازي مستطيلات ← 6 أوجه، 12 حرفًا، 8 رؤوس
  cuboid: () => box(0.26, 0.44, 0.16),
  // الهرم (قاعدة مربعة) ← 5 أوجه، 8 أحرف، 5 رؤوس
  pyramid() {
    const b = 0.18, h = 0.17;
    return polyhedron(
      [v3(-b, -h, -b), v3(b, -h, -b), v3(b, -h, b), v3(-b, -h, b), v3(0, h, 0)],
      [[0, 1, 2, 3], [3, 2, 4], [2, 1, 4], [1, 0, 4], [0, 3, 4]],
    );
  },
  // البرج: أسطوانة ← وجهان، بلا أحرف ولا رؤوس (السطح الملتف ليس وجهًا، والحافة المنحنية ليست حرفًا)
  cylinder() {
    const r = 0.14, h = 0.42;
    return {
      faces: [disc(r, Y, h / 2), disc(r, Y.clone().negate(), -h / 2)],
      edges: [], verts: [],
      curved: [new THREE.CylinderGeometry(r, r, h, 56, 1, true)],
      rims: [{ y: h / 2, r }, { y: -h / 2, r }],
      rings: [0.1, 0, -0.1].map((y) => ({ y, r })),
      core: new THREE.CylinderGeometry(r, r, h, 56), bottom: -h / 2,
    };
  },
  // كشك الآيس كريم: مخروط ← وجه واحد، بلا أحرف، ورأس واحد (القمة، كما يعدّها الكتاب)
  cone() {
    const r = 0.17, h = 0.36;
    return {
      faces: [disc(r, Y.clone().negate(), -h / 2)],
      edges: [], verts: [v3(0, h / 2, 0)],
      curved: [new THREE.ConeGeometry(r, h, 56, 1, true)],
      rims: [{ y: -h / 2, r }],
      rings: [-0.1, 0.02].map((y) => ({ y, r: (r * (h / 2 - y)) / h })),
      core: new THREE.ConeGeometry(r, h, 56), bottom: -h / 2,
    };
  },
  // خزان الماء: كرة ← لا أوجه ولا أحرف ولا رؤوس
  sphere() {
    const r = 0.2;
    return {
      faces: [], edges: [], verts: [],
      curved: [new THREE.SphereGeometry(r, 48, 32)],
      rims: [],
      rings: [0.1, 0, -0.1].map((y) => ({ y, r: Math.sqrt(r * r - y * y) })),
      core: new THREE.SphereGeometry(r, 32, 24), bottom: -r,
    };
  },
};

const glowTextures = {};
function glowTexture(rgb) {
  if (glowTextures[rgb]) return glowTextures[rgb];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, `rgba(${rgb},0.9)`);
  grad.addColorStop(0.45, `rgba(${rgb},0.28)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return (glowTextures[rgb] = new THREE.CanvasTexture(c));
}
const glowSprite = (rgb, size, opacity) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(rgb), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity,
  }));
  s.scale.setScalar(size);
  return s;
};

export class Building {
  /** mode: 'dark' مطفأ | 'plain' بلونه | 'lit' مضيء بنوافذ */
  constructor(key, { mode = 'plain', color } = {}) {
    this.key = key;
    this.def = BUILDINGS[key];
    this.color = color ?? this.def.color;
    this.mode = mode;
    this.group = new THREE.Group();
    this.els = { faces: [], edges: [], vertices: [] };
    this.curved = [];
    this.rims = [];
    this.rimLines = [];
    this.decor = [];
    const solid = SOLIDS[this.def.solid]();
    this.bottom = solid.bottom;

    solid.core.computeBoundingSphere();
    const bs = solid.core.boundingSphere;
    this.radius = bs.center.length() + bs.radius;

    // الجسم المصمت: يحجب العناصر الخلفية عن اللمس، فلا يُعدّ إلا ما يراه التلميذ
    this.core = new THREE.Mesh(solid.core, new THREE.MeshStandardMaterial({ color: CORE, roughness: 0.9 }));
    this.core.scale.setScalar(0.985);
    this.core.userData = { building: this, kind: 'body' };
    this.group.add(this.core);

    solid.faces.forEach((f) => {
      const mesh = new THREE.Mesh(f.geo, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }));
      mesh.position.copy(f.pos);
      mesh.quaternion.copy(f.quat);
      const el = { kind: 'faces', mesh, proxy: mesh, lit: false, bottom: f.normal.y < -0.9, home: f.pos.clone(), normal: f.normal.clone() };
      mesh.userData = { building: this, el };
      this.group.add(mesh);
      this.els.faces.push(el);
      this.addWindows(mesh, f);
    });

    solid.curved.forEach((geo) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }));
      mesh.userData = { building: this, kind: 'curved' };
      this.group.add(mesh);
      this.curved.push(mesh);
    });

    solid.edges.forEach(([a, b]) => {
      const length = a.distanceTo(b);
      const place = (m) => {
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
        this.group.add(m);
        return m;
      };
      const mesh = place(new THREE.Mesh(
        new THREE.CylinderGeometry(EDGE_R, EDGE_R, length, 8),
        new THREE.MeshBasicMaterial({ color: LINE_DARK, transparent: true }),
      ));
      const proxy = place(new THREE.Mesh(new THREE.CylinderGeometry(EDGE_PICK, EDGE_PICK, length, 8)));
      proxy.visible = false;
      const el = { kind: 'edges', mesh, proxy, lit: false, length };
      proxy.userData = { building: this, el };
      this.els.edges.push(el);
    });

    solid.verts.forEach((p) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(VERTEX_R, 20, 14),
        new THREE.MeshBasicMaterial({ color: ELEMENTS.vertices.color }),
      );
      mesh.position.copy(p);
      mesh.visible = false;
      mesh.add(glowSprite('255,90,90', 0.16, 0.8));
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(VERTEX_PICK, 12, 8));
      proxy.position.copy(p);
      proxy.visible = false;
      const el = { kind: 'vertices', mesh, proxy, lit: false };
      proxy.userData = { building: this, el };
      this.group.add(mesh, proxy);
      this.els.vertices.push(el);
    });

    // الحافة المنحنية: تُرسم كخط، ولها مساحة لمس حتى يردّ شكلون «ليست حرفًا»
    solid.rims.forEach(({ y, r }) => {
      const line = new THREE.Mesh(
        new THREE.TorusGeometry(r, EDGE_R, 6, 72),
        new THREE.MeshBasicMaterial({ color: LINE_DARK, transparent: true }),
      );
      const proxy = new THREE.Mesh(new THREE.TorusGeometry(r, EDGE_PICK, 8, 48));
      for (const m of [line, proxy]) { m.rotation.x = Math.PI / 2; m.position.y = y; this.group.add(m); }
      proxy.visible = false;
      proxy.userData = { building: this, kind: 'rim' };
      this.rimLines.push(line);
      this.rims.push(proxy);
    });

    // حلقات مضيئة للمجسمات المنحنية في النسخة المضيئة
    solid.rings.forEach(({ y, r }) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.007, 8, 48), new THREE.MeshBasicMaterial({ color: WINDOW }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.group.add(ring);
      this.decor.push(ring);
    });

    this.glow = glowSprite('255,226,130', this.radius * 3.6, 0.55);
    this.group.add(this.glow);

    // بركة ضوء على الأرض تحت المبنى المضيء: نور نوافذه يقع على السجادة (زينة، لا تُلمس ولا تُعدّ)
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: glowTexture('255,255,255'), color: new THREE.Color(this.color).lerp(new THREE.Color(WINDOW), 0.5),
      transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = this.bottom + 0.006;
    this.pool.scale.setScalar(this.radius * 4.6);
    this.group.add(this.pool);

    const a = ANSWERS[key];
    const t = this.totals;
    if (a && (a[0] !== t.faces || a[1] !== t.edges || a[2] !== t.vertices)) {
      console.error(`مفتاح الإجابة لا يطابق المجسم: ${key}`, a, t);
    }
    this.setMode(mode);
  }

  /** نوافذ تظهر فقط في النسخة المضيئة، حتى لا تشتت أثناء العدّ. */
  addWindows(mesh, f) {
    if (Math.abs(f.normal.y) > 0.9 || f.shape === 'circle') return;
    const mat = new THREE.MeshBasicMaterial({ color: WINDOW });
    const add = (m, x, y) => { m.position.set(x, y, 0.003); mesh.add(m); this.decor.push(m); };
    if (f.shape === 'triangle') {
      const door = new THREE.Mesh(f.geo, mat);
      door.scale.setScalar(0.3);
      add(door, 0, -0.2 * f.h);
      return;
    }
    const cols = f.w > 0.2 ? 2 : 1;
    const rows = f.h > 0.35 ? 3 : 2;
    const cw = f.w / cols, ch = f.h / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        add(new THREE.Mesh(polyGeo([[-cw * 0.21, -ch * 0.21], [cw * 0.21, -ch * 0.21], [cw * 0.21, ch * 0.21], [-cw * 0.21, ch * 0.21]]), mat),
          -f.w / 2 + cw * (c + 0.5), -f.h / 2 + ch * (r + 0.5));
      }
    }
  }

  get totals() {
    return { faces: this.els.faces.length, edges: this.els.edges.length, vertices: this.els.vertices.length };
  }
  counts() {
    const n = (k) => this.els[k].filter((e) => e.lit).length;
    return { faces: n('faces'), edges: n('edges'), vertices: n('vertices') };
  }
  missing(kind) { return this.els[kind].filter((e) => !e.lit); }
  complete() { return ['faces', 'edges', 'vertices'].every((k) => this.missing(k).length === 0); }

  /** ما يُلمس الآن. بلا عدسة: جسم المبنى. بعدسة: عناصرها + الجسم كحاجب لما خلفه. */
  pickablesFor(lens) {
    if (lens === 'edges') return [...this.els.edges.map((e) => e.proxy), ...this.rims, this.core];
    if (lens === 'vertices') return [...this.els.vertices.map((e) => e.proxy), this.core];
    return [...this.els.faces.map((e) => e.mesh), ...this.curved, this.core];
  }

  baseColor() { return this.mode === 'dark' ? DARK : this.color; }

  paint(el) {
    const lit = this.mode === 'lit';
    if (el.kind === 'faces') {
      const m = el.mesh.material;
      m.color.setHex(el.lit ? ELEMENTS.faces.color : this.baseColor());
      m.emissive.setHex(el.lit ? ELEMENTS.faces.color : (lit ? this.color : 0x000000));
      m.emissiveIntensity = el.lit ? 0.6 : (lit ? 0.35 : 0);
      for (const child of el.mesh.children) child.visible = lit && !el.lit;
    } else if (el.kind === 'edges') {
      el.mesh.material.color.setHex(el.lit ? ELEMENTS.edges.color : (this.mode === 'dark' ? LINE_DARK : 0xffffff));
      el.mesh.material.opacity = el.lit ? 1 : (this.mode === 'dark' ? 0.9 : 0.6);
      el.mesh.scale.set(el.lit ? 3 : 1, 1, el.lit ? 3 : 1);
    } else {
      el.mesh.visible = el.lit;
    }
    // الحرف والرأس المضاءان يتوهجان توهجًا حقيقيًّا (زينة فقط: ما لم يُعدّ لا يتوهج).
    // الوجه المضاء لا: مساحته كبيرة فيطغى توهجه على أحرف المبنى ورؤوسه.
    if (el.lit && el.kind !== 'faces') el.mesh.layers.enable(FX_LAYER); else el.mesh.layers.disable(FX_LAYER);
  }

  setMode(mode) {
    this.mode = mode;
    const lit = mode === 'lit';
    for (const k of ['faces', 'edges', 'vertices']) this.els[k].forEach((el) => this.paint(el));
    for (const c of this.curved) {
      c.material.color.setHex(this.baseColor());
      c.material.emissive.setHex(lit ? this.color : 0x000000);
      c.material.emissiveIntensity = lit ? 0.35 : 0;
    }
    for (const line of this.rimLines) {
      line.material.color.setHex(mode === 'dark' ? LINE_DARK : 0xffffff);
      line.material.opacity = mode === 'dark' ? 0.9 : 0.6;
    }
    for (const d of this.decor) if (d.parent === this.group) d.visible = lit;
    for (const d of this.decor) { if (lit) d.layers.enable(FX_LAYER); else d.layers.disable(FX_LAYER); }   // النوافذ والحلقات تتوهج حين تعود الأنوار
    this.glow.visible = lit;
    this.pool.visible = lit;
  }

  /** يضيء عنصرًا ويعدّه. يرجع false إن كان مضيئًا من قبل (لا يُعدّ مرتين). */
  light(el) {
    if (el.lit) return false;
    el.lit = true;
    this.paint(el);
    this.bump(el);
    return true;
  }

  /** نبضة قصيرة تلفت النظر إلى عنصر. */
  bump(el) {
    if (el.kind === 'faces') {
      const m = el.mesh.material;
      tween({ dur: 0.5, update: (k) => { if (el.lit) m.emissiveIntensity = 0.6 + Math.sin(k * Math.PI) * 0.6; } });
    } else if (el.kind === 'edges') {
      tween({ dur: 0.45, update: (k) => { const s = el.lit ? 3 + Math.sin(k * Math.PI) * 2.5 : 1; el.mesh.scale.set(s, 1, s); } });
    } else {
      tween({ dur: 0.45, ease: ease.outBack, update: (k) => el.mesh.scale.setScalar(0.2 + 0.8 * k) });
    }
  }

  clearLights() {
    for (const k of ['faces', 'edges', 'vertices']) this.els[k].forEach((el) => { el.lit = false; el.swipe = null; this.paint(el); });
  }

  // ---- عرض «البناء» (زينة قبل بدء العدّ، لا يغيّر الأعداد) ----

  /**
   * المبنى يُبنى أمام التلاميذ من عناصره بألوان العدسات: الرؤوس (أحمر)، ثم الأحرف (أزرق)، ثم الأوجه (أصفر)، ثم يضيء.
   * السطح المنحني يظهر بلون المبنى لا بلون الأوجه، والحافة المنحنية لا تُرسم حرفًا (كما في الدرس).
   * عند الإضاءة يُمسح كل شيء: لا يبقى أي عنصر معدودًا. onStep(kind) عند ظهور كل عنصر، و onStep('lit') لحظة الإضاءة.
   */
  build({ dur = 1.25, onStep = null } = {}) {
    const byHeight = (list, y) => list.map((el) => ({ el, y: y(el) })).sort((a, b) => a.y - b.y).map((x) => x.el);
    const verts = byHeight(this.els.vertices, (el) => el.mesh.position.y);
    const edges = byHeight(this.els.edges, (el) => el.mesh.position.y);
    const faces = byHeight(this.els.faces, (el) => el.home.y);
    const curvedOnly = !verts.length && !edges.length;
    const win = { vertices: [0, 0.3], edges: [0.2, 0.62], faces: curvedOnly ? [0.05, 0.8] : [0.55, 0.88] };
    const FLIP = 0.9;

    this.clearLights();
    this.setMode('lit');
    for (const o of [this.core, this.glow, this.pool, ...this.decor, ...this.rimLines, ...this.curved]) o.visible = false;
    for (const el of faces) { for (const c of el.mesh.children) c.visible = false; el.mesh.scale.setScalar(0.001); }
    for (const el of edges) el.mesh.visible = false;

    const seen = new Set();
    const show = (el) => {
      if (seen.has(el)) return;
      seen.add(el);
      el.lit = true;                       // بلون عدسته، مؤقتًا: يُمسح عند الإضاءة
      this.paint(el);
      el.mesh.visible = true;
      onStep?.(el.kind);
    };
    // نصيب العنصر رقم i من نافذة نوعه: يبدأ بعد من قبله بقليل، فتظهر العناصر واحدًا واحدًا
    const part = (k, [a, b], i, n) => Math.min(1, Math.max(0, (k - (a + (b - a) * 0.6 * (i / Math.max(1, n)))) / ((b - a) * 0.4)));
    let flipped = false;
    return tween({
      dur, ease: ease.linear,
      update: (k) => {
        if (flipped) return;
        if (k >= FLIP) {
          flipped = true;
          for (const el of faces) el.mesh.scale.setScalar(1);
          for (const el of edges) el.mesh.visible = true;
          for (const m of this.curved) { m.visible = true; m.scale.y = 1; }
          for (const o of [this.core, ...this.rimLines]) o.visible = true;
          this.clearLights();
          this.setMode('lit');
          onStep?.('lit');
          return;
        }
        verts.forEach((el, i) => { const p = part(k, win.vertices, i, verts.length); if (p > 0) { show(el); el.mesh.scale.setScalar(0.2 + 0.8 * ease.outBack(p)); } });
        edges.forEach((el, i) => { const p = part(k, win.edges, i, edges.length); if (p > 0) { show(el); el.mesh.scale.set(3, Math.max(0.001, ease.outCubic(p)), 3); } });
        faces.forEach((el, i) => { const p = part(k, win.faces, i, faces.length); if (p > 0) { show(el); el.mesh.scale.setScalar(Math.max(0.001, ease.outBack(p))); } });
        const c = Math.min(1, Math.max(0, (k - win.faces[0]) / (win.faces[1] - win.faces[0])));
        if (c > 0) for (const m of this.curved) { m.visible = true; m.scale.y = Math.max(0.001, ease.outCubic(c)); }
      },
    });
  }

  // ---- عرض «عودة النور» (زينة بعد اكتمال العدّ، لا يغيّر الأعداد) ----

  /** تفكيك: كل وجه يبتعد عن الهيكل على امتداد عموده (k من 0 إلى 1)، فتُرى الأوجه منفصلة عن الأحرف والرؤوس. */
  explode(k) {
    for (const el of this.els.faces) el.mesh.position.copy(el.home).addScaledVector(el.normal, k * this.radius * 0.5);
  }

  /** يلوَّن المبنى ثم تضيء نوافذه واحدة واحدة من الأعلى إلى الأسفل. onStep(i) عند كل نافذة. يرجع وعدًا. */
  lightUp(onStep, dur = 0.9) {
    this.clearLights();
    this.setMode('lit');
    const v = new THREE.Vector3();
    const items = this.decor.map((d) => ({ d, y: d.getWorldPosition(v).y })).sort((a, b) => b.y - a.y).map((x) => x.d);
    for (const d of items) d.visible = false;
    let shown = 0;
    return tween({
      dur, ease: ease.linear,
      update: (k) => {
        const n = k >= 1 ? items.length : Math.floor(k * items.length);
        while (shown < n) { items[shown].visible = true; onStep?.(shown); shown++; }
      },
    });
  }

  /**
   * انطفاء الأنوار: ينطفئ، يومض مرة واحدة، ثم ظلام. يرجع وعدًا.
   * ومضة واحدة فقط عن قصد: الوميض السريع المتكرر لا يناسب شاشة يشاهدها صف من الأطفال.
   */
  blackout() {
    return tween({
      dur: 0.6, ease: ease.linear,
      update: (k) => {
        const want = k > 0.38 && k < 0.62 ? 'lit' : 'dark';
        if (this.mode !== want) this.setMode(want);
      },
    });
  }

  /** اهتزاز: «هذا لا يُعدّ». */
  wobble() {
    tween({ dur: 0.45, ease: ease.linear, update: (k) => { this.group.position.x = Math.sin(k * 22) * 0.022 * (1 - k); } });
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !o.isSprite) o.material.dispose();
    });
    this.group.removeFromParent();
  }
}
