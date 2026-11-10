// يجعل الأداة تعمل بعد أول فتح حتى لو انقطع الإنترنت.
// الشبكة أولًا دائمًا (فتصل التحديثات فورًا)، والنسخة المخزّنة عند انقطاعها فقط.
const CACHE = 'shaklon-v2';
const CORE = [
  './', 'index.html', 'css/app.css',
  'js/main.js', 'js/config.js', 'js/stage.js', 'js/gyro.js', 'js/session.js', 'js/hud.js', 'js/input.js',
  'js/audio.js', 'js/tween.js', 'js/buildings.js', 'js/shaklon.js',
  'js/scenes/common.js', 'js/scenes/city.js', 'js/scenes/exam.js', 'js/scenes/lens.js',
  'vendor/es-module-shims.js', 'vendor/three.module.min.js', 'vendor/three-addons/renderers/CSS3DRenderer.js',
  'vendor/mindar/mindar-image-three.prod.js', 'vendor/mindar/controller-mGt1s8dJ.js', 'vendor/mindar/ui-fBadYuor.js',
  'vendor/qrcode.js',
  'vendor/fonts/baloo-bhaijaan-2-arabic-400-normal.woff2', 'vendor/fonts/baloo-bhaijaan-2-arabic-700-normal.woff2',
  'vendor/fonts/baloo-bhaijaan-2-arabic-800-normal.woff2', 'vendor/fonts/baloo-bhaijaan-2-latin-400-normal.woff2',
  'vendor/fonts/baloo-bhaijaan-2-latin-700-normal.woff2', 'vendor/fonts/baloo-bhaijaan-2-latin-800-normal.woff2',
  'assets/icon.svg', 'assets/audio/manifest.json', 'assets/targets/targets.mind', 'assets/targets/mat.png',
  'teacher/', 'teacher/index.html',
  'info/', 'info/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.error())),
  );
});
