import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BALLOON, BOTTOMS, GRAY, HAIR, HATC, PERSON_SCALE, SHOES, SKIN, TOPS, buildSharkGeometry, cpart, hairParts, hatParts, makePerson, pBox, pCyl, pDod, pMesh, personMat, wpick } from './models.js';

const V3 = THREE.Vector3, MU = THREE.MathUtils;
const G = 9.8, SHARK_SCALE = 1.2, MOUTH_LOCAL = new V3(1.85, -0.02, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const $ = (id) => document.getElementById(id);

// ===== JUICE / 에셋 폴백 헬퍼 =====
function juiceTap(el) { if (!el) return; el.classList.remove('squash'); void el.offsetWidth; el.classList.add('squash'); }
function fitText(el, minScale = 0.6) {
  if (!el || !el.parentElement) return;
  el.style.transform = 'scaleX(1)';
  const avail = el.parentElement.clientWidth - parseFloat(getComputedStyle(el.parentElement).paddingLeft || 0) - parseFloat(getComputedStyle(el.parentElement).paddingRight || 0);
  const need = el.scrollWidth;
  if (need > avail && need > 0) el.style.transform = 'scaleX(' + Math.max(minScale, avail / need).toFixed(3) + ')';
}

// ===== 수로 치수 / 카메라 / 렌더러 (원본 유지) =====
const HL = 240, W2 = 6, FRONT = W2, FLOOR = -8, TOP = 1.5, WT = 1;
const GROUND_Y = TOP + 0.05;
const BG = 0xcfe6f2;
const MIN_A = 9 / 18, MAX_A = 9 / 16, FOV = 42;
const CAM_PITCH = MU.degToRad(25);
const CAM_TARGET = new V3(0, -1.3, -0.5);
const ANCHOR = 0.27;
const VIEW_HW = 9.6, VIEW_UP = 9.3, VIEW_DN = 7.6;
const PLATE_RECTS = [
  { left: 0.1, top: 0.035, right: 0.325, bottom: 0.108 },
  { left: 0.385, top: 0.035, right: 0.615, bottom: 0.108 },
  { left: 0.675, top: 0.035, right: 0.9, bottom: 0.108 },
];


const app = $('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '0';
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 70, 220);
const camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 0.1, 1000);

function layout() {
  const W = innerWidth, H = innerHeight;
  let w = W, h = H;
  if (W / H > MAX_A) w = Math.round(H * MAX_A);
  else if (W / H < MIN_A) h = Math.round(W / MIN_A);
  app.style.width = w + 'px'; app.style.height = h + 'px';
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const tv = Math.tan(MU.degToRad(FOV / 2)), th = tv * camera.aspect;
  const dist = Math.max(VIEW_HW / th, VIEW_UP / (2 * ANCHOR * tv), VIEW_DN / (2 * (0.5 - ANCHOR) * tv));
  camera.position.set(CAM_TARGET.x, CAM_TARGET.y + Math.sin(CAM_PITCH) * dist, CAM_TARGET.z + Math.cos(CAM_PITCH) * dist);
  camera.lookAt(CAM_TARGET);
  camera.userData.baseDist = dist;
  camera.setViewOffset(w, h, 0, (0.5 - ANCHOR) * h, w, h);
  scene.fog.near = dist + 30; scene.fog.far = dist + 190;
  sizeUiCanvas();
  layoutConsole();
}

scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x6b7a5e, 1.25));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
sun.position.set(-16, 40, 20);
sun.target.position.set(0, FLOOR, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 120 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const uTime = { value: 0 };
function addWaterFX(mat, caustic = 0) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWP;\nuniform float uTime;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `
      float inW = step(vWP.y, 0.0) * step(vWP.z, ${(FRONT - 0.03).toFixed(2)});
      vec2 cp = vec2(vWP.x, vWP.z + vWP.y * 0.9);
      float cs = sin(cp.x * 1.5 + uTime * 1.3) + sin(cp.y * 1.9 - uTime * 1.1) + sin((cp.x + cp.y) * 1.1 + uTime * 0.7) + sin((cp.x - cp.y) * 1.7 - uTime * 1.5);
      cs = max(0.0, cs * 0.25); cs = floor(cs * cs * 5.0) / 5.0;
      gl_FragColor.rgb += vec3(0.7, 0.95, 1.0) * cs * ${caustic.toFixed(3)} * inW;
      float df = inW * clamp(0.12 - vWP.y * 0.065, 0.0, 0.75);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.05, 0.33, 0.5), df);
      #include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => 'wfx' + caustic;
  return mat;
}

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
function addMesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  scene.add(m);
  return m;
}
const lam = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// ===== 콘크리트 수로 / 지면 / 물 / 소품 (원본 그대로) =====
const C_CONC = new THREE.Color(0xb3ada2), C_CUT = new THREE.Color(0x8e8981);
const C_WET = new THREE.Color(0x8f8d83), C_ALGAE = new THREE.Color(0x6f8a6a);
function concreteColor(c, x, y, z) {
  if (z > FRONT - 0.01) { c.copy(C_CUT); return; }
  c.copy(C_CONC);
  if (y < -0.15) c.lerp(C_ALGAE, 0.25 + Math.min(0.2, -y * 0.02));
  else if (y < 0.55) c.copy(C_WET);
}
const concMat = addWaterFX(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0.3);
{
  const h = TOP + 0.3 - (FLOOR - 1);
  const wall = new THREE.BoxGeometry(HL * 2, h, WT, 240, 18, 1);
  wall.translate(0, (FLOOR - 1) + h / 2, -W2 - WT / 2);
  addMesh(prep(wall, concreteColor), concMat);
  const slab = new THREE.BoxGeometry(HL * 2, 1, W2 * 2 + WT, 240, 1, 13);
  slab.translate(0, FLOOR - 0.5, (FRONT - W2 - WT) / 2);
  addMesh(prep(slab, concreteColor), concMat);
  const joints = [], jc = c => c.setHex(0x6a675f);
  for (let x = -64; x <= 64; x += 8) {
    const a = new THREE.BoxGeometry(0.1, TOP + 0.3 - FLOOR, 0.04);
    a.translate(x, (TOP + 0.3 + FLOOR) / 2, -W2 + 0.01); joints.push(prep(a, jc));
    const b = new THREE.BoxGeometry(0.1, 0.03, W2 * 2 - 0.1);
    b.translate(x, FLOOR + 0.01, -0.05); joints.push(prep(b, jc));
  }
  addMesh(mergeGeometries(joints), concMat, false, true);
  const steel = addWaterFX(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0.2);
  const pipe = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 10);
  pipe.rotateX(Math.PI / 2); pipe.translate(-4, -3.4, -W2 + 0.2);
  const hole = new THREE.CircleGeometry(0.58, 10); hole.translate(-4, -3.4, -W2 + 0.46);
  addMesh(mergeGeometries([prep(pipe, c => c.setHex(0x8c877d)), prep(hole, c => c.setHex(0x1b2226))]), steel);
  const lad = [], lc = c => c.setHex(0x6d7a84);
  const lz = -W2 + 0.3, ly0 = FLOOR + 0.5, ly1 = TOP + 0.7, LX = 5;
  for (const dx of [-0.35, 0.35]) {
    const r = new THREE.BoxGeometry(0.08, ly1 - ly0, 0.08);
    r.translate(LX + dx, (ly0 + ly1) / 2, lz); lad.push(prep(r, lc));
    for (const sy of [ly0 + 0.5, -2, TOP - 0.2]) { const s = new THREE.BoxGeometry(0.06, 0.06, 0.3); s.translate(LX + dx, sy, lz - 0.15); lad.push(prep(s, lc)); }
  }
  for (let y = FLOOR + 1; y < TOP + 0.4; y += 0.6) { const r = new THREE.BoxGeometry(0.7, 0.06, 0.06); r.translate(LX, y, lz); lad.push(prep(r, lc)); }
  addMesh(mergeGeometries(lad), steel);
}
{
  const walk = new THREE.BoxGeometry(HL * 2, 0.4, 6, 240, 1, 3);
  walk.translate(0, TOP - 0.15, -W2 - WT - 3);
  addMesh(prep(walk, c => c.setHex(0xc4bdae)), lam, false, true);
  const grass = new THREE.PlaneGeometry(HL * 2 + 200, 320, 160, 64);
  grass.rotateX(-Math.PI / 2); grass.translate(0, TOP, -13 - 160);
  const gp = grass.attributes.position;
  for (let i = 0; i < gp.count; i++) if (gp.getZ(i) < -14) gp.setY(i, TOP + (Math.random() - 0.5) * 0.35);
  const gA = new THREE.Color(0x7fb35a), gB = new THREE.Color(0x5f9a48);
  addMesh(prep(grass, c => c.copy(gA).lerp(gB, Math.random())), lam, false, true);
  const rail = [], rc = c => c.setHex(0x5d6b75), rz = -W2 - WT - 0.35;
  for (let x = -60; x <= 60; x += 3) { const p = new THREE.BoxGeometry(0.12, 1.1, 0.12); p.translate(x, TOP + 0.6, rz); rail.push(prep(p, rc)); }
  for (const y of [TOP + 0.65, TOP + 1.12]) { const r = new THREE.BoxGeometry(HL * 2, 0.08, 0.08); r.translate(0, y, rz); rail.push(prep(r, rc)); }
  addMesh(mergeGeometries(rail), lam);
  const tp = [], greens = [0x5e9e4a, 0x4f8c40, 0x76b257, 0x3f7a3a];
  for (let i = 0; i < 50; i++) {
    const x = (Math.random() - 0.5) * 170, z = -18 - Math.random() * 85;
    const s = 0.8 + Math.random() * 0.8, gc = greens[i % 4];
    const tr = new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 2 * s, 5);
    tr.translate(x, TOP + s, z); tp.push(prep(tr, c => c.setHex(0x7a5a3d)));
    if (Math.random() < 0.5) {
      const a = new THREE.IcosahedronGeometry(1.7 * s, 0); a.scale(1, 1.15, 1); a.translate(x, TOP + 2.7 * s, z);
      const b = new THREE.IcosahedronGeometry(1.1 * s, 0); b.translate(x + 0.6 * s, TOP + 3.7 * s, z + 0.3);
      tp.push(prep(a, c => c.setHex(gc)), prep(b, c => c.setHex(gc)));
    } else {
      for (let k = 0; k < 3; k++) { const cg = new THREE.ConeGeometry((1.7 - k * 0.45) * s, 1.8 * s, 6); cg.translate(x, TOP + (2.2 + k * 1.0) * s, z); tp.push(prep(cg, c => c.setHex(gc))); }
    }
  }
  for (let i = 0; i < 40; i++) {
    const r = 0.5 + Math.random() * 0.6;
    const b = new THREE.IcosahedronGeometry(r, 0); b.scale(1.3, 0.75, 1);
    b.translate((Math.random() - 0.5) * 120, TOP + r * 0.4, -14 - Math.random() * 3);
    tp.push(prep(b, c => c.setHex(greens[i % 4])));
  }
  addMesh(mergeGeometries(tp), lam);
  const top = FLOOR - 1, bot = -80, sh = top - bot, hw = (HL * 2 + 200) / 2;
  const soil = new THREE.PlaneGeometry(hw * 2, sh, 170, 22);
  const sp = soil.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i);
    if (y < sh / 2 - 0.01 && y > -sh / 2 + 0.01 && Math.abs(x) < hw - 0.01) { sp.setX(i, x + (Math.random() - 0.5) * 1.6); sp.setY(i, y + (Math.random() - 0.5) * 1.2); }
  }
  soil.translate(0, top - sh / 2, FRONT);
  const bands = [0x8a6a4a, 0x7a5a3d, 0x956f4b].map(h => new THREE.Color(h)), gravel = new THREE.Color(0x9a8f7e);
  addMesh(prep(soil, (c, x, y) => { const d = top - y; if (d < 1.6) { c.copy(gravel); return; } c.copy(bands[Math.floor((d + Math.sin(x * 0.15) * 0.9) / 3.5) % 3]).multiplyScalar(Math.max(0.55, 1 - d * 0.012)); }), lam, false, false);
}
function waveY(x, z, t) { return Math.sin(x * 0.2 + t * 0.9) * 0.24 + Math.sin(z * 0.35 + x * 0.05 + t * 1.1) * 0.16 + Math.sin((x + z) * 0.45 + t * 1.7) * 0.08; }
const NX = HL * 2;
const surfGeo = new THREE.PlaneGeometry(HL * 2, W2 * 2, NX, 12);
surfGeo.rotateX(-Math.PI / 2);
const surf = new THREE.Mesh(surfGeo, new THREE.MeshPhongMaterial({ color: 0x2a9ad6, specular: 0xc8f0ff, shininess: 80, flatShading: true, transparent: true, opacity: 0.62, depthWrite: false }));
surf.renderOrder = 2; surf.frustumCulled = false; scene.add(surf);
const FR = 8, frontGeo = new THREE.BufferGeometry();
const FPOS = new Float32Array((NX + 1) * (FR + 1) * 3);
{
  const FCOL = new Float32Array(FPOS.length);
  const cTop = new THREE.Color(0x46b4e0), cBot = new THREE.Color(0x0b3e5e), cc = new THREE.Color();
  for (let r = 0; r <= FR; r++) { cc.copy(cBot).lerp(cTop, Math.pow(r / FR, 1.4)); for (let i = 0; i <= NX; i++) { const k = (r * (NX + 1) + i) * 3; FPOS[k] = -HL + i; FPOS[k + 1] = FLOOR; FPOS[k + 2] = FRONT; FCOL[k] = cc.r; FCOL[k + 1] = cc.g; FCOL[k + 2] = cc.b; } }
  const idx = [];
  for (let r = 0; r < FR; r++) for (let i = 0; i < NX; i++) { const a = r * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  frontGeo.setIndex(idx);
  frontGeo.setAttribute('position', new THREE.BufferAttribute(FPOS, 3));
  frontGeo.setAttribute('color', new THREE.BufferAttribute(FCOL, 3));
}
const front = new THREE.Mesh(frontGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
front.renderOrder = 2; front.frustumCulled = false; scene.add(front);
const ribGeo = new THREE.BufferGeometry(), RPOS = new Float32Array((NX + 1) * 2 * 3);
{
  for (let r = 0; r < 2; r++) for (let i = 0; i <= NX; i++) { const k = (r * (NX + 1) + i) * 3; RPOS[k] = -HL + i; RPOS[k + 2] = FRONT + 0.01; }
  const idx = [];
  for (let i = 0; i < NX; i++) { const a = i, b = i + 1, c = i + NX + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  ribGeo.setIndex(idx);
  ribGeo.setAttribute('position', new THREE.BufferAttribute(RPOS, 3));
}
const rib = new THREE.Mesh(ribGeo, new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
rib.renderOrder = 3; rib.frustumCulled = false; scene.add(rib);
function updateWater(t) {
  const sp = surfGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setY(i, waveY(sp.getX(i), sp.getZ(i), t));
  sp.needsUpdate = true;
  for (let i = 0; i <= NX; i++) { const top = waveY(-HL + i, FRONT, t); for (let r = 0; r <= FR; r++) FPOS[(r * (NX + 1) + i) * 3 + 1] = FLOOR + (top - FLOOR) * r / FR; RPOS[i * 3 + 1] = top - 0.1; RPOS[(NX + 1 + i) * 3 + 1] = top + 0.015; }
  frontGeo.attributes.position.needsUpdate = true;
  ribGeo.attributes.position.needsUpdate = true;
}
{
  const rockMat = addWaterFX(new THREE.MeshLambertMaterial({ color: 0x7d857f, flatShading: true }), 0.3);
  for (let i = 0; i < 45; i++) { const r = 0.15 + Math.random() * 0.4; const m = addMesh(new THREE.DodecahedronGeometry(r, 0), rockMat); m.position.set((Math.random() - 0.5) * 40, FLOOR + r * 0.3, -5.6 + Math.random() * 10.4); m.scale.set(1 + Math.random() * 0.5, 0.6 + Math.random() * 0.4, 1 + Math.random() * 0.5); m.rotation.set(Math.random(), Math.random() * 6, Math.random()); }
}
const tufts = [];
{
  const mats = [0x4f8f4a, 0x3f7a42, 0x66a457].map(c => addWaterFX(new THREE.MeshLambertMaterial({ color: c, flatShading: true }), 0.2));
  for (let i = 0; i < 40; i++) { const h = 0.6 + Math.random() * 1.4; const g = new THREE.ConeGeometry(0.18 + Math.random() * 0.12, h, 4); g.translate(0, h / 2, 0); const m = addMesh(g, mats[i % 3], false, true); m.position.set((Math.random() - 0.5) * 40, FLOOR, i < 28 ? -5.8 + Math.random() * 0.9 : -4 + Math.random() * 8.5); m.userData.phase = Math.random() * 6.28; tufts.push(m); }
}
const PIPE = new V3(-4, -3.4, -W2 + 0.5), bubbles = [];
function resetBubble(b) { if (b.userData.pipe) b.position.set(PIPE.x + (Math.random() - 0.5) * 0.6, PIPE.y + (Math.random() - 0.5) * 0.5, PIPE.z + Math.random() * 0.6); else b.position.set((Math.random() - 0.5) * 30, FLOOR + 0.2, -5 + Math.random() * 10); }
{
  const mat = new THREE.MeshPhongMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.6, flatShading: true });
  for (let i = 0; i < 70; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05 + Math.random() * 0.09, 0), mat); b.userData = { speed: 0.7 + Math.random() * 0.9, pipe: i < 25 }; resetBubble(b); b.position.y += Math.random() * (0 - b.position.y) * 0.95; scene.add(b); bubbles.push(b); }
}
const shafts = [];
for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(1.2 + Math.random() * 0.9, 8.4, 7, 1, true), new THREE.MeshBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); s.position.set(-12 + i * 5 + Math.random() * 2, -4.2, (Math.random() - 0.5) * 4); s.rotation.z = 0.18; s.userData.phase = Math.random() * 6.28; s.renderOrder = 1; scene.add(s); shafts.push(s); }

// ===== 상어 메쉬 / 사람 / 관중 (원본 유지) =====
const { geo: sharkGeo, jawMask } = buildSharkGeometry();
const basePos = new Float32Array(sharkGeo.attributes.position.array);
const sharkMesh = new THREE.Mesh(sharkGeo, addWaterFX(new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, shininess: 25 }), 0.15));
sharkMesh.frustumCulled = false; sharkMesh.castShadow = true;
const shark = new THREE.Group();
shark.add(sharkMesh); shark.scale.setScalar(SHARK_SCALE); shark.rotation.order = 'YZX'; scene.add(shark);
let swimAmp = 0.32, swimPhase = 0, jaw = 0;
function bendZ(x, phase) { const w = Math.pow(Math.max(0, (1.9 - x) / 4.5), 1.8); return Math.sin(x * 1.5 - phase) * swimAmp * w; }
const JAW_PIVOT_X = 0.72;
function deformShark(phase) {
  const pos = sharkGeo.attributes.position.array, ca = Math.cos(jaw), sa = Math.sin(jaw);
  for (let i = 0, v = 0; i < pos.length; i += 3, v++) { const x0 = basePos[i], y0 = basePos[i + 1], z0 = basePos[i + 2]; let x = x0, y = y0; if (jawMask[v]) { const dx = x0 - JAW_PIVOT_X; x = JAW_PIVOT_X + dx * ca + y0 * sa; y = -dx * sa + y0 * ca; } pos[i] = x; pos[i + 1] = y; pos[i + 2] = z0 + bendZ(x0, phase); }
  sharkGeo.attributes.position.needsUpdate = true;
}
const people = [];
{
  const kinds = ['man', 'woman', 'man', 'woman', 'boy', 'girl', 'oldman', 'oldwoman', 'man', 'woman', 'boy', 'girl'];
  const spots = [];
  for (let i = 0; i < 46; i++) { let x, z, ok, tries = 0; do { x = rnd(-11.5, 11.5); z = rnd(-11.8, -7.8); ok = spots.every(s => Math.hypot(s.x - x, (s.z - z) * 1.3) > 0.62); } while (!ok && ++tries < 40); if (ok) spots.push({ x, z }); }
  for (const s of spots) { let kind = pick(kinds); if (s.z > -8.7 && Math.random() < 0.5) kind = pick(['boy', 'girl']); const p = makePerson(kind); p.root.position.set(s.x, GROUND_Y, s.z); p.root.rotation.y = Math.atan2(-s.x, 2 - s.z) * 0.5; scene.add(p.root); people.push(p); p.baseScale = p.root.scale.clone(); p.root.visible = false; }
}
const growing = [];
let crowdShown = 0, crowdBooted = false;
function crowdTarget() { const tot = beatCount(); return Math.min(people.length, 3 + Math.round(Math.min(S.beat, tot) / tot * (people.length - 3))); }
function syncCrowd() {
  const n = crowdTarget();
  for (let i = 0; i < people.length; i++) { const p = people[i], vis = i < n; if (vis && !p.root.visible && !crowdBooted) { p.root.visible = true; p.root.scale.set(0.001, 0.001, 0.001); growing.push({ p, t: 0, sx: p.baseScale.x, sy: p.baseScale.y, sz: p.baseScale.z }); } else p.root.visible = vis; }
  if (crowdBooted && n > crowdShown) toast(`소문이 퍼져 구경꾼이 늘어났어요! (+${n - crowdShown}명)`);
  crowdShown = n; crowdBooted = true;
}
const crowd = { hype: 0, target: 0.08, hold: 0, burst: 0 };
function excite(level, hold) { if (level >= crowd.target || crowd.hold <= 0) { crowd.target = Math.max(level, crowd.hold > 0 ? crowd.target : 0); crowd.hold = Math.max(crowd.hold, hold); } }
function updateCrowd(dt) { crowd.hold -= dt; if (crowd.hold <= 0) crowd.target += (0.08 - crowd.target) * Math.min(1, dt * 0.8); crowd.hype += (crowd.target - crowd.hype) * Math.min(1, dt * (crowd.target > crowd.hype ? 4 : 0.8)); crowd.burst = Math.max(0, crowd.burst - dt * 0.3); }
const _pp = new V3();
function animPerson(p, dt, t) {
  p.e += (crowd.hype - p.e) * Math.min(1, dt * (crowd.hype > p.e ? 1 / p.delay : 0.7));
  const e = p.e, a = MU.smoothstep(e, 0.22, 0.5);
  p.phase += dt * (5 + e * 9) * p.speed;
  const s = Math.sin(p.phase);
  const ly = MU.clamp(Math.atan2(sPos.x - p.root.position.x, sPos.z - p.root.position.z) - p.root.rotation.y, -1, 1);
  p.head.rotation.y += (ly - p.head.rotation.y) * Math.min(1, dt * 3);
  p.head.rotation.x = 0.3 - a * 0.25 + Math.sin(t * 1.3 + p.sway) * 0.03;
  p.upper.rotation.x = (p.elder ? 0.16 : 0.04) + a * 0.12;
  p.upper.rotation.z = Math.sin(t * 0.8 + p.sway) * 0.03 * (1 - a);
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? 1 : -1, arm = p.arms[i];
    const irx = (p.role === 'photo' && i === 0) ? -0.6 : 0, irz = sx * 0.08;
    let rx = irx, rz = irz;
    switch (p.role) {
      case 'clap': rx = -1.25; rz = -sx * (0.1 + 0.24 * (0.5 + 0.5 * Math.sin(p.phase * 1.6))); break;
      case 'cheer': case 'jump': rx = -2.7 + 0.2 * s * sx; rz = sx * (0.35 + 0.25 * Math.sin(p.phase * 1.3 + sx)); break;
      case 'photo': rx = -1.5; rz = -sx * 0.32; break;
      case 'point': if (i === 0) { rx = -1.7; rz = 0; } else { rx = -2.6; rz = -0.4 + 0.3 * s; } break;
    }
    arm.rotation.x = MU.lerp(irx, rx, a); arm.rotation.z = MU.lerp(irz, rz, a);
  }
  let y = 0;
  if (!p.elder) { const jumper = (p.role === 'jump' || p.role === 'cheer') ? 1 : 0.35 * MU.smoothstep(crowd.burst, 0.2, 0.6); y = p.jumpH * jumper * a * Math.abs(Math.sin(p.phase * 0.7)); }
  p.root.position.y = GROUND_Y + y;
  if (p.phone) { const rate = (e > 0.35 ? e * 1.6 : 0) + crowd.burst * 4; if (Math.random() < rate * dt) { _pp.copy(p.phone); p.arms[0].localToWorld(_pp); spawnFlash(_pp); } }
}

// ===== 물보라 / 파문 / 플래시 (원본 유지) =====
const foamGeo = new THREE.TetrahedronGeometry(0.14, 0);
const foamMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const foam = [];
for (let i = 0; i < 500; i++) { const m = new THREE.Mesh(foamGeo, foamMat); m.visible = false; scene.add(m); foam.push({ m, life: 0, max: 1, size: 1, v: new V3() }); }
let foamIdx = 0;
function spawnFoam(x, y, z, n, o = {}) {
  const spread = o.spread ?? 0.4, side = o.side ?? 1.4, upMin = o.upMin ?? 0.8, upMax = o.upMax ?? 2.4;
  const size = o.size ?? 1, lMin = o.lifeMin ?? 0.5, lMax = o.lifeMax ?? 1.1;
  for (let i = 0; i < n; i++) { const f = foam[foamIdx++ % foam.length]; const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread; f.m.visible = true; f.m.position.set(x + Math.cos(a) * r, y, MU.clamp(z + Math.sin(a) * r, -W2 + 0.15, FRONT - 0.15)); const sv = side * (0.4 + Math.random() * 0.6); f.v.set(Math.cos(a) * sv, upMin + Math.random() * (upMax - upMin), Math.sin(a) * sv); if (o.bv) f.v.add(o.bv); f.life = 0; f.max = lMin + Math.random() * (lMax - lMin); f.size = size * (0.6 + Math.random() * 0.8); f.m.rotation.set(Math.random() * 6, Math.random() * 6, 0); }
}
const rippleClip = [new THREE.Plane(new V3(0, 0, -1), FRONT), new THREE.Plane(new V3(0, 0, 1), W2)];
const ripples = [];
for (let i = 0; i < 16; i++) { const g = new THREE.RingGeometry(0.8, 1.15, 18, 1); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: rippleClip })); m.visible = false; m.renderOrder = 3; scene.add(m); ripples.push({ m, life: 0, max: 1.6, grow: 5, active: false }); }
let rippleIdx = 0;
function spawnRipple(x, z, delay = 0, grow = 5) { const r = ripples[rippleIdx++ % ripples.length]; r.m.position.set(x, 0, z); r.life = -delay; r.grow = grow; r.active = true; }
function bigSplash(x, z, p = 1) { const y = waveY(x, z, simT); spawnFoam(x, y, z, Math.floor(50 * p), { spread: 1.3, side: 3.0 * p, upMin: 3, upMax: 8 * p, size: 1.7, lifeMin: 0.9, lifeMax: 1.7 }); spawnFoam(x, y, z, Math.floor(25 * p), { spread: 0.6, side: 1.0, upMin: 6, upMax: 10 * p, size: 1.2, lifeMin: 1.0, lifeMax: 1.8 }); spawnRipple(x, z, 0, 6 * p); spawnRipple(x, z, 0.3, 4.5 * p); spawnRipple(x, z, 0.6, 3 * p); }
const _a = new V3(), _b = new V3(), _tmp = new V3(), _tmp2 = new V3();
function segSplash(aL, bL, t, n) { _a.set(aL[0], aL[1], bendZ(aL[0], swimPhase)); _b.set(bL[0], bL[1], bendZ(bL[0], swimPhase)); shark.localToWorld(_a); shark.localToWorld(_b); const ha = _a.y - waveY(_a.x, _a.z, t), hb = _b.y - waveY(_b.x, _b.z, t); if (ha * hb > 0) return; const s = ha / (ha - hb), px = _a.x + (_b.x - _a.x) * s, pz = _a.z + (_b.z - _a.z) * s; spawnFoam(px, waveY(px, pz, t), pz, n); }
function aboveWater(lx, ly, t) { _tmp2.set(lx, ly, bendZ(lx, swimPhase)); shark.localToWorld(_tmp2); return _tmp2.y - waveY(_tmp2.x, _tmp2.z, t); }
const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,235,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const flashes = [];
for (let i = 0; i < 48; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); s.visible = false; s.renderOrder = 5; scene.add(s); flashes.push({ s, life: 0, max: 0.1 }); }
let flashIdx = 0;
function spawnFlash(pos) { const f = flashes[flashIdx++ % flashes.length]; f.s.position.copy(pos); f.life = 0; f.max = rnd(0.08, 0.16); f.s.visible = true; }
const screenFlash = $('flash');
let screenFlashA = 0;

// ===== 상어 행동 / 먹이 던지기 (원본 유지) =====
const ai = { state: 'deep', timer: 0, dur: 6, targetY: -4.8, k: 0.8, extraTarget: 0, speedTarget: 3.0 };
function setState(s, d) { ai.state = s; ai.timer = 0; ai.dur = d; switch (s) { case 'deep': Object.assign(ai, { targetY: -4.8, k: 0.8, extraTarget: 0, speedTarget: 3.0 }); break; case 'fin': Object.assign(ai, { targetY: -0.95, k: 0.9, extraTarget: 0, speedTarget: 2.6 }); break; case 'tailRise': Object.assign(ai, { targetY: -1.1, k: 1.0, extraTarget: 0, speedTarget: 2.8 }); break; case 'tailDive': Object.assign(ai, { targetY: -6.0, k: 2.5, extraTarget: -0.35, speedTarget: 3.6 }); break; } }
function nextState() { switch (ai.state) { case 'deep': if (Math.random() < 0.55) setState('fin', 9 + Math.random() * 4); else setState('tailRise', 5); break; case 'fin': setState('deep', 6 + Math.random() * 5); break; case 'tailRise': setState('tailDive', 3.0); break; case 'tailDive': setState('deep', 7 + Math.random() * 4); break; } }
setState('deep', 5);
const PA = 5.5, PB = 3.0;
const pathPos = (s) => [PA * Math.sin(s), PB * Math.sin(2 * s)];
const pathDer = (s) => [PA * Math.cos(s), 2 * PB * Math.cos(2 * s)];
let pathS = 0, sharkY = -4.8, vy = 0, speed = 3.0, extraPitch = 0;
let mode = 'path';
let hunt = null, hermite = null, sardine = null, rejoinS = 0;
const sPos = new V3(0, sharkY, 0), sVel = new V3(), prevSPos = sPos.clone();
let headingCur = (() => { const d = pathDer(0); return Math.atan2(-d[1], d[0]); })();
let pitchCur = 0, roll = 0, simT = 0;
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
function hermiteEval(h, u, outP, outV) { const u2 = u * u, u3 = u2 * u; outP.set(0, 0, 0).addScaledVector(h.P0, 2 * u3 - 3 * u2 + 1).addScaledVector(h.V0, (u3 - 2 * u2 + u) * h.D).addScaledVector(h.P1, -2 * u3 + 3 * u2).addScaledVector(h.V1, (u3 - u2) * h.D); outV.set(0, 0, 0).addScaledVector(h.P0, 6 * u2 - 6 * u).addScaledVector(h.V0, (3 * u2 - 4 * u + 1) * h.D).addScaledVector(h.P1, -6 * u2 + 6 * u).addScaledVector(h.V1, (3 * u2 - 2 * u) * h.D).multiplyScalar(1 / h.D); }
function clampBounds(p, v) { const BX = 7.5, BZ = 4.2; if (p.x > BX) { p.x = BX; v.x = Math.min(v.x, 0); } if (p.x < -BX) { p.x = -BX; v.x = Math.max(v.x, 0); } if (p.z > BZ) { p.z = BZ; v.z = Math.min(v.z, 0); } if (p.z < -BZ) { p.z = -BZ; v.z = Math.max(v.z, 0); } if (p.y < FLOOR + 1.2) { p.y = FLOOR + 1.2; v.y = Math.max(v.y, 0); } }
function sharkForward() { return new V3(Math.cos(headingCur), 0, -Math.sin(headingCur)); }
function throwSardine(target, startWorld, fedItem) {
  if (hunt || sardine || (mode !== 'path' && mode !== 'rejoin')) return false;
  const C = new V3(MU.clamp(target.x, -4, 4), 2.8 + Math.random() * 0.8, MU.clamp(target.z, -3, 3));
  const dir = Math.abs(C.x) > 1 ? -Math.sign(C.x) : (Math.sign(C.x - sPos.x) || 1);
  const md = MOUTH_LOCAL.x * SHARK_SCALE, vh = 4.0, margin = 0.8;
  let Cc = C.clone(), vy0 = 0, t1 = 0;
  const solve = (h) => { vy0 = Math.sqrt(2 * G * (h + margin)); t1 = (vy0 - Math.sqrt(Math.max(0, vy0 * vy0 - 2 * G * h))) / G; };
  for (let i = 0; i < 4; i++) { solve(Math.max(Cc.y, 0.3)); Cc = C.clone().addScaledVector(new V3(dir * vh, vy0 - G * t1, 0).normalize(), -md); }
  solve(Math.max(Cc.y, 0.3));
  const E = new V3(Cc.x - dir * vh * t1, 0, Cc.z);
  const VE = new V3(dir * vh, vy0, 0);
  let D = MU.clamp(sPos.distanceTo(E) / 15, 1.2, 1.7);
  let tc = D + t1;
  if (tc < 1.8) { D += 1.8 - tc; tc = 1.8; }
  const V0 = sVel.clone();
  if (V0.length() < 1) V0.copy(sharkForward()).multiplyScalar(3);
  hermite = { P0: sPos.clone(), V0, P1: E, V1: VE, D, t0: simT };
  hunt = { C, E, VE, dashEnd: simT + D, catchT: simT + tc, caught: false, catchAt: 0, reenterT: 0, fedItem: fedItem || null };
  mode = 'dash';
  const P0 = startWorld.clone();
  const SV0 = new V3().subVectors(C, P0); SV0.y += 0.5 * G * tc * tc; SV0.divideScalar(tc);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: outlinedTex(imgOf(fedItem.tech, fedItem.tier)), transparent: true, depthWrite: false }));
  spr.renderOrder = 3; const isz = 0.8 + fedItem.tier * 0.07; spr.scale.set(isz, isz, 1); spr.position.copy(P0); scene.add(spr);
  sardine = { spr, P0, V0: SV0, t0: simT, state: 'fly', eatT: 0 };
  return true;
}
function startRejoin() {
  let best = 0, bd = Infinity;
  for (let i = 0; i < 360; i++) { const s = i / 360 * Math.PI * 2, [x, z] = pathPos(s); const dd = (x - sPos.x) ** 2 + (z - sPos.z) ** 2; if (dd < bd) { bd = dd; best = s; } }
  let s = best, acc = 0;
  while (acc < 6) { const d = pathDer(s); acc += Math.hypot(d[0], d[1]) * 0.01; s += 0.01; }
  const [ex, ez] = pathPos(s), d = pathDer(s), len = Math.hypot(d[0], d[1]);
  const P1 = new V3(ex, -4.5, ez), V1 = new V3(d[0] / len * 3, 0, d[1] / len * 3);
  hermite = { P0: sPos.clone(), V0: sVel.clone(), P1, V1, D: MU.clamp(sPos.distanceTo(P1) / 4.5, 2.5, 6), t0: simT };
  rejoinS = s; hunt = null; mode = 'rejoin';
}
function velAngles(v) { if (v.lengthSq() < 0.09) return [headingCur, pitchCur]; const hz = Math.hypot(v.x, v.z); return [Math.atan2(-v.z, v.x), MU.clamp(Math.atan2(v.y, Math.max(hz, 0.001)), -1.35, 1.35)]; }
function updateShark(dt, t) {
  let tgtH = headingCur, tgtP = pitchCur, kH = 6, kP = 3;
  if (mode === 'path') {
    ai.timer += dt; if (ai.timer > ai.dur) nextState();
    speed += (ai.speedTarget - speed) * Math.min(1, dt * 1.5);
    const d = pathDer(pathS); pathS += speed * dt / Math.hypot(d[0], d[1]);
    const [px, pz] = pathPos(pathS), d2 = pathDer(pathS);
    tgtH = Math.atan2(-d2[1], d2[0]); kH = 20;
    const bob = ai.state === 'fin' ? Math.sin(t * 0.8) * 0.12 : Math.sin(t * 0.3) * 0.5;
    vy += ((ai.targetY + bob - sharkY) * ai.k - vy * 2 * Math.sqrt(ai.k)) * dt;
    sharkY = Math.max(sharkY + vy * dt, FLOOR + 1.3);
    extraPitch += (ai.extraTarget - extraPitch) * Math.min(1, dt * 2);
    tgtP = MU.clamp(Math.atan2(vy, speed) + extraPitch, -1.0, 0.8);
    sPos.set(px, sharkY, pz); sVel.subVectors(sPos, prevSPos).divideScalar(Math.max(dt, 1e-4));
  } else if (mode === 'dash') {
    const u = MU.clamp((t - hermite.t0) / hermite.D, 0, 1); hermiteEval(hermite, u, sPos, sVel); clampBounds(sPos, sVel);
    [tgtH, tgtP] = velAngles(sVel); kH = 8; kP = 7;
    if (u >= 1) { mode = 'air'; bigSplash(hunt.E.x, hunt.E.z, 1.2); }
  } else if (mode === 'air') {
    const tau = t - hunt.dashEnd; sPos.copy(hunt.E).addScaledVector(hunt.VE, tau); sPos.y -= 0.5 * G * tau * tau; sVel.copy(hunt.VE); sVel.y -= G * tau;
    [tgtH, tgtP] = velAngles(sVel); kH = 1000; kP = 1000;
    if (tau < 0.8) { _tmp.set(-2 + Math.random() * 3.5, (Math.random() - 0.5) * 0.4, 0); shark.localToWorld(_tmp); spawnFoam(_tmp.x, _tmp.y, _tmp.z, 2, { spread: 0.1, side: 0.6, upMin: -0.5, upMax: 0.8, size: 0.6, bv: sVel.clone().multiplyScalar(0.4), lifeMin: 0.5, lifeMax: 1.0 }); }
    if (sPos.y < 0 && sVel.y < 0) { mode = 'reenter'; hunt.reenterT = t; bigSplash(sPos.x, sPos.z, 1.4); }
  } else if (mode === 'reenter') {
    const hd = Math.exp(-1.0 * dt); sVel.x *= hd; sVel.z *= hd; sVel.y += (-2.6 * sVel.y + 1.2) * dt;
    const hz = Math.hypot(sVel.x, sVel.z); if (hz < 2.2 && hz > 0.001) { sVel.x *= 2.2 / hz; sVel.z *= 2.2 / hz; }
    sPos.addScaledVector(sVel, dt); clampBounds(sPos, sVel); [tgtH, tgtP] = velAngles(sVel); kH = 5; kP = 5;
    if (t - hunt.reenterT > 1.5) startRejoin();
  } else if (mode === 'rejoin') {
    const u = MU.clamp((t - hermite.t0) / hermite.D, 0, 1); hermiteEval(hermite, u, sPos, sVel); sPos.y = Math.min(sPos.y, -0.8); clampBounds(sPos, sVel); [tgtH, tgtP] = velAngles(sVel); kH = 5; kP = 3;
    if (u >= 1) { mode = 'path'; pathS = rejoinS; sharkY = sPos.y; vy = sVel.y; speed = 3; setState('deep', 5 + Math.random() * 4); }
  }
  prevSPos.copy(sPos);
  const hPrev = headingCur; headingCur = hPrev + wrapA(tgtH - hPrev) * Math.min(1, dt * kH); pitchCur += (tgtP - pitchCur) * Math.min(1, dt * kP);
  const dh = wrapA(headingCur - hPrev); const targetRoll = mode === 'air' ? 0 : MU.clamp(-dh / Math.max(dt, 1e-4) * 0.5, -0.5, 0.5); roll += (targetRoll - roll) * Math.min(1, dt * 3);
  shark.position.copy(sPos); shark.rotation.set(roll, headingCur, pitchCur); shark.updateMatrixWorld();
  let jawT = 0, jawK = 10;
  if (hunt) { if (!hunt.caught) { if (mode === 'air' || (mode === 'dash' && t > hunt.dashEnd - 0.8)) jawT = 0.55; } else { const e = t - hunt.catchAt; if (e < 0.12) { jawT = 0; jawK = 40; } else if (e < 1.1) jawT = 0.1 + 0.1 * Math.sin(e * 18); } }
  jaw += (jawT - jaw) * Math.min(1, dt * jawK);
  const sp = Math.min(sVel.length(), 12); let ampT = 0.32; if (mode === 'dash') ampT = 0.5; else if (mode === 'air') ampT = 0.22; else if (mode === 'path' && ai.state === 'tailDive') ampT = 0.48;
  swimAmp += (ampT - swimAmp) * Math.min(1, dt * 3); swimPhase += dt * (mode === 'air' ? 7 : 2.6 + sp * 0.9); deformShark(swimPhase);
}
function updateSardine(dt, t) {
  if (!sardine) return;
  const m = sardine.spr;
  const isz = () => 0.8 + (hunt && hunt.fedItem ? hunt.fedItem.tier * 0.07 : 0);
  if (sardine.state === 'fly') {
    const tau = t - sardine.t0; m.position.copy(sardine.P0).addScaledVector(sardine.V0, tau); m.position.y -= 0.5 * G * tau * tau;
    const v = sardine.V0.clone(); v.y -= G * tau; m.material.rotation = tau * 6 + Math.sin(t * 20) * 0.2;
    if (hunt && !hunt.caught && mode === 'air') {
      const mouth = shark.localToWorld(MOUTH_LOCAL.clone()); const dist = mouth.distanceTo(m.position);
      if (dist < 0.7 || (t >= hunt.catchT && dist < 3)) {
        hunt.caught = true; hunt.catchAt = t; sardine.state = 'eaten'; sardine.eatT = t; scene.remove(m); shark.add(m); m.position.set(1.55, -0.05, 0);
        const s0 = isz() / SHARK_SCALE; m.scale.set(s0, s0, 1);
        spawnFoam(mouth.x, mouth.y, mouth.z, 14, { spread: 0.3, side: 2, upMin: 0, upMax: 2.5, size: 0.7, bv: sVel.clone().multiplyScalar(0.4) });
        crowd.target = 1; crowd.hold = 0; crowd.burst = 1; excite(1, 5); screenFlashA = 0.35;
        if (window.__onFed) window.__onFed(hunt.fedItem);
      }
    }
    if (sardine.state === 'fly' && v.y < 0 && m.position.y < waveY(m.position.x, m.position.z, t) - 0.1) { if (Math.abs(m.position.z) < W2) { spawnFoam(m.position.x, waveY(m.position.x, m.position.z, t), m.position.z, 10, { size: 0.7 }); spawnRipple(m.position.x, m.position.z, 0, 2); } scene.remove(m); sardine = null; }
  } else if (sardine.state === 'eaten') {
    const e = t - sardine.eatT; m.material.rotation = Math.sin(t * 30) * 0.3;
    if (e > 0.5) { const s0 = Math.max(0.001, isz() / SHARK_SCALE * (1 - (e - 0.5) / 0.4)); m.scale.set(s0, s0, 1); }
    if (e > 0.9) { shark.remove(m); sardine = null; }
  }
}
function worldToScreen(world) { const rect = renderer.domElement.getBoundingClientRect(); const v = world.clone().project(camera); return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height }; }

// ===================================================================
// ===== GAME LOGIC (스테이지 기반) =====
// ===================================================================
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
const SAVE_KEY = 'bukangi_v6';
const MAXT = 8;
const TECHS = {
  fish: { label: '물고기', names: ['멸치', '꽁치', '고등어', '방어', '참치', '연어', '고래상어', '황금상어'] },
  meat: { label: '육고기', names: ['소시지', '치킨너겟', '돈까스', '후라이드치킨', '삼겹살', '갈비', '돼지국밥', '황금스테이크'] },
  crab: { label: '갑각류', names: ['새우', '참게', '꽃게', '대게', '랍스터', '킹크랩', '대왕게', '황금왕게'] },
};
const TECH_KEYS = Object.keys(TECHS);
const imgOf = (tech, tier) => `assets/f_${tech}_${tier}.png`;
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const itemName = (it) => TECHS[it.tech].names[it.tier - 1];

const GEN_NAMES = {
  fish: ['낚시줄','낚싯대','좋은낚싯대','어망','큰어망','양동이','녹색양동이','금빛양동이'],
  crab: ['뜰채','곡괭이','큰곡괭이','통발','큰통발','톱밥상자','녹색톱밥상자','금빛톱밥상자'],
  meat: ['나무상자','얼음상자','아이스박스','간이냉장고','냉장고','냉동고','녹색냉장고','금빛냉장고'],
};
const MAX_GEN = 8;
const BAG_CAP = 9;
const genImg  = (tech, glv) => `assets/g_${tech}_${glv}.png`;
const genName = (tech, glv) => GEN_NAMES[tech][glv - 1];
const genMaxStore = (glv) => 3 + glv;
const genRegenSec = (glv) => Math.max(8, 46 - glv * 5);
const genMaxTier  = (glv) => Math.min(MAXT, 1 + Math.ceil(glv / 2));
const PLATE_COUNT = 3;

const DEF = () => ({
  v: 6, coins: 800, gems: 5, level: 1, xp: 0,
  cells: Array(30).fill(null),
  bag: [],
  plates: [],
  stage: 0, beat: 0, inf: false,
  auto: false, sellMode: false,
  stageLoaded: -1,
  stageStats: { fed: 0, merged: 0, sealsBroken: 0, maxTierMade: 0 },
  earned: 0, totalFed: 0, totalMerged: 0,
});
let S = DEF();
{
  const raw = LS.get(SAVE_KEY);
  if (raw) { try { const d = JSON.parse(raw); if (d && d.v === 6) { S = { ...DEF(), ...d }; if (!Array.isArray(S.cells) || S.cells.length !== 30) S.cells = Array(30).fill(null); if (!Array.isArray(S.bag)) S.bag = []; if (!Array.isArray(S.plates)) S.plates = []; if (!S.stageStats) S.stageStats = { fed: 0, merged: 0, sealsBroken: 0, maxTierMade: 0 }; S.sellMode = false; } } catch (e) { S = DEF(); } }
}

let suppressSave = false;
const save = () => { if (!suppressSave) LS.set(SAVE_KEY, JSON.stringify(S)); };
addEventListener('visibilitychange', () => { if (document.hidden && !suppressSave) save(); });
addEventListener('pagehide', () => { if (!suppressSave) save(); });

// ---- 밸런스 ----
const genBuyCost  = () => Math.round(120 * Math.pow(1.6, (S.bag.length)));
const xpNeed = (l) => Math.round(100 * Math.pow(1.5, l - 1));
const sellVal = (it) => it.kind === 'gen' ? Math.round(30 * Math.pow(it.glv, 1.5)) : Math.round(4 * Math.pow(it.tier, 1.6));
const levelMult = () => 1 + 0.08 * (S.level - 1);

// ---- 보드 헬퍼 ----
const emptyCells = () => { const o = []; for (let i = 0; i < 30; i++) if (!S.cells[i]) o.push(i); return o; };
function countItem(tech, tier) { let n = 0; for (let i = 0; i < 30; i++) { const c = S.cells[i]; if (c && c.kind === 'food' && c.tech === tech && c.tier === tier && !c.sealed) n++; } return n; }

// ===================================================================
// ===== 콘솔(통짜 배경) + 보드 좌표 레이어 =====
// ===================================================================
const CONSOLE_IMG = 'assets/console_bg.png'; // 업로드한 통짜 배경(머지보드+트레이)
const WEB_IMG = 'assets/web.png';            // 256x256 봉인 거미줄 오버레이

const BOARD_RECT = { left: 0.1, top: 0.165, right: 0.9, bottom: 0.765 };
const GRID = { cols: 6, rows: 5 };

const consoleEl = $('console');
const boardCanvas = $('boardCanvas');
const bctx = boardCanvas.getContext('2d');
const overlayEl = $('overlay');          // 버튼 등 DOM 을 얹는 투명 레이어

let conW = 0, conH = 0, conDpr = 1;

function layoutConsole() {
  if (!consoleEl) return;
  const r = consoleEl.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  conDpr = Math.min(devicePixelRatio || 1, 2);
  conW = Math.round(r.width);
  conH = Math.round(r.height);
  boardCanvas.style.width = conW + 'px';
  boardCanvas.style.height = conH + 'px';
  boardCanvas.width = Math.round(conW * conDpr);
  boardCanvas.height = Math.round(conH * conDpr);
  bctx.setTransform(conDpr, 0, 0, conDpr, 0, 0);
  bctx.imageSmoothingEnabled = true;
  layoutButtons();
}

function cellRect(idx) {
  const col = idx % GRID.cols, row = (idx / GRID.cols) | 0;
  const bx = BOARD_RECT.left * conW, by = BOARD_RECT.top * conH;
  const bw = (BOARD_RECT.right - BOARD_RECT.left) * conW;
  const bh = (BOARD_RECT.bottom - BOARD_RECT.top) * conH;
  const cw = bw / GRID.cols, ch = bh / GRID.rows;
  return { x: bx + col * cw, y: by + row * ch, w: cw, h: ch, cx: bx + (col + 0.5) * cw, cy: by + (row + 0.5) * ch };
}

function consoleToApp(px, py) {
  const cr = consoleEl.getBoundingClientRect(), ar = app.getBoundingClientRect();
  return { x: cr.left - ar.left + px, y: cr.top - ar.top + py };
}
function cellCenterApp(idx) { const r = cellRect(idx); return consoleToApp(r.cx, r.cy); }

function hitCell(clientX, clientY) {
  const cr = consoleEl.getBoundingClientRect();
  const px = clientX - cr.left, py = clientY - cr.top;
  const bx = BOARD_RECT.left * conW, by = BOARD_RECT.top * conH;
  const bw = (BOARD_RECT.right - BOARD_RECT.left) * conW;
  const bh = (BOARD_RECT.bottom - BOARD_RECT.top) * conH;
  if (px < bx || px > bx + bw || py < by || py > by + bh) return -1;
  const col = Math.floor((px - bx) / (bw / GRID.cols));
  const row = Math.floor((py - by) / (bh / GRID.rows));
  if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return -1;
  return row * GRID.cols + col;
}

const resv = new Set();
const cellAnim = new Array(30).fill(null);
function repunch(idx, cls) { cellAnim[idx] = { kind: cls, t: 0 }; }
function place(idx, item, punch) { S.cells[idx] = item; if (punch) repunch(idx, 'pop'); }

const imgCache = {}, outlineCache = {}, texCache = {};
function getImg(src) { if (!imgCache[src]) { const i = new Image(); i.src = src; imgCache[src] = i; } return imgCache[src]; }
const texLoader = new THREE.TextureLoader();
function getTex(src) { if (!texCache[src]) { const t = texLoader.load(src); t.colorSpace = THREE.SRGBColorSpace; texCache[src] = t; } return texCache[src]; }
function outlinedTex(src) {
  if (outlineCache[src]) return outlineCache[src];
  const img = getImg(src); if (!(img.complete && img.naturalWidth)) return getTex(src);
  const s = img.naturalWidth; const sil = document.createElement('canvas'); sil.width = sil.height = s;
  const g = sil.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#12324a'; g.fillRect(0, 0, s, s);
  const out = document.createElement('canvas'); out.width = out.height = s; const g2 = out.getContext('2d'); const off = Math.max(3, Math.round(s * 0.024));
  for (const [dx, dy] of [[-off,0],[off,0],[0,-off],[0,off],[-off,-off],[off,-off],[-off,off],[off,off],[0,0]]) g2.drawImage(sil, dx, dy);
  g2.drawImage(img, 0, 0); const tex = new THREE.CanvasTexture(out); tex.colorSpace = THREE.SRGBColorSpace; outlineCache[src] = tex; return tex;
}

const consoleBg = getImg(CONSOLE_IMG);
const webImg = getImg(WEB_IMG);

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawContain(ctx, img, cx, cy, maxW, maxH, alpha = 1) {
  if (!(img.complete && img.naturalWidth)) return;
  const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.globalAlpha = 1;
}
function drawBoard(dt) {
  if (!conW) return;
  bctx.clearRect(0, 0, conW, conH);
  if (consoleBg.complete && consoleBg.naturalWidth) {
    bctx.drawImage(consoleBg, 0, 0, conW, conH);
  }
  for (let i = 0; i < 30; i++) {
    const it = S.cells[i];
    if (!it) continue;
    if (resv.has(i)) continue;
    const r = cellRect(i);
    let sc = 1, rot = 0;
    const an = cellAnim[i];
    if (an) {
      an.t += dt;
      if (an.kind === 'pop') { const k = Math.min(1, an.t / 0.3); sc = 1 + Math.sin(k * Math.PI) * 0.22; }
      else if (an.kind === 'wig') { const k = Math.min(1, an.t / 0.35); rot = Math.sin(k * Math.PI * 3) * 0.12 * (1 - k); }
      if (an.t > 0.4) cellAnim[i] = null;
    }
    const pad = r.w * 0.12;
    const boxW = (r.w - pad) * sc, boxH = (r.h - pad) * sc;
    const src = it.kind === 'gen' ? genImg(it.tech, it.glv) : imgOf(it.tech, it.tier);
    const img = getImg(src);
    bctx.save();
    bctx.translate(r.cx, r.cy);
    if (rot) bctx.rotate(rot);
    if (it.kind === 'food' && it.sealed) {
      drawContain(bctx, img, 0, 0, boxW, boxH, 1);
      drawContain(bctx, webImg, 0, 0, r.w * 0.98, r.h * 0.98, 1);
    } else {
      drawContain(bctx, img, 0, 0, boxW, boxH, 1);
    }
    bctx.restore();

    if (it.kind === 'gen') drawGenOverlay(i, r);
  }
  drawPlates();
}

function drawPlates() {
  for (let pi = 0; pi < S.plates.length; pi++) {
    const p = S.plates[pi]; if (!p) continue;
    const r = plateRect(pi);
    const ready = plateSatisfied(p);
    const n = p.slots.length;
    const gap = r.w * 0.04;
    const slotW = (r.w - gap * (n + 1)) / n;
    const slotH = Math.min(slotW, r.h * 0.9);
    for (let si = 0; si < n; si++) {
      const s = p.slots[si];
      const ok = slotPresent(s);
      const sx = r.x + gap + si * (slotW + gap) + slotW / 2;
      const sy = r.cy;
      const img = getImg(imgOf(s.tech, s.tier));
      bctx.save();
      bctx.translate(sx, sy);
      if (ready) {
        const pulse = 1 + Math.sin(simT * 4) * 0.1;
        bctx.scale(pulse, pulse);
        bctx.shadowColor = 'rgba(255,214,64,0.95)';
        bctx.shadowBlur = slotW * 0.1;
      }
      drawContain(bctx, img, 0, 0, slotW * 0.94, slotH * 0.94, ok ? 1 : 0.4);
      bctx.restore();
      if (ok) {
        const ckx = sx + slotW * 0.32, cky = sy - slotH * 0.32, rad = slotW * 0.17;
        bctx.save();
        bctx.fillStyle = '#39b54a'; bctx.strokeStyle = '#fff'; bctx.lineWidth = Math.max(1.5, rad * 0.22);
        drawRoundRect(bctx, ckx - rad, cky - rad, rad * 2, rad * 2, rad * 0.5); bctx.fill(); bctx.stroke();
        bctx.strokeStyle = '#fff'; bctx.lineWidth = Math.max(2, rad * 0.35); bctx.lineCap = 'round';
        bctx.beginPath();
        bctx.moveTo(ckx - rad * 0.45, cky); bctx.lineTo(ckx - rad * 0.1, cky + rad * 0.4); bctx.lineTo(ckx + rad * 0.5, cky - rad * 0.45);
        bctx.stroke();
        bctx.restore();
      }
    }
  }
}


function drawGenOverlay(idx, r) {
  const g = S.cells[idx]; if (!g || g.kind !== 'gen') return;
  const max = genMaxStore(g.glv), full = g.count >= max;
  const iv = genRegenSec(g.glv) * 1000;
  const prog = full ? 1 : MU.clamp(1 - (g.nextAt - Date.now()) / iv, 0, 1);
  const gx = r.x + r.w * 0.22, gy = r.y + r.h * 0.22, rad = r.w * 0.12;
  bctx.save();
  bctx.lineWidth = Math.max(2.5, r.w * 0.05);
  bctx.strokeStyle = 'rgba(255,255,255,0.25)';
  bctx.beginPath(); bctx.arc(gx, gy, rad, 0, Math.PI * 2); bctx.stroke();
  if (!full) {
    bctx.strokeStyle = '#ffd23f';
    bctx.beginPath(); bctx.arc(gx, gy, rad, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); bctx.stroke();
  }
  bctx.restore();
  const txt = `${g.count}/${max}`;
  bctx.save();
  bctx.font = `700 ${Math.round(r.h * 0.17)}px system-ui, sans-serif`;
  bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
  const tw = bctx.measureText(txt).width + r.w * 0.16;
  const chW = tw, chH = r.h * 0.26, chx = r.x + r.w - chW * 0.5 - r.w * 0.08, chy = r.y + r.h - chH * 0.5 - r.h * 0.08;
  bctx.fillStyle = full ? 'rgba(76,175,80,0.95)' : 'rgba(30,42,56,0.82)';
  drawRoundRect(bctx, chx - chW / 2, chy - chH / 2, chW, chH, chH / 2); bctx.fill();
  bctx.fillStyle = '#fff'; bctx.fillText(txt, chx, chy + 1);
  bctx.restore();
}

// ===================================================================
// ===== 스테이지 로드 / 초기화 =====
// ===================================================================
function parseMapToken(tok) {
  if (!tok) return null;
  const m = /^([a-z]+)(\d)$/.exec(tok);
  if (!m) return null;
  const tech = m[1], tier = +m[2];
  if (!TECHS[tech] || tier < 1 || tier > MAXT) return null;
  return { kind: 'food', tech, tier, sealed: true };
}
function currentStageDef() {
  if (!QCFG.list || !QCFG.list.length) return null;
  const i = Math.min(S.stage, QCFG.list.length - 1);
  return QCFG.list[i];
}
function initStage() {
  const def = currentStageDef();
  for (let i = 0; i < 30; i++) { const c = S.cells[i]; if (c && c.kind === 'gen') { if (S.bag.length < BAG_CAP) S.bag.push({ tech: c.tech, glv: c.glv, count: c.count || 0, nextAt: c.nextAt || 0 }); } }
  S.cells = Array(30).fill(null);
  if (def && Array.isArray(def.initMap)) { for (let i = 0; i < 30 && i < def.initMap.length; i++) { const it = parseMapToken(def.initMap[i]); if (it) S.cells[i] = it; } }
  S.stageStats = { fed: 0, merged: 0, sealsBroken: 0, maxTierMade: 0 };
  S.stageLoaded = S.stage;
  S.plates = []; refillPlates();
  cellAnim.fill(null); resv.clear();
  updateBagBtn();
  updateHud();
  checkQuest();
  save();
}

// ===================================================================
// ===== 생성기 로직 =====
// ===================================================================
const uiGlides = [];
const genRefillCost = (g) => Math.max(1, Math.ceil(genMaxStore(g.glv) / 4));
function openGenRefill(idx) {
  const g = S.cells[idx]; if (!g || g.kind !== 'gen') return;
  const max = genMaxStore(g.glv), c = genRefillCost(g);
  openModal(`<div class="mTitle">생산량 꽉 채우기</div><div class="mBucket"><img src="${genImg(g.tech, g.glv)}" alt=""></div><div class="mRow"><span>${genName(g.tech, g.glv)}</span><b>(0/${max}) → (${max}/${max})</b></div><button class="btn blue" id="mGRefill"><img src="assets/ic_gem.png" alt="">${c}로 꽉 채우기</button><button class="btn gray" id="mGNo">아니오</button>`);
  $('mGRefill').addEventListener('click', () => { const gg = S.cells[idx]; if (!gg || gg.kind !== 'gen') { closeModal(); return; } if (S.gems < c) { toast('젬이 부족해요!'); return; } S.gems -= c; gg.count = genMaxStore(gg.glv); gg.nextAt = Date.now() + genRegenSec(gg.glv) * 1000; updateHud(); save(); closeModal(); toast(`${genName(gg.tech, gg.glv)} 생산량을 꽉 채웠어요!`); });
  $('mGNo').addEventListener('click', closeModal);
}
function genTick() {
  const now = Date.now();
  for (let i = 0; i < 30; i++) { const g = S.cells[i]; if (!g || g.kind !== 'gen') continue; const max = genMaxStore(g.glv), iv = genRegenSec(g.glv) * 1000; if (g.count >= max) { g.nextAt = now + iv; continue; } if (!g.nextAt) g.nextAt = now + iv; let guard = 0; while (now >= g.nextAt && g.count < max && guard++ < 200) { g.count++; g.nextAt += iv; } if (g.count >= max) g.nextAt = now + iv; }
}
function genTap(idx) {
  const g = S.cells[idx];
  if (g.count <= 0) { openGenRefill(idx); return; }
  const empties = emptyCells();
  if (!empties.length) { toast('빈 칸이 없어요! 먹이를 합성하거나 판매해요.'); return; }
  const wasFull = g.count >= genMaxStore(g.glv); g.count--; if (wasFull) g.nextAt = Date.now() + genRegenSec(g.glv) * 1000;
  const tier = 1 + Math.floor(Math.random() * genMaxTier(g.glv));
  const dst = pick(empties); const item = { kind: 'food', tech: g.tech, tier };
  S.cells[dst] = item; resv.add(dst); repunch(idx, 'wig');
  const s0 = cellCenterApp(idx), s1 = cellCenterApp(dst);
  uiGlides.push({ img: getImg(imgOf(item.tech, item.tier)), x0: s0.x, y0: s0.y, x1: s1.x, y1: s1.y, t: 0, dur: 0.34, dst, item });
  refreshPlates(); save();
}
function openGenShop() {
  const cost = genBuyCost(); const full = S.bag.length >= BAG_CAP;
  openModal(`<div class="mTitle">생성기 구매</div>
    <div class="mRow"><span>가격</span><b style="display:flex;align-items:center;gap:4px"><img src="assets/ic_coin.png" style="width:15px;height:15px">${fmt(cost)}</b></div>
    <div class="mRow"><span>가방 보관</span><b>${S.bag.length} / ${BAG_CAP}</b></div>
    <div style="font-size:10.5px;color:#7a8a9a;text-align:center;margin:2px 0 4px">${full ? '가방이 가득 찼어요! 생성기를 합성해 공간을 비워요.' : '구매하면 가방에 보관돼요. 가방에서 꺼내 보드에 놓고 탭하면 먹이가 나와요.'}</div>
    <button class="btn ${full ? 'gray' : ''}" id="gbFish" ${full ? 'disabled' : ''}>🎣 ${genName('fish',1)} (물고기)</button>
    <button class="btn ${full ? 'gray' : 'blue'}" id="gbCrab" ${full ? 'disabled' : ''}>🦀 ${genName('crab',1)} (갑각류)</button>
    <button class="btn ${full ? 'gray' : 'red'}" id="gbMeat" ${full ? 'disabled' : ''}>🥩 ${genName('meat',1)} (육고기)</button>`);
  const buy = (tech) => {
    if (S.bag.length >= BAG_CAP) { toast('가방이 가득 찼어요!'); return; }
    const c = genBuyCost(); if (S.coins < c) { toast('코인이 부족해요!'); return; }
    S.coins -= c; S.bag.push({ tech, glv: 1, count: 0, nextAt: Date.now() + genRegenSec(1) * 1000 });
    updateBagBtn(); updateHud(); checkQuest(); save(); closeModal();
    toast(`${genName(tech,1)}을(를) 가방에 넣었어요! 가방에서 꺼내 보드에 놓아요.`);
  };
  if (!full) { $('gbFish').onclick = () => buy('fish'); $('gbCrab').onclick = () => buy('crab'); $('gbMeat').onclick = () => buy('meat'); }
}

// ===================================================================
// ===== 가방 (3x3 팝업) =====
// ===================================================================
function updateBagBtn() {
  const b = $('bagBadge');
  if (b) { b.textContent = S.bag.length; b.style.display = S.bag.length ? 'flex' : 'none'; }
}

function openBag() {
  if (!S.bag.length) { toast('가방이 비어 있어요. 생성기를 구매해 보관해요!'); return; }
  let html = `<div class="mTitle">가방 (생성기 보관함)</div><div class="bagGrid">`;
  for (let i = 0; i < BAG_CAP; i++) {
    const g = S.bag[i];
    html += `<div class="bagSlot${g ? ' has' : ''}" data-bi="${i}">${g ? `<img src="${genImg(g.tech, g.glv)}" alt=""><span class="bagLv">Lv.${g.glv}</span>` : ''}</div>`;
  }
  html += `</div><div style="font-size:10.5px;color:#7a8a9a;text-align:center;margin-top:4px">꺼낼 생성기를 탭하면 보드로 날아가요. 빈 칸이 없으면 꺼낼 수 없어요.</div>`;
  openModal(html);
  modalRoot.querySelectorAll('.bagSlot.has').forEach(el => el.addEventListener('click', () => takeFromBag(+el.dataset.bi)));
}
function takeFromBag(bi) {
  const g = S.bag[bi]; if (!g) return;
  const empties = emptyCells();
  if (!empties.length) {
    const btn = btnEls.bag;
    if (btn) { btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope'); }
    toast('빈 칸이 없어요! 먼저 보드를 정리해요.');
    return;
  }
  S.bag.splice(bi, 1);
  const dst = pick(empties);
  S.cells[dst] = { kind: 'gen', tech: g.tech, glv: g.glv, count: g.count || 0, nextAt: g.nextAt || (Date.now() + genRegenSec(g.glv) * 1000) };
  resv.add(dst);
  closeModal();
  updateBagBtn(); save();
  const bagR = btnEls.bag.getBoundingClientRect(), ar = app.getBoundingClientRect();
  const s0 = { x: bagR.left - ar.left + bagR.width / 2, y: bagR.top - ar.top + bagR.height / 2 };
  const s1 = cellCenterApp(dst);
  uiGlides.push({ img: getImg(genImg(g.tech, g.glv)), x0: s0.x, y0: s0.y, x1: s1.x, y1: s1.y, t: 0, dur: 0.42, dst, item: { kind: 'gen', tech: g.tech, glv: g.glv }, isGen: true });
}

// ===================================================================
// ===== 플레이트(주문) — 배경 트레이 좌표에 캔버스로 그림 =====
// ===================================================================
function orderTier() { const def = currentStageDef(); const minT = def?.orderMin ?? 2; const maxT = MU.clamp(def?.orderMax ?? 4, minT, MAXT); return minT + Math.floor(Math.random() * (maxT - minT + 1)); }
function makePlate() {
  const def = currentStageDef();
  const n = def?.orderSlots ?? 1;
  const used = []; const slots = [];
  for (let k = 0; k < n; k++) { let tech; do { tech = pick(TECH_KEYS); } while (used.length < TECH_KEYS.length && used.includes(tech)); used.push(tech); slots.push({ tech, tier: orderTier() }); }
  const base = slots.reduce((a, s) => a + Math.round(12 * Math.pow(s.tier, 1.35)), 0);
  const reward = Math.round(base * levelMult());
  return { slots, reward, id: Math.random().toString(36).slice(2), _wasReady: false };
}
function refillPlates() { while (S.plates.length < PLATE_COUNT) S.plates.push(makePlate()); }
function plateSatisfied(plate) { const need = {}; for (const s of plate.slots) { const key = s.tech + '_' + s.tier; need[key] = (need[key] || 0) + 1; } for (const key in need) { const [tech, tier] = key.split('_'); if (countItem(tech, +tier) < need[key]) return false; } return true; }
function slotPresent(slot) { return countItem(slot.tech, slot.tier) >= 1; }
function refreshPlates() {
  for (let pi = 0; pi < S.plates.length; pi++) {
    const p = S.plates[pi]; if (!p) continue;
    const ready = plateSatisfied(p);
    if (ready && !p._wasReady) { const r = plateRect(pi); const c = consoleToApp(r.cx, r.cy); burst(c.x, c.y, 26, true); }
    p._wasReady = ready;
  }
}
function renderPlates() { refreshPlates(); }

function plateRect(pi) {
  const R = PLATE_RECTS[pi] || PLATE_RECTS[0];
  const x = R.left * conW, y = R.top * conH;
  const w = (R.right - R.left) * conW, h = (R.bottom - R.top) * conH;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}
function hitPlate(clientX, clientY) {
  const cr = consoleEl.getBoundingClientRect();
  const px = clientX - cr.left, py = clientY - cr.top;
  for (let pi = 0; pi < S.plates.length; pi++) {
    const r = plateRect(pi);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return pi;
  }
  return -1;
}
function servePlate(pi) {
  const plate = S.plates[pi]; if (!plate) return;
  if (!plateSatisfied(plate)) { toast('아직 재료가 부족해요!'); return; }
  if (throwBusy()) { toast('부캉이가 아직 먹이를 먹는 중이에요!'); return; }
  const toRemove = []; const need = {};
  for (const s of plate.slots) { const key = s.tech + '_' + s.tier; need[key] = (need[key] || 0) + 1; }
  for (const key in need) { const [tech, tier] = key.split('_'); let cnt = need[key]; for (let i = 0; i < 30 && cnt > 0; i++) { const c = S.cells[i]; if (c && c.kind === 'food' && !c.sealed && c.tech === tech && c.tier === +tier) { toRemove.push(i); cnt--; } } }
  const lead = plate.slots.reduce((a, b) => b.tier > a.tier ? b : a, plate.slots[0]);
  const startWorld = plateWorldStart(pi);
  const targetWorld = new V3(rnd(-3, 3), 0.2, rnd(-2, 2));
  const fed = { kind: 'food', tech: lead.tech, tier: lead.tier, _reward: plate.reward };
  const ok = throwSardine(targetWorld.clone(), startWorld, fed);
  if (!ok) { toast('부캉이가 아직 먹이를 먹는 중이에요!'); return; }
  for (const i of toRemove) { const c = cellCenterApp(i); burst(c.x, c.y, 10, false); S.cells[i] = null; }
  S.plates.splice(pi, 1); S.plates.push(makePlate());
  refreshPlates(); save();
}


const FEED_PLANE = new THREE.Plane(new V3(0, 1, 0), -2.0);
const FEED_Y = 2.0;
const raycaster = new THREE.Raycaster();
function feedWorldStart() {
  const ar = app.getBoundingClientRect();
  const cr = consoleEl.getBoundingClientRect();
  const cx = cr.left - ar.left + cr.width / 2;
  const cy = cr.top - ar.top + cr.height * 0.08;
  const nx = (cx / ar.width) * 2 - 1, ny = -(cy / ar.height) * 2 + 1;
  raycaster.setFromCamera({ x: nx, y: ny }, camera); const hit = new V3();
  if (raycaster.ray.intersectPlane(FEED_PLANE, hit) && isFinite(hit.x)) { hit.x = MU.clamp(hit.x, -4.5, 4.5); hit.z = MU.clamp(hit.z, 6.5, 18); hit.y = FEED_Y; return hit; }
  return new V3(0, FEED_Y, 10);
}

function plateWorldStart(pi) {
  if (!conW) return feedWorldStart();
  const r = plateRect(pi);
  const cr = consoleEl.getBoundingClientRect();
  const clientX = cr.left + r.cx;
  const clientY = cr.top + r.cy;
  const rect = renderer.domElement.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera({ x: nx, y: ny }, camera);
  const hit = new V3();
  if (raycaster.ray.intersectPlane(FEED_PLANE, hit) && isFinite(hit.x)) {
    hit.x = MU.clamp(hit.x, -4.5, 4.5);
    hit.z = MU.clamp(hit.z, 6.5, 18);
    hit.y = FEED_Y;
    return hit;
  }
  return feedWorldStart();
}


// ===================================================================
// ===== 머지 / 봉인 해제 / 자동 머지 =====
// ===================================================================
function doMerge(src, dst) {
  const a = S.cells[src]; S.cells[src] = null;
  const ni = { kind: 'food', tech: a.tech, tier: a.tier + 1 }; S.cells[dst] = ni;
  S.stageStats.merged++; S.totalMerged++; S.stageStats.maxTierMade = Math.max(S.stageStats.maxTierMade, ni.tier);
  repunch(dst, 'pop');
  if (ni.tier >= 5) celebrate(dst, ni.tier);
  checkQuest(); refreshPlates(); save();
}
function mergeGen(src, dst) {
  const a = S.cells[src]; S.cells[src] = null;
  S.cells[dst] = { kind: 'gen', tech: a.tech, glv: a.glv + 1, count: 0, nextAt: Date.now() + genRegenSec(a.glv + 1) * 1000 };
  S.stageStats.merged++; S.totalMerged++;
  repunch(dst, 'pop');
  const c = cellCenterApp(dst); burst(c.x, c.y, 16, a.glv + 1 >= 5);
  toast(`${genName(a.tech, a.glv + 1)} 완성!`); checkQuest(); save();
}
function breakSeal(src, dst) {
  const a = S.cells[src];
  const b = S.cells[dst];
  S.cells[src] = null;
  const ni = { kind: 'food', tech: b.tech, tier: b.tier + 1 };
  S.cells[dst] = ni;
  S.stageStats.merged++; S.totalMerged++; S.stageStats.sealsBroken++;
  S.stageStats.maxTierMade = Math.max(S.stageStats.maxTierMade, ni.tier);
  repunch(dst, 'pop');
  const c = cellCenterApp(dst); burst(c.x, c.y, 18, true); screenFlashA = Math.max(screenFlashA, 0.2);
  toast('봉인 해제!');
  if (ni.tier >= 5) celebrate(dst, ni.tier);
  checkQuest(); refreshPlates(); save();
}
function autoMergeOne() {
  for (let i = 0; i < 30; i++) { const a = S.cells[i]; if (!a || a.kind !== 'food' || a.sealed || a.tier >= MAXT || resv.has(i)) continue; for (let j = i + 1; j < 30; j++) { if (resv.has(j)) continue; const b = S.cells[j]; if (b && b.kind === 'food' && !b.sealed && b.tech === a.tech && b.tier === a.tier) { doMerge(j, i); return; } } }
}

// ===================================================================
// ===== 셀 인터랙션 (콘솔 캔버스 위 포인터) =====
// ===================================================================
let drag = null;
let uiGhost = null;
function handleTap(idx) {
  const it = S.cells[idx]; if (!it) return;
  if (it.sealed) { repunch(idx, 'wig'); toast('봉인된 아이템이에요. 같은 아이템과 합성해 풀어요!'); return; }
  if (it.kind === 'gen') { genTap(idx); return; }
  if (S.sellMode) { S.cells[idx] = null; addCoins(sellVal(it), cellCenterApp(idx)); refreshPlates(); save(); return; }
  repunch(idx, 'wig');
}


consoleEl.addEventListener('pointerdown', (e) => {
  if (hitCell(e.clientX, e.clientY) < 0) {
    const ppi = hitPlate(e.clientX, e.clientY);
    if (ppi >= 0) {
      const p = S.plates[ppi];
      if (p && plateSatisfied(p)) servePlate(ppi);
      else toast('아직 재료가 부족해요!');
      return;
    }
  }
  const idx = hitCell(e.clientX, e.clientY);
  if (idx < 0) return;
  drag = { idx, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: -1 };
});


addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 10) {
    const it = S.cells[drag.idx];
    if (!it) { drag = null; return; }
    if (it.sealed) { drag = null; return; }
    drag.moved = true;
    const src = it.kind === 'gen' ? genImg(it.tech, it.glv) : imgOf(it.tech, it.tier);
    drag.ghost = { img: getImg(src), x: 0, y: 0 }; uiGhost = drag.ghost;
  }
  if (drag.moved && drag.ghost) {
    const ar = app.getBoundingClientRect(); drag.ghost.x = e.clientX - ar.left; drag.ghost.y = e.clientY - ar.top;
    drag.over = hitCell(e.clientX, e.clientY);
  }
});
addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag; drag = null; uiGhost = null;
  if (!d.moved) { handleTap(d.idx); return; }
  const dst = hitCell(e.clientX, e.clientY);
  if (dst < 0 || dst === d.idx || resv.has(dst)) return;
  const a = S.cells[d.idx], b = S.cells[dst];
  if (!a || a.sealed) return;
  if (!b) {
    S.cells[dst] = a; S.cells[d.idx] = null; repunch(dst, 'pop');
  }
  else if (b.sealed) {
    if (a.kind === 'food' && b.kind === 'food' && a.tech === b.tech && a.tier === b.tier && a.tier < MAXT) { breakSeal(d.idx, dst); }
    else { toast('봉인은 같은 아이템과 합성해야 풀려요!'); }
  }
  else if (a.kind === 'gen' && b.kind === 'gen' && a.tech === b.tech && a.glv === b.glv && a.glv < MAX_GEN) { mergeGen(d.idx, dst); }
  else if (a.kind === 'food' && b.kind === 'food' && a.tech === b.tech && a.tier === b.tier && a.tier < MAXT) { doMerge(d.idx, dst); }
  else { S.cells[dst] = a; S.cells[d.idx] = b; repunch(dst, 'pop'); repunch(d.idx, 'pop'); }
  refreshPlates(); save();
});

// ===================================================================
// ===== 하단 버튼 (아트풍 둥근 사각형 + 아이콘, overlay DOM) =====
// ===================================================================
const BTN_DEFS = [
  { id: 'genShop', icon: 'assets/ic_board.png', label: '생성기', tint: '#4aa3ff' },
  { id: 'bag',     icon: 'assets/ic_bag.png',   label: '가방',   tint: '#ffb13f', badge: true },
  { id: 'sell',    icon: 'assets/ic_sell.png',  label: '판매',   tint: '#ff6b6b', toggle: true },
  { id: 'shop',    icon: 'assets/ic_shop.png',  label: '상점',   tint: '#7ed957' },
];
const btnEls = {};
function buildButtons() {
  if (!overlayEl) return;
  overlayEl.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'btnBar';
  for (const def of BTN_DEFS) {
    const b = document.createElement('button');
    b.className = 'cbtn';
    b.dataset.id = def.id;
    b.style.setProperty('--tint', def.tint);
    b.innerHTML = `<span class="cbtnIco"><img src="${def.icon}" alt="" onerror="this.style.display='none'"></span>` +
                  `<span class="cbtnLbl">${def.label}</span>` +
                  (def.badge ? '<span class="cbtnBadge" id="bagBadge"></span>' : '');
    bar.appendChild(b);
    btnEls[def.id] = b;
  }
  overlayEl.appendChild(bar);

  btnEls.genShop.addEventListener('click', (e) => { juiceTap(e.currentTarget); openGenShop(); });
  btnEls.bag.addEventListener('click', (e) => { juiceTap(e.currentTarget); openBag(); });
  btnEls.shop.addEventListener('click', (e) => { juiceTap(e.currentTarget); openShop(); });
  btnEls.sell.addEventListener('click', (e) => {
    juiceTap(e.currentTarget);
    S.sellMode = !S.sellMode;
    btnEls.sell.classList.toggle('active', S.sellMode);
    toast(S.sellMode ? '판매 모드 — 팔고 싶은 먹이를 눌러요' : '판매 모드 종료');
  });

  updateBagBtn();
}
function layoutButtons() { /* CSS flex 배치 — 계산 불필요 */ }

// ===================================================================
// ===== 이펙트 / 수입 / 플로팅 텍스트 (UI 캔버스) =====
// ===================================================================
const PT_COLORS = ['#ffd23f', '#fff6c9', '#8fdff0', '#ffffff', '#ffb13f'];
const uiParticles = [];
const uiFloats = [];
function burst(x, y, n, strong) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, d = rnd(90, strong ? 300 : 210); uiParticles.push({ x, y, vx: Math.cos(a) * d, vy: Math.sin(a) * d - 120, life: 0, max: rnd(0.5, 0.85), size: strong ? rnd(5, 11) : rnd(4, 8), color: pick(PT_COLORS), round: Math.random() < 0.5 }); }
}
function floatNum(x, y, text, cls) { uiFloats.push({ x, y, text, life: 0, max: 1.6, style: cls === 'cell' ? 2 : cls === 'small' ? 1 : 0 }); }
function crowdFloatBurst(total, small) {
  let k = small ? 2 + Math.floor(Math.random() * 2) : 4 + Math.floor(Math.random() * 3); k = Math.max(1, Math.min(k, Math.floor(total)));
  if (k <= 1) { const p0 = worldToScreen(new V3(rnd(-2.5, 2.5), 2.4, -9.6)); floatNum(p0.x, p0.y, '+' + fmt(total), small ? 'small' : ''); return; }
  const w = []; let sum = 0; for (let i = 0; i < k; i++) { const r = rnd(0.6, 1.4); w.push(r); sum += r; }
  const parts = w.map(x => Math.max(1, Math.round(total * x / sum))); parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0); if (parts[parts.length - 1] <= 0) parts[parts.length - 1] = 1;
  parts.forEach((p, i) => setTimeout(() => { const pos = worldToScreen(new V3(rnd(-6.5, 6.5), rnd(1.4, 3.2), -10.5)); floatNum(pos.x, pos.y, '+' + fmt(p), small ? 'small' : ''); }, i * (small ? 95 : 70)));
}
function addCoins(n, fromCell) { S.coins += n; const cb = $('coinBox'); if (cb) { cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump'); } if (fromCell) floatNum(fromCell.x, fromCell.y - 14, '+' + fmt(n), 'cell'); }
function gainXp(g) {
  S.xp += g; let guard = 0; while (S.xp >= xpNeed(S.level) && guard++ < 20) { S.xp -= xpNeed(S.level); S.level++; }
  if (guard > 0) { const pb = $('profileBox'); if (pb) { const pr = pb.getBoundingClientRect(), ar = app.getBoundingClientRect(); floatNum(pr.left - ar.left + 42, pr.top - ar.top + 46, 'LV UP!', ''); burst(pr.left - ar.left + 52, pr.top - ar.top + 20, 18, true); pb.classList.remove('lvPunch', 'glowGold'); void pb.offsetWidth; pb.classList.add('lvPunch', 'glowGold'); setTimeout(() => pb.classList.remove('lvPunch', 'glowGold'), 1300); } toast(`부캉이가 Lv.${S.level}(으)로 레벨업! 수입이 증가해요.`); }
}
function celebrate(idx, tier) { const c = cellCenterApp(idx); const strong = tier >= 5; burst(c.x, c.y, Math.min(34, 10 + tier * 3), strong); if (strong) { app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake'); screenFlashA = Math.max(screenFlashA, 0.28); } }
function throwBusy() { return !!(sardine || hunt || (mode !== 'path' && mode !== 'rejoin')); }

const uiCanvas = $('uiCanvas');
const uctx = uiCanvas.getContext('2d');
let uiW = 0, uiH = 0;
function sizeUiCanvas() {
  const r = app.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  uiW = Math.round(r.width); uiH = Math.round(r.height);
  uiCanvas.style.width = uiW + 'px'; uiCanvas.style.height = uiH + 'px';
  uiCanvas.width = Math.round(uiW * dpr); uiCanvas.height = Math.round(uiH * dpr);
  uctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
let uiWarned = false;
function updateUiCanvas(dt, t) {
  try {
    uctx.clearRect(0, 0, uiW, uiH);
    for (let i = uiParticles.length - 1; i >= 0; i--) { const p = uiParticles[i]; p.life += dt; if (p.life >= p.max) { uiParticles.splice(i, 1); continue; } p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; const k = p.life / p.max, s = p.size * (1 - k * 0.6); uctx.globalAlpha = 1 - k; uctx.fillStyle = p.color; if (p.round) { uctx.beginPath(); uctx.arc(p.x, p.y, s / 2, 0, Math.PI * 2); uctx.fill(); } else uctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); }
    uctx.globalAlpha = 1; uctx.textAlign = 'center';
    for (let i = uiFloats.length - 1; i >= 0; i--) { const f = uiFloats[i]; f.life += dt; if (f.life >= f.max) { uiFloats.splice(i, 1); continue; } const k = f.life / f.max; uctx.globalAlpha = k < 0.16 ? k / 0.16 : 1 - Math.max(0, k - 0.5) * 2; uctx.font = `900 ${f.style === 0 ? 18 : 13}px system-ui, sans-serif`; uctx.shadowColor = f.style === 2 ? 'rgba(0,0,0,.4)' : 'rgba(0,0,0,.55)'; uctx.shadowBlur = f.style === 0 ? 10 : 3; uctx.fillStyle = f.style === 2 ? '#8ee06a' : f.style === 1 ? '#ffe27a' : '#ffd23f'; uctx.fillText(f.text, f.x, f.y - 100 * k - 8); uctx.shadowBlur = 0; }
    uctx.globalAlpha = 1;
    for (let i = uiGlides.length - 1; i >= 0; i--) {
      const f = uiGlides[i]; f.t += dt; const u = MU.clamp(f.t / f.dur, 0, 1); const e = 1 - (1 - u) * (1 - u);
      const x = MU.lerp(f.x0, f.x1, e), y = MU.lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 26; const im = f.img;
      if (im.complete && im.naturalWidth) { const sc = MU.lerp(1.25, 1, u); const k = (34 * sc) / Math.max(im.naturalWidth, im.naturalHeight); uctx.save(); uctx.shadowColor = 'rgba(0,0,0,.3)'; uctx.shadowBlur = 3; uctx.drawImage(im, x - im.naturalWidth * k / 2, y - im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k); uctx.restore(); }
      if (u >= 1) { uiGlides.splice(i, 1); resv.delete(f.dst); repunch(f.dst, 'pop'); refreshPlates(); if (!f.isGen && f.item.tier >= 5) celebrate(f.dst, f.item.tier); }
    }
    if (uiGhost && uiGhost.img.complete && uiGhost.img.naturalWidth) { const im = uiGhost.img; const k = 46 / Math.max(im.naturalWidth, im.naturalHeight); uctx.save(); uctx.globalAlpha = 0.92; uctx.shadowColor = 'rgba(0,0,0,.4)'; uctx.shadowBlur = 5; uctx.drawImage(im, uiGhost.x - im.naturalWidth * k / 2, uiGhost.y - im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k); uctx.restore(); }
  } catch (e) { if (!uiWarned) { uiWarned = true; console.warn('uiCanvas', e); } }
}

// ===================================================================
// ===== 스토리 / 퀘스트 =====
// ===================================================================
let STORY = null;
let kState = null;
const PERIODS = { day: '☀️ 낮', evening: '🌙 저녁', morning: '🌅 아침', sea: '🌊 바다' };
const AUTOPLAY = new URLSearchParams(location.search).has('auto');
function loadStory() { return fetch('story.json?v=' + Date.now()).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(j => { STORY = j; return j; }); }
function beatCount() { return STORY ? STORY.beats.length : 104; }
let QCFG = { list: [] };
function loadQuests() { return fetch('quests.json?v=' + Date.now()).then(r => r.json()).then(j => { QCFG = j; return j; }).catch(() => { QCFG = { list: [] }; }); }

function openBeat(idx, onDone) { const i = Math.max(0, Math.min(idx, STORY.beats.length - 1)); if (S.beat < i + 1) { S.beat = i + 1; save(); } const b = STORY.beats[i]; b._idx = i; if (b.type === 'stage') openStage(b, onDone); else openKakao(b, onDone); }
function openKakao(scene, onDone) { const per = PERIODS[scene.period] || PERIODS.day; openModal(`<div class="mTitle">${scene.title}</div><div class="kWrap" id="kWrap"><div class="kDay"><span>${per} · ${dayLabel()}</span></div></div><div class="kHint"><span class="pulse">화면을 탭 — 다음 대사</span></div>`); kState = { mode: 'scene', scene, i: 0, onDone, done: false, wrap: $('kWrap') }; kNext(); if (AUTOPLAY) while (kState && !kState.done) kNext(); }
function openStage(b, onDone) { const narrs = (b.lines || []).map(L => `<div class="kNarr">${L.x}</div>`).join(''); const nm = w => (STORY.chars[w] || STORY.chars.people).name; openModal(`<div class="mTitle">리듬 액션 스테이지 ${b.num}</div><div class="kWrap kStageW" id="kWrap"><div class="kStage"><div class="kStageTag" id="stTag">STAGE ${b.num}</div><div class="kStageTitle">“${b.title}”</div>${b.illu ? (/^assets\/.*\.(png|jpe?g|webp|gif)$/i.test(b.illu)
  ? `<div class="kIllu"><img class="kIlluImg" src="${b.illu}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'kIlluBox'}))"><div class="kIlluCap">${b.illuCap || ''}</div></div>`
  : `<div class="kIllu"><div class="kIlluBox"></div><div class="kIlluCap">${b.illu}</div></div>`) : ''}<div class="kStageDesc">${b.desc}</div>${narrs}<div class="kStageLine" id="stLine"><b>${nm(b.start.who)}</b>${b.start.text}</div><div class="kHint"><span class="pulse">화면을 탭해 돌진!</span></div></div></div>`); kState = { mode: 'stage', stage: b, cleared: false, onDone }; }
function kNext() {
  if (!kState || kState.done || kState.mode !== 'scene') return;
  const st = kState; if (st.i >= st.scene.lines.length) { kFinish(); return; }
  const L = st.scene.lines[st.i++]; let el;
  if (L.t === 'n') { el = document.createElement('div'); el.className = 'kNarr'; el.textContent = L.x; }
  else if (L.t === 'img') {
    el = document.createElement('div'); el.className = 'kIllu';
    if (L.src) {
      const img = getImg(L.src);                 // 프리로드 캐시 재사용
      img.alt = '';
      img.className = 'kIlluImg';
      img.onerror = function () {                 // 로드 실패 시 빈 박스로 폴백
        const box = document.createElement('div'); box.className = 'kIlluBox';
        this.replaceWith(box);
      };
      el.appendChild(img);
      const cap = document.createElement('div'); cap.className = 'kIlluCap';
      cap.textContent = L.cap || '';
      el.appendChild(cap);
      img.addEventListener('load', kScroll, { once: true });
    } else {
      el.innerHTML = `<div class="kIlluBox"></div><div class="kIlluCap">${L.cap || ''}</div>`;
    }
  }
  else { const c = STORY.chars[L.who] || STORY.chars.people; const row = document.createElement('div'); row.className = 'kRow' + (c.me ? ' me' : ''); row.innerHTML = `<div class="kAva"><img src="${c.avatar}" alt=""></div><div class="kCol"><div class="kName">${c.name}</div><div class="kBub">${L.x}</div></div>`; el = row; }
  st.wrap.appendChild(el); kScroll(); if (st.i >= st.scene.lines.length) kFinish();
}
function kScroll() { const st = kState; if (!st || !st.wrap) return; const w = st.wrap; const pad = Math.round(w.clientHeight * 0.3); if (w._pad !== pad) { w._pad = pad; w.style.paddingBottom = pad + 'px'; } const last = w.lastElementChild; if (!last) { w.scrollTop = 0; return; } w.scrollTop = Math.max(0, last.offsetTop + last.offsetHeight - w.clientHeight * 0.7); }
function kFinish() { if (!kState || kState.done) return; kState.done = true; const hint = document.querySelector('#modalRoot .kHint'); if (hint) hint.innerHTML = '<span class="pulse">계속 — 탭</span>'; }
function kTap() {
  if (!kState) return;
  if (kState.mode === 'stage') {
    const st = kState;
    if (!st.cleared) { st.cleared = true; const nm = w => (STORY.chars[w] || STORY.chars.buk).name; const line = $('stLine'); if (line) line.innerHTML = `<b>${nm(st.stage.clear.who)}</b>${st.stage.clear.text}`; const tag = $('stTag'); if (tag) tag.textContent = 'CLEAR!'; const wrap = $('kWrap'); if (wrap) wrap.classList.add('kStageDone'); const hint = document.querySelector('#modalRoot .kHint'); if (hint) hint.innerHTML = '<span class="pulse">탭하여 계속</span>'; return; }
    const cb = st.onDone; kState = null; const nx = st.stage._idx + 1;
    fadeSwap(() => { closeModal(); if (nx >= STORY.beats.length) { if (cb) cb(); } else openBeat(nx, cb); });
    return;
  }
  if (kState.i >= kState.scene.lines.length && kState.done) { const cb = kState.onDone; kState = null; fadeSwap(() => { closeModal(); if (cb) cb(); }); } else kNext();
}
function dayLabel() { return S.inf ? '∞ 기억의 수로' : 'DAY ' + (1 + Math.floor(S.beat / 2)); }
function isNight() { return !S.inf && S.beat % 2 === 1; }
function updateDayUI() { const dt = $('dayTxt'); if (dt) { dt.textContent = dayLabel(); fitText(dt); } const n = isNight(); const dp = $('dayPlate'); if (dp) dp.querySelector('.di').textContent = n ? '🌙' : '☀️'; if (dt) dt.classList.toggle('dnight', n); const nv = $('nightVeil'); if (nv) nv.style.opacity = n ? '0.45' : '0'; }
function advanceStory(onDone) {
  if (!STORY) { if (onDone) onDone(); return; }
  const idx = Math.min(S.beat, STORY.beats.length - 1);
  storyFade(() => openBeat(idx, () => { updateDayUI(); if (onDone) onDone(); if (S.beat >= STORY.beats.length && !S.inf) unlockInfinite(); }));
  S.storyShown = true;
}
function unlockInfinite() { S.inf = true; updateDayUI(); syncCrowd(); save(); toast('무한모드 해금! 수로의 기억 속 부캉이와 계속 함께할 수 있어요.', 4200); }

function checkQuestType(type, target) {
  switch (type) {
    case 'fed':     return S.stageStats.fed >= target;
    case 'merge':   return S.stageStats.merged >= target;
    case 'seal':    return S.stageStats.sealsBroken >= target;
    case 'tier':    return S.stageStats.maxTierMade >= target;
    default:        return false;
  }
}
function curQuest() {
  if (!QCFG.list || S.inf) return null;
  if (S.stage >= QCFG.list.length) return null;
  const q = QCFG.list[S.stage];
  return { desc: q.desc, reward: q.reward, check: () => checkQuestType(q.type, q.target) };
}
function checkQuest() { syncCrowd(); const q = curQuest(); const badge = $('questBadge'); if (!badge) return; if (!q) { badge.style.display = 'none'; return; } badge.style.display = q.check() ? 'flex' : 'none'; }
function openQuest() {
  const q = curQuest();
  if (!q) { openModal(`<div class="mTitle">스테이지</div><div style="text-align:center;font-size:12.5px;color:#3a4a5e;padding:10px 0">${S.inf ? '본편 완결!<br>부캉이는 바다로 떠났어요. 🌊' : '스토리를 불러오는 중이에요…'}</div>`); return; }
  const done = q.check();
  const rw = q.reward.coins ? `<img src="assets/ic_coin.png" alt="">${fmt(q.reward.coins)}` : `<img src="assets/ic_gem.png" alt="">${fmt(q.reward.gems)}`;
  openModal(`<div class="mTitle">스테이지 ${S.stage + 1}</div><div class="questBox"><div class="qd">${q.desc}</div><div class="qp">진행 ${S.stage + 1} / ${QCFG.list.length}</div></div><div class="mRow"><span>보상</span><b style="display:flex;align-items:center;gap:4px">${rw}</b></div><button class="btn ${done ? '' : 'gray'}" id="qClaim">${done ? '완료하고 다음 스테이지로' : '아직 완료되지 않았어요'}</button>`);
  $('qClaim').onclick = () => {
    if (!q.check()) { toast('아직 조건을 달성하지 못했어요.'); return; }
    if (q.reward.coins) addCoins(q.reward.coins);
    if (q.reward.gems) S.gems += q.reward.gems;
    S.stage++;
    updateHud(); save();
    advanceStory(() => { initStage(); });
  };
}

// ===================================================================
// ===== HUD / 모달 / 상점 / 메뉴 =====
// ===================================================================
function updateHud() { const lv = $('lvlTxt'); if (lv) lv.textContent = 'Lv.' + disp.dlevel; updateDayUI(); }

const modalRoot = $('modalRoot');
const faderEl = $('fader');
function fadeSwap(mid) { if (!faderEl) { mid(); return; } faderEl.classList.add('on'); setTimeout(() => { mid(); faderEl.classList.remove('on'); }, 1020); }
function storyFade(mid) { const txt = $('fadeTxt'); if (!faderEl) { mid(); return; } if (txt) txt.classList.remove('vis'); faderEl.classList.add('on'); if (txt) { setTimeout(() => txt.classList.add('vis'), 1020); setTimeout(() => txt.classList.remove('vis'), 2820); } setTimeout(() => mid(), 3720); setTimeout(() => faderEl.classList.remove('on'), 3820); }
function openModal(html) { const kakao = html.includes('class="kWrap"'); modalRoot.innerHTML = `<div class="mDim"></div><div class="mPanel${kakao ? ' kakao' : ''}"><button class="mClose"${kakao ? ' style="display:none"' : ''}>✕</button>${html}</div>`; modalRoot.classList.add('open'); modalRoot.querySelector('.mClose').addEventListener('click', closeModal); if (kakao) modalRoot.querySelector('.mPanel').addEventListener('click', (e) => { if (!e.target.closest('.mClose')) kTap(); }); }
function closeModal() { modalRoot.classList.remove('open'); modalRoot.innerHTML = ''; }
function openShop() { openModal(`<div class="mTitle">상점</div><div class="mRow"><span>보유 젬</span><b style="display:flex;align-items:center;gap:4px"><img src="assets/ic_gem.png" style="width:15px;height:15px" alt="">${fmt(S.gems)}</b></div><button class="btn" id="mBuy1"><img src="assets/ic_gem.png" alt="">1 <span style="opacity:.7">→</span> <img src="assets/ic_coin.png" alt="">1,000</button><button class="btn blue" id="mBuy10"><img src="assets/ic_gem.png" alt="">10 <span style="opacity:.7">→</span> <img src="assets/ic_coin.png" alt="">12,000</button><div style="font-size:11px;color:#7a8a9a;text-align:center;margin-top:6px">더 많은 상품은 준비 중이에요!</div>`); $('mBuy1').addEventListener('click', () => buyGems(1, 1000)); $('mBuy10').addEventListener('click', () => buyGems(10, 12000)); }
function buyGems(g, coins) { if (S.gems < g) { toast('젬이 부족해요!'); return; } S.gems -= g; addCoins(coins); updateHud(); save(); toast(`코인 ${fmt(coins)}를 구매했어요!`); }
function openMenu() {
  openModal(`<div class="mTitle">부캉이키우기</div><div class="mRow"><span>스테이지</span><b>${S.stage + 1}</b></div><div class="mRow"><span>총 주문 완료</span><b>${fmt(S.totalFed)}회</b></div><div class="mRow"><span>총 합성</span><b>${fmt(S.totalMerged)}회</b></div><div class="mRow"><span>누적 수입</span><b>${fmt(S.earned)}</b></div><div class="mRow"><span>자동 머지</span><button class="btn ${S.auto ? '' : 'gray'}" id="mAuto" style="min-width:86px;padding:6px 10px;font-size:11px">${S.auto ? 'ON' : 'OFF'}</button></div><button class="btn red" id="mReset">게임 초기화</button><div style="font-size:10px;color:#9aa8b5;text-align:center;margin-top:6px">진행 상황은 자동 저장돼요</div>`);
  $('mAuto').addEventListener('click', () => { S.auto = !S.auto; save(); $('mAuto').textContent = S.auto ? 'ON' : 'OFF'; $('mAuto').classList.toggle('gray', !S.auto); toast(S.auto ? '자동 머지 ON' : '자동 머지 OFF'); });
  $('mReset').addEventListener('click', function () { if (this.dataset.armed) { suppressSave = true; LS.del(SAVE_KEY); location.reload(); } else { this.dataset.armed = '1'; this.textContent = '정말 초기화할까요? 다시 눌러 확인'; } });
}

let toastTimer = 0;
function toast(msg, dur = 1800) { const t = $('toast'); if (!t) return; t.textContent = msg; t.style.opacity = '1'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = '0'; }, dur); }

// ===================================================================
// ===== 상단/왼쪽 HUD 버튼 바인딩 =====
// ===================================================================
$('coinPlus')?.addEventListener('click', openShop);
$('gemPlus')?.addEventListener('click', () => {
  S.gems += 100;
  const gb = $('gemBox'); if (gb) { gb.classList.remove('bump'); void gb.offsetWidth; gb.classList.add('bump'); }
  toast('젬 +100'); save();
});
$('menuBtn')?.addEventListener('click', (e) => { juiceTap(e.currentTarget); openMenu(); });
$('questBtn')?.addEventListener('click', (e) => { juiceTap(e.currentTarget); openQuest(); });
$('eventBtn')?.addEventListener('click', (e) => { juiceTap(e.currentTarget); toast('이벤트는 준비 중이에요!'); });

const _origGetId = $;
function $$bagBtn() { return btnEls.bag; }

// ===================================================================
// ===== 메인 틱 =====
// ===================================================================
const disp = { coins: S.coins, gems: S.gems, dlevel: S.level, dxp: S.xp };
const Game = {
  autoTimer: 0,
  tick(dt, t) {
    genTick();
    disp.coins += (S.coins - disp.coins) * Math.min(1, dt * 6); if (Math.abs(S.coins - disp.coins) < 0.6) disp.coins = S.coins;
    const coinShown = fmt(disp.coins); if (coinShown !== Game._coin) { Game._coin = coinShown; const el = $('coinVal'); if (el) { el.textContent = coinShown; fitText(el); } }
    const gemShown = fmt(S.gems); if (gemShown !== Game._gem) { Game._gem = gemShown; const el = $('gemVal'); if (el) { el.textContent = gemShown; fitText(el); } }
    if (disp.dlevel < S.level) { disp.dxp += xpNeed(disp.dlevel) * dt * 2.2; if (disp.dxp >= xpNeed(disp.dlevel)) { disp.dlevel++; disp.dxp = (disp.dlevel >= S.level) ? S.xp : 0; } } else { disp.dxp += (S.xp - disp.dxp) * Math.min(1, dt * 3); }
    const lvlShown = 'Lv.' + disp.dlevel; if (lvlShown !== Game._lvl) { Game._lvl = lvlShown; const el = $('lvlTxt'); if (el) el.textContent = lvlShown; }
    const xpRatio = Math.min(1, disp.dxp / xpNeed(disp.dlevel)); const xpKey = Math.round(xpRatio * 1000); if (xpKey !== Game._pct) { Game._pct = xpKey; const el = $('xpFill'); if (el) el.style.transform = 'scaleX(' + xpRatio.toFixed(4) + ')'; }
    const xpShown = `${fmt(disp.dxp)} / ${fmt(xpNeed(disp.dlevel))}`; if (xpShown !== Game._xp) { Game._xp = xpShown; const el = $('xpTxt'); if (el) el.textContent = xpShown; }
    if (S.auto) { this.autoTimer += dt; if (this.autoTimer > 1.6) { this.autoTimer = 0; autoMergeOne(); } }
  },
};

window.__onFed = function (item) {
  if (!item) return;
  const reward = item._reward || 10, leadTier = item.tier || 2;
  S.stageStats.fed++; S.totalFed++;
  addCoins(reward); S.earned += reward; crowdFloatBurst(reward, false);
  gainXp(Math.round(15 * Math.pow(leadTier, 1.3)));
  updateHud(); checkQuest(); save();
};

// ===================================================================
// ===== 카메라 오빗/줌 =====
// ===================================================================
const ORBIT_MAX = MU.degToRad(30);
let orbitTgt = 0, orbitCur = 0, zoomTgt = 1, zoomCur = 1;
const camPtrs = new Map();
let pinch0 = 0, zoom0 = 1;
function updateCamera(dt) {
  orbitCur += (orbitTgt - orbitCur) * Math.min(1, dt * 10);
  zoomCur += (zoomTgt - zoomCur) * Math.min(1, dt * 10);
  const d = (camera.userData.baseDist || 40) / zoomCur;
  const cp = Math.cos(CAM_PITCH), sp2 = Math.sin(CAM_PITCH);
  camera.position.set(CAM_TARGET.x + d * cp * Math.sin(orbitCur), CAM_TARGET.y + d * sp2, CAM_TARGET.z + d * cp * Math.cos(orbitCur));
  camera.lookAt(CAM_TARGET);
}
renderer.domElement.addEventListener('pointerdown', (e) => { renderer.domElement.setPointerCapture(e.pointerId); camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (camPtrs.size === 2) { const [a, b] = [...camPtrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; zoom0 = zoomTgt; } });
renderer.domElement.addEventListener('pointermove', (e) => { const p = camPtrs.get(e.pointerId); if (!p) return; if (camPtrs.size === 1) { orbitTgt = MU.clamp(orbitTgt - (e.clientX - p.x) * MU.degToRad(0.28), -ORBIT_MAX, ORBIT_MAX); } p.x = e.clientX; p.y = e.clientY; if (camPtrs.size === 2) { const [a, b] = [...camPtrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y) || 1; zoomTgt = MU.clamp(zoom0 * (d / pinch0), 0.9, 1.1); } });
const camPtrUp = (e) => { camPtrs.delete(e.pointerId); };
renderer.domElement.addEventListener('pointerup', camPtrUp);
renderer.domElement.addEventListener('pointercancel', camPtrUp);
renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault(); zoomTgt = MU.clamp(zoomTgt * (e.deltaY > 0 ? 0.95 : 1.05), 0.9, 1.1); }, { passive: false });

// ===================================================================
// ===== 부팅 =====
// ===================================================================

function preloadAssets() {
  return new Promise((resolve) => {
    const srcs = [CONSOLE_IMG, WEB_IMG];

    // 먹이(f_*) + 생성기(g_*) 전 티어/레벨
    for (const tech of TECH_KEYS) {
      for (let t = 1; t <= MAXT; t++) srcs.push(imgOf(tech, t));
      for (let g = 1; g <= MAX_GEN; g++) srcs.push(genImg(tech, g));
    }

    // HUD / 버튼 / 왼쪽 아이콘
    srcs.push(
      'assets/ic_coin.png', 'assets/ic_gem.png', 'assets/ic_plus.png',
      'assets/ic_menu.png', 'assets/ic_mission.png', 'assets/ic_event.png',
      'assets/ic_avatar.png', 'assets/ic_board.png', 'assets/ic_bag.png',
      'assets/ic_sell.png', 'assets/ic_shop.png', 'assets/ic_unlock.png'
    );

    // 대화 이벤트 씬 (scene_01 ~ scene_10)
    for (let i = 1; i <= 10; i++) {
      srcs.push('assets/scene_' + String(i).padStart(2, '0') + '.jpg');
    }

    // 스토리 아바타(story.json chars[].avatar)
    if (STORY && STORY.chars) {
      for (const key in STORY.chars) {
        const av = STORY.chars[key] && STORY.chars[key].avatar;
        if (av) srcs.push(av);
      }
    } else {
      srcs.push(
        'assets/ava_shark.png', 'assets/ava_inner.png', 'assets/ava_mom.png',
        'assets/ava_friend.png', 'assets/ava_kid.jpg', 'assets/ava_mother.jpg', 'assets/ava_father.jpg',
        'assets/ava_cafe.jpg', 'assets/ava_reporter.jpg', 'assets/ava_expert.jpg',
        'assets/ava_elder.jpg', 'assets/ava_rescue.jpg', 'assets/ava_trio.jpg'
      );
    }

    // 중복 제거
    const uniq = [...new Set(srcs)];

    let left = uniq.length;
    if (!left) return resolve();
    for (const s of uniq) {
      const im = getImg(s);
      if (im.complete) { if (--left === 0) resolve(); }
      else { im.onload = im.onerror = () => { if (--left === 0) resolve(); }; }
    }
  });
}



function bootGame() {
  genTick();
  buildButtons();
  if (S.stageLoaded !== S.stage) { initStage(); } else { refillPlates(); }
  if (S.sellMode && btnEls.sell) btnEls.sell.classList.add('active');
  updateBagBtn(); updateHud(); checkQuest();
  disp.coins = S.coins; disp.dlevel = S.level; disp.dxp = S.xp;
  if (!LS.get(SAVE_KEY)) setTimeout(() => toast('가방에서 생성기를 꺼내 보드에 놓고, 탭해 먹이를 꺼내요. 합성해 주문을 맞추면 부캉이가 받아먹어요!', 5000), 900);
  setInterval(save, 5000);
}
Promise.all([loadStory().catch(() => null), loadQuests()]).then(() => Promise.race([preloadAssets(), new Promise((r) => setTimeout(r, 3500))])).then(() => {
  if (!LS.get(SAVE_KEY) && S.bag.length === 0) S.bag = [{ tech: 'fish', glv: 1, count: 2, nextAt: Date.now() + genRegenSec(1) * 1000 }];
  bootGame();
  const qn = new URLSearchParams(location.search).get('stage');
  if (qn !== null && QCFG.list.length) { const i = Math.max(0, Math.min(QCFG.list.length - 1, parseInt(qn, 10) || 0)); S.stage = i; S.beat = Math.max(S.beat, i); initStage(); save(); }
  else if (S.inf) { updateDayUI(); syncCrowd(); }
}).catch(e => { console.warn('로드 실패', e); bootGame(); toast('데이터 파일 로드 실패', 3000); });

// 레이아웃은 부팅 전에도 1회 필요
layout();
addEventListener('resize', layout);

// ===================================================================
// ===== 메인 루프 =====
// ===================================================================
const clock = new THREE.Clock();
let foamTimer = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); simT += dt; const t = simT; uTime.value = t;
  updateCamera(dt); updateWater(t); updateShark(dt, t); updateSardine(dt, t);
  drawBoard(dt); updateUiCanvas(dt, t); Game.tick(dt, t);
  if (mode === 'path') { if (aboveWater(-0.25, 1.25, t) > 0.05) excite(0.55, 1.2); if (aboveWater(-2.5, 1.0, t) > 0.05) excite(0.65, 1.5); } else if (mode === 'dash' && hunt && t > hunt.dashEnd - 0.6) excite(0.45, 0.6); else if (mode === 'air') excite(0.9, 2);
  updateCrowd(dt);
  for (const p of people) if (p.root.visible) animPerson(p, dt, t);
  for (let i = growing.length - 1; i >= 0; i--) { const g = growing[i]; g.t += dt; const k = Math.min(1, g.t / 0.45), c1 = 1.70158, c3 = c1 + 1, u = k - 1; const s = 1 + c3 * u * u * u + c1 * u * u; g.p.root.scale.set(g.sx * s, g.sy * s, g.sz * s); if (k >= 1) growing.splice(i, 1); }
  foamTimer += dt; if (foamTimer > 0.045) { foamTimer = 0; segSplash([0.1, 0.4], [-0.25, 1.25], t, 2); segSplash([-1.75, 0.0], [-2.5, 1.0], t, 3); segSplash([-1.75, 0.0], [-2.3, -0.6], t, 2); segSplash([-2.0, 0.0], [2.0, 0.0], t, mode === 'path' ? 1 : 5); }
  for (const f of foam) { if (!f.m.visible) continue; f.life += dt; f.v.y -= 9 * dt; f.m.position.addScaledVector(f.v, dt); const p = f.m.position; if (p.z < -W2 + 0.1 && p.y < TOP) { p.z = -W2 + 0.1; f.v.z = Math.abs(f.v.z) * 0.3; } if (f.life > f.max || (f.v.y < 0 && p.y < waveY(p.x, p.z, t) - 0.3)) { f.m.visible = false; continue; } f.m.scale.setScalar(f.size * (1 - 0.7 * f.life / f.max)); }
  for (const r of ripples) { if (!r.active) continue; r.life += dt; if (r.life < 0) { r.m.visible = false; continue; } if (r.life > r.max) { r.active = false; r.m.visible = false; continue; } const k = r.life / r.max; r.m.visible = true; r.m.scale.setScalar(1 + k * r.grow); r.m.material.opacity = 0.7 * (1 - k); r.m.position.y = waveY(r.m.position.x, r.m.position.z, t) + 0.1; }
  for (const f of flashes) { if (!f.s.visible) continue; f.life += dt; if (f.life > f.max) { f.s.visible = false; continue; } const k = f.life / f.max; f.s.scale.setScalar(0.3 + 1.3 * (1 - k)); f.s.material.opacity = 1 - k; }
  screenFlashA = Math.max(0, screenFlashA - dt * 1.5); if (screenFlash) screenFlash.style.opacity = screenFlashA.toFixed(3);
  for (const s of tufts) s.rotation.z = Math.sin(t * 0.9 + s.userData.phase) * 0.18;
  for (const b of bubbles) { b.position.y += b.userData.speed * dt; b.position.x += Math.sin(t * 2 + b.position.y * 3) * 0.004; if (b.position.y > waveY(b.position.x, b.position.z, t) - 0.15) resetBubble(b); }
  for (const s of shafts) s.material.opacity = 0.05 + Math.sin(t * 0.6 + s.userData.phase) * 0.025;
  renderer.render(scene, camera);
}
animate();


