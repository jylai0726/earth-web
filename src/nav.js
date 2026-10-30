import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

/**
 * 单场景连续镜头。
 * - 围绕 anchor（天体）做球面轨道运动，天体公转时镜头同步跟随
 * - 拖拽旋转、滚轮/双指缩放，带阻尼与惯性
 * - flyTo：对数距离插值 + 视线方向球面插值，缓入缓出，不穿模
 */
export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;

    this.anchor = null;                 // THREE.Object3D
    this.target = new THREE.Vector3();
    this.distance = 3.55;
    this.yaw = 0.62;
    this.pitch = 0.12;
    this.minDistance = 1.25;
    this.maxDistance = 62000;
    this.composition = 0.16;
    this.compositionTarget = 0.16;
    this.compositionY = 0;
    this.compositionYTarget = 0;

    this.velocity = { yaw: 0, pitch: 0 };
    this.dragging = false;
    this.pointers = new Map();
    this.pinchDistance = 0;
    this.downAt = null;
    this.moved = 0;

    this.flight = null;
    this.onTap = null;
    this.onUserZoom = null;
    this.onInteract = null;

    this._bind();
  }

  _bind() {
    const el = this.dom;
    el.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
      el.setPointerCapture?.(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.dragging = true;
        this.downAt = { x: event.clientX, y: event.clientY, time: performance.now() };
        this.moved = 0;
        this.velocity.yaw = 0;
        this.velocity.pitch = 0;
      } else if (this.pointers.size === 2) {
        this.pinchDistance = this._pointerSpread();
        this.downAt = null;
        this.cancelFlight();
      }
      this.onInteract?.();
    });

    el.addEventListener('pointermove', event => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      if (this.pointers.size >= 2) {
        const spread = this._pointerSpread();
        if (this.pinchDistance > 0 && spread > 0) {
          const factor = this.pinchDistance / spread;
          this.zoomBy(factor, { silent: true });
          this.onUserZoom?.('in');
        }
        this.pinchDistance = spread;
        return;
      }

      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.moved > 4) this.cancelFlight();
      this.yaw -= dx * 0.0042;
      this.pitch = clamp(this.pitch + dy * 0.0042, -1.46, 1.46);
      this.velocity.yaw = -dx * 0.0042 * 12;
      this.velocity.pitch = dy * 0.0042 * 12;
    });

    const end = event => {
      const wasSingle = this.pointers.size === 1;
      const start = this.downAt;
      this.pointers.delete(event.pointerId);
      if (this.pointers.size === 0) {
        this.dragging = false;
        if (wasSingle && start && this.moved < 5 && performance.now() - start.time < 500) {
          this.onTap?.({ x: event.clientX, y: event.clientY, pointerType: event.pointerType });
        }
        this.downAt = null;
      } else if (this.pointers.size === 1) {
        this.pinchDistance = 0;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);

    el.addEventListener('wheel', event => {
      event.preventDefault();
      this.cancelFlight();
      const delta = clamp(event.deltaY, -160, 160);
      const factor = Math.exp(delta * 0.00125);
      const before = this.distance;
      this.zoomBy(factor, { silent: true });
      if (this.distance !== before) this.onUserZoom?.(event.deltaY > 0 ? 'out' : 'in');
      this.onInteract?.();
    }, { passive: false });
  }

  _pointerSpread() {
    const values = [...this.pointers.values()];
    if (values.length < 2) return 0;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }

  anchorPosition(out = new THREE.Vector3()) {
    if (this.anchor) {
      this.anchor.getWorldPosition(out);
      return out;
    }
    return out.copy(this.target);
  }

  setAnchor(anchor, { distance, yaw, pitch, snap = true } = {}) {
    this.anchor = anchor || null;
    if (distance !== undefined) this.distance = distance;
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    if (snap) {
      this.anchorPosition(this.target);
      this.flight = null;
      this.applyCamera();
    }
  }

  setLimits(radius) {
    this.minDistance = Math.max(radius * 1.16, radius + 0.015);
    this.maxDistance = 62000;
  }

  setComposition(value, vertical = 0) {
    this.compositionTarget = value;
    this.compositionYTarget = vertical;
  }

  zoomBy(factor, { silent = false } = {}) {
    const next = clamp(this.distance * factor, this.minDistance, this.maxDistance);
    const changed = Math.abs(next - this.distance) / this.distance > 1e-5;
    this.distance = next;
    if (!silent) this.applyCamera();
    return changed;
  }

  cancelFlight() {
    if (!this.flight) return;
    const flight = this.flight;
    this.flight = null;
    // 用当前镜头方向反推 yaw/pitch，停在原地，交给用户接管
    const offset = _v1.copy(this.camera.position).sub(this.target);
    const length = offset.length();
    if (length > 1e-6) {
      this.distance = length;
      this.yaw = Math.atan2(offset.x, offset.z);
      this.pitch = Math.asin(clamp(offset.y / length, -1, 1));
    }
    this.anchor = null;
    if (flight.fromAnchor) this.anchor = null;
  }

  /**
   * 连续飞向目标。
   * @param {Object} options
   * @param {THREE.Object3D|null} options.anchor 目标（可为虚拟节点）
   * @param {number} options.distance 抵达后的距离
   * @param {number} [options.yaw]
   * @param {number} [options.pitch]
   * @param {THREE.Vector3} [options.direction] 抵达时的视线方向（优先于 yaw/pitch）
   * @param {number} [options.duration]
   */
  flyTo({ anchor, distance, yaw, pitch, direction, duration }) {
    const startTarget = this.target.clone();
    const startCam = this.camera.position.clone();
    const startDistance = startCam.distanceTo(startTarget) || this.distance;
    const startDir = startCam.clone().sub(startTarget).normalize();
    const startOffset = startTarget.clone().sub(this.anchorPosition(_v2));

    let endDir;
    if (direction) {
      endDir = direction.clone().normalize();
    } else {
      const finalYaw = yaw !== undefined ? yaw : this.yaw;
      const finalPitch = pitch !== undefined ? pitch : this.pitch;
      endDir = new THREE.Vector3(
        Math.sin(finalYaw) * Math.cos(finalPitch),
        Math.sin(finalPitch),
        Math.cos(finalYaw) * Math.cos(finalPitch)
      );
    }
    const endDistance = Math.max(distance ?? startDistance, 0.0001);
    const endYaw = Math.atan2(endDir.x, endDir.z);
    const endPitch = Math.asin(clamp(endDir.y, -1, 1));

    const span = Math.abs(Math.log(Math.max(endDistance, 1e-4) / Math.max(startDistance, 1e-4)));
    const travel = startCam.distanceTo(this.anchor ? this.anchorPosition() : startTarget);
    const auto = 1.55 + Math.min(1.65, span * 0.19) + Math.min(0.5, travel / 26000);

    this.flight = {
      t: 0,
      duration: duration ?? auto,
      fromAnchor: this.anchor,
      startOffset,
      startTarget,
      startDir,
      startDistance,
      endAnchor: anchor || null,
      endDir,
      endDistance,
      endYaw,
      endPitch,
      turn: new THREE.Quaternion().setFromUnitVectors(startDir, endDir),
    };
  }

  update(dt) {
    this.composition += (this.compositionTarget - this.composition) * Math.min(1, dt * 4.5);
    this.compositionY += (this.compositionYTarget - this.compositionY) * Math.min(1, dt * 4.5);
    const flight = this.flight;
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.duration);
      const p = easeInOutCubic(flight.t);
      const q = _q1.identity().slerp(flight.turn, p);
      const dir = _v3.copy(flight.startDir).applyQuaternion(q);
      const liveFrom = new THREE.Vector3();
      const liveEnd = new THREE.Vector3();
      if (flight.fromAnchor) {
        flight.fromAnchor.getWorldPosition(liveFrom).add(flight.startOffset);
      } else {
        liveFrom.copy(flight.startTarget);
      }
      if (flight.endAnchor) {
        flight.endAnchor.getWorldPosition(liveEnd);
      } else {
        liveEnd.copy(flight.startTarget);
      }
      const target = new THREE.Vector3().lerpVectors(liveFrom, liveEnd, p);
      const length = Math.exp(
        THREE.MathUtils.lerp(Math.log(flight.startDistance), Math.log(flight.endDistance), p)
      );

      this.target.copy(target);
      this.camera.position.copy(target).addScaledVector(dir, length);
      this.applyLook(target);

      if (flight.t >= 1) {
        this.anchor = flight.endAnchor;
        this.distance = flight.endDistance;
        this.yaw = flight.endYaw;
        this.pitch = flight.endPitch;
        this.flight = null;
        this.velocity.yaw = 0;
        this.velocity.pitch = 0;
      }
      return;
    }

    this.anchorPosition(this.target);

    if (!this.dragging && (Math.abs(this.velocity.yaw) > 1e-5 || Math.abs(this.velocity.pitch) > 1e-5)) {
      this.yaw += this.velocity.yaw * dt;
      this.pitch = clamp(this.pitch + this.velocity.pitch * dt, -1.46, 1.46);
      const decay = Math.exp(-6.5 * dt);
      this.velocity.yaw *= decay;
      this.velocity.pitch *= decay;
    } else if (this.dragging) {
      this.velocity.yaw *= Math.exp(-10 * dt);
      this.velocity.pitch *= Math.exp(-10 * dt);
    }

    this.applyCamera();
  }

  applyCamera() {
    const cosPitch = Math.cos(this.pitch);
    const offset = _v3.set(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch
    ).multiplyScalar(this.distance);
    this.camera.position.copy(this.target).add(offset);
    this.applyLook(this.target);
  }

  applyLook(target) {
    const aspect = this.camera.aspect || 1;
    const halfHeight = this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const shift = halfHeight * aspect * this.composition;
    const right = _v1.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _v2.copy(target).addScaledVector(right, -shift);
    _v2.y -= halfHeight * this.compositionY;
    this.camera.lookAt(_v2);
  }
}
