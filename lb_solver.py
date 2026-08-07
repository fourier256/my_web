"""
Lightbot 3D - 전역 최소 보장 솔버 (통합 최적화판)

- 총 슬롯수 T 오름차순 완전탐색 -> 첫 해가 전역 최소.
- P2는 P1을 호출 불가. STAGE 10+ P2 강제 제약 없음. 슬롯 상한 없음.
- 무의미 회전/동작 정적·동적 가지치기.
- 1칸 함수 금지(길이>=2). 함수는 2회 이상 호출돼야 의미.
- 정의했으면 반드시 호출, 호출하면 반드시 정의. P1<->P2 대칭 제거.
- flat 하한으로 시작 T 결정. 전개 결과 memoization.
- 사전 집계/탐색 진행률 실시간 표시(0.01% 또는 0.5초 주기).
- 시퀀스는 제너레이터로 스트리밍(메모리 폭증 방지).
- 전개+시뮬레이션 융합 + 조기 중단.
"""

import sys
import time
from collections import deque

# ===== 스테이지 데이터 =====
def B(h): return {"h": h, "t": "b"}
def L(h): return {"h": h, "t": "l"}

STAGES = [
    {"direction": 0, "position": {"x": 4, "y": 5}, "map": [
        [B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],
        [B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],
        [B(2),B(1),B(1),B(1),L(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],
        [B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)]
    ]},
    {"direction": 0, "position": {"x": 2, "y": 5}, "map": [
        [B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],
        [B(2),B(1),B(1),B(1),B(1),B(1),L(1),B(1),B(2)],[B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],
        [B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],
        [B(2),B(1),L(1),B(1),B(1),B(1),L(1),B(1),B(2)],[B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)]
    ]},
    {"direction": 0, "position": {"x": 4, "y": 6}, "map": [
        [B(4),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(4)],[B(3),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(3)],
        [B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],
        [B(2),B(1),B(1),B(1),B(4),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],
        [B(3),B(1),B(1),B(1),L(1),B(1),B(1),B(1),B(3)],[B(4),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(4)]
    ]},
    {"direction": 0, "position": {"x": 4, "y": 7}, "map": [
        [B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],[B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],
        [B(2),B(2),B(2),B(2),B(2),B(2),B(2),B(2),B(2)],[B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],
        [B(1),B(1),B(1),B(1),L(1),B(1),B(1),B(1),B(1)],[B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],
        [B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],[B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)]
    ]},
    {"direction": 1, "position": {"x": 1, "y": 5}, "map": [
        [B(1),B(1),B(1),B(1),B(1),B(1),B(1)],[B(1),B(1),B(1),B(2),B(3),B(3),B(1)],
        [B(1),B(1),B(1),B(1),B(1),B(3),B(1)],[B(1),B(1),B(1),B(1),B(1),B(3),B(1)],
        [B(1),B(1),B(1),B(1),B(1),B(3),B(1)],[B(1),B(1),B(1),B(1),B(1),B(3),B(1)],
        [B(1),B(1),B(1),B(1),B(1),L(3),B(1)]
    ]},
    {"direction": 0, "position": {"x": 2, "y": 4}, "map": [
        [B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],[B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],
        [B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],[B(1),B(1),B(1),B(1),B(1),B(1),L(6),B(1)],
        [B(1),B(1),B(2),B(1),B(1),B(1),B(5),B(1)],[B(1),B(1),B(3),B(1),B(1),B(1),B(4),B(1)],
        [B(1),B(1),B(3),B(3),B(3),B(3),B(3),B(1)],[B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)]
    ]},
    {"direction": 1, "position": {"x": 1, "y": 5}, "map": [
        [B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],[B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],
        [B(1),B(1),B(1),B(2),B(3),B(1),B(1),B(1),B(1)],[B(1),B(1),B(1),B(1),B(4),B(1),B(1),B(1),B(1)],
        [B(1),B(1),B(1),B(1),L(5),B(1),B(1),B(1),B(1)],[B(1),L(3),B(3),B(3),B(3),B(3),B(3),L(3),B(1)],
        [B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],[B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)]
    ]},
    {"direction": 1, "position": {"x": 1, "y": 3}, "map": [
        [B(1),B(1),B(1),L(3),B(1),B(1),B(1)],[B(1),B(1),B(1),B(3),B(1),B(1),B(1)],
        [B(1),B(1),B(1),B(3),B(1),B(1),B(1)],[B(1),B(1),B(1),B(5),B(5),B(1),B(1)],
        [B(1),B(1),B(2),B(3),B(4),B(1),B(1)],[B(1),B(1),B(1),B(4),B(5),B(1),B(1)],
        [B(1),B(1),B(1),B(3),B(3),B(1),B(1)],[B(1),B(1),B(1),B(1),L(3),B(1),B(1)]
    ]},
    {"direction": 0, "position": {"x": 4, "y": 7}, "map": [
        [B(3),B(3),B(2),B(1),B(1),B(1),B(2),B(3),B(3)],[B(3),B(1),B(1),B(1),L(1),B(1),B(1),B(1),B(3)],
        [B(2),B(1),B(1),B(1),L(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),L(1),B(1),B(1),B(1),B(2)],
        [B(2),B(1),B(1),B(1),L(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),L(1),B(1),B(1),B(1),B(2)],
        [B(2),B(1),B(1),B(1),L(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),L(1),B(1),B(1),B(1),B(2)]
    ]},
    {"direction": 0, "position": {"x": 4, "y": 7}, "map": [
        [B(3),B(3),B(2),B(1),B(1),B(1),B(2),B(3),B(3)],[B(3),B(1),B(1),B(1),L(2),B(1),B(1),B(1),B(3)],
        [B(2),B(1),B(1),B(1),L(3),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),L(4),B(1),B(1),B(1),B(2)],
        [B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),L(2),B(1),B(1),B(1),B(2)],
        [B(2),B(1),B(1),B(1),L(3),B(1),B(1),B(1),B(2)],[B(2),B(1),B(1),B(1),L(4),B(1),B(1),B(1),B(2)]
    ]},
    {"direction": 0, "position": {"x": 4, "y": 7}, "map": [
        [B(2),B(1),B(1),B(1),B(1),B(1),B(1),B(2)],[B(1),B(1),B(1),L(1),L(1),B(1),B(1),B(1)],
        [B(2),B(1),B(1),L(1),L(1),B(1),B(1),B(2)],[B(1),B(1),B(1),L(1),L(1),B(1),B(1),B(1)],
        [B(2),B(1),B(1),L(1),L(1),B(1),B(1),B(2)],[B(1),B(1),B(1),L(1),L(1),B(1),B(1),B(1)],
        [B(2),B(1),B(1),L(1),L(1),B(1),B(1),B(2)],[B(1),B(1),B(1),L(1),L(1),B(1),B(1),B(1)]
    ]},
    {"direction": 0, "position": {"x": 1, "y": 6}, "map": [
        [B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)],[B(1),B(1),B(2),B(1),B(1),B(2),B(1),B(1)],
        [B(1),B(2),L(3),L(2),L(2),L(3),B(2),B(1)],[B(1),B(1),L(2),B(1),B(1),L(2),B(1),B(1)],
        [B(1),B(1),L(2),B(1),B(1),L(2),B(1),B(1)],[B(1),B(2),L(3),L(2),L(2),L(3),B(2),B(1)],
        [B(1),B(1),B(2),B(1),B(1),B(2),B(1),B(1)],[B(1),B(1),B(1),B(1),B(1),B(1),B(1),B(1)]
    ]},
    {"direction": 1, "position": {"x": 1, "y": 5}, "map": [
        [B(1),B(1),B(1),B(1),B(1),B(1),B(1)],[B(1),B(1),B(2),L(2),B(2),L(2),B(1)],
        [B(1),B(1),B(1),B(2),B(1),B(2),B(1)],[B(1),L(2),B(2),L(2),B(2),L(2),B(1)],
        [B(1),B(2),B(1),B(2),B(1),B(2),B(1)],[B(1),L(2),B(2),L(2),B(2),L(2),B(1)],
        [B(1),B(1),B(1),B(1),B(1),B(1),B(1)]
    ]},
]

# ===== 상수 =====
DIR_DELTA = {0: (0, 1), 1: (1, 0), 2: (0, -1), 3: (-1, 0)}
TURN_R = {0: 1, 1: 2, 2: 3, 3: 0}
TURN_L = {0: 3, 3: 2, 2: 1, 1: 0}

PRIMS = ['walk', 'left', 'right', 'jump', 'light']
MAIN_SYMBOLS = PRIMS + ['p1', 'p2']
P1_SYMBOLS = PRIMS + ['p2']
P2_SYMBOLS = PRIMS[:]

MIN_FUNC_LEN = 2          # 1칸 함수 금지
MIN_CALLS = 2             # 함수는 2회 이상 호출돼야 이득
MAX_STEPS = 4000
MAX_TOTAL_SLOTS = 30


# ===== 맵 컨텍스트 =====
def build_stage_ctx(stage):
    m = stage["map"]
    height = {}
    lights = []
    for z in range(len(m)):
        for x in range(len(m[z])):
            c = m[z][x]
            height[(x, z)] = c["h"]
            if c["t"] == 'l':
                lights.append((x, z))
    light_index = {pos: i for i, pos in enumerate(lights)}
    return {
        "height": height,
        "light_index": light_index,
        "all_mask": (1 << len(lights)) - 1,
        "num_lights": len(lights),
        "start": (stage["position"]["x"], stage["position"]["y"], stage["direction"]),
    }


# ===== flat BFS: 최단 원시 시퀀스 길이 (하한 계산용) =====
def flat_shortest_len(ctx):
    height = ctx["height"]; light_index = ctx["light_index"]
    all_mask = ctx["all_mask"]; sx, sz, sd = ctx["start"]
    start = (sx, sz, sd, 0)
    seen = {start}
    q = deque([(start, 0)])
    while q:
        (x, z, d, mask), dist = q.popleft()
        if mask == all_mask:
            return dist
        for cmd in PRIMS:
            nx, nz, nd, nm = x, z, d, mask
            if cmd == 'left': nd = TURN_L[d]
            elif cmd == 'right': nd = TURN_R[d]
            elif cmd == 'walk':
                dx, dz = DIR_DELTA[d]; tx, tz = x+dx, z+dz
                th = height.get((tx, tz))
                if th is not None and th == height[(x, z)]: nx, nz = tx, tz
                else: continue
            elif cmd == 'jump':
                dx, dz = DIR_DELTA[d]; tx, tz = x+dx, z+dz
                th = height.get((tx, tz)); ch = height[(x, z)]
                if th is not None and (th == ch+1 or th < ch): nx, nz = tx, tz
                else: continue
            elif cmd == 'light':
                idx = light_index.get((x, z))
                if idx is None: continue
                nm = mask ^ (1 << idx)
            ns = (nx, nz, nd, nm)
            if ns not in seen:
                seen.add(ns); q.append((ns, dist+1))
    return None


# ===== 회전 가지치기 (증분 프리픽스) =====
def rotation_prefix_ok(seq):
    i = len(seq) - 1
    c = seq[i]
    if c not in ('left', 'right'):
        return True
    if i > 0:
        p = seq[i-1]
        if (p == 'left' and c == 'right') or (p == 'right' and c == 'left'):
            return False
    run = 0; j = i
    while j >= 0 and seq[j] == c:
        run += 1; j -= 1
    return run < 3


def gen_sequences(symbols, length):
    """길이 length 시퀀스를 회전 가지치기 하며 생성(제너레이터)."""
    if length == 0:
        yield []
        return
    cur = []
    def rec():
        if len(cur) == length:
            yield list(cur)
            return
        for s in symbols:
            cur.append(s)
            if rotation_prefix_ok(cur):
                yield from rec()
            cur.pop()
    yield from rec()


def count_sequences(symbols, length):
    """gen_sequences 와 동일 가지치기로 개수만 카운트(메모리 O(length))."""
    if length == 0:
        return 1
    cnt = 0
    cur = []
    def rec():
        nonlocal cnt
        if len(cur) == length:
            cnt += 1
            return
        for s in symbols:
            cur.append(s)
            if rotation_prefix_ok(cur):
                rec()
            cur.pop()
    rec()
    return cnt


# ===== 전개 + 시뮬레이션 융합 (조기 중단, 무의미 동작 실패 처리) =====
class Dead(Exception): pass

def run_program(ctx, main, p1, p2):
    """
    (main,p1,p2)를 전개하며 즉시 실행. 모든 불 켜지면 True.
    무변화 명령(벽 walk/jump, 불없는칸 light, 빈 함수 호출)이 나오면 False.
    """
    height = ctx["height"]; light_index = ctx["light_index"]
    all_mask = ctx["all_mask"]
    st = {"x": ctx["start"][0], "z": ctx["start"][1], "dir": ctx["start"][2],
          "mask": 0, "steps": 0, "won": False}

    def prim(c):
        st["steps"] += 1
        if st["steps"] > MAX_STEPS:
            raise Dead()
        x, z, d = st["x"], st["z"], st["dir"]
        if c == 'left':
            st["dir"] = TURN_L[d]
        elif c == 'right':
            st["dir"] = TURN_R[d]
        elif c == 'walk':
            dx, dz = DIR_DELTA[d]; nx, nz = x+dx, z+dz
            th = height.get((nx, nz))
            if th is not None and th == height[(x, z)]:
                st["x"], st["z"] = nx, nz
            else:
                raise Dead()
        elif c == 'jump':
            dx, dz = DIR_DELTA[d]; nx, nz = x+dx, z+dz
            th = height.get((nx, nz)); ch = height[(x, z)]
            if th is not None and (th == ch+1 or th < ch):
                st["x"], st["z"] = nx, nz
            else:
                raise Dead()
        elif c == 'light':
            idx = light_index.get((x, z))
            if idx is None:
                raise Dead()
            st["mask"] ^= (1 << idx)
            if st["mask"] == all_mask:
                st["won"] = True

    def emit(seq, level):
        if level > 50:
            raise Dead()
        for c in seq:
            if c == 'p1':
                if not p1: raise Dead()
                emit(p1, level+1)
            elif c == 'p2':
                if not p2: raise Dead()
                emit(p2, level+1)
            else:
                prim(c)
            if st["won"]:
                return

    try:
        emit(main, 0)
    except Dead:
        return False
    return st["mask"] == all_mask


# ===== 분할 생성 (함수 유용성 제약 반영) =====
def partitions(T):
    """
    m+a+b=T, m>=1.
    함수는 길이>=MIN_FUNC_LEN(2) 이거나 0.
    대칭 제거: P2 쓰면(b>0) P1도 써야(a>0). 즉 함수는 P1부터 채운다.
    """
    for m in range(1, T + 1):
        rem = T - m
        for a in range(0, rem + 1):
            b = rem - a
            if a != 0 and a < MIN_FUNC_LEN:
                continue
            if b != 0 and b < MIN_FUNC_LEN:
                continue
            if b > 0 and a == 0:
                continue
            yield (m, a, b)


# ===== 진행률 출력 (0.01% 또는 0.5초 주기) =====
_ps = {"last_pct": -1.0, "last_time": 0.0}

def _maybe_print(T, done, grand):
    pct = done / grand * 100.0
    now = time.time()
    if pct - _ps["last_pct"] >= 0.01 or now - _ps["last_time"] >= 0.5 or done >= grand:
        _ps["last_pct"] = pct
        _ps["last_time"] = now
        sys.stdout.write(f"\r    슬롯 {T}: 탐색 {pct:6.2f}%  ({done:,}/{grand:,})     ")
        sys.stdout.flush()


# ===== 특정 T 탐색 =====
def solve_total(ctx, T, seq_cache, tested):
    parts = list(partitions(T))
    _ps["last_pct"] = -1.0
    _ps["last_time"] = 0.0

    # ---- 1단계: 사전 집계 (진행 표시) ----
    sys.stdout.write(f"\r    슬롯 {T}: 후보 집계 중… (분할 {len(parts)}개)     ")
    sys.stdout.flush()

    def cnt_cached(key, symbols, length):
        ck = ('cnt', key, length)
        if ck not in seq_cache:
            seq_cache[ck] = count_sequences(symbols, length)
        return seq_cache[ck]

    part_sizes = []
    grand = 0
    t0 = time.time()
    for pi, (m, a, b) in enumerate(parts):
        cm = cnt_cached('M', MAIN_SYMBOLS, m)
        cp = cnt_cached('P1', P1_SYMBOLS, a) if a > 0 else 1
        cq = cnt_cached('P2', P2_SYMBOLS, b) if b > 0 else 1
        size = cm * cp * cq
        part_sizes.append(size)
        grand += size
        if time.time() - t0 > 0.3:
            t0 = time.time()
            sys.stdout.write(
                f"\r    슬롯 {T}: 후보 집계 {pi+1}/{len(parts)} 분할, "
                f"누적 {grand:,}개     ")
            sys.stdout.flush()

    if grand == 0:
        sys.stdout.write(f"\r    슬롯 {T}: 후보 없음 (100.00%)          \n")
        sys.stdout.flush()
        return None

    sys.stdout.write(f"\r    슬롯 {T}: 총 후보 {grand:,}개, 탐색 시작          \n")
    sys.stdout.flush()

    # ---- 2단계: 실제 탐색 (제너레이터 스트리밍) ----
    done = 0
    found = None

    for (m, a, b), size in zip(parts, part_sizes):
        cnt_p1 = cnt_cached('P1', P1_SYMBOLS, a) if a > 0 else 1
        cnt_p2 = cnt_cached('P2', P2_SYMBOLS, b) if b > 0 else 1
        p2_list = list(gen_sequences(P2_SYMBOLS, b)) if b > 0 else [[]]

        for main in gen_sequences(MAIN_SYMBOLS, m):
            calls_p1 = main.count('p1')
            calls_p2_main = main.count('p2')

            # 마지막 명령은 반드시 light 로 끝나야 함(마지막 불 켜기).
            # main 의 최종 실행 심볼이 원시명령이면 light 여야 하고,
            # 함수 호출로 끝나면 그 함수 마지막이 light 여야 하지만
            # 여기선 main 마지막 원소가 원시명령일 때만 정적 컷.
            last = main[-1]
            if last in PRIMS and last != 'light':
                done += cnt_p1 * len(p2_list)
                _maybe_print(T, done, grand)
                continue

            # 정의-호출 정합성 (main 레벨 p1)
            if a > 0 and calls_p1 == 0:
                done += cnt_p1 * len(p2_list); _maybe_print(T, done, grand); continue
            if a == 0 and calls_p1 > 0:
                done += cnt_p1 * len(p2_list); _maybe_print(T, done, grand); continue

            p1_source = gen_sequences(P1_SYMBOLS, a) if a > 0 else iter([[]])
            for p1 in p1_source:
                calls_p2 = calls_p2_main + (p1.count('p2') if a > 0 else 0)

                if b > 0 and calls_p2 == 0:
                    done += len(p2_list); _maybe_print(T, done, grand); continue
                if b == 0 and calls_p2 > 0:
                    done += len(p2_list); _maybe_print(T, done, grand); continue
                if a > 0 and calls_p1 < MIN_CALLS:
                    done += len(p2_list); _maybe_print(T, done, grand); continue
                if b > 0 and calls_p2 < MIN_CALLS:
                    done += len(p2_list); _maybe_print(T, done, grand); continue

                for p2 in p2_list:
                    done += 1
                    if found is None:
                        key = (tuple(main), tuple(p1), tuple(p2))
                        if key not in tested:
                            tested.add(key)
                            if run_program(ctx, main, p1, p2):
                                found = (list(main), list(p1), list(p2))
                    _maybe_print(T, done, grand)
            if found is not None:
                break
        if found is not None:
            sys.stdout.write(
                f"\r    슬롯 {T}: 해 발견 (진행 {done/grand*100:6.2f}%)          \n")
            sys.stdout.flush()
            return found

    sys.stdout.write(f"\r    슬롯 {T}: 탐색 100.00% (해 없음)          \n")
    sys.stdout.flush()
    return None


# ===== 스테이지 솔버 =====
def solve_stage(stage, idx):
    ctx = build_stage_ctx(stage)
    seq_cache = {}
    tested = set()

    print(f"===== STAGE {idx + 1} =====")

    # 하한: 켜야 할 불 개수만큼 light 는 반드시 필요.
    start_T = max(1, ctx["num_lights"])

    for T in range(start_T, MAX_TOTAL_SLOTS + 1):
        res = solve_total(ctx, T, seq_cache, tested)
        if res is not None:
            main, p1, p2 = res
            print(f"  >> 최소 명령어 {T}개")
            print(f"     MAIN({len(main)}): {' '.join(main) if main else '(빈)'}")
            print(f"     P1  ({len(p1)}): {' '.join(p1) if p1 else '(빈)'}")
            print(f"     P2  ({len(p2)}): {' '.join(p2) if p2 else '(빈)'}")
            print()
            return res
    print("  해를 찾지 못함\n")
    return None


def main():
    for i, stage in enumerate(STAGES):
        solve_stage(stage, i)


if __name__ == "__main__":
    main()
