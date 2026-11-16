/*
 * 사막화 — Vitality 끔 + 습도 낮음 + 기온 높음 (산소는 조건이 아님)
 *  다이얼이 모양을 정함 (Lab mode 에서도 같음)
 *   · 습도 → 모래 알갱이 크기: 30% 이하면 고운 모래(작은 픽셀), 그 위로 습해질수록 굵게 뭉친 모래(큰 픽셀) — 사진·떨어지는 모래 모두
 *   · 기온 → 50 °C 를 넘으면 화면 가장자리부터 조금 타들어감: 안쪽으로 그을림(갈색) → 불씨(주황, 깜박임) → 검게 탄 곳(재 몇 점). 탄 곳은 리셋할 때까지 그대로
 *   · 산소(Air) → 모래비: 화면 위에서 모래가 조금씩 떨어져 화면 아래에 천천히 쌓임 — 높을수록 많이 떨어짐 (바람 없이 곧게)
 *  배경은 그리지 않음 (모래밭 없음)
 *
 *  사진에서 모래가 흘러내리는 모양 (참고: ANTZ 포스터 — 알갱이로 된 글자에서 모래가 흘러내림)
 *   · 색: 사진에서 뽑은 몇 가지 색(팔레트)으로 줄고, 자글자글한 점(디더)으로 섞임 — 픽셀이 보이는 거친 화면
 *   · 사진은 그대로 남고, 피사체 아랫부분에서 작은 모래 알갱이가 계속 천천히 떨어져 화면 아래에 쌓임
 *   · 진행: 조건이 이어지는 동안 흘러내리는 구역이 아래 끝에서 위로 넓어짐 (위쪽 keep 은 흘러내리지 않음), 기온이 높을수록 많이
 *   · 배경(누끼 밖)은 지우고 피사체만 남김
 *  커서 — 사진 위를 지나가면 그 자리가 모래가 되어 곧장 아래로 떨어지고(사진은 그대로), 화면 아래에 모래로 쌓임
 *   모래 알갱이 색 = 그 자리 원래 사진 색. 쌓인 모래는 안식각만큼 옆으로 흘러내리며 층을 이룸 (리셋할 때까지 남음)
 *
 *  좌표 = 프레임 CSS px (js/microbe.js 와 같음), 휠 확대는 setView 로 맞춤 (쌓인 모래는 화면 기준)
 *  수치는 DT.DESERT 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  DT.DESERT = {
    // 켜지는 조건 (Life 끔): 기온 tempFrom 이상 · 습도 humTo 이하
    humTo: 25,                     // 습도(%) — 이 위면 사막화 없음
    tempFrom: 30, tempFull: 60,    // 기온(°C) — 이 아래면 없음 / 여기서 최대 — 기온 ↑ → 모래로 빨리 · 많이 (켜지는 구간 전체)
    // 습도 → 모래 알갱이 크기 (습하면 뭉쳐 굵어짐) — Desert 가 켜지는 습도 구간 전체(0 → 25 %)
    grainRH: [0, 25],              // 습도(%) 구간 — 아래 끝 이하면 가장 곱고 위 끝에서 가장 굵음
    grainSize: [1, 8],             // 알갱이 크기(px) — 사진 픽셀 (떨어지는 모래는 이것 × sandScale)
    // 기온 → 화면 가장자리부터 타들어감
    burnT: [50, 60],               // 기온(°C) — 이 이하면 타지 않음 / 여기서 가장 깊이 탐
    burnMax: 0.1,               // 가장 깊이 탈 때 (화면 가장자리 → 가운데 거리 대비) — 가장자리만 조금
    burnSpeed: 0.03,               // 타 들어가는 빠르기 (가운데까지 거리 대비, /초)
    burnCell: 2,                   // 탄 자국을 그리는 칸의 최소 크기(px) — 알갱이 크기를 따르되 이보다 작게는 안 함 (무겁지 않게)
    ember: 0.008, scorch: 0.05,    // 탄 경계에서 안쪽으로: 불씨 · 그을린 띠 (가운데까지 거리 대비)
    charCol: [26, 18, 14],         // 검게 탄 색
    scorchCol: [122, 70, 30],      // 그을린 색
    ashCol: [120, 114, 106],       // 재
    // 산소(Air) → 모래비: 화면 위 끝에서 모래가 떨어져 아래 모래 더미에 쌓임
    rain: [3, 140],                // 초당 떨어지는 알갱이 수 [산소 0 %, 100 %] — 그 사이는 고르게
    rainFall: [40, 100],           // 떨어지는 최고 속도(px/초) — 알갱이마다 다르게 (천천히 내려옴)
    rainSand: [[222, 198, 156], [204, 176, 130], [236, 220, 188], [180, 150, 108]],   // 모래 색 (조금씩 섞어 씀)
    // 사진 → 아랫부분에서 모래가 흘러내림 (사진은 그대로 남음)
    time: 22,                      // 가장 좋은 조건에서 흘러내리는 구역이 keep 선까지 올라가는 시간(초) — 기온이 낮으면 더 느림
    recover: 40,                   // 조건이 깨졌을 때 진행도가 0 으로 내려가는 시간(초)
    fadeIn: 1.2,                   // 나타나기·사라지기(초)
    colors: 6,                     // 사진에서 뽑는 색 수
    dither: 0.22,                  // 자글자글한 정도 (0 = 매끈한 색면)
    keep: 0.5,                     // 모래가 흘러내리지 않는 피사체 위쪽 비율 (피사체 높이 대비)
    edgeNoise: 0.2,                // 흘러내리는 구역 경계의 들쭉날쭉한 정도 (피사체 높이 대비)
    shed: 0.5,                     // 흘러내리는 모래 (초당, 화면에 보이는 사진 폭 1px 당 알갱이 수 — 가장 뜨겁고 끝까지 진행했을 때)
    shedFall: [35, 90],            // 떨어지는 최고 속도(px/초) — 알갱이마다 다르게 (천천히)
    shedSpread: 10,                // 떨어지기 시작할 때 옆으로 퍼지는 속도(px/초)
    sandScale: 0.4,                // 떨어지는 모래 크기 = 알갱이 크기 × 이 값 (최소 1px)
    sweepShed: 0.15,               // 커서가 지나간 칸에서 모래가 떨어질 확률 (한 번 지날 때)
    redraw: 0.12,                  // 진행 중 다시 그리는 간격(초)
    // 커서 → 모래
    cursorR: 16,                   // 커서가 모래로 만드는 반경(px, 화면 기준)
    gravity: 1300,                 // 떨어지는 가속도(px/초²)
    repose: 2,                     // 이웃보다 알갱이 이 개수만큼 높으면 옆으로 흘러내림 (작을수록 납작)
    pileMax: 0.4,                  // 쌓이는 최대 높이 (보이는 화면 높이 대비)
    fallMax: 9000,                 // 동시에 떨어지는 알갱이 최대 수
    maxDpr: 1.5,
  };

  const COL = 1;   // 쌓인 모래 더미의 열 너비(px) — 알갱이는 크기만큼 여러 열을 차지
  const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function noise1(seed) {   // 한 겹 값 노이즈 (배경처럼 칸이 많을 때)
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function vnoise(seed) {
    const n = noise1(seed);
    return (x, y) => (n(x, y) * 0.6 + n(x * 2.1 + 7, y * 2.1 - 3) * 0.3 + n(x * 4.3 - 11, y * 4.3 + 5) * 0.1);
  }
  const mix = (a, b, k, out) => { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; };

  // 조건 → 세기 0~1
  DT.desertStrength = function (vitality, T, RH, O2) {
    const D = DT.DESERT;
    if (vitality || RH > D.humTo || T < D.tempFrom) return 0;
    return 0.4 + 0.6 * sstep(D.tempFrom, D.tempFull, T);   // 세기(모래로 바뀌는 빠르기 · 양) = 기온만 — 습도는 알갱이 크기
  };
  // 습도 → 알갱이 크기(px, 정수)
  DT.desertGrain = function (RH) {
    const D = DT.DESERT, t = Math.max(0, Math.min(1, (RH - D.grainRH[0]) / (D.grainRH[1] - D.grainRH[0])));
    return Math.max(1, Math.round(D.grainSize[0] + (D.grainSize[1] - D.grainSize[0]) * t));
  };

  DT.createDesert = function (canvas, frame) {
    const D = DT.DESERT;
    const ctx = canvas.getContext('2d');
    let Wc = 1, Hc = 1, dpr = 1, vz = 1, vox = 0, voy = 0, K = 0, P = 0, strength = 0, drawn = '', redrawT = 0;
    let G = 2, B = 0, burnTo = 0, emberK = 0, clock = 0;   // G = 알갱이 크기, B = 탄 깊이(가장자리 → 가운데 거리 대비), emberK = 불씨 밝기
    let vis = [0, 0, 1, 1];
    const cache = new Map();   // key → 사진 격자 (색·팔레트·매트·모래가 된 칸·그린 이미지)
    let photos = [];
    let ptr = null, prevPtr = null, air = 0, rainAcc = 0;   // air 0~1 = 산소에 따른 모래비 양 · rainAcc = 아직 못 떨어뜨린 알갱이 몫
    const falling = [];        // 떨어지는 모래 (화면 기준 프레임 px)
    // 쌓인 모래 (화면 기준): 열마다 높이, 그림은 오프스크린에 계속 덧그림
    let pile = null;
    // 화면 가장자리 탄 자국 (보이는 화면 기준 격자 — 칸마다 가장자리까지 거리 + 노이즈 = 타는 순서)
    let scorch = null;

    function resize() {
      dpr = Math.min(D.maxDpr, DT.dprCap || 9, window.devicePixelRatio || 1);
      Wc = frame.clientWidth || 1; Hc = frame.clientHeight || 1;
      const w = Math.round(Wc * dpr), h = Math.round(Hc * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; drawn = ''; }
      const r = frame.getBoundingClientRect(), k = r.width ? Wc / r.width : 1;
      const x0 = Math.max(0, -r.left) * k, y0 = Math.max(0, -r.top) * k;
      const x1 = Math.min(r.width, window.innerWidth - r.left) * k, y1 = Math.min(r.height, window.innerHeight - r.top) * k;
      vis = [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
      // 모래 더미: 보이는 화면 폭이 바뀌면 새로 (높이는 비율 그대로 옮김)
      const cols = Math.ceil(vis[2] / COL);
      if (!pile || pile.cols !== cols || pile.dpr !== dpr) {
        const c = document.createElement('canvas'); c.width = Math.round(vis[2] * dpr); c.height = Math.round(vis[3] * dpr);
        const n = { cols, h: new Float32Array(cols), img: c, g: c.getContext('2d', { willReadFrequently: true }), dpr, w: vis[2], H: vis[3] };
        if (pile) { n.g.imageSmoothingEnabled = false; n.g.drawImage(pile.img, 0, c.height - pile.img.height * (c.width / pile.img.width), c.width, pile.img.height * (c.width / pile.img.width)); for (let i = 0; i < cols; i++) n.h[i] = pile.h[Math.min(pile.cols - 1, Math.floor(i / cols * pile.cols))] * (vis[2] / pile.w); }
        pile = n;
      }
    }
    resize();

    // 화면 가장자리 탄 자국 — 격자 (보이는 화면 크기·알갱이 크기가 바뀌면 새로)
    function scorchGrid() {
      const cell = Math.max(D.burnCell, G), cols = Math.max(4, Math.ceil(vis[2] / cell)), rows = Math.max(4, Math.ceil(vis[3] / cell));
      if (scorch && scorch.cols === cols && scorch.rows === rows && scorch.cell === cell) return scorch;
      const N = cols * rows, key = new Float32Array(N), half = Math.min(cols, rows) / 2, f = vnoise(401), seed = 409;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        // 가장자리까지 거리(가운데 = 1) — 모서리는 두 변에서 함께 타 둥글게 먹혀 들어감, 노이즈로 들쭉날쭉한 불길
        const e = Math.min(c + 0.5, cols - c - 0.5, r + 0.5, rows - r - 0.5) / half;
        const ex = Math.min(c + 0.5, cols - c - 0.5) / half, ey = Math.min(r + 0.5, rows - r - 0.5) / half;
        const round = e * (0.7 + 0.3 * sstep(0, 0.5, Math.max(ex, ey)));   // 모서리 가까이는 먼저 탐
        key[r * cols + c] = Math.max(0.002, round + (f(c / half * 2.2, r / half * 2.2) - 0.5) * 0.16 + (hash(c, r, seed) - 0.5) * 0.015);
      }
      const img = document.createElement('canvas'); img.width = cols; img.height = rows;
      scorch = { cell, cols, rows, key, img, g: img.getContext('2d'), id: new ImageData(cols, rows), B: -1, v: 0 };
      return scorch;
    }
    // 화면 기준 좌표가 이미 타 버렸는지
    function burntAt(sx, sy) {
      if (!scorch || B <= 5e-4) return false;
      const c = Math.floor((sx - vis[0]) / scorch.cell), r = Math.floor((sy - vis[1]) / scorch.cell);
      if (c < 0 || r < 0 || c >= scorch.cols || r >= scorch.rows) return true;
      return scorch.key[r * scorch.cols + c] < B;
    }
    // 탄 자국 그림: 바깥(가장자리)부터 검게 탄 곳(재 몇 점) → 불씨 → 그을림 → 그대로(투명)
    function renderScorch() {
      const s = scorchGrid(), { cols, rows, key } = s, d8 = s.id.data;
      const bw = Math.min(1, B / 0.03), E = D.ember * bw, Sc = D.scorch * bw, tick = (clock * 8) | 0, tmp = [0, 0, 0], hot = [0, 0, 0];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c, o = i * 4, d = key[i] - B;
        let col, a = 255;
        if (B <= 5e-4 || d >= Sc) { d8[o + 3] = 0; continue; }
        if (d < 0) col = hash(c, r, 419) < 0.03 ? D.ashCol : D.charCol;   // 탐 — 재가 몇 점
        else if (d < E) {   // 불씨 (타는 동안 밝게 깜박임)
          const h = hash(c, r, 421 + tick);
          hot[0] = 255; hot[1] = 120 + 110 * h; hot[2] = 30 + 50 * h;
          col = mix(D.charCol, hot, Math.max(0.15, emberK) * (0.45 + 0.55 * h), tmp);
        } else {   // 그을림 — 안쪽으로 갈수록 옅게
          const k = 1 - (d - E) / (Sc - E);
          col = D.scorchCol; a = Math.round(255 * Math.min(1, k * k * 1.1) * (0.85 + 0.15 * hash(c, r, 423)));
        }
        d8[o] = col[0]; d8[o + 1] = col[1]; d8[o + 2] = col[2]; d8[o + 3] = a;
      }
      s.g.putImageData(s.id, 0, 0);
      s.B = B; s.v++;
    }

    // 사진 → 격자 색·매트 + 팔레트(k-평균) + 가장자리까지 거리(타는 순서)
    function prepare(p) {
      const rw = p.rect[2], rh = p.rect[3], cell = G;
      const cols = Math.max(4, Math.round(rw / cell)), rows = Math.max(4, Math.round(rh / cell)), N = cols * rows;
      const sc = document.createElement('canvas'); sc.width = cols; sc.height = rows;
      const sg = sc.getContext('2d', { willReadFrequently: true });
      sg.imageSmoothingQuality = 'high'; sg.drawImage(p.photo, 0, 0, cols, rows);
      const px = sg.getImageData(0, 0, cols, rows).data, M = p.mask;
      const rgb = new Uint8ClampedArray(N * 3), mk = new Float32Array(N);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        rgb[i * 3] = px[i * 4]; rgb[i * 3 + 1] = px[i * 4 + 1]; rgb[i * 3 + 2] = px[i * 4 + 2];
        mk[i] = M ? M.m[Math.min(M.h - 1, ((r + 0.5) / rows * M.h) | 0) * M.w + Math.min(M.w - 1, ((c + 0.5) / cols * M.w) | 0)] : 1;
      }
      // 팔레트: 무작위 표본에서 k-평균 (색 수를 줄여 포스터처럼)
      const S = [], step = Math.max(1, Math.floor(N / 2500));
      for (let i = 0; i < N; i += step) S.push([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]);
      let pal = Array.from({ length: D.colors }, (_, k) => S[Math.floor((k + 0.5) / D.colors * S.length)].slice());
      for (let it = 0; it < 8; it++) {
        const sum = pal.map(() => [0, 0, 0, 0]);
        for (const s of S) { let b = 0, bd = 1e9; for (let k = 0; k < pal.length; k++) { const d = (s[0] - pal[k][0]) ** 2 + (s[1] - pal[k][1]) ** 2 + (s[2] - pal[k][2]) ** 2; if (d < bd) { bd = d; b = k; } } const q = sum[b]; q[0] += s[0]; q[1] += s[1]; q[2] += s[2]; q[3]++; }
        pal = pal.map((c, k) => sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c);
      }
      // 칸마다 팔레트 색 (자글자글한 디더: 원래 색에 칸마다 다른 잡음을 더해 가장 가까운 색)
      const q = new Uint8Array(N), seed = (typeof p.key === 'number' ? p.key : 3) * 131 + 7;
      for (let i = 0; i < N; i++) {
        const n = (hash(i % cols, (i / cols) | 0, seed) - 0.5) * 255 * D.dither * 2;
        const r0 = rgb[i * 3] + n, g0 = rgb[i * 3 + 1] + n, b0 = rgb[i * 3 + 2] + n;
        let b = 0, bd = 1e9; for (let k = 0; k < pal.length; k++) { const d = (r0 - pal[k][0]) ** 2 + (g0 - pal[k][1]) ** 2 + (b0 - pal[k][2]) ** 2; if (d < bd) { bd = d; b = k; } }
        q[i] = b;
      }
      // 부서지는 순서: 피사체의 아래 끝 = 0 → 위 끝 = 1 (피사체 높이 기준), 노이즈로 들쭉날쭉 · 칸마다 조금씩 어긋남
      let rTop = rows, rBot = -1;
      for (let i = 0; i < N; i++) if (mk[i] >= 0.5) { const r = (i / cols) | 0; if (r < rTop) rTop = r; if (r > rBot) rBot = r; }
      const f = vnoise(seed + 5), order = new Float32Array(N), span = Math.max(1, rBot - rTop + 1), sub = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c; if (mk[i] < 0.5) continue;
        order[i] = (rBot - r + 0.5) / span + (f(c / cols * 5, r / rows * 5) - 0.5) * D.edgeNoise + (hash(c, r, seed + 9) - 0.5) * 0.03;
        sub.push(i);
      }
      // 흘러내리는 칸: 위쪽 keep 아래 (아래 끝부터 순서대로 — 진행할수록 위로 넓어짐)
      sub.sort((a, b) => order[a] - order[b]);
      const low = Uint32Array.from(sub.filter((i) => order[i] < 1 - D.keep));
      const img = document.createElement('canvas'); img.width = cols; img.height = rows;
      return { src: p.photo, mask: p.mask, cell, w: rw, h: rh, cols, rows, rgb, mk, pal, q, low, shedAcc: 0, seed, img, g: img.getContext('2d'), id: new ImageData(cols, rows), P: -1, v: 0 };
    }

    // 사진 격자를 그림: 피사체 = 팔레트 색, 누끼 밖 = 비움 (모래가 떨어져도 사진은 그대로)
    function render(e) {
      const { cols, rows, pal, q, mk } = e, d8 = e.id.data;
      for (let i = 0, N = cols * rows; i < N; i++) {
        const o = i * 4;
        if (mk[i] < 0.5) { d8[o + 3] = 0; continue; }
        const col = pal[q[i]];
        d8[o] = col[0]; d8[o + 1] = col[1]; d8[o + 2] = col[2]; d8[o + 3] = 255;
      }
      e.g.putImageData(e.id, 0, 0);
      e.P = P; e.v++;
    }

    function entry(p) {
      let e = cache.get(p.key);
      if (!e || e.src !== p.photo || e.mask !== p.mask || e.cell !== G) {
        e = prepare(p);
        cache.set(p.key, e); drawn = '';
      }
      return e;
    }

    // 떨어지는 모래 한 알 크기 (px) — 사진 칸(알갱이 크기 G)보다 작게
    const sandSize = () => Math.max(1, Math.round(G * D.sandScale));
    // 사진 칸 i 자리에서 모래 알갱이가 떨어짐 (색 = 그 자리 원래 사진 색) — 칸은 그대로 (사진이 줄지 않음)
    function drop(e, i, gx, gy) {
      falling.push({
        x: gx + (Math.random() - 0.5) * G, y: gy + (Math.random() - 0.5) * G, s: sandSize(), vx: (Math.random() - 0.5) * 2 * D.shedSpread, vy: Math.random() * 10,
        vmax: D.shedFall[0] + (D.shedFall[1] - D.shedFall[0]) * Math.random(),
        r: e.rgb[i * 3], g: e.rgb[i * 3 + 1], b: e.rgb[i * 3 + 2],
      });
    }
    // 흘러내림: 피사체 아랫부분(위쪽 keep 아래)의 칸들에서 모래가 계속 떨어짐 — 사진은 그대로 남음
    //  진행도 P 가 오를수록 흘러내리는 구역이 아래 끝에서 keep 선까지 올라가고 양도 늘어남 (아래쪽일수록 많이)
    function shed(dt) {
      if (K < 0.5 || P < 0.01) return;
      for (const ph of photos) {
        const e = cache.get(ph.key); if (!e || !e.low.length) continue;
        const cw = ph.rect[2] / e.cols, chh = ph.rect[3] / e.rows;
        e.shedAcc += D.shed * ph.rect[2] * vz * strength * (0.25 + 0.75 * P) * dt;
        let m = Math.floor(e.shedAcc); e.shedAcc -= m;
        const reach = Math.max(1, Math.ceil(e.low.length * P));
        while (m-- > 0 && falling.length < D.fallMax) {
          const i = e.low[(reach * Math.pow(Math.random(), 1.6)) | 0];
          const gx = (ph.rect[0] + (i % e.cols + 0.5) * cw) * vz + vox, gy = (ph.rect[1] + (((i / e.cols) | 0) + 0.5) * chh) * vz + voy;
          if (!burntAt(gx, gy)) drop(e, i, gx, gy);
        }
      }
    }

    // 커서: 지나간 자리의 사진 칸에서 모래가 떨어짐 (사진은 그대로) → 아래로 떨어져 쌓임
    function sweep() {
      const p = ptr, q = prevPtr; prevPtr = ptr;
      if (!p || K < 0.5) return;
      const S = (pt) => [pt[0] * vz + vox, pt[1] * vz + voy];
      const sa = S(q || p), sb = S(p), len = Math.hypot(sb[0] - sa[0], sb[1] - sa[1]);
      const steps = Math.max(1, Math.ceil(len / (D.cursorR * 0.5)));
      for (let k = 1; k <= steps; k++) {
        const sx = sa[0] + (sb[0] - sa[0]) * k / steps, sy = sa[1] + (sb[1] - sa[1]) * k / steps;
        const wx = (sx - vox) / vz, wy = (sy - voy) / vz, R = D.cursorR / vz;
        for (const ph of photos) {
          const e = cache.get(ph.key); if (!e) continue;
          const cw = ph.rect[2] / e.cols, chh = ph.rect[3] / e.rows;
          const c0 = Math.max(0, Math.floor((wx - R - ph.rect[0]) / cw)), c1 = Math.min(e.cols - 1, Math.floor((wx + R - ph.rect[0]) / cw));
          const r0 = Math.max(0, Math.floor((wy - R - ph.rect[1]) / chh)), r1 = Math.min(e.rows - 1, Math.floor((wy + R - ph.rect[1]) / chh));
          for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            const i = r * e.cols + c; if (e.mk[i] < 0.5) continue;   // 누끼 밖
            const x = ph.rect[0] + (c + 0.5) * cw, y = ph.rect[1] + (r + 0.5) * chh;
            if ((x - wx) ** 2 + (y - wy) ** 2 > R * R) continue;
            const gx = x * vz + vox, gy = y * vz + voy;
            if (burntAt(gx, gy)) continue;   // 화면 가장자리에서 타 버린 곳
            if (falling.length < D.fallMax && Math.random() < D.sweepShed) drop(e, i, gx, gy);   // 칸마다 가끔 (너무 많지 않게)
          }
        }
      }
    }
    // 모래비 — 화면 위 끝에서 모래가 조금씩 떨어짐 (산소가 높을수록 많이). 바람 없이 곧게, 알갱이마다 조금 다른 빠르기로 천천히
    //  색 = 모래 색 (조금씩 다르게), 크기 = 떨어지는 모래 크기 (sandSize)
    function stepRain(dt) {
      if (K < 0.5) { rainAcc = 0; return; }
      rainAcc += dt * (D.rain[0] + (D.rain[1] - D.rain[0]) * air);
      let n = Math.floor(rainAcc); rainAcc -= n;
      while (n-- > 0 && falling.length < D.fallMax) {
        const c = D.rainSand[(Math.random() * D.rainSand.length) | 0], j = (Math.random() - 0.5) * 16, s = sandSize();
        falling.push({
          x: vis[0] + Math.random() * vis[2], y: vis[1] - s, s, vx: 0, vy: 0,
          vmax: D.rainFall[0] + (D.rainFall[1] - D.rainFall[0]) * Math.random(),
          r: Math.round(c[0] + j), g: Math.round(c[1] + j), b: Math.round(c[2] + j),
        });
      }
    }
    // 떨어짐 → 화면 아래 모래 더미에 쌓임 (안식각만큼 옆으로 흘러내림)
    function stepFall(dt) {
      if (!falling.length) return;
      const bottom = vis[1] + vis[3], maxH = vis[3] * D.pileMax, H = pile.h;
      const topAt = (c, n) => { let m = 0; for (let j = c; j < c + n; j++) if (H[j] > m) m = H[j]; return m; };
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        f.vy += D.gravity * dt; f.vx *= 1 - Math.min(1, dt * 2);
        if (f.vmax && f.vy > f.vmax) f.vy = f.vmax;   // 모래비: 천천히 내려옴
        f.x += f.vx * dt; f.y += f.vy * dt;
        const n = Math.max(1, Math.round(f.s / COL));
        let c = Math.floor((f.x - f.s / 2 - vis[0]) / COL);
        if (c < 0 || c + n > pile.cols) { if (f.y > bottom + 20) falling.splice(i, 1); continue; }
        if (f.y + f.s / 2 < bottom - topAt(c, n)) continue;
        // 닿음: 더 낮은 이웃으로 (알갱이 하나 폭씩) 흘러내림
        for (let k = 0; k < 60; k++) {
          const dir = Math.random() < 0.5 ? -1 : 1, a = c + dir * n, b = c - dir * n, h0 = topAt(c, n) - D.repose * f.s;
          if (a >= 0 && a + n <= pile.cols && topAt(a, n) < h0) c = a;
          else if (b >= 0 && b + n <= pile.cols && topAt(b, n) < h0) c = b;
          else break;
        }
        const top = topAt(c, n);
        if (top < maxH) {
          const pg = pile.g, s = pile.dpr;
          pg.fillStyle = `rgb(${f.r},${f.g},${f.b})`;
          pg.fillRect(Math.floor(c * COL * s), Math.floor((vis[3] - top - f.s) * s), Math.ceil(n * COL * s), Math.ceil(f.s * s));
          for (let j = c; j < c + n; j++) H[j] = top + f.s;
        }
        falling.splice(i, 1);
      }
      drawn = '';
    }

    function draw() {
      const sig = [K.toFixed(3), vz, vox, voy, canvas.width, canvas.height, vis.join(','), scorch ? scorch.v : -1].concat(photos.map((p) => p.key + ':' + p.rect.join(',') + ':' + (cache.get(p.key) || {}).v)).join('|');
      if (sig === drawn && !falling.length) return;
      drawn = sig;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (K < 0.003) return;
      ctx.globalAlpha = K;
      ctx.imageSmoothingEnabled = false;   // 거친 픽셀 그대로
      ctx.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);
      for (const p of photos) { const e = cache.get(p.key); if (e) ctx.drawImage(e.img, p.rect[0], p.rect[1], p.rect[2], p.rect[3]); }
      // 떨어지는 모래 · 쌓인 모래 (화면 기준)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = K;
      for (const f of falling) { ctx.fillStyle = `rgb(${f.r},${f.g},${f.b})`; ctx.fillRect(f.x - f.s / 2, f.y - f.s / 2, f.s, f.s); }
      ctx.drawImage(pile.img, vis[0], vis[1], pile.img.width / pile.dpr, pile.img.height / pile.dpr);
      // 화면 가장자리 탄 자국 — 맨 위 (사진·모래도 함께 타 들어감)
      if (scorch && B > 5e-4) ctx.drawImage(scorch.img, vis[0], vis[1], scorch.cols * scorch.cell, scorch.rows * scorch.cell);
      ctx.globalAlpha = 1;
    }

    return {
      canvas,
      resize() { resize(); drawn = ''; draw(); },
      setView(z, ox, oy) { vz = z; vox = ox; voy = oy; },
      pointer(x, y) { ptr = x == null ? null : [x, y]; if (x == null) prevPtr = null; },
      // ps: [{ key, rect: 프레임 px [x, y, w, h], mask, photo: 원본 캔버스 }]
      syncPhotos(ps) {
        photos = ps.filter((p) => p.photo);
        for (const k of cache.keys()) if (!photos.some((p) => p.key === k)) cache.delete(k);
      },
      // T·RH·O2 = 사막화 세기를 정하는 값 (O2 = 모래비 양도), dT·dRH = 다이얼 값 (타는 깊이·알갱이 크기 — 없으면 T·RH)
      update(dt, vitality, T, RH, O2, dT, dRH) {
        strength = DT.desertStrength(vitality, T, RH, O2);
        air = Math.max(0, Math.min(1, (O2 == null ? 21 : O2) / 100));
        const g = DT.desertGrain(dRH == null ? RH : dRH);
        if (g !== G) { G = g; drawn = ''; }
        burnTo = D.burnMax * sstep(D.burnT[0], D.burnT[1], dT == null ? T : dT);
        if (dt > 0) {
          clock += dt;
          K += Math.sign((strength > 0 ? 1 : 0) - K) * Math.min(Math.abs((strength > 0 ? 1 : 0) - K), dt / D.fadeIn);
          P = strength > 0 ? Math.min(1, P + dt * strength / D.time) : Math.max(0, P - dt / D.recover);
          // 타들어감: 기온이 정한 깊이까지 천천히 (탄 곳은 되돌아오지 않음) — 타는 동안 불씨가 밝고, 멈추면 잦아듦
          const going = K > 0.5 && B < burnTo - 1e-4;
          if (going) B = Math.min(burnTo, B + dt * D.burnSpeed * (0.35 + 0.65 * burnTo / D.burnMax));
          emberK += ((going ? 1 : burnTo > 0 && B > 0 ? 0.18 : 0) - emberK) * Math.min(1, dt * 2.5);
        }
        if (K >= 0.003) {
          for (const p of photos) entry(p);
          sweep();
          if (dt > 0) shed(dt);
          redrawT -= dt;
          for (const p of photos) { const e = cache.get(p.key); if (e.P < 0) render(e); }   // 사진은 바뀌지 않으므로 처음 한 번만
          const s = scorchGrid();   // 화면 가장자리 탄 자국 (불씨는 깜박이므로 타는 동안 계속 다시 그림)
          if (s.B < 0 || (redrawT <= 0 && (Math.abs(s.B - B) > 1e-4 || (B > 5e-4 && emberK > 0.01)))) renderScorch();
          if (redrawT <= 0) redrawT = D.redraw;
        } else prevPtr = null;
        if (dt > 0) { stepRain(dt); stepFall(dt); }
        draw();
      },
      get visible() { return K; },
      get strength() { return strength; },
      get progress() { return P; },
      get burnt() { return B; },
      get grain() { return G; },
      get sand() { let s = 0; for (const h of pile.h) s += h; return Math.round(s * COL / (sandSize() ** 2)); },
      clear() {
        cache.clear(); photos = []; falling.length = 0; K = 0; P = 0; B = 0; emberK = 0; rainAcc = 0; drawn = ''; scorch = null;
        pile.h.fill(0); pile.g.clearRect(0, 0, pile.img.width, pile.img.height);
        draw();
      },
    };
  };
})(window.DT = window.DT || {});
