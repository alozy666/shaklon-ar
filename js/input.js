// اللمس: يفرّق بين النقرة والسحب، ويحدد الجسم الملموس بإسقاط شعاع من الكاميرا.
import * as THREE from 'three';

const DRAG_PX = 9;

export class Pointer {
  /** handlers: { pickables(), tap(hit), drag(dx, dy, startHit), dragEnd() } */
  constructor(element, camera, handlers) {
    this.el = element;
    this.camera = camera;
    this.h = handlers;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.active = null;
    element.addEventListener('pointerdown', (e) => this.down(e));
    element.addEventListener('pointermove', (e) => this.move(e));
    element.addEventListener('pointerup', (e) => this.up(e));
    element.addEventListener('pointercancel', () => this.cancel());
  }

  pick(clientX, clientY) {
    const rect = this.el.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.h.pickables(), false);
    return hits[0] || null;
  }

  down(e) {
    if (this.active) return;
    this.active = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, dragging: false, hit: this.pick(e.clientX, e.clientY) };
    try { this.el.setPointerCapture(e.pointerId); } catch { /* تجاهل */ }
  }

  move(e) {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    if (!a.dragging && Math.hypot(e.clientX - a.x, e.clientY - a.y) > DRAG_PX) a.dragging = true;
    if (a.dragging) {
      const size = Math.min(this.el.clientWidth, this.el.clientHeight);
      this.h.drag((e.clientX - a.lx) / size, (e.clientY - a.ly) / size, a.hit);
    }
    a.lx = e.clientX; a.ly = e.clientY;
  }

  up(e) {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    this.active = null;
    if (a.dragging) this.h.dragEnd?.();
    else this.h.tap(this.pick(e.clientX, e.clientY));
  }

  cancel() {
    if (this.active?.dragging) this.h.dragEnd?.();
    this.active = null;
  }
}
