// tutorial.js — 현대 캐주얼 게임식 순차 튜토리얼
// 스포트라이트(딤+구멍) + 자동 시연(데모) + [다음] 버튼으로 진행.
// main.js의 실제 게임 로직(demo API)을 빌려와 진짜 플레이처럼 시연한다.
// 사용: startTutorial(api) — api는 main.js의 buildTutApi()가 만들어 전달.

export function startTutorial(api) {
  const st = { f1: 6 };            // 스텝 간 공유 상태 (생산된 먹이 칸)
  const root = document.createElement('div');
  root.id = 'tutRoot';
  root.innerHTML =
    '<div class="tutSpot"><div class="tutHand">👆</div></div>' +
    '<div class="tutTip"><div class="tutTitle"></div><div class="tutText"></div>' +
    '<div class="tutFoot"><button class="tutSkip">건너뛰기</button><button class="tutNext">다음 ▶</button></div></div>';
  api.app.appendChild(root);
  const spot = root.querySelector('.tutSpot');
  const tip = root.querySelector('.tutTip');
  const tTitle = root.querySelector('.tutTitle');
  const tText = root.querySelector('.tutText');
  const nextBtn = root.querySelector('.tutNext');
  const skipBtn = root.querySelector('.tutSkip');
  let step = -1, busy = true, done = false;

  const appR = () => api.app.getBoundingClientRect();
  function btnRect(id) {
    const b = api.btnEls[id]; if (!b) return null;
    const br = b.getBoundingClientRect(), ar = appR();
    return { x: br.left - ar.left, y: br.top - ar.top, w: br.width, h: br.height };
  }
  function place(r) {
    if (!r) { spot.style.display = 'none'; return; }
    spot.style.display = 'block';
    spot.style.left = r.x + 'px'; spot.style.top = r.y + 'px';
    spot.style.width = r.w + 'px'; spot.style.height = r.h + 'px';
  }

  const steps = [
    { title: '🐟 생산', text: '생산 블록을 탭하면 가장 가까운 빈 칸에 먹이가 생산돼요.\n지금 자동으로 해볼게요!',
      target: () => api.cellRectApp(0),
      demo(cb) { st.f1 = api.tutGenTap(0); if (st.f1 < 0) st.f1 = 6; setTimeout(cb, 1000); } },
    { title: '✨ 머지', text: '같은 먹이 두 개를 합치면 한 단계 큰 먹이가 돼요.',
      target: () => api.cellRectApp(st.f1),
      demo(cb) {
        const f1 = st.f1;
        const near = api.freeCellNear(f1);
        const c2 = api.tutSpawnAt(near, 'fish', 1, 0);
        setTimeout(() => { api.tutMerge(c2, f1); setTimeout(cb, 900); }, 700);
      } },
    { title: '🍣 먹이주기', text: '주문 트레이에 필요한 재료가 모이면 트레이를 탭해서\n부캉이에게 먹이를 주세요! 코인을 벌 수 있어요.',
      target: () => api.plateRectApp(0),
      demo(cb) { api.tutFeed('fish', 2); setTimeout(cb, 1700); } },
    { title: '🎒 가방에 넣기', text: '보드의 아이템을 가방 버튼으로 끌어다 놓으면\n보관할 수 있어요.',
      target: () => btnRect('bag'), tipPos: 'top',
      demo(cb) {
        const idx = api.tutSpawnAt(api.freeCellNear(0), 'fish', 1, 0);
        setTimeout(() => { api.dropToButton(idx, 'bag'); setTimeout(cb, 900); }, 600);
      } },
    { title: '💰 판매', text: '판매 버튼으로 끌어다 놓으면 아이템을 코인으로 바꿔요.',
      target: () => btnRect('sell'), tipPos: 'top',
      demo(cb) {
        const idx = api.tutSpawnAt(api.freeCellNear(0), 'fish', 1, 0);
        setTimeout(() => { api.dropToButton(idx, 'sell'); setTimeout(cb, 900); }, 600);
      } },
    { title: '🛒 상점', text: '상점에서는 식재료와 골드를 살 수 있어요.\n직접 열어서 구경해 보세요!',
      target: () => btnRect('shop'), tipPos: 'top', mode: 'above',
      demo(cb) { api.tutShopDemo(); setTimeout(cb, 2600); } },
    { title: '🌊 이제 시작!', text: '기본은 다 익혔어요. 생산하고, 합치고, 먹여 주면서\n부캉이를 키워보세요!', final: true,
      demo(cb) { cb(); } },
  ];

  function show(i) {
    const s = steps[i];
    root.classList.toggle('tutAbove', s.mode === 'above');
    spot.style.display = s.final || s.mode === 'above' ? 'none' : 'block';
    tip.classList.toggle('top', !!s.tipPos || s.final);
    if (s.final) tip.classList.add('center');
    place(s.target && !s.final ? s.target() : null);
    tTitle.textContent = s.title;
    tText.textContent = s.text;
    busy = true; nextBtn.disabled = true;
    setTimeout(() => s.demo(() => { busy = false; nextBtn.disabled = false; }), 550);
  }
  function next() {
    if (busy || done) return;
    if (step >= steps.length - 1) return finish();
    show(++step);
  }
  function finish() {
    if (done) return; done = true;
    root.classList.add('tutOut');
    api.finish();
    setTimeout(() => root.remove(), 450);
  }

  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); next(); });
  skipBtn.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
  root.addEventListener('click', () => { if (!busy && !done) next(); });

  show(0);
}
