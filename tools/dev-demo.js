// للاختبار فقط: يلعب فصل «المدينة» كاملًا آليًّا ويسجّله فيديو عبر dev-capture.js. لا يُحمَّل في الاستخدام العادي.
// اللمسات حقيقية: شعاع من الكاميرا إلى العنصر يمر على scene.pickables() ثم scene.tap()، فلا يُلمس إلا ما يُرى،
// وما لا يُرى يُدار المبنى أو يُرفع حتى يظهر (كما يفعل التلميذ). لذلك يصلح أيضًا فحصًا آليًّا للمسار كله:
// المكعب، بناء المدينة، انطفاء الأنوار، العدّ بالعدسات الثلاث، عودة النور، المجسم الغامض، الاحتفال.
// من الكونسول، بعد فتح ?scene=city&mode=3d&autostart=1&tts=0 بتخزين ممسوح:
//   const demo = await import('/tools/dev-demo.js');
//   await demo.intro(); await demo.building(0); await demo.building(1, { speed: 4 }); await demo.building(2, { speed: 3 });
//   await demo.mystery({ speed: 5 }); await demo.finale();
// ثم: ffmpeg -framerate 20 -i assets/360/cap-%04d.jpg -c:v libx264 -pix_fmt yuv420p out.mp4 (وانقل اللقطات من المستودع بعدها).
import * as THREE from 'three';
import * as cap from './dev-capture.js';

const ray = new THREE.Raycaster();
const app = () => window.__shaklon;
const sameBuilding = (target) => (o) => o.userData.building && o.userData.building === target.userData.building;
/** يسجّل مدة من زمن التطبيق (بالثواني) بسرعة عرض معينة. */
const rec = (appSeconds, speed = 1) => cap.record(appSeconds / speed, { speed });

/**
 * لمسة حقيقية على هدف. ترجع false إن حجبه شيء عن الكاميرا (فلا يُلمس).
 * lifts: ارتفاعات تُجرَّب فوق مركز الهدف (مبنًى يحجب أسفلَه مبنًى أمامه يُلمس من أعلاه).
 */
export function tap(target, match = (o) => o === target, lifts = [0]) {
  const { stage, scene } = app();
  const from = stage.camera.getWorldPosition(new THREE.Vector3());
  for (const lift of lifts) {
    const to = target.getWorldPosition(new THREE.Vector3());
    to.y += lift;
    ray.set(from, to.sub(from).normalize());
    const hit = ray.intersectObjects(scene.pickables(), false)[0];
    if (!hit || !match(hit.object)) continue;
    cap.tapAt(hit.point);
    scene.tap(hit);
    return true;
  }
  return false;
}
const tapBuilding = (b) => tap(b.core, sameBuilding(b.core), [0, 0.08, 0.14]);

/** سحبة قصيرة تدير المبنى المفحوص. */
async function turn(speed) {
  const { scene } = app();
  const steps = speed >= 3 ? 1 : 5;                       // في التسريع: السحبة كلها في إطار واحد
  for (let i = 0; i < steps; i++) {
    scene.drag(0.2 / steps, scene.focuser.lifted ? 0.06 / steps : 0, null, () => null);
    await rec(0.25 / steps, speed);
  }
}

async function countLens(lens, { gap, speed }) {
  const s = app().scene, b = s.focuser.current.building;
  if (!b.els[lens].length) return;
  if (s.counter.lens !== lens) { s.hud.lenses.onPick(lens); await rec(0.6, Math.min(speed, 2)); }
  let misses = 0;
  while (b.missing(lens).length) {
    // لم يبقَ إلا الوجه السفلي: نرفع المبنى (كما يلمّح شكلون: «ماذا يوجد تحته؟»)
    if (lens === 'faces' && !s.focuser.lifted && b.missing(lens).every((el) => el.bottom)) { s.toggleLift(); await rec(0.9, speed); continue; }
    if (b.missing(lens).some((el) => tap(el.proxy))) { misses = 0; await rec(gap, speed); continue; }
    misses++;
    if (misses > 8 && !s.focuser.lifted) { s.toggleLift(); await rec(0.9, speed); misses = 0; continue; }
    if (misses > 40) throw new Error('demo: لم يُوصَل إلى عنصر في عدسة ' + lens);
    await turn(speed);
  }
}

/** المكعب ← المدينة تُبنى وتضيء ← تنطفئ الأنوار وينزل الليل. */
export async function intro() {
  const s = app().scene;
  await rec(1.6);
  if (!tap(s.cube.pick)) throw new Error('demo: المكعب لا يُلمس');
  await rec(9.8);
  if (s.focuser.busy) throw new Error('demo: عرض البداية لم ينتهِ');
}

/**
 * مبنى كامل: فتحه، «أتجوّل»، العدّ بالعدسات، «أقارن»، ثم عرض عودة النور. slot: رقم الخانة أو الخانة نفسها.
 * speed: سرعة العرض عمومًا. lensSpeed: سرعة عدسة بعينها ({ edges: 2 }). showSpeed: سرعة عرض عودة النور.
 */
export async function building(slot, { speed = 1, lensSpeed = {}, gap = 0.32, walk = true, showSpeed = 1 } = {}) {
  const s = app().scene, f = s.focuser;
  if (typeof slot === 'number') slot = f.slots[slot];
  const b = slot.building;
  while (f.busy || f.current) await rec(0.1, speed);
  if (!tapBuilding(b)) throw new Error('demo: المبنى لا يُلمس: ' + b.key);
  await rec(1.5, speed);                                  // تقريب المبنى + «أتوقع»
  s.setStep('walk');
  await rec(0.8, speed);
  if (walk) { tapBuilding(b); await rec(3.1, Math.max(speed, 1.5)); }          // دورة «أتجوّل»
  s.setStep('count');
  await rec(0.8, speed);
  if (b.curved.length && tap(b.curved[0])) await rec(1.8, Math.min(speed, 1.5));  // «هذا سطح منحنٍ، ليس وجهًا»
  for (const lens of ['faces', 'edges', 'vertices']) await countLens(lens, { gap, speed: lensSpeed[lens] ?? speed });
  if (!b.complete()) throw new Error('demo: العدّ لم يكتمل: ' + b.key);
  const counts = b.counts();
  await rec(0.7, speed);
  s.setStep('compare');
  await rec(1.0, speed);
  s.finish();                                             // زر «تمّ»: عرض عودة النور
  do { await rec(0.1, showSpeed); } while (f.busy || f.current);
  await rec(0.8, showSpeed);
  return counts;
}

/** المجسم الغامض: اللغز، كشف الضباب، ثم عدّ العمارة. */
export async function mystery(options = {}) {
  const s = app().scene;
  for (let i = 0; !s.fogPick && i < 80; i++) await rec(0.1);
  if (!s.fogPick) throw new Error('demo: لم يظهر الضباب');
  await rec(2.6);
  if (!tap(s.fogPick)) throw new Error('demo: الضباب لا يُلمس');
  await rec(1.9);
  return building(s.blockSlot, options);
}

/** الاحتفال بعد إضاءة المدينة كلها. */
export async function finale(seconds = 6) {
  await rec(seconds);
  cap.release();                                          // انتهى التسجيل: تعود الحلقة الحية
  return app().scene.done;
}
