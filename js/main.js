// نقطة الإقلاع: شاشة البداية، اختيار المجموعة، تشغيل المسرح (AR أو 3D)، والانتقال بين فصول المغامرة.
import * as THREE from 'three';
import { SCENES, LINES } from './config.js';
import { createStage } from './stage.js';
import { createHud, esc } from './hud.js';
import { Pointer } from './input.js';
import { initAudio, unlockAudio, sfx, stopVoice } from './audio.js';
import { tickTweens } from './tween.js';
import { session } from './session.js';
import { requestGyro } from './gyro.js';
import { CityScene } from './scenes/city.js';
import { ExamScene } from './scenes/exam.js';

const SCENE_CLASSES = { city: CityScene, exam: ExamScene };
const GROUP_COLORS = ['#4f6fe3', '#ef8a2b', '#8e52c7', '#17a589', '#db3a78', '#2f8cff', '#b88400', '#5b6590'];

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
session.init();
const hud = createHud();
const app = { hud, session, stage: null, scene: null, sceneKey: null, placing: false, go: null };
window.__shaklon = app;        // للاختبار من الكونسول

function paintHomeGroup() {
  $('home-group').textContent = session.hasClass
    ? (session.group === null ? 'لم تُختر المجموعة بعد.' : `${session.groupLabel()}: ${session.members().join('، ')}.`)
    : '';
  const change = $('home-change');
  change.hidden = !session.hasClass || session.group === null;
  change.onclick = (e) => { e.preventDefault(); session.clearGroup(); paintHomeGroup(); };
}

function showHome() {
  const preset = SCENES[params.get('scene')] ? params.get('scene') : null;
  const startBtn = $('btn-start');
  const toggle = $('btn-3d');
  let wantAr = params.get('mode') !== '3d';
  paintHomeGroup();

  if (preset) {
    // جاء من رمز QR محدد: زر واحد كبير
    $('home-title').textContent = SCENES[preset].ar;
    $('home-sub').textContent = SCENES[preset].sub;
    document.documentElement.style.setProperty('--tint', SCENES[preset].tint);
    startBtn.hidden = false;
    startBtn.onclick = () => start(preset, wantAr ? 'ar' : '3d');
    toggle.onclick = () => start(preset, '3d');
    toggle.hidden = !wantAr || preset === 'lens';
  } else {
    $('home-scenes').replaceChildren(...Object.entries(SCENES).map(([key, s], i) => {
      const b = document.createElement('button');
      b.className = 'scene-btn';
      b.style.setProperty('--c', s.tint);
      b.innerHTML = `<span class="dot">${i + 1}</span><span><b>${s.ar}</b><small>${s.sub}</small></span>`;
      b.onclick = () => start(key, wantAr ? 'ar' : '3d');
      return b;
    }));
    const paint = () => (toggle.textContent = wantAr ? 'افتح بدون كاميرا' : 'افتح بالكاميرا (واقع معزز)');
    toggle.onclick = () => { wantAr = !wantAr; paint(); };
    paint();
  }
}

/** في بداية الحصة تختار كل مجموعة رقمها (إن وزّع المعلم المجموعات). */
function pickGroup() {
  return new Promise((resolve) => {
    const ask = () => {
      const grid = document.createElement('div');
      grid.className = 'grid-btns';
      session.klass.groups.forEach((_, i) => {
        const b = document.createElement('button');
        b.className = 'num';
        b.textContent = String(i + 1);
        b.style.setProperty('--c', GROUP_COLORS[i % GROUP_COLORS.length]);
        b.onclick = () => { sfx.tick(); confirmGroup(i); };
        grid.append(b);
      });
      hud.dialog({ title: 'ما رقم مجموعتكم؟', lead: 'اختاروا رقم مجموعتكم لتبدأ المغامرة', body: grid });
    };
    const confirmGroup = (i) => {
      const names = session.klass.groups[i].map((n) => `<li>${esc(n)}</li>`).join('');
      hud.dialog({
        title: `المجموعة ${i + 1}`, lead: 'هل هؤلاء أعضاء مجموعتكم؟', body: `<ul class="names">${names}</ul>`,
        actions: [
          { label: 'نعم، هذه مجموعتنا', onClick: () => { session.setGroup(i); hud.dialog(null); resolve(); } },
          { label: 'لا، رقم آخر', ghost: true, onClick: ask },
        ],
      });
    };
    ask();
  });
}

async function start(sceneKey, mode) {
  const gyro = mode === 'ar' && sceneKey !== 'lens' ? requestGyro() : null;      // يجب أن يُطلب داخل الضغطة نفسها
  unlockAudio();
  sfx.tick();
  $('home').hidden = true;
  const info = SCENES[sceneKey];
  document.documentElement.style.setProperty('--tint', info.tint);

  const url = new URL(location.href);
  url.searchParams.set('scene', sceneKey);
  history.replaceState(null, '', url);

  if (sceneKey !== 'lens' && session.needsGroup) await pickGroup();
  hud.loading(true);
  await gyro;

  const container = $('stage');
  app.sceneKey = sceneKey;
  hud.button('home', true, () => { stopVoice(); location.href = location.pathname; });
  hud.button('reset', true, () => { stopVoice(); location.reload(); });

  if (params.has('fakecam')) {
    const { installFakeCamera } = await import('./dev-fakecam.js');
    await installFakeCamera('mat');
  }

  // عدسة المحقق: كاميرا عادية بلا مجسمات
  if (sceneKey === 'lens') {
    const { startLens } = await import('./scenes/lens.js');
    hud.loading(false);
    hud.show(true);
    await startLens(app, container);
    return;
  }

  const stage = await createStage({ mode, container });
  app.stage = stage;
  container.classList.toggle('mode-3d', stage.mode === '3d');
  await document.fonts.load('800 60px "Baloo Bhaijaan 2"', '12345').catch(() => {});

  // الانتقال بين فصول المغامرة على المسرح نفسه (بلا إعادة تحميل ولا طلب الكاميرا من جديد)
  app.go = (key) => {
    stopVoice();
    app.scene?.dispose();
    hud.reset();
    app.placing = false;
    app.sceneKey = key;
    document.documentElement.style.setProperty('--tint', SCENES[key].tint);
    const u = new URL(location.href);
    u.searchParams.set('scene', key);
    history.replaceState(null, '', u);
    app.scene = new SCENE_CLASSES[key](app);
    paintPlacing();
    app.scene.begin();
  };

  // «انقل المدينة»: لمسة على الأرض تضع المشهد هناك، دون حاجة إلى السجادة المطبوعة
  const paintPlacing = () => {
    const ar = stage.mode === 'ar';
    hud.button('move', ar && !app.placing, () => { app.placing = true; paintPlacing(); });
    hud.button('mat', ar && app.placing && stage.manual, () => { stage.followMat(); app.placing = false; paintPlacing(); });
    hud.button('bigger', ar && app.placing, () => stage.resizeBy(1.2));
    hud.button('smaller', ar && app.placing, () => stage.resizeBy(1 / 1.2));
    hud.hint(app.placing ? LINES.move_hint : null);
  };

  new Pointer(container, stage.camera, {
    pickables: () => app.scene.pickables(),
    tap: (hit, x, y) => {
      unlockAudio();
      if (app.placing) { stage.placeAt(x, y); sfx.pop(); app.placing = false; paintPlacing(); return; }
      app.scene.tap(hit);
    },
    drag: (dx, dy, hit, pickNow) => { if (!app.placing) app.scene.drag(dx, dy, hit, pickNow); },
    dragEnd: () => app.scene.dragEnd?.(),
  });

  hud.loading(false);
  hud.show(true);
  if (stage.fellBack) hud.toast(LINES.no_camera, 3.5);
  else if (stage.mode === 'ar') hud.toast(LINES.mat_hint, 6);
  app.go(sceneKey);

  const clock = new THREE.Clock();
  stage.renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    stage.update(dt);
    tickTweens(dt);
    app.scene.update(dt);
    stage.renderer.render(stage.scene, stage.camera);
  });
}

initAudio({ tts: params.get('tts') !== '0' });
showHome();

// رابط مباشر للاختبار: ?scene=city&mode=3d&autostart=1
if (params.has('autostart') && SCENES[params.get('scene')]) {
  start(params.get('scene'), params.get('mode') === '3d' ? '3d' : 'ar');
}

// يعمل بعد أول فتح حتى لو انقطع الإنترنت (على الموقع المنشور فقط)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
