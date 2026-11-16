/*
 * 환경(장면) 정의 — 좌우로 넘기면 이 순서대로 바뀝니다.
 *  env     : 패턴 계산에 쓰는 환경값 (config.js 의 DT.WEATHER_MAP 으로 보정). null 이면 보정 없음
 *  display : 패널에 보여 줄 값
 *  preset  : 이 환경에 들어올 때 고르는 패턴 프리셋
 *  palette : 배경(위·아래 그라데이션)과 패턴 색
 *  glyph   : 글자 형태 — weight, outline(획만, 글자크기 대비 두께), swell(획 부풀림),
 *            tracking(자간), scaleX(가로 비율), skew(기울기), wave(물결 왜곡 {amp, period})
 *  dots    : 글자를 이루는 점 — style(glow|crisp|soft|sand|bubble), color, size, motion
 *  ambient : 배경 입자 — stars | snow | rain | sand | ocean | none
 *  globe   : 시작 화면 지구본 위 표식 위치 {lat, lon, alt(1 = 표면, 1 초과 = 궤도)}
 *  float   : 글자 부유 {amp(px), speed} — 아주 작고 느리게
 *  frost   : true 면 글자 면에서 성에 결정이 자람 (js/frost.js)
 *  screen  : 배경 질감 {grain, fog, edge} (없으면 0) · palette.fog 는 안개/서리빛 색
 *  tone    : 'light' 면 화면 위 글씨를 어둡게 · patternOpacity: 반응–확산 패턴 표시 비율(기본 1)
 * 모든 값은 예술적 해석이며 실제 환경을 예측하지 않습니다.
 */
(function (DT) {
  'use strict';

  DT.SCENES = [
    {
      id: 'space', name: 'Outer Space', sub: 'Silent vacuum', en: 'OUTER SPACE', enSub: 'SILENT VACUUM',
      globe: { lat: 28, lon: 300, alt: 1.28 },   // 지구본 궤도 위 표식
      env: null,
      display: [['Temperature', '—'], ['Humidity', '—'], ['Wind', '—'], ['Precipitation', '—']],
      preset: 'maze',
      palette: {
        bgTop: [0.008, 0.010, 0.018], bgBot: [0.008, 0.010, 0.018],
        deep: [0.030, 0.065, 0.140], teal: [0.100, 0.360, 0.520], lime: [0.600, 0.820, 0.900],
        warmTeal: [0.330, 0.190, 0.470], warmLime: [0.960, 0.760, 0.680], ivory: [0.970, 0.955, 0.910],
      },
      glyph: { weight: 'bold' },
      dots: { style: 'glow', color: [0.97, 0.955, 0.91], size: 1, motion: 'breathe' },
      ambient: 'stars',
    },
    {
      id: 'polar', name: 'Polar Region', sub: 'Extremely cold and dry', en: 'POLAR REGION', enSub: 'EXTREMELY COLD AND DRY',
      globe: { lat: 68, lon: 10 },
      env: { temperature: -40, humidity: 12, windSpeed: 9, windDir: 60, precipitation: 0, cloud: 10 },
      display: [['Temperature', '−40 °C'], ['Humidity', '12 %'], ['Wind', '9 m/s NE'], ['Precipitation', '0 mm']],
      preset: 'cells',
      // 완전한 검정 (#000) — 얼어붙은 유리 너머의 어둠. 빛은 입김 응결과 얼음 글자에서만
      palette: {
        bgTop: [0, 0, 0], bgBot: [0, 0, 0],
        deep: [0.080, 0.130, 0.200], teal: [0.400, 0.570, 0.740], lime: [0.880, 0.950, 1.000],
        warmTeal: [0.400, 0.570, 0.740], warmLime: [0.880, 0.950, 1.000], ivory: [0.900, 0.950, 1.000],
      },
      // 커서를 움직이면 차가운 유리에 입김이 서렸다가 사라짐 (engine-gl.js 의 BREATH_STEP_FRAG) — 값은 표시 세기
      breath: 1,
      patternOpacity: 0,        // 글자 둘레 반응–확산 띠는 숨김 (계산은 유지) — 글자는 성에 밀도로만 읽힘
      // 면 글자 (외곽선 없음): 화면의 주인공이 되도록 크게. 길면 가로·세로 안에 맞춰 자동으로 줄어듦
      glyph: { weight: 'bold', tracking: 0.06, size: [0.6, 0.42], fit: [0.88, 0.62] },
      // 점은 글자를 모으는 동안만 보이고 성에가 피면 사라짐
      dots: { style: 'crisp', color: [0.93, 0.97, 1.0], size: 0.7, motion: 'frozen', fadeOnFrost: true },
      ambient: 'none',          // 눈 내림 없음 — 입자감은 화면 셰이더 grain 으로만
      float: { amp: 6, speed: 0.35 }, // 글자(성에)가 공기 중에 아주 천천히 미세하게 떠 있음 (px, 1920 폭 기준)
      // 성에 결정이 글자 가장자리 → 중앙, 창 테두리 → 안쪽으로 피어남 (js/frost.js)
      frost: true,
    },
    {
      id: 'jungle', name: 'Tropical Rainforest', sub: 'Extremely hot and humid', en: 'TROPICAL RAINFOREST', enSub: 'EXTREMELY HOT AND HUMID',
      globe: { lat: -4, lon: 82 },
      env: { temperature: 32, humidity: 96, windSpeed: 1, windDir: 180, precipitation: 3.5, cloud: 90 },
      display: [['Temperature', '32 °C'], ['Humidity', '96 %'], ['Wind', '1 m/s'], ['Precipitation', '3.5 mm showers']],
      preset: 'mold',
      palette: {
        bgTop: [0.020, 0.050, 0.030], bgBot: [0.004, 0.014, 0.008],
        deep: [0.030, 0.120, 0.060], teal: [0.100, 0.420, 0.220], lime: [0.620, 0.880, 0.350],
        warmTeal: [0.200, 0.420, 0.140], warmLime: [0.820, 0.920, 0.400], ivory: [0.900, 0.970, 0.800],
      },
      // 물을 머금고 부푼 둥근 굵은 글자
      glyph: { weight: 'bold', swell: 0.09, tracking: -0.02 },
      dots: { style: 'soft', color: [0.82, 0.96, 0.62], size: 1.15, motion: 'sway' },
      ambient: 'rain',
    },
    {
      id: 'desert', name: 'Desert', sub: 'Extremely hot and dry', en: 'DESERT', enSub: 'EXTREMELY HOT AND DRY',
      globe: { lat: 24, lon: 158 },
      env: { temperature: 48, humidity: 5, windSpeed: 13, windDir: 90, precipitation: 0, cloud: 0 },
      display: [['Temperature', '48 °C'], ['Humidity', '5 %'], ['Wind', '13 m/s E'], ['Precipitation', '0 mm']],
      preset: 'ripple',
      palette: {
        bgTop: [0.110, 0.055, 0.030], bgBot: [0.030, 0.014, 0.008],
        deep: [0.220, 0.100, 0.045], teal: [0.640, 0.370, 0.160], lime: [0.990, 0.800, 0.480],
        warmTeal: [0.700, 0.320, 0.130], warmLime: [1.000, 0.790, 0.430], ivory: [1.000, 0.900, 0.740],
      },
      // 바람에 기울고 열에 늘어진 넓은 글자
      glyph: { weight: 'bold', skew: -0.28, scaleX: 1.2, tracking: 0.03 },
      dots: { style: 'sand', color: [0.96, 0.80, 0.55], size: 0.95, motion: 'shimmer' },
      ambient: 'sand',
    },
    {
      id: 'ocean', name: 'Deep Sea', sub: 'Under cold dark water', en: 'DEEP SEA', enSub: 'UNDER COLD DARK WATER',
      globe: { lat: -30, lon: 232 },
      env: { temperature: 4, humidity: 100, windSpeed: 5, windDir: 270, precipitation: 1.2, cloud: 75 },
      display: [['Water temp', '4 °C'], ['Depth', '200 m'], ['Current', '0.5 m/s E'], ['Marine snow', 'Light']],
      preset: 'maze',
      palette: {
        bgTop: [0.020, 0.085, 0.135], bgBot: [0.002, 0.008, 0.022],
        deep: [0.020, 0.100, 0.180], teal: [0.050, 0.420, 0.550], lime: [0.450, 0.950, 0.920],
        warmTeal: [0.060, 0.400, 0.520], warmLime: [0.500, 0.950, 0.900], ivory: [0.800, 0.980, 1.000],
      },
      // 물결에 일렁이는 글자
      glyph: { weight: 'bold', wave: { amp: 0.1, period: 2.2 } },
      dots: { style: 'bubble', color: [0.62, 0.95, 1.0], size: 1.15, motion: 'bob' },
      ambient: 'ocean',
    },
  ];

  // 패턴·SVG 가 쓰는 현재 색 (장면이 바뀌면 app.js 가 교체)
  DT.applyScenePalette = function (scene) {
    const p = scene.palette;
    DT.PALETTE = Object.assign({}, p, {
      bg: p.bgTop.map((v, i) => (v + p.bgBot[i]) / 2),
    });
  };
  DT.applyScenePalette(DT.SCENES[0]);
})(window.DT = window.DT || {});
