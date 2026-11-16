/*
 * 이끼 — 누끼 피사체 위에 작은 별 모양 이끼 싹이 촘촘히 돋아 방석처럼 덮어 감
 *  조건: Vitality 켬 + 습도 아주 높음 + 기온 온화함 + 산소 보통 이상 (점균·미생물 대신, 배경은 짙은 흙빛 — css .bio-bg[data-tone="moss"])
 *
 *  자라는 방식:
 *   · 피사체 조각마다 무게중심(과 명도 대비가 가장 센 몇 곳)에서 시작
 *   · 이미 돋은 싹 옆(3~7 px)에 새 싹이 돋으며 가장자리부터 번져 나감 — 대비가 센 곳(윤곽·무늬)에 더 잘 붙음
 *   · 피사체 바깥으로도 들쭉날쭉한 띠(halo)만큼 번져 나가 윤곽 밖까지 덮음
 *   · 싹 = 가운데에서 5~9 장의 작은 잎이 별처럼 뻗은 모양, 여러 초록 + 잎끝 연두 광택. 드물게 가는 줄기 끝에 갈색 포자낭
 *   · 반응성 50 % 에서 fullTime 초에 피사체를 100 % 덮음 (뒤처지면 빈자리 옆에 더 돋음)
 *   · 다 자라면 그 상태로 멈춤 (더 돋지 않음 — 새 사진을 놓거나 클릭하면 그 자리만 다시 자람)
 *  다이얼 (Lab mode 에서도 같음):
 *   · 기온 → 싹 크기: 따뜻할수록 작은 싹 (이미 돋은 싹도 함께 바뀜)
 *   · 습도 → 밀도: 습할수록 빽빽하게 (돋아 있는 싹 중 보이는 비율)
 *   · 산소(Air) → 바람: 높을수록 싹이 바람결에 살랑살랑 흔들림 (화면을 가로지르는 물결처럼)
 *  화면 테두리의 들쭉날쭉한 띠에도 자람 (rim). 좌표 = 프레임 CSS px, 휠 확대는 setView
 *
 *  그리는 방식 (DT.MOSS.style):
 *   · 'leafy' (기본) — 레퍼런스 'Leafy' 포스터의 잎살 조직: 작은 칸 격자(칸마다 이끼 알갱이 — leafy.shape), 칸 단위로 부서진 가장자리와 안쪽 빈칸(Bayer 디더),
 *     덩어리를 조각(lobe)으로 나누는 검은 잎맥(굵은 줄기 → 가지 · 조각 안 Y자 맥), 가장자리 민트 → 안쪽 초록,
 *     가운데 흐릿한 청록 웅덩이(+ 고운 그레인). 덮인 칸(cov) 격자를 재료로 화면 격자에 다시 그림 (확대해도 칸 크기 같음)
 *     기온 → 칸 크기 · 습도 → 빈칸 문턱값(꽉 참) · 산소 → 웅덩이가 일렁이며 흐르고 가장자리 칸이 깜박임
 *   · 'sprig' — 예전 별 모양 싹
 *  수치는 DT.MOSS (leafy 는 DT.MOSS.leafy) 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  DT.MOSS = {
    // 켜지는 조건 (Life 켬): 기온 tempFrom 이상 tempTo 미만 · 습도 humFrom 이상 · 빛 lightFrom lx 이상 (산소는 조건 아님)
    humFrom: 80, humFull: 96,      // 습도(%) — 이 아래면 없음 / 여기서 최대
    tempFrom: 13, tempTo: 28,      // 기온(°C) — 13° 이상 28° 미만 (온화함)
    lightFrom: 500,                // 빛(lx) — 이 아래면 없음 (광합성에 빛이 필요)
    lightMax: 1e5,                 // 빛 다이얼의 가장 밝은 값 (여기서 가장 크게 자람)
    fullTime: 12,                  // 반응성 50 % 에서 100 % 덮이기까지(초) — 반응성 0 % = 2배 느림, 100 % = 2배 빠름
    doneAfter: 1.6,                // fullTime × 이 값이 지나면 덜 덮인 자리가 남아도 멈춤 (끝없이 쌓이지 않게)
    occ: 4,                        // 덮인 자리 격자(px)
    covR: 3.5,                     // 싹 하나가 덮는 반경(px) — 작을수록 빽빽한 방석
    size: [3.8, 7.2],              // 싹 크기(px) — 기온에 따라 sizeK 배
    step: [2.5, 6],                // 새 싹이 이웃 싹에서 떨어진 거리(px)
    featBias: 1.2,                 // 명도 대비가 센 곳에 더 잘 붙는 정도
    creep: 0.75, creepScale: 70,   // 자라는 앞쪽을 고르지 않게 — 낮은 주파수 노이즈(크기 px)가 높은 쪽으로 손가락처럼 먼저 뻗음 (0 = 둥글게 고르게)
    layer: 0.35,                   // 앞쪽 싹 하나당 이미 덮인 곳에 겹쳐 돋는 싹 수 (도톰하게)
    capsule: 0.025,                // 포자낭(가는 줄기 + 갈색 알) 비율
    rimCells: 2,                   // 가장자리 띠(칸)는 진행률에서 뺌
    halo: 44,                      // 피사체 윤곽 밖으로 자라는 폭(px) — 곳곳에서 이 값의 35~100 %
    // 빛 → 싹 크기 (예전엔 기온 — 배율 범위는 그대로, 입력만 빛)
    sizeT: [8, 34],                // (예전 입력: 기온 구간 — 지금은 쓰지 않음)
    sizeK: [1.45, 0.45],           // 싹 크기 배율 [밝을 때, 어두울 때] — 빛 lightFrom → lightMax 로 0.45 → 1.45
    // 습도 → 밀도 — Moss 가 켜지는 습도 구간 전체(humFrom 80 → 100 %)를 최소 → 최대로
    densRH: [80, 100],             // 습도(%) 구간 — 아래 끝에서 가장 성기고 위 끝에서 가장 빽빽함
    dens: [0.3, 1],                // 보이는 싹 비율
    // Growth Rate → 바람에 흔들림 (예전엔 산소)
    swayRate: [0.2, 0.9],          // Growth Rate(0~1) 구간 — 아래 끝부터 흔들리기 시작해 위 끝에서 가장 셈
    sway: 0.5,                     // 가장 셀 때 잎이 기우는 정도 (기울기)
    // 빛 → 크게 자람: 알갱이(싹)가 커지고 윤곽 밖으로 더 멀리 번짐 (예전엔 산소 — 배율 범위 그대로)
    growLight: [500, 1e5],         // 빛(lx) 구간 (로그 눈금)
    growSize: [0.85, 1.7],         // 알갱이 크기 배율 (sizeK 에 곱함)
    growHalo: [0.6, 2.4],          // 윤곽 밖 띠(halo) 폭 배율
    // 친 글자 — 무슨 글자인지 또렷하게: 윤곽 밖 띠 · 잎맥 · 빈칸 · 웅덩이 없이 덮인 칸을 꽉 채우고 밝은 색으로
    textTone: 0.05,                // 글자 칸 색 자리 (0 = ramp 의 가장 밝은 색)
    swayFps: 30,                   // 흔들리는 동안 다시 그리는 횟수(/초)
    windShare: 0.35,               // 바람에 흔들리는 싹 비율 (위로 솟은 싹 — 나머지는 바닥에 붙어 가만히)
    colors: ['#24461a', '#2f5a1e', '#3f7424', '#4f8a2a', '#64a032', '#7cb83c'],
    tip: '#bfe36a',                // 잎끝 광택
    shade: 'rgba(6, 14, 4, 0.45)', // 싹 아래 그늘
    stalk: '#8a5a2a', cap: '#c08a3a',
    fadeIn: 0.8,
    maxDpr: 1.5,
    // 화면 테두리 이끼 — 보이는 화면 가장자리의 들쭉날쭉한 띠에도 자람 (사진 없이도). 진행률(%)에는 넣지 않음
    rim: 0.08,                     // 띠 두께 (보이는 화면 짧은 변 대비) — 곳곳에서 이 값의 45~100 %
    rimSeeds: 18,                  // 테두리 처음 씨앗 무더기 수
    rimTime: 1.4,                  // 테두리가 다 덮이는 시간 = fullTime × 이 값
    style: 'leafy',                // 그리는 방식 — 'leafy' = 잎살 조직 픽셀 격자 · 'sprig' = 예전 별 모양 싹
    // 'leafy' 그리기 — 자라는 방식(cov 격자)은 같고, 그 격자를 화면 칸 격자로 다시 그림
    leafy: {
      pixel: 5,                    // 칸 크기 (화면 CSS px) — 기온에 따라 × sizeK. 확대해도 화면에서 같은 크기
      shape: 'moss',               // 칸 모양 — 'moss' = 작은 이끼 알갱이(잎 몇 장 방석, 조금씩 어긋나 겹침) · 'square' = 네모 픽셀
      grainR: 0.82,                // 이끼 알갱이 반지름 (칸 대비) — 1 이 넘지 않아야 잎맥 틈이 메워지지 않음
      jitter: 0.26,                // 알갱이 자리 어긋남 (칸 대비)
      growIn: 0.7, growJitter: 0.35, // 새 알갱이가 작게 돋아 다 자라기까지(초) · 알갱이마다 늦게 시작하는 정도(초) — 처음엔 밝은 연두
      // 커서를 대면 이끼가 움직임 — 커서 둘레 알갱이가 옆으로 비켜나고, 커서를 움직이면 바르르 떨다가 천천히 제자리로
      touch: {
        radius: 70,                // 영향 반경 (화면 px)
        push: 7,                   // 비켜나는 거리 (화면 px, 가운데에서 가장 큼)
        lift: 0.18,                // 비켜난 알갱이가 살짝 부풀고 밝아지는 정도
        shake: 3.2, shakeHz: 9,    // 떨림 크기 (화면 px) · 빠르기
        rise: 7, fall: 2.2,        // 커서를 대면 빨리 반응 · 떼면 천천히 돌아옴 (/초)
        stirGain: 0.03, stirDecay: 2.4, // 커서 움직임 1px 당 떨림이 쌓이는 정도 · 줄어드는 빠르기(/초)
      },
      maxCells: 160000,            // 화면 격자 칸 수 상한 (넘으면 칸을 키움)
      fieldHz: 10,                 // 밀도장 · 잎맥 · 거리 다시 계산 최대 횟수(/초) — 덮인 칸 · 확대 · 다이얼이 바뀔 때만
      // 밀도장 = 덮인 칸을 흐리게 한 값 + 낮은/높은 주파수 노이즈 → 문턱값과 비교해 칸을 켬
      blur: 2,                     // 흐리게 하는 반경(칸)
      lowScale: 60, lowAmp: 0.3,   // 낮은 주파수 노이즈 크기(프레임 px) · 세기 — 가장자리가 크게 들쭉날쭉
      highScale: 1.6, highAmp: 0.62, // 높은 주파수 노이즈 크기(칸) · 세기 — 안쪽에 흩어진 검은 빈칸 (스펀지 같은 잎살)
      sponge: 0.3, spongeW: 9,     // 바깥 가장자리 가까이(spongeW 칸 안)는 빈칸이 많고, 안쪽은 덜 (레퍼런스의 잎살 띠)
      inner: 0.72,                 // 안쪽 빈칸 세기 (가장자리 = 1 대비) — 안쪽에도 검은 점이 흩어짐
      thresh: [0.86, 0.36],        // 켜지는 문턱값 (건조할 때 / 습할 때 — densRH · dens 구간). 낮을수록 꽉 참
      dither: 0.36,                // 문턱 근처 4×4 Bayer 디더 폭 — 부서진 가장자리 · 성근 점
      // 잎맥 — 피사체 조각마다 한 번 만들어 둠 (프레임 좌표). 굵기는 칸 단위, 끝으로 갈수록 가늘어짐
      vein: {
        trunk: 3.3,                // 줄기 굵기(칸) — 가지는 단계마다 × branchK, 끝으로 갈수록 taper 만큼 가늘게
        branchK: 0.66, taper: 0.5,
        branchP: [0.11, 0.07, 0.04], // 한 걸음마다 가지가 갈라질 확률 (단계 0 · 1 · 2)
        depth: 3,                  // 가지 단계 수 (줄기 포함)
        step: 0.035,               // 한 걸음 길이 (조각 크기 √넓이 대비)
        wiggle: 0.5,               // 걸음마다 방향이 흔들리는 정도(rad)
        minTrunk: 70,              // 이 크기(√넓이 px)보다 작은 조각은 줄기 없이 Y자 맥만
        y: 2.6, yLen: 0.075,       // 조각 안 Y자 맥 굵기(칸) · 팔 길이(조각 크기 대비)
        yPer: 85,                  // Y자 맥 수 = 조각 크기(px) / 이 값 (1 ~ 6개)
        yAway: 0.17,               // Y자 맥은 다른 맥에서 이만큼(조각 크기 대비) 떨어진 곳에
      },
      // 색과 깊이 — 켜진 칸에서 가장 가까운 꺼진 칸(빈칸 · 맥 · 바깥)까지 거리(칸)
      edge: '#8ff08a', mid: '#4fc07a',   // 가장자리 밝은 민트 → 안쪽 초록
      // 사진 반영 — 사진의 밝고 어두움으로 이끼를 칠해 피사체가 보이게 (이끼 아래 원래 사진은 덮인 만큼 사라짐)
      ramp: ['#d4fcc4', '#8ff08a', '#4fc07a', '#2e8c62', '#1a5444'],   // 밝은 곳 → 어두운 곳 색
      photoTone: 0.9,              // 이끼 색을 사진 밝기로 정하는 정도 (0 = 가장자리 거리로만, 1 = 사진으로만)
      photoDens: 0.8,              // 사진이 어두운 곳은 빈칸이 많아져 검은 바탕이 비침 (하프톤처럼)
      photoPool: 0.75,             // 웅덩이(어두운 청록)가 사진의 어두운 곳에 고이는 정도
      photoGamma: 0.85,            // 사진 밝기 곡선 (1 보다 작으면 중간 톤이 밝아짐)
      veinKeep: 0.6,               // 사진 명도 대비가 이보다 센 곳에서는 잎맥이 끊김 (1 = 끊지 않음)
      outLum: 0.62,                // 사진 밖(윤곽 밖 띠 · 화면 테두리)의 밝기
      edgeW: 4,                    // 민트 → 초록으로 바뀌는 거리(칸)
      tint: 0.06,                  // 칸마다 밝기 흔들림
      // 웅덩이 — 낮은 주파수 노이즈가 높고 거리가 minD 칸 이상인 곳. 흐린 층 + 그레인을 켜진 칸 모양으로 잘라 얹음
      pool: '#2c7a66', poolDeep: '#235f55', glow: '#a6f5ad',
      poolScale: 52,               // 웅덩이 크기(프레임 px)
      poolTh: 0.48, poolSoft: 0.16, // 웅덩이 문턱 · 경계 흐림 (낮을수록 웅덩이가 넓음)
      poolMinD: 3,                 // 가장자리에서 이 거리(칸) 이상에만
      poolBlur: 1.3,               // 웅덩이 층 흐림(칸) — 격자 해상도에서 흐린 뒤 부드럽게 확대
      glowAmt: 0.32,               // 웅덩이 둘레가 밝게 번지는 정도
      grain: 0.15,                 // 웅덩이 그레인 (밝기 ± 이만큼)
      // 산소(Air) → 바람 (swayO2 구간 · swayFps 로 다시 그림)
      drift: 7,                    // 웅덩이가 흘러가는 빠르기(프레임 px/초, 가장 셀 때)
      morph: 0.12,                 // 웅덩이 모양이 일렁이는 빠르기
      flicker: 0.16, flickRate: 7, // 가장자리 디더 칸이 깜박이는 비율 · 횟수(/초)
      flickBand: 0.09,             // 문턱에서 이만큼 안쪽 칸만 깜박임 후보
    },
  };

  const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const lerp = (r, k) => r[0] + (r[1] - r[0]) * k;
  // 들쭉날쭉한 두께 (0~1 근처) — 테두리 띠·윤곽 밖 띠
  const wav = (x, y) => 0.5 + 0.22 * Math.sin(x * 0.011 + 1.3) + 0.14 * Math.sin(x * 0.037 + y * 0.019) + 0.14 * Math.sin(y * 0.027 + 2.1) + 0.1 * Math.sin((x + y) * 0.071);

  // 조건 → 세기 0~1 (Vitality 켬 + 아주 습함 + 온화 + 공기 있음)
  DT.mossStrength = function (vitality, T, RH, O2, L) {
    const M = DT.MOSS;
    if (!vitality || RH < M.humFrom || T < M.tempFrom || T >= M.tempTo || (L != null && L < M.lightFrom)) return 0;
    const mid = (M.tempFrom + M.tempTo) / 2, half = (M.tempTo - M.tempFrom) / 2;
    return (0.4 + 0.6 * sstep(M.humFrom, M.humFull, RH)) * (0.55 + 0.45 * (1 - Math.abs(T - mid) / half));
  };

  DT.createMoss = function (canvas, frame) {
    const M = DT.MOSS;
    const ctx = canvas.getContext('2d');
    let dpr = 1, Wc = 1, Hc = 1, vz = 1, vox = 0, voy = 0, K = 0, strength = 0, react = 0.5, gt = 0, done = false;
    let sizeK = 1, dens = 1, air = 0, clock = 0, swayT = 0, drawn = '', haloK = 1;   // haloK: 산소에 따른 윤곽 밖 띠 폭 배율
    let OW = 1, OH = 1, food = new Float32Array(1), feat = new Float32Array(1), cov = new Uint8Array(1), counted = new Uint8Array(1);
    let textC = new Uint8Array(1);   // 친 글자 칸 (또렷하게 그림)
    let maskList = new Int32Array(0), maskCount = 0, covCount = 0, photos = [], foodKey = '';
    const prevRect = new Map(), gradCache = new WeakMap(), maskImgs = new WeakMap(), maskIds = new WeakMap();
    let maskSeq = 0;
    const sprigs = [];        // [x, y, size, 모양 번호, 밀도 순위 0~1, 흔들림 위상, 바람에 흔들리는 싹인지] — 크기·밀도가 바뀌면 다시 그림
    let recent = [];          // 번져 나갈 자리를 고를 최근 싹들
    const clip = document.createElement('canvas'), cg = clip.getContext('2d');
    let clipKey = '', fill = new Map(), fillT = 0;
    // 테두리 띠: rim[i] = 1 이면 이끼가 자랄 수 있는 가장자리 칸
    let rim = new Uint8Array(1), rimList = new Int32Array(0), rimTotal = 0, rimCov = 0, rimKey = '';
    const rimImg = document.createElement('canvas'), rimTmp = document.createElement('canvas');
    // 윤곽 밖 띠 (halo) — 잘라 낼 모양
    let haloN = 0;
    const seenKeys = new Set();   // 한 번이라도 씨앗을 받은 사진 · 글자 key (처음 들어온 것만 겹친 자리 밖에 씨앗)
    let covVer = 0;           // 덮인 칸이 바뀔 때마다 +1 ('leafy' 필드를 다시 계산할 때를 앎)
    let lumC = new Float32Array(1);   // 칸마다 사진 밝기 0~1 (사진마다 펴 둠, −1 = 사진 밖 · 윤곽 밖 띠 · 테두리)
    let bornT = new Float32Array(OW * OH);   // 칸이 덮인 시각 (clock) — 'leafy' 알갱이가 작게 돋아 자람
    const creepSeed = Math.random() * 100;   // 앞쪽이 먼저 뻗는 방향 (실행마다 다르게)
    // 커서: 프레임 px · 대고 있는지 · 반응 세기(act) · 움직임으로 쌓인 떨림(stir)
    const touch = { x: 0, y: 0, on: false, act: 0, stir: 0, t: 0 };
    let veins = [], veinVer = 0;   // 잎맥 선분 [x0, y0, x1, y1, 굵기(칸)] — 프레임 좌표, 조각마다 한 번
    const haloImg = document.createElement('canvas'), haloTmp = document.createElement('canvas');

    function resize() {
      dpr = Math.min(M.maxDpr, DT.dprCap || 9, window.devicePixelRatio || 1);
      const w0 = Wc, h0 = Hc;
      Wc = frame.clientWidth || 1; Hc = frame.clientHeight || 1;
      const w = Math.round(Wc * dpr), h = Math.round(Hc * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h; clipKey = ''; drawn = '';
        const kx = Wc / (w0 || Wc), ky = Hc / (h0 || Hc);
        if (w0 > 1 && (kx !== 1 || ky !== 1)) { for (const s of sprigs) { s[0] *= kx; s[1] *= ky; } for (const s of recent) { s[0] *= kx; s[1] *= ky; } }
      }
      const ow = Math.max(4, Math.ceil(Wc / M.occ)), oh = Math.max(4, Math.ceil(Hc / M.occ));
      if (ow !== OW || oh !== OH) { OW = ow; OH = oh; food = new Float32Array(OW * OH); feat = new Float32Array(OW * OH); cov = new Uint8Array(OW * OH); bornT = new Float32Array(OW * OH); counted = new Uint8Array(OW * OH); textC = new Uint8Array(OW * OH); rim =new Uint8Array(OW * OH); covCount = 0; rimCov = 0; foodKey = ''; rimKey = ''; }
    }
    resize();

    // 싹 모양 그림판: 기준 크기 SZ 로 미리 그려 두고 크기·기울기만 바꿔 찍음 (매 프레임 수천 개를 빠르게)
    const SZ = 8, VAR = 24, CAPV = 6;
    let sprites = null, spQ = 0;
    function drawSprig(g, sz, seed, cap) {
      const C = M.colors;
      let r = seed; const R = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
      g.fillStyle = M.shade; g.beginPath(); g.arc(0.5, 0.8, sz * 0.6, 0, 6.2832); g.fill();
      const n = 5 + ((R() * 5) | 0), rot = R() * 6.2832, base = (R() * (C.length - 2)) | 0;
      for (let j = 0; j < n; j++) {
        const a = rot + j * 6.2832 / n + (R() - 0.5) * 0.5, L = sz * (0.55 + R() * 0.5);
        g.strokeStyle = C[Math.min(C.length - 1, base + ((R() * 3) | 0))]; g.lineWidth = Math.max(0.6, sz * 0.24);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * L, Math.sin(a) * L); g.stroke();
        if (R() < 0.6) { g.fillStyle = M.tip; g.beginPath(); g.arc(Math.cos(a) * L, Math.sin(a) * L, Math.max(0.35, sz * 0.09), 0, 6.2832); g.fill(); }
      }
      g.fillStyle = C[0]; g.beginPath(); g.arc(0, 0, sz * 0.16, 0, 6.2832); g.fill();
      if (cap) {   // 포자낭: 가는 갈색 줄기 끝에 알
        const a = -1.57 + (R() - 0.5) * 1.2, L = sz * (1.6 + R() * 1.4), ex = Math.cos(a) * L, ey = Math.sin(a) * L;
        g.strokeStyle = M.stalk; g.lineWidth = 0.55; g.beginPath(); g.moveTo(0, 0); g.lineTo(ex, ey); g.stroke();
        g.fillStyle = M.cap; g.beginPath(); g.ellipse(ex, ey, 0.9, 1.5, a + 1.57, 0, 6.2832); g.fill();
      }
    }
    function buildSprites() {
      const q = 2.5 * dpr;   // 기준 크기에서 CSS px 당 픽셀 (커져도 흐리지 않게 넉넉히)
      if (sprites && spQ === q) return;
      spQ = q; sprites = [];
      for (let v = 0; v < VAR + CAPV; v++) {
        const cap = v >= VAR, half = (cap ? 3.4 : 1.3) * SZ, px = Math.ceil(half * q) * 2;
        const c = document.createElement('canvas'); c.width = c.height = px;
        const g = c.getContext('2d'); g.setTransform(q, 0, 0, q, px / 2, px / 2); g.lineCap = 'round';
        drawSprig(g, SZ, ((v + 1) * 2654435761) >>> 0, cap);
        sprites.push({ c, half: px / 2 / q });
      }
    }

    const maskId = (m) => { if (!m) return 0; let v = maskIds.get(m); if (!v) maskIds.set(m, v = ++maskSeq); return v; };
    const cellOf = (x, y) => { const c = (x / M.occ) | 0, r = (y / M.occ) | 0; return c < 0 || r < 0 || c >= OW || r >= OH ? -1 : r * OW + c; };
    const inMask = (x, y) => { const i = cellOf(x, y); return i >= 0 && food[i] >= 0.5; };

    // 밝기 격자 → 명도 대비 (0~1) — js/slime.js 와 같은 방식
    function gradOf(L) {
      let G = gradCache.get(L); if (G) return G;
      const w = L.w, h = L.h, l = L.l || L.m, g = new Float32Array(w * h), at = (x, y) => l[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
        const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
        g[y * w + x] = Math.hypot(gx, gy);
      }
      const t = new Float32Array(w * h);
      for (let p = 0; p < 2; p++) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += g[y * w + xx]; n++; } } t[y * w + x] = s / n; }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -2; k <= 2; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += t[yy * w + x]; n++; } } g[y * w + x] = s / n; }
      }
      const sorted = Float32Array.from(g).sort(), top = sorted[Math.floor(sorted.length * 0.9)] || 1;
      for (let i = 0; i < g.length; i++) g[i] = Math.min(1, g[i] / Math.max(1e-4, top));
      G = { w, h, g }; gradCache.set(L, G); return G;
    }

    // 프레임(CSS px) 안에서 실제로 보이는 영역 — 프레임이 화면보다 크면(cover) 잘린 바깥은 빼고
    let vrCache = null, vrT = 0;   // 매 프레임 레이아웃을 읽지 않게 0.5초 동안 재사용
    function visRect() {
      const now = performance.now();
      if (vrCache && now - vrT < 500) return vrCache;
      const r = frame.getBoundingClientRect(), k = Wc / Math.max(1, r.width), cl = (v, m) => Math.min(m, Math.max(0, v));
      vrT = now;
      return (vrCache = [cl(-r.left * k, Wc), cl(-r.top * k, Hc), cl((window.innerWidth - r.left) * k, Wc), cl((window.innerHeight - r.top) * k, Hc)].map((v) => Math.round(v / 8) * 8));   // 8px 단위 (애니메이션 중 미세한 변화로 다시 계산하지 않게)
    }
    // 칸 목록 → 잘라 낼 모양 (칸을 채우고 살짝 흐리게 — 안쪽 끝의 잎이 부드럽게 사라지게)
    function shapeImg(list, img, tmp) {
      const w = Math.max(1, Math.round(Wc)), h = Math.max(1, Math.round(Hc));
      tmp.width = img.width = w; tmp.height = img.height = h;
      const tg = tmp.getContext('2d'), ig = img.getContext('2d');
      tg.clearRect(0, 0, w, h); tg.fillStyle = '#fff';
      for (const i of list) tg.fillRect((i % OW) * M.occ - 2, ((i / OW) | 0) * M.occ - 2, M.occ + 4, M.occ + 4);
      ig.clearRect(0, 0, w, h); ig.filter = 'blur(3px)'; ig.drawImage(tmp, 0, 0); ig.filter = 'none';
    }
    // 테두리 띠 다시 계산 (보이는 영역·격자가 바뀔 때만) — 가장자리에서 들쭉날쭉한 두께
    function buildRim(vr) {
      const key = vr.join(',') + '#' + OW + 'x' + OH;
      if (key === rimKey) return;
      rimKey = key;
      rim.fill(0);
      const [x0, y0, x1, y1] = vr, band = Math.min(x1 - x0, y1 - y0) * M.rim, list = [];
      for (let r = 0; r < OH; r++) for (let c = 0; c < OW; c++) {
        const x = (c + 0.5) * M.occ, y = (r + 0.5) * M.occ;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const d = Math.min(x - x0, x1 - x, y - y0, y1 - y);
        if (d < band * (0.45 + 0.55 * Math.min(1, Math.max(0, wav(x, y))))) { const i = r * OW + c; rim[i] = 1; list.push(i); }
      }
      rimList = Int32Array.from(list); rimTotal = list.length;
      rimCov = 0; for (const i of list) if (cov[i]) rimCov++;
      shapeImg(list, rimImg, rimTmp);
      clipKey = '';
    }
    function seedRim() {
      for (let k = 0; k < M.rimSeeds && rimTotal; k++) {
        const i = rimList[(Math.random() * rimTotal) | 0];
        clump((i % OW + 0.5) * M.occ, (((i / OW) | 0) + 0.5) * M.occ, 5);
      }
    }
    // 윤곽 밖 띠: 피사체 칸에서 바깥으로 거리(두 번 훑는 근사)가 들쭉날쭉한 폭보다 가까운 칸
    function buildHalo() {
      const N = OW * OH, d = new Float32Array(N), BIG = 1e9, halo = M.halo * haloK, maxC = halo / M.occ + 2;
      for (let i = 0; i < N; i++) d[i] = food[i] >= 0.5 && !textC[i] ? 0 : BIG;   // 친 글자 둘레에는 번지지 않음 (글자 모양이 뭉개지지 않게)
      for (let r = 0; r < OH; r++) for (let c = 0; c < OW; c++) {
        const i = r * OW + c; if (!d[i]) continue;
        let v = d[i];
        if (c > 0) v = Math.min(v, d[i - 1] + 1);
        if (r > 0) { v = Math.min(v, d[i - OW] + 1); if (c > 0) v = Math.min(v, d[i - OW - 1] + 1.414); if (c < OW - 1) v = Math.min(v, d[i - OW + 1] + 1.414); }
        d[i] = v;
      }
      for (let r = OH - 1; r >= 0; r--) for (let c = OW - 1; c >= 0; c--) {
        const i = r * OW + c; if (!d[i]) continue;
        let v = d[i];
        if (c < OW - 1) v = Math.min(v, d[i + 1] + 1);
        if (r < OH - 1) { v = Math.min(v, d[i + OW] + 1); if (c < OW - 1) v = Math.min(v, d[i + OW + 1] + 1.414); if (c > 0) v = Math.min(v, d[i + OW - 1] + 1.414); }
        d[i] = v;
      }
      const list = [];
      for (let i = 0; i < N; i++) {
        if (!d[i] || d[i] > maxC || food[i] >= 0.5) continue;
        const x = (i % OW + 0.5) * M.occ, y = (((i / OW) | 0) + 0.5) * M.occ;
        if (d[i] * M.occ < halo * (0.35 + 0.65 * Math.min(1, Math.max(0, wav(x * 1.7, y * 1.7))))) {
          food[i] = 0.6; feat[i] = 0.25 + 0.35 * Math.random(); list.push(i);
        }
      }
      haloN = list.length;
      shapeImg(list, haloImg, haloTmp);
    }
    function buildFood() {
      const vr = visRect();
      const key = photos.map((p) => p.key + ':' + p.rect.map((v) => v.toFixed(1)).join(',') + ':' + maskId(p.mask)).join('|') + '#' + OW + 'x' + OH + '@' + vr.join(',') + '~' + haloK.toFixed(2);
      if (key === foodKey) return;
      let moved = false;
      if (sprigs.length) for (const p of photos) { const o = prevRect.get(p.key); if (!p.fine && o && (Math.abs(o[0] - p.rect[0]) > 2 || Math.abs(o[1] - p.rect[1]) > 2 || Math.abs(o[2] - p.rect[2]) > 2)) moved = true; }
      prevRect.clear(); for (const p of photos) prevRect.set(p.key, p.rect.slice());
      foodKey = key; clipKey = '';
      food.fill(0); feat.fill(0); textC.fill(0);
      if (lumC.length !== food.length) lumC = new Float32Array(food.length);
      lumC.fill(-1);
      const comps = [];
      for (const p of photos) {
        const Mk = p.mask; if (!Mk) continue;
        const G = p.fine ? gradOf(Mk) : p.lum ? gradOf(p.lum) : null;
        const [rx, ry, rw, rh] = p.rect, cells = [], raw = [];
        const c0 = Math.max(0, Math.floor(rx / M.occ)), c1 = Math.min(OW - 1, Math.ceil((rx + rw) / M.occ));
        const r0 = Math.max(0, Math.floor(ry / M.occ)), r1 = Math.min(OH - 1, Math.ceil((ry + rh) / M.occ));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const u = ((c + 0.5) * M.occ - rx) / rw, v = ((r + 0.5) * M.occ - ry) / rh;
          if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
          const m = Mk.m[Math.min(Mk.h - 1, (v * Mk.h) | 0) * Mk.w + Math.min(Mk.w - 1, (u * Mk.w) | 0)];
          if (m < 0.5) continue;
          const i = r * OW + c; food[i] = Math.max(food[i], m); cells.push(i);
          if (p.fine) textC[i] = 1;
          feat[i] = G ? G.g[Math.min(G.h - 1, (v * G.h) | 0) * G.w + Math.min(G.w - 1, (u * G.w) | 0)] : 0.5;
          const Lm = p.lum;   // 사진 밝기 ('leafy' 가 이끼의 밝고 어두움으로 사진을 그림)
          raw.push(Lm ? Lm.l[Math.min(Lm.h - 1, (v * Lm.h) | 0) * Lm.w + Math.min(Lm.w - 1, (u * Lm.w) | 0)] : 0.7);
        }
        // 사진마다 밝기를 넓게 펴서 (아래 · 위 몇 % 잘라) 어두운 사진 · 흐린 사진도 이끼 위에서 또렷하게
        if (raw.length) {
          const st = Float32Array.from(raw).sort(), lo = st[Math.floor(st.length * 0.03)], hi = st[Math.floor(st.length * 0.97)], span = Math.max(0.05, hi - lo);
          cells.forEach((i, k) => { lumC[i] = Math.min(1, Math.max(0, (raw[k] - lo) / span)); });
        }
        comps.push({ cells, fine: p.fine, key: p.key });
      }
      buildHalo();   // 윤곽 밖 띠도 자랄 자리 (진행률에 넣음 — 다 덮여야 멈춤)
      const ml = [], RC = M.rimCells, inM = (x, y) => x >= 0 && y >= 0 && x < OW && y < OH && food[y * OW + x] >= 0.5;
      counted.fill(0);
      for (let i = 0; i < food.length; i++) {
        if (food[i] < 0.5) continue;
        const x = i % OW, y = (i / OW) | 0;
        if (!(inM(x - RC, y) && inM(x + RC, y) && inM(x, y - RC) && inM(x, y + RC))) continue;
        ml.push(i); counted[i] = 1;
      }
      maskList = Int32Array.from(ml); maskCount = ml.length;
      if (moved) resetGrowth();
      covCount = 0; for (const i of ml) if (cov[i]) covCount++;
      // 테두리 띠도 자랄 자리로 (진행률 counted 에는 넣지 않음)
      buildRim(vr);
      for (const i of rimList) if (food[i] < 0.5) { food[i] = 1; feat[i] = 0.35 + 0.4 * Math.random(); }
      if (rimTotal && !rimCov) seedRim();
      // 아직 이끼가 닿지 않은 조각(새 사진 · 새로 친 글자)에 씨앗 → 그 몫만큼 다시 자람 · 조각마다 잎맥
      //  처음 들어온 사진 · 글자는 이미 자란 자리와 겹쳐도, 아직 안 덮인 부분마다 씨앗 (새로 불러온 사진에도 곧장 자라게)
      let fresh = false;
      veins = []; veinVer++;
      for (const p of comps) {
        const isNew = !seenKeys.has(p.key); seenKeys.add(p.key);
        for (const comp of components(p.cells)) {
          growVeins(comp, p.key);
          if (!comp.some((c) => cov[c])) { seed(comp); fresh = true; continue; }
          if (!isNew) continue;
          for (const part of components(comp.filter((c) => !cov[c]))) if (part.length >= comp.length * 0.05) { seed(part); fresh = true; }
        }
      }
      if (fresh && (done || gt > covRatio() * fullTime())) { done = false; gt = covRatio() * fullTime(); }
    }
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
        if (comp.length >= 6) out.push(comp);
      }
      return out;
    }
    function seed(comp) {
      let mx = 0, my = 0; for (const c of comp) { mx += c % OW; my += (c / OW) | 0; } mx /= comp.length; my /= comp.length;
      let best = comp[0], bd = 1e18;
      for (const c of comp) { const d = (c % OW - mx) ** 2 + (((c / OW) | 0) - my) ** 2; if (d < bd) { bd = d; best = c; } }
      const at = (c) => [(c % OW + 0.5) * M.occ, (((c / OW) | 0) + 0.5) * M.occ];
      clump(...at(best), 7);
      // 대비가 가장 센 두 곳에서도
      const byFeat = comp.slice().sort((a, b) => feat[b] - feat[a]);
      for (let k = 0, n = 0; k < byFeat.length && n < 2; k += Math.max(1, (byFeat.length / 7) | 0)) { if (feat[byFeat[k]] < 0.5) break; clump(...at(byFeat[k]), 4); n++; }
    }
    function clump(x, y, n) { for (let k = 0; k < n; k++) { const a = Math.random() * 6.2832, d = Math.random() * 5; add(x + Math.cos(a) * d, y + Math.sin(a) * d); } }

    // 싹 하나 (자리 확인은 부른 쪽에서)
    function add(x, y) {
      if (!inMask(x, y)) return false;
      const sd = (Math.random() * 1e9) | 0, v = Math.random() < M.capsule ? VAR + sd % CAPV : sd % VAR;
      const s = [x, y, lerp(M.size, Math.random()), v, Math.random(), Math.random() * 6.2832, Math.random() < M.windShare];
      sprigs.push(s); recent.push(s); if (recent.length > 2500) recent.splice(0, 500);
      const R = Math.ceil(M.covR / M.occ), c0 = (x / M.occ) | 0, r0 = (y / M.occ) | 0;
      for (let yy = r0 - R; yy <= r0 + R; yy++) for (let xx = c0 - R; xx <= c0 + R; xx++) {
        if (xx < 0 || yy < 0 || xx >= OW || yy >= OH || (xx - c0) ** 2 + (yy - r0) ** 2 > R * R) continue;
        const i = yy * OW + xx; if (!cov[i]) { cov[i] = 1; bornT[i] = clock; covVer++; if (counted[i]) covCount++; if (rim[i]) rimCov++; frontDel(i); frontNb(i); }
      }
      return true;
    }
    // 번지는 앞쪽: 덮인 칸 바로 옆의 아직 안 덮인 칸 목록 (빠르게 넣고 빼기)
    let front = [], fpos = new Int32Array(1).fill(-1);
    function frontAdd(i) { if (fpos.length !== cov.length) { fpos = new Int32Array(cov.length).fill(-1); front = []; } if (fpos[i] >= 0 || cov[i] || food[i] < 0.5) return; fpos[i] = front.length; front.push(i); }
    function frontDel(i) { if (fpos.length !== cov.length || fpos[i] < 0) return; const k = fpos[i], last = front.pop(); if (last !== i) { front[k] = last; fpos[last] = k; } fpos[i] = -1; }
    function frontNb(i) { const x = i % OW, y = (i / OW) | 0; if (x > 0) frontAdd(i - 1); if (x < OW - 1) frontAdd(i + 1); if (y > 0) frontAdd(i - OW); if (y < OH - 1) frontAdd(i + OW); }
    const covRatio = () => (maskCount ? covCount / maskCount : 0);
    const fullTime = () => M.fullTime * Math.pow(2, (0.5 - react) * 2);

    // 이번 프레임에 n 개를 돋게 함: 번지는 앞쪽(덮인 곳 바로 옆 빈 칸)에서 — 대비 센 곳이 잘 붙음.
    //  가끔(layer) 이미 덮인 곳 위에도 겹쳐 돋아 방석이 도톰해짐
    function spread(n) {
      let made = 0;
      for (let k = 0; k < n * 6 && made < n && front.length; k++) {
        const i = front[(Math.random() * front.length) | 0];
        // 대비가 센 곳에 잘 붙음 × 낮은 주파수 노이즈가 높은 쪽으로 먼저 뻗음 (앞쪽이 손가락처럼 들쭉날쭉)
        const cr = 1 - M.creep + M.creep * 1.7 * vnoise((i % OW) * M.occ / M.creepScale + creepSeed, ((i / OW) | 0) * M.occ / M.creepScale, 31);
        if (Math.random() > (0.3 + M.featBias * feat[i]) * cr) continue;
        const x = (i % OW + Math.random()) * M.occ, y = (((i / OW) | 0) + Math.random()) * M.occ;
        if (add(x, y)) made++;
      }
      for (let k = 0; k < n * M.layer && recent.length; k++) {
        const p = recent[(Math.random() * recent.length) | 0], a = Math.random() * 6.2832, d = lerp(M.step, Math.random());
        add(p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d);
      }
      // 앞쪽이 막혔으면(조각이 끊겨 있음 등) 빈 칸에 바로
      if (made < n * 0.3 && maskList.length && covRatio() < gt / fullTime() - 0.05) {
        for (let k = 0; k < 200 && made < n; k++) {
          const i = maskList[(Math.random() * maskList.length) | 0]; if (cov[i]) continue;
          if (add((i % OW + Math.random()) * M.occ, (((i / OW) | 0) + Math.random()) * M.occ)) made++;
        }
      }
      // 테두리도 뒤처지면 빈 칸에 바로
      if (made < n * 0.3 && rimTotal && rimCov / rimTotal < gt / (fullTime() * M.rimTime) - 0.05) {
        for (let k = 0; k < 200 && made < n; k++) {
          const i = rimList[(Math.random() * rimTotal) | 0]; if (cov[i]) continue;
          if (add((i % OW + Math.random()) * M.occ, (((i / OW) | 0) + Math.random()) * M.occ)) made++;
        }
      }
    }

    function maskImg(Mk) {
      let c = maskImgs.get(Mk);
      if (!c) {
        c = document.createElement('canvas'); c.width = Mk.w; c.height = Mk.h;
        const g = c.getContext('2d'), im = g.createImageData(Mk.w, Mk.h);
        for (let i = 0; i < Mk.w * Mk.h; i++) { im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (Mk.m[i] - 0.3) / 0.4)) * 255); }
        g.putImageData(im, 0, 0); maskImgs.set(Mk, c);
      }
      return c;
    }
    function updateClip() {
      const key = foodKey + '|' + rimKey + '|' + vz + ',' + vox + ',' + voy + '|' + canvas.width + 'x' + canvas.height;
      if (key === clipKey) return;
      clipKey = key;
      if (clip.width !== canvas.width || clip.height !== canvas.height) { clip.width = canvas.width; clip.height = canvas.height; }
      cg.setTransform(1, 0, 0, 1, 0, 0); cg.clearRect(0, 0, clip.width, clip.height);
      cg.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);
      for (const p of photos) if (p.mask) cg.drawImage(maskImg(p.mask), p.rect[0], p.rect[1], p.rect[2], p.rect[3]);
      if (haloN) cg.drawImage(haloImg, 0, 0, Wc, Hc);   // 윤곽 밖 띠
      if (rimTotal) cg.drawImage(rimImg, 0, 0, Wc, Hc);   // 테두리 띠
    }
    // 싹 찍기 — moving = true 면 흔들리는 싹만, false 면 가만히 있는 싹만 (바람이 없으면 전부)
    //  바람: 화면을 가로지르는 느린 물결(돌풍) × 싹마다 조금씩 다른 박자로 살랑임 → 잎이 바람 쪽으로 기울었다 돌아옴
    function stamp(g, moving, windy, from = 0) {
      const A = moving ? air * M.sway : 0, t = clock, base = dpr * vz * sizeK / SZ;
      for (let k = from; k < sprigs.length; k++) {
        const s = sprigs[k];
        if (s[4] > dens || (windy && s[6] !== moving)) continue;
        const x = s[0], y = s[1], sp = sprites[s[3]], m = base * s[2];
        let sh = 0;
        if (A > 0) {
          const gust = 0.55 + 0.45 * Math.sin(t * 0.8 - x * 0.006 + y * 0.002);   // 돌풍 물결 (왼쪽 → 오른쪽)
          sh = A * gust * (0.6 + 0.4 * Math.sin(t * (2.2 + s[5] * 0.25) + s[5] + x * 0.02));
        }
        g.setTransform(m, 0, -m * sh, m, dpr * (vz * (x + sh * s[2] * sizeK * 0.6) + vox), dpr * (vz * y + voy));
        g.drawImage(sp.c, -sp.half, -sp.half, sp.half * 2, sp.half * 2);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    // 그리기 — 크기(기온) · 보이는 비율(습도)이 바뀌거나 새 싹이 돋으면 가만히 있는 싹을 still 에 다시 그려 두고,
    //  바람이 불면 매번 still 위에 흔들리는 싹(windShare)만 새로 찍음 (수천 개를 매 프레임 다 그리지 않게)
    const still = document.createElement('canvas'), sg = still.getContext('2d');
    let stillSig = '', stillN = 0;   // stillN = still 에 이미 찍은 싹 수 (자라는 동안은 새 싹만 덧찍음)
    function draw(animate = true) {
      if (M.style !== 'sprig') { drawLeafy(animate); return; }   // 기본: 잎살 조직 픽셀 격자
      if (lastStyle !== 'sprig') { lastStyle = 'sprig'; drawn = ''; stillSig = ''; }
      const windy = air > 0.01, swaying = animate && windy && K > 0.003;
      updateClip();
      const sig = [dens.toFixed(3), sizeK.toFixed(3), vz, vox, voy, canvas.width, canvas.height, windy].join('|');
      const full = sig + '|' + sprigs.length + '|' + K.toFixed(3) + '|' + clipKey + '|' + photos.length + '|' + rimTotal;
      if (full === drawn && !swaying) return;
      drawn = full;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (K < 0.003 || (!photos.length && !rimTotal)) return;
      buildSprites();
      if (sig !== stillSig || sprigs.length < stillN) {
        stillSig = sig; stillN = 0;
        if (still.width !== canvas.width || still.height !== canvas.height) { still.width = canvas.width; still.height = canvas.height; }
        sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, still.width, still.height);
      }
      if (stillN < sprigs.length) { stamp(sg, false, windy, stillN); stillN = sprigs.length; }
      ctx.globalAlpha = K;
      ctx.drawImage(still, 0, 0);
      if (windy) stamp(ctx, true, true);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(clip, 0, 0); ctx.globalCompositeOperation = 'source-over';
    }
    function measureFill() {
      fill = new Map();
      for (const p of photos) {
        const [rx, ry, rw, rh] = p.rect;
        const c0 = Math.max(0, Math.floor(rx / M.occ)), c1 = Math.min(OW - 1, Math.ceil((rx + rw) / M.occ));
        const r0 = Math.max(0, Math.floor(ry / M.occ)), r1 = Math.min(OH - 1, Math.ceil((ry + rh) / M.occ));
        let tot = 0, on = 0;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const i = r * OW + c; if (food[i] < 0.5) continue; tot++; if (cov[i]) on++; }
        fill.set(p.key, tot ? on / tot : 0);
      }
    }
    // ---------- 'leafy' 그리기 ----------
    // 잎맥: 조각(component)마다 — 무게중심 근처에서 굵은 줄기가 양쪽으로 뻗고 (랜덤 워크) 가지가 2~3 단계로 갈라져
    //  덩어리를 둥근 조각(lobe)으로 나눔. 맥에서 떨어진 곳에 짧은 Y자 맥 1~6개. 같은 사진이면 늘 같은 모양 (씨앗 = 사진 key + 자리)
    function growVeins(comp, key) {
      const V = M.leafy.vein, n = comp.length, S = Math.sqrt(n) * M.occ;
      if (S < 40) return;
      let mx = 0, my = 0; for (const c of comp) { mx += c % OW; my += (c / OW) | 0; }
      mx = (mx / n + 0.5) * M.occ; my = (my / n + 0.5) * M.occ;
      let h = 2166136261; for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      let s = (h ^ Math.imul(Math.round(mx / 8), 73856093) ^ Math.imul(Math.round(my / 8), 19349663)) >>> 0;
      const R = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      const inside = (x, y) => { const i = cellOf(x, y); return i >= 0 && food[i] >= 0.5; };
      const pts = [], seg = (x0, y0, x1, y1, w) => { veins.push([x0, y0, x1, y1, w]); pts.push(x1, y1); };
      const step = S * V.step;
      function walk(x, y, a, len, w, d) {
        const nn = Math.max(2, Math.round(len / step));
        let out = 0;
        for (let k = 0; k < nn; k++) {
          a += (R() - 0.5) * V.wiggle;
          const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step, ww = w * (1 - V.taper * k / nn);   // 끝으로 갈수록 가늘게
          seg(x, y, nx, ny, Math.max(1.6, ww));   // 알갱이가 양쪽에서 조금 덮어도 틈이 남게
          if (!inside(nx, ny) && ++out > 1) return;   // 덩어리 바깥까지 뚫고 나가 조각을 가름
          if (d < V.depth - 1 && R() < V.branchP[d]) walk(nx, ny, a + (R() < 0.5 ? -1 : 1) * (0.55 + R() * 0.6), len * (0.4 + R() * 0.3), ww * V.branchK, d + 1);
          x = nx; y = ny;
        }
      }
      if (S >= V.minTrunk) {
        const a0 = R() * 6.2832, sx = mx + (R() - 0.5) * S * 0.12, sy = my + (R() - 0.5) * S * 0.12;
        walk(sx, sy, a0, S * 0.8, V.trunk, 0);
        walk(sx, sy, a0 + Math.PI + (R() - 0.5) * 0.7, S * 0.8, V.trunk, 0);
      }
      // 조각 안 Y자 맥 — 다른 맥 · 덩어리 가장자리에서 떨어진 곳에, 세 팔이 120° 쯤 벌어짐
      const nY = Math.min(6, Math.max(1, Math.round(S / V.yPer))), away = S * V.yAway, L = Math.max(6, S * V.yLen);
      for (let t = 0, made = 0; t < 80 && made < nY; t++) {
        const c = comp[(R() * n) | 0], x = (c % OW + 0.5) * M.occ, y = (((c / OW) | 0) + 0.5) * M.occ;
        let ok = true;
        for (let k = 0; k < pts.length && ok; k += 2) if ((pts[k] - x) ** 2 + (pts[k + 1] - y) ** 2 < away * away) ok = false;
        for (let k = 0; k < 6 && ok; k++) if (!inside(x + Math.cos(k * 1.047) * L * 1.6, y + Math.sin(k * 1.047) * L * 1.6)) ok = false;
        if (!ok) continue;
        const a = R() * 6.2832;
        for (let j = 0; j < 3; j++) {
          const aj = a + j * 2.094 + (R() - 0.5) * 0.5, Lj = L * (0.75 + R() * 0.5);
          let px = x, py = y;
          for (let q = 1; q <= 3; q++) { const nx = x + Math.cos(aj) * Lj * q / 3, ny = y + Math.sin(aj) * Lj * q / 3; seg(px, py, nx, ny, V.y * (1 - 0.45 * (q - 1) / 2)); px = nx; py = ny; }
        }
        made++;
      }
    }

    // 화면 칸 격자 (칸 = pixel × sizeK 화면 px, 프레임 내용에 붙어 이동) — 이 격자로 덮인 칸(cov)을 다시 그림
    const LF = { P: 5, sx0: 0, sy0: 0, gw: 0, gh: 0, gi0: 0, gj0: 0, vz: 1, vox: 0, voy: 0, ok: false };
    let lCs = new Uint8Array(0), lFd = new Uint8Array(0), lB = new Float32Array(0), lT = new Float32Array(0), lOn = new Uint8Array(0), lD = new Float32Array(0), lVein = new Uint8Array(0);
    let colC = new Int32Array(0), rowR = new Int32Array(0), colFx = new Float32Array(0), rowFy = new Float32Array(0);
    let lEdge = new Int32Array(0), lEdgeBase = new Uint8Array(0), lEdgeN = 0;
    let lL = new Float32Array(0);   // 화면 칸마다 사진 밝기 (곡선 적용)
    let lTx = new Uint8Array(0);    // 화면 칸이 친 글자 위인지
    let lBorn = new Float32Array(0), young = new Int32Array(0), youngN = 0, youngLast = -1e9;   // 덮인 시각 · 아직 자라는 알갱이 목록 · 그중 가장 늦게 돋은 시각
    // 색 단계 (밝은 곳 0 → 어두운 곳 1)
    let rampKey = '', rampRGB = [];
    function rampAt(t) {
      const L = M.leafy, key = L.ramp.join();
      if (key !== rampKey) { rampKey = key; rampRGB = L.ramp.map(rgbOf); }
      const x = Math.min(1, Math.max(0, t)) * (rampRGB.length - 1), k = Math.min(rampRGB.length - 2, Math.floor(x)), f = x - k, a = rampRGB[k], b = rampRGB[k + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    // 칸의 색 자리 — 가장자리 거리(민트 → 초록)와 사진 밝기(밝음 → 어두움)를 섞음
    function toneOf(n) {
      if (lTx[n]) return M.textTone;   // 친 글자: 늘 밝은 민트 (짙은 흙빛 배경 위에서 또렷하게)
      const L = M.leafy, te = sstep(0.9, L.edgeW, lD[n]);
      return (0.25 + 0.25 * te) * (1 - L.photoTone) + (1 - lL[n]) * L.photoTone - 0.12 * (1 - te);
    }
    const cellCv = document.createElement('canvas'), cellG = cellCv.getContext('2d');
    const poolCv = document.createElement('canvas'), poolG = poolCv.getContext('2d');
    const veinCv = document.createElement('canvas'), veinG = veinCv.getContext('2d', { willReadFrequently: true });
    const poolBlurCv = document.createElement('canvas'), pbG = poolBlurCv.getContext('2d');
    const layer = document.createElement('canvas'), layG = layer.getContext('2d');
    let cellImg = null, poolImg = null, grainPat = null, fieldSig = '', fieldT = -1e9, composeSig = '', poolDirty = false, poolClock = 0, lastStyle = '';
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
    const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const hashN = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    // 값 노이즈 (0~1, 부드러운 보간)
    function vnoise(x, y, s) {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = hashN(xi, yi, s), b = hashN(xi + 1, yi, s), c = hashN(xi, yi + 1, s), d = hashN(xi + 1, yi + 1, s);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    const fbm = (x, y, s) => vnoise(x, y, s) * 0.66 + vnoise(x * 2.07 + 17.3, y * 2.07 - 9.1, s + 1) * 0.34;
    // 거리 변환 (두 번 훑는 chamfer, 칸) — D: 0 = 꺼진 칸, 큰 값 = 켜진 칸 → 가장 가까운 꺼진 칸(격자 밖 포함)까지 거리
    function chamfer(D, gw, gh) {
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const n = j * gw + i; if (!D[n]) continue;
        let v = D[n];
        if (i > 0) v = Math.min(v, D[n - 1] + 1); else v = Math.min(v, 1);
        if (j > 0) { v = Math.min(v, D[n - gw] + 1); if (i > 0) v = Math.min(v, D[n - gw - 1] + 1.414); if (i < gw - 1) v = Math.min(v, D[n - gw + 1] + 1.414); } else v = Math.min(v, 1);
        D[n] = v;
      }
      for (let j = gh - 1; j >= 0; j--) for (let i = gw - 1; i >= 0; i--) {
        const n = j * gw + i; if (!D[n]) continue;
        let v = D[n];
        if (i < gw - 1) v = Math.min(v, D[n + 1] + 1); else v = Math.min(v, 1);
        if (j < gh - 1) { v = Math.min(v, D[n + gw] + 1); if (i < gw - 1) v = Math.min(v, D[n + gw + 1] + 1.414); if (i > 0) v = Math.min(v, D[n + gw - 1] + 1.414); } else v = Math.min(v, 1);
        D[n] = v;
      }
    }
    function gridArrays(n) {
      if (lOn.length >= n) return;
      lCs = new Uint8Array(n); lFd = new Uint8Array(n); lB = new Float32Array(n); lT = new Float32Array(n); lOn = new Uint8Array(n); lD = new Float32Array(n); lVein = new Uint8Array(n);
      lEdge = new Int32Array(n); lEdgeBase = new Uint8Array(n); lL = new Float32Array(n); lBorn = new Float32Array(n); young = new Int32Array(n); lTx = new Uint8Array(n);
    }
    // 밀도장 · 잎맥 · 거리 · 칸 색 — 덮인 칸 · 확대 · 다이얼이 바뀔 때만 (최대 fieldHz 번/초)
    function computeField() {
      const L = M.leafy;
      let P = L.pixel * sizeK, sx0 = 0, sy0 = 0, gw = 1, gh = 1;
      for (let k = 0; k < 4; k++) {
        sx0 = ((vox % P) + P) % P - P; sy0 = ((voy % P) + P) % P - P;   // 칸 경계가 내용과 함께 움직이게 (이동해도 칸이 미끄러지지 않음)
        gw = Math.ceil((Wc - sx0) / P) + 1; gh = Math.ceil((Hc - sy0) / P) + 1;
        if (gw * gh <= L.maxCells) break;
        P *= Math.sqrt(gw * gh / L.maxCells) * 1.02;
      }
      const N = gw * gh; gridArrays(N);
      if (colC.length < gw) { colC = new Int32Array(gw); colFx = new Float32Array(gw); }
      if (rowR.length < gh) { rowR = new Int32Array(gh); rowFy = new Float32Array(gh); }
      const gi0 = Math.round((sx0 - vox) / P), gj0 = Math.round((sy0 - voy) / P);
      Object.assign(LF, { P, sx0, sy0, gw, gh, gi0, gj0, vz, vox, voy, ok: true });
      for (let i = 0; i < gw; i++) { const fx = (sx0 + (i + 0.5) * P - vox) / vz, c = Math.floor(fx / M.occ); colFx[i] = fx; colC[i] = c >= 0 && c < OW ? c : -1; }
      for (let j = 0; j < gh; j++) { const fy = (sy0 + (j + 0.5) * P - voy) / vz, r = Math.floor(fy / M.occ); rowFy[j] = fy; rowR[j] = r >= 0 && r < OH ? r : -1; }
      // 1. 덮인 칸 · 자랄 수 있는 칸
      for (let j = 0; j < gh; j++) {
        const r = rowR[j];
        for (let i = 0; i < gw; i++) {
          const n = j * gw + i, c = colC[i];
          if (r < 0 || c < 0) { lCs[n] = 0; lFd[n] = 0; lL[n] = L.outLum; lBorn[n] = -1e9; lTx[n] = 0; continue; }
          const q = r * OW + c, lv = lumC[q]; lCs[n] = cov[q]; lFd[n] = food[q] >= 0.5 ? 1 : 0; lTx[n] = textC[q];
          lBorn[n] = cov[q] ? bornT[q] + hashN(gi0 + i, gj0 + j, 17) * L.growJitter : -1e9;   // 알갱이마다 조금씩 늦게 돋음
          lL[n] = lv >= 0 ? Math.pow(lv, L.photoGamma) : L.outLum;
        }
      }
      // 2. 흐리게 (가로 → 세로 box blur)
      const R = Math.max(1, Math.round(L.blur)), win = 2 * R + 1;
      for (let j = 0; j < gh; j++) {
        let s = 0; const o = j * gw;
        for (let i = -R; i <= R; i++) if (i >= 0 && i < gw) s += lCs[o + i];
        for (let i = 0; i < gw; i++) { lT[o + i] = s; const a = i - R, b = i + R + 1; if (a >= 0) s -= lCs[o + a]; if (b < gw) s += lCs[o + b]; }
      }
      for (let i = 0; i < gw; i++) {
        let s = 0;
        for (let j = -R; j <= R; j++) if (j >= 0 && j < gh) s += lT[j * gw + i];
        for (let j = 0; j < gh; j++) { lB[j * gw + i] = s / (win * win); const a = j - R, b = j + R + 1; if (a >= 0) s -= lT[a * gw + i]; if (b < gh) s += lT[b * gw + i]; }
      }
      // 3. 잎맥 → 칸 (격자 해상도 캔버스에 선으로 그려 읽음)
      lVein.fill(0, 0, N);
      if (veins.length) {
        if (veinCv.width !== gw || veinCv.height !== gh) { veinCv.width = gw; veinCv.height = gh; } else { veinG.setTransform(1, 0, 0, 1, 0, 0); veinG.clearRect(0, 0, gw, gh); }
        const k = vz / P; veinG.setTransform(k, 0, 0, k, (vox - sx0) / P, (voy - sy0) / P);
        veinG.lineCap = 'round'; veinG.strokeStyle = '#fff';
        for (const v of veins) { veinG.lineWidth = v[4] / k; veinG.beginPath(); veinG.moveTo(v[0], v[1]); veinG.lineTo(v[2], v[3]); veinG.stroke(); }
        const a = veinG.getImageData(0, 0, gw, gh).data;
        for (let n = 0; n < N; n++) lVein[n] = a[n * 4 + 3] > 110 && !lTx[n] ? 1 : 0;   // 글자 획은 잎맥으로 끊지 않음
        // 사진의 윤곽 · 무늬가 센 곳(눈 · 입 등)에서는 맥이 끊김 — 맥이 피사체를 가리지 않게
        for (let j = 0; j < gh; j++) { const r = rowR[j]; if (r < 0) continue; for (let i = 0; i < gw; i++) { const n = j * gw + i, c = colC[i]; if (!lVein[n] || c < 0) continue; const q = r * OW + c; if (lumC[q] >= 0 && feat[q] > L.veinKeep) lVein[n] = 0; } }
      }
      // 4. 켜고 끄기 — 흐린 값 + 노이즈 > 문턱 (+ Bayer 디더). 문턱 근처 칸은 바람에 깜박일 후보
      //  바깥 가장자리에서 가까울수록(lT = 거리) 빈칸이 많은 잎살 띠, 안쪽은 꽉 참 — 맥은 빼고 재서 맥 선은 또렷하게 (맥 둘레는 민트로 빛남)
      for (let n = 0; n < N; n++) lT[n] = lCs[n] && lFd[n] ? 1e6 : 0;
      chamfer(lT, gw, gh);
      const th = lerp(L.thresh, Math.min(1, Math.max(0, (dens - M.dens[0]) / (M.dens[1] - M.dens[0]))));
      lEdgeN = 0;
      for (let j = 0; j < gh; j++) {
        const fy = rowFy[j], gj = gj0 + j;
        for (let i = 0; i < gw; i++) {
          const n = j * gw + i, b = lB[n];
          if (lTx[n]) { lOn[n] = lCs[n] && lFd[n] ? 1 : 0; continue; }   // 친 글자: 덮인 칸은 빈칸 없이 꽉 (글자 모양 그대로)
          if (!lFd[n] || b < 0.02 || lVein[n]) { lOn[n] = 0; continue; }
          const gi = gi0 + i, e = 1 - sstep(1.5, L.spongeW, lT[n]);
          const v = b + L.lowAmp * (fbm(colFx[i] / L.lowScale, fy / L.lowScale, 3) * 2 - 1) + L.highAmp * (L.inner + (1 - L.inner) * e) * (vnoise(gi / L.highScale, gj / L.highScale, 7) * 2 - 1) - L.sponge * e + L.photoDens * (lL[n] - 0.5);   // 사진이 어두운 곳은 성기게
          const thr = th + (BAYER[(gj & 3) * 4 + (gi & 3)] - 0.5) * L.dither;
          lOn[n] = v > thr ? 1 : 0;
          if (Math.abs(v - thr) < L.flickBand && b > 0.12) { lEdge[lEdgeN] = n; lEdgeBase[lEdgeN++] = lOn[n]; }
        }
      }
      // 5. 거리 — 켜진 칸에서 가장 가까운 꺼진 칸까지 (두 번 훑는 chamfer)
      for (let n = 0; n < N; n++) lD[n] = lOn[n] ? 1e6 : 0;
      chamfer(lD, gw, gh);
      // 6. 칸 색 — 가장자리 민트 → 안쪽 초록 (칸마다 살짝 다른 밝기)
      if (cellCv.width !== gw || cellCv.height !== gh || !cellImg) { cellCv.width = poolCv.width = gw; cellCv.height = poolCv.height = gh; cellImg = cellG.createImageData(gw, gh); poolImg = poolG.createImageData(gw, gh); }
      const E = rgbOf(L.edge), Mi = rgbOf(L.mid), px = cellImg.data;
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const n = j * gw + i, o = n * 4;
        if (!lOn[n]) { px[o + 3] = 0; continue; }
        const C = rampAt(toneOf(n)), f = 1 + (hashN(gi0 + i, gj0 + j, 5) - 0.5) * 2 * L.tint;
        px[o] = Math.min(255, C[0] * f); px[o + 1] = Math.min(255, C[1] * f); px[o + 2] = Math.min(255, C[2] * f); px[o + 3] = 255;
      }
      // 깜박임 후보 중 꺼진 칸은 켜질 때 쓸 색(가장자리 민트)을 미리
      for (let k = 0; k < lEdgeN; k++) { const o = lEdge[k] * 4; if (!lEdgeBase[k]) { px[o] = E[0]; px[o + 1] = E[1]; px[o + 2] = E[2]; } }
      if (L.shape === 'moss') drawGrains();
    }

    // 이끼 알갱이 — 네모 칸 대신, 칸마다 작은 이끼 방석(가운데 그늘 + 사방으로 뻗은 잎 몇 장 + 밝은 잎끝)을 조금씩 어긋나게 찍음
    //  색은 칸 색과 같은 단계(가장자리 민트 → 안쪽 초록)를 미리 그려 둔 그림판에서 고름. 알갱이가 이웃과 겹쳐 격자가 드러나지 않음
    const G_TONES = 9, G_VARS = 8;   // 색 단계 (ramp 를 따라) × 모양
    let gAtlas = null, gAtlasKey = '';
    const grainCv = document.createElement('canvas'), grainG = grainCv.getContext('2d');
    const edgeCv = document.createElement('canvas'), edgeG = edgeCv.getContext('2d');
    function grainAtlas(cd) {
      const L = M.leafy, key = cd.toFixed(2) + L.ramp.join() + L.grainR;
      if (gAtlas && gAtlasKey === key) return gAtlas;
      const r = cd * L.grainR, S = Math.ceil(r * 2.4) + 2, list = [];
      for (let q = 0; q < G_TONES; q++) {
        const col = rampAt(q / (G_TONES - 1));
        const css = (k, a) => `rgba(${col.map((v) => Math.min(255, Math.round(v * k))).join(',')},${a})`;
        for (let v = 0; v < G_VARS; v++) {
          let s = (q * 977 + v * 7919 + 13) >>> 0; const R = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
          const c = document.createElement('canvas'); c.width = c.height = S;
          const g = c.getContext('2d'); g.translate(S / 2, S / 2);
          // 바닥 그늘 (방석 아래쪽이 살짝 어두움)
          g.fillStyle = css(0.62, 0.85); g.beginPath(); g.ellipse(0, r * 0.12, r * 0.62, r * 0.55, 0, 0, 6.2832); g.fill();
          // 잎 몇 장 — 가운데에서 사방으로, 길이 · 밝기가 조금씩 다름
          const n = 5 + ((R() * 4) | 0), rot = R() * 6.2832;
          for (let j = 0; j < n; j++) {
            const a = rot + j * 6.2832 / n + (R() - 0.5) * 0.6, L2 = r * (0.62 + R() * 0.38), w = r * (0.24 + R() * 0.12);
            g.save(); g.rotate(a);
            g.fillStyle = css(0.88 + R() * 0.26, 1); g.beginPath(); g.ellipse(L2 * 0.5, 0, L2 * 0.5, w, 0, 0, 6.2832); g.fill();
            if (R() < 0.7) { g.fillStyle = css(1.18, 0.9); g.beginPath(); g.arc(L2 * 0.88, 0, Math.max(0.5, w * 0.55), 0, 6.2832); g.fill(); }   // 잎끝 광택
            g.restore();
          }
          g.fillStyle = css(1.05, 1); g.beginPath(); g.arc(0, 0, r * 0.26, 0, 6.2832); g.fill();
          list.push(c);
        }
      }
      gAtlasKey = key;
      return (gAtlas = { list, S });
    }
    // 한 칸의 알갱이를 찍음 (자리 · 모양 · 크기는 칸마다 늘 같게 — 다시 그려도 흔들리지 않음)
    //  grow = 크기 배율 (돋는 중 · 커서에 부풂), ox · oy = 비켜난 거리 (기기 px)
    function stampGrain(g, A, n, toneT, grow = 1, ox = 0, oy = 0) {
      const L = M.leafy, { gw, P, sx0, sy0, gi0, gj0 } = LF, i = n % gw, j = (n / gw) | 0, gi = gi0 + i, gj = gj0 + j, cd = P * dpr;
      const h1 = hashN(gi, gj, 13), h2 = hashN(gi, gj, 14), h3 = hashN(gi, gj, 15);
      const q = Math.max(0, Math.min(G_TONES - 1, Math.round(toneT * (G_TONES - 1) + (h3 - 0.5) * 1.2)));
      const tx = lTx[n], jt = tx ? L.jitter * 0.3 : L.jitter;   // 친 글자: 알갱이를 덜 어긋나게 · 조금 작게 → 획 가장자리가 또렷
      const k = (0.8 + h3 * 0.45) * grow * (tx ? 0.85 : 1), sz = A.S * k;
      if (sz < 0.5) return;
      const x = (sx0 + (i + 0.5) * P) * dpr + (h1 - 0.5) * 2 * jt * cd - sz / 2 + ox;
      const y = (sy0 + (j + 0.5) * P) * dpr + (h2 - 0.5) * 2 * jt * cd - sz / 2 + oy;
      g.drawImage(A.list[q * G_VARS + (((h1 * 997) | 0) % G_VARS)], x, y, sz, sz);
    }
    // 켜진 칸 전부 (깜박임 후보는 빼고) — 필드를 다시 계산할 때만. 안쪽 먼저, 가장자리(밝은 민트)를 위에
    function drawGrains() {
      const L = M.leafy, N = LF.gw * LF.gh, A = grainAtlas(LF.P * dpr);
      if (grainCv.width !== canvas.width || grainCv.height !== canvas.height) { grainCv.width = canvas.width; grainCv.height = canvas.height; } else grainG.clearRect(0, 0, grainCv.width, grainCv.height);
      const skip = new Uint8Array(N); for (let k = 0; k < lEdgeN; k++) skip[lEdge[k]] = 1;
      // 아직 자라는 알갱이(덮인 지 growIn 초가 안 됨)는 빼 두고 매 프레임 따로 그림
      youngN = 0; youngLast = -1e9;
      const ripe = clock - L.growIn;
      for (let n = 0; n < N; n++) if (lOn[n] && !skip[n] && lBorn[n] > ripe) { young[youngN++] = n; skip[n] = 1; if (lBorn[n] > youngLast) youngLast = lBorn[n]; }
      for (let pass = 0; pass < 2; pass++) for (let n = 0; n < N; n++) {
        if (!lOn[n] || skip[n]) continue;
        const d = lD[n], edge = d < 1.8;
        if ((pass === 1) !== edge) continue;
        stampGrain(grainG, A, n, toneOf(n));
      }
    }
    // 돋는 알갱이 크기 (0 → 1, 끝에서 살짝 넘쳤다 돌아옴) · 처음엔 밝은 연두
    const growK = (n) => { const t = Math.min(1, Math.max(0, (clock - lBorn[n]) / M.leafy.growIn)); return t >= 1 ? 1 : 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2; };
    function drawYoung(g, A) {
      for (let k = 0; k < youngN; k++) { const n = young[k], e = growK(n); if (e > 0.02) stampGrain(g, A, n, toneOf(n) - 0.3 * (1 - Math.min(1, e)), e); }
    }
    // 커서 둘레: 알갱이 층에 구멍을 내고, 그 안 알갱이를 비켜나게 · 떨리게 다시 찍음 (구멍 가장자리에서는 비켜남이 0 이라 이음매가 없음)
    function drawTouch(g, A, s) {
      const T2 = M.leafy.touch, { gw, gh, P, sx0, sy0 } = LF, px = cellImg.data;
      const cx = touch.x * LF.vz + LF.vox, cy = touch.y * LF.vz + LF.voy, R = T2.radius / s;   // 필드를 계산한 때의 화면 기준 (CSS px)
      g.save(); g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(cx * dpr, cy * dpr, R * dpr, 0, 6.2832); g.fill();
      g.restore();
      const reach = R + P * 1.6, i0 = Math.max(0, Math.floor((cx - reach - sx0) / P)), i1 = Math.min(gw - 1, Math.ceil((cx + reach - sx0) / P));
      const j0 = Math.max(0, Math.floor((cy - reach - sy0) / P)), j1 = Math.min(gh - 1, Math.ceil((cy + reach - sy0) / P));
      const edgeSet = new Set(); for (let k = 0; k < lEdgeN; k++) edgeSet.add(lEdge[k]);
      const amp = touch.act, shk = (touch.stir + 0.18 * amp) * T2.shake / s;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const n = j * gw + i, on = edgeSet.has(n) ? px[n * 4 + 3] > 0 : lOn[n];
        if (!on) continue;
        const dx = sx0 + (i + 0.5) * P - cx, dy = sy0 + (j + 0.5) * P - cy, d = Math.hypot(dx, dy);
        if (d > reach) continue;
        const f = d < R ? (1 - d / R) ** 2 : 0, ph = hashN(i, j, 19) * 6.2832, w = touch.t * T2.shakeHz * 6.2832;
        const push = T2.push / s * amp * f, ux = d > 0.01 ? dx / d : 0, uy = d > 0.01 ? dy / d : 0;
        const ox = ux * push + Math.sin(w + ph) * shk * f, oy = uy * push + Math.cos(w * 0.83 + ph * 1.7) * shk * f;
        const e = lBorn[n] > clock - M.leafy.growIn ? growK(n) : 1;
        stampGrain(g, A, n, toneOf(n) - T2.lift * f * amp, e * (1 + T2.lift * f * amp), ox * dpr, oy * dpr);
      }
    }
    // 깜박임 후보 알갱이 — 지금 켜진 것만 (바람이 불면 swayFps 로)
    function drawEdgeGrains() {
      const A = grainAtlas(LF.P * dpr), px = cellImg.data;
      if (edgeCv.width !== canvas.width || edgeCv.height !== canvas.height) { edgeCv.width = canvas.width; edgeCv.height = canvas.height; } else edgeG.clearRect(0, 0, edgeCv.width, edgeCv.height);
      for (let k = 0; k < lEdgeN; k++) { const n = lEdge[k]; if (px[n * 4 + 3]) stampGrain(edgeG, A, n, lOn[n] ? toneOf(n) : (1 - lL[n]) * M.leafy.photoTone * 0.8); }
    }
    // 웅덩이 (+ 둘레 밝은 번짐) · 가장자리 깜박임 — 바람이 불면 swayFps 로 다시
    function computePools(windy) {
      const L = M.leafy, { gw, gh } = LF, N = gw * gh, pd = poolImg.data, px = cellImg.data;
      pd.fill(0, 0, N * 4);
      const Pc = rgbOf(L.pool), Pd = rgbOf(L.poolDeep), Gl = rgbOf(L.glow);
      const dx = poolClock * L.drift, dm = poolClock * L.drift * L.morph * 6, sc = L.poolScale, th = L.poolTh, so = L.poolSoft, md = L.poolMinD;
      for (let j = 0; j < gh; j++) {
        const fy = rowFy[j];
        for (let i = 0; i < gw; i++) {
          const n = j * gw + i, d = lD[n];
          if (!lOn[n] || lTx[n] || d < md - 2.5) continue;   // 글자 위에는 웅덩이 없음
          const fx = colFx[i];
          // 두 겹 노이즈가 서로 다른 쪽으로 흘러 웅덩이가 흐르며 모양도 일렁임
          const wave = vnoise((fx - dx) / sc, (fy - dx * 0.35) / sc, 21) * 0.68 + vnoise((fx + dm) / (sc * 0.55), (fy - dm * 0.7) / (sc * 0.55), 22) * 0.32;
          const low = wave * (1 - L.photoPool) + (1 - lL[n]) * L.photoPool;   // 사진의 어두운 곳에 웅덩이가 고임 (바람이 불면 그 위에서 일렁임)
          const p = sstep(th, th + so, low) * sstep(md - 1.5, md + 0.5, d);
          const ring = L.glowAmt * sstep(th - so * 1.6, th, low) * (1 - p) * sstep(md - 2.5, md - 0.5, d);
          const a = p + ring * (1 - p);
          if (a < 0.01) continue;
          const deep = sstep(th + so, th + so * 3.2, low), o = n * 4, wp = p / a, wr = 1 - wp;
          pd[o] = (Pc[0] + (Pd[0] - Pc[0]) * deep) * wp + Gl[0] * wr;
          pd[o + 1] = (Pc[1] + (Pd[1] - Pc[1]) * deep) * wp + Gl[1] * wr;
          pd[o + 2] = (Pc[2] + (Pd[2] - Pc[2]) * deep) * wp + Gl[2] * wr;
          pd[o + 3] = a * 255;
        }
      }
      // 가장자리 디더 칸 깜박임 (바람 세기만큼)
      const tick = Math.floor(clock * L.flickRate), pf = windy ? air * L.flicker : 0;
      for (let k = 0; k < lEdgeN; k++) {
        const n = lEdge[k], flip = pf > 0 && hashN(n, tick, 9) < pf;
        px[n * 4 + 3] = (lEdgeBase[k] ? !flip : flip) ? 255 : 0;
      }
      if (L.shape === 'moss') drawEdgeGrains();   // 깜박이는 가장자리 알갱이만 다시 찍음
      cellG.putImageData(cellImg, 0, 0);
      poolG.putImageData(poolImg, 0, 0);
      // 웅덩이 층은 격자 해상도에서 흐리게 (화면 해상도에서 흐리는 것보다 훨씬 가벼움) → 그릴 때 부드럽게 확대
      if (poolBlurCv.width !== gw || poolBlurCv.height !== gh) { poolBlurCv.width = gw; poolBlurCv.height = gh; } else pbG.clearRect(0, 0, gw, gh);
      pbG.filter = `blur(${L.poolBlur}px)`; pbG.drawImage(poolCv, 0, 0); pbG.filter = 'none';
    }
    // 그레인 무늬 (웅덩이 위 고운 모래알 — 흰/검은 점, 밝기 ±grain)
    function grain() {
      if (grainPat) return grainPat;
      const S = 192, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d'), im = g.createImageData(S, S), A = M.leafy.grain * 255;
      for (let i = 0; i < S * S; i++) { const v = Math.random() * 2 - 1, o = i * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = v > 0 ? 255 : 0; im.data[o + 3] = Math.abs(v) * A; }
      g.putImageData(im, 0, 0);
      return (grainPat = layG.createPattern(c, 'repeat'));
    }
    // 칸 색(네모 그대로 확대) + 웅덩이 층(흐리게 · 그레인 · 켜진 칸 모양으로 잘라) — 필드를 계산한 뒤 확대가 바뀌면 그 차이만큼 옮겨 그림
    function compose() {
      const W = canvas.width, H = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      if (!LF.ok || K < 0.003) return;
      const s = vz / LF.vz, tx = vox - LF.vox * s, ty = voy - LF.voy * s;
      const X = (tx + LF.sx0 * s) * dpr, Y = (ty + LF.sy0 * s) * dpr, Wd = LF.gw * LF.P * s * dpr, Hd = LF.gh * LF.P * s * dpr;
      const moss = M.leafy.shape === 'moss' && grainCv.width === W && grainCv.height === H;
      // 이끼 알갱이 층: 필드를 계산한 때의 화면 기준 → 지금 확대 · 이동만큼 옮겨 그림
      // edge = false: 웅덩이를 자를 때 — 깜박이는 가장자리 층까지 destination-in 으로 그리면 나머지가 다 지워지므로 본 알갱이 층만
      const onGrains = (g, edge = true) => { g.setTransform(s, 0, 0, s, tx * dpr, ty * dpr); g.drawImage(grainCv, 0, 0); if (edge && edgeCv.width === W) g.drawImage(edgeCv, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0); };
      ctx.globalAlpha = K; ctx.imageSmoothingEnabled = false;
      if (moss) { ctx.imageSmoothingEnabled = true; onGrains(ctx); } else ctx.drawImage(cellCv, X, Y, Wd, Hd);
      if (layer.width !== W || layer.height !== H) { layer.width = W; layer.height = H; }
      layG.setTransform(1, 0, 0, 1, 0, 0); layG.clearRect(0, 0, W, H);
      layG.imageSmoothingEnabled = true; layG.imageSmoothingQuality = 'high';
      layG.drawImage(poolBlurCv, X, Y, Wd, Hd);
      layG.globalCompositeOperation = 'source-atop'; layG.fillStyle = grain(); layG.fillRect(0, 0, W, H);
      layG.globalCompositeOperation = 'destination-in';
      if (moss) onGrains(layG, false); else { layG.imageSmoothingEnabled = false; layG.drawImage(cellCv, X, Y, Wd, Hd); }
      layG.globalCompositeOperation = 'source-over';
      ctx.drawImage(layer, 0, 0);
      // 돋는 알갱이 · 커서 둘레 (매 프레임 — 그 알갱이들만)
      if (moss && (youngN || touchLive())) {
        const A = grainAtlas(LF.P * dpr);
        ctx.setTransform(s, 0, 0, s, tx * dpr, ty * dpr);
        if (youngN) drawYoung(ctx, A);
        if (touchLive()) drawTouch(ctx, A, s);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
    }
    const touchLive = () => touch.act > 0.003 || touch.stir > 0.01;
    // 커서 아래(반경 2칸)에 이끼가 피어 있는지
    function overMoss() {
      if (!LF.ok) return false;
      const ci = Math.floor((touch.x * LF.vz + LF.vox - LF.sx0) / LF.P), cj = Math.floor((touch.y * LF.vz + LF.voy - LF.sy0) / LF.P);
      for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) if (i >= 0 && j >= 0 && i < LF.gw && j < LF.gh && lOn[j * LF.gw + i]) return true;
      return false;
    }
    function drawLeafy(animate) {
      const L = M.leafy, now = performance.now();
      if (lastStyle !== 'leafy') { lastStyle = 'leafy'; fieldSig = ''; composeSig = ''; }
      if (K < 0.003 || (!photos.length && !rimTotal)) {
        if (composeSig !== 'empty') { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); composeSig = 'empty'; }
        return;
      }
      const want = [covVer, veinVer, Math.round(sizeK * 50), Math.round(dens * 100), vz, vox, voy, Wc, Hc, dpr, L.shape].join('|');
      if (want !== fieldSig && now - fieldT >= 1000 / L.fieldHz) { computeField(); fieldSig = want; fieldT = now; poolDirty = true; }
      const windy = air > 0.01;
      if (animate && windy) poolDirty = true;
      let changed = false;
      if (poolDirty && LF.ok) { computePools(windy); poolDirty = false; changed = true; }
      // 돋는 알갱이가 다 자랐으면 본 층으로 옮기도록 한 번 더 계산
      const growing = youngN > 0 && clock - youngLast < L.growIn + 0.05;
      if (youngN > 0 && !growing) fieldSig = '';
      const live = growing || touchLive() || touchWas;
      touchWas = touchLive();   // 커서 반응이 끝난 다음 프레임에 제자리 모습으로 한 번 더
      const cs = [vz, vox, voy, K.toFixed(3), canvas.width, canvas.height].join('|');
      if (changed || cs !== composeSig || live) { compose(); composeSig = cs; }
    }
    let touchWas = false;

    function resetGrowth() {
      sprigs.length = 0; recent = []; front = []; fpos = new Int32Array(cov.length).fill(-1); cov.fill(0); covVer++; covCount = 0; rimCov = 0; gt = 0; done = false; fill = new Map(); drawn = ''; stillSig = '';
    }

    return {
      canvas,
      resize() { resize(); draw(); },
      setView(z, ox, oy) { vz = z; vox = ox; voy = oy; },
      // 커서 (확대 전 프레임 px, null = 화면 밖) — 이끼 위에서 움직이면 떨림이 쌓임
      pointer(x, y) {
        if (x == null) { touch.on = false; return; }
        if (touch.on && touch.act > 0.1) touch.stir = Math.min(1.5, touch.stir + Math.hypot(x - touch.x, y - touch.y) * vz * M.leafy.touch.stirGain);
        touch.x = x; touch.y = y; touch.on = true;
      },
      syncPhotos(ps) { photos = ps.filter((p) => p.mask); },
      setReactivity(v) { react = Math.min(1, Math.max(0, v)); },
      // 피사체 안을 클릭하면 그 자리에 이끼 한 무더기
      spawn(x, y) { buildFood(); if (!inMask(x, y)) return false; clump(x, y, 6 + Math.round(react * 8)); return true; },
      // T·RH·O2 = 이끼가 자랄지 정하는 값, dT·dRH·dO2 = 다이얼 값 (싹 크기·밀도·바람 — 없으면 T·RH·O2)
      // T · RH · O2 · L = 켜질지 정하는 값, dRH · dL = 다이얼 값 (밀도 · 크기 — 없으면 RH · L), rate = Growth Rate 0~1 (흔들림)
      update(dt, vitality, T, RH, O2, L, dRH, dL, rate) {
        strength = DT.mossStrength(vitality, T, RH, O2, L);
        const lx = Math.log10(Math.max(1e-3, dL == null ? (L == null ? M.growLight[0] : L) : dL));
        const g2 = sstep(Math.log10(M.growLight[0]), Math.log10(M.growLight[1]), lx);   // 빛 ↑ → 싹이 커지고 윤곽 밖으로 더 번짐
        sizeK = lerp([M.sizeK[1], M.sizeK[0]], g2) * lerp(M.growSize, g2);   // 예전 최소(따뜻 × 산소 낮음) ~ 최대(추움 × 산소 높음)와 같은 범위
        haloK = Math.round(lerp(M.growHalo, g2) * 10) / 10;   // 0.1 단위 (다이얼을 돌리는 동안 매번 다시 계산하지 않게)
        dens = lerp(M.dens, sstep(M.densRH[0], M.densRH[1], dRH == null ? RH : dRH));
        air = sstep(M.swayRate[0], M.swayRate[1], rate == null ? 0.5 : rate);
        const on = strength > 0;
        if (dt > 0) { K += Math.sign((on ? 1 : 0) - K) * Math.min(Math.abs((on ? 1 : 0) - K), dt / M.fadeIn); clock += dt; poolClock += dt * air; }   // poolClock: 'leafy' 웅덩이가 바람만큼 흘러감
        if (on && dt > 0) {
          buildFood();
          const FT = fullTime(), late = gt >= FT * M.doneAfter;   // 너무 오래 걸리면 덜 덮여도 멈춤
          const photoGrow = maskCount && !done, rimGrow = rimTotal && rimCov < rimTotal * 0.97 && gt < FT * M.rimTime * M.doneAfter;   // 피사체(+윤곽 밖) · 화면 테두리
          if (photoGrow || rimGrow) {
            gt += dt;
            // 지금쯤 덮였어야 할 정도(경과 / fullTime)에 맞춰 돋는 수를 조절 — 더 뒤처진 쪽 기준
            const lagP = photoGrow ? Math.min(1, gt / FT) - covRatio() : -1;
            const lagR = rimGrow ? Math.min(1, gt / (FT * M.rimTime)) - rimCov / rimTotal : -1;
            const cells = (photoGrow ? maskCount : 0) + (rimGrow ? rimTotal / M.rimTime : 0);
            const base = cells / FT * Math.min(dt, 0.1) / 2.6;   // 싹 하나가 대략 2.6 칸을 새로 덮음
            spread(Math.max(1, Math.round(base * Math.min(10, Math.max(0.15, 1 + Math.max(lagP, lagR) * 14)))));
            if (photoGrow && (covRatio() >= 0.995 || (covRatio() >= 0.97 && gt >= FT) || late)) done = true;   // 다 자람 → 그대로 멈춤
          }
          fillT -= dt; if (fillT <= 0) { fillT = 0.5; measureFill(); }
        }
        // 커서 반응: 이끼 위에 대면 빨리 커지고, 떼면 천천히 줄어듦 · 떨림은 저절로 잦아듦
        if (dt > 0) {
          const T2 = M.leafy.touch, over = touch.on && M.style !== 'sprig' && M.leafy.shape === 'moss' && K > 0.1 && overMoss();
          touch.act += ((over ? 1 : 0) - touch.act) * Math.min(1, dt * (over ? T2.rise : T2.fall));
          touch.stir *= Math.exp(-dt * T2.stirDecay); touch.t += dt;
          if (touch.act < 0.003) touch.act = 0; if (touch.stir < 0.01) touch.stir = 0;
        }
        // 흔들리는 동안은 swayFps 로만 다시 그림 (무겁지 않게)
        swayT += dt;
        const tick = swayT >= 1 / M.swayFps;
        if (tick) swayT = 0;
        draw(tick);
      },
      photoFill(key) { return (fill.get(key) || 0) * K; },
      get visible() { return K; },
      get strength() { return strength; },
      get count() { return sprigs.length; },
      get coverage() { return done ? 1 : Math.min(1, covRatio()); },
      get grown() { return done; },
      clear() { resetGrowth(); seenKeys.clear(); foodKey = ''; clipKey = ''; maskCount = 0; K = 0; draw(); },
    };
  };
})(window.DT = window.DT || {});
