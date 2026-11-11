// للاختبار فقط: يسجّل العرض لقطةً لقطة مع صوت مؤثراته إلى مجلد .capture/ عبر خادم tools/serve.mjs، ثم تُجمع فيديو بـ ffmpeg.
// لا يُحمَّل في الاستخدام العادي ولا يدخل في sw.js. يعمل حتى لو كانت الصفحة في الخلفية (يقدّم الزمن بـ app.advance).
// اللقطة = خلفية الصفحة + طبقة الليل + لوحة المجسمات + جملة شكلون + علامات اللمس. الأزرار لا تظهر فيها.
// الصوت = مؤثرات التطبيق نفسها (js/audio.js) يعاد توليدها في مواضعها من الفيديو. صوت شكلون (النطق) لا يُسجَّل.
// من الكونسول:
//   const cap = await import('/tools/dev-capture.js');
//   cap.tapAt(pointInScene);            // علامة لمسة عند نقطة (إحداثيات عامة)
//   await cap.record(2);                // ثانيتان بسرعة عادية. record(2, { speed: 3 }) = تسريع ثلاث مرات
//   await cap.saveAudio();              // .capture/cap-audio.wav
//   cap.release();                      // يعيد حركة الصفحة (التسجيل يوقف الحلقة الحية ليكون الزمن بيده وحده)
// ثم: ffmpeg -framerate 20 -i .capture/cap-%04d.jpg -i .capture/cap-audio.wav -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest out.mp4
import { onTone, synth } from '../js/audio.js';

export const FPS = 20;
const canvas = document.createElement('canvas');
let index = 0;
let taps = [];
let rate = 1;                 // سرعة المقطع الجاري: تأخير النغمات داخل المؤثر ينضغط معها
const tones = [];
onTone((p) => tones.push({ ...p, at: index / FPS + (p.delay || 0) / rate }));

export const frames = () => index;
/** يعيد الحلقة الحية بعد انتهاء التسجيل (record يوقفها حتى لا يتقدم الزمن من نفسه بين اللقطات). */
export const release = () => window.__shaklon.hold?.(false);

/** علامة لمسة تظهر في اللقطات القادمة عند نقطة من المشهد. */
export function tapAt(point) {
  const app = window.__shaklon, gl = app.stage.renderer.domElement;
  const v = point.clone().project(app.stage.camera);
  taps.push({ x: (v.x * 0.5 + 0.5) * gl.width, y: (-v.y * 0.5 + 0.5) * gl.height, t: 0 });
}

function ellipse(g, W, H, cx, cy, rx, ry, stops, alpha) {
  g.save();
  g.globalAlpha = alpha;
  g.translate(cx, cy);
  g.scale(rx, ry);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(-cx / rx - 1, -cy / ry - 1, W / rx + 2, H / ry + 2);
  g.restore();
}

function caption(g, W, text, k) {
  g.save();
  g.scale(k, k);                        // المقاسات بوحدات CSS: تبقى القراءة واحدة مهما كانت كثافة الشاشة
  W /= k;
  g.font = '800 ' + (W < 500 ? 19 : 25) + 'px "Baloo Bhaijaan 2", sans-serif';
  g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (g.measureText(next).width > W - (W < 500 ? 70 : 170) && line) { lines.push(line); line = word; } else line = next;
  }
  lines.push(line);
  const lh = W < 500 ? 28 : 36;
  const bw = Math.min(W - 20, Math.max(...lines.map((l) => g.measureText(l).width)) + 48), bh = lines.length * lh + 24;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.roundRect((W - bw) / 2, 24, bw, bh, 22); g.fill();
  g.fillStyle = '#1b2459';
  lines.forEach((l, j) => g.fillText(l, W / 2, 24 + 12 + lh / 2 + j * lh));
  g.restore();
}

async function save(name, bytes) {
  const res = await fetch('/__save?dir=capture&name=' + name, { method: 'POST', body: bytes });
  if (!res.ok) throw new Error('capture: تعذّر الحفظ ' + name);
}

/** يسجّل seconds ثانية من الفيديو. speed: كم ثانية من زمن التطبيق تمرّ في ثانية الفيديو. */
export async function record(seconds, { speed = 1, text = true } = {}) {
  const app = window.__shaklon, gl = app.stage.renderer.domElement;
  const W = gl.width, H = gl.height;
  const k = W / (gl.clientWidth || W);                 // كثافة الشاشة (2 على الهاتف): تُكبَّر بها الكتابة وعلامات اللمس
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const g = canvas.getContext('2d');
  const nightEl = document.querySelector('#stage .night');
  const n = seconds > 0 ? Math.max(1, Math.round(seconds * FPS)) : 0;     // إطار واحد على الأقل: الزمن يتقدم دائمًا
  rate = speed;
  app.hold?.(true);                                    // الزمن بيد التسجيل وحده من الآن (release() تعيده)
  for (let i = 0; i < n; i++) {
    await app.advance(speed / FPS, speed / (FPS * 2 * Math.max(1, Math.round(speed))));
    g.globalAlpha = 1;
    ellipse(g, W, H, W * 0.5, H * 1.05, W * 1.2, H * 0.9, [[0, '#33419a'], [0.45, '#1b2459'], [1, '#0d1230']], 1);   // خلفية #stage.mode-3d
    g.fillStyle = '#fff';
    for (const [x, y, r] of [[.12, .18, 1.5], [.78, .12, 1.5], [.32, .08, 1], [.58, .22, 1], [.9, .3, 1.5], [.06, .36, 1]]) { g.beginPath(); g.arc(W * x, H * y, r * k, 0, 7); g.fill(); }
    const night = parseFloat(nightEl?.style.opacity || '0') || 0;
    if (night > 0) ellipse(g, W, H, W * 0.5, H, W * 1.3, H, [[0, '#0a1140'], [0.55, '#050920'], [1, '#02040f']], night);     // #stage .night
    g.drawImage(gl, 0, 0);
    for (const t of taps) {
      const e = t.t / 0.45;
      g.save();
      g.globalAlpha = Math.max(0, 1 - e); g.strokeStyle = '#fff'; g.lineWidth = 5 * k;
      g.beginPath(); g.arc(t.x, t.y, (14 + e * 30) * k, 0, 7); g.stroke();
      g.globalAlpha = Math.max(0, 0.5 - e); g.fillStyle = '#fff';
      g.beginPath(); g.arc(t.x, t.y, 16 * k, 0, 7); g.fill();
      g.restore();
      t.t += 1 / FPS;
    }
    taps = taps.filter((t) => t.t < 0.45);
    const line = text && document.getElementById('bubble-text')?.textContent.trim();
    if (line) caption(g, W, line, k);
    if (speed > 1) {                                   // شارة «تسريع» حتى لا يُظن أن التطبيق بهذه السرعة
      g.save();
      g.scale(k, k);
      g.font = '800 22px "Baloo Bhaijaan 2", sans-serif'; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(13,18,48,0.75)';
      g.beginPath(); g.roundRect(W / k - 176, H / k - 70, 152, 44, 22); g.fill();
      g.fillStyle = '#ffe27a';
      g.fillText('تسريع ×' + speed, W / k - 100, H / k - 47);
      g.restore();
    }
    // toDataURL لا toBlob: الثانية تتأخر ثانية لكل لقطة حين تكون الصفحة في الخلفية
    const bin = atob(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    await save('cap-' + String(index).padStart(4, '0') + '.jpg', bytes);
    index++;
  }
  return index;
}

/** يولّد صوت المؤثرات التي طُلبت أثناء التسجيل، كلٌّ في موضعه من الفيديو، ويحفظه cap-audio.wav. يرجع عدد النغمات. */
export async function saveAudio() {
  const rateHz = 44100, seconds = index / FPS + 1;
  const off = new OfflineAudioContext(1, Math.ceil(seconds * rateHz), rateHz);
  const master = off.createGain();
  master.gain.value = 0.75;
  master.connect(off.destination);
  for (const t of tones) if (t.at < seconds - 0.1) synth(off, master, t, t.at);
  const data = (await off.startRendering()).getChannelData(0), n = data.length;
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rateHz, true); out.setUint32(28, rateHz * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  await save('cap-audio.wav', out.buffer);
  return tones.length;
}
