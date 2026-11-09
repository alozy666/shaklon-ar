// المسرح: يجهّز الرسم إما فوق بطاقة التتبّع (AR) أو بدون كاميرا (3D).
// في الحالتين تحصل المشاهد على مجموعة world محورها Y للأعلى ووحدتها = عرض البطاقة.
import * as THREE from 'three';
import { TARGETS_URL, AR_SCALE } from './config.js';

function addLights(world) {
  const ambient = new THREE.AmbientLight(0xffffff, 1.25);
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(0.8, 2.0, 1.4);
  const fill = new THREE.DirectionalLight(0xbfd0ff, 0.8);
  fill.position.set(-1.4, 0.9, -0.8);
  world.add(ambient, key, key.target, fill, fill.target);
}

function create3d(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 60);
  const world = new THREE.Group();
  scene.add(world);
  addLights(world);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    // نُبقي عرض 2.2 وارتفاع 2.0 وحدة داخل الإطار مهما كان اتجاه الشاشة،
    // ومكان فحص المبنى (y≈0.62) فوق منتصف الشاشة قليلًا حتى لا تغطيه الأزرار السفلية
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(2.0, 2.2 / camera.aspect) / (2 * half);
    camera.position.set(0, 0.5 + dist * 0.28, dist);
    camera.lookAt(0, 0.5, 0);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    mode: '3d', renderer, scene, camera, world,
    tracked: true, everTracked: true, lostFor: 0,
    start: async () => {},
    update() {},
    orbit(dx) { world.rotation.y += dx; },
  };
}

async function createAr(container, targetIndex) {
  const { MindARThree } = await import('mindar-image-three');
  const mindar = new MindARThree({
    container, imageTargetSrc: TARGETS_URL, maxTrack: 1,
    uiLoading: 'no', uiScanning: 'no', uiError: 'no',
    filterMinCF: 0.0001, filterBeta: 0.001, warmupTolerance: 3, missTolerance: 10,
  });
  const { renderer, scene, camera } = mindar;
  const anchor = mindar.addAnchor(targetIndex);

  // world لا يتبع المرساة مباشرة: نلحقها بنعومة، ونُبقي آخر موضع إذا ضاعت البطاقة لحظة.
  const world = new THREE.Group();
  world.matrixAutoUpdate = false;
  world.visible = false;
  scene.add(world);
  addLights(world);

  // Y للأعلى فوق البطاقة، مع تصغير المشهد قليلًا
  const upFix = new THREE.Matrix4().makeRotationX(Math.PI / 2).scale(new THREE.Vector3(AR_SCALE, AR_SCALE, AR_SCALE));
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const tp = new THREE.Vector3(), tq = new THREE.Quaternion(), ts = new THREE.Vector3();

  const stage = {
    mode: 'ar', renderer, scene, camera, world,
    tracked: false, everTracked: false, lostFor: 0,
    async start() { await mindar.start(); },
    stop() { try { mindar.stop(); } catch { /* لم يبدأ */ } },
    update(dt) {
      stage.tracked = anchor.group.visible;
      if (!stage.tracked) { stage.lostFor += dt; return; }
      stage.lostFor = 0;
      m.multiplyMatrices(anchor.group.matrix, upFix).decompose(tp, tq, ts);
      if (!stage.everTracked) {
        p.copy(tp); q.copy(tq); s.copy(ts);
        stage.everTracked = true;
        world.visible = true;
      } else {
        const k = 1 - Math.exp(-dt * 18);
        p.lerp(tp, k); q.slerp(tq, k); s.lerp(ts, k);
      }
      world.matrix.compose(p, q, s);
      world.matrixWorldNeedsUpdate = true;
    },
    orbit() {},
  };
  return stage;
}

/** يحاول AR أولًا إن طُلب، وإن تعذّرت الكاميرا يرجع إلى 3D. */
export async function createStage({ mode, container, targetIndex }) {
  if (mode === 'ar') {
    let stage = null;
    try {
      stage = await createAr(container, targetIndex);
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
