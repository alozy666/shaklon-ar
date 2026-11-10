// اتجاه الجهاز من حساس الحركة. نستعمله ليبقى المشهد في مكانه عندما لا تكون السجادة المطبوعة أمام الكاميرا،
// ولوضع المشهد على «الأرض» (مستوى أفقي تحت الكاميرا) بلمسة.
// ملاحظة: المتصفح يعطي دوران الجهاز فقط لا انتقاله، فالتثبيت بلا سجادة تقريبي.
import * as THREE from 'three';

const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);     // -90° حول X
// إن لم يتوفر الحساس نفترض أن الجهاز مائل 40° نحو الأرض
const FALLBACK = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.7);

let last = null;
const rad = THREE.MathUtils.degToRad;

function onOrient(e) {
  if (e.alpha === null || e.beta === null || e.gamma === null) return;
  last = e;
}

/** يُستدعى من داخل ضغطة المستخدم (iPad يطلب الإذن عندها فقط). */
export async function requestGyro() {
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  window.addEventListener('deviceorientation', onOrient);     // بلا إذن لا تصل قراءات، فلا ضرر من الاستماع
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      return (await DeviceOrientationEvent.requestPermission()) === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

/** يملأ out بدوران الكاميرا بالنسبة للأرض (Y للأعلى). يرجع true إن كانت القراءة حية. */
export function cameraToEarth(out) {
  if (!last) { out.copy(FALLBACK); return false; }
  const orient = rad((screen.orientation && screen.orientation.angle) || window.orientation || 0);
  euler.set(rad(last.beta), rad(last.alpha), -rad(last.gamma), 'YXZ');
  out.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
  return true;
}
