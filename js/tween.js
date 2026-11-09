// حركات بسيطة تُحدَّث من حلقة الرسم (بدون مكتبات).
const active = new Set();

export const ease = {
  linear: (k) => k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outBack: (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2),
};

/** tween({dur, ease, delay, update(k)}) → وعد يكتمل عند النهاية، وله cancel(). */
export function tween({ dur = 0.5, ease: fn = ease.outCubic, delay = 0, update }) {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  const item = { t: -delay, dur, fn, update, resolve };
  active.add(item);
  promise.cancel = () => { if (active.delete(item)) resolve(); };
  return promise;
}

export function tickTweens(dt) {
  for (const item of [...active]) {
    item.t += dt;
    if (item.t < 0) continue;
    const k = Math.min(1, item.t / item.dur);
    item.update(item.fn(k), k);
    if (k >= 1) { active.delete(item); item.resolve(); }
  }
}

export const wait = (seconds) => tween({ dur: seconds, update() {} });
export const lerp = (a, b, k) => a + (b - a) * k;
