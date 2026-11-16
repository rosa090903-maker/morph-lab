/*
 * 점균 — 노란 원형질이 가지를 치며 자라남
 *  자라는 모양 레퍼런스: Hajime Kutsuwada 'Growth' (작은 씨앗에서 굵은 줄기가 뻗고, 끝이 계속 갈라져 가는 잔가지가 되며 화면을 채움)
 *  색 레퍼런스: 황색 점균 Physarum (파란 배지 위 명도 높은 노란 원형질)
 *  조건: Vitality 켬 + 기온 낮음 + 습도 높음 + 산소(공기) 거의 없음 (미생물 대신 나타남, 배경은 하늘빛 파랑 — css .bio-bg[data-tone="slime"])
 *
 *  자라는 방식 (끝 성장):
 *   · 누끼 피사체의 조각마다 무게중심에서 굵은 줄기 몇 가닥이 사방으로 뻗음 (피사체 안을 클릭하면 그 자리에서도)
 *   · 줄기 끝(tip)은 조금씩 구불거리며 나아가고, 앞쪽 세 방향을 살펴 피사체 밖·이미 자란 자리를 피해 빈 곳으로 휨
 *   · 이따금 둘로 갈라짐 (굵은 쪽이 이어지고, 가는 곁가지가 비스듬히) — 갈라질수록 가늘어지고 너무 가늘면 멈춤
 *   · 끝이 줄면 이미 자란 가지 옆구리에서 새 곁눈이 돋아 빈 곳을 계속 채움
 *   · 그린 가지는 쌓아 두는 그림(art)에 한 번만 그림 (그림자 → 노란 몸통 → 광택 세 겹)
 *  반응성(reactivity, 0~1 — 대시보드 'Growth Rate' 패널): 자라는 빠르기 · 갈라짐 · 구불거림 · 커서 쪽으로 끌려오는 정도 · 클릭 반응
 *  피사체 밖으로는 나가지 않음 (그림도 누끼 모양으로 잘라 냄)
 *  화면 양쪽 끝에서부터: 보이는 화면 왼쪽 · 오른쪽 가장자리에서도 굵은 줄기가 돋아 가운데 쪽으로 퍼짐 (사진 없이도 — DT.SLIME.sides)
 *  좌표 = 프레임 CSS px (js/microbe.js 와 같음), 휠 확대는 setView 로 맞춤
 *  수치는 DT.SLIME 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  DT.SLIME = {
    // 켜지는 조건 (Life 켬): 기온 tempFrom 이상 tempTo 미만 · 습도 humFrom 이상 · 빛 lightTo lx 이하 · 산소 o2From 이상
    tempFrom: 18, tempTo: 28,      // 기온(°C) — 18° 이상 28° 미만
    tempFull: 24,                  // 이 기온 근처에서 가장 셈 (구간 양 끝으로 약해짐)
    humFrom: 70, humFull: 95,      // 습도(%) — 이 아래면 없음 / 여기서 최대
    lightTo: 100,                  // 빛(lx) — 이 위면 없음 (어두운 곳을 좋아함). 어두울수록 셈
    lightMin: 0.1,                 // 빛 다이얼의 가장 어두운 값 (여기서 가장 셈)
    o2From: 15, o2Full: 21,        // 산소(%) — 이 아래면 없음 (숨을 쉬어야 함) / 보통 공기에서 최대
    reactivity: 0.5,               // 반응성 기본값 (0~1)
    occ: 3,                        // 자란 자리·피사체를 기록하는 격자 칸(프레임 px) — 작을수록 가지가 촘촘히 붙음
    speed: [45, 200],             // 끝이 자라는 빠르기(px/초) — 반응성 0 ~ 1
    seedTips: [3, 5],              // 씨앗 하나에서 뻗는 줄기 수
    clickTips: [2, 5],             // 클릭 한 번에 뻗는 줄기 수 — 반응성 0 ~ 1
    // 사진의 명도 대비(밝기가 확 바뀌는 윤곽·무늬)가 센 곳을 위주로 자람
    featPull: 2.4,                 // 대비가 센 쪽으로 휘는 세기
    featBranch: 1.3,               // 대비가 센 곳에서 곁가지가 더 자주 (약한 곳은 덜)
    featSeeds: 1,                 // 조각마다 가장 대비가 센 자리 몇 곳에서도 시작
    textFilm: 0.75,                // 친 글자 모양에 깔리는 금빛 막 (0 = 없음) — 가지만으로는 획이 끊겨 글자가 읽히지 않으므로
    outline: 1.6,                  // 피사체 · 글자 윤곽선 굵기(px, 화면) — 원래 사진이 사라져도 외곽이 보이게 (0 = 없음)
    outlineA: 0.95,                // 윤곽선 진하기
    // 나뭇가지 모양: 마디(정해진 길이)만큼 자라면 Y 자로 갈라지고, 세대마다 짧고 가늘어짐 (줄기 → 가지 → 잔가지)
    // 레퍼런스(macmoss 포스터): 가운데에서 바깥으로 흘러가는 긴 맥 · 좁은 각도로 갈라짐 · 가장자리가 들쭉날쭉(톱니·가시)
    firstLen: 0.34,                // 첫 마디 길이 (조각 크기 대비) — 길게 뻗음
    lenDecay: 0.84,                // 세대마다 마디 길이 비율 — 천천히 짧아짐 (긴 맥)
    forkAngle: [0.22, 0.6],        // 갈라지는 두 가지 사이 각도(rad) — 좁게 (나란히 흘러감)
    forkWidth: [0.6, 0.86],        // 갈라질 때 굵기 비율 (가는 쪽, 굵은 쪽)
    maxGen: 10,                    // 최대 세대
    radial: 1.4,                   // 출발점에서 바깥쪽으로 흘러가려는 세기 (방사형)
    swell: 0.55,                   // 가지를 따라 굵었다 가늘었다 하는 정도 (0 = 일정)
    swellFreq: [0.05, 0.13],       // 그 물결의 잦기 (rad/px)
    jag: 0.45,                     // 마디마다 굵기가 툭툭 튀는 정도 — 들쭉날쭉한 가장자리
    spikeRate: 0.22,               // 가장자리 가시·톱니가 돋는 잦기 (px 당)
    spikeLen: [0.8, 2.6],          // 가시 길이 (그 자리 굵기 대비) + 1 px
    tipBlob: 1.25,                 // 가지 끝 둥근 혹 크기 (그 자리 굵기 대비)
    tipBlobMin: 1.3,               // 둥근 혹 최소 반지름(px)
    width: [2.2, 6.5],             // 첫 줄기 굵기(px) — 피사체 크기에 비례해 이 범위
    thick: [0.4, 1, 2.3],         // 가지 굵기 배율 [산소 o2From · 가운데 · 100 %] — 공기(산소) ↑ → 굵어짐. 이미 자란 가지도 다시 그림
    // 자석 — 커서 둘레의 가지가 커서 쪽으로 끌려와 모임 (커서를 따라가는 점이 살짝 늦게 따라와 움직일 때 출렁임)
    magnet: {
      radius: 210,                 // 끌어당기는 반경(px, 화면)
      pull: 0.62,                  // 가운데 가까운 가지가 커서 쪽으로 다가가는 비율 (0~1) — 반응성이 높을수록 × 최대 1.4
      follow: 6,                   // 끌어당기는 점이 커서를 따라가는 빠르기(/초) — 낮을수록 늦게 따라와 크게 출렁임
      rise: 5, fall: 1.6,          // 커서를 대면 빨리 · 떼면 천천히 제자리로 (/초)
      swirl: 0.05,                 // 끌려온 가지가 살짝 비틀리며 꿈틀거리는 정도(rad)
      rings: 22,                   // 오그라드는 고리 수 (많을수록 매끈, 무거움)
    },
    minWidth: 0.55,                // 이보다 가늘어지면 멈춤
    taper: 0.0005,                 // 자란 거리(px)당 가늘어지는 비율
    branchRate: [0.25, 2.2],       // 마디 중간에 짧은 곁가지가 돋는 잦기 — 습도 humFrom ~ 100 % (습할수록 가지가 많아 빽빽)
    branchAngle: [0.35, 0.9],      // 곁가지 각도(rad)
    branchKeep: 0.94,              // 곁가지가 날 때 원가지 굵기 비율
    branchSide: 0.5,               // 곁가지 굵기 비율
    wiggle: [0.9, 2.0],            // 구불거림(rad/초) — 반응성 0 ~ 1
    sense: 9,                      // 앞을 살피는 거리(px)
    avoid: 2.8,                   // 이미 자란 자리를 피해 휘는 세기 (낮을수록 가지 사이가 좁음)
    cursorReach: 220,              // 커서가 끝을 끌어당기는 반경(px)
    cursorPull: [0, 3.2],          // 끌어당기는 세기 — 반응성 0 ~ 1
    maxTips: 1400,                 // 동시에 자라는 끝 수 상한
    budTarget: [40, 700],          // 끝이 이보다 적으면 곁눈이 돋음 — 습도 humFrom ~ 100 % (습할수록 동시에 자라는 가지가 많음)
    fullTime: 10,                  // 반응성 50 % 에서 피사체가 100 % 덮이기까지(초) — 반응성 0 % = 2배 느림, 100 % = 2배 빠름
    covR: 13,                      // 가지에서 이 거리(px) 안의 피사체는 '덮인' 것으로 셈 — 클수록 맥 사이가 넓게 비어 있음
    covRText: 3.5,
    rimCells: 4,                   // 피사체 가장자리에서 이 칸 수 안쪽 띠는 진행률에서 뺌 (테두리에 가지가 몰리지 않게)                // 친 글자 안에서는 이 거리 — 작을수록 글자 안이 빽빽
    fillStop: 1,             // 피사체가 이만큼 덮이면 곁눈을 그만 냄
    colors: {
      shade: 'rgba(190, 150, 10, 0.45)',   // 가지 그림자(테두리) — 이미 그린 가지 뒤로만
      body: '#fff25a',                     // 노란 몸통 — 명도 높게
      gloss: 'rgba(255, 255, 236, 0.95)',  // 광택
      tip: 'rgba(255, 255, 214, 0.95)',    // 자라는 끝의 빛
      film: '#f2c21c',                     // 친 글자 막 — 가지(밝은 노랑)보다 조금 짙은 금빛이라 가지가 그 위에 드러남
    },
    fadeIn: 0.6,                   // 나타나기·사라지기(초)
    maxDpr: 1.5,
    // 화면 양쪽 끝에서부터 — 보이는 화면의 왼쪽 · 오른쪽 가장자리에서 굵은 줄기가 돋아 가운데 쪽으로 퍼짐 (사진 없이도). 진행률(%)에는 사진만 셈
    sides: {
      on: true,
      reach: 0.28,                 // 퍼지는 폭 (화면 절반 대비) — 1 = 양쪽에서 와서 가운데에서 만남. 배경이 가지로 뒤덮이지 않게 가장자리에만
      seeds: 3,                    // 한쪽 가장자리에서 처음 돋는 줄기 수
      firstLen: 0.12,              // 첫 마디 길이 (보이는 화면 너비 대비)
      width: 0.8,                  // 줄기 굵기 (width 범위 안 자리, 0~1)
      time: 1.6,                   // 양쪽이 다 덮이는 시간 = fullTime × 이 값
      gap: 12,                     // 피사체 · 글자 둘레로 비워 두는 폭(px) — 양쪽 가지가 덮어 형태가 묻히지 않게
      jag: 1.7,                    // 줄마다 안쪽으로 들어오는 깊이가 다름 — 0 = 곧은 띠, 클수록 어떤 줄은 깊숙이 · 어떤 줄은 가장자리에만
    },
    // 피사체 밖으로 번지는 띠 — 자리마다 들쭉날쭉 (어떤 곳은 윤곽 안에 머물고, 어떤 곳은 이만큼까지 밖으로). 친 글자는 또렷하도록 빼고
    spill: {
      reach: 50,                   // 가장 멀리 나가는 거리(px)
      share: 0.4,                // 낮을수록 밖으로 나오지 않는 자리가 많음 (0~1)
    },
  };

  const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  // 들쭉날쭉한 두께 (0~1 근처, 부드러움) — 번지는 띠 · 양쪽 띠의 깊이
  const wav = (x, y) => 0.5 + 0.22 * Math.sin(x * 0.011 + 1.3) + 0.14 * Math.sin(x * 0.037 + y * 0.019) + 0.14 * Math.sin(y * 0.027 + 2.1) + 0.1 * Math.sin((x + y) * 0.071);
  const lerp = (r, k) => r[0] + (r[1] - r[0]) * k;

  // 빛(lx) → 어두운 정도 0~1 (lightTo 에서 0, lightMin 에서 1 — 로그 눈금, 빛 다이얼과 같음)
  DT.slimeDark = function (L) {
    const S = DT.SLIME;
    return 1 - sstep(Math.log10(S.lightMin), Math.log10(S.lightTo), Math.log10(Math.max(1e-3, L == null ? S.lightTo : L)));
  };
  // 조건 → 세기 0~1 (Life 켬 + 기온 18~28° + 습함 + 어두움 + 숨쉴 산소) — 24° 근처 · 어두울수록 셈
  DT.slimeStrength = function (vitality, T, RH, O2, L) {
    const S = DT.SLIME;
    if (!vitality || T < S.tempFrom || T >= S.tempTo || RH < S.humFrom || O2 < S.o2From || (L != null && L > S.lightTo)) return 0;
    const half = Math.max(S.tempFull - S.tempFrom, S.tempTo - S.tempFull);
    return (0.35 + 0.65 * (1 - Math.min(1, Math.abs(T - S.tempFull) / half))) * (0.35 + 0.65 * sstep(S.humFrom, S.humFull, RH)) * (0.5 + 0.5 * DT.slimeDark(L));
  };

  DT.createSlime = function (canvas, frame) {
    const S = DT.SLIME, C = S.colors;
    const ctx = canvas.getContext('2d');
    let dpr = 1, Wc = 1, Hc = 1, vz = 1, vox = 0, voy = 0, K = 0, strength = 0, react = S.reactivity, time = 0;
    // 피사체 격자 (occ px 칸): food = 매트 값, own = 자란 정도(0~255)
    let OW = 1, OH = 1, food = new Float32Array(1), own = new Uint8Array(1), maskCount = 0, ownCount = 0;
    // 덮인 자리 (가지에서 covR 안) — 진행률(%)과 '10초에 100 %' 속도 맞춤에 씀
    let fine = new Uint8Array(1);   // 칸이 친 글자 안인지
    let counted = new Uint8Array(1); // 진행률에 세는 칸인지 (피사체 안 · 가장자리 띠 제외)
    let cov = new Uint8Array(1), covCount = 0, maskList = new Int32Array(0), gt = 0, done = false;
    const seenKeys = new Set();   // 한 번이라도 씨앗을 받은 사진 · 글자 key (처음 들어온 것만 겹친 자리 밖에 씨앗)
    let feat = new Float32Array(1);   // 칸마다 사진의 명도 대비 (0~1)
    const gradCache = new WeakMap();  // 밝기 격자 → 대비 격자
    let photos = [], foodKey = '';
    const prevRect = new Map();   // 사진 key → 지난번 rect (옮겼는지 보려고)
    let tips = [];                // { x, y, a, w, d(다음 마디까지), br(갈라지기까지) }
    const nodes = [];             // 곁눈이 돋을 수 있는 마디 { x, y, a, w }
    const segs = [];              // 그린 가지 [x1, y1, x2, y2, w] — 화면 크기가 바뀌면 다시 그림
    let pend = [];                // 이번 프레임에 새로 생긴 가지
    const blobs = [];             // 가지 끝 둥근 혹 [x, y, r]
    let pendB = [];               // 이번 프레임에 새로 생긴 혹
    let ptr = null;
    // 가지 굵기 배율 (반응성) — wantK 가 바뀌면 잠깐 뒤 drawK 로 전체를 다시 그림
    const thickOf = (r) => (r < 0.5 ? S.thick[0] + (S.thick[1] - S.thick[0]) * r * 2 : S.thick[1] + (S.thick[2] - S.thick[1]) * (r - 0.5) * 2);
    // 굵기는 공기(산소 ↑ → 굵게), 가지 밀도는 습도 — Growth Rate(react)는 자라는 빠르기 · 커서 반응만
    let wantK = thickOf(0.5), drawK = wantK, wantT = 0, humK = 0.5, airK = 0.5;
    // 자석: 끌어당기는 점(x, y — 커서를 늦게 따라감, 프레임 px) · 세기(act)
    const mag = { x: 0, y: 0, act: 0, has: false };
    // 쌓아 두는 그림 (프레임 px × dpr)
    const art = document.createElement('canvas'), ag = art.getContext('2d');
    // 누끼 모양 (실제 해상도) — 그린 원형질을 이 모양으로 잘라 피사체 밖으로 번지지 않게
    const clip = document.createElement('canvas'), cg = clip.getContext('2d');
    // 누끼 모양만 (양쪽 띠 빼고) · 그 바깥 윤곽선 — 피사체 · 글자 외곽이 늘 보이게
    const mclip = document.createElement('canvas'), mg = mclip.getContext('2d');
    const outl = document.createElement('canvas'), olg = outl.getContext('2d');
    // 칸 목록 → 잘라 낼 모양 (프레임 px) — 피사체 밖으로 번지는 띠 · 양쪽 띠 (들쭉날쭉하므로 네모 대신 칸 모양)
    const spillCv = document.createElement('canvas'), sideCv = document.createElement('canvas');
    function shapeOf(list, cv) {
      const w = Math.max(1, Math.round(Wc)), h = Math.max(1, Math.round(Hc));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const g = cv.getContext('2d'); g.clearRect(0, 0, w, h); g.fillStyle = '#fff';
      for (const i of list) g.fillRect((i % OW) * S.occ - 1, ((i / OW) | 0) * S.occ - 1, S.occ + 2, S.occ + 2);
    }
    const maskImgs = new WeakMap();
    let clipKey = '', fill = new Map(), fillT = 0;
    // 화면 양쪽 띠: side[i] = 1 이면 사진 밖이지만 자랄 수 있는 칸 (보이는 화면 왼쪽 · 오른쪽에서 reach 만큼)
    let side = new Uint8Array(1), sideList = new Int32Array(0), sideTotal = 0, sideCov = 0, sideT = 0, sideDone = false, sideRect = null;

    function resize() {
      dpr = Math.min(S.maxDpr, window.devicePixelRatio || 1);
      const w0 = Wc, h0 = Hc;
      Wc = frame.clientWidth || 1; Hc = frame.clientHeight || 1;
      const w = Math.round(Wc * dpr), h = Math.round(Hc * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; clipKey = ''; }
      if (art.width !== w || art.height !== h) {
        art.width = w; art.height = h;
        // 프레임 크기가 바뀌면 가지 좌표를 비율대로 옮기고 다시 그림
        const kx = Wc / (w0 || Wc), ky = Hc / (h0 || Hc);
        if (w0 > 1 && (kx !== 1 || ky !== 1)) {
          for (const s of segs) { s[0] *= kx; s[1] *= ky; s[2] *= kx; s[3] *= ky; }
          for (const b of blobs) { b[0] *= kx; b[1] *= ky; }
          for (const t of tips) { t.x *= kx; t.y *= ky; }
          for (const n of nodes) { n.x *= kx; n.y *= ky; }
          const old = nodes.splice(0); nodeGrid = new Map(); for (const n of old) addNode(n);   // 마디 찾기 격자도 새 좌표로
        }
        pend = segs.slice(); pendB = blobs.slice();
      }
      const ow = Math.max(4, Math.ceil(Wc / S.occ)), oh = Math.max(4, Math.ceil(Hc / S.occ));
      if (ow !== OW || oh !== OH) { OW = ow; OH = oh; food = new Float32Array(OW * OH); own = new Uint8Array(OW * OH); feat = new Float32Array(OW * OH); cov = new Uint8Array(OW * OH); fine = new Uint8Array(OW * OH); counted = new Uint8Array(OW * OH); side = new Uint8Array(OW * OH); covCount = 0; sideCov = 0; foodKey = ''; }
    }
    resize();

    /*
     * 밝기 격자 { w, h, l(0~1) } → 명도 대비 격자 (0~1)
     *  소벨 기울기 크기를 두 번 흐려(끝이 조금 떨어진 곳에서도 대비를 '맡을' 수 있게) 상위 10 % 값으로 나눔
     */
    function gradOf(L) {
      let G = gradCache.get(L);
      if (G) return G;
      const w = L.w, h = L.h, l = L.l || L.m, g = new Float32Array(w * h), at = (x, y) => l[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
        const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
        g[y * w + x] = Math.hypot(gx, gy);
      }
      const t = new Float32Array(w * h);
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += g[y * w + xx]; n++; } } t[y * w + x] = s / n; }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -2; k <= 2; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += t[yy * w + x]; n++; } } g[y * w + x] = s / n; }
      }
      const sorted = Float32Array.from(g).sort(), top = sorted[Math.floor(sorted.length * 0.9)] || 1;
      for (let i = 0; i < g.length; i++) g[i] = Math.min(1, g[i] / Math.max(1e-4, top));
      G = { w, h, g };
      gradCache.set(L, G);
      return G;
    }

    const cellOf = (x, y) => { const c = (x / S.occ) | 0, r = (y / S.occ) | 0; return c < 0 || r < 0 || c >= OW || r >= OH ? -1 : r * OW + c; };
    const inMask = (x, y) => { const i = cellOf(x, y); return i >= 0 && food[i] >= 0.5; };

    /*
     * 피사체 매트 → 격자 (사진이 바뀌거나 움직일 때만)
     *  사진을 옮기거나 크기를 바꾸면 그 위에서 처음부터 다시 자람
     */
    // 매트마다 번호 (글자를 칠 때마다 새 매트가 오면 알아채도록 — 크기가 같아도)
    const maskIds = new WeakMap(); let maskSeq = 0;
    const maskId = (M) => { if (!M) return 0; let v = maskIds.get(M); if (!v) maskIds.set(M, v = ++maskSeq); return v; };
    // 프레임(CSS px) 안에서 실제로 보이는 영역 — 프레임이 화면보다 크면(cover) 잘린 바깥은 빼고 (0.5초 동안 재사용, 8px 단위)
    let vrCache = null, vrT = 0;
    function visRect() {
      const now = performance.now();
      if (vrCache && now - vrT < 500) return vrCache;
      const r = frame.getBoundingClientRect(), k = Wc / Math.max(1, r.width), cl = (v, m) => Math.min(m, Math.max(0, v));
      vrT = now;
      return (vrCache = [cl(-r.left * k, Wc), cl(-r.top * k, Hc), cl((window.innerWidth - r.left) * k, Wc), cl((window.innerHeight - r.top) * k, Hc)].map((v) => Math.round(v / 8) * 8));
    }
    function buildFood() {
      const SD = S.sides, vr = SD.on ? visRect() : null;
      const key = photos.map((p) => p.key + ':' + p.rect.map((v) => v.toFixed(1)).join(',') + ':' + maskId(p.mask)).join('|') + '#' + OW + 'x' + OH + '@' + (vr ? vr.join(',') + ':' + SD.reach : '');
      if (key === foodKey) return;
      // 사진(친 글자 말고)을 옮기거나 크기를 바꿨을 때만 처음부터 다시 — 글자를 치거나 사진·글자를 더하면 이미 자란 점균은 그대로 두고 새 자리만 자람
      let moved = false;
      if (segs.length) for (const p of photos) {
        const o = prevRect.get(p.key);
        if (!p.fine && o && (Math.abs(o[0] - p.rect[0]) > 2 || Math.abs(o[1] - p.rect[1]) > 2 || Math.abs(o[2] - p.rect[2]) > 2)) moved = true;
      }
      prevRect.clear(); for (const p of photos) prevRect.set(p.key, p.rect.slice());
      foodKey = key; clipKey = '';
      food.fill(0); feat.fill(0); fine.fill(0);
      const comps = [];
      for (const p of photos) {
        const M = p.mask; if (!M) continue;
        // 친 글자(fine)는 글자 윤곽(매트의 경계)을 대비로 → 가지가 글자 테두리를 따라 자라 글자 모양이 드러남
        const G = p.fine ? gradOf(M) : p.lum ? gradOf(p.lum) : null;
        const [rx, ry, rw, rh] = p.rect, cells = [];
        const c0 = Math.max(0, Math.floor(rx / S.occ)), c1 = Math.min(OW - 1, Math.ceil((rx + rw) / S.occ));
        const r0 = Math.max(0, Math.floor(ry / S.occ)), r1 = Math.min(OH - 1, Math.ceil((ry + rh) / S.occ));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const u = ((c + 0.5) * S.occ - rx) / rw, v = ((r + 0.5) * S.occ - ry) / rh;
          if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
          const m = M.m[Math.min(M.h - 1, (v * M.h) | 0) * M.w + Math.min(M.w - 1, (u * M.w) | 0)];
          if (m < 0.5) continue;
          const i = r * OW + c; food[i] = Math.max(food[i], m); cells.push(i); if (p.fine) fine[i] = 1;
          feat[i] = G ? G.g[Math.min(G.h - 1, (v * G.h) | 0) * G.w + Math.min(G.w - 1, (u * G.w) | 0)] : 0.5;
        }
        comps.push({ key: p.key, cells });
      }
      // 덮였는지 셀 칸: 피사체 안 — 단, 가장자리 띠(rimCells 칸)는 빼서 막바지에 테두리로 가지가 몰려 꽉 차지 않게
      const ml = [], RC = S.rimCells, inM = (x, y) => x >= 0 && y >= 0 && x < OW && y < OH && food[y * OW + x] >= 0.5;
      counted.fill(0);
      for (let i = 0; i < food.length; i++) {
        if (food[i] < 0.5) continue;
        const x = i % OW, y = (i / OW) | 0;
        if (!fine[i] && !(inM(x - RC, y) && inM(x + RC, y) && inM(x, y - RC) && inM(x, y + RC))) continue;
        ml.push(i); counted[i] = 1;
      }
      maskList = Int32Array.from(ml); maskCount = ml.length;
      covCount = 0; for (const i of ml) if (cov[i]) covCount++;
      // 사진이 움직였으면 처음부터 다시 (가지가 피사체를 벗어나지 않게)
      if (moved) { resetGrowth(); }
      // 피사체 밖으로 번지는 띠 — 피사체(글자 말고)에서의 거리가 자리마다 다른 폭보다 가까운 칸 (진행률에는 넣지 않음)
      const spillL = [];
      if (S.spill.reach > 0) {
        const N = OW * OH, d = new Float32Array(N), BIG = 1e9, SP = S.spill;
        for (let i = 0; i < N; i++) d[i] = food[i] >= 0.5 && !fine[i] ? 0 : BIG;
        for (let r = 0; r < OH; r++) for (let c = 0; c < OW; c++) {
          const i = r * OW + c; if (!d[i]) continue; let v = d[i];
          if (c > 0) v = Math.min(v, d[i - 1] + 1);
          if (r > 0) { v = Math.min(v, d[i - OW] + 1); if (c > 0) v = Math.min(v, d[i - OW - 1] + 1.414); if (c < OW - 1) v = Math.min(v, d[i - OW + 1] + 1.414); }
          d[i] = v;
        }
        for (let r = OH - 1; r >= 0; r--) for (let c = OW - 1; c >= 0; c--) {
          const i = r * OW + c; if (!d[i]) continue; let v = d[i];
          if (c < OW - 1) v = Math.min(v, d[i + 1] + 1);
          if (r < OH - 1) { v = Math.min(v, d[i + OW] + 1); if (c < OW - 1) v = Math.min(v, d[i + OW + 1] + 1.414); if (c > 0) v = Math.min(v, d[i + OW - 1] + 1.414); }
          d[i] = v;
        }
        for (let i = 0; i < N; i++) {
          if (food[i] >= 0.5 || d[i] * S.occ > SP.reach) continue;
          const x = (i % OW + 0.5) * S.occ, y = (((i / OW) | 0) + 0.5) * S.occ;
          const reach = SP.reach * Math.max(0, (wav(x * 1.6, y * 1.6) - (1 - SP.share) * 0.75) / (0.25 + SP.share * 0.75));   // 0 인 자리 = 윤곽 안에 머묾
          if (d[i] * S.occ < reach) { food[i] = 0.55; feat[i] = 0.1 + 0.25 * Math.random(); spillL.push(i); }
        }
      }
      shapeOf(spillL, spillCv);
      // 화면 양쪽 띠 — 사진 밖 칸도 자랄 자리로 (대비는 낮게 · 조금씩 달라 가지가 고르게 퍼짐)
      side.fill(0); sideRect = null;
      const sl = [];
      if (vr && vr[2] - vr[0] > 40 && vr[3] - vr[1] > 40) {
        const band = (vr[2] - vr[0]) / 2 * SD.reach;
        sideRect = [vr[0], vr[1], vr[2], vr[3], band];
        // 피사체 · 글자 둘레 gap 안 칸은 비움 (가로 → 세로 최대값 퍼뜨리기)
        const G = Math.ceil(SD.gap / S.occ), near = new Uint8Array(OW * OH), tmp = new Uint8Array(OW * OH);
        for (let r = 0; r < OH; r++) for (let c = 0; c < OW; c++) if (food[r * OW + c] >= 0.5) for (let k = Math.max(0, c - G); k <= Math.min(OW - 1, c + G); k++) tmp[r * OW + k] = 1;
        for (let c = 0; c < OW; c++) for (let r = 0; r < OH; r++) if (tmp[r * OW + c]) for (let k = Math.max(0, r - G); k <= Math.min(OH - 1, r + G); k++) near[k * OW + c] = 1;
        // 줄마다 안쪽으로 들어오는 깊이가 다름 (왼쪽 · 오른쪽 따로) + 가장자리 결이 들쭉날쭉 → 어떤 곳은 안까지 침범, 어떤 곳은 가장자리에만
        const depth = (y, s, x) => band * Math.max(0.12, 1 + SD.jag * (wav(s * 977 + 40, y * 0.9) - 0.5) * 2 + 0.35 * (wav(x * 2.1, y * 2.1) - 0.5));
        for (let r = 0; r < OH; r++) for (let c = 0; c < OW; c++) {
          const x = (c + 0.5) * S.occ, y = (r + 0.5) * S.occ;
          if (y < vr[1] || y > vr[3] || x < vr[0] || x > vr[2] || (x > vr[0] + depth(y, 0, x) && x < vr[2] - depth(y, 1, x))) continue;
          const i = r * OW + c;
          if (food[i] >= 0.5 || near[i]) continue;   // 사진 칸은 사진 몫 · 그 둘레는 비워 둠
          food[i] = 1; feat[i] = 0.15 + 0.3 * Math.random(); side[i] = 1; sl.push(i);
        }
      }
      shapeOf(sl, sideCv);
      sideList = Int32Array.from(sl); sideTotal = sl.length;
      sideCov = 0; for (const i of sl) if (cov[i]) sideCov++;
      if (sideTotal && !sideCov) seedSides();
      if (sideDone && sideCov < sideTotal * 0.97) sideDone = false;
      // 아직 점균이 하나도 닿지 않은 조각(새 사진 · 새로 친 글자)마다 무게중심에서 씨앗 — 이미 자란 조각은 건드리지 않음
      //  처음 들어온 사진 · 글자는 이미 자란 자리와 겹쳐도, 아직 안 덮인 부분마다 씨앗 (새로 불러온 사진에도 곧장 자라게)
      let fresh = false;
      for (const p of comps) {
        if (!p.cells.length) continue;
        const isNew = !seenKeys.has(p.key); seenKeys.add(p.key);
        for (const comp of components(p.cells)) {
          if (!comp.some((c) => cov[c])) { seed(comp); fresh = true; continue; }
          if (!isNew) continue;
          for (const part of components(comp.filter((c) => !cov[c]))) if (part.length >= comp.length * 0.05) { seed(part); fresh = true; }
        }
      }
      if (done && covRatio() < 0.98) done = false;   // 새로 더해진 자리가 있으면 다시 채움
      if (fresh && gt > covRatio() * fullTime()) gt = covRatio() * fullTime();   // 새 자리는 처음부터 자라는 시간을 셈 (한꺼번에 메워지지 않게)
    }
    // 이어진 조각 나누기 (4방향)
    function components(cells) {
      const set = new Map(cells.map((c, k) => [c, k])), seen = new Uint8Array(cells.length), out = [];
      for (let k0 = 0; k0 < cells.length; k0++) {
        if (seen[k0]) continue;
        const comp = [cells[k0]]; seen[k0] = 1;
        for (let q = 0; q < comp.length; q++) {
          const c = comp[q], x = c % OW, y = (c / OW) | 0;
          for (const nb of [x > 0 ? c - 1 : -1, x < OW - 1 ? c + 1 : -1, y > 0 ? c - OW : -1, y < OH - 1 ? c + OW : -1]) {
            const kk = nb >= 0 ? set.get(nb) : undefined;
            if (kk !== undefined && !seen[kk]) { seen[kk] = 1; comp.push(nb); }
          }
        }
        if (comp.length >= 10) out.push(comp);
      }
      return out;
    }
    // 조각 하나에 씨앗: 무게중심에서 가장 가까운 칸에서 굵은 줄기 몇 가닥
    function seed(comp) {
      let mx = 0, my = 0; for (const c of comp) { mx += c % OW; my += (c / OW) | 0; } mx /= comp.length; my /= comp.length;
      let best = comp[0], bd = 1e18;
      for (const c of comp) { const d = (c % OW - mx) ** 2 + (((c / OW) | 0) - my) ** 2; if (d < bd) { bd = d; best = c; } }
      const x = (best % OW + 0.5) * S.occ, y = (((best / OW) | 0) + 0.5) * S.occ;
      const size = Math.sqrt(comp.length) * S.occ;   // 조각 크기(px)
      const w = Math.min(S.width[1], Math.max(S.width[0], size / 60));
      const n = Math.round(lerp(S.seedTips, Math.random()));
      const L0 = Math.max(10, size * S.firstLen);     // 첫 마디 길이
      sprout(x, y, n, w, 0, L0);
      // 대비가 가장 센 자리 몇 곳에서도 (서로 떨어진 곳으로)
      const byFeat = comp.slice().sort((a, b) => feat[b] - feat[a]), picked = [];
      for (const c of byFeat) {
        if (picked.length >= S.featSeeds || feat[c] < 0.5) break;
        const cx = c % OW, cy = (c / OW) | 0;
        if (picked.some((q) => Math.hypot(q[0] - cx, q[1] - cy) < Math.sqrt(comp.length) * 0.25)) continue;
        picked.push([cx, cy]);
        sprout((cx + 0.5) * S.occ, (cy + 0.5) * S.occ, 3, w * 0.7, 1, L0);
      }
    }
    // 화면 왼쪽 · 오른쪽 가장자리에서 가운데 쪽으로 굵은 줄기 (출발점을 화면 밖에 두어 바깥 → 안쪽으로 흘러감)
    function seedSides() {
      const SD = S.sides, [x0, y0, x1, y1] = sideRect, H = y1 - y0, L0 = Math.max(20, (x1 - x0) * SD.firstLen), w = lerp(S.width, SD.width);
      for (const dir of [1, -1]) {
        const x = dir > 0 ? x0 + S.occ : x1 - S.occ;
        for (let k = 0; k < SD.seeds && tips.length < S.maxTips; k++) {
          const y = y0 + H * (k + 0.2 + Math.random() * 0.6) / SD.seeds;
          const a = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9;
          tips.push(newTip(x, y, a, w * (0.75 + Math.random() * 0.4), 0, L0 * (0.8 + Math.random() * 0.4), [x - dir * 300, y]));
        }
      }
    }
    function sprout(x, y, n, w, gen, L0) {
      const a0 = Math.random() * 6.2832;
      for (let k = 0; k < n && tips.length < S.maxTips; k++) {
        const a = a0 + k * 6.2832 / n + (Math.random() - 0.5) * 0.6;
        tips.push(newTip(x, y, a, w * (0.75 + Math.random() * 0.35), gen, L0, [x, y]));
      }
    }
    // gen = 세대 (0 = 줄기), L0 = 이 나무의 첫 마디 길이 — 마디 길이 = L0 × lenDecay^gen
    const segLen = (gen, L0) => L0 * Math.pow(S.lenDecay, gen) * (0.7 + Math.random() * 0.6);
    // ph·fq = 굵기 물결 (가지를 따라 굵었다 가늘었다), 구간마다 조금씩 다른 박자
    // o = 출발점 [x, y] — 그 바깥쪽으로 흘러가려 함 (방사형 맥)
    const newTip = (x, y, a, w, gen = 2, L0 = 40, o = null) => ({ x, y, a, w, d: 0, br: nextBranch(), q: [], gen, L0, life: segLen(gen, L0), o,
      ph: Math.random() * 6.2832, fq: lerp(S.swellFreq, Math.random()), fq2: lerp(S.swellFreq, Math.random()) * 2.3 });
    // 지금 자리의 그려질 굵기 (기본 굵기 × 물결)
    const drawW = (t) => t.w * Math.max(0.3, 1 + S.swell * (0.7 * Math.sin(t.d * t.fq + t.ph) + 0.3 * Math.sin(t.d * t.fq2 + t.ph * 1.7)));
    // 가지 끝 (더 갈라지지 않고 끝난 곳) — 둥근 혹
    function endBlob(t) { pendB.push([t.x, t.y, Math.max(S.tipBlobMin, drawW(t) * S.tipBlob + 0.5)]); blobs.push(pendB[pendB.length - 1]); }
    // 마디 끝: Y 자로 갈라짐 (두 가지는 갈라진 각도의 양쪽으로, 하나는 조금 굵게)
    function fork(t) {
      if (t.gen >= S.maxGen) return;
      const spread = lerp(S.forkAngle, Math.random()), k = Math.random() < 0.5 ? 1 : -1;
      const n = t.gen === 0 && Math.random() < 0.4 ? 3 : 2;
      for (let j = 0; j < n && tips.length < S.maxTips; j++) {
        const off = n === 2 ? (j ? 1 : -1) * spread / 2 * (0.75 + Math.random() * 0.5) : (j - 1) * spread / 2;
        const w = t.w * (j === 0 ? S.forkWidth[1] : S.forkWidth[0]);
        if (w < S.minWidth) continue;
        tips.push(newTip(t.x, t.y, t.a + off * k, w, t.gen + 1, t.L0, t.o));
        t.forked = true;   // 실제로 갈라졌을 때만 (아니면 끝에 둥근 혹)
      }
    }
    // 자란 자리 표시는 끝에서 LAG px 뒤에서 함 (방금 지나온 자기 자리를 '다른 가지'로 착각해 멈추지 않게)
    const LAG = 13;
    function lagMark(t, flush) {
      const q = t.q;
      while (q.length && (flush || t.d - q[0][3] > LAG)) { const p = q.shift(); mark(p[0], p[1], p[2]); }
    }
    const nextBranch = () => 25 + Math.random() * 60; // 갈라지기까지 자랄 거리(px) — 반응성으로 빠르기가 바뀜

    // 앞쪽 한 지점의 점수: 피사체 밖 = −1, 이미 자란 자리일수록 낮음
    function score(x, y) {
      const i = cellOf(x, y);
      if (i < 0 || food[i] < 0.5) return -1;
      return 1 + S.featPull * feat[i] - S.avoid * own[i] / 255 + (Math.random() - 0.5) * 0.15;   // 대비가 센 쪽 · 빈 쪽으로
    }

    function mark(x, y, w) {
      const r = Math.max(1, Math.ceil((w * 0.5 + 1.5) / S.occ)), c0 = (x / S.occ) | 0, r0 = (y / S.occ) | 0;
      for (let yy = r0 - r; yy <= r0 + r; yy++) for (let xx = c0 - r; xx <= c0 + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= OW || yy >= OH) continue;
        const i = yy * OW + xx, d = Math.hypot(xx - c0, yy - r0) / (r + 0.5);
        if (d > 1) continue;
        const v = Math.min(255, own[i] + Math.round(255 * (1 - d) * 0.9));
        if (own[i] < 128 && v >= 128 && food[i] >= 0.5) ownCount++;
        own[i] = v;
      }
      // 덮인 자리 (더 넓게) — 친 글자 안은 좁게 세어 더 빽빽이 채움 (글자 모양이 점균만으로 또렷하게)
      const ci0 = r0 * OW + c0, R2 = Math.ceil((ci0 >= 0 && ci0 < fine.length && fine[ci0] ? S.covRText : S.covR) / S.occ);
      for (let yy = r0 - R2; yy <= r0 + R2; yy++) for (let xx = c0 - R2; xx <= c0 + R2; xx++) {
        if (xx < 0 || yy < 0 || xx >= OW || yy >= OH || (xx - c0) ** 2 + (yy - r0) ** 2 > R2 * R2) continue;
        const i = yy * OW + xx;
        if (!cov[i]) { cov[i] = 1; if (counted[i]) covCount++; if (side[i]) sideCov++; }
      }
    }
    const fullTime = () => S.fullTime * Math.pow(2, (0.5 - react) * 2);
    const covRatio = () => (maskCount ? covCount / maskCount : 0);
    // 속도 맞춤: 덮인 정도가 '지금쯤 덮였어야 할 정도'(경과 시간 / fullTime)에 맞도록 끝에서 뒤처진 빈자리에 새 끝을 놓음
    function fillIn() {
      if (maskList.length && !done) fillList(maskList, Math.min(1, gt / fullTime()), covRatio(), gt > fullTime() * 0.7);
      if (sideTotal && !sideDone) { const FT = fullTime() * S.sides.time; fillList(sideList, Math.min(1, sideT / FT), sideCov / sideTotal, sideT > FT * 0.7); }
    }
    function fillList(list, target, c, late) {
      let want = Math.ceil(Math.max(0, target - c) * 40) + (late ? 6 : 0);
      const cap = Math.round(lerp(S.budTarget, humK) * 1.5);   // 한꺼번에 너무 많이 몰리지 않게
      for (let k = 0; k < 400 && want > 0 && tips.length < cap; k++) {
        const i = list[(Math.random() * list.length) | 0];
        if (cov[i]) continue;
        // 대비가 센 빈자리를 먼저 (약한 곳은 덜 뽑힘)
        if (Math.random() > 0.35 + feat[i]) continue;
        const cx = (i % OW + 0.5) * S.occ, cy = (((i / OW) | 0) + 0.5) * S.occ;
        // 가장 가까운 기존 가지 마디에서 그 빈자리 쪽으로 새 잔가지 (끊긴 막대가 아니라 나무에 이어지게)
        const n = nearestNode(cx, cy);
        if (n) {
          const dist = Math.hypot(cx - n.x, cy - n.y), t = newTip(n.x, n.y, Math.atan2(cy - n.y, cx - n.x), Math.max(S.minWidth * 2, n.w * 0.7), Math.max(S.maxGen - 2, (n.gen || 0) + 1), n.L0 || 40, n.o);   // 빈자리 잔가지는 거의 갈라지지 않음 (한곳에 부채꼴로 몰리지 않게)
          t.life = dist + 8 + Math.random() * 14; t.target = [cx, cy];
          tips.push(t);
        } else tips.push(newTip(cx, cy, Math.random() * 6.2832, Math.max(S.minWidth * 2.5, lerp(S.width, 0.2)), 2, 44));
        want--;
      }
    }
    // 마디 찾기용 격자 (NG px 칸마다 마디 목록)
    const NG = 24;
    let nodeGrid = new Map();
    function addNode(n) {
      nodes.push(n);
      const key = ((n.x / NG) | 0) + ',' + ((n.y / NG) | 0);
      let b = nodeGrid.get(key); if (!b) nodeGrid.set(key, b = []); b.push(n);
    }
    function nearestNode(x, y) {
      const bx = (x / NG) | 0, by = (y / NG) | 0;
      let best = null, bd = 1e18;
      for (let r = 0; r <= 12; r++) {
        for (let yy = by - r; yy <= by + r; yy++) for (let xx = bx - r; xx <= bx + r; xx++) {
          if (Math.max(Math.abs(xx - bx), Math.abs(yy - by)) !== r) continue;
          const b = nodeGrid.get(xx + ',' + yy); if (!b) continue;
          for (const n of b) { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = n; } }
        }
        if (best && Math.sqrt(bd) < (r + 0.5) * NG) break;   // 이 고리 안에서 찾은 게 확실히 가장 가까움
      }
      return best;
    }

    // 끝 하나를 len px 만큼 자라게 함 → 계속 살아 있으면 true
    function grow(t, len, dt) {
      const sp = S.sense, SA = 0.55;
      // 앞·왼쪽·오른쪽을 살펴 빈 피사체 쪽으로
      const f = score(t.x + Math.cos(t.a) * sp, t.y + Math.sin(t.a) * sp);
      const l = score(t.x + Math.cos(t.a - SA) * sp, t.y + Math.sin(t.a - SA) * sp);
      const r = score(t.x + Math.cos(t.a + SA) * sp, t.y + Math.sin(t.a + SA) * sp);
      let turn = (r - l) * 1.6;
      if (f < 0 && l < 0 && r < 0) turn = (Math.random() < 0.5 ? -1 : 1) * 3;   // 막다른 곳 → 크게 돎
      else if (f < 0) turn += (l > r ? -1.5 : 1.5);
      // 방사형: 출발점에서 바깥쪽으로 흘러가려 함 (레퍼런스처럼 가운데에서 사방으로 뻗는 맥)
      if (t.o && !t.target) {
        const ox = t.x - t.o[0], oy = t.y - t.o[1];
        if (ox * ox + oy * oy > 36) { let da = Math.atan2(oy, ox) - t.a; da = Math.atan2(Math.sin(da), Math.cos(da)); turn += da * S.radial; }
      }
      // 구불거림 + 커서 쪽으로
      turn += (Math.random() - 0.5) * 2 * lerp(S.wiggle, react) + Math.sin(time * 1.7 + t.w * 9) * 0.4;
      if (t.target) {   // 빈자리를 메우러 가는 잔가지: 그쪽으로 휨 (거의 닿으면 그만 휨 — 갈고리처럼 말리지 않게)
        const tx = t.target[0] - t.x, ty = t.target[1] - t.y;
        if (tx * tx + ty * ty < 64) { t.target = null; t.life = Math.min(t.life, 6); }
        else { let da = Math.atan2(ty, tx) - t.a; da = Math.atan2(Math.sin(da), Math.cos(da)); turn += Math.max(-2.5, Math.min(2.5, da * 3)); }
      }
      if (ptr) {
        const dx = ptr[0] - t.x, dy = ptr[1] - t.y, dist = Math.hypot(dx, dy);
        if (dist < S.cursorReach && dist > 2) {
          let da = Math.atan2(dy, dx) - t.a; da = Math.atan2(Math.sin(da), Math.cos(da));
          turn += da * lerp(S.cursorPull, react) * (1 - dist / S.cursorReach);
        }
      }
      t.a += turn * dt;
      const nx = t.x + Math.cos(t.a) * len, ny = t.y + Math.sin(t.a) * len;
      if (!inMask(nx, ny)) {
        // 가장자리: 잠깐 방향만 틀고, 몇 번 이어지면 멈춤
        // (가장자리를 따라 계속 그어 테두리가 꽉 차지 않게, 두 번 막히면 그 자리에서 끝남)
        t.a += (Math.random() < 0.5 ? -1 : 1) * 0.9; t.stuck = (t.stuck || 0) + 1;
        return t.stuck < 2;
      }
      t.stuck = 0;
      // 이미 굵게 자란 자리로 들어가면(다른 가지와 부딪힘) 대개 멈춤
      const ci = cellOf(nx, ny);
      if (own[ci] > 230 && t.d > 6 && !t.target && Math.random() < 0.18) return false;
      // 들쭉날쭉한 가장자리: 마디마다 굵기가 툭툭 튀고, 이따금 옆으로 짧은 가시·톱니
      const dw = drawW(t) * (1 + S.jag * (Math.random() - 0.5));
      pend.push([t.x, t.y, nx, ny, dw]); segs.push(pend[pend.length - 1]);
      if (Math.random() < S.spikeRate * len) {
        const sa = t.a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.9), sl = dw * 0.5 + 1 + dw * lerp(S.spikeLen, Math.random());
        pend.push([nx, ny, nx + Math.cos(sa) * sl, ny + Math.sin(sa) * sl, Math.max(0.6, dw * 0.42)]); segs.push(pend[pend.length - 1]);
      }
      t.x = nx; t.y = ny; t.d += len;
      t.q.push([nx, ny, t.w, t.d]); lagMark(t, false);
      t.w *= Math.exp(-S.taper * len);
      if (t.w < S.minWidth) return false;
      // 마디 끝 → Y 자로 갈라지고 이 끝은 끝남
      t.life -= len;
      if (t.life <= 0) { fork(t); return false; }
      // 마디 기록 (곁눈 자리)
      if (t.d - (t.lastNode || 0) > 10) { t.lastNode = t.d; addNode({ x: t.x, y: t.y, a: t.a, w: t.w, gen: t.gen, L0: t.L0, o: t.o }); }
      // 갈라짐
      t.br -= len * lerp(S.branchRate, humK) / 1.2 * (0.3 + S.featBranch * feat[ci]);   // 대비가 센 곳에서 더 자주 갈라짐
      if (t.br <= 0 && tips.length < S.maxTips) {
        t.br = nextBranch();
        const side = Math.random() < 0.5 ? -1 : 1, ang = lerp(S.branchAngle, Math.random());
        tips.push(newTip(t.x, t.y, t.a + side * ang, t.w * S.branchSide, Math.min(S.maxGen, t.gen + 2), t.L0, t.o));   // 짧은 곁가지
        t.w *= S.branchKeep; t.a -= side * ang * 0.25;
      }
      return true;
    }

    // 끝이 모자라면 이미 자란 마디 옆구리에서 곁눈
    function bud() {
      const target = Math.round(lerp(S.budTarget, humK));   // 습도 ↑ → 끝이 많아져 더 많이 갈라짐
      const photoLeft = maskCount && !done && covRatio() < S.fillStop, sideLeft = sideTotal && !sideDone;
      if (tips.length >= target || !nodes.length || (!photoLeft && !sideLeft)) return;   // 사진 · 양쪽 띠가 다 덮이면 더 돋지 않음
      for (let k = 0; k < 24 && tips.length < target; k++) {
        // 마디 몇 개 중 대비가 가장 센 곳에서 돋음
        let n = null, bf = -1;
        for (let j = 0; j < 4; j++) { const c = nodes[(Math.random() * nodes.length) | 0], ci = cellOf(c.x, c.y), f = ci >= 0 ? feat[ci] : 0; if (f > bf) { bf = f; n = c; } }
        const side = Math.random() < 0.5 ? -1 : 1;
        const a = n.a + side * (0.7 + Math.random() * 0.8), w = Math.max(S.minWidth * 1.4, n.w * 0.55);
        if (score(n.x + Math.cos(a) * S.sense, n.y + Math.sin(a) * S.sense) > 0.4) tips.push(newTip(n.x, n.y, a, w, Math.min(S.maxGen - 1, (n.gen || 0) + 2), n.L0 || 40, n.o));
      }
    }

    // 새 가지를 쌓아 두는 그림에 그림 (그림자 → 몸통 → 광택, 세 겹을 한꺼번에 — 이음매 없이)
    function paint() {
      if (!pend.length && !pendB.length) return;
      ag.setTransform(dpr, 0, 0, dpr, 0, 0);
      ag.lineCap = 'round'; ag.lineJoin = 'round';
      // 가지(선) + 끝 혹(원)을 같은 겹 순서로
      //  굵기가 같은(0.25 px 단위) 가지끼리 한 경로로 묶어 한 번에 그림 — 다 자란 점균을 새 굵기로 다시 그릴 때 수만 번 stroke 하지 않게
      const pass = (style, wk, add, ox, oy) => {
        ag.strokeStyle = style;
        const byW = new Map();
        for (const s of pend) {
          const w = Math.max(0.25, Math.round((s[4] * drawK * wk + add) * 4) / 4);
          let g = byW.get(w); if (!g) byW.set(w, (g = []));
          g.push(s);
        }
        for (const [w, g] of byW) {
          ag.lineWidth = w; ag.beginPath();
          for (const s of g) { ag.moveTo(s[0] + ox * s[4], s[1] + oy * s[4]); ag.lineTo(s[2] + ox * s[4], s[3] + oy * s[4]); }
          ag.stroke();
        }
        if (!pendB.length) return;
        ag.fillStyle = style; ag.beginPath();
        for (const b of pendB) { const r = b[2] * drawK * wk + add / 2, x = b[0] + ox * b[2] * 2, y = b[1] + oy * b[2] * 2; ag.moveTo(x + r, y); ag.arc(x, y, r, 0, 6.2832); }
        ag.fill();
      };
      ag.globalCompositeOperation = 'destination-over';   // 그림자는 이미 그린 가지 '뒤'로 (노란 몸통을 덮어 탁해지지 않게)
      pass(C.shade, 1, 0.9, 0.08, 0.16);   // 아래로 살짝 — 도톰하게 솟아 보이게
      ag.globalCompositeOperation = 'source-over';
      pass(C.body, 1, 0, 0, 0);
      pass(C.gloss, 0.3, 0, -0.17, -0.2);
      pend = []; pendB = [];
    }

    // 누끼 모양 합집합 (캔버스 해상도, 확대 반영) — 바뀔 때만 다시
    function maskImg(M) {
      let c = maskImgs.get(M);
      if (!c) {
        c = document.createElement('canvas'); c.width = M.w; c.height = M.h;
        const g = c.getContext('2d'), im = g.createImageData(M.w, M.h);
        for (let i = 0; i < M.w * M.h; i++) { im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (M.m[i] - 0.3) / 0.4)) * 255); }
        g.putImageData(im, 0, 0);
        maskImgs.set(M, c);
      }
      return c;
    }
    // 매트를 노란 몸통 색으로 칠한 그림 (친 글자 막)
    const tintImgs = new WeakMap();
    function tinted(M) {
      let c = tintImgs.get(M);
      if (!c) {
        const m = maskImg(M);
        c = document.createElement('canvas'); c.width = m.width; c.height = m.height;
        const g = c.getContext('2d');
        g.drawImage(m, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = C.film; g.fillRect(0, 0, c.width, c.height);
        tintImgs.set(M, c);
      }
      return c;
    }
    function updateClip() {
      const key = foodKey + '|' + vz + ',' + vox + ',' + voy + '|' + canvas.width + 'x' + canvas.height;
      if (key === clipKey) return;
      clipKey = key;
      const W = canvas.width, H = canvas.height;
      for (const c of [clip, mclip, outl]) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, W, H);
      mg.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);
      for (const p of photos) if (p.mask) mg.drawImage(maskImg(p.mask), p.rect[0], p.rect[1], p.rect[2], p.rect[3]);
      mg.setTransform(1, 0, 0, 1, 0, 0);
      // 윤곽선: 누끼 모양을 사방으로 조금씩 밀어 겹친 것(부풀린 모양) − 원래 모양 = 바깥 테두리 → 노란 몸통 색
      olg.setTransform(1, 0, 0, 1, 0, 0); olg.clearRect(0, 0, W, H);
      const r = S.outline * dpr;
      if (r > 0) {
        for (let k = 0; k < 12; k++) olg.drawImage(mclip, Math.cos(k * 0.5236) * r, Math.sin(k * 0.5236) * r);
        olg.globalCompositeOperation = 'destination-out'; olg.drawImage(mclip, 0, 0);
        olg.globalCompositeOperation = 'source-in'; olg.fillStyle = C.body; olg.fillRect(0, 0, W, H);
        olg.globalCompositeOperation = 'source-over';
      }
      cg.setTransform(1, 0, 0, 1, 0, 0); cg.clearRect(0, 0, W, H);
      cg.drawImage(mclip, 0, 0);
      cg.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);
      // 화면 양쪽 띠 (가지가 띠 안에서만 자라므로 네모로 잘라도 됨)
      if (sideTotal && sideRect) {
        cg.drawImage(sideCv, 0, 0);   // 들쭉날쭉한 양쪽 띠 (칸 모양)
        // 피사체 · 글자 둘레 gap 은 잘라 냄 (양쪽 가지의 굵은 획이 넘어와 윤곽을 덮지 않게) → 누끼 모양은 다시 채움
        cg.setTransform(1, 0, 0, 1, 0, 0);
        cg.globalCompositeOperation = 'destination-out';
        const gr = S.sides.gap * dpr * vz;
        for (const f of [1, 0.5]) for (let k = 0; k < 12; k++) cg.drawImage(mclip, Math.cos(k * 0.5236) * gr * f, Math.sin(k * 0.5236) * gr * f);
        cg.globalCompositeOperation = 'source-over';
        cg.drawImage(mclip, 0, 0);
        cg.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);
      }
      cg.drawImage(spillCv, 0, 0);   // 피사체 밖으로 번지는 띠 (gap 을 자른 뒤에)
    }

    /*
     * 자석 — 다 그린 화면에서 커서 둘레 원을 떠서, 가운데로 오그라들게(핀치) 다시 붙임
     *  안쪽 고리일수록 더 작게 줄여 붙이므로 바깥의 가지가 커서 쪽으로 끌려 들어오는 것처럼 보임 (반경 끝은 그대로 → 이음매 없음)
     *  가지를 하나하나 다시 그리지 않으므로 가지가 아주 많아도 가벼움
     */
    const magSrc = document.createElement('canvas'), msg = magSrc.getContext('2d');
    function drawMagnet() {
      const G = S.magnet, R = G.radius * dpr, cx = (mag.x * vz + vox) * dpr, cy = (mag.y * vz + voy) * dpr, D = Math.ceil(R * 2);
      if (magSrc.width !== D || magSrc.height !== D) { magSrc.width = magSrc.height = D; } else msg.clearRect(0, 0, D, D);
      msg.drawImage(canvas, cx - R, cy - R, D, D, 0, 0, D, D);
      const p = Math.min(0.9, G.pull * (0.6 + 0.8 * react) * mag.act), N = G.rings, t = performance.now() / 1000;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let k = N; k >= 1; k--) {
        const u = 1 - k / N, s = 1 - p * u * u, rp = R * k / N * s;   // 원래 반경 R·k/N 의 고리가 rp 로 오그라듦
        const rot = G.swirl * mag.act * u * Math.sin(t * 2.3 + k * 0.7);   // 고리마다 살짝 다르게 비틀려 살아 움직이듯
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, rp, 0, 6.2832);
        ctx.globalCompositeOperation = 'destination-out'; ctx.fill(); ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.arc(cx, cy, rp + 1.5 * dpr, 0, 6.2832);   // 지운 것보다 조금 넓게 붙여 고리 사이 이음매(가는 선)가 남지 않게
        ctx.clip();
        ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(s, s);
        ctx.drawImage(magSrc, -R, -R);
        ctx.restore();
      }
      ctx.restore();
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (K < 0.003 || (!photos.length && !sideTotal)) return;
      // 친 글자: 글자 모양 그대로 반투명한 노란 막을 먼저 깔아 글자가 또렷이 읽히게
      ctx.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);
      ctx.globalAlpha = K * S.textFilm;
      if (S.textFilm > 0) for (const p of photos) if (p.fine && p.mask) ctx.drawImage(tinted(p.mask), p.rect[0], p.rect[1], p.rect[2], p.rect[3]);
      ctx.globalAlpha = K;
      ctx.setTransform(vz, 0, 0, vz, dpr * vox, dpr * voy);
      ctx.drawImage(art, 0, 0);
      // 자라는 끝: 살짝 빛나는 둥근 머리
      ctx.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);
      ctx.fillStyle = C.tip;
      ctx.beginPath();
      for (const t of tips) { const r = drawW(t) * drawK * 0.62 + 0.6; ctx.moveTo(t.x + r, t.y); ctx.arc(t.x, t.y, r, 0, 6.2832); }
      ctx.fill();
      // 누끼 모양으로 잘라 냄
      updateClip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(clip, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      // 자석: 커서 둘레 가지가 커서 쪽으로 끌려옴 (누끼 밖으로도 늘어날 수 있게 잘라 낸 뒤에)
      if (mag.act > 0.005 && (segs.length || blobs.length)) drawMagnet();
      // 피사체 · 글자 윤곽선 (잘라 낸 바깥에 — 원래 사진이 사라져도 형태가 보이게)
      if (S.outline > 0) { ctx.globalAlpha = K * S.outlineA; ctx.drawImage(outl, 0, 0); ctx.globalAlpha = 1; }
    }

    // 사진마다 덮인 정도 (그만큼 원래 사진을 지움)
    function measureFill() {
      fill = new Map();
      for (const p of photos) {
        const [rx, ry, rw, rh] = p.rect;
        const c0 = Math.max(0, Math.floor(rx / S.occ)), c1 = Math.min(OW - 1, Math.ceil((rx + rw) / S.occ));
        const r0 = Math.max(0, Math.floor(ry / S.occ)), r1 = Math.min(OH - 1, Math.ceil((ry + rh) / S.occ));
        let tot = 0, on = 0;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const i = r * OW + c; if (food[i] < 0.5) continue; tot++; if (own[i] >= 128) on++; }
        fill.set(p.key, tot ? on / tot : 0);
      }
    }

    function resetGrowth() {
      tips = []; nodes.length = 0; nodeGrid = new Map(); segs.length = 0; pend = []; blobs.length = 0; pendB = []; own.fill(0); ownCount = 0; fill = new Map();      cov.fill(0); covCount = 0; gt = 0; done = false; sideCov = 0; sideT = 0; sideDone = false;
      ag.setTransform(1, 0, 0, 1, 0, 0); ag.clearRect(0, 0, art.width, art.height);
    }

    return {
      canvas,
      resize() { resize(); paint(); draw(); },
      setView(z, ox, oy) { vz = z; vox = ox; voy = oy; },
      pointer(x, y) { ptr = x == null ? null : [x, y]; },
      // ps: [{ key, rect: 프레임 px, mask }] — 누끼 사진 + 친 글자
      syncPhotos(ps) { photos = ps.filter((p) => p.mask); },
      // 반응성 (0~1)
      get reactivity() { return react; },
      setReactivity(v) { react = Math.min(1, Math.max(0, v)); },   // Growth Rate — 자라는 빠르기 (굵기는 공기)
      // 클릭한 자리(프레임 px)가 피사체 안이면 그 자리에서 줄기가 뻗어 나감. 밖이면 아무 일 없음 (false)
      spawn(x, y) {
        buildFood();
        if (!inMask(x, y)) return false;
        sprout(x, y, Math.round(lerp(S.clickTips, react)), lerp([2.5, 4.5], react), 0, lerp([30, 70], react));
        return true;
      },
      // T · RH · O2 · L = 켜질지 정하는 값, dRH · dO2 = 다이얼 값 (가지 밀도 · 굵기 — 없으면 RH · O2). Lab mode 에서는 따로 옴 (dL 은 지금 쓰지 않음)
      update(dt, vitality, T, RH, O2, L, dRH, dL, dO2) {
        strength = DT.slimeStrength(vitality, T, RH, O2, L);
        humK = sstep(S.humFrom, 100, dRH == null ? RH : dRH);   // 습도 ↑ → 가지가 많아져 빽빽 (켜지는 구간 전체)
        const o2 = dO2 == null ? O2 : dO2;
        const ak = Math.round(Math.max(0, Math.min(1, (o2 - S.o2From) / (100 - S.o2From))) * 20) / 20;   // 공기(산소) ↑ → 굵게 (5 % 단위로 — 다시 그리는 일이 잦지 않게)
        if (ak !== airK) { airK = ak; wantK = thickOf(ak); wantT = performance.now(); }
        const on = strength > 0;
        if (dt > 0) K += Math.sign((on ? 1 : 0) - K) * Math.min(Math.abs((on ? 1 : 0) - K), dt / S.fadeIn);
        // 공기 → 굵기: 다이얼이 0.25초 멈추면 이미 자란 가지 전체를 새 굵기로 다시 그림 (돌리는 동안 매번 다시 그리면 렉)
        if (Math.abs(wantK - drawK) > 0.005 && performance.now() - wantT > 250) {
          drawK = wantK;
          ag.setTransform(1, 0, 0, 1, 0, 0); ag.clearRect(0, 0, art.width, art.height);
          pend = segs.slice(); pendB = blobs.slice();
        }
        // 자석: 끌어당기는 점이 커서를 늦게 따라감 (움직이면 가지가 출렁이며 따라옴) · 커서가 나가면 천천히 제자리로
        if (dt > 0) {
          const G = S.magnet;
          if (ptr) {
            if (!mag.has) { mag.x = ptr[0]; mag.y = ptr[1]; mag.has = true; }
            const k = 1 - Math.exp(-G.follow * dt);
            mag.x += (ptr[0] - mag.x) * k; mag.y += (ptr[1] - mag.y) * k;
            mag.act = Math.min(1, mag.act + dt * G.rise);
          } else mag.act = Math.max(0, mag.act - dt * G.fall);
        }
        if (on && dt > 0) {
          time += dt;
          buildFood();
          if (maskCount && !done) gt += dt;   // 실제 시간 — 조건이 맞으면 fullTime 초에 100 %
          if (sideTotal && !sideDone) sideT += dt;   // 화면 양쪽 띠 — fullTime × sides.time 초에 다 덮임
          // 지금쯤 덮였어야 할 정도보다 앞서면 늦추고, 뒤처지면 서두름 (사진 · 양쪽 띠 중 더 뒤처진 쪽 기준)
          const lagP = maskCount && !done ? Math.min(1, gt / fullTime()) - covRatio() : -1;
          const lagS = sideTotal && !sideDone ? Math.min(1, sideT / (fullTime() * S.sides.time)) - sideCov / sideTotal : -1;
          const lagK = Math.max(lagP, lagS, lagP < 0 && lagS < 0 ? 0 : -1);
          const sp = lerp(S.speed, react) * (0.45 + 0.55 * strength) * Math.min(3, Math.max(0.12, 1 + lagK * 8));
          let left = Math.min(28, sp * Math.min(dt, 0.1));
          // 한 번에 4 px 이하로 나눠 자람
          while (left > 0) {
            const len = Math.min(4, left); left -= len;
            const h = len / Math.max(1, sp);
            // 새 배열에 살아남은 끝을 담음 — 이 사이에 갈라져 생긴 새 끝(fork·곁가지)도 같은 배열에 들어가 사라지지 않음
            // 더 갈라지지 않고 끝난 끝 = 둥근 혹
            const cur = tips; tips = [];
            for (const t of cur) { if (grow(t, len, h)) tips.push(t); else { lagMark(t, true); if (!t.forked) endBlob(t); } }
          }
          bud();
          fillIn();
          // 거의 다 덮였으면 100 % (남은 아주 작은 틈은 다음 가지들이 메움)
          if (!done && maskCount && (covRatio() >= 0.995 || (covRatio() >= 0.985 && gt >= fullTime()))) done = true;   // 시간이 다 되면 남은 아주 작은 틈은 덮인 것으로
          if (!sideDone && sideTotal && (sideCov >= sideTotal * 0.99 || (sideCov >= sideTotal * 0.97 && sideT >= fullTime() * S.sides.time) || sideT >= fullTime() * S.sides.time * 1.6)) sideDone = true;
          fillT -= dt; if (fillT <= 0) { fillT = 0.5; measureFill(); }
        }
        paint();
        draw();
      },
      photoFill(key) { return (fill.get(key) || 0) * K; },
      get visible() { return K; },
      get strength() { return strength; },
      get count() { return tips.length; },
      get branches() { return segs.length; },
      // 피사체 중 원형질이 덮은 비율 (0~1)
      get coverage() { return maskCount ? (done ? 1 : Math.min(1, covRatio())) : sideTotal ? (sideDone ? 1 : sideCov / sideTotal) : 0; },   // 사진이 없으면 화면 양쪽 띠
      get elapsed() { return gt; },
      get debug() { return { segs, tips, blobs, maskCount, covCount, done }; },   // 검증용
      clear() { resetGrowth(); seenKeys.clear(); foodKey = ''; clipKey = ''; maskCount = 0; sideTotal = 0; K = 0; draw(); },
    };
  };
})(window.DT = window.DT || {});
