/* ==========================================================================
 *  고군분투 (Go! Go! Go! Gogun!) - AS2 소스(JPEXS 디컴파일)의 1:1 JavaScript 포팅
 *  원본 클래스: SetGame, CoinItem, ItemData, MapData, AddNum, JhSound,
 *              GameMode, MouseListener, OneTime, GlobalTarget, SecurityNumber
 * ========================================================================== */
(function () {
  'use strict';
  const D = window.SWF, RT = window.RT;
  const random = n => Math.floor(Math.random() * n);          // AS2 random()
  const int = n => (n < 0 ? Math.ceil(n) : Math.floor(n));    // AS2 int()
  const trace = () => {};
  const Demo = { enabled: false };
  const LS_KEY = 'gogun_bestscore';
  const loadBest = () => { try { return Number(localStorage.getItem(LS_KEY)) || 0; } catch (e) { return 0; } };
  const saveBest = v => { try { localStorage.setItem(LS_KEY, String(v)); } catch (e) {} };

  /* ------------------------------------------------------------- GlobalTarget */
  const GlobalTarget = {
    rootFind(t) { const a = [t]; while (t && (t = t._parent)) a.push(t); return a; },
    getxy(t) {
      if (!t) return { _x: 0, _y: 0 };
      let x = 0, y = 0; for (const o of GlobalTarget.rootFind(t)) { if (o) { x += o._x; y += o._y; } }
      return { _x: x, _y: y };
    },
    getsec(t1, t2) { const a = GlobalTarget.getxy(t1), b = GlobalTarget.getxy(t2); return Math.atan2(b._y - a._y, b._x - a._x); }
  };

  /* ----------------------------------------------------------- SecurityNumber */
  class SecurityNumber {
    constructor() { this.v = 0; this.bRange = false; this.rMAX = 0; this.rMIN = 0; }
    get value() { return this.v; }
    set value(n) {
      if (this.bRange && (this.v - this.rMIN > n || this.v + this.rMAX < n)) return;   // 범위 밖 변경 거부
      this.v = n;
    }
    isRange(b) { this.bRange = !!b; } setRangeMAX(n) { this.rMAX = n || 0; } setRangeMIN(n) { this.rMIN = n || 0; }
    isSpeedHack() {}
  }

  /* ------------------------------------------------------------------- AddNum */
  class AddNum {
    constructor(scope, mc_name, length) {
      this.scope = scope; this.mc_name = mc_name; this.length = length;
      this.num = new SecurityNumber(); this.digit = false; this.left = false; this.Update();
    }
    setRange(b, max, min) { if (b) { this.num.isRange(true); if (max != null) this.num.setRangeMAX(max); if (min != null) this.num.setRangeMIN(min); } else this.num.isRange(false); }
    isSpeedHack(b) { this.num.isSpeedHack(b); }
    Add(n) { if (this.num.value + n >= 0) this.num.value = this.num.value + int(n); else this.num.value = 0; this.Update(); }
    mc(i) { return this.scope && this.scope[this.mc_name + i]; }
    Update() {
      this.resetDisit();
      const s = this.num.value.toString(); let skip = 0;
      if (this.length > 1) {
        for (let i = 0; i < this.length; i++) {
          let f = 10, m = this.mc(i);
          if (this.left) {
            if (i < s.length) { const n = Number(s.charAt(i)); if (n > 0) f = n; m && m.gotoAndStop(f); }
            else m && m.gotoAndStop(10);
          } else if (i >= this.length - s.length) {
            const n = Number(s.charAt(i - skip)); if (n > 0) f = n; m && m.gotoAndStop(f);
          } else { skip++; m && m.gotoAndStop(10); }
        }
      } else { const m = this.mc(0); m && m.gotoAndStop(this.num.value == 0 ? 10 : this.num.value); }
    }
    resetDisit() {
      if (this.digit) {
        for (let i = 0; i < this.length; i++) { const m = this.mc(i); if (m) m._visible = false; }
        const n = String(this.num.value).length;
        for (let i = 0; i < n; i++) { const m = this.left ? this.mc(i) : this.mc(this.length - i - 1); if (m) m._visible = true; }
      } else for (let i = 0; i < this.length; i++) { const m = this.mc(i); if (m) m._visible = true; }
    }
    set _num(n) { if (this.num.value >= 0 && n >= 0) this.num.v = int(n); else this.num.v = 0; this.Update(); }
    get _num() { return this.num.value; }
    set _digit(b) { this.digit = b; this.Update(); }
    set _left(b) { this.left = b; this.Update(); }
  }

  /* ------------------------------------------------------------------ JhSound */
  class JhSound {
    constructor() { this.volume = 100; }
    play(str, num) { RT.Sound.play(str, num === undefined ? 1 : num); }
    stop(str) { RT.Sound.stop(str); }
    allStop() { RT.Sound.stop(); }
    setVolume(n) { this.volume = n; RT.Sound.setVolume(n); }
    soundOn() { RT.Sound.setVolume(this.volume); } soundOff() { RT.Sound.setVolume(0); }
  }

  /* -------------------------------------------------------------- OneTime */
  class OneTime {
    constructor(time) { this.time = time; this.stime = 0; this.etime = 1; this.status = false; this.onPlay = null; this.iv = null; if (time !== undefined) this.onStart(); }
    onTime() { if (this.onPlay) this.onPlay(); if (++this.stime >= this.etime) { RT.clearTimer(this.iv); this.status = false; } }
    onStop() { RT.clearTimer(this.iv); this.status = false; }
    onStart() { if (!this.status) { this.stime = 0; this.status = true; this.iv = RT.setInterval(() => this.onTime(), this.time * 1000); } }
    set _time(n) { this.time = n; } get _time() { return this.time; }
    set _etime(n) { this.etime = n; }
  }

  /* -------------------------------------------------------- MouseListener */
  class MouseListener {
    constructor() { this.listener = {}; this.use = true; this.onMouseDown = null; this.onMouseUp = null; }
    onControl(b) {
      this.use = b;
      if (b) { this.listener.onMouseDown = this.onMouseDown; this.listener.onMouseUp = this.onMouseUp; RT.Mouse.addListener(this.listener); }
      else { this.listener.onMouseDown = this.listener.onMouseUp = null; RT.Mouse.removeListener(this.listener); }
    }
    set _use(b) { this.onControl(!!b); } get _use() { return this.use; }
  }

  /* -------------------------------------------------------------- GameMode */
  let gameModeListener = null;
  class GameMode {
    constructor(scope) { this.scope = scope; this.modearr = []; this.value = ''; this.listener = {}; }
    addMode(input, name) { this.modearr.push([String(input).toUpperCase(), name]); }
    checkOn() {
      if (gameModeListener) RT.Key.removeListener(gameModeListener);
      this.listener.onKeyDown = () => this.checkMode(); RT.Key.addListener(this.listener); gameModeListener = this.listener;
    }
    checkMode() {
      if (RT.Key.isDown(13)) { for (const m of this.modearr) if (m[0] === this.value) this.activate(m[1]); this.value = ''; }
      else this.value += String.fromCharCode(RT.Key.getCode());
    }
    activate(name) {
      GameMode.mode = name; this.scope.sound.play('snd_best');
      if (this.scope.mode2x) this.scope.mode2x._y = 10;
    }
  }
  GameMode.mode = 'normal';

  /* ---------------------------------------------------------------- MapData */
  class MapData {
    constructor() {
      this.level0 = [[2, 2, 2], [2, 2, 2, 2, 2]];
      this.level1 = [[2, 2, 1, 2, 2]];
      this.level2 = [[2, 2, 1, 1, 2, 2], [2, 2, 1, 3, 1, 2, 2], [2, 2, 2, 1, 1, 3, 1, 2, 2, 2], [2, 2, 2, 1, 3, 1, 1, 2, 2, 2]];
      this.level3 = [[2, 2, 1, 1, 2, 2], [2, 2, 1, 1, 3, 1, 1, 2, 2, 2], [2, 2, 1, 1, 1, 3, 1, 1, 2, 2], [2, 2, 1, 1, 3, 1, 1, 1, 2, 2], [2, 2, 1, 3, 1, 3, 1, 2, 2, 2]];
      this.level4 = [[2, 2, 1, 1, 2, 2], [2, 2, 1, 1, 1, 3, 1, 1, 2, 2], [2, 2, 1, 1, 3, 1, 1, 1, 2, 2], [2, 2, 1, 3, 1, 3, 1, 2, 2, 2], [2, 1, 3, 1, 3, 1, 3, 1, 2, 2]];
      this.level5 = [[2, 1, 3, 1, 3, 1, 3, 1, 2, 2], [2, 2, 2, 2, 1, 1, 1, 2, 2, 2], [2, 1, 3, 1, 3, 1, 3, 1, 3, 1], [1, 3, 1, 3, 1, 3, 1, 3, 1, 3], [2, 2, 1, 3, 1, 3, 1, 1, 2, 2]];
      this.level6 = [[2, 2, 2, 2, 1, 1, 1, 2, 2, 2], [2, 1, 3, 1, 3, 1, 3, 1, 3, 1], [1, 3, 1, 3, 1, 3, 1, 3, 1, 3], [1, 3, 1, 3, 1, 1, 3, 1, 3, 1]];
    }
    getMap(level) {
      level = level + 1;
      const p = [0, 75, 50, 40, 10, 30, 0][level] || 0;
      if (random(100) < p) return this.level0[random(this.level0.length)];
      const arr = this['level' + level]; if (!arr) return undefined;
      return arr[random(arr.length)];
    }
  }

  /* --------------------------------------------------------------- ItemData */
  class ItemData {
    constructor() { this.item = D.items; }
    getItem(map) {
      const idx = this.checkMap(map);
      if (!idx.length) return [];
      const r = [].concat(this.item[idx[random(idx.length)]]); r.shift(); return r;
    }
    checkMap(arr) { const s = String(arr), out = []; for (let i = 0; i < this.item.length; i++) if (s === String(this.item[i][0])) out.push(i); return out; }
  }

  /* --------------------------------------------------------------- CoinItem */
  class CoinItem {
    constructor(stage) {
      this.stage = stage.createEmptyMovieClip('item', 1);
      this.effect = stage.createEmptyMovieClip('effect', 2);
      this.itemdata = new ItemData(); this.itemwait = []; this.itemarr = []; this.boxarr = []; this.parr = [];
      this.depth = 1; this.pitem = 0; this.addPoint = null; this.bonusEffect = null;
    }
    addItem(map, testitem) {
      if (this.itemwait.length <= 0) {
        const it = testitem !== undefined ? testitem : this.itemdata.getItem(map);
        for (const x of it) this.itemwait.push(x);
        if (this.pitem < 8) this.pitem++; else this.pitem = 0;
        this.parr[this.pitem] = this.getItemNum(it);
        if (this.parr[this.pitem] <= 0) this.parr[this.pitem] = -1;
      }
    }
    createItem(x, y) {
      const col = [].concat(this.itemwait.length ? this.itemwait.shift() : []);
      if (col.length > 0) {
        const box = this.stage.createEmptyMovieClip('item' + this.depth, this.depth++);
        box._x = x; box._y = y; const list = [];
        for (let i = 0; i < col.length; i++) {
          const it = box.attachMovie('id_item', 'item_' + i, i);
          let n = col[i];
          if (n < 100) it.gotoAndStop(1); else { it.gotoAndStop(2); n -= 100; }
          it._x = -58.5 + (n % 4) * 37.5; it._y = -480 + Math.floor(n / 4) * 37;
          it.pitem = this.pitem; list.push(it);
        }
        this.itemarr.push(list); this.boxarr.push(box);
      }
    }
    eatItem(mc) {
      if (!mc) return;
      for (let a = 0; a < this.itemarr.length; a++) {
        const arr = this.itemarr[a];
        for (let b = 0; b < arr.length; b++) {
          const it = arr[b];
          if (mc.hitTest(it)) {
            if (it._currentframe == 1) this.parr[it.pitem]--;
            if (it._currentframe == 1) this.addPoint(2); else this.addPoint(1);
            this.onBonus();
            if (it.coin) it.coin.gotoAndStop(2);
            arr.splice(b, 1); b--;
          }
        }
      }
    }
    deleteItem(x) {
      for (let i = 0; i < this.boxarr.length; i++) {
        if (this.boxarr[i]._x < x) { this.itemarr.splice(i, 1); this.boxarr[i].removeMovieClip(); this.boxarr.splice(i, 1); i--; }
      }
    }
    onBonus() { for (let i = 0; i < this.parr.length; i++) if (this.parr[i] == 0) { this.addPoint(3); this.bonusEffect(); this.parr[i] = -1; } }
    getItemNum(item) { let n = 0; for (const c of item) for (const v of c) if (v < 100) n++; return n; }
    get _boxarr() { return this.boxarr; }
  }

  /* ---------------------------------------------------------------- SetGame */
  class SetGame {
    constructor(scope) {
      this.scope = scope;
      this.effectarr = []; this.way = 0; this.nextway = 0; this.count = 0; this.record = false; this.spacebar = false;
      this.test_map = false; this.test_item = false; this.click = false; this.status = 'run'; this.depth = 100;
      this.speed = 15; this.addspeed = 1; this.level = 0; this.block_w = 150; this.dy = 30; this.gravity = 3.5;
      this.ground = 365; this.ropespeed = 40; this.maxcount = [50, 100, 150, 200, 250, 300, 1000];
      this.facetime = null;
      this.onServerSend('gamestart');
      this.initialize();
    }
    initialize() {
      this.sound = this.scope.sound;
      this.sound.stop('snd_titlebg');
      this.sound.play('snd_gamebg', 9999);
      this.mouse = new MouseListener();
      this.mouse.onMouseDown = () => this.onMouseDown();
      this.mouse.onMouseUp = () => this.onMouseUp();
      this.mouse._use = true;
      // 스페이스바 (원본에 정의된 onKeyDown/onKeyUp 핸들러 연결)
      this.keyL = { onKeyDown: () => this.onKeyDown(), onKeyUp: () => this.onKeyUp() };
      RT.Key.addListener(this.keyL);
      if (GameMode.mode == '2x') this.addspeed = 1.5;
      this.setMovieClip();
      this.initMap();
    }
    setMovieClip() {
      const S = this.scope;
      this.stage = S.createEmptyMovieClip('stage', 1);
      this.bstage = this.stage.createEmptyMovieClip('bstage', 1);
      this.rope = this.stage.createEmptyMovieClip('rope', 2);
      this.stick = this.stage.attachMovie('id_stick', 'stick_mc', 3);
      this.stick._visible = false;
      this.itemstage = this.stage.createEmptyMovieClip('item', 4);
      this.coinitem = new CoinItem(this.itemstage);
      this.coinitem.addPoint = t => this.addPoint(t);
      this.coinitem.bonusEffect = () => this.onEffect('bonus');
      this.gstage = this.stage.createEmptyMovieClip('gogoon', 5);
      this.gogoon = this.gstage.attachMovie('id_gogoon', 'gogoon_mc', 4, { _x: 200, _y: this.ground });
      if (this.gogoon.hit_mc) this.gogoon.hit_mc._visible = false;
      this.effect = this.stage.createEmptyMovieClip('effect', 6);
      this.uistage = this.stage.createEmptyMovieClip('ui', 7);
      this.uistage.attachMovie('id_score', 'score', 1, { _x: 11, _y: 8 });
      this.score = new AddNum(this.uistage.score, 'score', 6);
      this.score._digit = true; this.score._left = true;
      this.score.setRange(true, 200, 0); this.score.isSpeedHack(true);
      this.ui_run = this.uistage.attachMovie('id_running', 'running', 2, { _x: 50, _y: 463 });
      this.catstone = S.catstone_mc;
      this.best = new AddNum(this.catstone, 'score', 7);
      this.best._num = S.bestscore > 0 ? S.bestscore : 0;
      this.effect_mc = this.gstage.createEmptyMovieClip('shadow1', 2);
      this.effect_mc2 = this.gstage.createEmptyMovieClip('shadow2', 1);
      this.bitmapdata = new RT.BitmapData(200, 200); this.effect_mc.attachBitmap(this.bitmapdata); this.effect_mc._alpha = 50;
      this.bitmapdata2 = new RT.BitmapData(200, 200); this.effect_mc2.attachBitmap(this.bitmapdata2); this.effect_mc2._alpha = 20;
    }
    onMouseDown() { this.click = true; if (this.status == 'run') this.gJump(); else if (this.status == 'jump') this.gShoot(); }
    onMouseUp() { this.click = false; }
    onKeyDown() { if (RT.Key.isDown(32) && !this.spacebar && this.mouse.use) { this.spacebar = true; this.onMouseDown(); } }
    onKeyUp() { if (this.spacebar) { this.spacebar = false; this.onMouseUp(); } }
    onStart() { this.gRun(); this.stage.onEnterFrame = () => this.onEnterFrame(); }
    initMap() {
      this.map = []; this.blockarr = []; this.item = []; this.mapdata = new MapData();
      for (let i = 0; i < 6; i++) this.createBlock(2, i * this.block_w);
      this.count = 0;
    }
    gRun() {
      this.status = 'run'; this.click = false;
      this.gogoon.gotoAndStop('run');
      this.gogoon.onEnterFrame = () => this.gRun_EnterFrame();
      this.sound.play('snd_run', 999);
    }
    gRun_EnterFrame() { if (!this.groundCheck()) this.gameOver(); }
    gJump() {
      this.status = 'jump'; this.gogoon.gotoAndStop('jump');
      this.sound.stop('snd_run'); this.sound.play('snd_ropeup');
      this.gogoon.dy = this.dy * this.addspeed;
      const g = this.gravity; this.gogoon.onEnterFrame = () => this.gJump_EnterFrame(g);
    }
    gJump_EnterFrame(gravity) {
      const go = this.gogoon;
      if (go.dy > -20) go.dy -= gravity * Math.pow(this.addspeed, 2);
      go._y -= go.dy;
      if (go.dy < 0) {
        if (this.status != 'shoot') this.status = 'jump';
        if (go._y >= this.ground && this.groundCheck()) {
          go._y = this.ground; this.rope.clear(); this.stick._visible = false;
          this.rope.onEnterFrame = null; go.onEnterFrame = null;
          this.gRun(); this.sound.stop('snd_spin');
        }
        if (this.dieCheck(470)) this.gameOver();
      }
    }
    gShoot() {
      this.status = 'shoot'; this.gogoon.gotoAndStop('shoot');
      this.sound.stop('snd_spin'); this.sound.play('snd_shoot');
      const rp = GlobalTarget.getxy(this.gogoon.ropepos), sp = GlobalTarget.getxy(this.stage);
      this.rope.tx = rp._x - sp._x; this.rope.ty = rp._y - sp._y;
      this.stick._visible = true;
      this.rope.onEnterFrame = () => this.gShoot_EnterFrame();
    }
    gShoot_EnterFrame() {
      const r = this.rope;
      if (r.ty > 0) {
        this.drawLine(r.tx += this.ropespeed + 5, r.ty -= this.ropespeed - 5);
        this.stick._x = r.tx; this.stick._y = r.ty;
        const sp = GlobalTarget.getxy(this.stage);
        const p = { _x: r.tx + sp._x, _y: r.ty + sp._y };
        this.stick._rotation = GlobalTarget.getsec(GlobalTarget.getxy(this.gogoon.ropepos), p) * 57.29577951308232;
        if (this.checkRope()) this.gRope();
      } else {
        r.clear(); this.stick._visible = false; r.onEnterFrame = null; this.status = 'jump';
      }
    }
    drawLine(tx, ty) {
      const rp = GlobalTarget.getxy(this.gogoon.ropepos), sp = GlobalTarget.getxy(this.stage);
      this.rope.clear(); this.rope.lineStyle(1, 9878196, 100);
      this.rope.moveTo(rp._x - sp._x, rp._y - sp._y); this.rope.lineTo(tx, ty);
    }
    checkRope() { for (const b of this.blockarr) if (b.rope_pos && b.rope_pos.hitTest(this.rope.tx, this.rope.ty, false)) return true; return false; }
    gRope() {
      this.gogoon.onEnterFrame = null;
      this.gogoon.gotoAndStop('rope');
      this.status = 'rope'; this.sound.play('snd_ropecatch');
      this.gogoon.dy = 15 * this.addspeed;
      if (this.rope.ty < 125) this.rope.tx -= 125 - this.rope.ty - 5;
      this.rope.ty = 125;
      this.stick._rotation = -80; this.stick.gotoAndStop(2);
      this.rope.onEnterFrame = () => this.gRope_EnterFrame();
    }
    gRope_EnterFrame() {
      const go = this.gogoon, r = this.rope;
      if (!this.dieCheck(550)) {
        this.drawLine(r.tx -= this.speed * this.addspeed, r.ty);
        this.stick._y = r.ty; this.stick._x = r.tx;
        if (go.body) go.body._rotation = GlobalTarget.getsec(go.body, { _x: r.tx, _y: r.ty }) * 57.29577951308232 + 70;
        if (this.click) {
          if (go.dy > -30) go.dy -= this.gravity * Math.pow(this.addspeed, 2);
          if (go._y < r.ty + 50) { this.gSpin(); return; }
        } else if (go.dy < 30) go.dy += this.gravity * Math.pow(this.addspeed, 2);
        go._y += go.dy;
        if (go.body && go.body._rotation < -70) { this.gSpin(); return; }
        if (r.tx < 70) this.gSpin();
      } else this.gameOver();
    }
    gSpin() {
      this.rope.onEnterFrame = null; this.rope.clear(); this.stick._visible = false;
      this.status = 'spin'; this.gogoon.gotoAndStop('spin');
      this.sound.play('snd_spin', 999);
      this.gogoon.dy = this.dy + 15 * this.addspeed;
      const g = this.gravity * 1.5; this.gogoon.onEnterFrame = () => this.gJump_EnterFrame(g);
    }
    createBlock(type, x) {
      if (type == 4) this.goFinish();
      const b = this.bstage.attachMovie('id_block', 'block_' + this.depth, this.depth++);
      b.gotoAndStop(type); this.blockarr.push(b);
      b._x = x; b._y = 520; b.type = type;
      if (!this.test_map) { this.count++; if (this.count >= this.maxcount[this.level]) this.levelUp(); }
    }
    levelUp() {
      if (this.test_map) return;
      this.level++;
      if (this.level <= 5) {
        this.count = 0;
        if (this.level < 3) this.speed += 3; else this.speed += 2;
        trace('level : ' + this.level + ', speed : ' + this.speed * this.addspeed);
        this.onEffect('speedup');
      } else {
        this.count = 0; trace('엔딩');
        this.map.push(2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4, 2, 2, 2, 2, 2, 2);
      }
    }
    goFinish() {
      this.bitmapdata.dispose(); this.bitmapdata2.dispose();
      this.stage.onEnterFrame = null; this.speed = 0; this.mouse._use = false;
      this.stage.onEnterFrame = () => this.onFinish();
      this.onFade('ending');
    }
    onFinish() {
      this.gogoon._x += 30;
      if (this.scope._currentframe == 40) {
        this.stage.onEnterFrame = null; this.onDestroy(); this.onServerSend('gameover');
        const t = new OneTime(); t._time = 10; t.onPlay = () => this.onServerSend('viewrank'); t.onStart();
      }
    }
    onFade(frame) { const f = this.scope.attachMovie('id_fadeinout', 'fadeinout', 10); f.frame = frame; this.sound.play('snd_fadeinout'); }
    onEnterFrame() {
      const v = this.speed * this.addspeed;
      this.way += v; this.nextway += v;
      for (const b of this.blockarr) b._x -= v;
      for (const b of this.coinitem._boxarr) b._x -= v;
      const nx = this.block_w * 5 - (this.nextway - this.block_w);
      if (this.block_w <= this.nextway) {
        if (this.map.length <= 0) {
          const m = this.mapdata.getMap(this.level);
          this.map = this.map.concat(m);
          this.coinitem.addItem(this.map);
        }
        const t = Number(this.map.shift());
        this.createBlock(t, nx);
        this.coinitem.createItem(nx, 520);
        this.coinitem.deleteItem(-this.block_w);
        this.deleteBlock();
        this.nextway -= this.block_w;
      }
      this.coinitem.eatItem(this.gogoon.body && this.gogoon.body.item_pos);
      this.shadowEffect();
      this.updateUI();
      const cl = this.scope.cloude_mc;
      if (cl) { cl._x -= v / 4; if (cl._x < -832) cl._x = 832 + cl._x; }
    }
    updateUI() {
      if (this.ui_run.face_mc) this.ui_run.face_mc._x = this.count / this.maxcount[this.level] * 90 + 90 * this.level;
      if (this.best._num < this.score._num && this.scope.bestscore > 0) {
        if (!this.record) this.onEffect('best');
        this.record = true;
        this.scope.bestscore = this.best._num = this.score._num; saveBest(this.scope.bestscore);
      }
    }
    changeFace() {
      if (this.facetime) this.facetime.onStop();
      this.catstone.head_mc.gotoAndStop('suprise');
      this.facetime = new OneTime(5);
      this.facetime.onPlay = () => this.catstone.head_mc.gotoAndStop('sleep');
    }
    shadowEffect() {
      this.effectarr.push([this.gogoon._x, this.gogoon._y]);
      if (this.effectarr.length > 3) this.effectarr.shift();
      if (this.effectarr.length > 0) {
        this.bitmapdata.clear();
        if (this.effectarr.length > 1) {
          this.effect_mc._x = this.effectarr[1][0] - 100; this.effect_mc._y = this.effectarr[1][1] - 100;
          this.bitmapdata.draw(this.gogoon, 100, 100);
        }
        this.bitmapdata2.clear();
        this.effect_mc2._x = this.effectarr[0][0] - 100; this.effect_mc2._y = this.effectarr[0][1] - 100;
        this.bitmapdata2.draw(this.gogoon, 100, 100);
      }
    }
    onEffect(type) {
      if (type == 'bonus') {
        this.sound.play('snd_coinbonus'); this.catstone.head_mc.gotoAndStop('eyes');
        this.effect.attachMovie('id_bonus_effect', 'bonus', 2, { _x: 191, _y: 237 });
      } else if (type == 'speedup') {
        if (this.gogoon.effect_mc) this.gogoon.effect_mc.gotoAndPlay(2);
        this.changeFace(); this.sound.play('snd_speedup');
        this.effect.attachMovie('id_speedup_effect', 'speedup', 1, { _x: 88, _y: 363 });
      } else if (type == 'best') {
        this.changeFace(); this.sound.play('snd_best');
        this.effect.attachMovie('id_best_effect', 'best', 3, { _x: 474, _y: 328 });
      }
    }
    deleteBlock() { const b = this.blockarr.shift(); if (b) b.removeMovieClip(); }
    groundCheck() { for (const b of this.blockarr) if (b.ground_pos && b.ground_pos.hitTest(this.gogoon.hit_mc)) return true; return false; }
    dieCheck(n) { return this.gogoon._y > n; }
    addPoint(type) {
      if (type == 1) { this.score.Add(5.1); this.sound.play('snd_silvercoin'); }
      else if (type == 2) { this.score.Add(50 - this.level * 5 + 0.1); this.sound.play('snd_goldcoin'); }
      else if (type == 3) this.score.Add(100 + this.level * 20 + 0.1);
    }
    gameOver() {
      this.gogoon.onEnterFrame = null; this.rope.onEnterFrame = null; this.stage.onEnterFrame = null;
      this.sound.allStop(); this.sound.play('snd_gameover');
      if (this.scope.bestscore < this.score._num || this.scope.bestscore == undefined) { this.scope.bestscore = this.score._num; saveBest(this.scope.bestscore); }
      if (this.facetime) this.facetime.onStop();
      this.catstone.head_mc.gotoAndStop('smile');
      this.bitmapdata.dispose(); this.bitmapdata2.dispose();
      for (const b of this.blockarr) if (b.body) b.body.gotoAndStop(2);
      this.mouse._use = false;
      this.rope.clear(); this.stick._visible = false;
      this.gogoon.gotoAndStop('die');
      const t = new OneTime(); t._time = 0.3; t.onPlay = () => this.gDown(); t.onStart();
    }
    gDown() {
      const tw = new RT.Tween(this.gogoon, '_y', RT.easeIn, this.gogoon._y, this.gogoon._y + 250, 0.5);
      tw.onMotionFinished = () => this.gameoverPopup();
    }
    gameoverPopup() {
      this.onServerSend('gameover');
      const p = this.uistage.attachMovie('id_gameover', 'gameover', 5, { _x: 230, _y: 50 });
      p.btn_replay.onRelease = () => this.reStart();
      p.btn_replay.onRollOver = p.btn_help.onRollOver = p.btn_rank.onRollOver = () => this.sound.play('snd_ropecatch');
      p.btn_help.onRelease = () => { this.onDestroy(); this.sound.play('snd_titlebg', 9999); this.scope.gotoAndStop('help'); };
      p.btn_rank.onRelease = () => { this.sound.play('snd_btn'); this.onServerSend('viewrank'); };
    }
    onDestroy() {
      RT.Key.removeListener(this.keyL);
      if (this.catstone && this.catstone.head_mc) this.catstone.head_mc.gotoAndStop('sleep');
      this.uistage.removeMovieClip(); this.rope.removeMovieClip(); this.gogoon.removeMovieClip();
      this.stage.removeMovieClip(); this.itemstage.removeMovieClip();
    }
    reStart() { this.onDestroy(); this.sound.play('snd_btn'); this.scope.gotoAndStop('reset'); }
    onServerSend(type) {
      // 원본: _global.ServerConnection (한게임 서버) → 로컬 기록 팝업으로 대체
      if (type == 'viewrank') showRank(this.scope, this.score._num, this.scope._currentframe == 40);
    }
  }

  /* ------------------------------------------------ 랭킹(로컬 기록) 팝업 - canvas */
  function showRank(root, last, ending) {
    if (RT.overlay) return;
    const bx = 170, by = 120, bw = 300, bh = 230, btn = [250, 300, 140, 34];
    RT.overlay = {
      draw(c) {
        c.globalAlpha = 0.6; c.fillStyle = '#000'; c.fillRect(0, 0, 640, 480);
        c.globalAlpha = 1;
        rr(c, bx, by, bw, bh, 18); c.fillStyle = '#2b3446'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#f7b733'; c.stroke();
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffd34d'; c.font = 'bold 26px sans-serif'; c.fillText('RANKING', 320, by + 38);
        c.fillStyle = '#cfd8e8'; c.font = '15px sans-serif';
        c.fillText('최고 기록', 320, by + 80);
        c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.fillText(String(root.bestscore || 0), 320, by + 110);
        c.fillStyle = '#cfd8e8'; c.font = '14px sans-serif'; c.fillText('이번 점수  ' + (last || 0), 320, by + 148);
        rr(c, btn[0], btn[1], btn[2], btn[3], 17); c.fillStyle = '#f7b733'; c.fill();
        c.fillStyle = '#3a2400'; c.font = 'bold 16px sans-serif'; c.fillText(ending ? '타이틀로' : '닫기', 320, btn[1] + 17);
        c.textAlign = 'start'; c.textBaseline = 'alphabetic';
      },
      onDown(x, y) {
        if (x >= btn[0] && x <= btn[0] + btn[2] && y >= btn[1] && y <= btn[1] + btn[3]) {
          RT.overlay = null; root.sound.play('snd_btn');
          if (ending) { root.sound.allStop(); root.gotoAndStop('title'); }
        }
      }
    };
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ======================================================= 프레임 스크립트 */
  const A = RT.actions = {};
  const on = (cid, f, fn) => { (A[cid] || (A[cid] = {}))[f] = fn; };
  const stopAt = [264, 329, 241, 263, 338, 260, 317, 305, 250, 324, 332, 465, 489, 294];
  stopAt.forEach(c => on(c, 1, s => s.stop()));
  on(534, 115, s => s.stop());
  [[72, 27], [129, 29], [182, 27], [220, 41], [340, 35]].forEach(([c, f]) => on(c, f, s => s.removeMovieClip()));
  on(259, 9, s => s._parent && s._parent._parent && s._parent._parent.removeMovieClip());
  on(294, 9, s => s.gotoAndStop(1));
  on(335, 5, s => s._parent.gotoAndStop(1));
  on(464, 45, s => s._parent.gotoAndStop(1));
  on(340, 15, s => s._parent.gotoAndStop(s.frame));
  on(273, 1, s => { if (s.hit_box) s.hit_box._visible = false; });
  on(186, 1, s => s.gotoAndStop(2));

  /* --- 게임방법(help) 하위 애니메이션 --- */
  const snd = s => s._parent._parent.sound;
  const showNext = s => { if (!Demo.enabled && s._parent.btn_next) s._parent.btn_next._visible = true; };
  const waitClick = s => {
    s.stop(); const owner = s;
    if (!Demo.enabled) {
      if (s._parent.mouse_mc) s._parent.mouse_mc._visible = true;
      s._parent.onEnterFrame = function () {
        if (RT.Key.isDown(1)) { this.onEnterFrame = null; this._parent.sound.play('snd_click'); owner.play(); }
      };
    } else s.play();
  };
  const hideMouse = s => { if (s._parent.mouse_mc) s._parent.mouse_mc._visible = false; };
  on(518, 38, waitClick); on(518, 46, waitClick);
  on(518, 39, s => { hideMouse(s); snd(s).stop('snd_run'); snd(s).play('snd_ropeup'); });
  on(518, 47, s => { hideMouse(s); snd(s).play('snd_shoot'); });
  on(518, 51, s => snd(s).play('snd_ropecatch'));
  on(518, 84, showNext);
  on(508, 1, s => { snd(s).stop('snd_run'); snd(s).play('snd_run', 999); });
  on(508, 36, waitClick);
  on(508, 37, s => { hideMouse(s); snd(s).stop('snd_run'); snd(s).play('snd_ropeup'); });
  on(508, 58, s => snd(s).play('snd_run', 999));
  on(508, 68, showNext);
  on(533, 1, s => snd(s).stop('snd_run'));
  on(533, 2, s => snd(s).play('snd_shoot'));
  on(533, 5, s => snd(s).play('snd_ropecatch'));
  on(533, 32, s => snd(s).play('snd_spin', 99));
  on(533, 50, s => { snd(s).stop('snd_spin'); snd(s).play('snd_run', 99); });
  on(533, 57, showNext);
  on(529, 1, s => snd(s).stop('snd_run'));
  on(529, 2, s => snd(s).play('snd_shoot'));
  on(529, 5, s => snd(s).play('snd_ropecatch'));
  on(529, 63, s => snd(s).play('snd_shoot'));
  on(529, 66, s => snd(s).play('snd_ropecatch'));
  on(529, 117, showNext);
  on(494, 55, showNext);
  /* how_mc (535) */
  const hideNext = s => { s.stop(); if (s.btn_next) s.btn_next._visible = false; };
  on(535, 1, s => { if (s.mouse_mc) s.mouse_mc._visible = false; s._parent.sound.play('snd_run', 9999); });
  [46, 85, 123, 169, 215].forEach(f => on(535, f, hideNext));
  [47, 86].forEach(f => on(535, f, s => { s.onEnterFrame = null; if (s.mouse_mc) s.mouse_mc._visible = false; s._parent.sound.stop('snd_run'); }));
  [124, 170].forEach(f => on(535, f, s => { s.onEnterFrame = null; if (s.mouse_mc) s.mouse_mc._visible = false; }));
  on(535, 216, s => { s.onEnterFrame = null; if (s.mouse_mc) s.mouse_mc._visible = false; s._parent.sound.stop('snd_spin'); s._parent.sound.stop('snd_run'); s._parent.sound.play('snd_run', 9999); });
  on(535, 268, s => s.stop());

  /* --- 메인 타임라인 --- */
  on(0, 1, root => {
    root.stop();
    if (root.sound) root.sound.allStop();
    root.sound = new JhSound();
    root.sound.play('snd_titlebg', 9999);
    root.gamemode = new GameMode(root);
    root.gamemode.addMode('qkrwkdgml', '2x');
    root.gamemode.checkOn();
    if (GameMode.mode == '2x' && root.mode2x) root.mode2x._y = 10;
  });
  on(0, 21, root => { root.game = new SetGame(root); root.game.onStart(); });
  on(0, 31, root => root.gotoAndStop('game'));
  on(0, 40, root => {
    root.sound.allStop(); root.sound.play('snd_allclear');
  });

  /* --- 버튼 스크립트 (on(release)/on(rollOver)) : scope = 버튼이 있는 타임라인 --- */
  const B = RT.buttonActions = {};
  B[439] = { release: s => { s.sound.play('snd_btn'); s.gotoAndStop('game'); }, over: s => s.sound.play('snd_ropecatch') };
  B[440] = { release: s => { s.sound.play('snd_btn'); s.gotoAndStop('help'); }, over: s => s.sound.play('snd_ropecatch') };
  B[499] = {
    release: s => { s.onEnterFrame = null; const r = s._parent; r.sound.stop('snd_run'); r.sound.stop('snd_spin'); r.sound.play('snd_btn'); r.gotoAndStop('game'); },
    over: s => s._parent.sound.play('snd_ropecatch')
  };
  B[506] = { release: s => s.play(), over: s => s._parent.sound.play('snd_ropecatch') };
  B[509] = { release: s => { if (s.mouse_mc) s.mouse_mc._visible = false; s.play(); }, over: s => s._parent.sound.play('snd_ropecatch') };

  /* --- 모바일용 1.5x 모드 비밀 입력: 타이틀 우측 상단을 5번 연속 터치 (원본: 키보드 'qkrwkdgml'+Enter) --- */
  let secret = 0, secretT = 0;
  RT.tapHooks.push((x, y) => {
    const root = RT.root; if (!root || root._currentframe !== 1) return;
    if (x > 560 && y < 70) {
      if (RT.tickNo - secretT > 30) secret = 0;
      secretT = RT.tickNo;
      if (++secret >= 5 && GameMode.mode !== '2x') { secret = 0; root.gamemode.activate('2x'); }
    }
  });
  /* --- 엔딩 화면: 터치하면 기록 팝업 (원본은 10초 후 서버 랭킹 팝업) --- */
  RT.tapHooks.push(() => {
    const root = RT.root; if (!root || root._currentframe !== 40 || root.stage) return;
    showRank(root, root.game ? root.game.score._num : 0, true);
  });

  RT.start(root => { root.bestscore = loadBest(); });
})();
