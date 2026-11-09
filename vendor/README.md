# المكتبات المحلية

نسخ غير معدّلة مأخوذة من npm. لا تُعدَّل باليد؛ للتحديث استبدل الملف بنسخة الإصدار الجديد.

| الملف | الحزمة والإصدار | الترخيص |
|---|---|---|
| `three.module.min.js` | three 0.160.0 (`build/`) | MIT |
| `three-addons/renderers/CSS3DRenderer.js` | three 0.160.0 (`examples/jsm/`) — يستورده MindAR | MIT |
| `mindar/*` | mind-ar 1.2.5 (`dist/`) | MIT |
| `es-module-shims.js` | es-module-shims 2.8.4 — دعم import maps على المتصفحات القديمة | MIT |
| `qrcode.js` | qrcode-generator 2.0.4 — لصفحة البطاقات فقط | MIT |
| `fonts/*` | @fontsource/baloo-bhaijaan-2 5.3.0 | OFL-1.1 |

ملاحظات:
- MindAR 1.2.5 يستعمل خاصية قديمة في three، فيظهر في الكونسول تحذير `outputEncoding has been removed` في وضع AR. لا أثر له.
- لا ترفع three فوق 0.160 دون تجربة: الإصدارات الأحدث حذفت `sRGBEncoding` الذي يستورده MindAR.
