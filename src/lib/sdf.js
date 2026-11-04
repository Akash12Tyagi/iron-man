import * as THREE from "three";

/*
 * Signed-distance sculpting. Organic parts (heads, hair, hands) are written as
 * smooth unions of simple primitives, then meshed with Surface Nets: one
 * vertex per surface-crossing cell, placed at the mean of its edge crossings.
 * Triangles are oriented by the field's gradient and normals are smoothed from
 * the mesh. The result is closed and needs no UVs: shading uses object-space
 * position.
 */

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function sdSphere(p, c, r) {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const dz = p.z - c.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

// Good approximation of the distance to an ellipsoid (Quílez).
export function sdEllipsoid(p, c, r) {
  const x = (p.x - c.x) / r.x;
  const y = (p.y - c.y) / r.y;
  const z = (p.z - c.z) / r.z;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const ax = x / r.x;
  const ay = y / r.y;
  const az = z / r.z;
  const k1 = Math.sqrt(ax * ax + ay * ay + az * az);
  return k1 === 0 ? -Math.min(r.x, r.y, r.z) : (k0 * (k0 - 1)) / k1;
}

export function sdCapsule(p, a, b, r) {
  const pax = p.x - a.x;
  const pay = p.y - a.y;
  const paz = p.z - a.z;
  const bax = b.x - a.x;
  const bay = b.y - a.y;
  const baz = b.z - a.z;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

// Capsule whose radius tapers from ra at a to rb at b.
export function sdTaper(p, a, b, ra, rb) {
  const pax = p.x - a.x;
  const pay = p.y - a.y;
  const paz = p.z - a.z;
  const bax = b.x - a.x;
  const bay = b.y - a.y;
  const baz = b.z - a.z;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}

export function sdRoundBox(p, c, half, r) {
  const qx = Math.abs(p.x - c.x) - half.x + r;
  const qy = Math.abs(p.y - c.y) - half.y + r;
  const qz = Math.abs(p.z - c.z) - half.z + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

/** Smoothly carve b out of a. */
export function ssub(a, b, k) {
  return smax(a, -b, k);
}

/**
 * Mesh the zero level of `field(p)` inside `box` with cell size `step`.
 * Returns a BufferGeometry with gradient normals.
 */
export function surfaceNets(field, box, step) {
  const nx = Math.ceil((box.max.x - box.min.x) / step) + 1;
  const ny = Math.ceil((box.max.y - box.min.y) / step) + 1;
  const nz = Math.ceil((box.max.z - box.min.z) / step) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const p = new THREE.Vector3();
  const idx = (i, j, k) => i + nx * (j + ny * k);

  // Narrow band: sample block centres first; blocks the surface cannot reach
  // take the centre's value (only its sign matters there).
  const B = 4;
  const reach = Math.sqrt(3) * (B / 2) * step * 1.25 + step;
  for (let bk = 0; bk < nz; bk += B) {
    for (let bj = 0; bj < ny; bj += B) {
      for (let bi = 0; bi < nx; bi += B) {
        p.set(box.min.x + (bi + B / 2) * step, box.min.y + (bj + B / 2) * step, box.min.z + (bk + B / 2) * step);
        const dc = field(p);
        const far = Math.abs(dc) > reach;
        const kEnd = Math.min(bk + B, nz);
        const jEnd = Math.min(bj + B, ny);
        const iEnd = Math.min(bi + B, nx);
        for (let k = bk; k < kEnd; k++) {
          p.z = box.min.z + k * step;
          for (let j = bj; j < jEnd; j++) {
            p.y = box.min.y + j * step;
            for (let i = bi; i < iEnd; i++) {
              if (far) {
                vals[idx(i, j, k)] = dc;
              } else {
                p.x = box.min.x + i * step;
                vals[idx(i, j, k)] = field(p);
              }
            }
          }
        }
      }
    }
  }

  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const positions = [];
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = corners[c];
          cv[c] = vals[idx(i + a, j + b, k + d)];
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [e0, e1] of edges) {
          const v0 = cv[e0];
          const v1 = cv[e1];
          if (v0 < 0 === v1 < 0) continue;
          const t = v0 / (v0 - v1);
          const [a0, b0, d0] = corners[e0];
          const [a1, b1, d1] = corners[e1];
          sx += a0 + (a1 - a0) * t;
          sy += b0 + (b1 - b0) * t;
          sz += d0 + (d1 - d0) * t;
          n++;
        }
        cellVert[cidx(i, j, k)] = positions.length / 3;
        positions.push(
          box.min.x + (i + sx / n) * step,
          box.min.y + (j + sy / n) * step,
          box.min.z + (k + sz / n) * step
        );
      }
    }
  }

  // One quad per sign-changing grid edge, joining the four cells around it.
  const index = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, b, c, a, c, d);
    else index.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = vals[idx(i, j, k)] < 0;
        const b = vals[idx(i + 1, j, k)] < 0;
        if (a === b) continue;
        quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], a);
      }
    }
  }
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const a = vals[idx(i, j, k)] < 0;
        const b = vals[idx(i, j + 1, k)] < 0;
        if (a === b) continue;
        quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], a);
      }
    }
  }
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const a = vals[idx(i, j, k)] < 0;
        const b = vals[idx(i, j, k + 1)] < 0;
        if (a === b) continue;
        quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], a);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  // Orientation reference: the field's gradient, sampled once per triangle.
  const normals = new Float32Array(positions.length);
  {
    const e = step * 0.5;
    const q = new THREE.Vector3();
    const arr = index;
    for (let i = 0; i < arr.length; i += 3) {
      const v = arr[i] * 3;
      if (normals[v] !== 0 || normals[v + 1] !== 0 || normals[v + 2] !== 0) continue;
      const x = positions[v];
      const y = positions[v + 1];
      const z = positions[v + 2];
      normals[v] = field(q.set(x + e, y, z)) - field(q.set(x - e, y, z));
      normals[v + 1] = field(q.set(x, y + e, z)) - field(q.set(x, y - e, z));
      normals[v + 2] = field(q.set(x, y, z + e)) - field(q.set(x, y, z - e));
    }
  }
  // Orient every triangle to agree with the gradient normals.
  {
    const arr = geo.index.array;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < arr.length; i += 3) {
      a.fromArray(positions, arr[i] * 3);
      b.fromArray(positions, arr[i + 1] * 3).sub(a);
      c.fromArray(positions, arr[i + 2] * 3).sub(a);
      const fx = b.y * c.z - b.z * c.y;
      const fy = b.z * c.x - b.x * c.z;
      const fz = b.x * c.y - b.y * c.x;
      const n0 = arr[i] * 3;
      if (fx * normals[n0] + fy * normals[n0 + 1] + fz * normals[n0 + 2] < 0) {
        const t = arr[i + 1];
        arr[i + 1] = arr[i + 2];
        arr[i + 2] = t;
      }
    }
  }
  // Smooth normals from the (now consistently wound) mesh.
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// Smooth value noise for skin and hair variation.
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
export function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const s = (v) => v * v * (3 - 2 * v);
  const fx = s(x - xi);
  const fy = s(y - yi);
  const fz = s(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz
  );
}

/**
 * A sculpt is an ordered list of parts, each a distance function combined with
 * the running result: "add" (smooth union), "cut" (smooth subtraction), "clip"
 * (smooth intersection) or "detail" (a displacement added to the surface).
 * `mirror` evaluates the part at |x| for paired features. A bound lets points
 * far from the sculpt skip the parts.
 */
export function sculpt(parts, bound = null, boundMargin = 0.02) {
  const q = new THREE.Vector3();
  return (p) => {
    if (bound) {
      const b = bound(p);
      if (b > boundMargin) return b;
    }
    let s = Infinity;
    for (const part of parts) {
      const at = part.mirror ? q.set(Math.abs(p.x), p.y, p.z) : p;
      const d = part.d(at, p);
      if (part.op === "detail") s += d;
      else if (s === Infinity) s = d;
      else if (part.op === "cut") s = ssub(s, d, part.k);
      else if (part.op === "clip") s = smax(s, d, part.k);
      else s = smin(s, d, part.k);
    }
    return s;
  };
}

export const ellipsoid = (c, r) => (p) => sdEllipsoid(p, c, r);
export const sphere = (c, r) => (p) => sdSphere(p, c, r);
export const capsule = (a, b, r) => (p) => sdCapsule(p, a, b, r);
export const taper = (a, b, ra, rb) => (p) => sdTaper(p, a, b, ra, rb);
export const roundBox = (c, half, r) => (p) => sdRoundBox(p, c, half, r);
