// الثوابت المشتركة: الأشكال، المباني، المشاهد، ورسائل شكلون.
// مفتاح الإجابة (شكل كل وجه) معرَّف في buildings.js ويجب أن يطابق docs/lesson.md.

export const SHAPES = {
  square:    { ar: 'مربع',   color: 0x4f6fe3 },
  rectangle: { ar: 'مستطيل', color: 0x8e44ad },
  circle:    { ar: 'دائرة',  color: 0xf08a24 },
  triangle:  { ar: 'مثلث',   color: 0x18a589 },
};
export const SHAPE_ORDER = ['square', 'rectangle', 'circle', 'triangle'];

// ألوان المباني تطابق خانات ورقة «شهادة المحقق»: 1 أزرق، 2 برتقالي، 3 بنفسجي، 4 أخضر، 5 وردي.
export const BUILDINGS = {
  house: { ar: 'البيت',           solid: 'cube',     color: 0x4f6fe3 },
  tower: { ar: 'البرج',           solid: 'cylinder', color: 0xef8a2b },
  kiosk: { ar: 'كشك الآيس كريم',  solid: 'cone',     color: 0x8e52c7 },
  tent:  { ar: 'الخيمة',          solid: 'prism',    color: 0x17a589 },
  block: { ar: 'العمارة',         solid: 'cuboid',   color: 0xdb3a78 },
};

// ترتيب مباني «الحيّ الجديد» = ترتيب مفتاح الإجابة في خطة الدرس.
export const DISTRICT_ORDER = ['house', 'tower', 'kiosk', 'tent', 'block'];
export const CITY_ORDER = ['house', 'tower', 'tent'];
export const MYSTERY_ORDER = ['tent', 'tower', 'block', 'house', 'kiosk'];

// كل مشهد له بطاقة تتبّع؛ target هو ترتيب البطاقة داخل assets/targets/targets.mind.
export const SCENES = {
  city:     { ar: 'مدينة شكلون',    sub: 'حلّل المباني لتعود الأنوار', target: 0, tint: '#4f6fe3' },
  mystery:  { ar: 'المجسم الغامض',  sub: 'اعرف المبنى من أوجهه',       target: 1, tint: '#7b5bd6' },
  district: { ar: 'الحيّ الجديد',   sub: 'مهمة المحقق',                target: 2, tint: '#17a589' },
};

export const TARGETS_URL = 'assets/targets/targets.mind';

// حجم المشهد فوق البطاقة في وضع AR (1 = عرض المنصة 1.7 من عرض البطاقة).
// أصغر قليلًا حتى يرى التلميذ المشهد كاملًا دون أن يبتعد كثيرًا.
export const AR_SCALE = 0.85;

// رسائل شكلون. المفتاح هو اسم ملف التسجيل: assets/audio/<key>.mp3
export const LINES = {
  city_intro: 'انطفأت مدينتي! أحتاج محققين يكتشفون أشكال أوجه مبانيها لتعود إليها الأنوار.',
  city_pick: 'المس مبنى لنبدأ التحقيق.',
  predict: 'أتوقّع: ما الأشكال التي سنجدها على أوجه هذا المبنى؟',
  rotate: 'أدوّر: المس المبنى ليدور، واسحبه لتراه من كل الجهات.',
  split: 'أفصل: المس كل وجه لتفصله عن المبنى.',
  curved: 'هذا الجزء لا ينفصل!',
  split_done: 'فصلنا كل الأوجه! اضغط «أقارن».',
  compare: 'أقارن: هل صدقت توقعاتنا؟',
  compare_missing: 'بقيت أوجه مختبئة! دوّر المبنى وابحث عنها.',
  lit: 'عاد النور إلى المبنى!',
  city_done: 'عادت الأنوار إلى مدينتي! شكرًا أيها المحققون!',
  mystery_intro: 'مبنى مختبئ في الضباب! من يعرفه من أوجهه؟',
  mystery_more: 'المس الضباب ليظهر وجه آخر.',
  mystery_guess: 'ما المبنى المختبئ؟ المس الضباب لتعرف!',
  mystery_reveal: 'ها هو المبنى! هل صدق توقعك؟',
  district_intro: 'هذا حيّي الجديد! كل محقق يكتشف أوجه مبانيه وحده، ويرسمها في شهادته.',
  district_rule: 'اليوم ندوّر فقط، ولا نفصل الأوجه.',
  celebrate: 'أحسنتم أيها المحققون!',
  scan: 'وجّه الكاميرا إلى البطاقة',
  lost: 'وجّه الكاميرا إلى البطاقة من جديد',
  no_camera: 'تعذّر تشغيل الكاميرا، فتحنا العرض بدون كاميرا.',
};

// النطق الآلي من المتصفح بديل مؤقت حتى يضيف المعلم تسجيلاته. عطّله بـ ?tts=0
export const TTS_FALLBACK = true;
