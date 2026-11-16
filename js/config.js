/*
 * DIFFUSE TYPE — 설정 파일
 * 프리셋, 슬라이더 → 시뮬레이션 매핑, 날씨 → 시각 매핑, 색상, 안전 범위를 모두 이 파일에 모았습니다.
 * 값을 바꾼 뒤 브라우저를 새로고침하면 바로 반영됩니다.
 */
(function (DT) {
  'use strict';

  /*
   * 휴대폰·태블릿(터치 화면) = 메모리 절약 모드 — 아이폰 Safari·카카오톡 브라우저는 메모리 한도가 낮아 넘으면 탭이 다시 시작됨(처음 화면으로 튕김)
   *  - 작품 해상도: 격자 low (출력 1280×800, 데스크톱 1920×1200)
   *  - 효과 캔버스(미생물·기포·부식·사막·점균·이끼·성에 글자): 화면 배율 1 까지만 (데스크톱 1.5)
   *  URL ?quality=medium|high 를 주면 터치 화면이어도 그 값
   */
  DT.LOWMEM = !!(window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);
  DT.dprCap = DT.LOWMEM ? 1 : 9;

  DT.CONFIG = {
    defaultText: '',             // 첫 화면은 비어 있는 검은 우주
    maxTextLength: 24,
    textDebounceMs: 450,
    defaultSeed: 20261008,

    // GPU 시뮬레이션 격자(셀 수). URL ?quality=low|high 로 바꿀 수 있습니다.
    gpuGrid: { low: { w: 640, h: 400 }, medium: { w: 960, h: 600 }, high: { w: 1200, h: 750 } },
    // 화면/PNG 출력 해상도 = 격자 × outputScale
    gpuOutputScale: 2,
    gpuStepsPerSecond: 600,      // 성장 속도 1.0배일 때 초당 계산 단계 수
    gpuMaxStepsPerFrame: 32,     // 느린 기기에서 프레임이 밀려도 한 프레임에 이 이상 계산하지 않음
    gpuWarmupSteps: 1500,        // 점이 모인 직후 빠르게 피어나는 단계 수 (화면에 보이며 진행)
    gpuWarmupChunk: 30,          // 피어나는 동안 프레임당 단계 수 (평소의 약 3배 속도)

    // CPU 대체 모드 (WebGL2 + 부동소수점 렌더링 미지원 시)
    cpuGrid: { w: 320, h: 200 },
    cpuOutputScale: 3,
    cpuStepsPerSecond: 220,
    cpuMaxStepsPerFrame: 8,
    cpuWarmupSteps: 700,
    cpuWarmupChunk: 10,

    // 글자를 이루는 별가루 점
    particles: {
      maxDots: 5200,       // 글자 전체 점 개수 상한
      minSpacing: 3.6,     // 점 간격 최소값(px, 1920 폭 기준)
      dotSize: 0.3,        // 점 반지름 = 간격 × dotSize
      stagger: 0.9,        // 점마다 출발 지연 최대(초)
      spring: 9,           // 목표로 끌어당기는 힘
      damping: 5.2,        // 감쇠 (작을수록 출렁임)
      swirl: 2.6,          // 모여들 때 소용돌이 정도
      maxGather: 4.5,      // 이 시간이 지나면 다 모인 것으로 간주(초)
      fadeOut: 1.4,        // 흩어지는 점이 사라지는 시간(초)
      color: [0.97, 0.955, 0.91],
    },
    // 배경 별 (희미하게). 완전한 검정을 원하면 enabled: false
    starfield: { enabled: true, count: 220, maxAlpha: 0.32 },
    patternFade: 2.5,      // 패턴이 사라지고 나타나는 속도

    // 성장 가능 영역 (격자 960 기준 셀 단위, 격자 크기에 비례해 자동 환산)
    zoneStart: 5,                // 시작 반경
    zoneTau: 2600,               // 확장 시간상수(단계)
    zoneFeather: 6,              // 경계 부드러움
    maxErodeCells: 7,            // 침식 최대 깊이(획 두께의 30%를 넘지 않도록 추가 제한)
    dropInterval: 40,            // 빗방울 씨앗 판정 간격(단계)
  };

  /*
   * 패턴 프리셋 — Gray–Scott 공급률 F, 제거율 K, 확산계수 Du/Dv (Karl Sims 방식 9점 라플라시안, dt=1 기준)
   * Du/Dv 는 '확산' 슬라이더의 배율(0.5~1.0)이 곱해집니다.
   */
  DT.PRESETS = {
    cells: { label: 'Cells', desc: 'Dividing spots (mitosis)', F: 0.0367, K: 0.0649, Du: 1.0, Dv: 0.5 },
    ripple: { label: 'Ripple', desc: 'Rolling waves', F: 0.014, K: 0.047, Du: 1.0, Dv: 0.5 },
    maze: { label: 'Maze', desc: 'Winding stripes', F: 0.029, K: 0.057, Du: 1.0, Dv: 0.5 },
    mold: { label: 'Mold', desc: 'Branching hyphae (coral)', F: 0.0545, K: 0.062, Du: 0.9, Dv: 0.42 },
  };
  DT.DEFAULT_PRESET = 'maze';

  // 수동 슬라이더 기본값 (0~1, 바람 방향은 도°: 바람이 불어오는 방향)
  DT.MANUAL_DEFAULTS = {
    speed: 0.5, density: 0.55, diffusion: 0.6, erosion: 0.3, windStrength: 0.12, windDir: 270,
  };

  // 수동 슬라이더(0~1) → 시뮬레이션 값
  DT.SLIDER_MAP = {
    speed: [0.25, 2.0],            // 초당 단계 배율
    densityK: [0.0025, -0.0025],   // K 보정 (밀도가 높을수록 K 감소 → V 증가)
    densityZone: [26, 112],        // 성장 영역 최대 반경(셀)
    diffusion: [0.5, 1.0],         // Du/Dv 배율 (클수록 패턴이 굵고 번짐)
    wind: [0, 0.06],               // 이류 속도 (셀/단계). 패턴 성장 전선 속도보다 크면 씨앗이 쓸려 사라짐
  };

  // 수치 안정성을 위한 최종 한계값
  DT.LIMITS = {
    F: [0.008, 0.09], K: [0.035, 0.072], Du: [0.3, 1.0], Dv: [0.12, 0.5],
    wind: 0.08,   // 셀/단계 — CFL 조건을 넉넉히 만족하고 패턴이 유지되는 범위
    dt: 1.0,
  };

  /*
   * 날씨 → 시각 매핑 (예술적 해석이며 생물학적 예측이 아닙니다)
   * range: 입력값의 정규화 범위 (벗어나면 끝값으로 고정)
   * 출력은 '수동 슬라이더값에 더해지는 보정치' 또는 렌더링 값입니다.
   */
  DT.WEATHER_MAP = {
    temperature: { range: [-10, 35], speedDelta: [-0.25, 0.25], warmth: [0.0, 1.0] },        // °C
    humidity: { range: [20, 100], diffusionDelta: [-0.15, 0.15], softness: [0.05, 0.85] },   // %
    windSpeed: { range: [0, 14], strength: [0, 1.0] },                                        // m/s → 바람 벡터(슬라이더 단위)
    precipitation: { range: [0, 4], curve: 0.5, erosionDelta: [0, 0.45], dropRate: [0, 0.9] }, // mm (직전 15분)
    cloud: { range: [0, 100], densityDelta: [-0.15, 0.15], fShift: [-0.0012, 0.0012], contrast: [1.06, 0.78] }, // %
    neutral: { warmth: 0.3, softness: 0.3, contrast: 1.0 },  // 날씨 OFF 또는 데이터 없음
  };

  // 색상 (0~1 RGB) — 셰이더, CPU 렌더러, SVG 가 모두 이 값을 사용
  // 우주 톤: 거의 검정 배경, 성운 같은 남색·청록·옅은 하늘색. 따뜻하면 보라·복숭아빛으로
  DT.PALETTE = {
    bg: [0.008, 0.010, 0.018],
    deep: [0.030, 0.065, 0.140],
    teal: [0.100, 0.360, 0.520],
    lime: [0.600, 0.820, 0.900],
    warmTeal: [0.330, 0.190, 0.470],
    warmLime: [0.960, 0.760, 0.680],
    ivory: [0.970, 0.955, 0.910],
  };

  // ---------- 유틸 ----------
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const clamp01 = (x) => clamp(x, 0, 1);
  const lerp = (r, t) => r[0] + (r[1] - r[0]) * t;
  const norm = (x, r) => clamp01((x - r[0]) / (r[1] - r[0]));
  DT.util = { clamp, clamp01, lerp, norm };

  // 기상학 풍향(불어오는 방향, 북=0 시계방향) → 화면상 흐름 벡터 (x 오른쪽, y 아래)
  function windVector(fromDeg, mag) {
    const to = ((fromDeg + 180) * Math.PI) / 180;
    return { x: Math.sin(to) * mag, y: -Math.cos(to) * mag };
  }
  function vectorToFromDeg(v) {
    const to = Math.atan2(v.x, -v.y) * 180 / Math.PI;
    return ((to + 180) % 360 + 360) % 360;
  }

  /*
   * 수동값 + (선택) 날씨 → 적용값 + 시뮬레이션/렌더 파라미터
   * weather: { temperature, humidity, windSpeed, windDir, precipitation, cloud } 또는 null
   */
  DT.computeParams = function (manual, weather, presetId, cfg) {
    const W = DT.WEATHER_MAP, S = DT.SLIDER_MAP, L = DT.LIMITS;
    const preset = DT.PRESETS[presetId] || DT.PRESETS[DT.DEFAULT_PRESET];
    const applied = Object.assign({}, manual);
    const fx = { warmth: W.neutral.warmth, softness: W.neutral.softness, contrast: W.neutral.contrast, fShift: 0, dropRate: 0 };
    let wind = windVector(manual.windDir, manual.windStrength);

    if (weather) {
      const t = norm(weather.temperature, W.temperature.range);
      applied.speed = clamp01(manual.speed + lerp(W.temperature.speedDelta, t));
      fx.warmth = lerp(W.temperature.warmth, t);

      const h = norm(weather.humidity, W.humidity.range);
      applied.diffusion = clamp01(manual.diffusion + lerp(W.humidity.diffusionDelta, h));
      fx.softness = lerp(W.humidity.softness, h);

      const ws = lerp(W.windSpeed.strength, norm(weather.windSpeed, W.windSpeed.range));
      const wv = windVector(weather.windDir, ws);
      wind = { x: wind.x + wv.x, y: wind.y + wv.y };

      const p = Math.pow(norm(weather.precipitation, W.precipitation.range), W.precipitation.curve);
      applied.erosion = clamp01(manual.erosion + lerp(W.precipitation.erosionDelta, p));
      fx.dropRate = lerp(W.precipitation.dropRate, p);

      const c = norm(weather.cloud, W.cloud.range);
      applied.density = clamp01(manual.density + lerp(W.cloud.densityDelta, c));
      fx.fShift = lerp(W.cloud.fShift, c);
      fx.contrast = lerp(W.cloud.contrast, c);
    }

    let wmag = Math.hypot(wind.x, wind.y);
    if (wmag > 1) { wind.x /= wmag; wind.y /= wmag; wmag = 1; }
    applied.windStrength = wmag;
    applied.windDir = wmag > 1e-4 ? vectorToFromDeg(wind) : manual.windDir;

    const dScale = lerp(S.diffusion, applied.diffusion);
    const windCells = lerp(S.wind, 1); // 슬라이더 1.0 = 최대 이류 속도
    let wx = wind.x * windCells, wy = wind.y * windCells;
    const wm = Math.hypot(wx, wy);
    if (wm > L.wind) { wx *= L.wind / wm; wy *= L.wind / wm; }

    const sim = {
      F: clamp(preset.F + fx.fShift, L.F[0], L.F[1]),
      K: clamp(preset.K + lerp(S.densityK, applied.density), L.K[0], L.K[1]),
      Du: clamp(preset.Du * dScale, L.Du[0], L.Du[1]),
      Dv: clamp(preset.Dv * dScale, L.Dv[0], L.Dv[1]),
      dt: L.dt,
      windX: wx, windY: wy,
      speedMul: lerp(S.speed, applied.speed),
      zoneMax: lerp(S.densityZone, applied.density),
      erosion: applied.erosion,
      dropRate: fx.dropRate,
    };
    const render = { warmth: fx.warmth, softness: fx.softness, contrast: fx.contrast };
    return { applied, sim, render };
  };

  DT.windVector = windVector;
  DT.compass = function (deg) {
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  };
})(window.DT = window.DT || {});
