// للاختبار فقط (?fakecam=1): يستبدل الكاميرا بفيديو مصنوع من صورة مطبوعة مائلة فوق «طاولة»،
// حتى يُختبر التتبّع كاملًا على حاسوب بلا كاميرا. لا يُحمَّل في الاستخدام العادي.
// من الكونسول: __fakecam.hide(true) يخفي السجادة (كأن الكاميرا ابتعدت عنها).
export async function installFakeCamera(name) {
  const img = new Image();
  const load = async (n) => { img.src = `assets/targets/${n}.png`; await img.decode(); };
  await load(name);

  const W = 1280, H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  let t = 0;
  let hidden = false;

  function draw() {
    t += 1 / 30;
    g.fillStyle = '#b7a488';
    g.fillRect(0, 0, W, H);
    if (hidden) return;
    // إسقاط منظوري بسيط: الحافة البعيدة (العليا) أضيق، كما يرى الجهاز اللوحي ورقة على الطاولة
    const k = 0.55;
    const cw = 400 + Math.sin(t * 0.5) * 20;
    const ch = (cw * img.height) / img.width * 0.62;
    const cx = W / 2 + Math.sin(t * 0.7) * 40;
    const y0 = 420 + Math.cos(t * 0.6) * 15;
    for (let j = 0; j < ch; j++) {
      const y = j / ch;
      const v = (y * (1 + k)) / (1 + k * y);
      const w = cw / (1 + k * (1 - v));
      g.drawImage(img, 0, v * (img.height - 1), img.width, 1.5, cx - w / 2, y0 + j, w, 1.5);
    }
  }
  draw();
  setInterval(draw, 33);

  const stream = canvas.captureStream(30);
  navigator.mediaDevices.getUserMedia = async () => stream;
  window.__fakecam = { set: load, hide: (v) => { hidden = v; } };
}
