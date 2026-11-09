// الروبوت شكلون، مبني من أشكال أولية. ارتفاعه وحدة واحدة تقريبًا قبل التصغير.
import * as THREE from 'three';
import { tween, ease } from './tween.js';

const BLUE = 0x4f6fe3;
const BLUE_DARK = 0x3a55c4;
const ORANGE = 0xf5a623;
const INK = 0x1f2a5a;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

function roundedBox(w, h, d, r, color) {
  const bev = Math.min(r * 0.5, d * 0.2);
  const geo = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bev, h - 2 * bev, r), {
    depth: d - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 10,
  });
  geo.translate(0, 0, -(d - 2 * bev) / 2);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });
const flat = (color) => new THREE.MeshBasicMaterial({ color });

export function createShaklon() {
  const group = new THREE.Group();
  const body = new THREE.Group();      // يتمايل كله
  group.add(body);

  const torso = roundedBox(0.36, 0.3, 0.26, 0.08, BLUE_DARK);
  torso.position.y = 0.24;
  const chest = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), flat(0xffe27a));
  chest.position.set(0, 0.25, 0.132);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 16), std(0xc9d2f2));
  neck.position.y = 0.42;

  const head = new THREE.Group();
  head.position.y = 0.64;
  const skull = roundedBox(0.54, 0.38, 0.34, 0.1, BLUE);
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.42, 0.27, 0.07)), flat(0xe6ecff));
  plate.position.z = 0.172;
  const eyes = new THREE.Group();
  for (const sx of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.CircleGeometry(0.062, 28), flat(0xffffff));
    white.position.set(sx * 0.1, 0.02, 0.174);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.032, 24), flat(INK));
    pupil.position.set(sx * 0.1, 0.014, 0.176);
    const spark = new THREE.Mesh(new THREE.CircleGeometry(0.011, 12), flat(0xffffff));
    spark.position.set(sx * 0.1 + 0.012, 0.028, 0.178);
    eyes.add(white, pupil, spark);
  }
  const mouth = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.13, 0.03, 0.015)), flat(ORANGE));
  mouth.position.set(0, -0.085, 0.174);
  const ears = [-1, 1].map((sx) => {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 20), std(ORANGE));
    ear.rotation.z = Math.PI / 2;
    ear.position.set(sx * 0.29, 0, 0);
    return ear;
  });
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 8), std(ORANGE));
  stalk.position.y = 0.25;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.048, 20, 16), std(ORANGE, { emissive: ORANGE, emissiveIntensity: 0.4 }));
  ball.position.y = 0.33;
  head.add(skull, plate, eyes, mouth, ...ears, stalk, ball);

  const arms = [-1, 1].map((sx) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.215, 0.33, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.13, 6, 12), std(BLUE));
    arm.position.y = -0.09;
    pivot.add(arm);
    pivot.rotation.z = sx * 0.25;
    return pivot;
  });

  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.1, 20), std(ORANGE, { emissive: ORANGE, emissiveIntensity: 0.5 }));
  jet.rotation.x = Math.PI;
  jet.position.y = 0.04;

  body.add(torso, chest, neck, head, ...arms, jet);
  group.traverse((o) => { if (o.isMesh) o.userData = { kind: 'shaklon' }; });

  const pickables = [];
  group.traverse((o) => { if (o.isMesh) pickables.push(o); });

  let waveUntil = 0;
  let clock = 0;
  let jump = 0;
  const target = new THREE.Vector3();

  return {
    group,
    pickables,
    wave(seconds = 2) { waveUntil = clock + seconds; },
    celebrate() {
      this.wave(3);
      tween({
        dur: 1.1, ease: ease.linear,
        update: (k) => {
          jump = k >= 1 ? 0 : Math.abs(Math.sin(k * Math.PI * 3)) * 0.18 * (1 - k * 0.5);
          body.rotation.y = k >= 1 ? 0 : k * Math.PI * 2;
        },
      });
    },
    /** camera: لينظر شكلون إلى من يحمل الجهاز. */
    update(dt, camera) {
      clock += dt;
      head.position.y = 0.64 + Math.sin(clock * 2.2) * 0.012;
      body.position.y = Math.sin(clock * 1.7) * 0.02 + jump;
      ball.material.emissiveIntensity = 0.4 + Math.sin(clock * 4) * 0.25;
      const blink = clock % 3.6;
      eyes.scale.y = blink < 0.12 ? 0.12 : 1;
      const waving = clock < waveUntil;
      const goal = waving ? 2.5 + Math.sin(clock * 11) * 0.45 : 0.25;
      arms[1].rotation.z += (goal - arms[1].rotation.z) * Math.min(1, dt * 10);
      if (camera && group.parent) {
        camera.getWorldPosition(target);
        group.parent.worldToLocal(target);
        const yaw = Math.atan2(target.x - group.position.x, target.z - group.position.z);
        let d = yaw - group.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        group.rotation.y += d * Math.min(1, dt * 4);
      }
    },
  };
}
