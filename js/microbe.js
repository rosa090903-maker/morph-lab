/*
 * 미생물 — Desktop\force-graph.html 의 힘 그래프 미생물을 검은 화면 위에서 '자라는' 군집으로
 *
 *  클릭한 자리에 군집(colony)이 생기고, 기온이 +10 °C 를 넘는 동안 점(노드)이 하나씩 늘어나며 자람
 *   - 코어: 선호적 연결(scale-free) — 연결이 많은 점에 새 점이 더 잘 붙음 → 밝은 허브 + 초록 엣지 덩어리
 *   - 별 원반: 주황 허브 하나에 잎 점이 잔뜩 붙은 원반 (허브는 다리 링크로 코어에 이어짐)
 *   - 조각: 2~6개짜리 짧은 사슬
 *   - 고립 점: 군집 바로 바깥의 고리로 모임
 *  움직임 (d3-force 를 쓰지 않고 같은 힘을 직접 계산): 링크 스프링 · 가까운 점끼리 밀어냄(격자) · 중심으로 약하게 ·
 *   고립 점 고리 · 천천히 흐르는 물결 + 미세한 떨림(커서 근처는 더 크게)
 *  기온: +10 °C 위에서만 자람 (따뜻할수록 빠르고, +50 °C 위로는 너무 뜨거워 느려짐), 추울수록 움직임이 느려지고 −10 °C 아래에서는 멈춤
 *  습도: 습할수록 조금 더 빨리 자라고, 훨씬 빠르게 꿈틀거림 (humidSpeed)
 *  산소(Air): 높을수록 점(미생물)이 커짐 (airSize) · 기온: 높을수록 군집이 빽빽해짐 (tempDensity)
 *  큰 점·번지는 빛 없이 — 모든 점은 dotMax 이하의 고른 크기
 *  좌표 = 프레임 CSS px (화면을 덮는 16:10 프레임 기준) — 캔버스는 그 크기 × dpr
 *
 * 수치는 DT.MICROBE 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  DT.MICROBE = {
    minTemp: 28,          // 이 기온(°C) 이상에서 자람 (Life 를 켰을 때만) — Microbe 모드 조건 28° 이상 45° 미만
    maxTemp: 45,          // 이 기온(°C) 이상이면 너무 더워 새로 자라지 않음 (deathTemp 부터는 죽음)
    humFrom: 55,          // 습도(%) — 이 이상이어야 자람 (습할수록 잘 자람, humFull 에서 최대)
    humFull: 90,
    peakTemp: [33, 40],   // 이 구간에서 가장 빨리 자람 (위로 갈수록 다시 느려짐)
    sizePeak: 37,         // 군집이 가장 크게 퍼지는 기온(°C) — 체온 근처. 모드 구간 양 끝(minTemp · maxTemp)으로 갈수록 작아짐
    sizeK: [0.45, 1],     // 클릭한 군집의 최대 크기 배율 [구간 끝, sizePeak] — 1 = 예전 최대 크기(colonyMax)
    rate: 55,             // 가장 좋은 조건에서 군집 하나가 초당 늘리는 점 수
    colonyMax: 1400,      // 군집 하나의 최대 점 수
    totalMax: 32000,      // 화면 전체 최대 점 수 (넘으면 새 점이 더 생기지 않음)
    seed: 8,              // 클릭하면 처음 생기는 점 수
    photoMax: 22000,      // 사진(누끼) 위 군집 하나의 최대 점 수 — 실제로는 피사체 넓이에 맞춰 정함
    fillCell: 9,          // 사진 군집이 피사체 전체를 채울 때의 칸 크기(px) — 칸마다 미생물 점이 하나 이상 생길 때까지 자람
    humidSpeed: [0.25, 4.5],   // 습도 0 % → 100 % 일 때 움직임 빠르기 배율 (습할수록 빠르게 꿈틀거림)
    airSize: [0.55, 2.6],      // 산소(Air) 0 % → 100 % 일 때 점 크기 배율 (공기가 많을수록 큼)
    tempDensity: [1, 3.5],     // 기온 minTemp → maxTemp 일 때 군집 밀도(점 수) 배율 (따뜻할수록 빽빽)
    dotMax: 1.6,               // 점 반지름 상한(px, 크기 배율 전) — 큰 점 없이 고르게
    edgeBoost: 9,         // 피사체 윤곽 칸에 더 놓는 점 수 (윤곽에서 멀어질수록 줄어듦) — 윤곽이 가장 빽빽
    edgeWidth: 1.6,       // 윤곽 밀도가 줄어드는 거리(칸) — 작을수록 윤곽선이 또렷
    o2Density: [10, 90, 3.5],     // (예전: 산소 → 밀도 — 지금 밀도는 기온 tempDensity) 세 번째 값 = 채우기 칸을 넉넉히 준비하는 최대 배율
    deathTemp: 58,        // 이 기온(°C) 이상이면 너무 뜨거워 움직임이 멈추고 사라짐 (+60 °C 가 최대)
    dieTime: 4,           // 사라지기까지(초)
    featureBoost: 4,      // 사진에서 밝거나 명암 차가 큰 칸에 더 놓는 점 수 — 형태를 알아볼 수 있게
    cursorReach: 170,     // 커서가 미생물을 끌어당기는 반경(px)
    cursorPull: 0.05,     // 끌어당기는 세기
    cursorCarry: 0.35,    // 커서가 움직이면 그 방향으로 함께 끌려가는 정도
    spacing: 6.5,         // 점 간격 (px) — 고리 반경·초기 배치
    maxDpr: 1.5,          // 캔버스 해상도 상한 (성능)
  };

  // 흰 배경(생장 모드) 위의 점 색 — 양귀비 들판 레퍼런스 컬러칩에서 빨간 점은 빼고 진한 초록으로 (스타일 이름은 원본 구조를 따름)
  //  (원래 POPPY = 빨강 222,48,30 · VERMIL = 주황빛 빨강 242,98,38 — 2026-10-16 진한 초록으로 교체)
  const POPPY = '22,84,40', VERMIL = '36,110,52', MARIGOLD = '244,180,48', PINK = '236,128,150', SAGE = '150,192,134';   // 진한 초록 / 짙은 숲빛 초록 / 노랑 / 분홍 / 세이지
  const LEAF = '104,160,92', MINT = '178,212,160';   // 진한 풀빛 / 연한 민트 — 대부분의 점은 초록, 따뜻한 색은 드문 점에만 (레퍼런스처럼 초록 바탕에 꽃잎이 점점이)
  const COLORS = {
    dot: `rgba(${LEAF},0.9)`,           // 별 원반 잎·보통 점(가장 많음) = 진한 풀빛
    faint: `rgba(${SAGE},0.65)`,        // 코어 잔점 = 세이지 그린
    black: `rgb(${POPPY})`,             // 큰 허브(연결 많은 점만, 드묾) = 진한 초록
    hub: `rgb(${VERMIL})`,              // 별 원반 허브 = 짙은 숲빛 초록
    lilac: `rgba(${PINK},0.8)`,         // 드문 점 = 분홍
    green: `rgb(${MARIGOLD})`,          // 빛나는 점(몇 개) = 노랑
    white: `rgba(${MINT},0.95)`,        // (원래 하얀 미생물 자리) 밝은 자리 = 연한 민트
    whiteFaint: `rgba(${SAGE},0.6)`,    // 밝은 자리 잔점 = 세이지 그린
  };
  const EDGE = { star: `rgba(${LEAF},0.16)`, core: `rgba(${SAGE},0.3)`, bridge: `rgba(${VERMIL},0.14)`, frag: `rgba(${LEAF},0.4)`, fill: `rgba(${SAGE},0.28)` };

  // 두 사각형 넓이 (프레임 px)
  const rect2area = (r) => r[2] * r[3];
  /*
   * 누끼 매트 → 미생물이 자랄 모양 (사진 안 좌표 0~1)
   *  m: 매트 (w×h), cx/cy: 무게중심, area: 피사체 넓이 비율, inner: 안쪽 점들, edge: 윤곽 바로 안쪽 점들 (고립 점 고리 자리)
   */
  DT.maskShape = function (mask) {
    const w = mask.w, h = mask.h, m = mask.m;
    const inner = [], edge = [];
    let sx = 0, sy = 0, n = 0;
    const step = Math.max(1, Math.round(Math.max(w, h) / 160));
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      if (m[y * w + x] < 0.5) continue;
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      sx += u; sy += v; n++;
      inner.push([u, v]);
      const k = step * 2;
      const out = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx] < 0.5;   // 사진 테두리(직사각형)는 윤곽으로 보지 않음
      if (out(x - k, y) || out(x + k, y) || out(x, y - k) || out(x, y + k)) edge.push([u, v]);
    }
    return { w, h, m, inner, edge, cx: n ? sx / n : 0.5, cy: n ? sy / n : 0.5, area: n * step * step / (w * h) };
  };
  DT.createMicrobes = function (canvas, frame) {
    const M = DT.MICROBE;
    const ctx = canvas.getContext('2d');
    let Wc = 1, Hc = 1, dpr = 1, total = 0, time = 0, airK = 1, wave = 0;   // airK = 산소에 따른 점 크기 배율 (다이얼을 부드럽게 따라감)
    let vz = 1, vox = 0, voy = 0;   // 휠 확대: 화면 = 자리 × vz + (vox, voy) (프레임 px)
    const colonies = [];
    const pointer = { x: 0, y: 0, inside: false, mvx: 0, mvy: 0 };

    function resize() {
      dpr = Math.min(M.maxDpr, DT.dprCap || 9, window.devicePixelRatio || 1);
      Wc = frame.clientWidth || 1; Hc = frame.clientHeight || 1;
      const w = Math.round(Wc * dpr), h = Math.round(Hc * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    resize();

    // ---------- 군집 ----------
    function addNode(c, type, x, y) {
      if (c.shape && type !== 'iso') [x, y] = fitIn(c, x, y);   // 사진 군집: 피사체(누끼) 안에만
      const n = { x, y, vx: 0, vy: 0, type, deg: 0, r: 1.15, style: 'dot', born: time };
      if (c.shape) {
        n.lum = lumAt(c, x, y);                                   // 사진 명암 → 점 밝기 (사진이 미생물로 그려짐)
        const i = cellOf(c, x, y);
        if (i >= 0 && !c.cover[i]) { c.cover[i] = 1; c.covered++; c.cellNode[i] = n; }
      }
      // 색: 초록 + 하얀 미생물 (사진 군집은 밝은 자리일수록 하얀 점이 많음)
      const wk = n.lum == null ? 0.25 : 0.12 + 0.6 * n.lum * n.lum;
      if (type === 'core') { const q = Math.random(); n.style = q < 0.02 ? 'lilac' : q < wk ? 'whiteFaint' : 'faint'; n.r = 1.1; }
      else if (type === 'hub') { n.style = Math.random() < 0.78 ? (Math.random() < 0.3 ? 'white' : 'hub') : 'dot'; n.r = 1.4; }   // 허브도 보통 점 크기 (큰 점 없음)
      else if (type === 'leaf' || type === 'fill') { const q = Math.random(); n.style = q < wk ? (q < wk * 0.45 ? 'white' : 'whiteFaint') : (type === 'fill' && q > 0.8 ? 'faint' : 'dot'); n.r = type === 'fill' ? 1.0 + 0.5 * (n.lum || 0) : 1.15; }
      c.nodes.push(n); total++;
      if (type === 'core') c.core.push(n);
      else if (type === 'hub') c.hubs.push(n);
      return n;
    }
    function link(c, a, b, dist, kind, str) { c.links.push({ a, b, dist, kind, str }); a.deg++; b.deg++; if (kind === 'core') c.rep.push(a, b); }
    const near = (p, d) => { const an = Math.random() * Math.PI * 2, r = d * (0.5 + 0.5 * Math.random()); return [p.x + Math.cos(an) * r, p.y + Math.sin(an) * r]; };

    /*
     * 사진 군집 — 누끼 매트 모양(shape: 사진 안 좌표 0~1 의 매트, 무게중심, 윤곽 점, 안쪽 점)과 사진의 프레임 px 사각형(rect)
     *  점은 피사체 안에서만 자라고, 고립 점은 피사체 윤곽을 따라 고리를 이룸 (원본의 바깥 고리 = 피사체 테두리)
     */
    const toPx = (c, u, v) => [c.rect[0] + u * c.rect[2], c.rect[1] + v * c.rect[3]];
    function matteAt(c, x, y) {
      const S = c.shape, u = (x - c.rect[0]) / c.rect[2], v = (y - c.rect[1]) / c.rect[3];
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
      return S.m[((v * S.h) | 0) * S.w + ((u * S.w) | 0)];
    }
    function fitIn(c, x, y) {
      if (matteAt(c, x, y) >= 0.5) return [x, y];
      const S = c.shape, p = S.inner[(Math.random() * S.inner.length) | 0];
      return p ? toPx(c, p[0], p[1]) : [x, y];
    }
    function spawnShape(key, shape, rect, lum) {
      return spawn(0, 0, { key, shape, rect: rect.slice(), lum });
    }
    // 사진 밝기 (0~1, 사진 안 좌표)
    function lumAt(c, x, y) {
      const L = c.lum; if (!L) return 0.7;
      const u = Math.min(0.999, Math.max(0, (x - c.rect[0]) / c.rect[2])), v = Math.min(0.999, Math.max(0, (y - c.rect[1]) / c.rect[3]));
      return L.l[((v * L.h) | 0) * L.w + ((u * L.w) | 0)];
    }
    // 채우기 칸 (사진 안 좌표를 cols × rows 로 나눔 — 군집을 만들 때 크기로 고정)
    function cellOf(c, x, y) {
      const u = (x - c.rect[0]) / c.rect[2], v = (y - c.rect[1]) / c.rect[3];
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return -1;
      return ((v * c.rows) | 0) * c.cols + ((u * c.cols) | 0);
    }
    /*
     * 채우기 계획 — 피사체 칸마다 놓을 점 수(무게)
     *  윤곽: 윤곽까지 거리(칸)로 exp 감소 → 윤곽이 가장 빽빽 / 사진 특징: 밝기²·주변과의 명암 차 → 밝은 곳·명암 경계에 많이 모여 형태가 보임
     *  칸 목록을 무게만큼 반복해 섞음 → 자라는 동안 피사체 곳곳에 고르게 퍼지면서, 다 자라면 무게대로 빽빽함
     */
    function setupFill(c) {
      const cols = c.cols = Math.max(4, Math.ceil(c.rect[2] / M.fillCell)), rows = c.rows = Math.max(4, Math.ceil(c.rect[3] / M.fillCell)), N = cols * rows;
      c.cover = new Uint8Array(N); c.cellNode = new Array(N); c.covered = 0;
      const inC = new Uint8Array(N), cells = [];
      for (const p of c.shape.inner) { const i = ((p[1] * rows) | 0) * cols + ((p[0] * cols) | 0); if (!inC[i]) { inC[i] = 1; cells.push(i); } }
      // 윤곽까지 거리 (칸, 너비 우선 탐색)
      const dist = new Float32Array(N).fill(1e9), q = [];
      // 윤곽 = 피사체 밖(배경)과 맞닿은 칸만 — 사진 테두리(직사각형)에 닿은 칸은 윤곽이 아님
      for (const i of cells) { const x = i % cols, y = (i / cols) | 0; if ((x > 0 && !inC[i - 1]) || (x < cols - 1 && !inC[i + 1]) || (y > 0 && !inC[i - cols]) || (y < rows - 1 && !inC[i + cols])) { dist[i] = 0; q.push(i); } }
      for (let h = 0; h < q.length; h++) { const i = q[h], x = i % cols; for (const j of [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, i - cols, i + cols]) if (j >= 0 && j < N && inC[j] && dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.push(j); } }
      // 칸 밝기와 명암 차
      const lum = new Float32Array(N);
      for (const i of cells) lum[i] = lumAt(c, ...toPx(c, ((i % cols) + 0.5) / cols, (((i / cols) | 0) + 0.5) / rows));
      const free = [];
      c.weight = new Float32Array(N); c.baseSlots = 0;
      for (const i of cells) {
        const x = i % cols; let s = 0, k = 0;
        for (const j of [i - 1, i + 1, i - cols, i + cols, i - cols - 1, i - cols + 1, i + cols - 1, i + cols + 1]) if (j >= 0 && j < N && inC[j] && Math.abs((j % cols) - x) <= 1) { s += lum[j]; k++; }
        const contrast = k ? Math.abs(lum[i] - s / k) : 0;
        const feature = Math.min(1, Math.max(Math.pow(lum[i], 1.6), contrast * 4));
        const edge = Math.exp(-dist[i] / M.edgeWidth);
        // 사진 테두리 쪽으로 갈수록 성기게 → 피사체가 사진 가장자리에서 잘린 곳이 직선으로 보이지 않음
        const bd = Math.min(x, cols - 1 - x, (i / cols) | 0, rows - 1 - ((i / cols) | 0));
        const fadeB = Math.min(1, bd / 6);
        const w = Math.round((1 + M.edgeBoost * edge + M.featureBoost * feature + Math.random() * 0.6) * fadeB * fadeB);
        if (w <= 0) continue;
        c.weight[i] = w;
        for (let r = 0; r < w * M.o2Density[2]; r++) free.push(i);   // 가장 빽빽할 때만큼 넉넉히 (얼마나 쓸지는 산소로 정함)
        c.baseSlots = (c.baseSlots || 0) + w;
      }
      for (let i = free.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [free[i], free[j]] = [free[j], free[i]]; }
      c.free = free; c.cellsTotal = Math.max(1, cells.length);
      c.max = Math.min(M.photoMax, c.baseSlots + 400);
    }
    /*
     * 채우기: 아직 미생물이 없는 칸 하나에 점을 놓고, 가까운 점(2칸 안)과 이음 → 피사체 전체가 미생물 그물로 덮임
     *  (선호적 연결로 자라는 코어·별 원반·고리와 함께 자람)
     */
    function fillOne(c) {
      if (!c.free.length) return false;
      const i = c.free.pop();
      const cx = i % c.cols, cy = (i / c.cols) | 0;
      const u = (cx + 0.1 + 0.8 * Math.random()) / c.cols, v = (cy + 0.1 + 0.8 * Math.random()) / c.rows;
      const prev = c.cellNode[i];
      const n = addNode(c, 'fill', ...toPx(c, u, v));
      n.home = [(n.x - c.rect[0]) / c.rect[2], (n.y - c.rect[1]) / c.rect[3]];   // 이 자리에 머묾 (빽빽한 곳이 흩어지지 않게)
      c.cellNode[i] = n;
      // 가까운 점과 이음: 같은 칸의 앞선 점, 없으면 1~2칸 안에서 가장 가까운 점
      let best = prev && prev !== n ? prev : null, bd = 1e9;
      if (!best) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
        if (cx + k < 0 || cx + k >= c.cols) continue;
        const o = c.cellNode[(cy + j) * c.cols + cx + k];
        if (!o || o === n) continue;
        const d = (o.x - n.x) * (o.x - n.x) + (o.y - n.y) * (o.y - n.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (best && Math.random() < 0.8) link(c, n, best, Math.max(3, Math.sqrt((best.x - n.x) ** 2 + (best.y - n.y) ** 2)), 'fill', 0.08);
      return true;
    }

    function spawn(x, y, photo) {
      const c = { x, y, nodes: [], links: [], core: [], hubs: [], rep: [], frags: [], acc: 0, R: 20, lastFrag: null, styleT: 0, max: M.colonyMax };
      if (photo) {
        Object.assign(c, photo);
        [c.x, c.y] = toPx(c, photo.shape.cx, photo.shape.cy);
        // 피사체 넓이에 맞는 점 수 (원본처럼 빽빽하게)
        setupFill(c);
      }
      colonies.push(c);
      for (let i = 0; i < M.seed; i++) grow(c, i === 0 ? 'core' : null, true);
      return c;
    }

    // 점 하나 늘리기 — 원본의 구성 비율(코어 ≈ 20 %, 별 원반 잎 ≈ 45 %, 조각 ≈ 8 %, 고립 ≈ 27 %)을 따라 고름
    function grow(c, force, seeding) {
      // 사진 군집은 절반쯤을 '채우기'로 → 피사체 전체가 빠짐없이 미생물이 됨
      if (c.shape && !force && !seeding && c.core.length >= 6 && Math.random() < 0.8 && fillOne(c)) return;
      const roll = Math.random();
      let type = force || (c.core.length < 6 ? 'core' : roll < 0.22 ? 'core' : roll < 0.235 ? 'hub' : roll < 0.68 ? 'leaf' : roll < 0.75 ? 'frag' : 'iso');
      if (type === 'leaf' && !c.hubs.length) type = 'hub';
      if (type === 'core') {
        const parent = c.core.length ? (c.rep.length && Math.random() < 0.85 ? c.rep[(Math.random() * c.rep.length) | 0] : c.core[(Math.random() * c.core.length) | 0]) : null;
        const [x, y] = parent ? near(parent, 14) : [c.x + (Math.random() - 0.5) * 4, c.y + (Math.random() - 0.5) * 4];
        const n = addNode(c, 'core', x, y);
        if (parent) {
          link(c, n, parent, 20, 'core');
          const m = Math.random() < 0.55 ? 0 : (Math.random() < 0.7 ? 1 : 2);   // 원본처럼 가끔 두세 군데에 붙음
          for (let k = 0; k < m; k++) { const t = c.rep[(Math.random() * c.rep.length) | 0]; if (t && t !== n) link(c, n, t, 20, 'core'); }
        }
      } else if (type === 'hub') {
        const base = c.core[(Math.random() * c.core.length) | 0];
        const [x, y] = near(base, 40);
        const h = addNode(c, 'hub', x, y);
        h.size = Math.round(6 + Math.pow(Math.random(), 2.2) * 170);   // 이 허브가 모을 잎 수
        if (Math.random() < 0.85) link(c, h, base, 40, 'bridge', 0.04);
        if (Math.random() < 0.25 && c.hubs.length > 1) link(c, h, c.hubs[(Math.random() * (c.hubs.length - 1)) | 0], 40, 'bridge', 0.03);
      } else if (type === 'leaf') {
        const open = c.hubs.filter((h) => h.leaves == null || h.leaves < h.size);
        const hub = open.length ? open[(Math.random() * open.length) | 0] : c.hubs[(Math.random() * c.hubs.length) | 0];
        hub.leaves = (hub.leaves || 0) + 1;
        const [x, y] = near(hub, 4);
        link(c, addNode(c, 'leaf', x, y), hub, 3, 'star', 0.45);
      } else if (type === 'frag') {
        const prev = c.lastFrag && c.lastFrag.chain < 6 && Math.random() < 0.7 ? c.lastFrag : null;
        const [x, y] = prev ? near(prev, 4) : near({ x: c.x, y: c.y }, c.R * 0.9);
        const n = addNode(c, 'frag', x, y);
        n.chain = prev ? prev.chain + 1 : 1;
        if (prev) link(c, prev, n, 4, 'frag');
        c.lastFrag = n;
      } else if (c.shape) {
        // 사진 군집의 고립 점: 피사체 윤곽 바로 안쪽에 자리 (home = 사진 안 좌표)
        const e = c.shape.edge[(Math.random() * c.shape.edge.length) | 0] || [c.shape.cx, c.shape.cy];
        const n = addNode(c, 'iso', ...toPx(c, e[0], e[1]));
        n.home = e;
      } else {
        const an = Math.random() * Math.PI * 2, r = c.R + 4 + Math.random() * 10;
        const n = addNode(c, 'iso', c.x + Math.cos(an) * r, c.y + Math.sin(an) * r);
        n.rho = r;
      }
      if (!seeding) c.styleT = 0;   // 스타일(밝은 허브·초록 빛) 다시 정하기
    }

    // 차수에 따른 스타일 — 원본과 같은 규칙 (차수 14 이상 코어 = 허브, 상위 일부 = 다른 색) — 크기는 그대로 (큰 점 없음)
    function restyle(c) {
      for (const n of c.core) {
        if (n.style === 'green') n.style = 'faint';
        if (n.deg >= 14) { n.style = 'black'; n.r = 1.3; }
        else if (n.style === 'black') { n.style = 'faint'; n.r = 1.1; }
      }
      const ranked = c.core.slice().sort((a, b) => b.deg - a.deg);
      const g = Math.min(16, Math.floor(c.core.length / 40));
      for (let i = 0; i < g; i++) { const n = ranked[3 + ((Math.random() * Math.min(60, ranked.length - 3)) | 0)]; if (n) n.style = 'green'; }
    }

    // ---------- 힘 (한 틱) ----------
    const CELL = 18;
    function tick(c, act, speed, alpha) {
      const ns = c.nodes;
      // 군집 반경: 고립 점을 뺀 점들의 93 % 거리 (원본 ringForce)
      if ((c.tickN = (c.tickN || 0) + 1) % 6 === 1) {
        const ds = [];
        let sx = 0, sy = 0, k = 0;
        for (const d of ns) if (d.type !== 'iso') { sx += d.x; sy += d.y; k++; }
        if (k) { c.cx = sx / k; c.cy = sy / k; } else { c.cx = c.x; c.cy = c.y; }
        for (const d of ns) if (d.type !== 'iso') ds.push(Math.hypot(d.x - c.cx, d.y - c.cy));
        ds.sort((a, b) => a - b);
        c.R = ds.length ? ds[(ds.length * 0.93) | 0] * 1.08 + 15 : 20;
      }
      const cx = c.cx, cy = c.cy;
      // 링크 스프링 (원본 forceLink: 세기 = 1 / 작은 쪽 차수)
      for (const l of c.links) {
        const a = l.a, b = l.b;
        let dx = b.x + b.vx - a.x - a.vx, dy = b.y + b.vy - a.y - a.vy;
        const d = Math.hypot(dx, dy) || 1e-3;
        const s = (l.str != null ? l.str : 1 / Math.min(a.deg, b.deg)) * alpha * (d - l.dist) / d;
        dx *= s; dy *= s;
        const ba = a.deg / (a.deg + b.deg);
        b.vx -= dx * ba; b.vy -= dy * ba; a.vx += dx * (1 - ba); a.vy += dy * (1 - ba);
      }
      // 가까운 점끼리 밀어냄 (원본 charge + collide 를 격자로 근사) — 고립 점은 고립 점끼리만
      const grid = new Map();
      for (const d of ns) {
        if (d.type === 'fill') continue;   // 채우기 점은 제자리 스프링으로만 (밀어냄 계산 생략 — 수천 개라 무거움)
        const key = ((d.x / CELL) | 0) * 73856093 ^ ((d.y / CELL) | 0) * 19349663 ^ (d.type === 'iso' ? 1 : 0);
        let b = grid.get(key); if (!b) grid.set(key, b = []); b.push(d);
      }
      for (const d of ns) {
        if (d.type === 'fill') continue;
        const gx = (d.x / CELL) | 0, gy = (d.y / CELL) | 0, iso = d.type === 'iso' ? 1 : 0;
        const str = d.type === 'hub' ? 45 : d.type === 'core' ? 28 : d.type === 'fill' ? 2 : 13;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const b = grid.get((gx + i) * 73856093 ^ (gy + j) * 19349663 ^ iso);
          if (!b) continue;
          for (const o of b) {
            if (o === d) continue;
            const dx = d.x - o.x, dy = d.y - o.y, q = dx * dx + dy * dy;
            if (q > CELL * CELL || q < 1e-4) continue;
            const f = iso ? 0 : str * alpha / q;                            // d3 forceManyBody 와 같은 꼴
            const minD = d.r + o.r + (d.type === 'fill' && o.type === 'fill' ? 0.4 : 3);   // 채우기 점끼리는 빽빽해도 됨
            const push = q < minD * minD ? (minD - Math.sqrt(q)) / Math.sqrt(q) * 0.25 : 0;
            d.vx += dx * (f + push); d.vy += dy * (f + push);
          }
        }
      }
      // 사진 군집: 피사체 밖으로 나간 점은 매트 기울기를 따라 안으로, 고립 점은 윤곽의 자기 자리로
      if (c.shape) {
        for (const d of ns) {
          if (d.type === 'iso' || d.type === 'fill') { const [hx, hy] = toPx(c, d.home[0], d.home[1]), k = d.type === 'fill' ? 0.04 : 0.03; d.vx += (hx - d.x) * k; d.vy += (hy - d.y) * k; continue; }
          d.vx -= (d.x - c.x) * 0.0012; d.vy -= (d.y - c.y) * 0.0012;
          const m0 = matteAt(c, d.x, d.y);
          if (m0 < 0.6) {
            const gx = matteAt(c, d.x + 3, d.y) - matteAt(c, d.x - 3, d.y), gy = matteAt(c, d.x, d.y + 3) - matteAt(c, d.x, d.y - 3);
            const gl = Math.hypot(gx, gy);
            if (gl > 1e-3) { d.vx += gx / gl * (0.6 - m0) * 1.2; d.vy += gy / gl * (0.6 - m0) * 1.2; }
            else { const p = fitIn(c, d.x, d.y); d.vx += (p[0] - d.x) * 0.02; d.vy += (p[1] - d.y) * 0.02; }   // 멀리 나가면 안쪽 아무 자리로
          }
        }
      }
      // 심은 자리로 약하게 당김 + 고립 점 고리
      for (const d of ns) {
        if (c.shape) break;
        const dx = d.x - cx, dy = d.y - cy, dist = Math.hypot(dx, dy) || 1;
        if (d.type !== 'iso') { const ax = d.x - c.x, ay = d.y - c.y; d.vx -= ax * 0.004; d.vy -= ay * 0.004; continue; }   // 심은 자리에 머묾 (흘러가지 않게)
        if (dist < c.R) { const k = Math.min((c.R - dist) / dist, 0.5) * 0.035 * Math.max(alpha, 0.06); d.vx += dx * k; d.vy += dy * k; }
        else { const out = Math.max(d.rho || 0, c.R) + 2; if (dist > out) { const k = (out - dist) / dist * 0.02; d.vx += dx * k; d.vy += dy * k; } }
      }
      // 꿈틀거림: 천천히 흐르는 물결 + 미세한 떨림 (커서 근처는 더 크게)
      const A = 0.035 * speed * act, J = 0.1 * speed * act, t = wave;   // wave = 빠르기만큼 쌓인 물결 위상 (습도를 바꿔도 물결이 튀지 않게)
      for (const d of ns) {
        const fx = Math.sin(d.y * 0.011 + t) + 0.5 * Math.sin(d.y * 0.029 - t * 1.7 + d.x * 0.007);
        const fy = Math.cos(d.x * 0.011 - t * 1.3) + 0.5 * Math.cos(d.x * 0.026 + t * 1.1 - d.y * 0.006);
        let j = J;
        if (pointer.inside) { const dx = d.x - pointer.x, dy = d.y - pointer.y, q = dx * dx + dy * dy; if (q < 19600) j += J * 4 * (1 - Math.sqrt(q) / 140); }
        d.vx += fx * A + (Math.random() - 0.5) * j;
        d.vy += fy * A + (Math.random() - 0.5) * j;
      }
      // 커서: 반경 안의 미생물이 커서 쪽으로 모이고, 커서를 움직이면 그 방향으로 함께 끌려감 (떠나면 제자리로 돌아감)
      if (pointer.inside) {
        const R = M.cursorReach, R2 = R * R;
        for (const d of ns) {
          const dx = pointer.x - d.x, dy = pointer.y - d.y, q = dx * dx + dy * dy;
          if (q > R2) continue;
          const dd = Math.sqrt(q) || 1, f = (1 - dd / R) * (1 - dd / R);
          d.vx += (dx / dd * Math.min(dd, 45) * M.cursorPull + carryX * M.cursorCarry) * f;
          d.vy += (dy / dd * Math.min(dd, 45) * M.cursorPull + carryY * M.cursorCarry) * f;
        }
      }
      // 적분 (원본 velocityDecay 0.38). 추울수록 덜 움직임
      for (const d of ns) { d.vx *= 0.62; d.vy *= 0.62; d.x += d.vx * act; d.y += d.vy * act; }
    }

    // ---------- 그리기 ----------
    // 누끼 매트 → 옅은 초록 실루엣 이미지 (윤곽은 조금 더 진하게)
    function silhouette(S) {
      const cv = document.createElement('canvas'); cv.width = S.w; cv.height = S.h;
      const g = cv.getContext('2d'), im = g.createImageData(S.w, S.h);
      for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
        const i = y * S.w + x, a = S.m[i];
        const nb = Math.min(S.m[Math.max(0, i - 3)], S.m[Math.min(S.m.length - 1, i + 3)], S.m[Math.max(0, i - 3 * S.w)], S.m[Math.min(S.m.length - 1, i + 3 * S.w)]);
        const rim = a > 0.5 && nb < 0.5 ? 1 : 0;
        // 사진 테두리 쪽은 옅어짐 (직사각형 경계가 보이지 않게)
        const bf = Math.min(1, Math.min(x, S.w - 1 - x, y, S.h - 1 - y) / (Math.max(S.w, S.h) * 0.05));
        im.data[i * 4] = 168; im.data[i * 4 + 1] = 206; im.data[i * 4 + 2] = 150;   // 세이지 그린 (레퍼런스의 바탕 풀빛)
        im.data[i * 4 + 3] = Math.round(255 * (a * 0.1 + rim * 0.2) * bf * bf);
      }
      g.putImageData(im, 0, 0);
      return { canvas: cv, src: S };
    }
    function draw(dim) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!colonies.length) return;
      ctx.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);   // 휠 확대 (사진 결빙 캔버스와 같은 확대)
      ctx.globalAlpha = dim;
      // 누끼 실루엣: 피사체 모양을 옅은 초록 그림자로 먼저 깔아 형태가 잘 보이게
      for (const c of colonies) if (c.shape) {
        if (!c.sil || c.sil.src !== c.shape) c.sil = silhouette(c.shape);
        ctx.drawImage(c.sil.canvas, c.rect[0], c.rect[1], c.rect[2], c.rect[3]);
      }
      // (번지는 빛 — 주황·분홍·초록 — 은 그리지 않음)
      ctx.lineWidth = 0.6;
      for (const kind of ['fill', 'star', 'core', 'bridge', 'frag']) {
        ctx.beginPath();
        for (const c of colonies) for (const l of c.links) if (l.kind === kind) { ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); }
        ctx.strokeStyle = EDGE[kind]; ctx.stroke();
      }
      // 점: 스타일별 × 밝기 4단계 (사진 군집의 점은 사진 명암을 따름 → 사진이 미생물로 그려짐)
      ctx.fillStyle = '#000';
      for (const style of ['faint', 'whiteFaint', 'lilac', 'dot', 'black', 'green', 'hub', 'white']) {
        ctx.fillStyle = COLORS[style];
        for (let b = 0; b < 4; b++) {
          ctx.beginPath();
          for (const c of colonies) for (const n of c.nodes) {
            if (n.style !== style || (n.lum == null ? 3 : Math.min(3, (n.lum * 4) | 0)) !== b) continue;
            const r = Math.min(M.dotMax, n.r * (n.lum == null ? 1 : 0.75 + 0.5 * n.lum)) * airK * Math.min(1, (time - n.born) * 3 + 0.2);   // 새로 생긴 점은 작게 시작해 커짐, 밝은 곳은 조금 큼 · 산소가 많을수록 큼
            ctx.moveTo(n.x + r, n.y); ctx.arc(n.x, n.y, r, 0, 6.2832);
          }
          ctx.globalAlpha = dim * (0.3 + 0.7 * (b + 0.5) / 4);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // ---------- 바깥 ----------
    let dimNow = 1, onK = 1, carryX = 0, carryY = 0, dieK = 0;
    return {
      canvas,
      get count() { return total; },
      setView(z, ox, oy) { vz = z; vox = ox; voy = oy; },
      get colonies() { return colonies.length; },
      // 사진 군집이 피사체를 덮은 정도 (0~1) — 그만큼 원래 사진을 지움
      photoFill(key) { const c = colonies.find((q) => q.key === key); return c && c.cellsTotal ? c.covered / c.cellsTotal : 0; },
      // 프레임 CSS px 위치에 군집 심기
      spawn(x, y) { if (total < M.totalMax) spawn(x, y); },
      pointer(x, y) {
        if (x == null) { pointer.inside = false; return; }
        if (pointer.inside) { pointer.mvx += x - pointer.x; pointer.mvy += y - pointer.y; }   // 커서가 움직인 양 (틱마다 미생물을 그 방향으로 끌고 감)
        pointer.x = x; pointer.y = y; pointer.inside = true;
      },
      clear() { colonies.length = 0; total = 0; draw(1); },
      /*
       * 사진 군집 맞추기 — photos: [{ key, rect: 프레임 px [x, y, w, h], mask }] (누끼가 끝난 사진만)
       *  없는 사진의 군집은 지우고, 새 사진은 피사체 무게중심에서 시작, 사진을 옮기거나 크기를 바꾸면 점도 함께 따라감,
       *  누끼 매트가 바뀌면 모양을 새로 만듦. grow = 지금 새 군집을 심을 수 있는지(Vitality 켜짐 · +10 °C 이상)
       */
      syncPhotos(photos, grow) {
        for (let i = colonies.length - 1; i >= 0; i--) {
          const c = colonies[i];
          if (c.key == null) continue;
          const p = photos.find((q) => q.key === c.key);
          if (!p) { total -= c.nodes.length; colonies.splice(i, 1); continue; }
          if (p.mask !== c.maskRef) { c.shape = DT.maskShape(p.mask); c.maskRef = p.mask; const keep = c.cover; setupFill(c); c.covered = 0; for (const n of c.nodes) { const i = cellOf(c, n.x, n.y); if (i >= 0 && !c.cover[i] && keep) { c.cover[i] = 1; c.covered++; c.cellNode[i] = n; } } }
          const o = c.rect, r = p.rect;
          if (o[0] !== r[0] || o[1] !== r[1] || o[2] !== r[2] || o[3] !== r[3]) {
            const sx = r[2] / o[2], sy = r[3] / o[3];
            for (const n of c.nodes) { n.x = r[0] + (n.x - o[0]) * sx; n.y = r[1] + (n.y - o[1]) * sy; }
            c.x = r[0] + (c.x - o[0]) * sx; c.y = r[1] + (c.y - o[1]) * sy;
            c.rect = r.slice();
          }
        }
        if (!grow) return;
        for (const p of photos) {
          if (colonies.some((c) => c.key === p.key) || total >= M.totalMax) continue;
          const shape = DT.maskShape(p.mask);
          if (!shape.inner.length) continue;
          const c = spawnShape(p.key, shape, p.rect, p.lum); c.maskRef = p.mask;
        }
      },
      resize() {
        // 프레임 크기가 바뀌면 점 위치도 같은 비율로 (프레임 기준 자리를 유지)
        const ow = Wc, oh = Hc;
        resize();
        const kx = Wc / ow, ky = Hc / oh;
        if (Math.abs(kx - 1) > 1e-3 || Math.abs(ky - 1) > 1e-3) for (const c of colonies) { c.x *= kx; c.y *= ky; for (const n of c.nodes) { n.x *= kx; n.y *= ky; } }
      },
      /*
       * dt: 흐른 시간(초, 시간 배율 적용), T: 기온, RH: 습도, O2: 산소, dRH: 습도 다이얼 (움직임 빠르기 — 없으면 RH. Lab mode 에선 RH 가 조건값으로 고정되므로 따로 옴)
       *  자람 = +10 °C 위에서만, 움직임 = 추울수록 느리고 −10 °C 아래에서 멈춤, 화면 밝기 = 추우면 조금 어두워짐
       */
      update(dt, T, RH, on, O2, dRH) {
        if (O2 == null) O2 = 21;
        if (dRH == null) dRH = RH;
        // 산소 → 점 크기 (0 % → 100 %, 곧게 비례)
        const airT = M.airSize[0] + (M.airSize[1] - M.airSize[0]) * clamp01(O2 / 100);
        airK += (airT - airK) * Math.min(1, Math.max(dt, 1 / 60) * 3);
        // Vitality 꺼짐 → 자라지 않고 서서히 사라짐 (점은 남겨 둠 — 다시 켜면 그대로 보임)
        onK += ((on ? 1 : 0) - onK) * Math.min(1, Math.max(dt, 1 / 60) * 3);
        if (!colonies.length) return draw(1);
        if (onK < 0.01) return draw(0);
        if (dt <= 0) return draw(dimNow * onK);   // 멈춤
        time += dt;
        // 너무 뜨거우면(deathTemp 이상) 움직임이 멈추고 사라짐 → 다 사라지면 군집을 지움
        const hot = sstep(M.deathTemp - 8, M.deathTemp, T);
        dieK = T >= M.deathTemp ? Math.min(1, dieK + dt / M.dieTime) : Math.max(0, dieK - dt / 2);
        if (dieK >= 1) { colonies.length = 0; total = 0; dieK = 0; return draw(0); }
        // 자람 = Vitality 켬 + 습도 humFrom 이상 + 기온 minTemp ~ maxTemp (습할수록 빠르게, maxTemp 에 가까우면 느려짐)
        const g = (on && T >= M.minTemp && T < M.maxTemp && RH >= M.humFrom ? 0.3 + 0.7 * sstep(M.minTemp, M.peakTemp[0], T) : 0) * (0.45 + 0.55 * sstep(M.humFrom, M.humFull, RH));   // (예전엔 maxTemp 가까이에서 느려졌으나, 지금은 따뜻할수록 빽빽해지므로 늦추지 않음)
        const act = sstep(-10, 15, T) * (1 - hot);
        // 따뜻할수록 빽빽하게: 목표 점 수 = 기본 × tempDensity (minTemp → maxTemp, 곧게 비례) — 사진 군집은 같은 피사체 안에 더 촘촘히
        const densK = Math.min(M.o2Density[2], M.tempDensity[0] + (M.tempDensity[1] - M.tempDensity[0]) * clamp01((T - M.minTemp) / (M.maxTemp - 1 - M.minTemp)));
        for (const c of colonies) if (c.shape) c.max = Math.min(M.photoMax, Math.round(c.baseSlots * densK) + 400); else c.max = Math.round(M.colonyMax * densK * M.sizeK[0]);   // 클릭한 군집은 점 수가 늘수록 퍼지므로 기본을 작게
        for (const c of colonies) {
          if (g > 0 && c.nodes.length < c.max && total < M.totalMax) {
            c.acc += dt * M.rate * g * densK * Math.min(1, 0.25 + c.nodes.length / 120) * (c.shape ? Math.max(1, c.max / 800) : 1);   // 빽빽할수록 그만큼 빨리 채움   // 처음엔 천천히 시작해 점점 빨라짐 · 큰 피사체는 그만큼 빨리 (약 15~30초에 다 덮음)
            let k = 0;
            while (c.acc >= 1 && k++ < 40) { c.acc -= 1; grow(c); }
          }
          if ((c.styleT -= dt) <= 0) { restyle(c); c.styleT = 0.5; }
        }
        // 틱 수: 흐른 시간만큼 (60 틱/초, 한 프레임 최대 4틱)
        const n = Math.min(4, Math.max(act > 0.01 ? 1 : 0, Math.round(dt * 60)));
        const speed = (1 + 1.5 * g) * (M.humidSpeed[0] + (M.humidSpeed[1] - M.humidSpeed[0]) * clamp01(dRH / 100));   // 습할수록 더 빠르게 꿈틀거림 (습도 다이얼)
        wave += dt * 0.36 * speed;
        carryX = n ? pointer.mvx / n : 0; carryY = n ? pointer.mvy / n : 0; pointer.mvx = 0; pointer.mvy = 0;   // 이번 프레임 커서 이동을 틱마다 나눠 씀
        for (let i = 0; i < n; i++) for (const c of colonies) tick(c, act, speed, 0.05 + 0.1 * g);
        dimNow += ((0.45 + 0.55 * sstep(-20, 12, T)) - dimNow) * Math.min(1, dt * 2);
        draw(dimNow * onK * (1 - dieK));
      },
      get dying() { return dieK; },
    };
  };
})(window.DT = window.DT || {});
