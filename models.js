// models.js — 부캉이(상어) 3D 모델 + 관람객(인간) 3D 모델 빌더
// index.html의 게임 모듈에서 import해서 사용합니다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const V3 = THREE.Vector3, MU = THREE.MathUtils;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
function prep(geo, colorFn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.array), 3));
  const col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    colorFn(c, cx, cy, cz);
    const j = 0.93 + Math.random() * 0.12;
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r * j; col[(i + k) * 3 + 1] = c.g * j; col[(i + k) * 3 + 2] = c.b * j; }
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function finGeo(pts, depth = 0.05) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}
// ===== 상어 =====
function buildSharkGeometry() {
  const topC = new THREE.Color(0x55687c), bellyC = new THREE.Color(0xeef2f4), finC = new THREE.Color(0x4a5b6e);
  const PROF = [[0, -2.0], [0.1, -1.75], [0.2, -1.3], [0.38, -0.6], [0.5, 0.1], [0.5, 0.7], [0.4, 1.25], [0.25, 1.7], [0.08, 1.98], [0, 2.05]];
  const radiusAt = (x) => {
    for (let i = 0; i < PROF.length - 1; i++) {
      const [r0, x0] = PROF[i], [r1, x1] = PROF[i + 1];
      if (x >= x0 && x <= x1) return r0 + (r1 - r0) * (x - x0) / (x1 - x0);
    }
    return 0;
  };
  const body = new THREE.LatheGeometry(PROF.map(p => new THREE.Vector2(p[0], p[1])), 8);
  body.rotateZ(-Math.PI / 2); body.scale(1, 0.85, 1);
  const bodyColor = (c, x, y) => c.copy(bellyC).lerp(topC, MU.smoothstep(y, -0.18, 0.08));
  const finColor = (c) => c.copy(finC);

  const dorsal = finGeo([[0.45, 0], [-0.15, 0.95], [-0.38, 0.92], [-0.3, 0.55], [-0.4, 0]], 0.06); dorsal.translate(0.1, 0.32, 0);
  const dorsal2 = finGeo([[0.12, 0], [-0.12, 0.25], [-0.2, 0]], 0.04); dorsal2.translate(-1.2, 0.15, 0);
  const caudal = finGeo([[0.1, 0.06], [-0.3, 0.5], [-0.72, 1.15], [-0.86, 1.12], [-0.62, 0.35], [-0.52, 0.0], [-0.68, -0.5], [-0.6, -0.62], [-0.25, -0.25], [0.1, -0.06]], 0.05);
  caudal.translate(-1.7, 0, 0);
  const pecR = finGeo([[0.3, 0], [-0.35, 0.95], [-0.55, 0.95], [-0.3, 0]], 0.05);
  pecR.rotateX(Math.PI / 2); pecR.rotateX(0.45); pecR.translate(0.65, -0.22, 0.28);
  const pecL = pecR.clone(); pecL.scale(1, 1, -1);
  const anal = finGeo([[0.1, 0], [-0.1, -0.2], [-0.2, 0]], 0.04); anal.translate(-1.3, -0.12, 0);
  const eyeR = new THREE.IcosahedronGeometry(0.06, 0); eyeR.translate(1.45, 0.1, 0.31);
  const eyeL = new THREE.IcosahedronGeometry(0.06, 0); eyeL.translate(1.45, 0.1, -0.31);

  const ms = new THREE.Shape();
  ms.moveTo(0.75, radiusAt(0.75) * 0.93);
  for (let x = 0.85; x < 1.98; x += 0.1) ms.lineTo(x, radiusAt(x) * 0.93);
  ms.lineTo(2.0, 0);
  for (let x = 1.95; x > 0.75; x -= 0.1) ms.lineTo(x, -radiusAt(x) * 0.93);
  ms.lineTo(0.75, -radiusAt(0.75) * 0.93);
  const mouthBase = new THREE.ShapeGeometry(ms); mouthBase.rotateX(-Math.PI / 2);
  const palate = mouthBase.clone(); palate.translate(0, 0.012, 0);
  const tongue = mouthBase.clone(); tongue.translate(0, -0.012, 0);

  const upperTeeth = [], lowerTeeth = [];
  for (const x of [0.95, 1.1, 1.25, 1.4, 1.55]) {
    const r = radiusAt(x) * 0.85;
    for (const sgn of [1, -1]) {
      const u = new THREE.ConeGeometry(0.035, 0.09, 3); u.rotateX(Math.PI); u.translate(x, -0.045, r * sgn); upperTeeth.push(u);
      const l = new THREE.ConeGeometry(0.035, 0.09, 3); l.translate(x + 0.07, 0.045, r * 0.95 * sgn); lowerTeeth.push(l);
    }
  }
  const tc = c => c.setHex(0xfafaf0), ec = c => c.setHex(0x0a0a0a);
  const parts = [
    { g: prep(body, bodyColor), jaw: 'body' },
    { g: prep(dorsal, finColor), jaw: 'none' }, { g: prep(dorsal2, finColor), jaw: 'none' },
    { g: prep(caudal, finColor), jaw: 'none' }, { g: prep(pecR, bodyColor), jaw: 'none' },
    { g: prep(pecL, bodyColor), jaw: 'none' }, { g: prep(anal, finColor), jaw: 'none' },
    { g: prep(eyeR, ec), jaw: 'none' }, { g: prep(eyeL, ec), jaw: 'none' },
    { g: prep(palate, c => c.setHex(0x6b1f2a)), jaw: 'none' },
    { g: prep(tongue, c => c.setHex(0x9a3442)), jaw: 'all' },
    ...upperTeeth.map(t => ({ g: prep(t, tc), jaw: 'none' })),
    ...lowerTeeth.map(t => ({ g: prep(t, tc), jaw: 'all' })),
  ];
  const masks = [];
  for (const p of parts) {
    const pos = p.g.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      let m = 0;
      if (p.jaw === 'all') m = 1;
      else if (p.jaw === 'body') {
        const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
        const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
        if (cx > 0.75 && cy < 0) m = 1;
      }
      masks.push(m, m, m);
    }
  }
  return { geo: mergeGeometries(parts.map(p => p.g)), jawMask: new Uint8Array(masks) };
}

// ===== 사람들 =====
const personMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const SKIN = [0xf6d5bd, 0xf1c7a5, 0xe0ac85, 0xc68a62, 0x9a6440, 0x6e4329];
const HAIR = [0x1d140e, 0x2b1d14, 0x4a3020, 0x6b4a2b, 0x111111, 0xc79a4b, 0x8a3b1e];
const GRAY = [0xdcdcdc, 0xbfbfbf, 0xf0f0f0, 0x9e9e9e];
const TOPS = [0xe85d5d, 0x4f8fe6, 0xf2c14e, 0x5cc28a, 0xa66ee0, 0xff8fb3, 0xf4f4f4, 0x3a4a5e, 0xff9a3c, 0x2fb3b3, 0x8fd14f];
const BOTTOMS = [0x2c3e66, 0x3b3b3b, 0x7a6a55, 0x4a5f8a, 0xd9d2c0, 0x1f2a38, 0x6b4f3a];
const SHOES = [0x222222, 0xf4f4f4, 0x8b5a2b, 0xd94848, 0x3a6fd8];
const HATC = [0xf2f2f2, 0xe8d7a8, 0xd94848, 0x3a6fd8, 0x2f2f2f, 0xf2c14e, 0xff8fb3];
const BALLOON = [0xff4d6d, 0xffd23f, 0x3bceac, 0x5e8bff, 0xb86bff];
const PERSON_SCALE = 1.15;

const cpart = (geo, hex) => prep(geo, c => c.setHex(hex));
function pBox(w, h, d, x, y, z, hex) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return cpart(g, hex); }
function pDod(r, x, y, z, hex, sx = 1, sy = 1, sz = 1) { const g = new THREE.DodecahedronGeometry(r, 0); g.scale(sx, sy, sz); g.translate(x, y, z); return cpart(g, hex); }
function pCyl(rt, rb, h, seg, x, y, z, hex, sz = 1) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.scale(1, 1, sz); g.translate(x, y, z); return cpart(g, hex); }
function pMesh(parts, parent, cast) {
  const m = new THREE.Mesh(mergeGeometries(parts), personMat);
  m.castShadow = cast; parent.add(m); return m;
}
function hairParts(style, hc) {
  const P = [];
  const base = () => P.push(pDod(0.14, 0, 0.215, -0.02, hc, 1, 0.55, 1.02), pBox(0.23, 0.17, 0.07, 0, 0.15, -0.085, hc));
  switch (style) {
    case 'short': base(); break;
    case 'spiky': base();
      for (let i = 0; i < 5; i++) { const g = new THREE.ConeGeometry(0.04, 0.1, 4); g.rotateZ(-(i - 2) * 0.35); g.translate((i - 2) * 0.045, 0.29, -0.01); P.push(cpart(g, hc)); }
      break;
    case 'long': base(); P.push(pBox(0.27, 0.34, 0.08, 0, 0.06, -0.095, hc), pBox(0.05, 0.24, 0.1, 0.125, 0.1, -0.01, hc), pBox(0.05, 0.24, 0.1, -0.125, 0.1, -0.01, hc)); break;
    case 'bob': base(); P.push(pBox(0.05, 0.15, 0.11, 0.125, 0.13, -0.01, hc), pBox(0.05, 0.15, 0.11, -0.125, 0.13, -0.01, hc), pBox(0.26, 0.17, 0.07, 0, 0.12, -0.1, hc)); break;
    case 'ponytail': base(); { const g = new THREE.CylinderGeometry(0.05, 0.02, 0.24, 5); g.rotateX(0.35); g.translate(0, 0.11, -0.16); P.push(cpart(g, hc)); } break;
    case 'bun': base(); P.push(pDod(0.065, 0, 0.3, -0.07, hc)); break;
    case 'pigtails': base(); P.push(pDod(0.055, 0.15, 0.15, -0.03, hc), pDod(0.055, -0.15, 0.15, -0.03, hc)); break;
    case 'afro': P.push(pDod(0.17, 0, 0.21, -0.06, hc, 1.05, 0.85, 1)); break;
    case 'bald': P.push(pBox(0.03, 0.08, 0.14, 0.125, 0.14, -0.02, hc), pBox(0.03, 0.08, 0.14, -0.125, 0.14, -0.02, hc), pBox(0.22, 0.08, 0.04, 0, 0.14, -0.115, hc)); break;
  }
  return P;
}
function hatParts(type, hc) {
  switch (type) {
    case 'cap': return [pCyl(0.135, 0.145, 0.09, 8, 0, 0.255, -0.01, hc), pBox(0.17, 0.015, 0.11, 0, 0.22, 0.12, hc)];
    case 'sunhat': return [pCyl(0.26, 0.26, 0.015, 10, 0, 0.235, 0, hc), pCyl(0.11, 0.135, 0.11, 8, 0, 0.29, 0, hc), pCyl(0.138, 0.138, 0.03, 8, 0, 0.255, 0, 0x3a3a3a)];
    case 'fedora': return [pCyl(0.2, 0.2, 0.015, 8, 0, 0.245, 0, hc), pCyl(0.105, 0.13, 0.13, 6, 0, 0.31, 0, hc), pCyl(0.132, 0.132, 0.03, 6, 0, 0.265, 0, 0x222222)];
    case 'beanie': return [pDod(0.145, 0, 0.23, -0.02, hc, 1, 0.75, 1), pDod(0.04, 0, 0.34, -0.01, 0xffffff)];
  }
  return [];
}
function wpick(w) {
  let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return Object.keys(w)[0];
}
function makePerson(kind) {
  const kid = kind === 'boy' || kind === 'girl';
  const elder = kind === 'oldman' || kind === 'oldwoman';
  const female = kind === 'woman' || kind === 'girl' || kind === 'oldwoman';
  const skin = pick(SKIN), hair = elder ? pick(GRAY) : pick(HAIR);
  const top = pick(TOPS), bottom = pick(BOTTOMS), shoe = pick(SHOES);
  const skirt = female && Math.random() < (kind === 'girl' ? 0.7 : 0.5);
  const shorts = !skirt && Math.random() < (kid ? 0.6 : 0.3);
  const H = (kid ? rnd(0.6, 0.72) : elder ? rnd(0.86, 0.94) : female ? rnd(0.9, 0.98) : rnd(0.97, 1.06)) * PERSON_SCALE;
  const root = new THREE.Group();
  root.scale.set(H * (elder ? 1.05 : rnd(0.92, 1.12)), H, H);

  const L = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.08;
    if (skirt) L.push(pBox(0.1, 0.62, 0.11, x, 0.31, 0, skin));
    else if (shorts) L.push(pBox(0.12, 0.34, 0.13, x, 0.65, 0, bottom), pBox(0.1, 0.48, 0.11, x, 0.24, 0, skin));
    else L.push(pBox(0.12, 0.82, 0.13, x, 0.41, 0, bottom));
    L.push(pBox(0.13, 0.07, 0.2, x, 0.035, 0.03, shoe));
  }
  if (skirt) L.push(pCyl(0.15, 0.25, 0.36, 8, 0, 0.68, 0, bottom, 0.75));
  pMesh(L, root, true);

  const upper = new THREE.Group(); upper.position.y = 0.82; root.add(upper);
  const T = [pBox(0.38, 0.6, 0.22, 0, 0.3, 0, top), pCyl(0.05, 0.05, 0.08, 6, 0, 0.62, 0, skin)];
  if (!kid && Math.random() < 0.25) T.push(pBox(0.3, 0.36, 0.1, 0, 0.32, -0.15, pick(TOPS)));
  pMesh(T, upper, true);

  const head = new THREE.Group(); head.position.y = 0.64; head.scale.setScalar(kid ? 1.3 : 1); upper.add(head);
  const Hd = [
    pBox(0.22, 0.24, 0.22, 0, 0.13, 0, skin),
    pBox(0.035, 0.035, 0.01, 0.05, 0.15, 0.112, 0x1a1a1a), pBox(0.035, 0.035, 0.01, -0.05, 0.15, 0.112, 0x1a1a1a),
    pBox(0.06, 0.02, 0.01, 0, 0.07, 0.112, 0xb8574f),
  ];
  const styles = { man: ['short', 'spiky', 'short', 'bald', 'afro'], woman: ['long', 'bob', 'ponytail', 'bun', 'long'],
    boy: ['short', 'spiky'], girl: ['pigtails', 'ponytail', 'bob'], oldman: ['bald', 'short'], oldwoman: ['bun', 'bob'] };
  Hd.push(...hairParts(pick(styles[kind]), hair));
  if (Math.random() < 0.3) {
    const hats = { man: ['cap', 'fedora'], woman: ['sunhat'], boy: ['cap', 'beanie'], girl: ['sunhat', 'beanie'], oldman: ['fedora'], oldwoman: ['sunhat'] };
    Hd.push(...hatParts(pick(hats[kind]), pick(HATC)));
  }
  if (elder && Math.random() < 0.7) Hd.push(pBox(0.2, 0.02, 0.01, 0, 0.15, 0.12, 0x333333));
  if (kind === 'oldman' && Math.random() < 0.4) Hd.push(pBox(0.16, 0.07, 0.03, 0, 0.04, 0.11, hair));
  pMesh(Hd, head, true);

  const role = kid ? wpick({ jump: 0.5, cheer: 0.3, clap: 0.2 })
    : elder ? wpick({ clap: 0.7, photo: 0.3 })
    : wpick({ clap: 0.3, cheer: 0.22, photo: 0.33, point: 0.08, jump: 0.07 });

  const arms = [];
  for (const sx of [1, -1]) {
    const g = new THREE.Group(); g.position.set(sx * 0.235, 0.56, 0); upper.add(g);
    const A = [pBox(0.1, 0.32, 0.11, 0, -0.15, 0, top), pBox(0.085, 0.3, 0.095, 0, -0.43, 0, skin), pBox(0.09, 0.09, 0.09, 0, -0.6, 0, skin)];
    if (sx === 1 && role === 'photo') A.push(pBox(0.075, 0.14, 0.016, 0, -0.64, 0.06, 0x222222));
    pMesh(A, g, true);
    arms.push(g);
  }
  if (kid && Math.random() < 0.3) {
    pMesh([pCyl(0.006, 0.006, 1.0, 3, -0.32, 1.1, 0.05, 0xeeeeee), pDod(0.17, -0.32, 1.7, 0.05, pick(BALLOON), 1, 1.2, 1)], root, false);
  }
  return {
    root, upper, head, arms, kid, elder, role,
    phone: role === 'photo' ? new V3(0, -0.64, 0.08) : null,
    e: 0, phase: rnd(0, 6.28), speed: rnd(0.85, 1.2), delay: rnd(0.15, 0.6),
    jumpH: kid ? 0.32 : elder ? 0 : 0.2, sway: rnd(0, 6.28)
  };
}

export { BALLOON, BOTTOMS, GRAY, HAIR, HATC, PERSON_SCALE, SHOES, SKIN, TOPS, buildSharkGeometry, cpart, hairParts, hatParts, makePerson, pBox, pCyl, pDod, pMesh, personMat, wpick };
