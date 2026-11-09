// نقطة الإقلاع: شاشة البداية، اختيار المشهد والوضع (AR أو 3D)، وحلقة الرسم.
import * as THREE from 'three';
import { SCENES, LINES } from './config.js';
import { createStage } from './stage.js';
import { createHud } from './hud.js';
import { Pointer } from './input.js';
import { initAudio, unlockAudio, sfx, stopVoice } from './audio.js';
import { tickTweens } from './tween.js';
import { CityScene } from './scenes/city.js';
import { MysteryScene } from './scenes/mystery.js';
import { DistrictScene } from './scenes/district.js';

const SCENE_CLASSES = { city: CityScene, mystery: MysteryScene, district: DistrictScene };
const BACKDROP = { city: '', mystery: 'dusk', district: 'day' };

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const hud = createHud();
const app = { hud, stage: null, scene: null, sceneKey: null };
window.__shaklon = app;        // للاختبار من الكونسول

function showHome() {
  const preset = SCENES[params.get('scene')] ? params.get('scene') : null;
  const list = $('home-scenes');
  const startBtn = $('btn-start');
  let wantAr = params.get('mode') !== '3d';

  if (preset) {
    // جاء من رمز QR لبطاقة محددة: زر واحد كبير
    $('home-title').textContent = SCENES[preset].ar;
    $('home-sub').textContent = SCENES[preset].sub;
    document.documentElement.style.setProperty('--tint', SCENES[preset].tint);
    startBtn.hidden = false;
    startBtn.onclick = () => start(preset, wantAr ? 'ar' : '3d');
    $('btn-3d').onclick = () => start(preset, '3d');
    $('btn-3d').hidden = !wantAr;
  } else {
    list.replaceChildren(...Object.entries(SCENES).map(([key, s], i) => {
      const b = document.createElement('button');
      b.className = 'scene-btn';
      b.style.setProperty('--c', s.tint);
      b.innerHTML = `<span class="dot">${i + 1}</span><span><b>${s.ar}</b><small>${s.sub}</small></span>`;
      b.onclick = () => start(key, wantAr ? 'ar' : '3d');
      return b;
    }));
    const toggle = $('btn-3d');
    const paint = () => (toggle.textContent = wantAr ? 'افتح بدون كاميرا' : 'افتح بالكاميرا (واقع معزز)');
    toggle.onclick = () => { wantAr = !wantAr; paint(); };
    paint();
  }
}

async function start(sceneKey, mode) {
  unlockAudio();
  sfx.tick();
  $('home').hidden = true;
  hud.loading(true);
  document.documentElement.style.setProperty('--tint', SCENES[sceneKey].tint);

  const url = new URL(location.href);
  url.searchParams.set('scene', sceneKey);
  history.replaceState(null, '', url);

  if (mode === 'ar' && params.has('fakecam')) {
    const { installFakeCamera } = await import('./dev-fakecam.js');
    await installFakeCamera(sceneKey);
  }

  const container = $('stage');
  const stage = await createStage({ mode, container, targetIndex: SCENES[sceneKey].target });
  app.stage = stage;
  app.sceneKey = sceneKey;
  container.classList.toggle('mode-3d', stage.mode === '3d');
  if (stage.mode === '3d' && BACKDROP[sceneKey]) container.classList.add(BACKDROP[sceneKey]);

  await document.fonts.load('800 60px "Baloo Bhaijaan 2"', '12345').catch(() => {});
  const scene = new SCENE_CLASSES[sceneKey](app);
  app.scene = scene;

  new Pointer(container, stage.camera, {
    pickables: () => scene.pickables(),
    tap: (hit) => { unlockAudio(); scene.tap(hit); },
    drag: (dx, dy, hit) => scene.drag(dx, dy, hit),
  });

  hud.button('home', true, () => { stopVoice(); location.href = location.pathname; });
  hud.button('reset', true, () => { stopVoice(); location.reload(); });
  hud.loading(false);
  hud.show(true);
  if (stage.fellBack) hud.toast(LINES.no_camera, 3.5);

  let begun = false;
  const clock = new THREE.Clock();
  stage.renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    stage.update(dt);
    if (stage.everTracked && !begun) { begun = true; hud.scan(false); scene.begin(); }
    if (!stage.everTracked) hud.scan(true, `${LINES.scan} «${SCENES[sceneKey].ar}»`);
    else hud.hint(stage.mode === 'ar' && stage.lostFor > 1.2 ? LINES.lost : null);
    tickTweens(dt);
    scene.update(dt);
    stage.renderer.render(stage.scene, stage.camera);
  });
}

initAudio({ tts: params.get('tts') !== '0' });
showHome();

// رابط مباشر للاختبار: ?scene=city&mode=3d&autostart=1
if (params.has('autostart') && SCENES[params.get('scene')]) {
  start(params.get('scene'), params.get('mode') === '3d' ? '3d' : 'ar');
}
