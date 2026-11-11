// المؤثرات البصرية: توهج حقيقي انتقائي (bloom) وشرارات وحلقات ضوء. بلا مكتبات إضافية.
// «انتقائي»: يتوهج فقط ما وُسم بطبقة FX_LAYER (العنصر المضاء، نوافذ المبنى المضيء، البوابة، الشرارات)،
// فتبقى بقية المشهد وصورة الكاميرا كما هي. الأجسام غير الموسومة تُرسم سوداء في تمريرة التوهج لتحجب ما خلفها،
// فلا يظهر توهج عنصر خلفي من وراء المبنى («لا يُعدّ إلا ما يُرى»).
// التوهج يُجمع فوق اللوحة دون تغيير شفافيتها، فيعمل فوق صورة الكاميرا في وضع AR وفوق خلفية الصفحة في وضع 3D.
// زينة فقط: لا يغيّر منطق العدّ ولا يُستعمل في فصل التقييم للدلالة على صواب أو خطأ.
import * as THREE from 'three';
import { FX_LAYER, ELEMENTS } from './config.js';
import { wait } from './tween.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const BLUR = `uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec4 c = texture2D(tMap, vUv) * 0.227027;
  c += (texture2D(tMap, vUv + uDir * 1.3846) + texture2D(tMap, vUv - uDir * 1.3846)) * 0.316216;
  c += (texture2D(tMap, vUv + uDir * 3.2308) + texture2D(tMap, vUv - uDir * 3.2308)) * 0.070270;
  gl_FragColor = c;
}`;
const MIX = `uniform sampler2D tNear; uniform sampler2D tFar; uniform float uStrength; varying vec2 vUv;
void main(){
  vec3 g = texture2D(tNear, vUv).rgb * 0.75 + texture2D(tFar, vUv).rgb;
  gl_FragColor = vec4(g * uStrength, 1.0);
  #include <colorspace_fragment>
}`;

let sparkTexture = null;
function sparkMap() {
  if (sparkTexture) return sparkTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return (sparkTexture = new THREE.CanvasTexture(c));
}

export const SPARK_COLORS = [ELEMENTS.faces.color, ELEMENTS.edges.color, ELEMENTS.vertices.color, 0xffffff, 0x7fe3ff];

/** stage: المسرح (renderer, scene, camera, world). */
export function createFx(stage) {
  const { renderer, scene, camera, world } = stage;
  const size = new THREE.Vector2();
  const oldColor = new THREE.Color();
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const pass = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
  const blur = pass(BLUR, { tMap: { value: null }, uDir: { value: new THREE.Vector2() } });
  const mix = pass(MIX, { tNear: { value: null }, tFar: { value: null }, uStrength: { value: 1 } }, {
    transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blur);
  quad.frustumCulled = false;
  quadScene.add(quad);

  let rt = null;                       // {glow, a1, a2, b1, b2}
  function targets(w, h) {
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    if (rt && rt.w === w && rt.h === h) return;
    if (rt) for (const k of ['glow', 'a1', 'a2', 'b1', 'b2']) rt[k].dispose();
    const make = (x, y, depth) => new THREE.WebGLRenderTarget(x, y, { depthBuffer: depth });
    rt = { w, h, glow: make(hw, hh, true), a1: make(hw, hh, false), a2: make(hw, hh, false), b1: make(qw, qh, false), b2: make(qw, qh, false) };
  }
  function run(material, target) { quad.material = material; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }
  function blurInto(src, tmp, dst, spread) {
    blur.uniforms.tMap.value = src.texture; blur.uniforms.uDir.value.set(spread / tmp.width, 0); run(blur, tmp);
    blur.uniforms.tMap.value = tmp.texture; blur.uniforms.uDir.value.set(0, spread / dst.height); run(blur, dst);
  }

  // تمريرة التوهج: الموسوم بخامته، وغيره أسود حاجب (أو مخفي إن كان شفافًا)
  const swapped = [], hidden = [];
  function darken() {
    scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isSprite || o.isLine || o.isPoints) || o.layers.isEnabled(FX_LAYER)) return;
      const m = o.material;
      const seeThrough = !o.isMesh || Array.isArray(m) ? !o.isMesh : (m.transparent || m.depthWrite === false || m.visible === false);
      if (seeThrough) { o.visible = false; hidden.push(o); } else { swapped.push(o, m); o.material = black; }
    });
  }
  function undo() {
    for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
    for (const o of hidden) o.visible = true;
    swapped.length = 0; hidden.length = 0;
  }

  const sparks = [], rings = [], orbs = [], beams = [], flashes = [], swarms = [];
  let kick = 0, slow = 0, last = 0;
  let beamTexture = null;
  function beamMap() {
    if (beamTexture) return beamTexture;
    const c = document.createElement('canvas');
    c.width = 8; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 128);
    return (beamTexture = new THREE.CanvasTexture(c));
  }
  let raysTexture = null;
  function raysMap() {                 // نجمة أشعة: مثلثات رفيعة تخرج من المركز، طويلة وقصيرة بالتناوب
    if (raysTexture) return raysTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.translate(128, 128);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 2) * 0.11, len = i % 2 ? 78 : 124, w = i % 2 ? 0.045 : 0.07;
      const grad = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len);
      g.lineTo(Math.cos(a + w) * len, Math.sin(a + w) * len);
      g.closePath();
      g.fill();
    }
    return (raysTexture = new THREE.CanvasTexture(c));
  }
  const glowSprite = (color, size, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkMap(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(size);
    return s;
  };
  const fx = {
    enabled: true,                     // التوهج الحقيقي. يُطفأ تلقائيًّا على جهاز بطيء، وتبقى الشرارات
    strength: 0.55,
    off: null,

    /** يسم كائنًا (وما تحته) ليتوهج، أو يرفع الوسم. */
    mark(obj, on = true) { obj.traverse((o) => (on ? o.layers.enable(FX_LAYER) : o.layers.disable(FX_LAYER))); return obj; },
    kick(v = 1) { kick = Math.max(kick, v); },

    /**
     * شرارات تنطلق من نقطة (بإحداثيات world).
     * bloom: هل تتوهج توهجًا حقيقيًّا؟ الانفجار الكبير لا: عشرات الشرارات المتراكبة تتحول إلى بقعة بيضاء تغطي الشاشة.
     */
    burst(pos, n = 12, { colors = SPARK_COLORS, speed = 0.55, size = 0.035, life = 0.8, gravity = 0.9, lift = 0.25, bloom = n <= 16 } = {}) {
      for (let i = 0; i < n && sparks.length < 260; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: sparkMap(), color: colors[(Math.random() * colors.length) | 0], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        if (bloom) s.layers.enable(FX_LAYER);
        s.position.copy(pos);
        const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.35 + Math.random()));
        v.y = Math.abs(v.y) + lift * speed;
        const sz = size * (0.6 + Math.random());
        s.scale.setScalar(sz);             // الحجم من أول إطار: الحجم الافتراضي (1 = عرض السجادة) يغطي الشاشة ببقعة بيضاء
        world.add(s);
        sparks.push({ s, v, t: 0, life: life * (0.6 + Math.random() * 0.8), size: sz, gravity });
      }
    },
    /** موضع كائن بإحداثيات world (لوضع شرارات عنده). */
    at(object, lift = 0) { const p = world.worldToLocal(object.getWorldPosition(new THREE.Vector3())); p.y += lift; return p; },
    /** شرارات بلون العدسة عند نقطة اللمس (بإحداثيات المشهد العامة). */
    sparkAt(point, kind) {
      if (!point) return;
      const color = ELEMENTS[kind] ? ELEMENTS[kind].color : 0xffffff;
      fx.burst(world.worldToLocal(point.clone()), 10, { colors: [color, color, 0xffffff], speed: 0.4, size: 0.03, life: 0.6 });
      fx.kick(0.5);
    },
    /** حلقة ضوء تتسع على الأرض. */
    ring(pos, color = 0x7fe3ff, { from = 0.05, to = 0.6, dur = 0.9, width = 0.035 } = {}) {
      const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 64), new THREE.MeshBasicMaterial({
        color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(pos);
      m.layers.enable(FX_LAYER);
      world.add(m);
      rings.push({ m, t: 0, from, to, dur });
    },
    /** هالة مضيئة تُضاف إلى أي كائن (لا تتوهج توهجًا حقيقيًّا إلا إن وُسمت). */
    glowSprite,
    /** كرة طاقة تطير من نقطة إلى أخرى في قوس وتترك ذيلًا، ثم تنفجر شراراتٍ صغيرة. */
    orb(from, to, color = 0xffffff, { dur = 0.6, size = 0.05, arc = 0.2, onArrive = null } = {}) {
      const s = glowSprite(color, size);
      s.layers.enable(FX_LAYER);
      s.position.copy(from);
      world.add(s);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      mid.y += arc; mid.x += (Math.random() - 0.5) * arc;
      orbs.push({ s, from: from.clone(), mid, to: to.clone(), t: 0, dur, color, onArrive });
    },
    /** طاقة ترتفع من نقطة اللمس (بإحداثيات المشهد العامة) نحو السماء. */
    rise(point, kind) {
      if (!point) return;
      const color = ELEMENTS[kind] ? ELEMENTS[kind].color : 0xffffff;
      const from = world.worldToLocal(point.clone());
      fx.orb(from, from.clone().add(new THREE.Vector3(0, 0.55, 0)), color, { dur: 0.7, size: 0.045, arc: 0.12 });
    },
    /** عمود نور يرتفع من نقطة ثم يخبو. */
    beam(pos, color = 0xffe27a, { height = 1.4, radius = 0.06, dur = 1.1 } = {}) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius, 1, 24, 1, true), new THREE.MeshBasicMaterial({
        map: beamMap(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.layers.enable(FX_LAYER);
      m.position.copy(pos);
      world.add(m);
      beams.push({ m, base: pos.y, t: 0, dur, height });
    },
    /** ومضة ضوء. */
    flash(pos, color = 0xffffff, { size = 1.2, dur = 0.5, opacity = 0.85 } = {}) {
      const s = glowSprite(color, 0.01, opacity);            // هالة مرسومة فقط: لو توهجت توهجًا حقيقيًّا فوقها لابيضّت الشاشة
      s.position.copy(pos);
      world.add(s);
      flashes.push({ s, t: 0, dur, size, opacity, spin: 0 });
    },
    /** أشعة ضوء تنطلق من نقطة وتتسع وهي تدور قليلًا ثم تخبو (لحظة الانفجار ولحظة عودة النور). */
    rays(pos, color = 0xffffff, { size = 1.4, dur = 0.55, opacity = 0.9, spin = 0.7 } = {}) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: raysMap(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(0.01);
      s.material.rotation = Math.random() * 6.28;
      s.position.copy(pos);
      world.add(s);
      flashes.push({ s, t: 0, dur, size, opacity, spin });
    },
    /**
     * يراعات تسبح فوق المدينة: كلما عاد النور إلى مبنًى زاد عددها. set(k): نسبة ما يضيء منها (0 إلى 1).
     * زينة تدل على حياة المدينة، وتُطفأ أثناء فحص مبنًى حتى لا تشتّت العدّ.
     */
    fireflies(count = 34) {
      const group = new THREE.Group();
      world.add(group);
      const colors = [0xffe27a, 0xfff3c4, 0x9fe8ff, 0xffc86b];
      const items = [];
      for (let i = 0; i < count; i++) {
        const s = glowSprite(colors[i % colors.length], 0.02, 0);
        s.layers.enable(FX_LAYER);
        s.visible = false;
        group.add(s);
        items.push({
          s, a: 0, phase: Math.random() * 6.28, speed: 0.4 + Math.random() * 0.7, size: 0.016 + Math.random() * 0.02,
          base: new THREE.Vector3((Math.random() - 0.5) * 1.25, 0.1 + Math.random() * 0.55, (Math.random() - 0.5) * 0.95),
        });
      }
      const swarm = {
        group, items, level: 0, t: 0,
        set(k) { swarm.level = k; },
        dispose() {
          group.removeFromParent();
          for (const it of items) it.s.material.dispose();
          const i = swarms.indexOf(swarm);
          if (i >= 0) swarms.splice(i, 1);
        },
      };
      swarms.push(swarm);
      return swarm;
    },
    /** ألعاب نارية صغيرة فوق نقطة: عدة انفجارات متتابعة. */
    fireworks(center, count = 5, spread = 0.35) {
      for (let i = 0; i < count; i++) {
        // بزمن حلقة الرسم لا بمؤقت المتصفح (يبقى متزامنًا مع العرض)، وأقل من ثلاث ومضات في الثانية (شاشة يشاهدها أطفال)
        wait(0.01 + i * 0.36).then(() => {
          const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread * 2, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * spread));
          fx.burst(p, 26, { speed: 0.5, size: 0.04, life: 1.0, gravity: 0.5, lift: 0.1 });
          fx.rays(p, 0xffffff, { size: 0.45, dur: 0.4, opacity: 0.6 });
          fx.kick(0.35);
        });
      }
    },

    update(dt) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.t += dt;
        const k = p.t / p.life;
        if (k >= 1) { p.s.removeFromParent(); p.s.material.dispose(); sparks.splice(i, 1); continue; }
        p.v.y -= p.gravity * dt;
        p.s.position.addScaledVector(p.v, dt);
        p.s.scale.setScalar(p.size * (1 - k * 0.6));
        p.s.material.opacity = 1 - k * k;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.t += dt;
        const k = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - k, 3);
        r.m.scale.setScalar(r.from + (r.to - r.from) * e);
        r.m.material.opacity = 1 - k;
        if (k >= 1) { r.m.removeFromParent(); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); }
      }
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        o.t += dt;
        const k = Math.min(1, o.t / o.dur), a = 1 - k;
        o.s.position.set(a * a * o.from.x + 2 * a * k * o.mid.x + k * k * o.to.x, a * a * o.from.y + 2 * a * k * o.mid.y + k * k * o.to.y, a * a * o.from.z + 2 * a * k * o.mid.z + k * k * o.to.z);
        if (Math.random() < 0.5) fx.burst(o.s.position, 1, { colors: [o.color, 0xffffff], speed: 0.08, size: 0.02, life: 0.35, gravity: 0.1, lift: 0 });
        if (k >= 1) {
          fx.burst(o.to, 5, { colors: [o.color, 0xffffff], speed: 0.25, size: 0.022, life: 0.4, gravity: 0.2 });
          o.s.removeFromParent(); o.s.material.dispose(); orbs.splice(i, 1);
          o.onArrive?.();
        }
      }
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i];
        b.t += dt;
        const k = Math.min(1, b.t / b.dur), up = 1 - Math.pow(1 - Math.min(1, k * 3), 3);
        b.m.scale.set(1 + k * 0.6, Math.max(0.001, b.height * up), 1 + k * 0.6);
        b.m.position.y = b.base + (b.height * up) / 2;
        b.m.material.opacity = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
        if (k >= 1) { b.m.removeFromParent(); b.m.geometry.dispose(); b.m.material.dispose(); beams.splice(i, 1); }
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.t += dt;
        const k = Math.min(1, f.t / f.dur), e = 1 - Math.pow(1 - k, 3);
        f.s.scale.setScalar(Math.max(0.01, f.size * (f.spin ? 0.25 + 0.75 * e : e)));
        f.s.material.opacity = f.opacity * (1 - k) * (1 - k);
        if (f.spin) f.s.material.rotation += dt * f.spin;
        if (k >= 1) { f.s.removeFromParent(); f.s.material.dispose(); flashes.splice(i, 1); }
      }
      for (const w of swarms) {
        w.t += dt;
        for (let i = 0; i < w.items.length; i++) {
          const it = w.items[i];
          const want = (i + 0.5) / w.items.length < w.level ? 1 : 0;
          it.a += Math.sign(want - it.a) * Math.min(Math.abs(want - it.a), dt * 1.4);
          it.s.visible = it.a > 0.01;
          if (!it.s.visible) continue;
          const a = w.t * it.speed + it.phase;
          it.s.position.set(it.base.x + Math.sin(a) * 0.06, it.base.y + Math.sin(a * 1.3 + 1) * 0.045, it.base.z + Math.cos(a * 0.8) * 0.06);
          it.s.material.opacity = it.a * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(a * 3.1)));
          it.s.scale.setScalar(it.size);
        }
      }
      kick = Math.max(0, kick - dt * 1.6);
      if (fx.enabled) {                // جهاز بطيء؟ نكتفي بالشرارات. نقيس الزمن الحقيقي بين الإطارات:
        const now = performance.now(), real = last ? (now - last) / 1000 : 0;      // أقل من 20 إطارًا في الثانية = بطيء،
        last = now;                                                                  // وأكثر من 0.3 ثانية = الصفحة كانت في الخلفية (لا يُحسب)
        slow = real > 0.05 && real < 0.3 ? slow + real : Math.max(0, slow - real * 0.5);
        if (slow > 3) { fx.enabled = false; fx.off = 'slow device'; }
      }
    },

    /** يرسم المشهد، ثم يجمع فوقه توهج الموسوم. */
    render() {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      if (!fx.enabled) return;
      try {
        renderer.getDrawingBufferSize(size);
        targets(size.x, size.y);
        const auto = renderer.autoClear, alpha = renderer.getClearAlpha();
        renderer.getClearColor(oldColor);
        darken();
        renderer.setRenderTarget(rt.glow);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(scene, camera);
        undo();
        blurInto(rt.glow, rt.a1, rt.a2, 1.0);            // هالة قريبة
        blurInto(rt.a2, rt.b1, rt.b2, 1.6);              // هالة واسعة
        blurInto(rt.b2, rt.b1, rt.b2, 2.4);
        mix.uniforms.tNear.value = rt.a2.texture; mix.uniforms.tFar.value = rt.b2.texture;
        mix.uniforms.uStrength.value = fx.strength + kick;
        renderer.autoClear = false;
        run(mix, null);
        renderer.autoClear = auto;
        renderer.setClearColor(oldColor, alpha);
      } catch (err) {
        undo();
        fx.enabled = false; fx.off = String(err.message || err);
        renderer.setRenderTarget(null);
        console.warn('fx: glow disabled', err);
      }
    },
  };
  return fx;
}
