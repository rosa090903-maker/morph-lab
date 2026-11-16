/*
 * 부식 — Vitality 끔 + 기온·습도·산소가 모두 높을 때 (기포 모드보다 우선)
 *
 *  누끼 딴 피사체와 화면 가장자리가 녹슨 금속처럼 두 가지 대비가 센 색으로 바뀜 (참고 사진: 녹 + 녹청)
 *   · 녹(주황·적갈색): 흐르는 얼룩 노이즈 + 어두운 자리 + 둥근 부식 구멍(핏) — 경계는 밝은 주황·노랑 테두리, 안쪽은 짙은 적갈색
 *   · 녹청(옅은 초록·청록): 나머지 표면, 사진 명암을 따라 밝기
 *   · 화면 가장자리: 보이는 화면의 네 변에서 안쪽으로 들쭉날쭉한 띠가 부식됨 (가장자리일수록 녹이 많음)
 *  모양 (참고 영상 캡처) — 움직임 없이 촘촘한 격자 점으로 그려지고, 점마다 높이(밝기·녹)만큼 위로 들려
 *   높이가 꺼지는 자리에는 세로 줄이 생겨 표면이 선(줄무늬)으로 보임
 *  커서 — 지나간 자리에 같은 부식(녹 + 녹청 격자 점)이 번지며 흔적으로 남음. 들쭉날쭉한 경계로 점이 하나씩 피어나고, 리셋할 때까지 그대로
 *   화면 전체 크기의 부식 판을 한 번 만들어 두고 커서가 지나간 칸의 점만 옮겨 그림 (피사체 위는 이미 부식돼 있으므로 건너뜀)
 *  사진마다 한 번 그려 두고(오프스크린) 매 프레임은 붙이기만 함 → 세기에 따라 서서히 나타나고 사라짐
 *
 *  좌표 = 프레임 CSS px (js/microbe.js 와 같음), 휠 확대는 setView 로 맞춤 (화면 가장자리는 확대와 무관)
 *  수치는 DT.CORRODE 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  DT.CORRODE = {
    // 켜지는 조건 (Life 끔): 기온 tempFrom 이상 tempTo 미만 · 습도 humFrom 이상 · 산소 o2From 이상
    tempFrom: 15, tempTo: 45,      // 기온(°C) — 15° 이상 45° 미만
    tempFull: 40,                  // 여기서 가장 셈 (따뜻할수록 빨리 녹슮)
    humFrom: 60, humFull: 100,     // 습도(%) — 켜지는 구간 전체(60 → 100 %)가 밀도 최소 → 최대
    o2From: 15, o2Full: 100,       // 산소(%) — 켜지는 구간 전체(15 → 100 %)가 크기 최소 → 최대
    spacing: 3,                    // 격자 점 간격(px) — 처음 값 (실제로는 습도에 따라 spacingRange)
    dot: 1.9,                      // 점(네모) 크기(px) — 처음 값 (실제로는 공기에 따라 dotRange)
    spacingRange: [5, 2.2],        // 습도 humFrom → humFull: 간격 넓음(성김) → 좁음(빽빽)
    dotRange: [3.2, 1.0],          // 녹 점(네모) 크기 범위 — 산소 o2From → o2Full 로 1.0 → 3.2 (산소 ↑ → 녹 얼룩이 커짐, 간격의 92 % 를 넘지 않음)
    lift: 18,                      // 가장 높은 자리가 위로 들리는 정도(px)
    streak: 0.6,                   // 높이가 꺼지는 자리의 세로 줄 진하기 (0 = 없음)
    rust: 0.45,                    // 녹이 덮는 피사체 비율 (0~1)
    blob: 170,                     // 녹 얼룩 크기(px)
    pits: 0.00012,                 // 부식 구멍 수 (피사체 px² 당)
    fadeIn: 1.4,                   // 나타나기·사라지기(초)
    // 화면 가장자리
    edge: 0.075,                   // 가장자리 띠 폭 (보이는 화면 짧은 변 대비)
    edgeRough: 0.8,               // 띠 안쪽 경계의 들쭉날쭉한 정도 (0 = 곧은 띠)
    edgeRust: 0.35,                // 가장자리에 가까울수록 녹이 더 많아지는 정도
    // 커서 — 지나간 자리에 부식 흔적
    cursorR: 26,                   // 흔적 반경(px, 화면 기준) — 자리마다 0.55~1.45 배로 들쭉날쭉
    trailSpread: 0.45,             // 커서 자리 → 흔적 가장자리까지 점이 번져 나가는 시간(초)
    trailJitter: 0.35,             // 점마다 나타나는 때의 흩어짐(초)
    // 꾹 누르기 — 왼쪽 버튼을 누른 채 거의 움직이지 않으면 그 자리에서 부식이 점점 넓게 자람
    holdGrow: 0.9,                 // 초당 반경 증가 (cursorR 의 배수)
    holdMax: 8,                    // 최대 반경 = cursorR × (1 + holdMax)
    holdStill: 6,                  // 이만큼(px, 화면 기준) 넘게 움직이면 처음부터 다시
    // 두 색 — 녹 / 녹청
    rustRim: [255, 196, 70],       // 녹 테두리 (밝은 노랑 주황)
    rustMid: [236, 104, 24],       // 녹 (주황)
    rustDeep: [158, 46, 14],       // 깊은 녹 (적갈색)
    verdDark: [60, 196, 160],      // 녹청 (어두운 자리 — 청록)
    verdLight: [214, 244, 186],    // 녹청 (밝은 자리 — 옅은 연두)
    maxDpr: 1.5,
  };

  const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // 조건 → 세기 0~1 (Vitality 켬 / 하나라도 낮으면 0)
  DT.corrodeStrength = function (vitality, T, RH, O2) {
    const C = DT.CORRODE;
    if (vitality || T < C.tempFrom || T >= C.tempTo || RH < C.humFrom || O2 < C.o2From) return 0;
    return (0.4 + 0.6 * sstep(C.tempFrom, C.tempFull, T)) * (0.4 + 0.6 * sstep(C.humFrom, C.humFull, RH)) * (0.4 + 0.6 * sstep(C.o2From, C.o2Full, O2));
  };

  // 값 노이즈 (씨앗마다)
  function noise2(seed) {
    const hash = (x, y) => { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const n = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    return (x, y) => { let s = 0, amp = 0.5, f = 1; for (let o = 0; o < 5; o++) { s += amp * n(x * f + o * 17.3, y * f - o * 9.1); amp *= 0.5; f *= 2.03; } return s / 0.97; };
  }

  DT.createCorrosion = function (canvas, frame) {
    const C = DT.CORRODE;
    const ctx = canvas.getContext('2d');
    let Wc = 1, Hc = 1, dpr = 1, vz = 1, vox = 0, voy = 0, K = 0, strength = 0, drawn = '';
    let vis = [0, 0, 1, 1];    // 실제로 보이는 화면 (프레임 CSS px: x, y, w, h)
    const cache = new Map();   // key → 사진 부식 (build 결과 + 원본 참조), '__edge' = 화면 가장자리
    let photos = [];
    let ptr = null, prevPtr = null;
    let pressed = false, holdAt = null, holdT = 0;   // 꾹 누르기: 누른 자리(화면 px) · 누른 시간(초)
    let trail = null;         // 커서 흔적 { e: 화면 전체 부식 판(build), c/g: 지금까지 나타난 점, on: 흔적 칸, queue: 나타날 점 [칸, 때] }
    const jag = noise2(5309);  // 흔적 경계의 들쭉날쭉함
    // 지금 격자: 습도 → 간격(밀도), 공기 → 네모 크기. 값이 바뀌면 잠깐(0.2초) 멈춘 뒤 다시 그림
    let sp = C.spacing, dotPx = C.dot, look = sp + ',' + dotPx, lookPend = null, lookPendT = 0;
    function setLook(RH, O2) {
      const h = sstep(C.humFrom, C.humFull, RH), o = sstep(C.o2From, C.o2Full, O2);
      const nsp = Math.round((C.spacingRange[0] + (C.spacingRange[1] - C.spacingRange[0]) * h) * 4) / 4;
      const ndot = Math.round(Math.min(nsp * 0.92, C.dotRange[1] + (C.dotRange[0] - C.dotRange[1]) * o) * 5) / 5;   // 산소 ↑ → 큰 녹 점
      const key = nsp + ',' + ndot, now = performance.now();
      if (key === look) { lookPend = null; return; }
      if (!lookPend || lookPend.key !== key) { lookPend = { key, nsp, ndot }; lookPendT = now; return; }
      if (now - lookPendT > 200 || !cache.size || K < 0.05) { sp = nsp; dotPx = ndot; look = key; lookPend = null; }   // 아직 거의 안 보이면 바로
    }

    function resize() {
      dpr = Math.min(C.maxDpr, window.devicePixelRatio || 1);
      Wc = frame.clientWidth || 1; Hc = frame.clientHeight || 1;
      const w = Math.round(Wc * dpr), h = Math.round(Hc * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; drawn = ''; }
      // 보이는 영역 = 프레임 ∩ 창
      const r = frame.getBoundingClientRect(), k = r.width ? Wc / r.width : 1;
      const x0 = Math.max(0, -r.left) * k, y0 = Math.max(0, -r.top) * k;
      const x1 = Math.min(r.width, window.innerWidth - r.left) * k, y1 = Math.min(r.height, window.innerHeight - r.top) * k;
      vis = [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
    }
    resize();

    /*
     * 격자 → 부식된 점 이미지 (rw × rh CSS px, 위로 lift 만큼 여백) + 점마다 자리·색 (떨어뜨릴 때 씀)
     *  lum, mk: cols × rows 밝기·매트, bias: 녹을 더하는 양(없으면 0), dead: 이미 떨어져 나간 칸 (다시 그리지 않음)
     */
    function build(seed, lum, mk, bias, cols, rows, rw, rh, dead) {
      const N = cols * rows, cor = new Float32Array(N);
      const fbm = noise2(seed), warp = noise2(seed + 101);
      let rnd = seed >>> 0; const R = () => ((rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0) / 4294967296);
      // 부식 구멍 (둥근 핏)
      const pits = [], nP = Math.round(C.pits * rw * rh), BS = 24, bucket = new Map();
      for (let i = 0; i < nP; i++) pits.push([R() * rw, R() * rh, 3 + Math.pow(R(), 2) * 16]);
      for (const p of pits) { const k = ((p[0] / BS) | 0) + ',' + ((p[1] / BS) | 0); if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(p); }
      const inside = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (mk[i] < 0.5) continue;
        const x = c * sp, y = r * sp, b = C.blob;
        const wx = warp(x / b * 1.3, y / b * 1.3) - 0.5, wy = warp(x / b * 1.3 + 40, y / b * 1.3 - 20) - 0.5;
        let s = fbm(x / b + wx * 1.4, y / b + wy * 1.4) * 0.7 + (1 - lum[i]) * 0.3 + (bias ? bias[i] : 0);
        const bx = (x / BS) | 0, by = (y / BS) | 0;   // 가까운 구멍: 가운데가 가장 깊음
        for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
          const L = bucket.get((bx + k) + ',' + (by + j)); if (!L) continue;
          for (const p of L) { const d = Math.hypot(x - p[0], y - p[1]) / p[2]; if (d < 1.6) s += 0.32 * Math.max(0, 1 - d * d / 2.56); }
        }
        cor[i] = s; inside.push(s);
      }
      // 녹 비율이 C.rust 가 되도록 문턱값
      inside.sort((a, b) => a - b);
      const th = inside.length ? inside[Math.min(inside.length - 1, Math.floor(inside.length * (1 - C.rust)))] : 1;
      // 점마다 색·높이
      const col = new Uint8ClampedArray(N * 3), hOf = new Float32Array(N), alive = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        if (mk[i] < 0.5 || (dead && dead[i])) continue;
        const t = cor[i] - th, l = lum[i];
        let cc, h;
        if (t > 0) {   // 녹: 테두리 → 주황 → 깊은 적갈색 (+ 얼룩 반점)
          const dpt = Math.min(1, t / 0.14);
          cc = dpt < 0.18 ? mixc(C.rustRim, C.rustMid, dpt / 0.18) : mixc(C.rustMid, C.rustDeep, sstep(0.18, 0.85, dpt));
          if (R() < 0.12) cc = mixc(cc, C.rustRim, 0.6);
          h = 0.45 + 0.45 * dpt + 0.1 * l;
        } else {       // 녹청: 사진 명암을 따라 청록 → 옅은 연두, 아주 밝은 곳은 거의 흰빛
          cc = mixc(C.verdDark, C.verdLight, sstep(0.08, 0.85, l));
          if (l > 0.85) cc = mixc(cc, [240, 248, 236], (l - 0.85) / 0.15);
          h = 0.35 * l * sstep(-0.25, 0, t);   // 녹 쪽으로 갈수록 살짝 들림
        }
        col[i * 3] = cc[0]; col[i * 3 + 1] = cc[1]; col[i * 3 + 2] = cc[2]; hOf[i] = h; alive[i] = 1;
      }
      // 오프스크린에 점·줄 그리기 (픽셀 직접)
      const lift = C.lift, W = Math.max(1, Math.round(rw * dpr)), H = Math.max(1, Math.round((rh + lift) * dpr));
      const img = new ImageData(W, H), d8 = img.data;
      const ds = Math.max(1, Math.round(dotPx * dpr));
      const blend = (o, i, a) => {
        const A = d8[o + 3] / 255, na = a + A * (1 - a);
        for (let q = 0; q < 3; q++) d8[o + q] = (col[i * 3 + q] * a + d8[o + q] * A * (1 - a)) / na;
        d8[o + 3] = na * 255;
      };
      const px = new Float32Array(N), py = new Float32Array(N), py2 = new Float32Array(N);   // 점 자리 (CSS px, 이미지 기준) · 세로 줄 끝
      // 위 줄부터 아래로 (아래 줄이 위에 겹침 = 앞쪽)
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c; if (!alive[i]) continue;
        const a = 0.95 * sstep(0.5, 0.8, mk[i]);
        const x = (c + 0.5) * sp, y = lift + (r + 0.5) * sp - hOf[i] * lift;
        px[i] = x; py[i] = y; py2[i] = y;
        // 아래 칸이 더 낮으면 그 사이를 세로 줄로 이음 (표면이 꺼지는 자리 = 줄무늬)
        const j = i + cols;
        if (C.streak > 0 && r + 1 < rows && alive[j]) {
          const y2 = lift + (r + 1.5) * sp - hOf[j] * lift;
          if (y2 - y > sp * 1.25) {
            py2[i] = y2;
            const xx = Math.round(x * dpr);
            if (xx >= 0 && xx < W) for (let yy = Math.max(0, Math.round((y + sp * 0.4) * dpr)); yy < Math.min(H, Math.round(y2 * dpr)); yy++) blend((yy * W + xx) * 4, i, C.streak * a / 0.95);
          }
        }
        const x0 = Math.round(x * dpr - ds / 2), y0 = Math.round(y * dpr - ds / 2);
        for (let yy = Math.max(0, y0); yy < Math.min(H, y0 + ds); yy++) for (let xx = Math.max(0, x0); xx < Math.min(W, x0 + ds); xx++) blend((yy * W + xx) * 4, i, a);
      }
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const og = off.getContext('2d'); og.putImageData(img, 0, 0);
      return { img: off, g: og, cols, rows, sp, ds, px, py, py2, col, alive, w: rw, h: rh, dpr, look, t: performance.now() };
    }

    // 지난 판의 떨어져 나간 칸을 새 격자 크기에 맞춤 (크기를 바꿔도 떨어진 자리는 그대로)
    function remapDead(old, cols, rows) {
      if (!old) return null;
      const d = new Uint8Array(cols * rows);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const oc = Math.min(old.cols - 1, Math.floor((c + 0.5) / cols * old.cols)), or = Math.min(old.rows - 1, Math.floor((r + 0.5) / rows * old.rows));
        d[r * cols + c] = old.dead[or * old.cols + oc];
      }
      return d;
    }

    // 사진 → 격자 밝기·매트
    function photoGrid(p, rw, rh) {
      const cols = Math.max(2, Math.ceil(rw / sp)), rows = Math.max(2, Math.ceil(rh / sp));
      const sc = document.createElement('canvas'); sc.width = cols; sc.height = rows;
      const sg = sc.getContext('2d', { willReadFrequently: true });
      sg.imageSmoothingQuality = 'high'; sg.drawImage(p.photo, 0, 0, cols, rows);
      const d = sg.getImageData(0, 0, cols, rows).data, M = p.mask;
      const lum = new Float32Array(cols * rows), mk = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c, u = (c + 0.5) / cols, v = (r + 0.5) / rows;
        lum[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
        mk[i] = M ? M.m[Math.min(M.h - 1, (v * M.h) | 0) * M.w + Math.min(M.w - 1, (u * M.w) | 0)] : 1;
      }
      return { cols, rows, lum, mk };
    }
    // 화면 가장자리 띠 → 격자 밝기(노이즈)·매트·녹 더함
    function edgeGrid(rw, rh) {
      const cols = Math.max(2, Math.ceil(rw / sp)), rows = Math.max(2, Math.ceil(rh / sp));
      const band = C.edge * Math.min(rw, rh), f = noise2(9173), g = noise2(4421);
      const lum = new Float32Array(cols * rows), mk = new Float32Array(cols * rows), bias = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c, x = (c + 0.5) * sp, y = (r + 0.5) * sp;
        const d = Math.min(x, rw - x, y, rh - y);                         // 가장 가까운 변까지
        const reach = band * (1 + C.edgeRough * (f(x / 140, y / 140) - 0.5) * 2);   // 들쭉날쭉한 안쪽 경계
        mk[i] = d < reach ? 1 : 0;
        lum[i] = 0.25 + 0.7 * g(x / 60, y / 60);
        bias[i] = C.edgeRust * (1 - Math.min(1, d / Math.max(1, reach)));
      }
      return { cols, rows, lum, mk, bias };
    }

    function photoEntry(p) {
      let e = cache.get(p.key);
      const rw = p.rect[2], rh = p.rect[3];
      const stale = !e || e.src !== p.photo || e.mask !== p.mask || e.dpr !== dpr || e.look !== look;   // look = 습도·공기에 따른 간격·네모 크기
      const sized = e && (Math.abs(e.w - rw) / rw > 0.04 || Math.abs(e.h - rh) / rh > 0.04);
      if (stale || (sized && performance.now() - e.t > 250)) {   // 크기 조절 중에는 늘려 붙이다가 잠깐 멈추면 다시 그림
        const G = photoGrid(p, rw, rh);
        const dead = e && e.src === p.photo ? remapDead(e, G.cols, G.rows) : null;   // 같은 사진이면 떨어진 자리 유지
        const n = build((typeof p.key === 'number' ? p.key : 7) * 7919 + 13, G.lum, G.mk, null, G.cols, G.rows, rw, rh, dead);
        n.src = p.photo; n.mask = p.mask; n.dead = dead || new Uint8Array(G.cols * G.rows);
        cache.set(p.key, e = n); drawn = '';
      }
      return e;
    }
    function edgeEntry() {
      let e = cache.get('__edge');
      if (!e || Math.abs(e.w - vis[2]) > 2 || Math.abs(e.h - vis[3]) > 2 || e.dpr !== dpr || e.look !== look) {
        const G = edgeGrid(vis[2], vis[3]);
        const dead = e ? remapDead(e, G.cols, G.rows) : null;
        const n = build(31337, G.lum, G.mk, G.bias, G.cols, G.rows, vis[2], vis[3], dead);
        n.dead = dead || new Uint8Array(G.cols * G.rows);
        cache.set('__edge', e = n); drawn = '';
      }
      return e;
    }

    /*
     * 커서 흔적 판 — 보이는 화면 전체를 같은 방식(build)으로 부식시켜 둔 원본. 화면 크기·격자 모양이 바뀌면 다시 만들고 흔적 칸은 옮겨 다시 그림
     */
    function trailEntry() {
      const old = trail;
      if (old && Math.abs(old.e.w - vis[2]) <= 2 && Math.abs(old.e.h - vis[3]) <= 2 && old.e.dpr === dpr && old.e.look === look) return old;
      const rw = vis[2], rh = vis[3], cols = Math.max(2, Math.ceil(rw / sp)), rows = Math.max(2, Math.ceil(rh / sp)), N = cols * rows;
      const lum = new Float32Array(N), mk = new Float32Array(N).fill(1), g = noise2(7717);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) lum[r * cols + c] = 0.25 + 0.7 * g((c + 0.5) * sp / 60, (r + 0.5) * sp / 60);
      const e = build(2711, lum, mk, null, cols, rows, rw, rh, null);
      const c = document.createElement('canvas'); c.width = e.img.width; c.height = e.img.height;
      const t = { e, c, g: c.getContext('2d'), on: old ? remapDead({ cols: old.e.cols, rows: old.e.rows, dead: old.on }, cols, rows) : new Uint8Array(N), queue: [] };
      for (let i = 0; i < N; i++) if (t.on[i]) showCell(t, i);   // 지난 흔적은 바로
      trail = t; drawn = '';
      return t;
    }
    // 흔적 칸 하나 나타남: 원본 판에서 그 점(+ 아래 세로 줄)만 옮겨 그림
    function showCell(t, i) {
      const e = t.e; if (!e.alive[i]) return;
      const s = e.ds, x0 = Math.max(0, Math.floor(e.px[i] * e.dpr - s / 2) - 1), y0 = Math.max(0, Math.floor(e.py[i] * e.dpr - s / 2) - 1);
      const w = Math.min(e.img.width - x0, s + 2), h = Math.min(e.img.height - y0, Math.ceil((e.py2[i] - e.py[i]) * e.dpr) + s + 2);
      if (w > 0 && h > 0) t.g.drawImage(e.img, x0, y0, w, h, x0, y0, w, h);
    }
    // 화면 프레임 px (확대 반영) 자리가 부식된 피사체 위인지 — 그 위는 이미 부식돼 있으므로 흔적을 남기지 않음
    function onSubject(X, Y) {
      const wx = (X - vox) / vz, wy = (Y - voy) / vz;
      for (const p of photos) {
        const u = (wx - p.rect[0]) / p.rect[2], v = (wy - p.rect[1]) / p.rect[3];
        if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
        const M = p.mask;
        if (!M || M.m[Math.min(M.h - 1, (v * M.h) | 0) * M.w + Math.min(M.w - 1, (u * M.w) | 0)] >= 0.5) return true;
      }
      return false;
    }
    // 커서 자리 (화면 프레임 px) 둘레를 흔적으로 — 가운데부터 들쭉날쭉하게 번져 나감
    function stamp(t, X, Y, now, rad) {
      const e = t.e, sp = e.sp, R = rad * 1.45, lx = X - vis[0], ly = Y - vis[1];
      const c0 = Math.max(0, Math.floor((lx - R) / sp)), c1 = Math.min(e.cols - 1, Math.ceil((lx + R) / sp));
      const r0 = Math.max(0, Math.floor((ly - R) / sp)), r1 = Math.min(e.rows - 1, Math.ceil((ly + R) / sp));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * e.cols + c;
        if (t.on[i]) continue;
        const x = (c + 0.5) * sp, y = (r + 0.5) * sp, reach = rad * (0.55 + 0.9 * jag(x / 34, y / 34));
        const d = Math.hypot(x - lx, y - ly);
        if (d > reach || onSubject(vis[0] + x, vis[1] + y)) continue;
        t.on[i] = 1;
        t.queue.push([i, now + (d / reach * C.trailSpread + Math.random() * C.trailJitter) * 1000]);
      }
    }
    function sweep(dt) {
      const p = ptr, q = prevPtr; prevPtr = ptr;
      const now = performance.now();
      if (trail && trail.queue.length) {   // 차례가 된 점을 나타냄
        let n = 0;
        trail.queue = trail.queue.filter(([i, at]) => { if (at > now) return true; showCell(trail, i); n++; return false; });
        if (n) drawn = '';
      }
      if (!p || K < 0.5) { holdAt = null; holdT = 0; return; }
      const t = trailEntry(), a = q || p;
      // 화면 기준 커서 (확대 반영) — 빠르게 움직여도 빠짐없이 (선분을 따라 여러 번)
      const S = (pt) => [pt[0] * vz + vox, pt[1] * vz + voy];
      const sa = S(a), sb = S(p), len = Math.hypot(sb[0] - sa[0], sb[1] - sa[1]);
      const steps = Math.max(1, Math.ceil(len / (C.cursorR * 0.5)));
      for (let k = q ? 1 : 0; k <= steps; k++) { const f = k / steps; stamp(t, sa[0] + (sb[0] - sa[0]) * f, sa[1] + (sb[1] - sa[1]) * f, now, C.cursorR); }
      // 꾹 누르기: 거의 그 자리에 머무는 동안 반경이 점점 커짐 (바깥 고리가 차례로 번져 나감)
      if (!pressed) { holdAt = null; holdT = 0; return; }
      if (!holdAt || Math.hypot(sb[0] - holdAt[0], sb[1] - holdAt[1]) > C.holdStill) { holdAt = sb; holdT = 0; return; }
      holdT += dt || 0;
      const rad = C.cursorR * (1 + Math.min(C.holdMax, holdT * C.holdGrow));
      if (rad > C.cursorR) stamp(t, holdAt[0], holdAt[1], now, rad);
    }

    function draw() {
      if (K >= 0.003) { for (const p of photos) photoEntry(p); edgeEntry(); }   // 새 사진·크기 바뀐 사진은 다시 만듦 (그러면 drawn 이 비워져 다시 그림)
      const sig = [K.toFixed(3), vz, vox, voy, canvas.width, canvas.height, vis.join(',')].concat(photos.map((p) => p.key + ':' + p.rect.join(','))).join('|');
      if (sig === drawn) return;   // 움직임이 없으므로 바뀔 때만 다시 그림 (흔적 점이 나타나면 drawn 이 비워짐)
      drawn = sig;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (K >= 0.003) {
        ctx.globalAlpha = K;
        // 화면 가장자리 (화면 기준)
        const e = cache.get('__edge');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        if (trail) ctx.drawImage(trail.c, vis[0], vis[1] - C.lift, trail.e.w, trail.e.h + C.lift);   // 커서 흔적 (화면 기준, 가장자리·사진 아래)
        if (e) ctx.drawImage(e.img, vis[0], vis[1] - C.lift, e.w, e.h + C.lift);
        // 사진 (휠 확대)
        ctx.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);
        ctx.imageSmoothingEnabled = vz < 1.01;   // 확대하면 점이 네모 그대로 커짐
        for (const p of photos) {
          const pe = cache.get(p.key);
          if (pe) ctx.drawImage(pe.img, p.rect[0], p.rect[1] - C.lift, p.rect[2], p.rect[3] + C.lift);
        }
      }
      ctx.globalAlpha = 1;
    }

    return {
      canvas,
      resize() { resize(); drawn = ''; draw(); },
      setView(z, ox, oy) { vz = z; vox = ox; voy = oy; },
      // 커서 (확대 전 프레임 CSS px), x == null = 화면을 벗어남
      pointer(x, y) { ptr = x == null ? null : [x, y]; if (x == null) prevPtr = null; },
      // 왼쪽 버튼 누름/뗌 — 누른 채 머물면 그 자리에서 부식이 자람
      press(on) { pressed = !!on; if (!pressed) { holdAt = null; holdT = 0; } },
      /*
       * ps: [{ key, rect: 프레임 px [x, y, w, h], mask, photo: 원본 캔버스 }] — 누끼가 끝난 사진
       */
      syncPhotos(ps) {
        photos = ps.filter((p) => p.mask && p.photo);
        for (const k of cache.keys()) if (k !== '__edge' && !photos.some((p) => p.key === k)) cache.delete(k);
      },
      // dt: 흐른 시간(초), vitality · T · RH · O2 — 세기만 서서히 따라감 (커서가 지나간 자리엔 흔적이 남음)
      // lookRH · lookO2: 모양(밀도·네모 크기)에 쓸 실제 다이얼 값 — Lab mode 에서는 세기용 값과 따로 넘어옴
      update(dt, vitality, T, RH, O2, lookRH, lookO2) {
        strength = DT.corrodeStrength(vitality, T, RH, O2);
        setLook(lookRH != null ? lookRH : RH, lookO2 != null ? lookO2 : O2);
        const target = strength > 0 ? 1 : 0;
        if (dt > 0) K += Math.sign(target - K) * Math.min(Math.abs(target - K), dt / C.fadeIn);
        if (K >= 0.003) { for (const p of photos) photoEntry(p); edgeEntry(); if (trail) trailEntry(); }   // 화면 크기·격자가 바뀌면 흔적 판도 다시
        sweep(dt);
        draw();
      },
      // 사진을 지우는 정도 (0~1) — 부식 점이 나타난 만큼 원래 사진이 사라짐
      get visible() { return K; },
      get strength() { return strength; },
      get trailCells() { return trail ? trail.on.reduce((a, b) => a + b, 0) : 0; },   // 검증용: 흔적 칸 수
      get look() { return { spacing: sp, dot: dotPx, pending: lookPend && lookPend.key }; },   // 검증용: 지금 간격·네모 크기
      clear() { cache.clear(); photos = []; trail = null; K = 0; drawn = ''; draw(); },
    };
  };
})(window.DT = window.DT || {});
