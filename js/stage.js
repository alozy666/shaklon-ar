// المسرح: يجهّز الرسم إما فوق صورة الكاميرا (AR) أو بدون كاميرا (3D).
// في الحالتين تحصل المشاهد على مجموعة world محورها Y للأعلى ووحدتها = عرض السجادة.
//
// وضع AR لا يعتمد على السجادة المطبوعة:
//  - يظهر المشهد فورًا على «الأرض» أمام الكاميرا، ويبقى في مكانه بحساس الحركة.
//  - إن ظهرت السجادة أمام الكاميرا التصق بها المشهد (تثبيت أدق)، وإن غابت بقي حيث كان.
//  - placeAt() تنقله إلى أي مكان يلمسه المستخدم، وعندها يتوقف عن اتباع السجادة حتى followMat().
import * as THREE from 'three';
import { TARGETS_URL } from './config.js';
import { cameraToEarth } from './gyro.js';

const UNIT = 1000;        // وحدات فضاء الكاميرا لكل «عرض سجادة» عند الوضع اليدوي
const CAM_HEIGHT = 1.3;   // نفترض أن الكاميرا فوق الأرض بهذا القدر من عرض السجادة

function addLights(world) {
  const ambient = new THREE.AmbientLight(0xffffff, 1.25);
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(0.8, 2.0, 1.4);
  const fill = new THREE.DirectionalLight(0xbfd0ff, 0.8);
  fill.position.set(-1.4, 0.9, -0.8);
  world.add(ambient, key, key.target, fill, fill.target);
}

/**
 * طبقة «الليل» خلف المجسمات: تعتّم صورة الكاميرا (AR) أو خلفية الصفحة (3D) دون أن تمسّ المجسمات ولا الأزرار.
 * ترجع setNight(k): k من 0 (نهار) إلى 1 (ظلام تام).
 */
function addNight(container) {
  const el = document.createElement('div');
  el.className = 'night';
  container.appendChild(el);
  return (k) => { el.style.opacity = String(Math.min(1, Math.max(0, k))); };
}

function create3d(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  const setNight = addNight(container);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 60);
  const world = new THREE.Group();
  scene.add(world);
  addLights(world);

  // zoom = 1: إطار يتسع لمبنى مفحوص ومرفوع (2.1 وحدة)، والمبنى فوق منتصف الشاشة حتى لا تغطيه الأزرار السفلية.
  // أصغر من 1: الكاميرا أقرب لعرض السجادة كلها.
  let zoom = 1, zoomGoal = 1;
  function place() {
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const focus = Math.min(1, Math.max(0, (zoom - 0.62) / 0.38));     // 0 = العرض العام، 1 = مبنى مفحوص
    // العرض الأفقي المطلوب 1.9 حتى تظهر السجادة كلها في العرض العام. على شاشة هاتف طولية هذا يُبعد الكاميرا
    // كثيرًا عند فحص مبنى فيظهر صغيرًا، والمبنى المفحوص يكفيه 1.3: نقرّب هناك فقط. اللوحي كما هو.
    const wide = camera.aspect < 0.6 ? 1.9 - 0.6 * focus : 1.9;
    const dist = (Math.max(2.1, wide / camera.aspect) / (2 * half)) * zoom;
    const lookY = 0.1 + 0.2 * focus;
    camera.position.set(0, lookY + dist * 0.34, dist);
    camera.lookAt(0, lookY, 0);
  }
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    place();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    mode: '3d', renderer, scene, camera, world, onMat: false, manual: false, setNight,
    start: async () => {},
    update(dt) {
      if (Math.abs(zoom - zoomGoal) < 0.002) return;
      zoom += (zoomGoal - zoom) * Math.min(1, dt * 4);
      place();
    },
    orbit(dx) { world.rotation.y += dx; },
    zoomTo(z, instant = false) { zoomGoal = z; if (instant) { zoom = z; place(); } },
    placeAt() {}, followMat() {}, resizeBy() {},
  };
}

async function createAr(container, scale) {
  const { MindARThree } = await import('mindar-image-three');
  const mindar = new MindARThree({
    container, imageTargetSrc: TARGETS_URL, maxTrack: 1,
    uiLoading: 'no', uiScanning: 'no', uiError: 'no',
    filterMinCF: 0.0001, filterBeta: 0.001, warmupTolerance: 3, missTolerance: 10,
  });
  const { renderer, scene, camera } = mindar;
  const anchor = mindar.addAnchor(0);          // الصورة الوحيدة: سجادة المدينة
  const setNight = addNight(container);        // فوق فيديو الكاميرا (z-index -2 في MindAR) وتحت لوحة الرسم

  const world = new THREE.Group();
  world.matrixAutoUpdate = false;
  world.visible = false;
  scene.add(world);
  addLights(world);

  // السجادة: Y للأعلى فوق الصورة، مع حجم المشهد المطلوب
  const upFix = new THREE.Matrix4().makeRotationX(Math.PI / 2).scale(new THREE.Vector3(scale, scale, scale));
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();     // الموضع في إطار الكاميرا
  const tp = new THREE.Vector3(), tq = new THREE.Quaternion(), ts = new THREE.Vector3();
  // الموضع نفسه في إطار الأرض (من حساس الحركة): هو ما نحتفظ به عندما لا نرى السجادة
  const pe = new THREE.Vector3(), qe = new THREE.Quaternion();
  const cam = new THREE.Quaternion(), inv = new THREE.Quaternion();
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3();
  let source = null;           // من أين جاء موضع المشهد: 'auto' تلقائي، 'mat' السجادة، 'manual' لمسة المستخدم
  let wasLive = false;         // هل كانت قراءة الحساس حية في الإطار السابق
  let size = 1;

  const stage = {
    mode: 'ar', renderer, scene, camera, world, setNight,
    onMat: false,              // المشهد ملتصق بالسجادة الآن
    manual: false,             // المستخدم وضعه بيده: لا نتبع السجادة
    async start() {
      await mindar.start();
      stage.placeAt(0, -0.35, false);
    },
    stop() { try { mindar.stop(); } catch { /* لم يبدأ */ } },

    /** يضع المشهد على الأرض حيث تشير نقطة الشاشة (إحداثيات من -1 إلى 1). */
    placeAt(x, y, manual = true) {
      const live = cameraToEarth(cam);
      ray.setFromCamera({ x, y }, camera);
      dir.copy(ray.ray.direction).applyQuaternion(cam);
      if (dir.y > -0.2) { dir.y = -0.2; dir.normalize(); }         // لا نرمي المشهد إلى الأفق
      const t = Math.min((CAM_HEIGHT * UNIT) / -dir.y, 5 * UNIT);
      pe.copy(dir).multiplyScalar(t);
      pe.y = -CAM_HEIGHT * UNIT;
      qe.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(-pe.x, -pe.z));   // واجهة المدينة نحو المستخدم
      s.setScalar(UNIT * scale * size);
      source = manual ? 'manual' : 'auto';
      wasLive = live;
      if (manual) { stage.manual = true; stage.onMat = false; }
    },
    followMat() { stage.manual = false; },
    resizeBy(f) {
      size = Math.min(2.2, Math.max(0.45, size * f));
      if (!stage.onMat) s.setScalar(UNIT * scale * size);
    },

    update(dt) {
      const live = cameraToEarth(cam);
      const seen = !stage.manual && anchor.group.visible;
      if (live !== wasLive && source && !seen) {
        // بدأت قراءات الحساس تصل (أو انقطعت): الوضع التلقائي نعيده مستويًا، وغيره نُبقيه حيث يراه المستخدم
        if (source === 'auto') stage.placeAt(0, -0.35, false);
        else { pe.copy(p).applyQuaternion(cam); qe.copy(cam).multiply(q); }
      }
      wasLive = live;
      if (seen) {
        m.multiplyMatrices(anchor.group.matrix, upFix).decompose(tp, tq, ts);
        if (!stage.onMat) { p.copy(tp); q.copy(tq); s.copy(ts); }          // ظهرت السجادة: ننتقل إليها فورًا
        else { const k = 1 - Math.exp(-dt * 18); p.lerp(tp, k); q.slerp(tq, k); s.lerp(ts, k); }
        pe.copy(p).applyQuaternion(cam);
        qe.copy(cam).multiply(q);
        stage.onMat = true;
        source = 'mat';
      } else if (source) {
        stage.onMat = false;
        inv.copy(cam).invert();
        p.copy(pe).applyQuaternion(inv);
        q.copy(inv).multiply(qe);
      }
      if (!source) return;
      world.visible = true;
      world.matrix.compose(p, q, s);
      world.matrixWorldNeedsUpdate = true;
    },
    orbit() {}, zoomTo() {},
  };
  return stage;
}

/** يحاول AR أولًا إن طُلب، وإن تعذّرت الكاميرا يرجع إلى 3D. */
export async function createStage({ mode, container, scale = 1 }) {
  if (mode === 'ar') {
    let stage = null;
    try {
      stage = await createAr(container, scale);
      await stage.start();
      return stage;
    } catch (err) {
      console.warn('AR unavailable, falling back to 3D', err);
      if (stage) stage.stop();
      container.replaceChildren();
    }
  }
  const stage = create3d(container);
  stage.fellBack = mode === 'ar';
  return stage;
}
