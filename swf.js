/* ==========================================================================
 *  SWF-lite runtime : AS2 MovieClip 타임라인/디스플레이리스트를 Canvas 2D로 재현
 *  - 데이터: data.js (window.SWF)  /  이미지: assets/img  /  사운드: assets/snd
 * ========================================================================== */
(function () {
  'use strict';
  const D = window.SWF;
  const TL = -16384;                 // 타임라인 배치 오브젝트의 내부 depth 오프셋 (AS2 동일)
  const W = 640, H = 480, FPS = 30;
  const I = [1, 0, 0, 1, 0, 0];

  const RT = window.RT = {
    W, H, FPS, tickNo: 0, root: null, actions: {}, buttonActions: {},
    images: {}, overlay: null, mouseDown: false, keys: {}, lastKey: 0,
    mouseListeners: [], keyListeners: [], tweens: [], paused: false, tapHooks: [], timers: [], downLatch: -1
  };

  /* ---------------------------------------------------------------- 행렬 */
  function mul(p, c) {
    return [p[0] * c[0] + p[2] * c[1], p[1] * c[0] + p[3] * c[1],
            p[0] * c[2] + p[2] * c[3], p[1] * c[2] + p[3] * c[3],
            p[0] * c[4] + p[2] * c[5] + p[4], p[1] * c[4] + p[3] * c[5] + p[5]];
  }
  function inv(m) {
    const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
            (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  }
  function tp(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function rectT(m, b, out) {
    const p = [tp(m, b[0], b[1]), tp(m, b[2], b[1]), tp(m, b[0], b[3]), tp(m, b[2], b[3])];
    for (const q of p) {
      if (q[0] < out[0]) out[0] = q[0]; if (q[1] < out[1]) out[1] = q[1];
      if (q[0] > out[2]) out[2] = q[0]; if (q[1] > out[3]) out[3] = q[1];
    }
  }
  // 컬러 트랜스폼 결합 (child 먼저, parent 나중)
  function ctMul(p, c) {
    if (!c) return p; if (!p) return c;
    return [c[0] * p[0], c[1] * p[1], c[2] * p[2], c[3] * p[3],
            c[4] * p[0] + p[4], c[5] * p[1] + p[5], c[6] * p[2] + p[6], c[7] * p[3] + p[7]];
  }
  RT.mul = mul;

  /* ------------------------------------------------------- DisplayObject */
  class DObj {
    constructor() {
      this.m = I.slice(); this.ct = null; this.al = 1; this.vis = true;
      this.par = null; this.dep = 0; this.nm = ''; this.alive = true; this.scripted = false;
      this.cd = 0; this.flt = null; this.ratio = 0; this.cid = -1;
    }
    get _parent() { return this.par; }
    get _x() { return this.m[4]; } set _x(v) { if (isFinite(v)) { this.m[4] = v; this.scripted = true; } }
    get _y() { return this.m[5]; } set _y(v) { if (isFinite(v)) { this.m[5] = v; this.scripted = true; } }
    get _visible() { return this.vis; } set _visible(v) { this.vis = !!v; }
    get _alpha() { return this.al * 100; } set _alpha(v) { this.al = v / 100; }
    get _rotation() { return Math.atan2(this.m[1], this.m[0]) * 180 / Math.PI; }
    set _rotation(v) {
      const m = this.m, sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
      let r = (v % 360) * Math.PI / 180;
      m[0] = sx * Math.cos(r); m[1] = sx * Math.sin(r); m[2] = -sy * Math.sin(r); m[3] = sy * Math.cos(r);
      this.scripted = true;
    }
    globalMatrix() { let m = this.m; for (let p = this.par; p; p = p.par) m = mul(p.m, m); return m; }
    localBounds() { return null; }
    // 전역 좌표 바운딩 박스
    getBounds() { const o = [1e9, 1e9, -1e9, -1e9]; boundsInto(this, this.globalMatrix(), o); return o[0] > o[2] ? null : o; }
    hitTest(a, b) {
      const r = this.getBounds(); if (!r) return false;
      if (typeof a === 'number') return a >= r[0] && a <= r[2] && b >= r[1] && b <= r[3];
      const q = a.getBounds && a.getBounds(); if (!q) return false;
      return !(q[0] > r[2] || q[2] < r[0] || q[1] > r[3] || q[3] < r[1]);
    }
    removeMovieClip() { if (this.par && this.dep >= 0) this.par.removeChild(this); }
    kill() { this.alive = false; if (this.kids) for (const k of this.kids) k.kill(); if (this.recObjs) for (const k of this.recObjs) k && k.kill(); }
  }
  class Shape extends DObj {
    constructor(cid) { super(); this.cid = cid; this.kind = 'shape'; }
    localBounds() { const s = D.shapes[this.cid]; return [s[2], s[3], s[4], s[5]]; }
  }
  class Morph extends DObj {
    constructor(cid) { super(); this.cid = cid; this.kind = 'morph'; }
    localBounds() { return D.morphs[this.cid].b; }
  }
  class Text extends DObj {
    constructor(cid) { super(); this.cid = cid; this.kind = 'text'; }
    localBounds() { return [0, 0, 80, 16]; }
  }
  class Empty extends DObj { constructor(cid) { super(); this.cid = cid; this.kind = 'empty'; } }

  function boundsInto(o, M, out) {
    if (o.kids) { for (const k of o.kids) boundsInto(k, mul(M, k.m), out); if (o.bmp && !o.bmp.disposed) rectT(M, [0, 0, o.bmp.w, o.bmp.h], out); return; }
    if (o.kind === 'button') { for (const k of o.activeRecs()) boundsInto(k, mul(M, k.m), out); return; }
    const b = o.localBounds(); if (b) rectT(M, b, out);
  }

  function create(cid) {
    if (D.shapes[cid]) return new Shape(cid);
    if (D.morphs[cid]) return new Morph(cid);
    if (D.sprites[cid]) return new Clip(cid);
    if (D.buttons[cid]) return new Button(cid);
    if (D.texts[cid]) return new Text(cid);
    return new Empty(cid);
  }

  /* ---------------------------------------------------------------- Button */
  class Button extends DObj {
    constructor(cid) {
      super(); this.cid = cid; this.kind = 'button'; this.enabled = true; this.state = 1;
      this.recs = D.buttons[cid]; this.recObjs = [];
      this.recs.forEach((r, i) => {
        const o = create(r[0]); o.m = r[3] ? r[3].slice() : I.slice(); o.ct = r[4]; o.par = this; o.dep = r[2];
        this.recObjs[i] = o;
      });
      this.recObjs.forEach(o => o.init && o.init());
      this.cf = 1;
    }
    activeRecs() { const out = []; this.recs.forEach((r, i) => { if (r[1] & this.state) out.push(this.recObjs[i]); }); return out.sort((a, b) => a.dep - b.dep); }
    hitRecs() { const out = []; this.recs.forEach((r, i) => { if (r[1] & 8) out.push(this.recObjs[i]); }); return out; }
    hitPoint(x, y) {
      const M = this.globalMatrix();
      for (const k of this.hitRecs()) { const o = [1e9, 1e9, -1e9, -1e9]; boundsInto(k, mul(M, k.m), o); if (x >= o[0] && x <= o[2] && y >= o[1] && y <= o[3]) return true; }
      return false;
    }
  }

  /* ------------------------------------------------------------------ Clip */
  class Clip extends DObj {
    constructor(cid) {
      super(); this.cid = cid; this.kind = 'clip';
      this.tl = D.sprites[cid] || { f: [[]], l: {} };
      this.tot = Math.max(1, this.tl.f.length); this.cf = 0; this.pl = true;
      this.kids = []; this.born = RT.tickNo; this.bmp = null; this.onEnterFrame = null;
    }
    init() { if (!this.cf) this._goto(1, true); }
    get _currentframe() { return this.cf; }
    get _totalframes() { return this.tot; }
    play() { this.pl = true; }
    stop() { this.pl = false; }
    gotoAndStop(f) { this.pl = false; this._goto(this._fr(f)); }
    gotoAndPlay(f) { this.pl = true; this._goto(this._fr(f)); }
    _fr(f) { if (typeof f === 'string') { const n = this.tl.l[f]; return n || this.cf; } return Math.max(1, Math.min(this.tot, f | 0)); }

    childAt(d) { for (const k of this.kids) if (k.dep === d) return k; return null; }
    addChild(o, d) {
      const old = this.childAt(d); if (old) this.removeChild(old);
      o.par = this; o.dep = d;
      let i = 0; while (i < this.kids.length && this.kids[i].dep < d) i++;
      this.kids.splice(i, 0, o);
      if (o.nm) this[o.nm] = o;
      return o;
    }
    removeChild(o) {
      const i = this.kids.indexOf(o); if (i < 0) return;
      this.kids.splice(i, 1); if (o.nm && this[o.nm] === o) delete this[o.nm];
      o.kill(); o.par = null;
    }
    attachMovie(link, name, depth, init) {
      const o = new Clip(D.exports[link]); o.nm = name;
      if (init) for (const k in init) o[k] = init[k];
      this.addChild(o, depth); o.init(); return o;
    }
    createEmptyMovieClip(name, depth) { const o = new Clip(-1); o.nm = name; this.addChild(o, depth); o.cf = 1; return o; }
    attachBitmap(bd) { this.bmp = bd; }
    /* Graphics API (lineStyle/moveTo/lineTo) */
    clear() { this.gfx = null; }
    lineStyle(w, col, a) { this._ls = { w: w || 1, c: '#' + ('000000' + (col >>> 0).toString(16)).slice(-6), a: (a === undefined ? 100 : a) / 100 }; }
    moveTo(x, y) { (this.gfx || (this.gfx = [])).push({ ls: this._ls, p: [[x, y]] }); }
    lineTo(x, y) { if (!this.gfx) this.moveTo(0, 0); this.gfx[this.gfx.length - 1].p.push([x, y]); }

    /* 타임라인 이동: 중간 프레임의 일시 오브젝트는 생성하지 않고 최종 상태만 반영 (AS2 플레이어 동작) */
    _goto(f, first, q) {
      if (!first && f === this.cf) return;
      if (first && this.tl.f.length === 0) { this.cf = 1; return; }
      const back = first || f < this.cf;
      const st = new Map();
      if (!back) for (const k of this.kids) if (k.dep < 0) st.set(k.dep - TL, { c: k.cid, obj: k });
      const from = back ? 1 : this.cf + 1;
      for (let fr = from; fr <= f; fr++) {
        const ops = this.tl.f[fr - 1]; if (!ops) continue;
        for (const op of ops) {
          if (op.rm) { st.delete(op.d); continue; }
          if (op.c !== undefined && !op.mv) { st.set(op.d, { c: op.c, m: op.m || I, ct: op.ct || null, r: op.r || 0, n: op.n || '', cd: op.cd || 0, f: op.f || null, fresh: 1 }); continue; }
          let s = st.get(op.d);
          if (!s) { if (op.c !== undefined) st.set(op.d, { c: op.c, m: op.m || I, ct: op.ct || null, r: op.r || 0, n: op.n || '', cd: op.cd || 0, f: op.f || null, fresh: 1 }); continue; }
          if (op.c !== undefined && op.c !== s.c) { s.c = op.c; s.swap = 1; }
          if (op.m) s.m = op.m; if (op.ct) s.ct = op.ct; if (op.r !== undefined) s.r = op.r;
          if (op.n) s.n = op.n; if (op.f) s.f = op.f; if (op.cd) s.cd = op.cd;
        }
      }
      // reconcile
      for (const k of this.kids.slice()) {
        if (k.dep >= 0) continue;
        const s = st.get(k.dep - TL);
        if (s && s.obj === k) continue;
        if (back && s && !s.obj && s.c === k.cid) { s.obj = k; continue; }
        this.removeChild(k);
      }
      this.cf = f;
      const created = [];
      for (const [d, s] of [...st.entries()].sort((a, b) => a[0] - b[0])) {
        let o = s.obj;
        if (o && s.swap) {
          if ((o.kind === 'shape' && D.shapes[s.c]) || (o.kind === 'morph' && D.morphs[s.c])) o.cid = s.c;
          else { const keep = o.m; this.removeChild(o); o = null; s.m = s.m || keep; }
        }
        if (!o) {
          o = create(s.c); o.nm = s.n || ''; o.m = (s.m || I).slice(); o.ct = s.ct || null;
          o.ratio = s.r || 0; o.cd = s.cd ? TL + s.cd : 0; o.flt = s.f || null;
          this.addChild(o, TL + d); created.push(o);
          continue;
        }
        if (s.m && !o.scripted) o.m = s.m.slice();
        if (s.ct) o.ct = s.ct; if (s.r !== undefined) o.ratio = s.r;
        if (s.f) o.flt = s.f; if (s.cd) o.cd = TL + s.cd;
        if (s.n && o.nm !== s.n) { if (o.nm && this[o.nm] === o) delete this[o.nm]; o.nm = s.n; this[o.nm] = o; }
      }
      // AS2 순서: 디스플레이 리스트는 즉시 구성, 프레임 스크립트는 부모 → 자식 순으로 실행
      const mine = q || [];
      const act = RT.actions[this.cid];
      if (act && act[f]) mine.push(() => { if (this.alive) act[f].call(this, this); });
      for (const o of created) if (o.kind === 'clip' && o.alive && !o.cf) o._goto(1, true, mine);
      if (!q) for (let i = 0; i < mine.length; i++) mine[i]();
    }
  }
  RT.Clip = Clip;

  /* ------------------------------------------------------------ BitmapData */
  class BitmapData {
    constructor(w, h) { this.w = w; this.h = h; this.s = 2; this.cv = document.createElement('canvas'); this.cv.width = w * this.s; this.cv.height = h * this.s; this.cx = this.cv.getContext('2d'); this.disposed = false; }
    clear() { this.cx.setTransform(1, 0, 0, 1, 0, 0); this.cx.clearRect(0, 0, this.cv.width, this.cv.height); }
    draw(obj, tx, ty) {   // obj의 내용(자신의 행렬 제외)을 (tx,ty) 이동하여 그림
      if (this.disposed) return;
      const B = [this.s, 0, 0, this.s, 0, 0];
      const M = mul(B, [1, 0, 0, 1, tx, ty]);
      drawKids(this.cx, obj, M, null, 1);
      this.cx.globalAlpha = 1; this.cx.shadowBlur = 0;
    }
    dispose() { this.disposed = true; }
  }
  RT.BitmapData = BitmapData;

  /* ------------------------------------------------------------- 렌더링 */
  const tintCache = new Map();
  function tinted(cid, img, ct) {
    const key = cid + '|' + ct.slice(0, 3).join(',') + '|' + ct.slice(4, 7).join(',');
    let c = tintCache.get(key); if (c) return c;
    c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      p[i] = p[i] * ct[0] + ct[4]; p[i + 1] = p[i + 1] * ct[1] + ct[5]; p[i + 2] = p[i + 2] * ct[2] + ct[6];
    }
    x.putImageData(d, 0, 0); tintCache.set(key, c); return c;
  }
  const morphCache = new Map();
  function lerpHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = ((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t,
          g = ((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t,
          bl = (pa & 255) * (1 - t) + (pb & 255) * t;
    return [r | 0, g | 0, bl | 0];
  }
  function morphPath(cid, pi, a, b, t) {
    const key = cid + ':' + pi + ':' + t.toFixed(4);
    let p = morphCache.get(key); if (p) return p;
    const nb = b.match(/-?[\d.]+/g); let i = 0;
    const s = a.replace(/-?[\d.]+/g, v => (parseFloat(v) * (1 - t) + parseFloat(nb[i++]) * t).toFixed(2));
    p = new Path2D(s); if (morphCache.size > 400) morphCache.clear(); morphCache.set(key, p); return p;
  }
  const maskPaths = {};
  function maskPath(cid) { if (!maskPaths[cid]) maskPaths[cid] = (D.masks[cid] || []).map(d => new Path2D(d)); return maskPaths[cid]; }

  function setT(ctx, M) { ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); }

  function drawObj(ctx, o, M, ct, alpha) {
    if (!o.vis || !o.alive) return;
    if (o.cd) return;                                  // 마스크 자체는 그리지 않음
    const M2 = mul(M, o.m);
    const ct2 = ctMul(ct, o.ct);
    let a = alpha * o.al;
    const ca = ct2 ? Math.max(0, Math.min(1, ct2[3] + ct2[7] / 255)) : 1;
    if (a * ca <= 0.002) return;
    if (o.flt) return drawFiltered(ctx, o, M2, ct2, a);
    drawInner(ctx, o, M2, ct2, a);
  }
  function drawInner(ctx, o, M, ct, a) {
    const ca = ct ? Math.max(0, Math.min(1, ct[3] + ct[7] / 255)) : 1;
    switch (o.kind) {
      case 'shape': {
        const s = D.shapes[o.cid], img = RT.images[o.cid]; if (!img) return;
        setT(ctx, M); ctx.globalAlpha = a * ca;
        const src = ct && (ct[0] !== 1 || ct[1] !== 1 || ct[2] !== 1 || ct[4] || ct[5] || ct[6]) ? tinted(o.cid, img, ct) : img;
        ctx.drawImage(src, s[2], s[3], s[4] - s[2], s[5] - s[3]);
        return;
      }
      case 'morph': {
        const md = D.morphs[o.cid], t = o.ratio / 65535;
        setT(ctx, M);
        md.p.forEach((p, i) => {
          const path = morphPath(o.cid, i, p.d[0], p.d[1], t);
          if (p.fill) { const c = lerpHex(p.fill[0], p.fill[1], t); ctx.globalAlpha = a * ca * (p.fo[0] * (1 - t) + p.fo[1] * t); ctx.fillStyle = 'rgb(' + c + ')'; ctx.fill(path, 'evenodd'); }
          if (p.stroke) { const c = lerpHex(p.stroke[0], p.stroke[1], t); ctx.globalAlpha = a * ca * (p.so[0] * (1 - t) + p.so[1] * t); ctx.strokeStyle = 'rgb(' + c + ')'; ctx.lineWidth = p.w[0] * (1 - t) + p.w[1] * t; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(path); }
        });
        return;
      }
      case 'text': {
        const t = D.texts[o.cid]; setT(ctx, M); ctx.globalAlpha = a * ca;
        ctx.font = (t.bold ? 'bold ' : '') + t.size + 'px sans-serif'; ctx.fillStyle = t.color; ctx.textBaseline = 'top';
        ctx.fillText(t.t, t.x + 2, t.y + 3); return;
      }
      case 'button': {
        for (const k of o.activeRecs()) drawObj(ctx, k, M, ct, a);
        return;
      }
      case 'clip': {
        if (o.bmp && !o.bmp.disposed) { setT(ctx, M); ctx.globalAlpha = a * ca; ctx.drawImage(o.bmp.cv, 0, 0, o.bmp.w, o.bmp.h); }
        if (o.gfx) {
          setT(ctx, M);
          for (const g of o.gfx) {
            if (!g.ls || g.p.length < 2) continue;
            ctx.globalAlpha = a * ca * g.ls.a; ctx.strokeStyle = g.ls.c; ctx.lineWidth = Math.max(1, g.ls.w); ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(g.p[0][0], g.p[0][1]); for (let i = 1; i < g.p.length; i++) ctx.lineTo(g.p[i][0], g.p[i][1]); ctx.stroke();
          }
        }
        drawKids(ctx, o, M, ct, a);
        return;
      }
    }
  }
  function drawKids(ctx, o, M, ct, a) {
    const ks = o.kids;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      if (k.cd) {                                        // clipDepth 마스크
        ctx.save();
        const MM = mul(M, k.m); setT(ctx, MM);
        const ps = maskPath(k.cid);
        if (ps.length) { const p = new Path2D(); ps.forEach(q => p.addPath(q)); ctx.clip(p); }
        else { const b = k.localBounds() || [0, 0, 0, 0]; ctx.beginPath(); ctx.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.clip(); }
        let j = i + 1;
        while (j < ks.length && ks[j].dep <= k.cd) { drawObj(ctx, ks[j], M, ct, a); j++; }
        ctx.restore(); i = j - 1; continue;
      }
      drawObj(ctx, k, M, ct, a);
    }
  }
  function drawFiltered(ctx, o, M, ct, a) {
    let glow = null, blur = 0;
    for (const f of o.flt) { if (f[0] === 'glow') glow = f; else if (f[0] === 'blur') blur = Math.max(blur, f[1]); }
    const sc = Math.hypot(M[0], M[1]);
    if (glow) { ctx.save(); ctx.shadowColor = glow[2]; ctx.shadowBlur = glow[1] * sc * 1.2; }
    if (blur > 0) {                                      // 수평 블러 근사 (모션 블러)
      const n = 5;
      for (let i = 0; i < n; i++) { const dx = (i / (n - 1) - 0.5) * blur; const MM = M.slice(); MM[4] += dx * sc; drawInner(ctx, o, MM, ct, a / n * 1.6); }
    } else drawInner(ctx, o, M, ct, a);
    if (glow) ctx.restore();
  }

  /* --------------------------------------------------------- 메인 루프 */
  function advance(o) {
    if (!o.alive) return;
    if (o.kind === 'clip') {
      if (o.pl && o.tot > 1 && o.born !== RT.tickNo) { let nf = o.cf + 1; if (nf > o.tot) nf = 1; o._goto(nf); }
      const ks = o.kids.slice(); for (const k of ks) if (k.alive && k.par === o) advance(k);
    } else if (o.kind === 'button') { for (const k of o.recObjs) advance(k); }
  }
  function collectEF(o, out) {
    if (!o.alive) return;
    if (o.kind === 'clip') { if (o.onEnterFrame) out.push(o); for (const k of o.kids) collectEF(k, out); }
  }
  function step() {
    RT.tickNo++;
    advance(RT.root);
    const list = []; collectEF(RT.root, list);
    for (const o of list) { const f = o.onEnterFrame; if (f && o.alive) f.call(o); }
    const now = RT.tickNo * 1000 / FPS;
    for (const t of RT.tweens.slice()) t.update(now);
    for (const t of RT.timers.slice()) {
      if (!t.alive) continue;
      if (RT.tickNo >= t.at) { if (t.rep) t.at += t.n; else t.alive = false; t.fn(); }
    }
    RT.timers = RT.timers.filter(t => t.alive);
  }

  /* ---------------------------------------------------------- Tween (mx.transitions) */
  RT.Tween = class {
    constructor(obj, prop, ease, b, e, dur) {
      this.obj = obj; this.prop = prop; this.ease = ease; this.b = b; this.c = e - b; this.d = dur * 1000;
      this.t0 = RT.tickNo * 1000 / FPS; this.onMotionFinished = null; obj[prop] = b; RT.tweens.push(this);
    }
    update(now) {
      let t = now - this.t0; const done = t >= this.d; if (done) t = this.d;
      if (this.obj.alive !== false) this.obj[this.prop] = this.ease(t, this.b, this.c, this.d);
      if (done) { RT.tweens.splice(RT.tweens.indexOf(this), 1); if (this.onMotionFinished) this.onMotionFinished(); }
    }
  };
  RT.easeIn = (t, b, c, d) => c * (t /= d) * t + b;
  // setInterval / setTimeout 대체 (프레임 기반, 일시정지 시 함께 멈춤)
  RT.setInterval = (fn, ms) => { const n = Math.max(1, Math.round(ms / 1000 * FPS)); const t = { fn, n, at: RT.tickNo + n, rep: true, alive: true }; RT.timers.push(t); return t; };
  RT.setTimeout = (fn, ms) => { const n = Math.max(1, Math.round(ms / 1000 * FPS)); const t = { fn, n, at: RT.tickNo + n, rep: false, alive: true }; RT.timers.push(t); return t; };
  RT.clearTimer = t => { if (t) t.alive = false; };

  /* --------------------------------------------------------------- 사운드 */
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = new AC();
  const master = actx.createGain(); master.connect(actx.destination);
  const buffers = {}; let voices = [];
  RT.Sound = {
    ctx: actx,
    play(name, loops) {
      const buf = buffers[name], inf = D.sounds[name]; if (!buf || !inf) return;
      loops = loops || 1;
      const off = inf[0], dur = Math.min(inf[1], buf.duration - off);
      const src = actx.createBufferSource(); src.buffer = buf; src.connect(master);
      if (loops > 1) { src.loop = true; src.loopStart = off; src.loopEnd = off + dur; src.start(0, off); if (loops < 9000) src.stop(actx.currentTime + dur * loops); }
      else src.start(0, off, dur);
      const v = { name, src }; voices.push(v);
      src.onended = () => { voices = voices.filter(x => x !== v); };
    },
    stop(name) { voices.forEach(v => { if (name === undefined || v.name === name) { try { v.src.stop(); } catch (e) {} } }); voices = voices.filter(v => !(name === undefined || v.name === name)); },
    setVolume(n) { master.gain.value = n / 100; }
  };
  function unlockAudio() { if (actx.state !== 'running') actx.resume(); }

  /* ------------------------------------------------------------ 입력 */
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  let view = { s: 1, ox: 0, oy: 0, dpr: 1, portrait: false };
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    view.portrait = h > w * 1.05 && ('ontouchstart' in window);
    const s = Math.min(w / W, h / H);
    view.s = s; view.dpr = dpr; view.ox = (w - W * s) / 2; view.oy = (h - H * s) / 2;
    needDraw = true;
  }
  function toStage(e) { return [(e.clientX - view.ox) / view.s, (e.clientY - view.oy) / view.s]; }
  RT.mouse = [0, 0];

  function visibleChain(o) { for (let p = o; p; p = p.par) { if (!p.vis || !p.alive) return false; } return true; }
  function findButton(x, y) {
    let hit = null;
    (function walk(o) {
      if (!o.vis || !o.alive) return;
      if (o.kind === 'button') { if (o.enabled && o.hitPoint(x, y)) hit = o; return; }
      if (o.kids) for (const k of o.kids) walk(k);
    })(RT.root);
    return hit;
  }
  function btnHandlers(b) {
    const h = RT.buttonActions[b.cid] || {};
    return {
      release: b.onRelease || (h.release && (() => h.release.call(b.par, b.par))),
      over: b.onRollOver || (h.over && (() => h.over.call(b.par, b.par)))
    };
  }
  let pressedBtn = null, pointers = new Set(), firstTap = true;
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); unlockAudio();
    if (firstTap) { firstTap = false; tryFullscreen(); }
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    pointers.add(e.pointerId);
    const [x, y] = toStage(e); RT.mouse = [x, y];
    if (RT.overlay) { RT.overlay.onDown(x, y); return; }
    for (const h of RT.tapHooks) h(x, y);
    RT.mouseDown = true; RT.downLatch = RT.tickNo + 1;
    const b = findButton(x, y);
    if (b) { pressedBtn = b; b.state = 6; if (b !== hoverBtn) { const h = btnHandlers(b); if (h.over) h.over(); } hoverBtn = null; }
    for (const l of RT.mouseListeners.slice()) if (l.onMouseDown) l.onMouseDown();
  }, { passive: false });
  function up(e) {
    e.preventDefault(); unlockAudio();
    pointers.delete(e.pointerId);
    const [x, y] = toStage(e);
    if (pointers.size) return;
    RT.mouseDown = false;
    if (pressedBtn) {
      const b = pressedBtn; pressedBtn = null; b.state = 1;
      if (e.type === 'pointerup' && b.alive && visibleChain(b) && b.enabled && b.hitPoint(x, y)) { const h = btnHandlers(b); if (h.release) h.release(); }
    }
    for (const l of RT.mouseListeners.slice()) if (l.onMouseUp) l.onMouseUp();
  }
  cv.addEventListener('pointerup', up, { passive: false });
  cv.addEventListener('pointercancel', up, { passive: false });
  cv.addEventListener('pointermove', e => {
    const [x, y] = toStage(e); RT.mouse = [x, y];
    if (pressedBtn) { pressedBtn.state = pressedBtn.hitPoint(x, y) ? 6 : 1; return; }
    if (e.pointerType === 'mouse' && RT.root && !RT.overlay) {
      const b = findButton(x, y);
      if (b !== hoverBtn) {
        if (hoverBtn) hoverBtn.state = 1;
        hoverBtn = b;
        if (b) { b.state = 2; const h = btnHandlers(b); if (h.over) h.over(); }
      }
    }
  });
  let hoverBtn = null;
  // 확대/스크롤/더블탭/컨텍스트메뉴 차단
  const stopEv = e => { e.preventDefault(); };
  ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'wheel', 'selectstart'].forEach(t =>
    document.addEventListener(t, stopEv, { passive: false }));
  window.addEventListener('keydown', e => {
    if (e.keyCode === 32 || (e.keyCode >= 37 && e.keyCode <= 40)) e.preventDefault();
    if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=')) e.preventDefault();
    unlockAudio();
    RT.keys[e.keyCode] = true; RT.lastKey = e.keyCode;
    for (const l of RT.keyListeners.slice()) if (l.onKeyDown) l.onKeyDown(e.keyCode);
  });
  window.addEventListener('keyup', e => { RT.keys[e.keyCode] = false; for (const l of RT.keyListeners.slice()) if (l.onKeyUp) l.onKeyUp(e.keyCode); });
  RT.Key = { isDown: c => c === 1 ? (RT.mouseDown || RT.tickNo <= RT.downLatch) : !!RT.keys[c], getCode: () => RT.lastKey, addListener: l => RT.keyListeners.push(l), removeListener: l => { RT.keyListeners = RT.keyListeners.filter(x => x !== l); } };
  RT.Mouse = { addListener: l => { if (!RT.mouseListeners.includes(l)) RT.mouseListeners.push(l); }, removeListener: l => { RT.mouseListeners = RT.mouseListeners.filter(x => x !== l); } };

  function tryFullscreen() {
    const el = document.documentElement;
    if (!('ontouchstart' in window)) return;
    const rq = el.requestFullscreen || el.webkitRequestFullscreen;
    if (rq && !document.fullscreenElement) {
      try { const p = rq.call(el, { navigationUI: 'hide' }); if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {}); } catch (e) {}
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { RT.paused = true; actx.suspend(); } else { RT.paused = false; actx.resume(); lastT = performance.now(); acc = 0; }
  });

  /* ------------------------------------------------------------- 그리기 */
  let needDraw = true;
  function render() {
    const d = view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (view.portrait) { drawRotateHint(); return; }
    const B = [view.s * d, 0, 0, view.s * d, view.ox * d, view.oy * d];
    ctx.save();
    setT(ctx, B); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    if (RT.root) drawObj(ctx, RT.root, B, null, 1);
    if (RT.overlay) { ctx.globalAlpha = 1; ctx.shadowBlur = 0; RT.overlay.draw(ctx, B); }
    ctx.restore();
  }
  function drawRotateHint() {
    const w = cv.width, h = cv.height, s = Math.min(w, h) / 360;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + (22 * s) + 'px sans-serif';
    ctx.fillText('가로 화면으로 돌려주세요', w / 2, h / 2);
    ctx.font = (14 * s) + 'px sans-serif'; ctx.fillStyle = '#aaa';
    ctx.fillText('Please rotate your device', w / 2, h / 2 + 34 * s);
    ctx.textAlign = 'start';
  }

  let lastT = 0, acc = 0;
  const FR = 1000 / FPS;
  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    let dt = t - lastT; lastT = t;
    if (RT.paused || view.portrait) { if (needDraw) { render(); needDraw = false; } return; }
    if (!RT.root) { render(); return; }
    acc += Math.min(dt, 250);
    let n = 0;
    while (acc >= FR && n < 4) { step(); acc -= FR; n++; }
    if (acc > FR) acc = 0;
    if (n || needDraw) { render(); needDraw = false; }
  }

  /* -------------------------------------------------------------- 로딩 */
  function drawLoading(p) {
    const d = view.dpr; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    const B = [view.s * d, 0, 0, view.s * d, view.ox * d, view.oy * d]; setT(ctx, B);
    ctx.fillStyle = '#334'; ctx.fillRect(170, 236, 300, 8);
    ctx.fillStyle = '#fc3'; ctx.fillRect(170, 236, 300 * p, 8);
    ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Loading... ' + Math.round(p * 100) + '%', 320, 222); ctx.textAlign = 'start';
  }
  RT.start = function (onReady) {
    resize(); window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    const jobs = []; let done = 0, total = 0;
    const tick = () => { done++; drawLoading(done / total); };
    for (const cid in D.shapes) {
      total++;
      jobs.push(new Promise(res => { const im = new Image(); im.onload = () => { RT.images[cid] = im; tick(); res(); }; im.onerror = () => { tick(); res(); }; im.src = 'assets/img/' + D.shapes[cid][0]; }));
    }
    for (const name in D.sounds) {
      total++;
      jobs.push(fetch('assets/snd/' + name + '.mp3').then(r => r.arrayBuffer())
        .then(ab => new Promise((res, rej) => actx.decodeAudioData(ab, res, rej)))
        .then(b => { buffers[name] = b; }).catch(() => {}).then(tick));
    }
    drawLoading(0);
    Promise.all(jobs).then(() => {
      // 오디오 잠금 해제/전체화면을 위해 첫 터치 대기
      RT.overlay = {
        t: 0,
        draw(c, B) {
          this.t++;
          c.globalAlpha = 1; c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
          c.globalAlpha = 0.55 + 0.45 * Math.sin(this.t / 8);
          c.fillStyle = '#fc3'; c.font = 'bold 28px sans-serif'; c.textAlign = 'center';
          c.fillText('TOUCH TO START', 320, 245);
          c.globalAlpha = 1; c.fillStyle = '#888'; c.font = '13px sans-serif';
          c.fillText('고군분투  —  화면을 터치하세요', 320, 280); c.textAlign = 'start';
        },
        onDown() {
          RT.overlay = null; unlockAudio();
          const root = new Clip(0); root.nm = '_root'; RT.root = root;
          if (onReady) onReady(root);
          root.init();
        }
      };
      requestAnimationFrame(loop);
    });
  };
})();
