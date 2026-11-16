/*
 * 사진 → 누끼 → 파란/흰 점 결빙 (WebGL2)
 *
 * 사진은 원래 비율·크기로(확대·잘림 없음, 화면보다 크면 맞춰 줄임) 가운데에 놓입니다.
 *
 * 처리 순서
 *  1) 피사체 분리: 사진을 놓는 즉시 브라우저 안에서 배경 제거 모델(IS-Net, @imgly/background-removal)을 돌려
 *     머리카락·어깨선·옷 윤곽을 따라가는 부드러운 알파 매트를 얻음 (처음 한 번 모델을 내려받음 — 인터넷 필요).
 *     모델이 끝나기 전·오프라인이면 색 기반 추정 마스크(DT.subjectMask)로 대신하고, 결과가 오면 교체.
 *  2) 배경 마스킹 → 3) 채도 감소 → 4) 점 재구성 → 5) 미세한 흐름 → 6) 커서 녹임
 *
 *  진행도 P (0~1) — −10 °C 이하에서 시간이 흐를수록 증가, 속도는 기온으로 연속 결정 (−10 °C ×1 → −20 °C ×4 → −30 °C ×6)
 *   채도 감소   : 사진·점 모두 서서히 색을 잃음
 *   점 재구성   : 피사체 사진이 옅어지는 동안 같은 자리에 작고 촘촘한 점이 하나씩 맺혀 이미지를 다시 그림
 *                 (무작위로 흩뜨린 격자 — 줄무늬 없음. 점의 밝기·밀도 = 원본 명암)
 *   냉각 색     : 점의 색이 사진 색 → 명암에 따른 짙은 파랑 · 하늘빛 · 흰빛
 *   배경        : 매트 밖 사진과 점이 서서히 옅어져 사라짐. 경계는 매트의 부드러운 알파를 따라 점 밀도가 줄어듦
 *  완성된 점은 공기 흐름처럼 아주 미세하게 흐름 (글리치·스캔라인·화면 흔들림 없음).
 *  커서: 주변 점만 국소적으로 풀려 흩어지고 처지며 밀도가 낮아짐. 추울수록 잘 안 녹고 빨리 다시 맺힘.
 *  −10 °C 위로 올리면 거꾸로 진행되어 원래 사진으로 돌아옴.
 *
 * 수치는 DT.ICE 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const mix = (a, b, t) => a + (b - a) * t;
  // 기온 → 성에가 자라는 속도 배율 (DT.ICE.speedCurve 점 사이 선형, 양 끝 밖은 끝값)
  const speedAt = (T) => {
    const C = DT.ICE.speedCurve;
    if (T >= C[0][0]) return C[0][1];
    for (let i = 1; i < C.length; i++) if (T >= C[i][0]) { const [t0, v0] = C[i - 1], [t1, v1] = C[i]; return mix(v0, v1, (T - t0) / (t1 - t0)); }
    return C[C.length - 1][1];
  };
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  DT.ICE = {
    frostPoint: 0,            // 이 기온 이하에서 점 결빙이 진행(°C) — Frost 모드 조건 (0° 이하)
    tempFollow: 3,            // 다이얼 → 적용 온도 추종 속도(1/초)
    duration: 18,             // 속도 배율 1 일 때 완전히 점 형상이 되기까지(초)
    speed: [1, 4, 6],         // (예전: 진행 속도 배율 [−10, −20, −30 °C] — speedCurve 로 바뀜)
    // 진행(자라는) 속도 배율 — 기온 [°C, 배율], 사이는 선형. −15 °C 에서 가장 빠르고 0 °C · 아주 추운 쪽으로 느려짐 (실제 수지상 성에처럼)
    speedCurve: [[0, 0.5], [-5, 1.5], [-15, 4], [-30, 2], [-50, 1]],
    thaw: 1.5,                // −10 °C 위에서 되돌아가는 속도(배율, 따뜻할수록 더 빠름)
    fit: 0.9,                 // 첫 사진이 화면보다 클 때 줄여 넣는 비율 (작은 사진은 확대하지 않음)
    collageFit: 0.55,         // 두 번째 사진부터 처음 크기의 상한 (보이는 화면 대비) — 겹쳐 놓기 쉽게
    spacing: 2.2,             // 점 간격(px, 1920 기준) — 격자를 무작위로 흩뜨려 줄무늬가 생기지 않음
    maxDots: 200000,          // 사진 한 장의 점 개수 상한 (넘으면 간격을 넓힘)
    dotSize: 2.1,             // 점 크기(px, 1920 기준) — 가우시안이라 보이는 크기는 약 1.3px
    wind: 1.5,                // 바람 흔들림 진폭(px)
    bloom: 0.55,              // 점 빛 번짐 세기
    melt: [4.2, 1.3],         // 커서로 녹는 속도(/초) [−10, −20 °C] — 추울수록 단단해 잘 안 녹음
    meltRadius: 0.1,          // 녹임 반경 (캔버스 높이 비율)
    edgeBand: 0.22,           // 화면 가장자리 성에 띠의 최대 폭 (보이는 화면 짧은 변 대비)
    edgeDuration: 16,         // −10 °C 에서 가장자리 성에가 다 자라기까지(초) — 기온이 낮을수록 빨라짐
    edgeSpacing: 2.3,         // 가장자리 성에 점 간격(px, 1920 기준)
    heal: [0.05, 0.16],       // 녹은 자리가 다시 맺히는 속도(/초) [−10, −20 °C] — 추울수록 빨리 응고
    segModel: 'isnet_fp16',   // 배경 제거 모델 (isnet_quint8 = 40MB 가벼움, isnet_fp16 = 80MB 기본, isnet = 최고 품질)
    segLib: 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm',
    segSize: 1024,            // 모델에 넣는 사진의 긴 변(px)
    // 마우스 휠로 확대하면 — 점 하나하나가 성에 결정으로 보이고 계속 자람
    zoomMax: 7,               // 최대 확대 배율
    zoomFollow: 2.2,          // 확대 배율·중심이 따라가는 속도(1/초)
    crystalFrom: [1.4, 2.8],  // 이 배율 구간에서 점 → 성에 결정으로 바뀜
    growIdle: 0.3,            // 확대하지 않을 때의 결정 성장 속도(확대 중 = 1) — 얼어 있는 동안 계속 자람
    // 아주 추울 때: 이 기온 구간에서 커서에 점점 덜 반응하다가 lockTo 아래에서는 커서가 움직여도 전혀 반응하지 않음
    //  (녹지도, 가루로 날아가지도 않음)
    denseFrom: -30,           // °C — 여기부터 커서 반응이 줄어듦
    lockTo: -45,              // °C — 이 기온 이하 = 커서 무반응 (완전히 고정)
    denseTo: -60,             // °C (다이얼 최저값) — 성에 입자 밀도의 기온 몫은 frostPoint(−10) 부터 여기까지 올라감
    // 성에 밀도 = 기온 몫 + 습도 몫 — 습도를 올리면 빽빽해지고(점 층·결정이 촘촘), 내리면 성기게 (추울 때)
    humDensity: [0, 100],     // 습도(%) 구간 — 아래 끝 = 가장 성김(결정이 적음), 위 끝 = 가장 빽빽 — Frost 는 습도 조건이 없으므로 0 ~ 100 % 전체
    humDensityK: 1,           // 밀도에서 습도가 차지하는 비중 — 1 = 결정 수는 습도로만 (기온은 크기 · 속도)
    // 습도(%)에 따른 커서 반응 (추울 때)
    dryUntil: [15, 45],       // 습도가 이 구간 아래로 갈수록 '건조' → 커서에 가루처럼 쉽게 날아감
    wetFrom: [45, 85],        // 습도가 이 구간 위로 갈수록 '습함' → 커서 자국이 물이 되어 화면 아래로 흘러내림
    blow: 7,                  // 아주 건조할 때 커서로 날아가는 속도(/초) — 기온과 무관 (−60 °C 에서도 날아감)
    windMax: 0.9,             // 공기(산소) 100 % 일 때 바람이 걷힌 자리를 커서 방향으로 미는 속도 (화면 / 초) — js/app.js 가 setAir 로 세기를 줌
    waterFlow: 0.14,          // 물줄기가 흘러내리는 평균 속도 (화면 높이 / 초, 줄마다 0.35~1.65배)
    edgeWetMelt: 45,          // 아주 습할 때 화면 가장자리 성에가 다 녹기까지(초) — 아래쪽·얼룩진 자리부터
    edgeRefreeze: 20,         // 습도를 내리면 녹았던 가장자리 성에가 다시 맺히기까지(초)
    waterMax: 0.28,           // 화면 아래에 차오르는 물의 최대 높이 (보이는 화면 높이 대비)
    waterFill: 60,            // 아주 습할 때 물이 최대 높이까지 차기까지(초)
    waterDrain: 40,           // 습도를 내리면 물이 다 빠지기까지(초)
    waterDistort: 1.0,        // 물속 왜곡 세기 (1 = 기본, 크게 일렁임)
  };

  /*
   * 정확한 누끼: 배경 제거 모델 (브라우저 안에서 실행 — 사진은 외부로 전송되지 않음)
   *  결과 PNG 의 알파 = 부드러운 매트 (머리카락 같은 반투명 경계 포함).
   *  다운로드·초기화·분석·분리가 끝나면 resolve, 실패하면 reject (호출한 쪽이 로딩 스피너를 그에 맞춰 켜고 끔)
   */
  let segLib = null, segWarm = null;
  const segConfig = () => ({ model: DT.ICE.segModel, output: { format: 'image/png', type: 'foreground' } });   // 미리 불러오기와 같은 설정이어야 초기화된 모델을 다시 씀
  /*
   * 미리 불러오기: 앱이 켜진 뒤 한가할 때 라이브러리·모델을 받고 작은 그림으로 한 번 돌려 둠
   *  → 첫 사진을 넣을 때 다운로드·초기화로 멈추지 않음 (실패해도 사진을 넣을 때 다시 시도)
   */
  DT.preloadSegment = function () {
    if (segWarm) return segWarm;
    segWarm = (async () => {
      if (!segLib) segLib = import(DT.ICE.segLib);
      const lib = await segLib;
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.fillRect(16, 16, 32, 32);
      const input = await new Promise((res) => c.toBlob(res, 'image/png'));
      await (lib.removeBackground || lib.default)(input, segConfig());
    })().catch((err) => { console.warn('[POLAR] background-removal preload failed:', err); segLib = null; segWarm = null; });
    return segWarm;
  };
  // 한 번에 하나씩만 (갤러리 누끼와 화면에 바로 넣은 사진의 누끼가 겹쳐 돌지 않게)
  let segChain = Promise.resolve();
  DT.segmentSubject = function (canvas) {
    const p = segChain.then(() => segmentOne(canvas));
    segChain = p.catch(() => {});
    return p;
  };
  async function segmentOne(canvas) {
    const I = DT.ICE;
    if (segWarm) await segWarm;   // 미리 불러오는 중이면 끝날 때까지 기다림 (모델을 두 번 받지 않음)
    if (!segLib) segLib = import(I.segLib);
    const lib = await segLib;
    const k = Math.min(1, I.segSize / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(canvas.width * k)); c.height = Math.max(1, Math.round(canvas.height * k));
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    const input = await new Promise((res) => c.toBlob(res, 'image/png'));
    const blob = await (lib.removeBackground || lib.default)(input, segConfig());
    const bmp = await createImageBitmap(blob);
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
    const g = o.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, o.width, o.height);
    const d = g.getImageData(0, 0, o.width, o.height).data, N = o.width * o.height, m = new Float32Array(N);
    let area = 0;
    for (let i = 0; i < N; i++) { m[i] = d[i * 4 + 3] / 255; area += m[i]; }
    return { w: o.width, h: o.height, m, coverage: area / N, model: true };
  }
  /*
   * 피사체 마스크 (CPU, 긴 변 160px)
   *  가장자리 띠의 색을 배경 모델(k-means 5색)로 보고, 그와 다른 정도 × 가운데 가중치로 점수를 만든 뒤
   *  Otsu 임계값 → 가장자리에서 이어진 배경을 채워 제거 → 작은 조각 제거 → 부드럽게 흐림.
   *  배경이 단순할수록 정확합니다(복잡한 배경은 대략적으로만 분리됨).
   */
  DT.subjectMask = function (img) {
    const iw = img.width, ih = img.height, k = 160 / Math.max(iw, ih);
    const w = Math.max(8, Math.round(iw * k)), h = Math.max(8, Math.round(ih * k)), N = w * h;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      L[i] = 0.299 * r + 0.587 * gg + 0.114 * b; A[i] = r - gg; B[i] = (r + gg) / 2 - b;
    }
    // 배경 모델: 위·왼쪽·오른쪽 가장자리 띠 (아래는 인물의 몸처럼 피사체가 걸쳐 있는 경우가 많아 제외)
    const bw = Math.max(2, Math.round(Math.min(w, h) * 0.05)), border = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < bw || y < bw || x >= w - bw) border.push(y * w + x);
    const K = 5, cen = [];
    for (let j = 0; j < K; j++) { const i = border[Math.floor((j + 0.5) * border.length / K)]; cen.push([L[i], A[i], B[i], 0]); }
    const dist2 = (i, q) => 0.6 * (L[i] - q[0]) ** 2 + (A[i] - q[1]) ** 2 + (B[i] - q[2]) ** 2;
    for (let it = 0; it < 8; it++) {
      const acc = cen.map(() => [0, 0, 0, 0]);
      for (const i of border) {
        let best = 0, bd = Infinity;
        for (let j = 0; j < K; j++) { const dd = dist2(i, cen[j]); if (dd < bd) { bd = dd; best = j; } }
        const a = acc[best]; a[0] += L[i]; a[1] += A[i]; a[2] += B[i]; a[3]++;
      }
      acc.forEach((a, j) => { if (a[3]) cen[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3], a[3] / border.length]; });
    }
    const bg = cen.filter((q) => q[3] > 0.05);
    // 점수 = 배경색과 다른 정도 × 가운데 가중치
    const score = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = Infinity; for (const q of bg) m = Math.min(m, dist2(i, q)); score[i] = Math.sqrt(m); }
    const sorted = Float32Array.from(score).sort(), p95 = sorted[Math.floor(N * 0.95)] || 1;
    for (let i = 0; i < N; i++) {
      const x = i % w, y = (i / w) | 0, cx = (x + 0.5) / w - 0.5, cy = (y + 0.5) / h - 0.55;
      const prior = Math.exp(-(cx * cx / (2 * 0.32 * 0.32) + cy * cy / (2 * 0.38 * 0.38)));
      score[i] = Math.min(1, score[i] / p95) * (0.3 + 0.7 * prior);
    }
    const blur = (src, r) => { // 상자 흐림 (가로 → 세로)
      const t = new Float32Array(N), o = new Float32Array(N);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k2 = -r; k2 <= r; k2++) { const xx = x + k2; if (xx >= 0 && xx < w) { s += src[y * w + xx]; n++; } } t[y * w + x] = s / n; }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k2 = -r; k2 <= r; k2++) { const yy = y + k2; if (yy >= 0 && yy < h) { s += t[yy * w + x]; n++; } } o[y * w + x] = s / n; }
      return o;
    };
    const sc = blur(blur(score, 2), 2);
    // Otsu
    const hist = new Float64Array(256); for (let i = 0; i < N; i++) hist[Math.min(255, (sc[i] * 255) | 0)]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let wB = 0, sB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue; const wF = N - wB; if (!wF) break;
      sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
      if (v > best) { best = v; thr = t; }
    }
    const T = thr / 255, fg = new Uint8Array(N);
    for (let i = 0; i < N; i++) fg[i] = sc[i] > T ? 1 : 0;
    // 가장자리와 이어진 배경만 배경 (피사체 안의 구멍은 채움)
    const isBg = new Uint8Array(N), q = new Int32Array(N); let qh = 0, qt = 0;
    const push = (i) => { if (!fg[i] && !isBg[i]) { isBg[i] = 1; q[qt++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (qh < qt) { const i = q[qh++], x = i % w; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < N - w) push(i + w); }
    // 피사체 조각: 가장 큰 것과 그 25% 이상인 것만
    const lab = new Int32Array(N).fill(-1), areas = [];
    for (let s = 0; s < N; s++) {
      if (isBg[s] || lab[s] >= 0) continue;
      const id = areas.length; let n = 0; qh = qt = 0; q[qt++] = s; lab[s] = id;
      while (qh < qt) {
        const i = q[qh++], x = i % w; n++;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
        for (const j of nb) if (j >= 0 && j < N && !isBg[j] && lab[j] < 0) { lab[j] = id; q[qt++] = j; }
      }
      areas.push(n);
    }
    const big = Math.max(0, ...areas);
    const m = new Float32Array(N);
    let area = 0;
    for (let i = 0; i < N; i++) if (lab[i] >= 0 && areas[lab[i]] >= big * 0.25) { m[i] = 1; area++; }
    let soft;
    const frac = area / N;
    if (frac < 0.03 || frac > 0.9) { // 분리 실패 → 점수 기반의 부드러운 마스크
      soft = new Float32Array(N); for (let i = 0; i < N; i++) soft[i] = sstep(T * 0.6, T * 1.4, sc[i]);
    } else soft = blur(blur(m, 1), 1);
    return { w, h, m: soft, coverage: frac };
  };

  const QUAD_VS = `#version 300 es
  layout(location=0) in vec2 aPos; out vec2 vUv;
  uniform vec4 uRect;   // 클립 좌표 사각형 x0,y0,x1,y1 (없으면 전체)
  void main(){ vUv = aPos; gl_Position = vec4(mix(uRect.xy, uRect.zw, aPos), 0.0, 1.0); }`;

  const NOISE = `
  uniform sampler2D uNoise;
  float n1(vec2 p){ return texture(uNoise, p / 256.0).r; }
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n1(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }`;

  // 녹임 지도 갱신 (저해상도): r = 녹은 정도
/*
   * 녹임 지도 — r = 녹음/흩날림 정도, g = 물(습할 때 커서 자국이 물이 되어 아래로 흘러내림)
   *  uWet 0~1: 습도가 높을수록 커서 자국에 물이 남음. 물은 세로줄마다 다른 속도로 한 칸씩 아래로 내려가고
   *  지나간 자리에는 옅어지는 물줄기를 남김. 물이 있는 곳은 성에도 풀려 있음(r ≥ 물)
   */
  const MELT_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;` + NOISE + `
  uniform sampler2D uState; uniform float uDt, uAsp, uRate, uHeal, uRad, uTime, uCursor, uWet, uFlow; uniform vec4 uSeg; uniform vec2 uWind;
  void main(){
    vec4 s = texture(uState, vUv);
    float m = s.r, w = s.g;
    vec2 ts = 1.0 / vec2(textureSize(uState, 0));
    // 바람 (공기가 많을수록, 커서가 움직이는 방향으로): 걷힌 자리를 바람 따라 밀어 성에가 흩날리듯 줄무늬로 쓸려 감
    if (dot(uWind, uWind) > 1e-8) {
      float g = 0.55 + 0.9 * fbm(vUv * vec2(uAsp, 1.0) * 16.0 + uTime * 0.7);   // 돌풍처럼 자리마다 세기가 다름
      float up = texture(uState, vUv - uWind * uDt * g).r;
      m = max(m, up * (0.97 + 0.025 * fbm(vUv * 40.0 - uTime)));
    }
    if (uCursor > 0.5) {
      vec2 p = vec2(vUv.x * uAsp, vUv.y), a = uSeg.xy, b = uSeg.zw, pa = p - a, ba = b - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0), dist = length(pa - ba * h);
      float r = uRad * (0.45 + 0.6 * fbm(p * 8.0 + uTime * 0.2) + 0.45 * fbm(p * 34.0 - uTime * 0.3));   // 경계가 들쭉날쭉
      // 녹는 양도 자리마다 불규칙하게 (깔끔한 원이 아니라 얼룩지며 풀림)
      float hit = exp(-(dist * dist) / (r * r) * 2.2);
      m += uRate * uDt * hit * (0.35 + 1.1 * fbm(p * 22.0 + 3.0));
      // 습하면 커서 자국에 물이 맺힘 (자리마다 양이 달라 굵은 물방울 줄기가 생김)
      w += uWet * uDt * 3.5 * hit * (0.3 + 1.2 * fbm(p * 30.0 + 11.0));
    }
    m = min(m, 0.5 + 0.75 * fbm(vec2(vUv.x * uAsp, vUv.y) * 14.0 + 5.0));   // 오래 머물러도 자리마다 녹는 한계가 달라 얼룩진 채로 풀림
    m -= uHeal * uDt;
    // 물 흘러내림: 세로줄(약 3칸 폭)마다 속도가 다름. 이번 프레임에 내려갈 줄이면 바로 위 칸의 물을 받음
    if (uFlow > 0.0) {
      float col = floor(vUv.x / ts.x / 3.0);
      float speed = uFlow * (0.35 + 1.3 * fract(sin(col * 12.9898) * 43758.5453));   // 화면 높이 / 초
      float step = speed * uDt / ts.y;                                                 // 이번 프레임에 내려갈 칸 수(확률)
      float roll = fract(sin(col * 78.233 + uTime * 37.719) * 43758.5453);
      float above = texture(uState, vUv + vec2(0.0, ts.y)).g;
      float bigStep = texture(uState, vUv + vec2(0.0, ts.y * 2.0)).g;
      if (roll < step) w = max(w * 0.9, above * 0.995);
      if (roll < step - 1.0) w = max(w, bigStep * 0.99);
    }
    w = max(0.0, w - uDt * (0.06 + 0.25 * (1.0 - uWet)));   // 물줄기는 천천히 마르거나 다시 얼음
    w = min(w, 1.0);
    m = max(m, w * 0.95);                                     // 물이 있는 곳은 성에가 풀려 있음
    o = vec4(clamp(m, 0.0, 1.0), w, 0.0, 1.0);
  }`;

  /*
   * 사진마다 진행도 uP(0~1.25) 하나만 넘기고, 단계별 값은 셰이더에서 '사진 가장자리 → 중앙' 지연을 두어 계산
   *  e = 사진 안에서 가장자리까지 거리 (0 가장자리 … 1 중앙), Pe = uP − 0.22·e
   *  → 채도 감소·점 맺힘·파란색 번짐이 사진마다 가장자리에서 중앙으로 퍼짐
   */
  const STAGES = `
  float edgeOf(vec2 uv){ return clamp(min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) * 2.0, 0.0, 1.0); }
  // 얼음 전선: 사각형으로 좁혀 들지 않도록 사각 거리 + 타원 거리를 섞고(둥근 모서리), 큰 노이즈 얼룩 + 잔 노이즈로 들쭉날쭉하게
  float frontOf(vec2 uv){
    float r = clamp(1.0 - length((uv - 0.5) * 2.0) / 1.4142, 0.0, 1.0);
    float e = mix(edgeOf(uv), r, 0.55);
    e += (fbm(uv * 4.0 + 11.0) - 0.5) * 0.7 + (fbm(uv * 22.0 + 3.0) - 0.5) * 0.18;
    return clamp(e, 0.0, 1.0);
  }
  float satOf(float Pe){ return 1.0 - 0.92 * smoothstep(0.0, 0.5, Pe); }`;

  /*
   * 확대 + 성에 결정 (점 셰이더 공용)
   *  uZoom 배율로 uZC(캔버스 px)를 중심으로 확대. uCry(0~1) 만큼 점이 육각 수지상 결정으로 바뀜.
   *  결정마다 맺히는 시각(r2² × 45초)과 자라는 속도가 달라, 성장 시계 uGrow 가 흐르는 동안
   *  새 결정이 계속 맺히고 가지가 길어지며 곁가지가 뻗어 나감 (성장은 점점 느려지지만 멈추지 않음).
   *  vX = (결정 비율, 팔 길이, 회전, 선 반폭)  — 모두 사각형 반폭 단위, vY = (가우시안 축소 배율, 곁가지 길이 0~1)
   */
  const ZOOM = `
  uniform float uZoom, uCry, uGrow, uSp, uDense, uLayer; uniform vec2 uZC;
  uniform vec3 uTint; uniform float uTintK;   // 대시보드 색: 파란 성에를 고른 색으로 (uTintK 0 = 원래 파랑)
  uniform float uWet, uDry;                   // 습도: 습할수록 커서 자국이 물이 되어 흘러내리고, 건조할수록 가루처럼 날아감
  /*
   * 커서에 풀린 점의 움직임 (m = 녹음, w = 물, 녹임 지도 기울기 바깥쪽 방향)
   *  건조: 바깥·위쪽으로 멀리 흩날리며 빨리 사라짐 (가루 성에)
   *  습함: 덜 흩어지고 아래로 처지며, 물줄기를 따라 화면 아래로 끌려 내려감
   */
  vec2 meltOffset(float m, float w, vec2 outward, float ang, float r1, float r2, float s){
    float scatter = mix(1.0, 2.6, uDry) * mix(1.0, 0.45, uWet);
    vec2 dir = outward * 0.55 + vec2(cos(ang), sin(ang)) * 0.8 + vec2(0.0, mix(0.5, -0.9, uDry));
    vec2 off = dir * m * (12.0 + 80.0 * r2) * s * scatter;
    off.y += m * m * (25.0 + 70.0 * r1) * s * mix(1.0, 0.0, uDry) * mix(1.0, 1.6, uWet);   // 녹아 흘러내림 (건조하면 없음)
    off.y += w * (14.0 + 46.0 * r1) * s;                                                   // 물줄기에 끌려 내려감
    off.x += w * (r2 - 0.5) * 6.0 * s;
    return off;
  }
  // 풀린 점이 사라지는 정도: 건조하면 조금만 풀려도 날아가 사라지고, 물줄기 위의 점은 녹아 없어짐
  float meltKill(float m, float w, float r1, float r2){
    float k = smoothstep(0.2 + 0.75 * r2 - 0.18 * uDry, 1.15 - 0.45 * uDry, m) * (r1 < 0.3 ? mix(0.6, 1.0, uDry) : 1.0);
    return max(k, smoothstep(0.15, 0.7, w) * (0.55 + 0.4 * r1));
  }
  vec3 waterCol(vec3 col, float m, float w){
    col = mix(col, vec3(0.85, 0.93, 1.0), m * 0.45 * (1.0 - uDry));   // 녹는 점은 물빛처럼 밝아짐 (건조하면 그대로 날아감)
    return mix(col, vec3(0.75, 0.88, 1.0), clamp(w * 1.4, 0.0, 0.8));
  }
  out vec4 vX; out vec4 vY;
  // 성에 색 → 고른 색의 명암 (어두운 곳은 짙은 색, 중간은 고른 색, 밝은 곳은 흰빛)
  vec3 tintIce(vec3 c){
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 t = mix(uTint * 0.28, uTint, smoothstep(0.04, 0.42, l));
    t = mix(t, mix(uTint, vec3(1.0), 0.82), smoothstep(0.55, 0.95, l));
    return mix(c, t, uTintK);
  }
  // 아주 추울 때(uDense → 1, −60 °C) 덧그리는 점 층: 층마다 난수를 바꾸고 반 격자쯤 어긋나게 → 점 밀도 최대 3배
  float layerAlpha(){ return uLayer < 0.5 ? 1.0 : clamp(uDense * 2.0 - (uLayer - 1.0), 0.0, 1.0); }
  vec2 layerJitter(inout float r1, inout float r2){
    if (uLayer < 0.5) return vec2(0.0);
    r1 = fract(r1 * 17.31 + uLayer * 0.37); r2 = fract(r2 * 11.73 + uLayer * 0.61);
    return (vec2(fract(r1 * 5.13), fract(r2 * 7.77)) - 0.5) * uSp;
  }
  vec2 zoomPos(vec2 p){ return uZC + (p - uZC) * uZoom; }
  float crystalQuad(float g, float k, float r1, float r2){
    float sp = uSp * uZoom;
    float age = max(0.0, uGrow - r2 * r2 * mix(45.0, 15.0, uDense));   // 아주 추우면 결정이 더 빨리·한꺼번에 맺힘
    float tau = 6.0 + 16.0 * r1;
    k *= fract(r1 * 7.31 + r2 * 3.17) > 0.5 - 0.35 * uDense ? 1.0 + 0.3 * uDense : 0.3;   // 절반만 큰 수지상 결정으로(아주 추우면 대부분), 나머지는 작은 알갱이로 남음
    float L = sp * k * (1.0 - exp(-age / tau)) * (1.0 + 0.35 * log(1.0 + age / 30.0));
    L = min(L, sp * 3.0);
    float dim = pow(min(1.0, 0.8 * sp / max(L, 1e-3)), 1.3);   // 결정이 커져 서로 겹칠수록 선을 옅게 → 하얗게 뭉개지지 않고 레이스처럼 촘촘해짐
    dim *= mix(1.0, 0.22, uDense);                               // 아주 추울 때 결정 수가 몇 배로 늘어나는 만큼 선을 옅게 (빽빽하되 하얗게 타지 않게)
    L *= uCry;
    float quad = max(g, 2.0 * L + 6.0 * uCry);
    float wpx = 0.5 + 0.1 * uZoom;
    vX = vec4(uCry, L * 2.0 / quad, r1 * 6.2831 + r2 * 2.0, wpx * 2.0 / quad);
    vY = vec4(quad / g * mix(1.0, 2.4, uCry), 0.35 + 0.65 * clamp(age / 40.0, 0.0, 1.0), dim, uDense);
    return quad;
  }`;

  // 원본 사진 (채도·불투명도). 배경(매트 밖)은 피사체보다 먼저 조금씩 어두워짐
  const PHOTO_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;` + NOISE + STAGES + `
  uniform sampler2D uPhoto, uMask; uniform float uP, uCut, uFade;   // uFade 1 = 사진이 다 사라짐 (미생물로 바뀜)   // uCut 1 = 배경을 완전히 지움 (Vitality 생장 모드: 누끼 딴 피사체만)
  void main(){
    float Pe = uP - 0.4 * frontOf(vUv);
    vec3 c = texture(uPhoto, vUv).rgb;
    c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, satOf(Pe));
    float m = texture(uMask, vUv).r;
    float a = (1.0 - smoothstep(0.18, 0.62, Pe)) * mix(1.0 - 0.6 * smoothstep(0.12, 0.5, uP), 1.0, m) * mix(1.0 - uCut, 1.0, m) * (1.0 - uFade);
    o = vec4(c * a, a);
  }`;

  // 점 (인스턴스 사각형) — 위치는 사진 안 좌표(0~1)로 저장, uRect 로 콜라주 위치·크기에 배치
  const DOT_VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 aCorner;
  layout(location=1) in vec2 aHome;   // 사진 안 좌표 (0~1, y 아래)
  layout(location=2) in vec4 aData;   // 밝기, 피사체 매트(0~1), 난수1, 난수2
  layout(location=3) in vec4 aCol;    // 사진 색 rgb, 가장자리→중앙 거리(0~1)
  out vec4 vC; out vec2 vQ;` + NOISE + STAGES + ZOOM + `
  uniform sampler2D uMelt;
  uniform vec4 uRect;                 // 캔버스 px: x, y, w, h
  uniform vec2 uRes; uniform float uT, uS, uP, uSize, uWind;
  void main(){
    float lum = aData.x, mask = aData.y, r1 = aData.z, r2 = aData.w, s = uS, t = uT;
    vec2 jit = layerJitter(r1, r2);
    float Pe = uP - 0.4 * frontOf(vec2(aHome.x, 1.0 - aHome.y));   // 사진 텍스처와 같은 방향(y 위)으로 → 사진과 점의 전선이 일치
    float uDot = smoothstep(0.06, 0.48, Pe), uColor = smoothstep(0.25, 0.75, Pe), uBg = smoothstep(0.45, 1.0, uP);
    vec2 p = uRect.xy + aHome * uRect.zw + jit;
    float appear = smoothstep(r1 * 0.75, r1 * 0.75 + 0.25, uDot);              // 점이 하나씩 맺힘 (가장자리부터)
    // 배경: 최종적으로 점이 남을 확률 = 매트 알파 (반투명한 경계는 성기게 남음 → 스티커처럼 딱 잘리지 않음)
    float e = r2 - mask;
    float kill = smoothstep(1.0 - e - 0.08, 1.0 - e + 0.02, uBg);
    // 바람: 느린 흐름 노이즈로 아주 미세하게 흐름 (전체 실루엣 유지)
    vec2 q = p / s;
    vec2 w = vec2(n1(q * 0.011 + vec2(t * 0.32, t * 0.07)), n1(q * 0.011 + vec2(41.0 - t * 0.1, t * 0.27))) - 0.5;
    vec2 off = w * uWind * 2.0 * s * appear;
    off += vec2(sin(t * (1.1 + r1) + r2 * 6.2831), cos(t * (0.9 + r2) + r1 * 6.2831)) * 0.3 * s * uColor;
    off += vec2(-0.8 + w.x * 2.5, -0.35 + w.y * 2.5) * kill * (8.0 + 36.0 * r1) * s;   // 사라지는 배경 점은 바람에 흩어짐
    // 녹음: 커서 바깥쪽으로 밀려나며 흩어지고, 많이 녹은 점부터 옅어짐
    vec2 muv = vec2(p.x / uRes.x, 1.0 - p.y / uRes.y), md = vec2(6.0) / uRes;
    vec2 mw = texture(uMelt, muv).rg;
    float m = mw.x, wv = mw.y;
    vec2 mg = vec2(texture(uMelt, muv + vec2(md.x, 0.0)).r - texture(uMelt, muv - vec2(md.x, 0.0)).r,
                   -(texture(uMelt, muv + vec2(0.0, md.y)).r - texture(uMelt, muv - vec2(0.0, md.y)).r));
    vec2 outward = length(mg) > 1e-4 ? -normalize(mg) : vec2(cos(r1 * 6.2831), sin(r1 * 6.2831));
    float ang = r1 * 6.2831 + n1(q * 0.05) * 3.0;
    off += meltOffset(m, wv, outward, ang, r1, r2, s);                          // 건조 = 흩날림, 습함 = 물로 흘러내림
    float mk = meltKill(m, wv, r1, r2);                                         // 많이 녹은 점부터 사라지고, 일부는 풀린 채 떨어지며 남음
    // 색: 사진 색(채도 감소) → 명암에 따른 짙은 파랑 · 하늘빛 · 흰빛
    vec3 pc = mix(vec3(dot(aCol.rgb, vec3(0.2126, 0.7152, 0.0722))), aCol.rgb, satOf(Pe));
    vec3 cold = mix(vec3(0.03, 0.12, 0.55), vec3(0.22, 0.52, 1.0), smoothstep(0.06, 0.45, lum));
    cold = mix(cold, vec3(0.86, 0.94, 1.0), smoothstep(0.55, 0.92, lum));
    vec3 col = mix(pc, cold, uColor);
    col = mix(col, waterCol(col, m, wv), uColor);                               // 녹는 점·물줄기는 물빛처럼 밝아짐
    col = mix(col, tintIce(col), uColor);                                       // 대시보드에서 고른 색
    float vis = mix(1.0, smoothstep(r1 * 0.5, r1 * 0.5 + 0.25, lum * 1.1 + 0.04 + 0.3 * uDense), uColor);   // 아주 추우면 어두운 곳까지 성에가 덮음
    float a = appear * vis * (1.0 - kill) * (1.0 - mk) * layerAlpha();
    float quad = crystalQuad(uSize * s * (0.75 + 0.55 * lum) * uZoom, 0.45 + 1.15 * lum, r1, r2);   // 밝은 곳일수록 큰 결정
    vec2 pos = zoomPos(p + off) + (aCorner - 0.5) * quad;
    gl_Position = a < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
    vC = vec4(col * a, a); vQ = aCorner;
  }`;

  /*
   * 화면 가장자리 성에 — 보이는 화면의 네 변에서 안쪽으로 파란·흰 점이 쌓이며 얼어 들어감
   *  aEdge = (x, y 캔버스 px, d = 가장자리→안쪽 거리 0~1(띠 폭 대비), r1), aE2 = (r2, 크기)
   *  uF = 화면 성에 진행도. 노이즈로 들쭉날쭉한 전선을 만들고, 오래 쌓인 곳(가장자리)일수록 희고 촘촘함.
   *  커서 녹임 지도도 함께 받아 녹으면 흩어지며 흘러내림
   */
  const EDGE_VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 aCorner;
  layout(location=1) in vec4 aEdge;
  layout(location=2) in vec2 aE2;
  out vec4 vC; out vec2 vQ;` + NOISE + ZOOM + `
  uniform sampler2D uMelt;
  uniform vec2 uRes; uniform float uT, uS, uF, uSize, uEMelt;
  void main(){
    vec2 p = aEdge.xy; float d = aEdge.z, r1 = aEdge.w, r2 = aE2.x, s = uS, t = uT;
    p += layerJitter(r1, r2);
    vec2 q = p / s;
    float n = fbm(q * 0.004 + 3.1) * 0.6 + fbm(q * 0.016 + 9.0) * 0.28 + fbm(q * 0.06 + 1.7) * 0.12;
    float thr = d * mix(0.92, 0.6, uDense) + (n - 0.5) * (0.5 + 0.5 * d);           // 들쭉날쭉한 성에 전선 — 안쪽으로 갈수록 더 크게 굽이쳐 직사각형 경계가 안 보임
    float local = uF - thr - r1 * 0.18;
    float appear = smoothstep(0.0, 0.1, local);
    float thick = smoothstep(0.0, 0.5, local);                     // 오래 쌓인 곳일수록 희고 밝게
    vec2 w = vec2(n1(q * 0.011 + vec2(t * 0.3, t * 0.06)), n1(q * 0.011 + vec2(41.0 - t * 0.1, t * 0.25))) - 0.5;
    vec2 off = w * 1.6 * s;
    // 커서 녹임 (사진의 점과 같은 방식, 같은 세기)
    vec2 muv = vec2(p.x / uRes.x, 1.0 - p.y / uRes.y), md = vec2(6.0) / uRes;
    vec2 mw = texture(uMelt, muv).rg;
    float m = mw.x, wv = mw.y;
    vec2 mg = vec2(texture(uMelt, muv + vec2(md.x, 0.0)).r - texture(uMelt, muv - vec2(md.x, 0.0)).r,
                   -(texture(uMelt, muv + vec2(0.0, md.y)).r - texture(uMelt, muv - vec2(0.0, md.y)).r));
    vec2 outward = length(mg) > 1e-4 ? -normalize(mg) : vec2(cos(r1 * 6.2831), sin(r1 * 6.2831));
    float ang = r1 * 6.2831 + n1(q * 0.05) * 3.0;
    off += meltOffset(m, wv, outward, ang, r1, r2, s);              // 건조 = 흩날림, 습함 = 물로 흘러내림
    float mk = meltKill(m, wv, r1, r2);
    // 습도로 녹음 (uEMelt 0~1): 아래쪽·얼룩진 자리부터 풀려 물방울처럼 흘러내리며 사라짐
    float th = 0.6 * fbm(q * 0.006 + 40.0) + 0.4 * (1.0 - p.y / uRes.y) + 0.08 * r1;
    float em = smoothstep(th, th + 0.18, uEMelt * 1.3);
    off.y += em * em * (30.0 + 110.0 * r1) * s;
    off.x += em * (r2 - 0.5) * 8.0 * s;
    mk = max(mk, smoothstep(0.35, 1.0, em));
    wv = max(wv, em * 0.6);
    // 결정 무리: 가장자리는 빽빽하게 덮이고, 안쪽으로 갈수록 얼룩진 성에 무리로 갈라짐 (고르게 흩뿌린 노이즈처럼 보이지 않게)
    float clump = smoothstep(0.38 - 0.3 * uDense, 0.7 - 0.2 * uDense, fbm(q * 0.028 + 17.0) * 0.75 + fbm(q * 0.09 + 5.0) * 0.25 + (1.0 - d) * 0.35);
    // 색: 기본은 파란빛, 두껍게 쌓인 가장자리 무리만 흰빛
    vec3 blue = mix(vec3(0.08, 0.26, 0.85), vec3(0.32, 0.62, 1.0), r2);
    vec3 col = mix(blue, vec3(0.86, 0.94, 1.0), clamp(thick * thick * r2 * r2 * 0.9 + pow(max(0.0, 1.0 - d), 3.0) * 0.45 * clump, 0.0, 1.0));
    col = waterCol(col, m, wv);
    col = tintIce(col);
    float tw =0.95 + 0.05 * sin(t * (0.6 + r1) + r2 * 6.2831);
    float a = appear * clump * (0.4 + 0.6 * r2) * tw * (1.0 - mk) * (0.55 + 0.45 * thick) * layerAlpha();
    float quad = crystalQuad(uSize * s * aE2.y * uZoom, 0.5 + 0.7 * r2 + 0.4 * thick, r1, r2);
    vec2 pos = zoomPos(p + off) + (aCorner - 0.5) * quad;
    gl_Position = a < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
    vC = vec4(col * a, a); vQ = aCorner;
  }`;

  const DOT_FS = `#version 300 es
  precision highp float;
  in vec4 vC; in vec2 vQ; in vec4 vX; in vec4 vY; out vec4 o;
  float hsh(float n){ return fract(sin(n) * 43758.5453); }
  /*
   * 육각 수지상 성에 결정 (사각형 반폭 단위): 6개 팔(길이가 조금씩 다름) + 60° 곁가지(가운데·끝은 짧음) + 가운데 작은 판
   *  L 팔 길이, rot 회전, w 선 반폭, br 곁가지 길이 비율(자랄수록 길어짐)
   */
  float crystal(vec2 d, float L, float rot, float w, float br){
    float r = length(d);
    if (r > L + 3.0 * w) return 0.0;
    const float SEC = 1.0471976;
    float a = atan(d.y, d.x) + rot;
    float idx = floor(a / SEC + 0.5);
    float la = a - idx * SEC;                                  // 가장 가까운 팔 기준 −30° ~ 30°
    idx = mod(idx, 6.0);
    float Li = L * (0.55 + 0.45 * hsh(idx * 7.13 + rot * 3.7));
    vec2 p = vec2(cos(la), abs(sin(la))) * r;                  // 팔 = +x 축, 대칭으로 접음
    float w2 = w * w;
    float tx = clamp(p.x, 0.0, Li), da = length(p - vec2(tx, 0.0));
    float v = exp(-da * da / w2) * (1.0 - 0.45 * tx / max(Li, 1e-4));
    float pd = max(Li * mix(0.24, 0.15, vY.w), w * 3.5);   // 아주 추우면 곁가지가 촘촘
    float xb0 = floor((p.x - p.y * 0.57735) / pd) * pd;
    const vec2 U = vec2(0.5, 0.8660254);
    for (int k = 0; k < 2; k++) {
      float xb = xb0 + float(k) * pd;
      if (xb < pd * 0.6 || xb > Li * 0.92) continue;
      float lb = min((Li - xb) * 0.5, xb * 0.95) * br * (0.6 + 0.4 * hsh(xb * 13.1 + idx + rot));
      vec2 q = p - vec2(xb, 0.0);
      float t = clamp(dot(q, U), 0.0, lb), db = length(q - U * t);
      v = max(v, 0.75 * exp(-db * db / (w2 * 0.8)));
    }
    return max(v, 0.5 * (1.0 - smoothstep(Li * 0.1, Li * 0.1 + w, r)));
  }
  void main(){
    vec2 d = (vQ - 0.5) * 2.0, dg = d * vY.x;
    float g = exp(-dot(dg, dg) * 2.2);   // 부드러운 점 (부분 픽셀 이동에도 밝기 일정 → 무아레 없음)
    if (vX.x < 0.01) { o = vC * g; return; }
    o = vC * mix(g, max(crystal(d, vX.y, vX.z, vX.w, vY.y), g * mix(0.8, 0.25, vY.w)) * vY.z * mix(1.0, 1.15, vY.w), vX.x);   // 확대하면 결정으로 (아주 추우면 흐린 중심은 줄이고 선은 또렷하게)
  }`;

  const BLUR_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform vec2 uDir;
  void main(){
    vec4 s = texture(uSrc, vUv) * 0.227;
    s += (texture(uSrc, vUv + uDir * 1.38) + texture(uSrc, vUv - uDir * 1.38)) * 0.316;
    s += (texture(uSrc, vUv + uDir * 3.23) + texture(uSrc, vUv - uDir * 3.23)) * 0.07;
    o = s;
  }`;
  const COMP_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o; uniform sampler2D uDots, uBloom; uniform float uBloomK;
  void main(){
    vec3 c = texture(uDots, vUv).rgb + texture(uBloom, vUv).rgb * uBloomK;
    o = vec4(c, max(c.r, max(c.g, c.b)));
  }`;

  /*
   * 화면 아래에 차오르는 물 (습할 때) — 보이는 화면 맨 아래에서 uLevel(보이는 높이 대비)만큼
   *  uScene = 물을 그리기 직전의 화면(사진·성에 점 전부) → 물속은 이 화면을 크게 일렁이며 굴절시켜 다시 그림
   *  수면에 선(아웃라인)은 없음 — 왜곡과 물빛이 수면 근처에서 부드럽게 시작될 뿐
   *  uView = 보이는 화면의 위·아래 (캔버스 uv, 위가 0)
   */
  const WATER_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;` + NOISE + `
  uniform sampler2D uScene; uniform float uLevel, uT, uAsp, uDistort; uniform vec2 uView;
  void main(){
    float sy = 1.0 - vUv.y, x = vUv.x * uAsp;
    float vh = uView.y - uView.x;
    float surf = uView.y - uLevel * vh;
    surf += vh * (0.008 * sin(x * 7.0 + uT * 1.1) + 0.005 * sin(x * 19.0 - uT * 1.7) + 0.01 * (fbm(vec2(x * 3.0 + uT * 0.15, uT * 0.1)) - 0.5));
    float d = (sy - surf) / max(vh, 1e-4);                  // 수면 아래 깊이 (보이는 높이 대비)
    if (d < 0.0) { o = vec4(0.0); return; }
    float under = smoothstep(0.0, 0.035, d);                // 수면에서 부드럽게 시작 (선 없음)
    // 굴절: 큰 일렁임 + 잔물결 + 깊을수록 더 크게. 세로로 길게 늘어지는 결
    vec2 q = vec2(x, sy);
    vec2 big = vec2(fbm(q * vec2(2.2, 4.0) + vec2(uT * 0.22, -uT * 0.18)), fbm(q * vec2(2.0, 3.6) + vec2(7.0 - uT * 0.2, uT * 0.25))) - 0.5;
    vec2 mid = vec2(fbm(q * vec2(7.0, 12.0) + vec2(-uT * 0.5, uT * 0.4)), fbm(q * vec2(6.0, 11.0) + vec2(3.0 + uT * 0.45, -uT * 0.5))) - 0.5;
    vec2 ripple = vec2(sin(sy * 160.0 - uT * 3.0 + big.x * 9.0), cos(x * 120.0 + uT * 2.4 + big.y * 9.0)) * 0.0025;
    float k = under * uDistort * (0.6 + 1.2 * smoothstep(0.0, 0.25, d));
    vec2 off = (big * vec2(0.09, 0.05) + mid * vec2(0.03, 0.025)) * k + ripple * under;
    // 색 번짐: 채널마다 조금씩 다르게 굴절
    vec2 uv = vUv + vec2(off.x, -off.y);
    vec4 sc = vec4(texture(uScene, uv + off * 0.06).r, texture(uScene, uv).g, texture(uScene, uv - off * 0.06).b, texture(uScene, uv).a);
    // 물빛: 아래로 갈수록 짙고 탁해짐
    float tintA = mix(0.12, 0.5, smoothstep(0.0, 0.3, d));
    vec3 body = mix(vec3(0.42, 0.58, 0.72), vec3(0.06, 0.11, 0.2), smoothstep(0.0, 0.3, d));
    float c1 = fbm(vec2(x * 7.0 + uT * 0.3, sy * 20.0 - uT * 0.5)), c2 = fbm(vec2(x * 11.0 - uT * 0.25, sy * 26.0 + uT * 0.4));
    float caus = pow(max(0.0, 1.0 - abs(c1 - c2) * 2.2), 3.0) * smoothstep(0.02, 0.08, d) * (1.0 - smoothstep(0.05, 0.25, d));
    vec3 col = sc.rgb * (1.0 - tintA) + body * tintA + vec3(0.85, 0.93, 1.0) * caus * 0.05;
    o = vec4(col * under, under);                           // 물속은 일렁인 화면으로 바꿔 그림 (수면 근처는 원래 화면과 섞임, 아래 레이어는 검은 바탕)
  }`;
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Dot shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Dot program: ' + gl.getProgramInfoLog(p));
    const cache = {};
    return { p, loc: new Proxy(cache, { get: (o, k) => (k in o ? o[k] : (o[k] = gl.getUniformLocation(p, k))) }) };
  }

  /*
   * 콜라주: 여러 장의 사진을 각각 독립된 항목으로 관리
   *  항목 = { id, 원본 캔버스, 사진·매트 텍스처, 점 버퍼(사진 안 좌표), 위치·크기(캔버스 px), 진행도 tau, 누끼 상태 }
   *  - 배열 순서 = 겹치는 순서 (뒤가 위)
   *  - 이동·크기 조절은 uRect 만 바꿔 즉시 반영, 크기 조절이 끝나면 점을 그 크기에 맞게 다시 샘플링(밀도 유지)
   *  - 누끼는 사진마다 순서대로 한 장씩 (모델·메모리 부담을 줄이려고). 처리 중인 동안 onBusy(true)
   *  - 기온 효과(채도 → 점 → 파란색 → 배경 제거, 커서 녹임)는 사진마다 따로 진행. 새로 넣은 사진은 처음부터 얼기 시작
   */
  DT.createPhotoIce = function (canvas, W, H) {
    const I = DT.ICE;
    canvas.width = W; canvas.height = H;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    const floatOK = !!gl.getExtension('EXT_color_buffer_float');
    const S = W / 1920;

    const pQuad = program(gl, QUAD_VS, PHOTO_FS), pMelt = program(gl, QUAD_VS, MELT_FS);
    const pBlur = program(gl, QUAD_VS, BLUR_FS), pComp = program(gl, QUAD_VS, COMP_FS), pDot = program(gl, DOT_VS, DOT_FS), pEdge = program(gl, EDGE_VS, DOT_FS), pWater = program(gl, QUAD_VS, WATER_FS);

    // 사각형 (0~1) — 화면 전체 패스·사진·점의 모서리에 공용
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    // 화면 가장자리 성에 점 버퍼
    const edgeBuf = gl.createBuffer(), edgeVao = gl.createVertexArray();
    let nEdge = 0, edgeKey = '';
    gl.bindVertexArray(edgeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 16); gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    const STRIDE = 10 * 4;
    function makeDotVao(buf) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE, 8); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, STRIDE, 24); gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null);
      return vao;
    }

    const tex = (w, h, internal, format, type, filter, data) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data || null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const fbo = (t) => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return ok ? f : null;
    };
    // 노이즈 (반복)
    const noise = (() => {
      const R = DT.mulberry32(0x1CEF105), d = new Uint8Array(256 * 256 * 4);
      for (let i = 0; i < d.length; i++) d[i] = (R() * 256) | 0;
      const t = tex(256, 256, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, d);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return t;
    })();
    // 녹임 지도 핑퐁 (1/4 해상도, 화면 기준 — 모든 사진이 함께 씀)
    const MW = Math.ceil(W / 4), MH = Math.ceil(H / 4);
    const melt = [0, 1].map(() => {
      let t = floatOK ? tex(MW, MH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR) : null;
      let f = t && fbo(t);
      if (!f) { t = tex(MW, MH, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR); f = fbo(t); }
      return { t, f };
    });
    let mcur = 0;
    for (const m of melt) { gl.bindFramebuffer(gl.FRAMEBUFFER, m.f); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // 점 레이어 + 빛 번짐
    const dotsT = tex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR), dotsF = fbo(dotsT);
    const BW = Math.ceil(W / 4), BH = Math.ceil(H / 4);
    const bl = [0, 1].map(() => { const t = tex(BW, BH, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR); return { t, f: fbo(t) }; });
    // 온도 × 습도 물질 생장 (js/growth.js) — 사진마다 표면 상태를 따로 저장. 부동소수점 렌더 타깃이 없으면 생략
    let growth = null, RH = DT.GROWTH ? DT.GROWTH.defaultHumidity : 50;
    if (floatOK && DT.createGrowth) {
      try { growth = DT.createGrowth(gl, { program, QUAD_VS, quadVao, noise, H, S }); } catch (e) { console.warn('[POLAR] growth layer unavailable:', e); }
    }

    // ---------------- 항목 ----------------
    const items = [];
    let nextId = 0, view = [1, 1], cssToCanvas = 1;
    const byId = (id) => items.find((it) => it.id === id);

    // 매트 → 텍스처 (사진 텍스처와 같은 방향: 아래 행이 먼저)
    function uploadMask(it) {
      const M = it.mask, d = new Uint8Array(M.w * M.h);
      for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) d[(M.h - 1 - y) * M.w + x] = Math.round(M.m[y * M.w + x] * 255);
      gl.bindTexture(gl.TEXTURE_2D, it.maskT);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, M.w, M.h, 0, gl.RED, gl.UNSIGNED_BYTE, d);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    function uploadPhoto(it) {
      gl.bindTexture(gl.TEXTURE_2D, it.photoT);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, it.canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    // 사진을 점 격자로 샘플링 (지금 크기 기준 밀도): 사진 안 위치 · 밝기 · 피사체 매트 · 난수 · 색 · 가장자리 거리
    function sampleDots(it) {
      const rw = it.w, rh = it.h;
      let d = I.spacing * S;
      const est = (rw / d) * (rh / d);
      if (est > I.maxDots) d *= Math.sqrt(est / I.maxDots);
      const cw = Math.max(1, Math.round(rw)), ch = Math.max(1, Math.round(rh));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(it.canvas, 0, 0, cw, ch);
      const px = g.getImageData(0, 0, cw, ch).data;
      const M = it.mask, R = DT.mulberry32(0xD07F00D ^ it.id);
      const maskAt = (u, v) => {
        const x = u * M.w - 0.5, y = v * M.h - 0.5, x0 = Math.max(0, Math.min(M.w - 1, Math.floor(x))), y0 = Math.max(0, Math.min(M.h - 1, Math.floor(y)));
        const x1 = Math.min(M.w - 1, x0 + 1), y1 = Math.min(M.h - 1, y0 + 1), fx = clamp01(x - x0), fy = clamp01(y - y0);
        const a = M.m[y0 * M.w + x0], b = M.m[y0 * M.w + x1], cc = M.m[y1 * M.w + x0], dd = M.m[y1 * M.w + x1];
        return (a + (b - a) * fx) * (1 - fy) + (cc + (dd - cc) * fx) * fy;
      };
      const out = [];
      for (let y = d * 0.5; y < rh; y += d) {
        for (let x = d * 0.5; x < rw; x += d) {
          const jx = Math.min(rw - 0.01, Math.max(0, x + (R() - 0.5) * d)), jy = Math.min(rh - 0.01, Math.max(0, y + (R() - 0.5) * d));   // 흩뜨린 격자 (줄무늬 없음)
          const ix = Math.min(cw - 1, jx | 0), iy = Math.min(ch - 1, jy | 0), o = (iy * cw + ix) * 4;
          const r = px[o] / 255, gg = px[o + 1] / 255, b = px[o + 2] / 255, u = jx / rw, v = jy / rh;
          const edge = clamp01(Math.min(u, 1 - u, v, 1 - v) * 2);
          out.push(u, v, 0.2126 * r + 0.7152 * gg + 0.0722 * b, maskAt(u, v), R(), R(), r, gg, b, edge);
        }
      }
      it.nDots = out.length / 10;
      it.sampledW = it.w;
      it.spacing = d;
      gl.bindBuffer(gl.ARRAY_BUFFER, it.dotBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
    }

    // 누끼는 한 장씩 순서대로 — 처리할 것이 남아 있는 동안 로딩 표시
    const segQueue = [];
    let segRunning = false;
    function busyChanged() { if (api.onBusy) api.onBusy(segRunning || segQueue.length > 0); }
    function queueSegment(it) {
      it.segToken = (it.segToken || 0) + 1;
      segQueue.push({ it, token: it.segToken });
      busyChanged();
      if (!segRunning) runQueue();
    }
    async function runQueue() {
      segRunning = true;
      while (segQueue.length) {
        const { it, token } = segQueue.shift();
        if (it.removed || token !== it.segToken) continue;   // 그 사이 지워졌거나 교체됨
        it.segmenting = true; if (api.onChange) api.onChange();
        try {
          const res = await DT.segmentSubject(it.canvas);
          if (!it.removed && token === it.segToken) { it.mask = res; uploadMask(it); sampleDots(it); it.segError = null; if (growth) growth.refresh(it); }
        } catch (err) {
          console.warn('[POLAR] background removal failed, using approximate mask:', err);
          if (!it.removed && token === it.segToken) {
            it.segError = String(err && err.message || err);
            if (api.onStatus) api.onStatus('Could not separate the subject (the background-removal model failed to load — offline?). Using an approximate cut-out instead.', true);
          }
        }
        it.segmenting = false; if (api.onChange) api.onChange();
      }
      segRunning = false;
      busyChanged();
    }

    // 사진 → 원본 캔버스(긴 변 4096 이하) + 썸네일
    function prepare(image) {
      const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
      const k = Math.min(1, 4096 / Math.max(iw, ih));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k));
      c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
      const tk = 160 / Math.max(iw, ih), th = document.createElement('canvas');
      th.width = Math.max(1, Math.round(iw * tk)); th.height = Math.max(1, Math.round(ih * tk));
      th.getContext('2d').drawImage(c, 0, 0, th.width, th.height);
      return { canvas: c, iw, ih, thumb: th.toDataURL('image/jpeg', 0.85) };
    }
    // 처음 크기: 원래 크기(CSS px) 그대로, 보이는 화면보다 크면 줄임 (두 번째 장부터는 조금 더 작게 — 콜라주로 겹쳐 놓기 쉽게)
    // 패널을 피한 빈 영역 [x0, y0, x1, y1] (캔버스 px) — 없으면 보이는 화면 전체 (setSafe)
    let safe = null;
    const safeRect = () => safe || [(W - W * view[0]) / 2, (H - H * view[1]) / 2, (W + W * view[0]) / 2, (H + H * view[1]) / 2];
    function initialSize(iw, ih, first) {
      const s = safeRect(), vw = s[2] - s[0], vh = s[3] - s[1], fit = first ? I.fit : I.collageFit;
      let rw = iw * cssToCanvas, rh = ih * cssToCanvas;
      const k = Math.min(1, (vw * fit) / rw, (vh * fit) / rh);
      return [rw * k, rh * k];
    }
    // 새 사진 위치: 첫 장은 빈 영역 가운데, 다음 장부터는 그 가운데를 중심으로 황금각 나선 위에 흩어 놓음 (빈 영역 안으로)
    function initialCenter(n, w, h) {
      const s = safeRect(), vw = s[2] - s[0], vh = s[3] - s[1], mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2;
      if (n === 0) return [mx, my];
      const a = n * 2.39996 + 0.6, r = Math.min(vw, vh) * (0.16 + 0.05 * Math.min(n, 4));
      let cx = mx + Math.cos(a) * r * 1.3, cy = my + Math.sin(a) * r;
      const x0 = s[0] + w / 2, x1 = s[2] - w / 2, y0 = s[1] + h / 2, y1 = s[3] - h / 2;
      cx = x0 < x1 ? Math.min(x1, Math.max(x0, cx)) : mx; cy = y0 < y1 ? Math.min(y1, Math.max(y0, cy)) : my;
      return [cx, cy];
    }

    // 시간·온도
    let tempT = 15, Ta = 15, time = 0, edgeTau = 0;
    let zoomT = 1, off = [0, 0], anchor = [W / 2, H / 2];   // 마우스 휠 확대 (stepView)
    let zoom = 1, zc = [W / 2, H / 2], grow = 0, dense = 0, dens = 0, wet = 0, dry = 0, waterLv = 0, edgeMelt = 0;   // dense = 녹음 저항(−35 → −60 °C), dens = 성에 입자 밀도(−10 → −60 °C)
    const zx = (x) => zc[0] + (x - zc[0]) * zoom, zy = (y) => zc[1] + (y - zc[1]) * zoom;
    /*
     * 가장자리 성에 점 배치 (보이는 화면 기준, 창 크기가 바뀌면 다시) — 가장자리에 가까울수록 촘촘
     *  d: 보이는 화면의 가장자리까지 거리(부드러운 최솟값 → 모서리가 먼저·더 두껍게) / 띠 폭
     */
    function makeEdgeDots() {
      const vw = W * view[0], vh = H * view[1], x0 = (W - vw) / 2, y0 = (H - vh) / 2, band = I.edgeBand * Math.min(vw, vh), k = band * 0.12;
      const key = [Math.round(vw), Math.round(vh)].join('x');
      if (key === edgeKey) return;
      edgeKey = key;
      // 띠보다 넓게(EXT 배) 깔아 두고, 실제로 어디까지 얼지는 셰이더의 들쭉날쭉한 전선이 정함 → 안쪽 경계가 직사각형으로 끊기지 않음
      const R = DT.mulberry32(0xED6E5), sp = I.edgeSpacing * S, out = [], EXT = 1.8;
      for (let y = y0 + sp / 2; y < y0 + vh; y += sp) {
        for (let x = x0 + sp / 2; x < x0 + vw; x += sp) {
          const px = x + (R() - 0.5) * sp, py = y + (R() - 0.5) * sp;
          const dx = Math.min(px - x0, x0 + vw - px), dy = Math.min(py - y0, y0 + vh - py);
          if (Math.min(dx, dy) > band * EXT) continue;
          const dd = Math.max(0, -k * Math.log(Math.exp(-dx / k) + Math.exp(-dy / k))) / band;
          if (dd > EXT || R() > 0.1 + 0.9 * Math.pow(1 - dd / EXT, 1.6)) continue;
          out.push(px, py, dd, R(), R(), 0.7 + R() * R() * 1.1);
        }
      }
      nEdge = out.length / 6;
      gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
    }
    let ptr = null, prev = null;
    const cvel = [0, 0];   // 커서 속도 (보이는 화면 기준 /초, 부드럽게) — 바람 방향
    let air = 0;           // 바람 세기 0~1 (성에 모드에서 산소가 높을수록 — setAir)
    let freezeOn = true, cutK = 0;   // 결빙 모드 (Vitality 꺼짐) / 사진 배경 지움 정도 (생장 모드에서 1)
    let edgeOn = true;               // 화면 가장자리 성에를 키울지 (Lab mode: 전체 Mix 에 성에가 있을 때만)
    let bubbleOn = false;            // 기포 모드 (Vitality 끔 + 습도·산소 높음) — 물방울·물 없이 기포만
    let tint = [0.22, 0.52, 1.0], tintTo = tint.slice(), tintK = 0, tintT = 0;   // 성에 색 (대시보드) — 색·세기가 목표값을 부드럽게 따라감
    const stage =(P) => ({ sat: 1 - 0.92 * sstep(0, 0.5, P), photoA: 1 - sstep(0.18, 0.62, P), dot: sstep(0.06, 0.48, P), color: sstep(0.25, 0.75, P), bg: sstep(0.45, 1, P) });
    const progOf = (it) => it.tau / I.duration;
    const maxP = () => items.reduce((m, it) => Math.max(m, progOf(it)), 0);

    // 화면 아래에 차오른 물 (waterLv > 0 일 때) — 최종 화면을 복사해 물속 부분을 일렁인 화면으로 바꿔 그림
    const sceneT = tex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    function drawWater() {
      if (waterLv < 0.002) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(quadVao);
      gl.useProgram(pWater.p);
      const L = pWater.loc;
      gl.uniform4f(L.uRect, -1, -1, 1, 1);
      // 지금까지 그린 화면을 그대로 복사 → 물속에서 일렁이며 굴절시켜 다시 그림
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneT); gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H); gl.uniform1i(L.uScene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, noise); gl.uniform1i(L.uNoise, 1);
      gl.uniform1f(L.uDistort, I.waterDistort);
      gl.uniform1f(L.uLevel, waterLv); gl.uniform1f(L.uT, time); gl.uniform1f(L.uAsp, W / H);
      gl.uniform2f(L.uView, 0.5 - view[1] / 2, 0.5 + view[1] / 2);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.BLEND);
    }

    const api = {
      canvas,
      get hasPhoto() { return items.length > 0; },
      get freeze() { return sstep(0.25, 0.6, maxP()); },            // 0~1 — 돋보기 등
      get coldK() { return clamp01((I.frostPoint - Ta) / 20); },
      get editable() { return items.length > 0; },                   // 효과가 씌어진 뒤에도 콜라주 편집 (이동·크기 조절)
      // 콜라주 목록 (아래 → 위 순서). rect 는 캔버스 px [x, y, w, h]
      get items() {
        return items.map((it) => ({ id: it.id, thumb: it.thumb, rect: [it.cx - it.w / 2, it.cy - it.h / 2, it.w, it.h], segmenting: !!it.segmenting, segmented: !!(it.mask && it.mask.model), segError: it.segError || null }));
      },
      get debug() {
        return { applied: Ta, zoom: +zoom.toFixed(3), grow: +grow.toFixed(2), dense: +dense.toFixed(3), count: items.length, items: items.map((it) => ({ id: it.id, progress: +progOf(it).toFixed(3), dots: it.nDots, subject: +it.mask.coverage.toFixed(3), segmented: !!it.mask.model, segError: it.segError || null, rect: [it.cx - it.w / 2, it.cy - it.h / 2, it.w, it.h].map(Math.round) })) };
      },

      // 사진 추가 → 새 항목 id. mask = 미리 딴 누끼(갤러리) — 있으면 모델을 다시 돌리지 않고 바로 씀
      //  opt (되돌리기): { id: 원래 번호, rect: [x, y, w, h], tau: 결빙 진행, fade, cut } — 지운 사진을 같은 번호 · 자리 · 진행 그대로 다시 놓음
      addPhoto(image, mask, opt) {
        const pr = prepare(image);
        let [w, h] = initialSize(pr.iw, pr.ih, items.length === 0);
        let [cx, cy] = initialCenter(items.length, w, h);
        if (opt && opt.rect) { [w, h] = [opt.rect[2], opt.rect[3]]; cx = opt.rect[0] + w / 2; cy = opt.rect[1] + h / 2; }
        const id = opt && opt.id != null ? opt.id : ++nextId;
        nextId = Math.max(nextId, id);
        const it = { id, canvas: pr.canvas, thumb: pr.thumb, aspect: pr.iw / pr.ih, w, h, cx, cy, tau: (opt && opt.tau) || 0, nDots: 0, fade: opt && opt.fade, cut: opt && opt.cut,
          photoT: gl.createTexture(), maskT: gl.createTexture(), dotBuf: gl.createBuffer() };
        it.vao = makeDotVao(it.dotBuf);
        it.mask = mask || DT.subjectMask(pr.canvas);   // 미리 딴 누끼, 없으면 모델 결과가 오기 전 임시 (색 기반 추정)
        uploadPhoto(it); uploadMask(it); sampleDots(it);
        if (growth) growth.attach(it);
        items.push(it);
        if (!mask) queueSegment(it);
        if (api.onChange) api.onChange();
        return it.id;
      },
      // 사진 교체: 위치는 그대로, 크기는 새 사진 비율에 맞춰 (같은 넓이), 효과는 처음부터
      replacePhoto(id, image) {
        const it = byId(id); if (!it) return;
        const pr = prepare(image), area = it.w * it.h, aspect = pr.iw / pr.ih;
        it.canvas = pr.canvas; it.thumb = pr.thumb; it.aspect = aspect;
        it.w = Math.sqrt(area * aspect); it.h = it.w / aspect; it.tau = 0; it.segError = null;
        it.mask = DT.subjectMask(pr.canvas);
        uploadPhoto(it); uploadMask(it); sampleDots(it);
        if (growth) { growth.detach(it); growth.attach(it); }   // 새 사진 = 새 표면
        queueSegment(it);
        if (api.onChange) api.onChange();
      },
      removePhoto(id) {
        const i = items.findIndex((it) => it.id === id); if (i < 0) return;
        const it = items[i];
        it.removed = true;
        gl.deleteTexture(it.photoT); gl.deleteTexture(it.maskT); gl.deleteBuffer(it.dotBuf); gl.deleteVertexArray(it.vao);
        if (growth) growth.detach(it);
        items.splice(i, 1);
        if (api.onChange) api.onChange();
      },
      bringToFront(id) { const i = items.findIndex((it) => it.id === id); if (i >= 0 && i < items.length - 1) { items.push(items.splice(i, 1)[0]); if (api.onChange) api.onChange(); } },
      // 위치·크기 (캔버스 px, 가운데 기준). 크기는 사진 비율 유지
      moveTo(id, cx, cy) { const it = byId(id); if (it) { it.cx = cx; it.cy = cy; } },
      resizeTo(id, w) { const it = byId(id); if (it) { it.w = Math.max(40 * S, w); it.h = it.w / it.aspect; } },
      // 크기 조절이 끝나면 그 크기에 맞는 점 밀도로 다시 샘플링
      commit(id) { const it = byId(id); if (it && Math.abs(it.w - it.sampledW) > 1) sampleDots(it); },
      // 캔버스 px 위치의 가장 위 사진
      hitTest(x, y) {
        for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (Math.abs(x - it.cx) <= it.w / 2 && Math.abs(y - it.cy) <= it.h / 2) return it.id; }
        return null;
      },
      // 보이는 영역(캔버스 대비 비율)과 CSS px → 캔버스 px 배율 — 새 사진의 처음 크기·위치에 씀 (놓인 사진은 그대로)
      setView(fx, fy, aspect, pxScale) { view = [fx, fy]; cssToCanvas = pxScale || 1; makeEdgeDots(); },
      setSafe(r) { safe = r && r[2] - r[0] > 40 && r[3] - r[1] > 40 ? r : null; },   // 새 사진을 놓을 빈 영역 (캔버스 px), null = 화면 전체
      get edgeProgress() { return edgeTau / I.edgeDuration; },
      get cssToCanvas() { return cssToCanvas; },
      setTemperature(t, immediate) { tempT = t; if (immediate) Ta = t; },
      // 결빙 모드 켜기/끄기 (Vitality 를 켜면 끔): 끄면 아무리 추워도 얼지 않고, 습해도 물이 차거나 성에가 녹아 흐르지 않음
      setFreezing(on) { freezeOn = !!on; },
      get freezing() { return freezeOn; },
      setBubbles(on) { bubbleOn = !!on; },
      setEdgeFrost(on) { edgeOn = !!on; },
      // 사진별 Mix (Lab mode): { frost: 이 사진만 얼음, cut: 배경 지움 } — null 이면 전체 설정을 따름
      setItemMode(id, ov) { const it = byId(id); if (it) it.ov = ov ? { frost: !!ov.frost, cut: !!ov.cut } : null; },
      // 겹침 순서: delta = +1 앞으로 · −1 뒤로 · Infinity 맨 앞 · −Infinity 맨 뒤
      shiftLayer(id, delta) {
        const i = items.findIndex((it) => it.id === id); if (i < 0) return;
        const j = Math.max(0, Math.min(items.length - 1, delta === Infinity ? items.length - 1 : delta === -Infinity ? 0 : i + delta));
        if (j === i) return;
        items.splice(j, 0, items.splice(i, 1)[0]);
        if (api.onChange) api.onChange();
      },
      layerOf(id) { return items.findIndex((it) => it.id === id); },
      // 되돌리기용: 사진마다 진행(결빙 · 사라짐 · 배경 지움), 겹침 순서 맞추기, 화면 가장자리 성에 등
      itemState(id) { const it = byId(id); return it ? { tau: it.tau, fade: it.fade, cut: it.cut } : null; },
      setOrder(ids) { const pos = new Map(ids.map((id, i) => [id, i])); items.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e9) - (pos.has(b.id) ? pos.get(b.id) : 1e9)); if (api.onChange) api.onChange(); },
      get frameState() { return { edgeTau, grow, Ta, tempT, zoom, zoomT, off: off.slice(), zc: zc.slice() }; },
      setFrameState(s) { if (!s) return; edgeTau = s.edgeTau; grow = s.grow; Ta = s.Ta; tempT = s.tempT; zoom = s.zoom; zoomT = s.zoomT; off = s.off.slice(); zc = s.zc.slice(); },
      // 사진의 누끼 매트 { w, h, m(0~1) } — 미생물이 피사체 모양 위에서만 자라도록
      maskOf(id) { const it = byId(id); return it ? it.mask : null; },
      // 사진 원본 캔버스 — 부식 점이 사진 명암을 따르도록 (js/corrode.js)
      photoOf(id) { const it = byId(id); return it ? it.canvas : null; },
      // 사진 밝기 격자 { w, h, l(0~1) } — 미생물 점의 밝기가 사진 명암을 따르도록 (사진을 바꾸면 새로 만듦)
      lumOf(id) {
        const it = byId(id); if (!it) return null;
        if (!it.lum || it.lum.src !== it.canvas) {
          const s = Math.min(1, 160 / Math.max(it.canvas.width, it.canvas.height)), w = Math.max(1, Math.round(it.canvas.width * s)), h = Math.max(1, Math.round(it.canvas.height * s));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(it.canvas, 0, 0, w, h);
          const px = g.getImageData(0, 0, w, h).data, l = new Float32Array(w * h);
          for (let i = 0; i < w * h; i++) l[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
          it.lum = { w, h, l, src: it.canvas };
        }
        return it.lum;
      },
      // 사진이 미생물로 바뀐 정도 (0~1) — 그만큼 원래 사진이 사라짐. 부드럽게 따라감
      setPhotoFade(id, k) { const it = byId(id); if (it) it.fadeT = Math.min(1, Math.max(0, k)); },
      // 처음 상태로: 모든 사진 삭제 + 가장자리 성에·결정 성장·확대·녹임 지도 초기화
      reset(t) {
        while (items.length) api.removePhoto(items[0].id);
        if (t != null) { tempT = t; Ta = t; }
        edgeTau = 0; grow = 0; dense = 0; dens = 0; waterLv = 0; edgeMelt = 0; zoom = 1; zoomT = 1; off = [0, 0]; zc = [W / 2, H / 2]; prev = null;
        for (const m of melt) { gl.bindFramebuffer(gl.FRAMEBUFFER, m.f); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      },
      // 상대습도(%) — 온도와 함께 물질 생장·응결·성에를 결정 (js/growth.js)
      setHumidity(h) { RH = Math.min(100, Math.max(0, h)); },
      get env() { return growth ? Object.assign({}, growth.env) : null; },
      growthStats() { return growth ? growth.stats(items) : []; },
      pointer(x, y) { ptr = x == null ? null : [x, y]; if (!ptr) prev = null; },
      setAir(v) { air = clamp01(v || 0); },   // 성에 모드 바람 세기 (0~1)
      // 얼굴을 얼마나 가까이 댔는지(0~1)와 얼굴 위치(보이는 화면 기준 0~1) — 얼어 있을 때만 확대
      /*
       * 마우스 휠 확대 (1 ~ zoomMax) — 화면 = 원래 자리 × zoom + off (캔버스 px)
       *  anchor(캔버스 px, 화면 기준) = 휠을 돌린 커서 자리 → 확대·축소하는 동안 그 자리가 커서 밑에 그대로 있음
       *  셰이더는 zoomPos(p) = zc + (p − zc)·zoom 꼴이라 zc = off / (1 − zoom) 로 넘김
       */
      setZoom(z, ax, ay) { zoomT = Math.min(I.zoomMax, Math.max(1, z)); anchor = [ax, ay]; },
      get zoomTarget() { return zoomT; },
      get view() { return { zoom, off: off.slice() }; },
      // 화면 캔버스 px → 확대 전 캔버스 px
      toWorld(x, y) { return [(x - off[0]) / zoom, (y - off[1]) / zoom]; },
      stepView(dt) {
        const z0 = zoom;
        zoom += (zoomT - zoom) * Math.min(1, dt * I.zoomFollow * 2.5);
        if (Math.abs(zoom - zoomT) < 1e-3) zoom = zoomT;
        off[0] = anchor[0] - (anchor[0] - off[0]) * zoom / z0; off[1] = anchor[1] - (anchor[1] - off[1]) * zoom / z0;
        // 캔버스 밖이 보이지 않게
        off[0] = Math.min(0, Math.max(W * (1 - zoom), off[0])); off[1] = Math.min(0, Math.max(H * (1 - zoom), off[1]));
        if (zoom === 1) { off[0] = 0; off[1] = 0; }
        if (Math.abs(1 - zoom) > 1e-4) { zc[0] = off[0] / (1 - zoom); zc[1] = off[1] / (1 - zoom); } else { zc[0] = W / 2; zc[1] = H / 2; }
      },
      get zoom() { return zoom; },
      colorAt() { return [200, 225, 255]; },
      // 결빙 시계 (대시보드 타임라인): 가장 많이 언 사진(또는 화면 가장자리)의 진행 — −10 °C 기준 초
      get clock() { return Math.max(edgeTau, items.reduce((m, it) => Math.max(m, it.tau), 0)); },
      get clockEnd() { return Math.max(I.duration, I.edgeDuration) * 1.25; },
      // 되감기: 지금 기온의 진행 속도로 sec 초만큼 결빙을 되돌림 (곰팡이·물방울 같은 물질 생장은 그대로)
      rewind(sec) {
        const d = sec * Math.max(1, speedAt(Ta));
        for (const it of items) it.tau = Math.max(0, it.tau - d);
        edgeTau = Math.max(0, edgeTau - d); grow = Math.max(0, grow - sec);
      },
      // 성에 색 (대시보드): [r, g, b] 0~1, null = 원래 파란 성에. 약 0.5초에 걸쳐 바뀜
      setTint(rgb) { if (rgb) { tintTo = rgb.slice(0, 3); if (tintK < 0.01) tint = tintTo.slice(); tintT = 1; } else tintT = 0; },

      update(dt) {
        if (!dt) return;
        dt = Math.min(dt, 1 / 20);
        time += dt;
        const tk = Math.min(1, dt * 5);
        cutK += ((freezeOn ? 0 : 1) - cutK) * Math.min(1, dt * 2.5);
        // 사진마다 배경 지움 (Lab mode 에서 사진별 Mix 가 있으면 그 값, 없으면 전체와 같음)
        for (const it of items) { const ct = it.ov ? (it.ov.cut ? 1 : 0) : (freezeOn ? 0 : 1); it.cut = (it.cut != null ? it.cut : cutK) + (ct - (it.cut != null ? it.cut : cutK)) * Math.min(1, dt * 2.5); }
        for (const it of items) it.fade = (it.fade || 0) + ((it.fadeT || 0) - (it.fade || 0)) * Math.min(1, dt * 1.5);   // 생장 모드: 사진 배경이 서서히 사라지고 피사체만 남음
        tintK += (tintT - tintK) * tk;
        for (let c = 0; c < 3; c++) tint[c] += (tintTo[c] - tint[c]) * tk;
        const tT = freezeOn ? tempT : Math.max(tempT, I.frostPoint + 6);   // 결빙 모드가 꺼져 있으면 얼지 않는 온도로
        Ta += (tT - Ta) * Math.min(1, dt * I.tempFollow);
        if (Math.abs(tT - Ta) < 0.02) Ta = tT;
        const cold = Ta <= I.frostPoint;
        const speed = speedAt(Ta);   // −15 °C 에서 가장 빠름 (speedCurve)
        const k1 = clamp01((I.frostPoint - Ta) / 10);   // 녹음 저항 · 다시 맺힘 (어는점에서 10 °C 아래까지)
        // 사진마다 진행 (가장자리→중앙이 끝까지 가도록 1.25 까지)
        for (const it of items) {
          const cut = it.ov ? it.ov.cut : !freezeOn, fz = it.ov ? it.ov.frost : freezeOn;   // 사진별 Mix (Lab mode) — 성에를 켠 사진만 얼음
          if (cut) it.tau = 0;   // 생장 모드: 얼어 있던 사진도 바로 녹음 (서서히 녹는 동안 사진 가장자리가 회색으로 보이지 않게)
          else if (cold && fz) it.tau = Math.min(I.duration * 1.25, it.tau + dt * speed);
          else it.tau = Math.max(0, it.tau - dt * I.thaw * (1 + 0.25 * Math.max(0, Ta - I.frostPoint)) * (fz ? 1 : 3));
        }
        // 화면 가장자리 성에 (사진이 없어도 화면 자체가 얼어 감) — Lab mode 에서 전체 Mix 에 성에가 없으면 걷힘
        if (cold && edgeOn) edgeTau = Math.min(I.edgeDuration * 1.2, edgeTau + dt * speed);
        else edgeTau = Math.max(0, edgeTau - dt * I.thaw * (1 + 0.25 * Math.max(0, Ta - I.frostPoint)) * (edgeOn ? 1 : 3));
        // 확대는 stepView (마우스 휠, 멈춤과 무관하게 매 프레임)
        // 결정 성장 시계: 얼어 있는 동안 계속 흐르고(들여다보는 동안 더 빠르게), 녹으면 되돌아감
        if (cold) grow += dt * mix(I.growIdle, 1, sstep(1, 2.5, zoom)) * (1 + dense);
        else grow = Math.max(0, grow - dt * (2 + grow * 0.5));
        // 아주 추움(−60 °C 에 가까울수록 1): 성에가 아주 빽빽해지고 커서로 녹지·흩어지지 않음
        dense = sstep(I.denseFrom, I.lockTo, Ta);
        // 성에 입자 밀도(결정 수): 습도 ↑ → 결정이 많아짐 — 범위(0 ~ 1, 점 층 1 ~ 3)는 그대로, 입력만 습도 (humDensityK 1 = 습도로만)
        const hk = I.humDensityK;
        dens = clamp01((1 - hk) * sstep(I.frostPoint, I.denseTo, Ta) + hk * sstep(I.humDensity[0], I.humDensity[1], RH));
        // 습도: 건조할수록 커서에 가루처럼 날아가고, 습할수록 커서 자국이 물이 되어 흘러내림
        wet = freezeOn && !bubbleOn ? sstep(I.wetFrom[0], I.wetFrom[1], RH) : 0; dry = 1 - sstep(I.dryUntil[0], I.dryUntil[1], RH);
        // 습하면 화면 가장자리 성에가 서서히 녹아 흘러내리고(edgeMelt), 그 물이 화면 아래에 차오름(waterLv)
        //  습도를 내리면 다시 얼어붙고(edgeMelt 감소), 물은 천천히 빠짐
        const frosty = edgeTau > 0.5 || items.length > 0;
        edgeMelt = clamp01(edgeMelt + dt * (wet > 0.02 ? wet / I.edgeWetMelt : -1 / I.edgeRefreeze));
        if (wet > 0.02 && frosty) waterLv = Math.min(I.waterMax, waterLv + dt * wet * I.waterMax / I.waterFill * (0.4 + 0.6 * edgeMelt));
        else waterLv = Math.max(0, waterLv - dt * I.waterMax / I.waterDrain);
        if (bubbleOn) { waterLv = 0; edgeMelt = 0; }   // 기포 모드: 물(차오른 물·녹아 흐르는 성에) 없이 기포만
        // 온도 × 습도 물질 생장 (사진마다). 커서는 확대 전 캔버스 좌표로
        if (growth && !bubbleOn) growth.update(dt, items, Ta, RH, ptr && { x: zc[0] + (ptr[0] * W - zc[0]) / zoom, y: zc[1] + (ptr[1] * H - zc[1]) / zoom }, Math.max(0.35, 1 - dense));   // 아주 추워도 커서에 조금은 걷힘
        if (!items.length && edgeTau <= 0) return;
        // 녹임 지도 (화면 기준 하나)
        gl.bindVertexArray(quadVao);
        gl.disable(gl.BLEND);
        gl.viewport(0, 0, MW, MH);
        gl.useProgram(pMelt.p);
        const L = pMelt.loc;
        gl.uniform4f(L.uRect, -1, -1, 1, 1);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, melt[mcur].t); gl.uniform1i(L.uState, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, noise); gl.uniform1i(L.uNoise, 1);
        // 커서: 기온과 상관없이 성에가 있으면 늘 반응 (아주 추워도 — 대신 빨리 다시 굳음)
        const on = !!ptr && (maxP() > 0.15 || edgeTau / I.edgeDuration > 0.1);
        // 확대 중이면 커서가 가리키는 실제(확대 전) 자리를 녹임
        const pz = ptr && [(zc[0] + (ptr[0] * W - zc[0]) / zoom) / W, (zc[1] + (ptr[1] * H - zc[1]) / zoom) / H];
        if (on) { const a = W / H, p0 = prev || pz; gl.uniform4f(L.uSeg, p0[0] * a, 1 - p0[1], pz[0] * a, 1 - pz[1]); }
        gl.uniform1f(L.uCursor, on ? 1 : 0);
        // 바람: 커서 움직임 방향(부드럽게) × 공기(air) — 멈추면 잦아듦
        if (pz && prev) { const vx = (pz[0] - prev[0]) / dt, vy = (pz[1] - prev[1]) / dt, k = Math.min(1, dt * 6); cvel[0] += (vx - cvel[0]) * k; cvel[1] += (vy - cvel[1]) * k; }
        else { cvel[0] *= 1 - Math.min(1, dt * 3); cvel[1] *= 1 - Math.min(1, dt * 3); }
        const sp = Math.hypot(cvel[0], cvel[1]), wk = air * I.windMax * Math.min(1, sp / 0.6) / Math.max(1e-6, sp);
        gl.uniform2f(L.uWind, cvel[0] * wk, -cvel[1] * wk);   // 녹임 지도는 위아래가 뒤집힘
        gl.uniform1f(L.uDt, dt); gl.uniform1f(L.uAsp, W / H); gl.uniform1f(L.uTime, time);
        // 녹는 속도 = 기온에 따른 녹음 + 건조할 때 날아가는 속도 — 아주 추워도 0 이 되지 않게
        gl.uniform1f(L.uRate, mix(I.melt[0], I.melt[1], k1) * (1 - 0.6 * dense) * (1 - dry) + I.blow * dry + I.melt[0] * 0.5 * air);
        gl.uniform1f(L.uHeal, (cold ? mix(I.heal[0], I.heal[1], k1) + dense * 0.3 : 1) * (1 - 0.6 * dry) * (1 - 0.4 * air));   // 바람이 세면 쓸린 자리가 조금 더 오래 비어 있음
        gl.uniform1f(L.uWet, cold ? wet : 0); gl.uniform1f(L.uFlow, I.waterFlow);
        gl.uniform1f(L.uRad, I.meltRadius);
        prev = pz;
        gl.bindFramebuffer(gl.FRAMEBUFFER, melt[1 - mcur].f);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        mcur = 1 - mcur;
      },

      render() {
        gl.viewport(0, 0, W, H);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        const edgeF = edgeTau / I.edgeDuration;
        if (!items.length && edgeF <= 0.001) { drawWater(); return; }
        const cx = (x) => x / W * 2 - 1, cy = (y) => 1 - y / H * 2;
        gl.enable(gl.BLEND);
        // 1) 원본 사진들 (겹치는 순서대로, 점으로 바뀌는 동안 가장자리부터 옅어짐)
        gl.bindVertexArray(quadVao);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(pQuad.p);
        let L = pQuad.loc;
        for (const it of items) {
          const P = progOf(it);
          if (P <= 0.86) {   // 0.86 넘으면 사진은 다 점으로 바뀜
            gl.useProgram(pQuad.p);
            const x0 = it.cx - it.w / 2, y0 = it.cy - it.h / 2;
            gl.uniform4f(L.uRect, cx(zx(x0)), cy(zy(y0 + it.h)), cx(zx(x0 + it.w)), cy(zy(y0)));
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, it.photoT); gl.uniform1i(L.uPhoto, 0);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, it.maskT); gl.uniform1i(L.uMask, 1);
            gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, noise); gl.uniform1i(L.uNoise, 2);
            gl.uniform1f(L.uP, P); gl.uniform1f(L.uCut, it.cut != null ? it.cut : cutK); gl.uniform1f(L.uFade, it.fade || 0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          }
          // 그 사진 표면의 물질 (곰팡이·물방울·성에·균열) — 사진 바로 위, 겹치는 순서 그대로
          if (growth && (it.cut != null ? it.cut : cutK) < 0.5 && !bubbleOn) {   // 생장 모드·기포 모드에서는 사진 위 물방울·곰팡이도 그리지 않음 (미생물·기포만)
            const [dx, dy, dw, dh] = growth.domain(it);
            growth.draw(it, [cx(zx(dx)), cy(zy(dy + dh)), cx(zx(dx + dw)), cy(zy(dy))], dw * zoom, dh * zoom, 1 - sstep(0.18, 0.62, P));
          }
        }
        const mp = maxP();
        if (mp < 0.04 && edgeF <= 0.001) { drawWater(); return; }
        // 2) 점 → 점 레이어 (사진마다 자기 진행도·위치)
        gl.bindFramebuffer(gl.FRAMEBUFFER, dotsF);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(pDot.p);
        L = pDot.loc;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, melt[mcur].t); gl.uniform1i(L.uMelt, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, noise); gl.uniform1i(L.uNoise, 1);
        gl.uniform2f(L.uRes, W, H); gl.uniform1f(L.uT, time); gl.uniform1f(L.uS, S);
        gl.uniform1f(L.uSize, I.dotSize); gl.uniform1f(L.uWind, I.wind * (1 - 0.6 * (growth ? growth.env.crys : 0)));   // 저온·저습이면 흔들림이 느려짐
        const cry = sstep(I.crystalFrom[0], I.crystalFrom[1], zoom);
        const zoomU = (Lc) => { gl.uniform1f(Lc.uZoom, zoom); gl.uniform2f(Lc.uZC, zc[0], zc[1]); gl.uniform1f(Lc.uCry, cry); gl.uniform1f(Lc.uGrow, grow); gl.uniform1f(Lc.uDense, dens); gl.uniform1f(Lc.uWet, wet); gl.uniform1f(Lc.uDry, dry); gl.uniform3f(Lc.uTint, tint[0], tint[1], tint[2]); gl.uniform1f(Lc.uTintK, tintK); };
        const layers = dens > 0.001 ? 1 + Math.ceil(dens * 2 - 1e-6) : 1;   // 추울수록 점 층을 덧그림 (최대 3층)
        zoomU(L);
        // 화면 가장자리 성에 (사진 점보다 먼저 = 아래)
        if (edgeF > 0.001 && nEdge) {
          gl.useProgram(pEdge.p);
          const E = pEdge.loc;
          gl.uniform1i(E.uMelt, 0); gl.uniform1i(E.uNoise, 1);
          zoomU(E); gl.uniform1f(E.uSp, I.edgeSpacing * S);
          gl.uniform2f(E.uRes, W, H); gl.uniform1f(E.uT, time); gl.uniform1f(E.uS, S);
          gl.uniform1f(E.uF, edgeF); gl.uniform1f(E.uSize, I.dotSize); gl.uniform1f(E.uEMelt, edgeMelt);
          gl.bindVertexArray(edgeVao);
          for (let ly = 0; ly < layers; ly++) { gl.uniform1f(E.uLayer, ly); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nEdge); }
          gl.useProgram(pDot.p);
        }
        for (const it of items) {
          const P = progOf(it);
          if (P < 0.04 || !it.nDots) continue;
          gl.bindVertexArray(it.vao);
          gl.uniform4f(L.uRect, it.cx - it.w / 2, it.cy - it.h / 2, it.w, it.h);
          gl.uniform1f(L.uP, P); gl.uniform1f(L.uSp, it.spacing);
          for (let ly = 0; ly < layers; ly++) { gl.uniform1f(L.uLayer, ly); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, it.nDots); }
        }
        // 3) 빛 번짐 (1/4 해상도 가우시안)
        gl.disable(gl.BLEND);
        gl.bindVertexArray(quadVao);
        gl.useProgram(pBlur.p);
        L = pBlur.loc;
        gl.uniform4f(L.uRect, -1, -1, 1, 1);
        gl.viewport(0, 0, BW, BH);
        const pass = (src, dst, dx, dy) => {
          gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(L.uSrc, 0);
          gl.uniform2f(L.uDir, dx, dy);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        pass(dotsT, bl[0], 1.5 / W, 1.5 / H);   // 축소하며 대각 흐림
        pass(bl[0].t, bl[1], 1 / BW, 0);
        pass(bl[1].t, bl[0], 0, 1 / BH);
        pass(bl[0].t, bl[1], 2 / BW, 0);
        pass(bl[1].t, bl[0], 0, 2 / BH);
        // 4) 합성 (빛을 더함)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(pComp.p);
        L = pComp.loc;
        gl.uniform4f(L.uRect, -1, -1, 1, 1);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dotsT); gl.uniform1i(L.uDots, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bl[0].t); gl.uniform1i(L.uBloom, 1);
        gl.uniform1f(L.uBloomK, I.bloom * Math.max(stage(mp).color, Math.min(1, edgeF * 2)) + 0.15);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disable(gl.BLEND);
        drawWater();
      },
    };
    return api;
  };
})(window.DT = window.DT || {});
