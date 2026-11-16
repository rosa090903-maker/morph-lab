/*
 * DIFFUSE TYPE — UI 연결과 메인 루프
 */
(function (DT) {
  'use strict';

  const C = DT.CONFIG;
  // 포인터 캡처 (이미 끝난 포인터 등으로 실패해도 조작은 계속)
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* 무시 */ } };
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);

  const state = {
    text: C.defaultText,
    preset: DT.DEFAULT_PRESET,
    manual: Object.assign({}, DT.MANUAL_DEFAULTS),
    envOn: true,
    sceneIndex: Math.max(0, DT.SCENES.findIndex((s) => s.id === 'polar')), // 극지 환경 하나만 씀 (지구본·화면 전환 없음)
    seed: C.defaultSeed,
    paused: false,
    // 차가운 환경의 기온(°C) — 성에 성장과 환경 보정에 함께 쓰임
    temperature: C.startTemperature != null ? C.startTemperature : 15, // 시작은 따뜻함 → 기온을 녹는점(−10 °C) 이하로 내리면 극지
    humidity: DT.GROWTH ? DT.GROWTH.defaultHumidity : 50,              // 상대습도(%) — 기온과 함께 물질 생장·응결·성에 (js/growth.js)
    timeScale: 1,      // 시간 흐름 배율 (대시보드 Time) — 결빙·성에·물질 생장이 이 배율로 진행
    tint: null,        // 성에 색 [r, g, b] 0~1 (대시보드 Color), null = 원래 파란 성에
    oxygen: DT.BUBBLE ? DT.BUBBLE.defaultOxygen : 21,   // 산소(%) — 대시보드 Air. Vitality 끔 + 습도·산소가 높으면 기포 (js/bubble.js)
    vitality: false,   // Vitality 끔 = 결빙 모드(성에·물) / 켬 = 생장 모드(+10 °C 이상 미생물, 얼지 않음)
    reactivity: Math.round((DT.SLIME ? DT.SLIME.reactivity : 0.5) * 100),   // 점균 반응성(%) — 대시보드 Reactivity (js/slime.js)
    light: 100,        // 조도(lx) — 대시보드 Light (0.1 ~ 100k lx 로그 눈금) → 화면 명도·대비 (100 lx = 그대로, lightLook)
    prismBg: 0, prismFx: 0,   // Prism 색 (0~100, PRISM_NONE 아래 = 원래 색, 그 위 = 색상환) — 배경 / 누끼 사진 위 효과
  };
  const START = { temperature: state.temperature, humidity: state.humidity, oxygen: state.oxygen, reactivity: state.reactivity, light: state.light, prismBg: 0, prismFx: 0 };   // 리셋할 때 돌아갈 기온·습도
  const scene = () => DT.SCENES[state.sceneIndex];

  let engine = null, sim = null, field = null, grid = null, outScale = 1, particles = null, frost = null;
  let ice = null; // 사진 → 파란/흰 점 결빙 (WebGL2, js/photoice.js)
  let bubbles = null;  // 기포 (Vitality 끔 + 습도·산소 높음 — js/bubble.js)
  let corrode = null;  // 부식 (Vitality 끔 + 기온·습도·산소 모두 높음 — js/corrode.js, 기포보다 우선)
  let desert = null;   // 사막화 (Vitality 끔 + 습도 낮음 + 기온 높음 + 산소 낮음 — js/desert.js)
  const deserting = () => DT.desertStrength(state.vitality, state.temperature, state.humidity, state.oxygen) > 0;
  let typing = null;   // 타이포 — 네 모드 안에서 클릭한 자리에 친 글자가 그 모드의 재료로 그려짐 (js/typing.js)
  const corroding = () => DT.corrodeStrength(state.vitality, state.temperature, state.humidity, state.oxygen) > 0;
  /*
   * Lab mode — 켜면 대시보드 카드에 색이 생기고, 5개 모드(성에·미생물·기포·부식·사막화)를 Mix 카드에서 각각 켜고 꺼서 섞어 씀.
   *  Lab mode 에서는 기온·습도·산소 조건 대신 켠 모드가 그대로 동작 (꺼 두면 평소처럼 조건에 따라 모드가 바뀜)
   */
  let slime = null;    // 점균 (Vitality 켬 + 기온·습도 높음 + 산소 낮음 — js/slime.js, 미생물 대신 · 파란 배경)
  const sliming = () => DT.slimeStrength(state.vitality, state.temperature, state.humidity, state.oxygen, state.light) > 0;   // 빛(lx)도 조건 — 어두워야
  let moss = null;     // 이끼 (Vitality 켬 + 습도 아주 높음 + 온화 + 산소 보통 — js/moss.js, 미생물 대신 · 짙은 흙빛 배경)
  const mossing = () => DT.mossStrength(state.vitality, state.temperature, state.humidity, state.oxygen, state.light) > 0;   // 빛(lx)도 조건 — 밝아야
  const bubbling = () => DT.bubbleStrength(state.vitality, state.humidity, state.oxygen, state.temperature) > 0;
  const lab = { on: false, frost: false, microbe: false, bubble: false, corrode: false, desert: false, slime: false, moss: false };
  const LAB_MODES = { frost: 'Frost', microbe: 'Microbes', bubble: 'Bubbles', corrode: 'Corrosion', desert: 'Desert', slime: 'Slime', moss: 'Moss' };
  /*
   * 객체별 Mix (Lab mode) — 사진·글자를 오른쪽 클릭하면 Mix 카드가 그 객체만 고침 → 객체마다 다른 모드를 섞어 씀
   *  key = 사진 id(숫자) 또는 'txt' + 글자 id. objMix 에 없는 객체는 전체 Mix(lab)를 따름
   */
  const objMix = new Map();
  let mixTarget = null;   // Mix 카드가 지금 고치는 객체 key (null = 전체)
  const modeOn = (key, m) => (objMix.has(key) ? objMix.get(key)[m] : lab[m]);
  const has = (m) => lab[m] || [...objMix.values()].some((o) => o[m]);   // 전체 또는 어느 객체에서든 켜졌는지
  const onlyFor = (m, list) => (lab.on ? list.filter((p) => modeOn(p.key, m)) : list);   // 그 모드를 켠 객체만 넘김
  const vital = () => (lab.on ? has('microbe') : state.vitality);   // 미생물이 자라는 상태인지
  const slimeNow = () => (lab.on ? has('slime') : sliming());       // 점균이 자라는 상태인지
  const mossNow = () => (lab.on ? has('moss') : mossing());         // 이끼가 자라는 상태인지
  // 미생물 조건 (평소): Life 켬 + 기온 minTemp 이상 maxTemp 미만 + 습도 humFrom 이상 — 조건표만 봄 (점균 · 이끼와는 기온으로 갈려 겹치지 않음)
  const microbeOk = () => { const M = DT.MICROBE, T = state.temperature; return state.vitality && state.humidity >= M.humFrom && T >= M.minTemp && T < M.maxTemp; };
  const typingMode = () => lab.on ? ['microbe', 'bubble', 'corrode', 'desert', 'slime', 'moss'].some(has)
    : soloMode() !== 'frost';   // 평소엔 지금 고른 한 모드가 성에가 아니면
  // 모듈마다 넘길 환경 — 평소엔 실제 기온·습도·산소, Lab mode 에선 켠 모드가 최대 세기가 되는 값
  /*
   * Lab mode 가 아닐 때는 모드가 섞이지 않게 — 조건으로 한 모드만 고름
   *  조건표(각 모드의 DT)는 서로 겹치지 않으므로 순서는 상관없지만, 확인용으로 두 모드가 함께 켜지면 콘솔에 경고 (overlapCheck)
   *  아무 모드도 아니면: Life 켬 = 미생물(기다림) · 끔 = 성에(기다림)
   */
  function soloMode() {
    overlapCheck();
    if (state.vitality) return sliming() ? 'slime' : mossing() ? 'moss' : 'microbe';
    if (corroding()) return 'corrode';
    if (deserting()) return 'desert';
    if (state.temperature <= DT.ICE.frostPoint) return 'frost';
    if (bubbling()) return 'bubble';
    return 'frost';
  }
  // 지금 다이얼에서 조건이 맞는 모드들 (켜지는 조건만 — 우선순위 없이)
  function modesOn(V, T, RH, O2, L) {
    const M = DT.MICROBE, on = [];
    if (DT.slimeStrength(V, T, RH, O2, L) > 0) on.push('slime');
    if (DT.mossStrength(V, T, RH, O2, L) > 0) on.push('moss');
    if (V && T >= M.minTemp && T < M.maxTemp && RH >= M.humFrom) on.push('microbe');
    if (!V && T <= DT.ICE.frostPoint) on.push('frost');
    if (DT.corrodeStrength(V, T, RH, O2) > 0) on.push('corrode');
    if (DT.bubbleStrength(V, RH, O2, T) > 0) on.push('bubble');
    if (DT.desertStrength(V, T, RH, O2) > 0) on.push('desert');
    return on;
  }
  let overlapSig = '';
  function overlapCheck() {
    const on = modesOn(state.vitality, state.temperature, state.humidity, state.oxygen, state.light), sig = on.join('+');
    if (on.length > 1 && sig !== overlapSig) console.warn(`[POLAR] two modes are on at once: ${sig} — T ${state.temperature}° · RH ${state.humidity}% · O₂ ${state.oxygen}% · ${state.light} lx · Life ${state.vitality ? 'on' : 'off'} (check the DT conditions)`);
    overlapSig = on.length > 1 ? sig : '';
  }
  /*
   * 모드마다 넘길 환경 — 첫 몇 값 = 켜질지(세기), 뒤 값 = 밀도 · 크기를 정하는 다이얼
   *  밀도 · 크기 다이얼 (모드가 켜지는 구간 전체를 최소 → 최대로):
   *   Frost 습도 → 결정 수 · 기온 → 크기(−15° 정점) | Microbe 산소 → 밀도 · 기온 → 군집 크기(37°) | Slime 습도 → 가지 밀도 · 산소 → 굵기
   *   Moss 습도 → 밀도 · 빛 → 크기 · 번짐 | Corrosion 습도 → 점 간격 · 산소 → 녹 크기 | Bubble 산소 → 개수 · 기온 → 크기 · 습도 → 머무는 시간
   *   Desert 기온 → 빠르기 · 가장자리 탐 · 습도 → 알갱이 크기 · 산소 → 위에서 떨어지는 모래 양 | Growth Rate → 이끼 흔들림
   *  Lab mode: 켠 모드가 켜지는 값(세기) + 실제 다이얼 값(모양)을 따로 넘김
   */
  function modeEnv() {
    const T = state.temperature, RH = state.humidity, O2 = state.oxygen, Lx = state.light, rate = state.reactivity / 100;
    if (!lab.on) {
      const v = state.vitality, m = soloMode();
      return {
        freezing: !v, iceT: T, edge: true, noWater: m === 'corrode' || m === 'desert' || m === 'bubble',
        air: m === 'frost' ? O2 / 100 : 0,   // 성에 모드: 공기가 많을수록 커서 방향 바람
        micro: [T, RH, m === 'microbe', O2], microGrow: m === 'microbe' && microbeOk(),
        bub: [m !== 'bubble', RH, O2, T], cor: [m !== 'corrode', T, RH, O2], des: [m !== 'desert', T, RH, O2],   // 첫 값 true = 끔
        slm: [m === 'slime', T, RH, O2, Lx], mos: [m === 'moss', T, RH, O2, Lx, undefined, undefined, rate],
      };
    }
    const L = {}, B = DT.BUBBLE, C2 = DT.CORRODE, D = DT.DESERT, SL = DT.SLIME, MO = DT.MOSS, MI = DT.MICROBE;
    for (const m in LAB_MODES) L[m] = has(m);   // 객체별 Mix 까지 — 어느 객체에서든 켠 모드는 동작 (객체 목록은 onlyFor 로 거름)
    return {
      edge: lab.frost,   // 화면 가장자리 성에는 전체 Mix 의 Frost 일 때만
      slm: [L.slime, SL.tempFull, SL.humFull, Math.max(O2, SL.o2From), Math.min(Lx, SL.lightTo), RH, Lx, O2],   // 습도 다이얼 → 가지 밀도 · 산소 다이얼 → 굵기
      mos: [L.moss, (MO.tempFrom + MO.tempTo) / 2, MO.humFull, O2, Math.max(Lx, MO.lightFrom), RH, Lx, rate],   // 습도 다이얼 → 밀도 · 빛 다이얼 → 크기 · 번짐 · Growth Rate → 흔들림
      freezing: L.frost || !(L.microbe || L.slime || L.moss),                     // 미생물·점균만 켜면 누끼(배경 지움), 성에를 함께 켜면 사진 그대로 얼음
      iceT: L.frost ? Math.min(T, -25) : Math.max(T, DT.ICE.frostPoint + 6),   // 성에 켬: 기온 다이얼이 −25 °C 보다 낮으면 더 빽빽하게
      noWater: L.bubble || L.corrode || L.desert,
      air: L.frost ? O2 / 100 : 0,
      micro: [Math.min(MI.maxTemp - 1, Math.max(MI.minTemp, T)), Math.max(RH, MI.humFull), L.microbe, O2, RH], microGrow: L.microbe,   // 기온 다이얼(구간 안으로) → 밀도 · 산소 다이얼 → 점 크기 · 습도 다이얼 → 움직임 빠르기
      bub: [!L.bubble, Math.max(RH, B.humFull), Math.max(O2, B.o2Full), Math.max(T, B.tempFrom), T, RH, O2],   // 기온 다이얼 → 크기 · 습도 다이얼 → 머무는 시간 · 산소 다이얼 → 개수
      cor: [!L.corrode, C2.tempFull, C2.humFull, C2.o2Full, RH, O2],   // 습도 다이얼 → 점 간격, 산소 다이얼 → 녹 크기
      des: [!L.desert, D.tempFull, 0, O2, T, RH],   // 기온 다이얼 → 화면 가장자리가 탐 · 습도 다이얼 → 모래 알갱이 크기 · 산소 다이얼 → 떨어지는 모래 양
    };
  }
  // 성에 모드 (네 모드가 아닐 때 = 결빙 모드 · Lab mode 에선 Frost 를 켰을 때) — 오른쪽 클릭으로 글자, 글자가 얼음 점으로 (js/frosttype.js)
  const frostTyping = () => (lab.on ? has('frost') : !typingMode());
  const frostFrozen = () => (lab.on ? has('frost') : !state.vitality && state.temperature <= DT.ICE.frostPoint);
  let frostType = null;
  let microbes = null; // 미생물 군집 (+10 °C 위, 클릭한 자리에서 자람 — js/microbe.js)
  let params = null, dirty = true, lost = false;
  let fieldKey = '';

  // ---------------- 엔진 ----------------
  function showNotice(msg) { const n = $('notice'); n.textContent = msg; n.hidden = !msg; }

  function setupEngine() {
    let canvas = $('art');
    let reason = null;
    const q = qs.get('quality');
    if (qs.get('mode') === 'cpu') {
      reason = 'CPU mode was requested in the URL (mode=cpu)';
    } else {
      try {
        grid = C.gpuGrid[q] || C.gpuGrid.medium;
        outScale = C.gpuOutputScale;
        engine = DT.createGLEngine(canvas, grid, outScale);
      } catch (e) {
        reason = e.message;
        console.warn('[DIFFUSE TYPE] GPU engine unavailable:', e);
      }
    }
    if (!engine) {
      // WebGL 컨텍스트를 한 번 요청한 캔버스는 2D 로 쓸 수 없으므로 새 캔버스로 교체
      const fresh = document.createElement('canvas');
      fresh.id = canvas.id;
      fresh.setAttribute('role', 'img');
      fresh.setAttribute('aria-label', canvas.getAttribute('aria-label'));
      canvas.replaceWith(fresh);
      canvas = fresh;
      grid = C.cpuGrid;
      outScale = C.cpuOutputScale;
      engine = DT.createCPUEngine(canvas, outScale);
      showNotice(`GPU features (WebGL2 floating-point rendering) are unavailable, so a low-resolution CPU fallback is running. Reason: ${reason}. Enable hardware acceleration in Chrome/Edge to use GPU mode.`);
    }
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      lost = true;
      showNotice('The GPU context was lost. Please reload the page. (This can happen after a graphics driver restart or waking from sleep.)');
    });
    particles = DT.createParticleLayer($('stars'));
    frost = DT.createFrostLayer();
    frost.setTemperature(state.temperature, true);
    particles.underlay = (c, part, motion) => frost.draw(c, part, motion);
    particles.wind = () => frost.wind;
    particles.floatK = () => frost.freeze;
    const OW = grid.w * outScale, OH = grid.h * outScale;
    try {
      ice = DT.createPhotoIce($('photo'), OW, OH);
      ice.setTemperature(state.temperature, true);
      // 피사체 분리 중에는 화면 상단 가운데 스피너, 실패하면 스피너를 끄고 안내 문구
      ice.onBusy = (on) => { $('spinner').dataset.on = on ? 'true' : 'false'; setLoadingFog(on); };
      ice.onStatus = (msg) => flashNotice(msg);
      ice.onChange = () => renderTray();   // 누끼 진행 상태(썸네일)·순서 변경
      // 배경 제거 모델(~90MB)을 미리 받아 초기화 → 첫 사진을 넣을 때 멈추지 않음
      //  배포용: 페이지를 열기만 한 방문자는 받지 않게, 처음 클릭 · 키 · 파일 끌어오기를 할 때 시작 (사진을 고르는 동안 받음)
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
      const SEG_EVENTS = ['pointerdown', 'keydown', 'dragenter'];
      const startSeg = () => { SEG_EVENTS.forEach((t) => window.removeEventListener(t, startSeg, true)); idle(() => DT.preloadSegment(), { timeout: 1000 }); };
      SEG_EVENTS.forEach((t) => window.addEventListener(t, startSeg, true));
    } catch (e) {
      console.warn('[POLAR] photo ice unavailable:', e);
      showNotice('Photo freezing needs WebGL2 with floating-point render targets: ' + e.message);
    }
    freshModules();
    typing = DT.createTyping($('frame'), {
      onChange: () => histTouch('Text', 1200),   // 글자를 치거나 옮기거나 크기를 바꾸면 — 멈춘 뒤 한 단계로
      active: () => typingMode() || frostTyping(),   // 성에 모드에서는 오른쪽 클릭으로 시작
      labels: () => lab.on && $('intro').hidden && $('archive').hidden,   // 표본 라벨은 Lab mode 본 화면에서만
      shown: () => $('intro').hidden && $('archive').hidden,              // 고른 글자 테두리 · 크기 손잡이는 본 화면에서만
      // 확대 전 프레임 px → 창 px (+ 배율)
      toScreen: (x, y) => {
        const fr = $('frame'), r = fr.getBoundingClientRect(), fw = fr.clientWidth || 1, k = ice ? fw / ice.canvas.width : 1;
        const vw = ice ? ice.view : { zoom: 1, off: [0, 0] }, s = r.width / fw;
        return [r.left + (x * vw.zoom + vw.off[0] * k) * s, r.top + (y * vw.zoom + vw.off[1] * k) * s, vw.zoom * s];
      },
    });
    DT.createTypeCard($('typeCard'), typing);   // Type 카드 (늘 보임) — 친 글자의 글꼴 · 굵기
    const gpu = engine.kind === 'gpu';
    sim = new DT.Simulation(engine, {
      sps: gpu ? C.gpuStepsPerSecond : C.cpuStepsPerSecond,
      maxPerFrame: gpu ? C.gpuMaxStepsPerFrame : C.cpuMaxStepsPerFrame,
      warmup: gpu ? C.gpuWarmupSteps : C.cpuWarmupSteps,
      warmupChunk: gpu ? C.gpuWarmupChunk : C.cpuWarmupChunk,
    });
  }

  /*
   * 화면 단계
   *  empty     : 텍스트 없음 — 빈 화면 (환경의 배경 입자만)
   *  gathering : 점들이 날아와 글자 모양으로 모이는 중 (이전 패턴은 서서히 사라짐)
   *  growing   : 점이 다 모인 뒤, 글자 외곽에서 Gray–Scott 패턴이 피어나고 자람
   */
  let phase = 'empty', fade = 0, fadeTarget = 0, eroT = 0, resetCount = 0;

  function ensureField() {
    const key = state.text + '\u0001' + state.seed + '\u0001' + scene().id;
    if (key !== fieldKey) {
      field = DT.buildTextField(state.text, grid.w, grid.h, outScale, state.seed, scene().glyph);
      fieldKey = key;
    }
  }
  // 같은 시드 + 같은 설정 + 같은 환경 → 같은 초기 상태에서 성장 시작
  function restartGrowth() {
    ensureField();
    sim.reset(field, state.seed);
    particles.resize(engine.canvas.width, engine.canvas.height);
    particles.clearErosion();
    resetCount++;
    dirty = true;
  }
  // 텍스트에 맞춰 점들을 모음. scatter=true 면 모든 점을 흩었다가 다시 모음
  function beginGather(scatter) {
    ensureField();
    particles.resize(engine.canvas.width, engine.canvas.height);
    fadeTarget = 0;
    frost.stop(false); // 이전 성에는 서서히 사라지고, 다시 모인 뒤 새로 자람
    if (!state.text.trim()) { particles.release(); phase = 'empty'; return; }
    particles.setTargets(DT.sampleGlyphPoints(field.glyphHi, state.seed), state.seed, !!scatter);
    phase = 'gathering';
  }
  // 리셋 버튼: 같은 시드와 설정으로 처음부터 (점도 다시 모임)
  function resetSimulation() {
    if (state.text.trim()) beginGather(true);
    else restartGrowth();
  }

  function envForParams() {
    if (!state.envOn || !scene().env) return null;
    return scene().frost ? Object.assign({}, scene().env, { temperature: state.temperature }) : scene().env;
  }
  function updateParams() {
    params = DT.computeParams(state.manual, envForParams(), state.preset);
    renderSliders();
    const tt = $('envToggleText');
    if (tt) tt.textContent = !state.envOn ? 'Environment OFF · manual values only'
      : scene().env ? 'Environment ON' : 'Environment ON (no adjustment for this environment)';
    dirty = true;
  }

  function renderParams() {
    const sc = scene(), scr = sc.screen || {};
    const po = sc.patternOpacity == null ? 1 : sc.patternOpacity;
    return Object.assign({}, params.render, {
      protect: sim.protectDepth(params.sim.erosion), opacity: fade * po, glyphMix: 0,
      grain: scr.grain || 0, fog: scr.fog || 0, edge: scr.edge || 0,
      breath: sc.breath || 0,
    });
  }

  /*
   * 헤일로 입력 (scene.breath, Chroma Halo 레퍼런스) — 커서를 약간 늦게 따라가는 추종점 둘레에 큰 잉크 덩어리를 주입
   *  커서를 올리면 그 자리에서 피어나고(pulse), 움직이면 커서 속도가 흐름에 실려 뒤로 길게 끌리는 꼬리가 생김.
   *  가만히 있으면 주입이 줄어 천천히 옅어짐. 남아 있는 시간은 기온에 따라(DT.BREATH)
   */
  DT.HALO = {
    radius: [0.055, 0.08],  // 덩어리 반경 (화면 높이 비율) [느릴 때, 빠를 때]
    amount: [0.08, 0.11],   // 프레임당 주입량 (60fps 기준) [느릴 때, 빠를 때] — 작아진 덩어리도 같은 밝기로
    drag: 0.4,              // 커서 속도를 흐름에 싣는 비율 → 꼬리 길이
    bloom: 0.11,            // 중심에서 바깥으로 피어나는 흐름 (uv/초)
    follow: 7,              // 추종 속도 (1/초) — 작을수록 더 늦게 따라옴
    hover: 0.35,            // 가만히 올려 둔 동안의 주입 비율 (hoverFade 초에 걸쳐 줄어듦)
    hoverFade: 0.9,
    pulse: 0.45,            // 커서가 들어올 때 피어나는 시간(초)
  };
  const breath = { has: false, tx: 0, ty: 0, x: 0, y: 0, active: false, still: 0, pulse: 0 };
  /*
   * 기온 → 입김 (frost 의 '적용 온도'를 씀: 다이얼을 돌려도 초당 2.2 비율로 부드럽게 따라가므로 갑자기 바뀌지 않음)
   *  cold 0 (+10 °C) … 1 (−60 °C)
   *  decay     입김 수명(초)          0.55 → 9       따뜻하면 지나간 직후 사라짐
   *  diff      확산 속도 배율          2.6 → 0.65     따뜻하면 빠르게 퍼지며 옅어짐
   *  filmRate  입김 → 유리 응결막(1/초) 0 → 0.5       −20 °C 부근부터 서서히 굳기 시작
   *  filmDecay 응결막 수명(초)         1.5 → 90       아주 추우면 거의 남아 있음
   *  cap       한 자리 축적 상한        0.9 → 2.2      따뜻하면 덜 쌓이고 일시적인 흔적만
   *  gain      주입량 배율             0.8 → 1.1
   */
  DT.BREATH = { decay: [0.55, 9], diff: [2.6, 0.65], filmRate: [0, 0.5], filmDecay: [1.5, 90], cap: [0.9, 2.2], gain: [0.8, 1.1] };
  function breathTemp() {
    const B = DT.BREATH, t = frost.appliedTemperature;
    const cold = Math.min(1, Math.max(0, (10 - t) / 70));
    const mix = (r, k) => r[0] + (r[1] - r[0]) * k;
    const film = Math.min(1, Math.max(0, (cold - 0.45) / 0.55));
    return {
      cold,
      decay: mix(B.decay, Math.pow(cold, 1.6)), diff: mix(B.diff, cold),
      filmRate: mix(B.filmRate, film * film * (3 - 2 * film)), filmDecay: mix(B.filmDecay, Math.pow(cold, 2.2)),
      cap: mix(B.cap, Math.pow(cold, 1.2)), gain: mix(B.gain, cold),
    };
  }
  function stepBreath(dt) {
    const on = !!scene().breath && !!engine.breathStep;
    if (!on) { if (breath.active && engine.clearBreath) engine.clearBreath(); breath.active = false; return false; }
    breath.active = true;
    const temp = breathTemp();
    let input = { temp };
    if (breath.has && dt > 0) {
      const H = DT.HALO;
      const k = 1 - Math.exp(-dt * H.follow);             // 살짝 늦게 따라감
      const px = breath.x, py = breath.y;
      breath.x += (breath.tx - breath.x) * k; breath.y += (breath.ty - breath.y) * k;
      const aspect = engine.canvas.width / engine.canvas.height;
      const dx = (breath.x - px) * aspect, dy = breath.y - py;
      const speed = Math.hypot(dx, dy) / dt;              // 화면 높이 / 초
      const norm = Math.min(1, speed / 1.4);
      const moving = Math.min(1, Math.max(0, (speed - 0.006) / 0.05));
      breath.still = moving > 0.2 ? 0 : breath.still + dt;
      const pulse = breath.pulse > 0 ? 1.6 : 0;           // 들어오는 순간 피어남
      breath.pulse = Math.max(0, breath.pulse - dt);
      const drive = Math.max(moving, H.hover * Math.exp(-breath.still / H.hoverFade), pulse);
      input = {
        temp,
        a: [px, py], b: [breath.x, breath.y],
        vel: [(breath.x - px) / dt * H.drag, (breath.y - py) / dt * H.drag],
        rad: H.radius[0] + (H.radius[1] - H.radius[0]) * norm,
        amt: drive * (H.amount[0] + (H.amount[1] - H.amount[0]) * norm) * temp.gain * Math.min(2.5, dt * 60) * frost.freeze, // 입김은 극지에서만
        bloom: H.bloom,
      };
    }
    engine.breathStep(dt, input);
    return true;
  }
  function setupBreathInput() {
    const frame = $('frame');
    const at = (e) => { const r = frame.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    frame.addEventListener('pointermove', (e) => {
      if (!scene().breath) return;
      const p = at(e);
      breath.tx = p[0]; breath.ty = p[1];
      if (!breath.has) { breath.x = p[0]; breath.y = p[1]; breath.has = true; breath.still = 0; breath.pulse = DT.HALO.pulse; }
    });
    frame.addEventListener('pointerleave', () => { breath.has = false; });
  }

  // ---------------- 사진 콜라주 ----------------
  /*
   * 여러 장의 사진을 한 화면에 자유롭게 배치 (js/photoice.js 가 사진마다 누끼·점 결빙을 따로 처리)
   *  - 추가: 화면에 끌어다 놓기(여러 장 가능) 또는 왼쪽 아래 'Add Photo'
   *  - 썸네일 목록: 클릭 = 선택, ↻ = 교체, × = 삭제. 선택한 사진은 흰 테두리
   *  - 편집(사진 상태, 얼기 전): 사진을 드래그해 이동, 선택 테두리의 모서리를 드래그해 크기 조절(비율 유지).
   *    누르면 맨 위로. 빈 곳을 누르면 선택 해제. Delete 키 = 선택한 사진 삭제
   *  - 얼기 시작하면(−10 °C 이하) 배치는 그대로 고정되고, 커서는 점을 녹이는 데 쓰임
   */
  let selected = null, viewT = 0, viewW = 0, viewH = 0;
  let gallery = null;   // js/gallery.js — 처음 화면 'Choose a Sample'
  let archive = null;   // js/archive.js — 셔터로 찍은 포스터 보관 + 아카이브 창
  function loadPhoto(img, mask) {
    if (!ice) return null;
    histTouch('Add photo', 400);   // 되돌리기: 놓기 직전 상태
    updateSafe();
    const id = ice.addPhoto(img, mask);   // mask = 갤러리에서 미리 딴 누끼 (있으면 바로 완성된 상태로)
    selected = id;
    $('stage').dataset.photo = 'on';
    renderTray();
    dirty = true;
    return id;
  }
  async function addFiles(files) {
    const list = Array.from(files || []).filter((f) => /^image\//.test(f.type));
    if (!list.length) { flashNotice('Choose an image file (JPG, PNG, WebP, GIF…).'); return; }
    for (const f of list) {
      try { loadPhoto(await DT.loadImageFile(f)); } catch (err) { flashNotice(err.message); }
    }
  }
  async function replaceSelected(file) {
    if (!ice || selected == null || !file) return;
    if (!/^image\//.test(file.type)) { flashNotice('Choose an image file (JPG, PNG, WebP, GIF…).'); return; }
    try { ice.replacePhoto(selected, await DT.loadImageFile(file)); renderTray(); } catch (err) { flashNotice(err.message); }
  }
  function removePhoto(id) {
    if (!ice) return;
    histTouch('Remove photo', 50);   // 되돌리기: 지우기 직전 상태
    ice.removePhoto(id);
    if (selected === id) { const its = ice.items; selected = its.length ? its[its.length - 1].id : null; }
    if (!ice.hasPhoto) $('stage').dataset.photo = 'off';
    renderTray();
  }
  function select(id) {
    selected = id;
    if (id != null) layerKind = 'photo';   // 겹침 순서는 Layer 패널에서 (누른다고 맨 앞으로 오지 않음)
    renderTray();
  }
  /*
   * Layer 패널 (오른쪽 위, 작게) — 고른 사진(또는 글자)을 앞/뒤로. 사진과 글자를 한 줄로 세운 겹침 순서
   *  layerKind = 마지막으로 고른 것이 사진인지 글자인지
   *  zOrder = 뒤 → 앞 순서의 key (사진 = id 숫자, 글자 = 'txt' + id). 사진끼리 순서는 ice, 글자끼리 순서는 typing 이 따름
   *  글자가 사진보다 뒤면: 겹친 자리에서 글자 모양을 잘라 냄 → 글자의 효과가 사진에 가려짐 (layeredText)
   */
  let layerKind = null;
  const zOrder = [];
  // 지금 있는 사진 · 글자로 zOrder 를 맞춤: 없어진 것은 빼고, 새것은 맨 앞에. 사진끼리 · 글자끼리의 순서는 ice · typing 순서 그대로 (되돌리기 뒤에도)
  function syncZ() {
    const pk = ice ? ice.items.map((it) => it.id) : [], tk = typing ? typing.photos.map((p) => p.key) : [];
    const have = new Set(pk.concat(tk));
    for (let i = zOrder.length - 1; i >= 0; i--) if (!have.has(zOrder[i])) zOrder.splice(i, 1);
    for (const k of pk.concat(tk)) if (!zOrder.includes(k)) zOrder.push(k);
    for (const list of [pk, tk]) { let j = 0; zOrder.forEach((k, i) => { if (list.includes(k)) zOrder[i] = list[j++]; }); }
    return zOrder;
  }
  function layerTarget() {
    if (layerKind === 'text' && typing && typing.current) return { kind: 'text', e: typing.current, key: typing.keyOf(typing.current) };
    if (ice && selected != null && ice.items.some((it) => it.id === selected)) return { kind: 'photo', id: selected, key: selected };
    return null;
  }
  function shiftLayer(d) {
    const t = layerTarget(); if (!t) return;
    const z = syncZ(), i = z.indexOf(t.key); if (i < 0) return;
    const j = Math.max(0, Math.min(z.length - 1, d === Infinity ? z.length - 1 : d === -Infinity ? 0 : i + d));
    if (j === i) return;
    z.splice(j, 0, z.splice(i, 1)[0]);
    if (ice) ice.setOrder(z.filter((k) => typeof k === 'number'));
    if (typing) typing.setOrder(z.filter((k) => typeof k === 'string'));
    renderLayer();
  }
  // 모드에 넘길 목록: 사진 + 글자를 겹침 순서대로 (뒤 → 앞). 사진보다 뒤에 있는 글자는 그 사진과 겹친 자리를 잘라 냄
  const cutCache = new Map();   // 글자 key → [{ sig, mask }, …] 최근 몇 개 (모드마다 넘기는 사진 목록이 조금씩 달라서)
  const maskIds = new WeakMap(); let maskSeq = 0;
  const maskIdOf = (m) => { if (!m) return 0; if (!maskIds.has(m)) maskIds.set(m, ++maskSeq); return maskIds.get(m); };
  function layered(photos) {
    const z = syncZ(), at = (k) => z.indexOf(k), texts = typing ? typing.photos : [];
    const out = photos.concat(texts.map((t) => {
      const above = photos.filter((p) => at(p.key) > at(t.key) && p.rect[0] < t.rect[0] + t.rect[2] && p.rect[0] + p.rect[2] > t.rect[0] && p.rect[1] < t.rect[1] + t.rect[3] && p.rect[1] + p.rect[3] > t.rect[1]);
      if (!above.length || !t.mask) return t;
      const sig = maskIdOf(t.mask) + '|' + t.rect.map(Math.round) + '|' + above.map((p) => p.key + ':' + p.rect.map(Math.round) + ':' + maskIdOf(p.mask)).join(';');
      const list = cutCache.get(t.key) || [];
      let c = list.find((x) => x.sig === sig);
      if (!c) {
        const M = t.mask, m = Float32Array.from(M.m), [tx, ty, tw, th] = t.rect;
        for (const p of above) {
          const [px, py, pw, ph] = p.rect, P = p.mask;
          const i0 = Math.max(0, Math.floor((px - tx) / tw * M.w)), i1 = Math.min(M.w, Math.ceil((px + pw - tx) / tw * M.w));
          const j0 = Math.max(0, Math.floor((py - ty) / th * M.h)), j1 = Math.min(M.h, Math.ceil((py + ph - ty) / th * M.h));
          for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
            const u = (tx + (i + 0.5) / M.w * tw - px) / pw, v = (ty + (j + 0.5) / M.h * th - py) / ph;
            if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
            if (!P || P.m[Math.min(P.h - 1, (v * P.h) | 0) * P.w + Math.min(P.w - 1, (u * P.w) | 0)] >= 0.5) m[j * M.w + i] = 0;   // 누끼가 없으면 사진 네모 전체가 가림
          }
        }
        c = { sig, mask: Object.assign({}, M, { m }) };
        list.unshift(c); list.length = Math.min(list.length, 6); cutCache.set(t.key, list);
      }
      return Object.assign({}, t, { mask: c.mask });
    }));
    for (const k of [...cutCache.keys()]) if (!texts.some((t) => t.key === k)) cutCache.delete(k);
    return out.sort((a, b) => at(a.key) - at(b.key));
  }
  let layerText = '';
  function renderLayer() {
    const t = layerTarget();
    let s = '—', n = 0, i = -1;
    if (t) { const z = syncZ(); i = z.indexOf(t.key); n = z.length; s = t.kind === 'photo' ? `Photo ${trayOrder.indexOf(t.id) + 1}` : `T-${String(t.e.no).padStart(2, '0')}`; }
    const key = `${s}|${i}|${n}`;
    if (key === layerText) return;
    layerText = key;
    $('layerName').textContent = t ? `${s} · ${i + 1}/${n}` : 'none';
    $('layerCard').querySelectorAll('.ly-btn').forEach((b) => { const d = +b.dataset.d; b.disabled = !t || n < 2 || (d > 0 ? i >= n - 1 : i <= 0); });
  }

  // 썸네일 목록 (추가한 순서)
  const trayOrder = [];
  function renderTray() {
    const tray = $('tray'), list = $('trayList');
    const its = ice ? ice.items : [];
    for (const it of its) if (!trayOrder.includes(it.id)) trayOrder.push(it.id);
    for (let i = trayOrder.length - 1; i >= 0; i--) if (!its.find((it) => it.id === trayOrder[i])) trayOrder.splice(i, 1);
    tray.hidden = false;   // 사진이 없어도 '+' 는 보이게 (오프닝 사진 중에서 골라 시작)
    list.innerHTML = '';
    trayOrder.forEach((id, n) => {
      const it = its.find((x) => x.id === id);
      const li = document.createElement('li');
      li.className = 'thumb' + (id === selected ? ' on' : '') + (it.segmenting ? ' busy' : '');
      li.innerHTML = `<button type="button" class="t-sel" aria-pressed="${id === selected}" title="Select photo ${n + 1}"><img alt="Photo ${n + 1}" src="${it.thumb}"></button>` +
        `<button type="button" class="t-act t-rep" title="Replace photo ${n + 1}" aria-label="Replace photo ${n + 1}">↻</button>` +
        `<button type="button" class="t-act t-del" title="Remove photo ${n + 1}" aria-label="Remove photo ${n + 1}">×</button>`;
      li.querySelector('.t-sel').addEventListener('click', () => select(id));
      li.querySelector('.t-rep').addEventListener('click', () => { selected = id; renderTray(); $('replaceInput').click(); });
      li.querySelector('.t-del').addEventListener('click', () => removePhoto(id));
      list.appendChild(li);
    });
    $('addBtn').textContent = '+';   // 사진 추가 (title·aria-label 은 index.html)
    updateSelection();
  }

  // 선택 테두리 (캔버스 px → 프레임 CSS px). 편집할 수 있을 때만 보임
  function updateSelection() {
    const box = $('selBox');
    const it = ice && selected != null ? ice.items.find((x) => x.id === selected) : null;
    if (!it || !ice.editable) { box.hidden = true; return; }
    const k = $('frame').getBoundingClientRect().width / ice.canvas.width, vw = ice.view;   // 지금 프레임 크기 기준 (캔버스 px → CSS px), 휠 확대 반영
    const [x, y, w, h] = [it.rect[0] * vw.zoom + vw.off[0], it.rect[1] * vw.zoom + vw.off[1], it.rect[2] * vw.zoom, it.rect[3] * vw.zoom];
    box.hidden = false;
    box.style.left = `${x * k}px`; box.style.top = `${y * k}px`; box.style.width = `${w * k}px`; box.style.height = `${h * k}px`;
  }

  // 프레임(16:10 캔버스) 중 실제로 보이는 영역 — 새 사진의 처음 크기·위치에 씀
  function updateView() {
    if (microbes) microbes.resize();   // 프레임 크기에 맞춰 미생물 캔버스도
    if (frostType) frostType.resize();
    if (bubbles) bubbles.resize();
    if (corrode) corrode.resize();
    if (desert) desert.resize();
    if (slime) slime.resize();
    if (moss) moss.resize();
    if (!ice) return;
    const r = $('frame').getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    ice.setView(Math.min(1, vw / r.width), Math.min(1, vh / r.height), vw / vh, ice.canvas.width / r.width);
    updateSafe();
    updateSelection();
  }
  // 새 사진을 놓을 빈 영역 — 위 버튼줄 아래 · 아래 모드 상태바 위 · 왼쪽 열(Color·Light)과 오른쪽 열(기온 등) 사이 (화면 px → 캔버스 px)
  function updateSafe() {
    if (!ice) return;
    const box = (sel) => { const el = document.querySelector(sel); if (!el || el.hidden) return null; const b = el.getBoundingClientRect(); return b.width && b.height ? b : null; };
    const M = 16, vw = window.innerWidth, vh = window.innerHeight;
    let x0 = 0, y0 = 0, x1 = vw, y1 = vh;
    for (const s of ['.top-right', '#homeTab', '#tray']) { const b = box(s); if (b) y0 = Math.max(y0, b.bottom + M); }
    const mb = box('.modebar'), cl = box('.col-left'), cr = box('.col-right');
    if (mb) y1 = Math.min(y1, mb.top - M);
    const st = box('.hud .status');   // 아래 가운데 말풍선도 피함
    if (st) y1 = Math.min(y1, st.top - M);
    if (cl) x0 = Math.max(x0, cl.right + M);
    if (cr) x1 = Math.min(x1, cr.left - M);
    if ($('hud').hidden || vw <= 1000 || x1 - x0 < 160 || y1 - y0 < 160) { ice.setSafe(null); return; }   // 좁은 화면(패널이 한 줄로 쌓임)은 화면 전체
    const r = $('frame').getBoundingClientRect(), k = ice.canvas.width / r.width;
    ice.setSafe([(x0 - r.left) * k, (y0 - r.top) * k, (x1 - r.left) * k, (y1 - r.top) * k]);
  }
  function setupSurfaceInput() {
    const frame = $('frame');
    const at = (e) => { const r = frame.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    // 화면 → 확대 전 캔버스 px (휠 확대를 되돌림)
    const toCanvas = (e) => { const p = at(e); return ice.toWorld(p[0] * ice.canvas.width, p[1] * ice.canvas.height); };
    frame.addEventListener('pointermove', (e) => { if (!ice) return; const p = at(e); ice.pointer(p[0], p[1]); });
    frame.addEventListener('pointerleave', () => { if (!ice) return; ice.pointer(null); });
    // 미생물: 빈 곳(사진을 잡지 않은 곳)을 왼쪽 클릭하면 그 자리에 군집을 심음 — +10 °C 위에서만 자람
    const toCss = (e) => { const k = frame.clientWidth / ice.canvas.width, p = toCanvas(e); return [p[0] * k, p[1] * k]; };   // 확대 전 프레임 px
    // 마우스 휠: 커서 자리를 중심으로 확대·축소 (1 ~ DT.ICE.zoomMax 배) — 사진·성에·결정·미생물이 함께
    frame.addEventListener('wheel', (e) => {
      if (!ice) return;
      e.preventDefault();
      const p = at(e);
      ice.setZoom(ice.zoomTarget * Math.exp(-e.deltaY * 0.0015), p[0] * ice.canvas.width, p[1] * ice.canvas.height);
    }, { passive: false });
    frame.addEventListener('pointermove', (e) => { if (microbes) microbes.pointer(...toCss(e)); if (bubbles) bubbles.pointer(...toCss(e)); if (corrode) corrode.pointer(...toCss(e)); if (desert) desert.pointer(...toCss(e)); if (slime) slime.pointer(...toCss(e)); if (moss) moss.pointer(...toCss(e)); if (deserting()) markDone('sweep'); });   // 이끼: 커서를 대면 둘레 알갱이가 비켜나고 떨림
    // 부식: 왼쪽 버튼을 꾹 누르고 있으면 그 자리에서 부식이 점점 넓게 자람 (다른 손잡이보다 먼저 받도록 window capture)
    window.addEventListener('pointerdown', (e) => { if (corrode && e.button === 0 && frame.contains(e.target) && !(e.target.closest && e.target.closest('.sel-h'))) { if (ice) corrode.pointer(...toCss(e)); corrode.press(true); } }, true);
    const unpress = () => { if (corrode) corrode.press(false); };
    window.addEventListener('pointerup', unpress, true); window.addEventListener('pointercancel', unpress, true); window.addEventListener('blur', unpress);
    frame.addEventListener('pointerleave', () => { if (microbes) microbes.pointer(null); if (bubbles) bubbles.pointer(null); if (corrode) corrode.pointer(null); if (desert) desert.pointer(null); if (slime) slime.pointer(null); if (moss) moss.pointer(null); });
    // 성에 모드: 오른쪽 클릭한 자리에서도 글자 입력 시작 (왼쪽 클릭은 아래 — 빈 곳이면 입력, 사진이면 편집) — 친 글자는 얼음 점으로 (js/frosttype.js)
    frame.addEventListener('contextmenu', (e) => { if (lab.on || (typing && frostTyping())) e.preventDefault(); });
    // Lab mode: 오른쪽 클릭한 사진·글자만 Mix 카드로 고름 (빈 곳 = 전체 Mix 로 돌아감)
    frame.addEventListener('pointerdown', (e) => {
      if (e.button !== 2 || !ice || !lab.on) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const p = toCss(e), t = typing ? typing.pick(p[0], p[1], true) : null;
      if (t) { mixTarget = typing.keyOf(t); layerKind = 'text'; }
      else {
        const id = ice.hitTest(...toCanvas(e));
        if (id != null) { select(id); mixTarget = id; } else mixTarget = null;
      }
      renderLab();
    });
    frame.addEventListener('pointerdown', (e) => {
      if (e.button !== 2 || !typing || !ice || lab.on || !frostTyping()) return;
      e.preventDefault();
      typing.start(...toCss(e), ice ? ice.view.zoom : 1);
    });
    // 타이포: 더블클릭한 자리에서 글자 입력 시작 (사진 위·빈 곳 모두, 치는 글자가 그 모드의 재료로 그려짐 — 성에 모드는 얼음 점, js/frosttype.js)
    //  이미 친 글자를 더블클릭하면 그 글자에 이어서 침
    frame.addEventListener('dblclick', (e) => {
      if (!typing || !ice || (e.target.closest && e.target.closest('.sel-h')) || !(typingMode() || frostTyping())) return;
      e.preventDefault();
      typing.start(...toCss(e), ice.view.zoom);
      layerKind = 'text';
    });
    // 친 글자 끌어 옮기기 — 사진 편집·미생물 심기보다 먼저 (capture). 단, 글자가 그 자리 사진보다 뒤에 있으면 사진이 잡힘
    let textDrag = null;
    frame.addEventListener('pointerdown', (e) => {
      if (!typing || !ice || e.button !== 0 || (e.target.closest && e.target.closest('.sel-h'))) return;
      const p = toCss(e), t = typing.pick(p[0], p[1]);
      if (!t) return;
      const ph = ice.editable ? ice.hitTest(...toCanvas(e)) : null, z = syncZ();
      if (ph != null && z.indexOf(ph) > z.indexOf(typing.keyOf(t))) return;   // 사진이 위 → 사진 편집으로
      layerKind = 'text';
      textDrag ={ t, dx: t.x - p[0], dy: t.y - p[1], pid: e.pointerId };
      capture(frame, e.pointerId);
      frame.classList.add('editing');
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    frame.addEventListener('pointermove', (e) => {
      if (!textDrag || e.pointerId !== textDrag.pid) return;
      const p = toCss(e);
      typing.moveTo(textDrag.t, p[0] + textDrag.dx, p[1] + textDrag.dy);
      e.stopImmediatePropagation();
    }, true);
    const textEnd = (e) => { if (!textDrag || e.pointerId !== textDrag.pid) return; textDrag = null; frame.classList.remove('editing'); };
    frame.addEventListener('pointerup', textEnd, true); frame.addEventListener('pointercancel', textEnd, true);
    frame.addEventListener('pointerdown', (e) => {
      if (!microbes || e.button !== 0 || (e.target.closest && e.target.closest('.sel-h'))) return;
      const hit = ice && ice.editable ? ice.hitTest(...toCanvas(e)) : null;
      if (hit != null) {
        // 사진을 잡은 경우는 편집 — 단, 생장 모드에서 사진의 지워진 배경(누끼 밖)을 누르면 그 자리에 미생물
        const it = ice.items.find((x) => x.id === hit), M = ice.maskOf(hit), p = toCanvas(e);
        const u = (p[0] - it.rect[0]) / it.rect[2], v = (p[1] - it.rect[1]) / it.rect[3];
        const onSubject = !M || M.m[Math.min(M.h - 1, (v * M.h) | 0) * M.w + Math.min(M.w - 1, (u * M.w) | 0)] >= 0.5;
        if (!vital() || onSubject) return;
        e.stopImmediatePropagation();   // 사진 선택·이동으로 넘어가지 않게
      }
      // 타이포 입력 시작은 더블클릭 (아래 dblclick)
      // 점균: 클릭한 자리에서도 원형질이 퍼져 나감
      if (slime && slimeNow()) { slime.spawn(...toCss(e)); renderDash(); }
      if (moss && mossNow()) { moss.spawn(...toCss(e)); renderDash(); }   // 이끼: 피사체 안을 누르면 그 자리에 한 무더기
      if (!vital()) return;                                                     // 결빙 모드에서는 클릭으로 심지 않음
      if (lab.on || microbeOk()) { microbes.spawn(...toCss(e)); renderDash(); }   // Lab mode: 조건과 상관없이 심음
      else if (slimeNow() || mossNow()) { /* 점균·이끼 조건 — 미생물 대신 */ }
      else if (state.temperature >= DT.MICROBE.maxTemp) flashNotice(`Too hot — cool it below +${DT.MICROBE.maxTemp}° for microbes.`);
      else if (state.temperature < DT.MICROBE.minTemp) flashNotice(`Raise the temperature to +${DT.MICROBE.minTemp}° or higher to grow microbes.`);
      else flashNotice(`Raise the humidity to ${DT.MICROBE.humFrom}% or higher to grow microbes.`);
    });
    // 콜라주 편집: 이동 / 모서리로 크기 조절
    let edit = null;
    frame.addEventListener('pointerdown', (e) => {
      if (!ice || e.button !== 0 || !ice.editable) return;
      const p = toCanvas(e), handle = e.target.closest && e.target.closest('.sel-h');
      if (handle && selected != null) {
        const it = ice.items.find((x) => x.id === selected), [x, y, w, h] = it.rect;
        const sx = handle.dataset.c.includes('r') ? 1 : -1, sy = handle.dataset.c.includes('b') ? 1 : -1;
        // 반대쪽 모서리를 고정한 채 비율을 유지하며 크기 조절
        edit = { kind: 'size', id: selected, ax: x + w / 2 - sx * w / 2, ay: y + h / 2 - sy * h / 2, sx, sy, aspect: w / h, pid: e.pointerId };
      } else {
        const id = ice.hitTest(p[0], p[1]);
        if (id == null) { selected = null; renderTray(); return; }
        select(id);
        const it = ice.items.find((x) => x.id === id), [x, y, w, h] = it.rect;
        edit = { kind: 'move', id, dx: x + w / 2 - p[0], dy: y + h / 2 - p[1], pid: e.pointerId };
      }
      capture(frame, e.pointerId);
      frame.classList.add('editing');
      e.preventDefault();
    });
    frame.addEventListener('pointermove', (e) => {
      if (!edit || e.pointerId !== edit.pid) {
        if (ice && ice.editable && !edit) frame.style.cursor = ice.hitTest(...toCanvas(e)) != null ? 'move' : '';
        return;
      }
      const p = toCanvas(e);
      if (edit.kind === 'move') ice.moveTo(edit.id, p[0] + edit.dx, p[1] + edit.dy);
      else {
        // 고정 모서리 → 커서까지의 거리로 새 너비 (비율 유지)
        const w = Math.max(Math.abs(p[0] - edit.ax), Math.abs(p[1] - edit.ay) * edit.aspect), h = w / edit.aspect;
        ice.resizeTo(edit.id, w);
        ice.moveTo(edit.id, edit.ax + edit.sx * w / 2, edit.ay + edit.sy * h / 2);
      }
      updateSelection();
    });
    const end = (e) => {
      if (!edit || e.pointerId !== edit.pid) return;
      if (edit.kind === 'size') ice.commit(edit.id);   // 새 크기에 맞는 점 밀도로
      edit = null; frame.classList.remove('editing');
    };
    frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
    // Delete 키: 선택한 사진 삭제
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected != null && !(e.target.matches && e.target.matches('input, textarea'))) { e.preventDefault(); removePhoto(selected); }
    });
    // 버튼·파일 선택
    // '+': 오프닝 화면의 사진(갤러리) 중에서 골라 추가 — 갤러리 패널을 열고 닫음 (패널 안 '+' 로 새 사진 올리기)
    $('addBtn').addEventListener('click', () => { if (!gallery) return; if ($('gallery').hidden) gallery.open(false); else gallery.close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && gallery && !$('gallery').hidden) gallery.close(); });
    $('addInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    $('replaceInput').addEventListener('change', (e) => { replaceSelected(e.target.files[0]); e.target.value = ''; });
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(updateView, 150); });
    updateView();
  }
  function setupPhotoDrop() {
    const stage = $('stage');
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    const dragOn = (v) => { stage.dataset.drag = v ? 'on' : 'off'; };
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; dragOn(true); });
    window.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) dragOn(false); });
    window.addEventListener('drop', (e) => {
      e.preventDefault(); depth = 0; dragOn(false);
      if (e.target.closest && e.target.closest('#gallery')) return;   // 갤러리 위에 놓으면 갤러리로 (js/gallery.js)
      if (gallery && stage.dataset.intro === 'on') { gallery.addFiles(e.dataTransfer && e.dataTransfer.files); return; }   // 'Choose a Sample' 화면에서는 어디에 놓아도 갤러리로
      addFiles(e.dataTransfer && e.dataTransfer.files);   // 여러 장을 한 번에 놓아도 각각 추가
    });
    // 갤러리: 넣을 때 누끼를 따 두고, 고르면 그 누끼로 바로 배치 → 선택된 상태라 바로 이동·크기 조절
    gallery = DT.createGallery({
      panel: $('gallery'), tab: $('galTab'), grid: $('galGrid'), count: $('galCount'), closeBtn: $('galClose'), addBtn: $('galAdd'), input: $('galInput'), stage: $('stage'),
      intro: $('intro'), ring: $('ring'), title: $('introTitle'), home: $('homeTab'),
      onPick: (img, mask) => loadPhoto(img, mask),
      onStatus: (msg) => flashNotice(msg),
    });
  }
  // 모드 레이어(미생물 · 기포 · 부식 · 사막화 · 점균 · 이끼 · 성에 글자)를 새로 만듦 — 시작할 때, 그리고 Reset 직전(지금 레이어는 되돌리기용으로 보관)
  function freshModules() {
    microbes = DT.createMicrobes($('microbe'), $('frame'));
    bubbles = DT.createBubbles($('bubble'), $('frame'));
    corrode = DT.createCorrosion($('corrode'), $('frame'));
    desert = DT.createDesert($('desert'), $('frame'));
    slime = DT.createSlime($('slime'), $('frame'));
    slime.setReactivity(state.reactivity / 100);
    moss = DT.createMoss($('moss'), $('frame'));
    moss.setReactivity(state.reactivity / 100);
    frostType = DT.createFrostType($('frosttype'), $('frame'));
  }

  // ---------------- 되돌리기 (Undo / Redo) ----------------
  /*
   * 단계 하나 = 그 일을 하기 '직전'의 상태
   *  가벼운 단계 (다이얼 · Life · Lab · Mix · 사진 추가/삭제/선택/이동 · 글자): 설정 값 + 사진 목록(원본·누끼는 참조만) + 글자 — 최근 HIST_MAX 개
   *  무거운 단계 (Reset · 아카이브 샘플 불러오기): + 모드 레이어 인스턴스(자란 화면 그대로) · 캔버스 그림 · 화면 가장자리 성에 — 최근 HIST_HEAVY 개
   *   Reset 은 지금 레이어를 버리지 않고 보관한 뒤 새 레이어로 바꿔 끼우고 resetAll (resetAll 자체는 그대로) → Undo 하면 보관한 레이어를 다시 끼움
   *  다이얼은 한 번 끌기(누름 → 뗌) · 휠/키를 멈출 때까지를 한 단계로 묶음 (histBegin → histCommit)
   */
  const HIST_MAX = 30, HIST_HEAVY = 5;
  const hist = { undo: [], redo: [], tx: null, timer: 0, applying: false, hold: false };
  const MOD_CANVASES = ['microbe', 'corrode', 'desert', 'desertBg', 'slime', 'moss', 'frosttype'];   // 2D 레이어 (기포는 매 프레임 다시 그림)
  function settingsSnap() {
    return {
      temperature: state.temperature, humidity: state.humidity, oxygen: state.oxygen, reactivity: state.reactivity, light: state.light, prismBg: state.prismBg, prismFx: state.prismFx,
      vitality: state.vitality, lat: Math.round(globe.lat * 10) / 10, lab: Object.assign({}, lab), objMix: [...objMix].map(([k, o]) => [k, Object.assign({}, o)]), mixTarget,
    };
  }
  function contentSnap() {
    const photos = ice ? ice.items.map((it) => { const M = ice.maskOf(it.id); return { id: it.id, rect: it.rect.slice(), canvas: ice.photoOf(it.id), mask: M && M.model ? M : null, st: ice.itemState(it.id) }; }) : [];
    return { photos, selected, tray: trayOrder.slice(), z: syncZ().slice(), text: typing ? typing.stash() : null, textSig: JSON.stringify(typing ? typing.sig : []) };
  }
  const nowSnap = () => ({ set: settingsSnap(), con: contentSnap() });
  const setSig = (s) => JSON.stringify(s.set);
  const conSig = (s) => JSON.stringify([s.con.photos.map((p) => [p.id, p.rect.map(Math.round)]), s.con.selected, s.con.textSig]);
  function heavySnap() {
    const pix = {};
    for (const id of MOD_CANVASES) {
      const c = $(id); if (!c || !c.width || !c.height) continue;
      const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); pix[id] = k;
    }
    return { mods: { microbes, bubbles, corrode, desert, slime, moss, frostType }, pix, frame: ice ? ice.frameState : null };
  }
  function applySettings(s) {
    Object.assign(lab, s.lab);
    objMix.clear(); for (const [k, o] of s.objMix) objMix.set(k, Object.assign({}, o));
    mixTarget = s.mixTarget;
    setVitality(s.vitality);   // renderLab 포함
    setTemperature(s.temperature);
    setHumidity(s.humidity); setOxygen(s.oxygen); setReactivity(s.reactivity); setLight(s.light);
    setPrism('prismBg', s.prismBg); setPrism('prismFx', s.prismFx);
    setGlobeLat(s.lat);
  }
  function applyContent(c) {
    if (ice) {
      const want = new Set(c.photos.map((p) => p.id));
      for (const it of ice.items) if (!want.has(it.id)) ice.removePhoto(it.id);
      const have = new Set(ice.items.map((it) => it.id));
      for (const p of c.photos) {
        if (!have.has(p.id)) { if (p.canvas) ice.addPhoto(p.canvas, p.mask, Object.assign({ id: p.id, rect: p.rect }, p.st)); }   // 같은 번호로 → 모드 레이어가 그 사진을 알아봄
        else { const [x, y, w, h] = p.rect; ice.resizeTo(p.id, w); ice.moveTo(p.id, x + w / 2, y + h / 2); ice.commit(p.id); }
      }
      ice.setOrder(c.photos.map((p) => p.id));
      $('stage').dataset.photo = ice.hasPhoto ? 'on' : 'off';
    }
    selected = c.selected;
    trayOrder.length = 0; trayOrder.push(...c.tray);
    if (typing && c.text && JSON.stringify(typing.sig) !== c.textSig) typing.unstash(c.text);
    if (c.z) {   // 사진 · 글자 겹침 순서
      zOrder.length = 0; zOrder.push(...c.z);
      if (typing) typing.setOrder(zOrder.filter((k) => typeof k === 'string'));
      syncZ(); renderLayer();
    }
  }
  function applySnap(e) {
    hist.applying = true;
    try {
      if (e.heavy) {
        ({ microbes, bubbles, corrode, desert, slime, moss, frostType } = e.heavy.mods);
        for (const [id, k] of Object.entries(e.heavy.pix)) {
          const c = $(id), g = c && c.getContext('2d');
          if (g && c.width === k.width && c.height === k.height) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.drawImage(k, 0, 0); }
        }
      }
      applySettings(e.set);
      applyContent(e.con);
      if (e.heavy && ice) ice.setFrameState(e.heavy.frame);
      if (e.heavy) updateView();   // 다시 끼운 레이어를 지금 화면 크기에 맞춤
    } finally { hist.applying = false; }
    renderTray(); renderLab(); renderDash();
    dirty = true;
  }
  // 오래된 단계 버리기 — 일반 30개, 그중 레이어 스냅샷은 최근 5개만 (그보다 오래된 Reset 은 설정 · 사진만 되돌림)
  function histTrim(list) {
    while (list.length > HIST_MAX) list.shift();
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].heavy && ++n > HIST_HEAVY) list[i].heavy = null;
  }
  function histPush(e) { hist.undo.push(e); hist.redo.length = 0; histTrim(hist.undo); renderUndo(); }
  function histBegin(label) {
    if (hist.applying || !ice) return;
    clearTimeout(hist.timer);
    if (!hist.tx) hist.tx = { label, before: nowSnap() };
  }
  function histCommit() {
    clearTimeout(hist.timer);
    const tx = hist.tx; hist.tx = null;
    if (!tx) return;
    const now = nowSnap(), setCh = setSig(now) !== setSig(tx.before), conCh = conSig(now) !== conSig(tx.before);
    if (!setCh && !conCh) return;
    // 화면(사진 · 글자)에서 시작한 단계는 실제로 바뀐 것으로 이름을 붙임
    let label = tx.label;
    if (label === 'Photo' || label === 'Add photo' || label === 'Remove photo') {
      const b = tx.before.con, a = now.con;
      label = a.photos.length > b.photos.length ? 'Add photo' : a.photos.length < b.photos.length ? 'Remove photo'
        : a.textSig !== b.textSig ? 'Text' : setCh ? 'Mix' : a.selected !== b.selected && JSON.stringify(a.photos.map((p) => p.rect.map(Math.round))) === JSON.stringify(b.photos.map((p) => p.rect.map(Math.round))) ? 'Select photo' : 'Move photo';
    }
    histPush({ label, set: tx.before.set, con: tx.before.con });
  }
  // 짧은 일(클릭 · 휠 · 키 · 글자): 시작하고, ms 동안 더 없으면 한 단계로
  function histTouch(label, ms = 600) {
    if (hist.applying || !ice) return;
    histBegin(label);
    if (!hist.hold) hist.timer = setTimeout(histCommit, ms);
  }
  function undo() {
    histCommit();
    const e = hist.undo.pop();
    if (!e) { flashNotice('Nothing to undo.'); renderUndo(); return; }
    hist.redo.push(Object.assign(nowSnap(), { label: e.label, heavy: e.heavy ? heavySnap() : null }));
    histTrim(hist.redo);
    applySnap(e);
    flashNotice(`Undo: ${e.label}`);
    renderUndo();
  }
  function redo() {
    histCommit();
    const e = hist.redo.pop();
    if (!e) { flashNotice('Nothing to redo.'); renderUndo(); return; }
    hist.undo.push(Object.assign(nowSnap(), { label: e.label, heavy: e.heavy ? heavySnap() : null }));
    histTrim(hist.undo);
    applySnap(e);
    flashNotice(`Redo: ${e.label}`);
    renderUndo();
  }
  function renderUndo() {
    const b = $('undoBtn'); if (!b) return;
    const top = hist.undo[hist.undo.length - 1];
    b.disabled = !top;
    b.title = top ? `Undo: ${top.label} (Ctrl+Z) · Redo: Ctrl+Shift+Z` : 'Nothing to undo';
  }
  // Reset — 지금 화면(자란 레이어 포함)을 되돌리기용으로 보관하고 리셋 (resetAll 은 그대로)
  function resetWithUndo() {
    histCommit();
    const e = Object.assign(nowSnap(), { label: 'Reset', heavy: heavySnap() });
    freshModules();
    resetAll(false);
    histPush(e);
  }
  // 어떤 조작에서 시작했는지 → 단계 이름
  const UNDO_CTL = [
    ['#pTemp, #tempCtl', 'Temperature'], ['#pHum, #humCtl', 'Humidity'], ['#pAir', 'Oxygen'], ['#pReact', 'Growth Rate'], ['#pLight', 'Light'],
    ['#miniGlobe', 'Latitude'], ['#pPrismBg, #pPrismFx', 'Spectrum'], ['#vitalSw', 'Life'], ['#labSw', 'Lab'], ['#mixCard', 'Mix'],
    ['#trayList', 'Photo'], ['#gallery', 'Add photo'], ['#typeCard', 'Text style'], ['.type-sel', 'Text'], ['#frame', 'Photo'],
  ];
  const ctlLabel = (t) => { if (!t || !t.closest) return null; for (const [sel, name] of UNDO_CTL) if (t.closest(sel)) return name; return null; };
  function setupUndo() {
    $('undoBtn').addEventListener('click', undo);
    document.addEventListener('pointerdown', (e) => { const L = ctlLabel(e.target); if (L) histBegin(L); }, true);
    window.addEventListener('pointerup', () => { if (hist.tx && !hist.hold) { clearTimeout(hist.timer); hist.timer = setTimeout(histCommit, 350); } }, true);   // 클릭이 끝난 뒤(click 이벤트까지) 한 단계로
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
        if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;   // 글자 입력 중에는 입력칸의 되돌리기
        e.preventDefault();
        if (e.key === 'y' || e.key === 'Y' || e.shiftKey) redo(); else undo();
        return;
      }
      const L = ctlLabel(e.target);
      if (L && L !== 'Photo' && !e.ctrlKey && !e.metaKey) histTouch(L, 700);
    }, true);
    document.addEventListener('wheel', (e) => { const L = ctlLabel(e.target); if (L && L !== 'Photo') histTouch(L, 700); }, { capture: true, passive: true });   // 화면 휠 = 확대 (되돌리지 않음)
    renderUndo();
  }

  /*
   * 처음 상태로 리셋 (오른쪽 위 Reset)
   *  사진 모두 삭제 · 결빙/가장자리 성에/확대/녹은 자리 초기화 · 기온·습도 다이얼을 시작값으로 (바로, 서서히가 아니라)
   */
  function resetAll(toIntro = true) {
    if (ice) ice.reset(START.temperature);
    if (microbes) microbes.clear();
    if (bubbles) bubbles.clear();
    if (corrode) corrode.clear();
    if (desert) desert.clear();
    if (slime) slime.clear();
    if (moss) moss.clear();
    if (typing) typing.clear();
    selected = null;
    $('stage').dataset.photo = 'off';
    renderTray();
    if (gallery && toIntro) gallery.open(true);   // 다음 관람자(카메라 가림): 다시 'Choose a Sample' 화면부터 · Reset 버튼은 본 화면에 그대로
    if (state.paused) setPaused(false);
    dialT = null; humT = null;
    $('tempCtl').classList.remove('turning'); $('humCtl').classList.remove('turning');
    setTemperature(START.temperature);
    frost.setTemperature(state.temperature, true);
    setHumidity(START.humidity);
    setOxygen(START.oxygen);
    setReactivity(START.reactivity);
    setLight(START.light);
    setPrism('prismBg', START.prismBg); setPrism('prismFx', START.prismFx);
    if (engine.clearBreath) engine.clearBreath();
    dirty = true;
    flashNotice('Reset.');
  }

  /*
   * 사진으로 저장 — 지금 화면에 보이는 그대로(작품 레이어 합성) PNG 로 내려받기
   *  프레임(16:10)은 화면을 가득 채우도록 커서 일부가 화면 밖에 있음 → 보이는 부분만 잘라 저장
   */
  // 생장 배경을 캔버스에 칠할 색 (css .bio-bg 와 맞춤): 점균 = 단색 파랑, 그 밖 = 흰색
  function bioFill() { const t = $('bioBg').dataset.tone; return t === 'slime' ? '#3a6fc4' : t === 'moss' ? '#000' : '#fbfbf8'; }
  // 화면에 보이는 작품 부분 (engine 캔버스 px) — 프레임은 화면보다 클 수 있음
  function artCrop() {
    const W = engine.canvas.width, H = engine.canvas.height;
    const r = $('frame').getBoundingClientRect();
    const fx = Math.min(1, window.innerWidth / r.width), fy = Math.min(1, window.innerHeight / r.height);
    const sw = Math.round(W * fx), sh = Math.round(H * fy);
    return { W, sw, sh, sx: Math.round((W - sw) / 2), sy: Math.round((H - sh) / 2) };
  }
  // 지금 화면의 작품 레이어를 한 캔버스로 합성 — 셔터 · savePhoto · References 패널(__DIFFUSE__.snapshot)이 함께 씀
  function composeView() {
    engine.render(renderParams());
    particles.draw();
    if (ice) ice.render();
    const { sw, sh } = artCrop();
    const out = document.createElement('canvas');
    out.width = sw; out.height = sh;
    paintArtwork(out.getContext('2d'), sw, sh);
    // Color(채도) · Light(명도·대비) — 화면과 같게, 다 합친 그림에 한 번에
    const f = viewFilter();
    if (!f) return out;
    const fin = document.createElement('canvas');
    fin.width = sw; fin.height = sh;
    const fctx = fin.getContext('2d');
    fctx.filter = f; fctx.drawImage(out, 0, 0);
    return fin;
  }
  // 작품 레이어만(대시보드 없이) 합성해 octx 의 ow × oh 에 그림 — 사진 찍기 · 영상 녹화가 함께 씀 (Color·Light 필터는 부르는 쪽에서)
  function paintArtwork(octx, ow, oh) {
    const { W, sw, sh, sx, sy } = artCrop();
    octx.clearRect(0, 0, ow, oh);
    const white = $('bioBg').dataset.on === 'true';
    if (white) { octx.fillStyle = bioFill(octx, ow, oh); octx.fillRect(0, 0, ow, oh); }   // 생장 모드 배경색 흰색 · 점균 모드는 파랑 (그레인은 제외)
    const draw = (c, filter) => {
      const k = c.width / W;   // 레이어마다 해상도가 다를 수 있음
      octx.filter = filter || 'none';
      octx.drawImage(c, sx * k, sy * k, sw * k, sh * k, 0, 0, ow, oh);
    };
    if (!white) { draw(engine.canvas); draw(particles.canvas); }   // 생장 모드에서는 검은 바탕 레이어 대신 생장 배경
    if (prismOn(state.prismBg)) {   // Prism 배경색 (화면의 #prismBg 와 같게)
      const light = white && $('bioBg').dataset.tone !== 'moss', h = prismHue(state.prismBg).toFixed(1);
      octx.filter = 'none'; octx.globalCompositeOperation = prismBlack(state.prismBg) ? 'source-over' : light ? 'multiply' : 'screen';
      octx.fillStyle = prismBlack(state.prismBg) ? '#000' : `hsl(${h}, 70%, ${light ? 78 : 24}%)`; octx.fillRect(0, 0, ow, oh);   // 검정 = 배경을 완전히 덮음
      octx.globalCompositeOperation = 'source-over';
    }
    if (ice) draw(ice.canvas);
    const tintF = prismOn(state.prismFx) ? 'url(#fxTint)' : '';   // Prism 효과색
    for (const m of [frostType, microbes, bubbles, corrode, desert, slime, moss]) if (m) draw(m.canvas, tintF);   // 화면의 효과 레이어 순서 (성에 글자 포함)
    octx.filter = 'none';
  }

  /*
   * 영상으로 저장 — 대시보드(패널)는 빼고 작품 레이어만 녹화 (사진 찍기와 같은 합성을 매 프레임)
   *  오른쪽 위 Record 버튼 또는 R 키로 시작 · 다시 누르면 멈추고 내려받음 (mp4 가 되면 mp4, 아니면 webm)
   *  메인 루프가 레이어를 다 그린 직후(같은 프레임) recordFrame 이 합성 — WebGL 캔버스를 그린 직후에 읽음
   */
  const REC = { fps: 30, maxW: 1920, bitrate: 12e6 };
  let rec = null;   // { canvas, ctx, tmp, tctx, mr, chunks, t0, last, type }
  function recordFrame(now) {
    if (!rec || now - rec.last < 1000 / REC.fps - 4) return;
    rec.last = now;
    const { sw, sh } = artCrop();
    const k = Math.min(1, REC.maxW / sw), w = Math.max(2, Math.round(sw * k / 2) * 2), h = Math.max(2, Math.round(sh * k / 2) * 2);
    if (rec.canvas.width !== w || rec.canvas.height !== h) { rec.canvas.width = rec.tmp.width = w; rec.canvas.height = rec.tmp.height = h; }
    paintArtwork(rec.tctx, w, h);
    const c = rec.ctx;
    c.filter = 'none'; c.fillStyle = '#020305'; c.fillRect(0, 0, w, h);   // 프레임 바탕색 (화면과 같게)
    c.filter = viewFilter() || 'none'; c.drawImage(rec.tmp, 0, 0); c.filter = 'none';
    const s = Math.floor((now - rec.t0) / 1000), lbl = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (rec.lbl !== lbl) { rec.lbl = lbl; $('recTime').textContent = lbl; }
  }
  let recNoMp4 = false;   // mp4 인코더가 데이터를 내지 않으면(일부 환경) 이후로는 webm
  function startRecording() {
    if (rec || typeof MediaRecorder === 'undefined') { if (!rec) flashNotice('Video recording is not supported in this browser.'); return; }
    const canvas = document.createElement('canvas'), tmp = document.createElement('canvas');
    canvas.width = tmp.width = 2; canvas.height = tmp.height = 2;
    const type = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => !(recNoMp4 && /mp4/.test(t)) && MediaRecorder.isTypeSupported(t)) || '';
    rec = { canvas, ctx: canvas.getContext('2d'), tmp, tctx: tmp.getContext('2d'), chunks: [], t0: performance.now(), last: 0, type, lbl: '' };
    recordFrame(performance.now());   // 첫 프레임 (크기 맞춤)
    let mr;
    try { mr = new MediaRecorder(canvas.captureStream(REC.fps), type ? { mimeType: type, videoBitsPerSecond: REC.bitrate } : { videoBitsPerSecond: REC.bitrate }); }
    catch (e) { rec = null; flashNotice('Could not start recording: ' + e.message); return; }
    const r = rec;
    r.mr = mr;
    mr.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };   // 멈춘 뒤(rec = null)에도 마지막 조각이 옴
    // mp4 로 시작했는데 2초가 지나도 데이터가 없으면 → 조용히 webm 으로 다시 시작
    if (/mp4/.test(type)) setTimeout(() => {
      if (rec !== r || r.chunks.length) return;
      r.dead = true; recNoMp4 = true; rec = null;
      try { mr.stop(); } catch (e) { /* 이미 멈춤 */ }
      startRecording();
    }, 2000);
    mr.onstop = () => {
      if (r.dead) return;
      const blob = new Blob(r.chunks, { type: (r.type || 'video/webm').split(';')[0] });
      if (!blob.size) { flashNotice('Recording failed — no video data was produced.'); return; }
      const d = new Date(), p = (n) => String(n).padStart(2, '0');
      DT.downloadBlob(blob, `LABORATORY_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${/mp4/.test(r.type) ? 'mp4' : 'webm'}`);
      flashNotice('Video saved.');
    };
    mr.start(1000);
    $('recBtn').classList.add('rec-on'); $('recBtn').title = 'Stop recording and save the video (R)'; $('recTime').textContent = '0:00';
    flashNotice('Recording — the panels are not included. Press R again to stop.');
  }
  function stopRecording() {
    if (!rec) return;
    const r = rec; rec = null;
    try { r.mr.stop(); } catch (e) { /* 이미 멈춤 */ }
    $('recBtn').classList.remove('rec-on'); $('recBtn').title = 'Record a video of the artwork without the panels (R)'; $('recTime').textContent = 'Record';
  }
  function setupRecorder() {
    $('recBtn').addEventListener('click', () => (rec ? stopRecording() : startRecording()));
    document.addEventListener('keydown', (e) => {
      if ((e.key !== 'r' && e.key !== 'R') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t.closest && t.closest('input, textarea, [contenteditable]')) return;   // 글자 입력 중에는 그냥 글자
      const st = $('stage').dataset;
      if (!rec && (st.intro === 'on' || st.archive === 'on')) return;            // 오프닝·아카이브 화면에서는 시작하지 않음
      e.preventDefault();
      if (rec) stopRecording(); else startRecording();
    });
  }
  async function savePhoto() {   // 콘솔 __DIFFUSE__ 용 — 셔터는 아카이브에 보관 (setupSaveButton)
    const blob = await DT.exportPNG(composeView());
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const name = `LABORATORY_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
    DT.downloadBlob(blob, name);
    return name;
  }
  /*
   * 아카이브 포스터의 글 — 지금 가장 많이 진행된 모드의 측정값 (레퍼런스: 'Carbon sequestration efficiency · 65.3 mg CO₂ per gram')
   *  두 번째 줄 = 찍을 때의 기온 · 습도 · 산소. 아무 모드도 진행되지 않았으면 기온을 숫자로
   */
  function archiveStats() {
    const T = state.temperature, RH = state.humidity, O2 = state.oxygen;
    const frostK = ice ? Math.min(1, ice.clock / ice.clockEnd) : 0;
    const corK = corrode ? corrode.visible : 0, desK = desert ? desert.visible : 0;
    const nMic = microbes ? microbes.count : 0, nBub = bubbles ? bubbles.count : 0;
    const slmK = slime ? slime.visible : 0, slmC = slime ? slime.coverage : 0;
    const mosK = moss ? moss.visible : 0, mosC = moss ? moss.coverage : 0;
    const signed = (v) => (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(1);
    const sub = `${signed(T)} °C · ${Math.round(RH)}% RH · ${Math.round(O2)}% O₂`;
    const pct = (x) => (x * 100).toFixed(1);
    const cands = [
      { s: frostK, title: 'Frost crystallisation', value: pct(frostK), unit: '% surface frozen' },
      { s: corK, title: 'Surface corrosion', value: pct(corK), unit: '% surface oxidised' },
      { s: desK, title: 'Desertification', value: pct(desK), unit: '% surface dried' },
      { s: nMic ? 0.02 + Math.min(1, nMic / 300) : 0, title: 'Microbial growth', value: nMic.toLocaleString('en-US'), unit: 'cells per dish' },
      { s: nBub ? 0.01 + Math.min(1, nBub / 150) : 0, title: 'Gas bubble formation', value: nBub.toLocaleString('en-US'), unit: 'bubbles per dish' },
      { s: slmK > 0.01 ? 0.03 + slmC * 1.5 : 0, title: 'Plasmodial network spread', value: pct(slmC), unit: '% of sample covered' },
      { s: mosK > 0.01 ? 0.03 + mosC * 1.5 : 0, title: 'Moss colonisation', value: pct(mosC), unit: '% of sample covered' },
    ];
    const best = cands.reduce((a, b) => (b.s > a.s ? b : a));
    const specimens = typing ? typing.labels() : [];   // 친 글자마다 표본 라벨 줄 → 포스터의 'Type specimens'
    if (best.s < 0.005) return { title: 'Sample temperature', sub: `${Math.round(RH)}% RH · ${Math.round(O2)}% O₂`, value: signed(T), unit: '°C ambient', specimens };
    return { title: best.title, sub, value: best.value, unit: best.unit, specimens };
  }
  /*
   * 아카이브 장면 — 찍는 순간의 본 화면 상태를 함께 보관 → 아카이브의 'Edit' 로 그대로 불러와 다시 편집
   *  Lab mode·Mix(켠 모드) · Vitality · 기온·습도·산소 · 색(지구본) · 사진(원본 + 누끼 + 위치·크기) · 친 글자
   *  (미생물·기포·부식·사막화·성에 같은 진행 결과는 불러온 뒤 같은 조건에서 다시 자라남)
   */
  function sceneLabel() {
    if (lab.on) {
      const on = Object.keys(LAB_MODES).filter((m) => lab[m]).map((m) => LAB_MODES[m]);
      return on.length ? `Mix · ${on.join(' + ')}` : 'Mix · none';
    }
    const v = state.vitality;
    const m = corroding() ? 'Corrosion' : deserting() ? 'Desert' : bubbling() ? 'Bubbles' : sliming() ? 'Slime' : mossing() ? 'Moss' : v ? 'Microbes' : 'Frost';
    return `${m} mode`;
  }
  const canvasBlob = (c) => new Promise((res) => c.toBlob((b) => (b ? res(b) : c.toBlob(res, 'image/png')), 'image/webp', 0.92));
  const packMask = (M) => { const d = new Uint8Array(M.m.length); for (let i = 0; i < d.length; i++) d[i] = Math.round(M.m[i] * 255); return { w: M.w, h: M.h, data: d }; };
  const unpackMask = (P) => { const N = P.w * P.h, m = new Float32Array(N); let a = 0; for (let i = 0; i < N; i++) { m[i] = P.data[i] / 255; a += m[i]; } return { w: P.w, h: P.h, m, coverage: a / N, model: true }; };
  function captureScene() {
    // 상태는 셔터를 누른 순간 값으로 (사진 인코딩은 그 뒤 비동기로)
    const sc = {
      v: 1, label: sceneLabel(),
      lab: Object.assign({}, lab), vitality: state.vitality,
      temperature: state.temperature, humidity: state.humidity, oxygen: state.oxygen, reactivity: state.reactivity, light: state.light, prismBg: state.prismBg, prismFx: state.prismFx,
      lat: globe.lat, lon: globe.lon,
      text: typing ? typing.snapshot() : null,
    };
    const src = ice ? ice.items.map((it) => { const M = ice.maskOf(it.id); return { canvas: ice.photoOf(it.id), mask: M && M.model ? packMask(M) : null, rect: it.rect.slice() }; }) : [];
    return (async () => {
      sc.photos = [];
      for (const p of src) if (p.canvas) sc.photos.push({ blob: await canvasBlob(p.canvas), mask: p.mask, rect: p.rect });
      return sc;
    })();
  }
  let loadToken = 0;
  async function loadScene(sc, no) {
    const token = ++loadToken;
    // 되돌리기: 불러오기 직전 화면을 Reset 처럼 통째로 보관 (불러오는 동안의 사진 추가는 따로 쌓지 않음)
    histCommit();
    const undoEntry = Object.assign(nowSnap(), { label: 'Load sample', heavy: heavySnap() });
    hist.hold = true;
    freshModules();
    resetAll(false);
    // Mix · 모드 · 환경 · 색
    Object.assign(lab, { frost: false, microbe: false, bubble: false, corrode: false, desert: false, slime: false, moss: false }, sc.lab || {});
    setVitality(!!sc.vitality);   // renderLab 포함
    setTemperature(sc.temperature);
    frost.setTemperature(state.temperature, true);
    setHumidity(sc.humidity);
    setOxygen(sc.oxygen);
    setReactivity(sc.reactivity != null ? sc.reactivity : START.reactivity);
    setLight(sc.light != null ? sc.light : START.light);
    setPrism('prismBg', sc.prismBg || 0); setPrism('prismFx', sc.prismFx || 0);
    if (sc.lat != null) { globe.lon = sc.lon || 0; setGlobeLat(sc.lat); }
    // 친 글자
    if (typing) typing.restore(sc.text);
    // 사진 (아래 → 위 순서, 같은 자리·크기)
    try {
      for (const p of sc.photos || []) {
        let img;
        try { img = await createImageBitmap(p.blob); } catch (e) { continue; }
        if (token !== loadToken) return;
        const id = loadPhoto(img, p.mask ? unpackMask(p.mask) : null);
        if (id == null) continue;
        const [x, y, w, h] = p.rect;
        ice.resizeTo(id, w); ice.moveTo(id, x + w / 2, y + h / 2); ice.commit(id);
      }
    } finally {
      hist.hold = false; hist.tx = null; clearTimeout(hist.timer);
      histPush(undoEntry);
    }
    renderTray();
    dirty = true;
    flashNotice(`Loaded No. ${String(no).padStart(3, '0')} — ${sc.label || 'scene'} · keep editing`);
  }
  function setupSaveButton() {
    archive = DT.createArchive({
      root: $('archive'), rail: $('archRail'), back: $('archBack'), stage: $('stage'),
      view: $('archView'), img: $('archImg'), meta: $('archMeta'),
      prev: $('archPrev'), next: $('archNext'), save: $('archSave'), del: $('archDel'), close: $('archClose'), load: $('archLoad'),
      onLoad: (sc, no) => { loadScene(sc, no).catch((e) => flashNotice('Could not load the archived scene: ' + e.message)); },
    });
    $('archBtn').addEventListener('click', () => archive.open());
    // 스페이스 바 = 셔터: 지금 화면을 찍고(작품 레이어만, 대시보드 제외) 하얗게 번쩍임 → 포스터로 아카이브에 보관 (+ 다시 편집할 수 있게 장면도)
    let shooting = false;
    const shoot = async () => {
      if (shooting) return;
      shooting = true;
      const fl = $('flash');
      fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
      try { const no = await archive.add(composeView(),archiveStats(), captureScene()); flashNotice(`Archived — No. ${String(no).padStart(3, '0')}`); markDone('keep'); } catch (e) { flashNotice('Could not archive the image: ' + e.message); }
      shooting = false;
    };
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t.closest && t.closest('input, textarea, [contenteditable]')) return;   // 글자 입력 중에는 그냥 띄어쓰기
      const st = $('stage').dataset;
      if (st.intro === 'on' || st.archive === 'on') return;                     // 오프닝·아카이브 화면에서는 찍지 않음
      e.preventDefault();   // 포커스된 버튼·스위치가 눌리지 않게
      shoot();
    });
  }

  /*
   * 로딩 젖빛 유리 (css .fog) — 켜면 서서히 뿌얘지고, 끄면 서서히 맑아진 뒤 숨김.
   * 맑아지는 중에 다시 켜지면(사진 여러 장을 이어서 처리) 그대로 다시 뿌얘짐
   */
  let fogTimer = 0;
  function setLoadingFog(on) {
    const f = $('fog');
    clearTimeout(fogTimer);
    $('waitNote').hidden = !on;   // 오른쪽 위 '기다려 주세요'
    if (on) {
      if (f.hidden) { f.hidden = false; void f.offsetWidth; }   // 표시한 다음 프레임에 .on → 전환이 보이게
      f.classList.add('on');
    } else if (!f.hidden) {
      f.classList.remove('on');
      fogTimer = setTimeout(() => { f.hidden = true; }, 950);
    }
  }

  let noticeTimer = 0;
  function flashNotice(msg) { showNotice(msg); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => showNotice(''), 3500); }

  // ---------------- 환경 ----------------
  const transitioning = false, mode = 'scene';
  function sceneDisplay() {
    const sc = scene();
    $('stage').dataset.tone = sc.tone || 'dark';
    const bg = sc.palette.bgBot.map((v) => Math.round(v * 255)).join(',');
    document.documentElement.style.setProperty('--scene-bg', `rgb(${bg})`);
    $('tempCtl').hidden = !sc.frost;
    $('humCtl').hidden = !sc.frost;
  }

  /*
   * 캔버스 위 포인터 — 차가운 환경의 3D 얼음 글자 조작 (유리 돋보기는 없앰)
   *  왼쪽 버튼으로 글자 위를 드래그: 전체 시점 회전 (관성, 놓으면 천천히 기본 시점으로)
   *  버튼 없이 글자 위에 올리기: 가까운 글자가 커서 쪽으로 부드럽게 돌아봄
   */
  function setupSculptInput() {
    const frame = $('frame');
    const sculptOn = () => !!ice && ice.hasPhoto;
    const toCanvas = (e) => { const r = frame.getBoundingClientRect(), k = particles.canvas.width / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
    let drag = null;
    const cursor = (c) => { if (frame.style.cursor !== c) frame.style.cursor = c; };
    frame.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!sculptOn() || e.button !== 0) return;
      const p = toCanvas(e);
      if (!frost.overText(p[0], p[1])) return;                // 글자(조형물)를 잡았을 때만 돌림
      capture(frame, e.pointerId);
      drag = { id: e.pointerId, p, t: performance.now() };
      frost.grab(); frost.hover(null); cursor('grabbing');
    });
    frame.addEventListener('pointermove', (e) => {
      if (!sculptOn()) { cursor(''); return; }
      const p = toCanvas(e);
      if (drag && e.pointerId === drag.id) {
        const now = performance.now();
        frost.dragBy(p[0] - drag.p[0], p[1] - drag.p[1], (now - drag.t) / 1000);
        drag.p = p; drag.t = now;
        return;
      }
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        frost.hover(p[0], p[1]);
        cursor(frost.overText(p[0], p[1]) ? 'grab' : '');
      }
    });
    const up = (e) => {
      if (drag && e.pointerId === drag.id && (e.type === 'pointercancel' || !(e.buttons & 1))) {
        frost.release(); drag = null; cursor('grab');
      }
    };
    frame.addEventListener('pointerup', up);
    frame.addEventListener('pointercancel', up);
    frame.addEventListener('pointerleave', () => { if (!drag) { frost.hover(null); cursor(''); } });
  }

  function setupScenes() {
    DT.applyScenePalette(scene());
    setupSculptInput();
    setupBreathInput();
    setupPhotoDrop();
    sceneDisplay();
  }
  // ---------------- 프리셋 ----------------
  function setupPresets() {
    const g = $('presetGroup');
    if (!g) return;
    Object.keys(DT.PRESETS).forEach((id) => {
      const p = DT.PRESETS[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.id = id;
      b.textContent = p.label;
      b.title = `${p.desc} · F ${p.F} / K ${p.K}`;
      b.addEventListener('click', () => selectPreset(id));
      g.appendChild(b);
    });
    g.addEventListener('keydown', (e) => {
      const ids = Object.keys(DT.PRESETS);
      const i = ids.indexOf(state.preset);
      let n = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % ids.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + ids.length) % ids.length;
      if (n >= 0) { e.preventDefault(); selectPreset(ids[n]); g.querySelector(`[data-id="${ids[n]}"]`).focus(); }
    });
    renderPresets();
  }
  function renderPresets() {
    if (!$('presetGroup')) return;
    $('presetGroup').querySelectorAll('button').forEach((b) => {
      const on = b.dataset.id === state.preset;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    const p = DT.PRESETS[state.preset];
    $('presetDesc').textContent = `${p.desc} — F ${p.F.toFixed(4)} · K ${p.K.toFixed(4)} · Du/Dv ${p.Du}/${p.Dv}`;
  }
  function selectPreset(id) {
    if (!DT.PRESETS[id] || id === state.preset) return;
    state.preset = id;
    renderPresets();
    updateParams();
    // 프리셋마다 패턴 차이가 분명히 보이도록 같은 시드로 다시 성장 (모이는 중이면 모인 뒤 적용됨)
    if (phase === 'growing') restartGrowth();
  }

  // ---------------- 슬라이더 ----------------
  const SLIDERS = [
    { key: 'speed', label: 'Growth speed' },
    { key: 'density', label: 'Density' },
    { key: 'diffusion', label: 'Diffusion' },
    { key: 'erosion', label: 'Erosion' },
    { key: 'windStrength', label: 'Wind strength' },
    { key: 'windDir', label: 'Wind direction', deg: true },
  ];
  const fmtVal = (s, v) => (s.deg ? `${Math.round(v)}° ${DT.compass(v)}` : String(Math.round(v * 100)));
  function setupSliders() {
    const box = $('sliders');
    if (!box) return;
    SLIDERS.forEach((s) => {
      const wrap = document.createElement('div');
      wrap.className = 'slider';
      const id = 'sl-' + s.key;
      wrap.innerHTML =
        `<div class="slider-head"><label for="${id}">${s.label}</label>` +
        `<span class="vals"><span class="mv"></span> · <span class="ap"></span></span></div>` +
        `<div class="track-wrap"><input type="range" id="${id}"><i class="applied-mark" aria-hidden="true"></i></div>`;
      const input = wrap.querySelector('input');
      if (s.deg) { input.min = 0; input.max = 355; input.step = 5; input.value = state.manual[s.key]; }
      else { input.min = 0; input.max = 100; input.step = 1; input.value = Math.round(state.manual[s.key] * 100); }
      input.addEventListener('input', () => {
        state.manual[s.key] = s.deg ? Number(input.value) : Number(input.value) / 100;
        updateParams();
      });
      s.el = wrap;
      box.appendChild(wrap);
    });
  }
  function renderSliders() {
    if (!$('sliders')) return;
    SLIDERS.forEach((s) => {
      const m = state.manual[s.key], a = params.applied[s.key];
      const changed = s.deg ? Math.abs(((a - m + 540) % 360) - 180) > 2 : Math.abs(a - m) > 0.005;
      s.el.querySelector('.mv').textContent = 'Manual ' + fmtVal(s, m);
      const ap = s.el.querySelector('.ap');
      ap.textContent = 'Applied ' + fmtVal(s, a);
      ap.classList.toggle('changed', changed);
      const input = s.el.querySelector('input');
      input.setAttribute('aria-valuetext', `Manual ${fmtVal(s, m)}, applied ${fmtVal(s, a)}`);
      const mark = s.el.querySelector('.applied-mark');
      const frac = s.deg ? a / 360 : a;
      mark.style.left = `calc(${(frac * 100).toFixed(2)}% - 1px)`;
      mark.classList.toggle('on', changed);
    });
  }

  // ---------------- 기온 (차가운 환경의 성에) ----------------
  const fmtTemp = (t) => `${t < 0 ? '−' : ''}${Math.abs(Math.round(t))} °C`;
  // 기온 컨트롤 바 (화면 오른쪽 아래, 차가운 환경에서만) — 성에 성장/녹음과 환경 보정에 연결
  function setTemperature(t) {
    const R = DT.FROST.controlRange;
    state.temperature = Math.round(Math.min(R[1], Math.max(R[0], Number(t))));
    frost.setTemperature(state.temperature); // 성에는 적용 온도가 부드럽게 따라감 (순간적으로 튀지 않음)
    renderTemp();
    if (scene().frost) updateParams();
  }
  /*
   * 원형 기온 다이얼 — 270° 고리. 왼쪽 아래(반시계 끝) = 가장 추움, 오른쪽 아래(시계 끝) = 가장 따뜻함
   *  다이얼을 잡고 돌리면(중심 기준 각도 변화) 기온이 바뀜: 시계 방향 = 따뜻하게, 반시계 = 차갑게
   *  휠 · 화살표 키(±1 °C) · PageUp/PageDown(±5 °C)도 가능. 녹는점(0 °C)에는 작은 눈금
   */
  const DIAL = { cx: 36, cy: 36, r: 31, a0: -135, a1: 135 };   // 각도: 12시 = 0°, 시계 방향 +
  const dialPt = (deg, r) => { const a = deg * Math.PI / 180; return [DIAL.cx + r * Math.sin(a), DIAL.cy - r * Math.cos(a)]; };
  const dialArc = (d0, d1, r) => {
    const p0 = dialPt(d0, r), p1 = dialPt(d1, r);
    return `M${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
  };
  const tempToDeg = (t) => { const R = DT.FROST.controlRange; return DIAL.a0 + (t - R[0]) / (R[1] - R[0]) * (DIAL.a1 - DIAL.a0); };
  let dialT = null; // 다이얼이 보여 주는 온도 (드래그 중 소수점까지 부드럽게)
  function renderTemp() {
    const t = dialT == null ? state.temperature : dialT, deg = tempToDeg(t);
    $('dialValue').setAttribute('d', deg - DIAL.a0 > 0.5 ? dialArc(DIAL.a0, deg, DIAL.r) : '');
    const k = dialPt(deg, DIAL.r);
    $('dialKnob').setAttribute('cx', k[0].toFixed(2)); $('dialKnob').setAttribute('cy', k[1].toFixed(2));
    const melt = state.temperature > DT.FROST.meltPoint;
    $('tempVal').textContent = `${state.temperature < 0 ? '−' : ''}${Math.abs(state.temperature)}°`;
    const ctl = $('tempCtl');
    ctl.classList.toggle('thaw', melt);
    ctl.setAttribute('aria-valuenow', state.temperature);
    ctl.setAttribute('aria-valuetext', `${fmtTemp(state.temperature)}${melt ? ', frost is melting' : ''}`);
  }
  function setupTemp() {
    const ctl = $('tempCtl'), R = DT.FROST.controlRange;
    ctl.setAttribute('aria-valuemin', R[0]); ctl.setAttribute('aria-valuemax', R[1]);
    $('dialTrack').setAttribute('d', dialArc(DIAL.a0, DIAL.a1, DIAL.r));
    const m0 = dialPt(tempToDeg(DT.FROST.meltPoint), DIAL.r - 4), m1 = dialPt(tempToDeg(DT.FROST.meltPoint), DIAL.r + 3);
    const ml = $('dialMelt');
    ml.setAttribute('x1', m0[0]); ml.setAttribute('y1', m0[1]); ml.setAttribute('x2', m1[0]); ml.setAttribute('y2', m1[1]);
    // 돌리기: 중심 기준 포인터 각도의 변화량만큼 온도 변화 (270° = 전체 범위)
    let turn = null;
    const angleOf = (e) => { const r = ctl.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI; };
    ctl.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      capture(ctl, e.pointerId); ctl.focus({ preventScroll: true });
      turn = { id: e.pointerId, a: angleOf(e) }; dialT = state.temperature;
      ctl.classList.add('turning');
    });
    ctl.addEventListener('pointermove', (e) => {
      if (!turn || e.pointerId !== turn.id) return;
      const a = angleOf(e);
      let d = a - turn.a; d = ((d + 540) % 360) - 180; // −180~180 로 감싸기
      turn.a = a;
      dialT = Math.max(R[0], Math.min(R[1], dialT + d / (DIAL.a1 - DIAL.a0) * (R[1] - R[0])));
      if (Math.round(dialT) !== state.temperature) setTemperature(dialT); else renderTemp();
    });
    const end = (e) => { if (!turn || e.pointerId !== turn.id) return; turn = null; dialT = null; ctl.classList.remove('turning'); renderTemp(); };
    ctl.addEventListener('pointerup', end); ctl.addEventListener('pointercancel', end);
    ctl.addEventListener('wheel', (e) => { e.preventDefault(); setTemperature(state.temperature + (e.deltaY > 0 ? -1 : 1)); }, { passive: false });
    ctl.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
      if (step) { e.preventDefault(); e.stopPropagation(); setTemperature(state.temperature + step); }
      else if (e.key === 'Home') { e.preventDefault(); setTemperature(R[0]); }
      else if (e.key === 'End') { e.preventDefault(); setTemperature(R[1]); }
    });
    renderTemp();
  }

  // ---------------- 습도 (온도와 함께 물질 생장) ----------------
  // 기온 다이얼과 같은 모양·조작: 돌리기(시계 방향 = 습하게) · 휠 · 화살표(±1 %) · PageUp/PageDown(±5 %)
  const HUM = [0, 100];
  let humT = null;
  const humToDeg = (h) => DIAL.a0 + (h - HUM[0]) / (HUM[1] - HUM[0]) * (DIAL.a1 - DIAL.a0);
  function setHumidity(h) {
    state.humidity = Math.round(Math.min(HUM[1], Math.max(HUM[0], Number(h))));
    if (ice) ice.setHumidity(state.humidity);
    renderHum();
  }
  // 산소(%) — 대시보드 Air 바. 습도와 함께 기포를 결정 (js/bubble.js)
  // 점균 반응성(%) — 자라는 빠르기·갈라짐·구불거림·커서/클릭 반응 (js/slime.js setReactivity)
  // 반응성 → 모든 모드의 진행 속도 배율: 0% ×0.5 · 50% ×1 · 100% ×2 (메인 루프 mdt) — ×4 는 렉이 걸려 낮춤
  const reactSpeedAt = (r) => 2 ** ((r - 50) / 50);
  const reactSpeed = () => reactSpeedAt(state.reactivity);
  function setReactivity(v) {
    const before = state.reactivity;
    state.reactivity = Math.round(Math.min(100, Math.max(0, Number(v))));
    if (state.reactivity > before) markDone('react');   // 말풍선 'Raise Growth Rate…' 를 해냄
    if (slime) slime.setReactivity(state.reactivity / 100);
    if (moss) moss.setReactivity(state.reactivity / 100);
    renderDash();
  }
  function setOxygen(v) {
    state.oxygen = Math.round(Math.min(100, Math.max(0, Number(v))));
    renderDash();
  }
  // 조도(lx) — 대시보드 Light. 0.1 ~ 100,000 lx, 유효숫자 세 자리
  function setLight(v) {
    state.light = Number(Math.min(1e5, Math.max(0.1, Number(v))).toPrecision(3));
    applySaturation();   // 명도·대비 (Color 의 채도와 같은 filter)
    renderDash();
  }
  /*
   * Prism — 색 2개
   *  배경: 배경 레이어 위에만 색 막 (#prismBg — 어두운 배경엔 screen 으로 물들이고, 밝은 배경엔 multiply)
   *  효과: 누끼 사진 위 효과 캔버스(미생물·기포·부식·사막·점균·이끼·성에 글자)의 밝기를 고른 색으로 (svg #fxTint) + 성에 색(ice.setTint)
   *  슬라이더 값이 PRISM_NONE 아래면 원래 색
   */
  const prismOn = (v) => v >= PRISM_NONE;
  const prismBlack = (v) => v >= PRISM_BLACK;   // 맨 오른쪽 칸 = 완전 검정
  const prismHue = (v) => Math.min(360, (v - PRISM_NONE) / (PRISM_BLACK - PRISM_NONE) * 360);
  const hueName = (h) => [[15, 'Red'], [45, 'Orange'], [70, 'Yellow'], [160, 'Green'], [200, 'Cyan'], [250, 'Blue'], [290, 'Violet'], [335, 'Magenta'], [361, 'Red']].find((x) => h < x[0])[1];
  const prismName = (v) => (!prismOn(v) ? 'Original' : prismBlack(v) ? 'Black' : hueName(prismHue(v)));
  const prismCss = (v, s, l) => (prismBlack(v) ? '#000' : `hsl(${prismHue(v).toFixed(1)} ${s}% ${l}%)`);
  const frostTint = () => (prismBlack(state.prismFx) ? [0.02, 0.02, 0.02] : prismOn(state.prismFx) ? hsl2rgb(prismHue(state.prismFx), 0.85, 0.62) : state.tint);   // 성에 색: Prism 효과색, 없으면 Color 지구본 색
  function setPrism(key, v) {
    state[key] = Math.round(Math.min(100, Math.max(0, Number(v) || 0)));
    applyPrism();
    renderDash();
  }
  function applyPrism() {
    const bg = $('prismBg');
    bg.dataset.black = String(prismBlack(state.prismBg));   // 검정: 배경을 완전히 검게 덮음 (css)
    if (prismOn(state.prismBg)) {
      const h = prismHue(state.prismBg).toFixed(1);
      bg.style.setProperty('--pb-dark', `hsl(${h} 70% 24%)`); bg.style.setProperty('--pb-light', `hsl(${h} 70% 78%)`);
      bg.hidden = false;
    } else bg.hidden = true;
    let f = '';
    if (prismBlack(state.prismFx)) {   // 검정: 효과가 모두 검은 실루엣으로 (투명도는 그대로)
      $('fxTintM').setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0');
      f = 'url(#fxTint)';
    } else if (prismOn(state.prismFx)) {   // 흰색 → 고른 색 (밝기는 유지, 원래 색 10% 남김)
      const c0 = hsl2rgb(prismHue(state.prismFx), 0.9, 0.6), mx = Math.max(...c0), c = c0.map((x) => x / mx), K = 0.9, Lw = [0.2126, 0.7152, 0.0722];
      const rows = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (K * c[i] * Lw[j] + (i === j ? 1 - K : 0)).toFixed(4)).concat(['0', '0']).join(' '));
      $('fxTintM').setAttribute('values', `${rows.join(' ')} 0 0 0 1 0`);
      f = 'url(#fxTint)';
    }
    const fxl = $('fxLayer');   // 효과 캔버스 묶음에 한 번만 (캔버스마다 걸면 매 프레임 7번 계산해 느려짐)
    if (fxl.style.filter !== f) fxl.style.filter = f;
    if (ice) ice.setTint(frostTint());
    for (const [k, sw, nm] of [['prismBg', 'prismBgSw', 'prismBgName'], ['prismFx', 'prismFxSw', 'prismFxName']]) {
      const on = prismOn(state[k]);
      $(sw).style.background = on ? prismCss(state[k], 85, 58) : '';
      $(sw).dataset.on = String(on);
      $(nm).textContent = prismName(state[k]);
    }
    $('prismHint').textContent = prismOn(state.prismBg) || prismOn(state.prismFx) ? 'refracted' : 'original';
    drawPrismArt();
  }
  // 프리즘 그림: 흰 빛이 삼각 프리즘을 지나 무지개 부채로 갈라지고, 고른 두 색의 빛줄기가 굵게
  function drawPrismArt() {
    const out = [81, 27], Y = (h) => 8 + h / 360 * 38;
    let s = '';
    for (let i = 0; i <= 12; i++) s += `<line x1="${out[0]}" y1="${out[1]}" x2="200" y2="${Y(i * 30).toFixed(1)}" stroke="hsl(${i * 30} 80% 60%)" stroke-opacity="0.22" stroke-width="0.8"/>`;
    s += `<line x1="0" y1="34" x2="59" y2="27" stroke="currentColor" stroke-opacity="0.85" stroke-width="1.6"/>`;
    s += `<line x1="59" y1="27" x2="${out[0]}" y2="${out[1]}" stroke="currentColor" stroke-opacity="0.35" stroke-width="1.4"/>`;
    for (const k of ['prismBg', 'prismFx']) {
      if (!prismOn(state[k])) continue;
      const h = prismHue(state[k]), y = Y(h).toFixed(1), col = prismBlack(state[k]) ? 'currentColor' : prismCss(state[k], 85, 60);
      s += `<line x1="${out[0]}" y1="${out[1]}" x2="196" y2="${y}" stroke="${col}" stroke-width="2.2" stroke-linecap="round"/>`;
      s += `<circle cx="196" cy="${y}" r="${k === 'prismBg' ? 3.2 : 2.4}" fill="${k === 'prismBg' ? 'none' : col}" stroke="${col}" stroke-width="1.3"/>`;
    }
    s += `<polygon points="70,6 48,48 92,48" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.75" stroke-width="1.2" stroke-linejoin="round"/>`;
    $('prismArt').innerHTML = s;
  }
  function renderHum() {
    const h = humT == null ? state.humidity : humT, deg = humToDeg(h);
    $('humValue').setAttribute('d', deg - DIAL.a0 > 0.5 ? dialArc(DIAL.a0, deg, DIAL.r) : '');
    const k = dialPt(deg, DIAL.r);
    $('humKnob').setAttribute('cx', k[0].toFixed(2)); $('humKnob').setAttribute('cy', k[1].toFixed(2));
    $('humVal').textContent = `${state.humidity}%`;
    const ctl = $('humCtl');
    ctl.setAttribute('aria-valuenow', state.humidity);
    ctl.setAttribute('aria-valuetext', `${state.humidity} percent relative humidity`);
  }
  function setupHumidity() {
    const ctl = $('humCtl');
    ctl.setAttribute('aria-valuemin', HUM[0]); ctl.setAttribute('aria-valuemax', HUM[1]);
    $('humTrack').setAttribute('d', dialArc(DIAL.a0, DIAL.a1, DIAL.r));
    let turn = null;
    const angleOf = (e) => { const r = ctl.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI; };
    ctl.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      capture(ctl, e.pointerId); ctl.focus({ preventScroll: true });
      turn = { id: e.pointerId, a: angleOf(e) }; humT = state.humidity;
      ctl.classList.add('turning');
    });
    ctl.addEventListener('pointermove', (e) => {
      if (!turn || e.pointerId !== turn.id) return;
      const a = angleOf(e);
      let d = a - turn.a; d = ((d + 540) % 360) - 180;
      turn.a = a;
      humT = Math.max(HUM[0], Math.min(HUM[1], humT + d / (DIAL.a1 - DIAL.a0) * (HUM[1] - HUM[0])));
      if (Math.round(humT) !== state.humidity) setHumidity(humT); else renderHum();
    });
    const end = (e) => { if (!turn || e.pointerId !== turn.id) return; turn = null; humT = null; ctl.classList.remove('turning'); renderHum(); };
    ctl.addEventListener('pointerup', end); ctl.addEventListener('pointercancel', end);
    ctl.addEventListener('wheel', (e) => { e.preventDefault(); setHumidity(state.humidity + (e.deltaY > 0 ? -1 : 1)); }, { passive: false });
    ctl.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
      if (step) { e.preventDefault(); e.stopPropagation(); setHumidity(state.humidity + step); }
      else if (e.key === 'Home') { e.preventDefault(); setHumidity(HUM[0]); }
      else if (e.key === 'End') { e.preventDefault(); setHumidity(HUM[1]); }
    });
    setHumidity(state.humidity);
  }

  // ---------------- 유리 대시보드 (오른쪽 아래) ----------------
  /*
   * 기온 · 습도 · 시간 배율 알약 슬라이더 + 성에 색 지구본 + 재생/10초 되감기·빨리감기 + 세로 결빙 타임라인
   *  알약: 누른 자리로 값이 이동하고 가로로 끌어 조절. 화살표(작게) · PageUp/PageDown(크게) · Home/End · 휠
   *  되감기는 결빙 진행만 되돌림(물질 생장은 그대로), 빨리감기는 10초를 실제로 계산
   */
  const pills = [];
  let dashT = 0;
  const fmtClock = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fmtDeg = (t) => `${t < 0 ? '−' : ''}${Math.abs(Math.round(t))}°`;
  /*
   * 슬라이더 모양 (data-look) — 흰 선으로 그린 SVG. 값 자리(f, 0~1)에 삼각 표식
   *  marker   : 둥근 선 + 값까지 밝아지는 채움 + 위쪽 작은 눈금(o.mark, 예: 0°)
   *  ruler    : 세로 눈금자 — 값 근처 눈금이 밝아지고 값 자리에 긴 막대 + 아래로 향한 삼각
   *  dots     : 점선 — 값 근처 점이 커지며 모여듦 (어안 렌즈처럼)
   *  daylight : 바닥 눈금 + 떠오르는 점선 곡선 위의 해 (로그 눈금 조도)
   */
  const PILL_PAD = 6;   // 눈금 양 끝 여백(px)
  const PRISM_NONE = 6;   // Prism 슬라이더에서 이 값 아래 = 원래 색
  const PRISM_BLACK = 94; // 이 값부터 = 완전 검정 (그 사이 = 무지개)
  const EARTH_AIR = 21;   // 지구 공기의 산소(%) — Oxygen 슬라이더에 'Earth air' 표시
  // 말풍선 — 문장(. ! ? … 로 끝남)을 n 개까지만
  const maxSentences = (s, n) => { const p = s.match(/[^.!?…]+(?:[.!?…]+["'’”)]*|$)\s*/g); return p && p.length > n ? p.slice(0, n).join('').trim() : s; };
  const tri = (x, y, s, dir) => `<polygon points="${x - s},${y} ${x + s},${y} ${x},${y + dir * s * 1.8}" fill="currentColor"/>`;   // dir −1 = 위로, +1 = 아래로 뾰족
  function drawLook(look, W, H, f, o, id) {
    const x0 = PILL_PAD, x1 = W - PILL_PAD, X = (t) => x0 + (x1 - x0) * t, xv = X(f);
    let s = '';
    if (look === 'ruler') {
      const yb = H - 2, ya = H - 22, N = 24;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1), g = Math.exp(-(((t - f) / 0.12) ** 2));
        s += `<line x1="${X(t)}" y1="${ya}" x2="${X(t)}" y2="${yb}" stroke="currentColor" stroke-opacity="${(0.32 + 0.5 * g).toFixed(3)}" stroke-width="1.6" stroke-linecap="round"/>`;
      }
      s += `<line x1="${xv}" y1="${H - 31}" x2="${xv}" y2="${yb}" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`;
      s += tri(xv, H - 42, 6, 1);
    } else if (look === 'dots') {
      const y = 11, N = 15;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1), d = t - f, g = Math.exp(-((d / 0.14) ** 2));
        s += `<circle cx="${X(t - d * 0.45 * g).toFixed(2)}" cy="${(y - 2 * g).toFixed(2)}" r="${(2 + 2.4 * g ** 1.5).toFixed(2)}" fill="currentColor" fill-opacity="${(0.55 + 0.45 * g).toFixed(3)}"/>`;
      }
      s += tri(xv, y + 19, 6, -1);
      if (o.mark != null) {   // 표시 눈금 + 작은 글자 (Oxygen: 21 % = Earth air)
        const mx = X((o.mark - o.min) / (o.max - o.min));
        s += `<line x1="${mx}" y1="${y + 6}" x2="${mx}" y2="${y + 12}" stroke="currentColor" stroke-opacity="0.6" stroke-width="1.2" stroke-linecap="round"/>`;
        if (o.markLabel) s += `<text x="${mx + 4}" y="${y + 16}" font-size="8.5" fill="currentColor" fill-opacity="0.6" font-family="Helvetica Neue, Segoe UI, Arial, sans-serif">${o.markLabel}</text>`;
      }
    } else if (look === 'daylight') {
      const ay = H - 18, top = 14, Y = (t) => ay - (ay - top) * Math.sin(Math.min(1, t / 0.82) * Math.PI / 2);
      let d = '';
      for (let i = 0; i <= 48; i++) d += `${i ? 'L' : 'M'}${X(i / 48).toFixed(1)},${Y(i / 48).toFixed(1)}`;
      s += `<path d="${d}" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.2" stroke-dasharray="3 4"/>`;
      s += `<line x1="${x0}" y1="${ay}" x2="${x1}" y2="${ay}" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.2"/>`;
      for (let i = 0; i <= 6; i++) s += `<line x1="${X(i / 6)}" y1="${ay - 6}" x2="${X(i / 6)}" y2="${ay}" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.2"/>`;
      // 해: 빛무리 + 흰 원 + 살 12개 — 밝을수록 빛무리가 짙고 살이 또렷
      const sy = Y(f), k = 0.3 + 0.7 * f;
      s += `<defs><radialGradient id="${id}-sun"><stop offset="0" stop-color="currentColor" stop-opacity="${(0.5 * k).toFixed(3)}"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>`;
      s += `<circle cx="${xv}" cy="${sy}" r="19" fill="url(#${id}-sun)"/><circle cx="${xv}" cy="${sy}" r="5" fill="currentColor"/>`;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6, c = Math.cos(a), n = Math.sin(a);
        s += `<line x1="${(xv + c * 7.5).toFixed(2)}" y1="${(sy + n * 7.5).toFixed(2)}" x2="${(xv + c * 12).toFixed(2)}" y2="${(sy + n * 12).toFixed(2)}" stroke="currentColor" stroke-opacity="${k.toFixed(3)}" stroke-width="1.2" stroke-linecap="round"/>`;
      }
      s += tri(xv, ay + 12, 6, -1);
    } else if (look === 'spectrum') {   // Prism: 왼쪽 흰 칸 = 원래 색, 가운데 = 무지개 (색상 0° → 360°), 오른쪽 끝 칸 = 검정
      const ty = Math.round(H / 2) - 2, xn = X(PRISM_NONE / 100), xb = X(PRISM_BLACK / 100);
      s += `<defs><linearGradient id="${id}-sp" gradientUnits="userSpaceOnUse" x1="${xn}" y1="0" x2="${xb}" y2="0">`;
      for (let i = 0; i <= 6; i++) s += `<stop offset="${(i / 6).toFixed(3)}" stop-color="hsl(${i * 60} 85% 58%)"/>`;
      s += '</linearGradient></defs>';
      s += `<line x1="${x0}" y1="${ty}" x2="${xn - 4}" y2="${ty}" stroke="currentColor" stroke-opacity="0.6" stroke-width="6" stroke-linecap="round"/>`;
      s += `<line x1="${xn + 4}" y1="${ty}" x2="${xb - 4}" y2="${ty}" stroke="url(#${id}-sp)" stroke-width="6" stroke-linecap="round"/>`;
      s += `<line x1="${xb + 4}" y1="${ty}" x2="${x1}" y2="${ty}" stroke="currentColor" stroke-opacity="0.55" stroke-width="8" stroke-linecap="round"/><line x1="${xb + 4}" y1="${ty}" x2="${x1}" y2="${ty}" stroke="#000" stroke-width="5" stroke-linecap="round"/>`;   // 검정 칸 (어두운 바탕에서도 보이게 테두리)
      s += `<circle cx="${xv}" cy="${ty}" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
      s += tri(xv, ty + 15, 5, -1);
    } else {   // marker
      const ty = Math.round(H / 2) + 3;
      s += `<line x1="${x0}" y1="${ty}" x2="${x1}" y2="${ty}" stroke="currentColor" stroke-opacity="0.16" stroke-width="5" stroke-linecap="round"/>`;
      if (xv > x0 + 0.5) {
        s += `<defs><linearGradient id="${id}-fill" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${xv}" y2="0"><stop offset="0" stop-color="currentColor" stop-opacity="0.3"/><stop offset="1" stop-color="currentColor" stop-opacity="0.62"/></linearGradient></defs>`;
        s += `<line x1="${x0}" y1="${ty}" x2="${xv}" y2="${ty}" stroke="url(#${id}-fill)" stroke-width="5" stroke-linecap="round"/>`;
      }
      if (o.mark != null) {
        const mx = X((o.mark - o.min) / (o.max - o.min));
        s += `<line x1="${mx}" y1="${ty - 12}" x2="${mx}" y2="${ty - 7}" stroke="currentColor" stroke-opacity="0.6" stroke-width="1.4" stroke-linecap="round"/>`;
      }
      s += tri(xv, ty + 4, 6, -1);
    }
    return s;
  }
  function makePill(el, o) {
    const look = el.dataset.look || 'marker';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    el.appendChild(svg);
    el.setAttribute('aria-valuemin', o.min); el.setAttribute('aria-valuemax', o.max);
    let drawn = '';
    const p = {
      render() {
        const v = o.get(), f = Math.min(1, Math.max(0, (v - o.min) / (o.max - o.min)));
        const W = el.clientWidth, H = el.clientHeight, key = `${W}x${H}:${f.toFixed(4)}`;
        if (W && key !== drawn) {   // 값이나 크기가 바뀔 때만 다시 그림
          drawn = key;
          svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
          svg.innerHTML = drawLook(look, W, H, f, o, el.id);
        }
        if (o.bigId) $(o.bigId).textContent = o.fmt(v);   // 카드의 큰 숫자
        el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', o.text ? o.text(v) : o.fmt(v));
        if (o.extra) o.extra(el, v);
      },
    };
    const snap = (v) => Math.min(o.max, Math.max(o.min, Math.round(v / o.step) * o.step));
    const fromX = (e) => {
      const r = el.getBoundingClientRect();
      const f = (e.clientX - r.left - PILL_PAD) / Math.max(1, r.width - 2 * PILL_PAD);
      return o.min + Math.min(1, Math.max(0, f)) * (o.max - o.min);
    };
    let pid = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); capture(el, e.pointerId); el.focus({ preventScroll: true });
      pid = e.pointerId; el.classList.add('drag');
      o.set(snap(fromX(e))); p.render();
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId !== pid) return; o.set(snap(fromX(e))); p.render(); });
    const end = (e) => { if (e.pointerId !== pid) return; pid = null; el.classList.remove('drag'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { e.preventDefault(); o.set(snap(o.get() + (e.deltaY > 0 ? -o.step : o.step))); p.render(); }, { passive: false });
    el.addEventListener('keydown', (e) => {
      const k = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: o.big, PageDown: -o.big }[e.key];
      let v = null;
      if (k) v = o.get() + k * o.step;
      else if (e.key === 'Home') v = o.min;
      else if (e.key === 'End') v = o.max;
      if (v == null) return;
      e.preventDefault(); e.stopPropagation();
      o.set(snap(v)); p.render();
    });
    pills.push(p);
    return p;
  }
  /*
   * 성에 색 지구본 (Color 카드) — 흰 선(경선·위선)과 흰 점으로 된 작은 지구본
   *  끌어서 돌림(가로 = 경도, 세로 = 위도), 화살표 키도 가능. 손을 떼면 경도로만 천천히 돔
   *  가운데(정면)에 온 위도로 성에 색을 정함: 적도 = 채도 높은 난색 → 고위도 = 옅은 한색 → 극지방 = 채도 없는 흰빛
   */
  /*
   * 위도 → 성에 색 (HSL): 극지방으로 갈수록 채도를 잃고(→ 흰빛 회색), 적도로 갈수록 채도가 높아짐
   *  색상(hue)은 적도의 따뜻한 주황 → 자홍·보라를 거쳐 → 고위도의 차가운 파랑으로 돌고 (중간에 회색으로 빠지지 않게),
   *  채도는 적도 1 → 극지방 0 으로 고르게 줄며, 밝기는 극지방으로 갈수록 높아짐
   */
  const hsl2rgb = (h, s, l) => {
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  };
  const tintAt = (lat) => {
    const t = Math.min(90, Math.abs(lat)) / 90;   // 0 = 적도, 1 = 극지방
    const hue = ((22 - 177 * Math.min(1, t / 0.7)) + 360) % 360;   // 22°(주황) → 205°(파랑)
    const sat = Math.pow(1 - t, 0.85);                             // 적도에서 가장 진하고 극지방에서 0
    const light = 0.56 + 0.38 * Math.pow(t, 1.6);                  // 극지방은 흰빛
    return hsl2rgb(hue, sat, light);
  };
  /*
   * 위도 → 화면 전체 채도 배율 — 모든 모드(성에·미생물·기포·부식·사막화·점균)와 배경에 함께 적용 (css filter: saturate)
   *  적도 ×1.8 → 기본 위도(55°) ×1.0 → 극지방 ×0 (흑백)
   */
  const satAt = (lat) => 1.8 * Math.pow(1 - Math.min(90, Math.abs(lat)) / 90, 0.62);
  /*
   * Light → 명도·대비: 가운데(100 lx)는 그대로, 올리면 밝고 대비가 강해지고, 내리면 어둡고 대비가 약해짐
   *  u = −1(0.1 lx) ~ 0(100 lx) ~ +1(100k lx)
   */
  const lightLook = (lx) => {
    const u = Math.max(-1, Math.min(1, (Math.log10(lx) - 2) / 3));
    return u >= 0 ? { b: 1 + 0.45 * u, c: 1 + 0.7 * u } : { b: 1 + 0.6 * u, c: 1 + 0.55 * u };
  };
  // 작품 레이어 전체에 거는 css filter — Color(채도) + Light(명도·대비). 바뀐 게 없으면 ''
  function viewFilter() {
    const s = state.saturation, L = lightLook(state.light), f = [];
    if (s != null && Math.abs(s - 1) >= 0.02) f.push(`saturate(${s.toFixed(3)})`);
    if (Math.abs(L.b - 1) >= 0.01) f.push(`brightness(${L.b.toFixed(3)})`);
    if (Math.abs(L.c - 1) >= 0.01) f.push(`contrast(${L.c.toFixed(3)})`);
    return f.join(' ');
  }
  function applySaturation() {
    const f = viewFilter();
    const L = $('layers');
    if (L.style.filter !== f) L.style.filter = f;
  }
  const regionAt = (lat) => { const a = Math.abs(lat); return a < 15 ? 'Equator' : a < 30 ? 'Tropic' : a < 45 ? 'Temperate' : a < 66 ? 'Subpolar' : 'Polar'; };
  const globe = { lat: 55, lon: 20, vlon: 0, drag: null, pts: null };
  function setGlobeLat(lat) {
    globe.lat = Math.max(-90, Math.min(90, lat));
    state.tint = tintAt(globe.lat);
    if (ice) ice.setTint(frostTint());
    state.saturation = satAt(globe.lat);   // 모든 모드의 채도
    applySaturation();
    const r = Math.round(globe.lat);
    const latTxt = r === 0 ? '0°' : `${Math.abs(r)}°${r > 0 ? 'N' : 'S'}`, satTxt = `sat ${Math.round(state.saturation * 100)}%`;
    $('globeLat').textContent = satTxt.replace('sat', 'saturation');   // Color = 채도
    $('globeLat').title = latTxt;
    $('colorName').textContent = regionAt(globe.lat);
    const cv = $('miniGlobe');
    cv.setAttribute('aria-valuenow', r); cv.setAttribute('aria-valuetext', `${latTxt}, ${regionAt(globe.lat)}, saturation ${Math.round(state.saturation * 100)} percent`);
  }
  function drawMiniGlobe() {
    const cv = $('miniGlobe'), dpr = Math.min(2, window.devicePixelRatio || 1), S = cv.clientWidth || 112;
    if (cv.width !== Math.round(S * dpr)) { cv.width = Math.round(S * dpr); cv.height = Math.round(S * dpr); }
    const g = cv.getContext('2d'), R = S * 0.34, c = S / 2, D = Math.PI / 180;
    const p0 = globe.lat * D, l0 = globe.lon * D, sp = Math.sin(p0), cp = Math.cos(p0);
    // 구 위 점(위도, 경도) → 화면 [x, y, 앞뒤 z]
    const proj = (phi, lam) => {
      const x = Math.cos(phi) * Math.sin(lam - l0), y = Math.sin(phi), z = Math.cos(phi) * Math.cos(lam - l0);
      return [c + R * x, c - R * (y * cp - z * sp), y * sp + z * cp];
    };
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    const C0 = '255,255,255';   // 어두운 패널 위라 늘 흰 선
    // 바깥 고리 — 아래쪽이 물방울처럼 출렁임 (시간에 따라 천천히)
    const Ro = S * 0.42, A = S * 0.065, tm = performance.now() / 1000;
    for (const [off, a] of [[0, 0.6], [-2.2, 0.28]]) {
      g.strokeStyle = `rgba(${C0},${a})`; g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= 160; i++) {
        const th = i / 160 * Math.PI * 2, b = Math.exp(-(((th - Math.PI / 2) / 0.6) ** 2));
        const r = Ro + off + A * b * (0.55 + 0.45 * Math.sin(th * 7 + tm * 1.6 + off));
        i ? g.lineTo(c + r * Math.cos(th), c + r * Math.sin(th)) : g.moveTo(c + r * Math.cos(th), c + r * Math.sin(th));
      }
      g.stroke();
    }
    g.strokeStyle = `rgba(${C0},0.5)`; g.lineWidth = 0.8;
    g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
    // 경선·위선 (뒷면은 옅게)
    const line = (fn) => {
      for (const front of [false, true]) {
        g.strokeStyle = front ? `rgba(${C0},0.42)` : `rgba(${C0},0.08)`;
        g.beginPath();
        let pen = false;
        for (let i = 0; i <= 72; i++) {
          const q = fn(i / 72), vis = (q[2] > 0) === front;
          if (vis) { pen ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); pen = true; } else pen = false;
        }
        g.stroke();
      }
    };
    for (let la = -75; la <= 75; la += 15) line((t) => proj(la * D, t * Math.PI * 2));
    for (let lo = 0; lo < 180; lo += 60) line((t) => proj((t - 0.5) * Math.PI * 2, lo * D));
    // 위도 표식: 바깥 고리 왼쪽에서 지금 위도 각도 자리에 흰 삼각 (가운데를 향함)
    const la = globe.lat * D, rm = Ro + 3, mx = c - rm * Math.cos(la), my = c - rm * Math.sin(la);
    const ux = (c - mx) / rm, uy = (c - my) / rm, s = 4.5;
    g.fillStyle = `rgb(${C0})`;
    g.beginPath();
    g.moveTo(mx + ux * s * 1.6, my + uy * s * 1.6);
    g.lineTo(mx - ux * s * 0.6 - uy * s, my - uy * s * 0.6 + ux * s);
    g.lineTo(mx - ux * s * 0.6 + uy * s, my - uy * s * 0.6 - ux * s);
    g.fill();
  }
  function setupMiniGlobe() {
    const cv = $('miniGlobe');
    cv.setAttribute('aria-valuemin', -90); cv.setAttribute('aria-valuemax', 90);
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); capture(cv, e.pointerId); cv.focus({ preventScroll: true });
      globe.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; globe.vlon = 0;
      cv.classList.add('drag');
    });
    cv.addEventListener('pointermove', (e) => {
      const d = globe.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y, now = performance.now();
      globe.lon -= dx * 1.4;
      globe.vlon = -dx * 1.4 / Math.max(0.008, (now - d.t) / 1000);
      setGlobeLat(globe.lat + dy * 1.4);   // 아래로 끌면 북쪽이 정면으로
      d.x = e.clientX; d.y = e.clientY; d.t = now;
    });
    const end = (e) => { if (!globe.drag || e.pointerId !== globe.drag.id) return; globe.drag = null; cv.classList.remove('drag'); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); setGlobeLat(globe.lat + (e.deltaY > 0 ? -3 : 3)); }, { passive: false });
    cv.addEventListener('keydown', (e) => {
      const k = { ArrowUp: [5, 0], ArrowDown: [-5, 0], ArrowLeft: [0, -10], ArrowRight: [0, 10], PageUp: [15, 0], PageDown: [-15, 0] }[e.key];
      if (!k) return;
      e.preventDefault(); e.stopPropagation();
      globe.lon += k[1]; setGlobeLat(globe.lat + k[0]);
    });
    setGlobeLat(globe.lat);
    let last = performance.now();
    const spin = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!globe.drag) {
        globe.vlon += (6 - globe.vlon) * Math.min(1, dt * 1.5);   // 던진 관성이 천천히 기본 회전(6°/초)으로
        globe.lon += globe.vlon * dt;
      }
      if (!$('hud').hidden) drawMiniGlobe();
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  }
  function setupDashboard() {
    const R = DT.FROST.controlRange;
    makePill($('pTemp'), {
      min: R[0], max: R[1], step: 1, big: 5, mark: 0,
      get: () => state.temperature, set: setTemperature, fmt: fmtDeg, bigId: 'tempBig',
      text: (v) => `${fmtTemp(v)}${v > DT.FROST.meltPoint ? ', above freezing' : ''}`,
      extra: (el, v) => { $('tempHint').textContent = v > DT.ICE.frostPoint ? 'above freezing' : 'freezing'; },
    });
    makePill($('pHum'), { min: HUM[0], max: HUM[1], step: 1, big: 5, get: () => state.humidity, set: setHumidity, fmt: (v) => `${v}%`, bigId: 'humBig', text: (v) => `${v} percent relative humidity` });
    makePill($('pAir'), {
      min: 0, max: 100, step: 1, big: 5, get: () => state.oxygen, set: setOxygen, fmt: (v) => `${v}%`, bigId: 'airBig',
      mark: EARTH_AIR, markLabel: 'Earth air',   // 21 % 자리에 작게 '보통 공기'
      text: (v) => `${v} percent oxygen${v === EARTH_AIR ? ', Earth air' : ''}`,
      extra: (el, v) => { $('airHint').textContent = v < EARTH_AIR - 3 ? 'thin air' : v > EARTH_AIR + 3 ? 'oxygen-rich' : 'Earth air'; },
    });
    makePill($('pReact'), {
      min: 0, max: 100, step: 1, big: 10, get: () => state.reactivity, set: setReactivity, fmt: (v) => `${v}%`, bigId: 'reactBig',
      text: (v) => `${v} percent reactivity`,
      extra: (el, v) => { const s = reactSpeedAt(v); $('reactHint').textContent = `growth ×${s < 1 ? s.toFixed(2) : s.toFixed(1)}`; },   // 모든 모드 진행 속도
    });
    // Light: 슬라이더 값은 log10(lx) — −1(0.1 lx) ~ 5(100k lx)
    const fmtLux = (v) => `${Number((10 ** v).toPrecision(3)).toLocaleString('en-US')} lx`;
    makePill($('pLight'), {
      min: -1, max: 5, step: 0.05, big: 10, get: () => Math.log10(state.light), set: (v) => setLight(10 ** v), fmt: fmtLux, bigId: 'lightBig',
      text: (v) => `${fmtLux(v)} light`,
      extra: (el, v) => { $('lightHint').textContent = `brightness ${Math.round(lightLook(10 ** v).b * 100)}%`; },   // Light = 명도
    });
    // Prism: 배경색 · 효과색 (0~100 — PRISM_NONE 아래 = 원래 색)
    const prismText = (v) => (prismBlack(v) ? 'black' : prismOn(v) ? `${hueName(prismHue(v))}, hue ${Math.round(prismHue(v))} degrees` : 'original color');
    makePill($('pPrismBg'), { min: 0, max: 100, step: 1, big: 5, get: () => state.prismBg, set: (v) => setPrism('prismBg', v), fmt: (v) => `${v}`, text: prismText });
    makePill($('pPrismFx'), { min: 0, max: 100, step: 1, big: 5, get: () => state.prismFx, set: (v) => setPrism('prismFx', v), fmt: (v) => `${v}`, text: prismText });
    applyPrism();
    setupMiniGlobe();
    setupModeGuide();   // 아래 상태바 모드 타일 → 가이드
    // Vitality 스위치: 끔 = 결빙 모드, 켬 = 생장 모드
    $('vitalSw').addEventListener('click', () => { setVitality(!state.vitality); });
    setVitality(state.vitality);
    // Lab mode 스위치 + Mix 카드의 5개 모드 버튼
    $('labSw').addEventListener('click', () => { setLab(!lab.on); });
    $('mixGrid').querySelectorAll('.mix-btn').forEach((b) => b.addEventListener('click', () => {
      const m = b.dataset.mode;
      if (mixTarget == null) lab[m] = !lab[m];
      else {
        // 오른쪽 클릭한 객체만: 처음 고칠 때 지금 보이는 조합(전체 Mix)을 복사해 시작
        if (!objMix.has(mixTarget)) { const o = {}; for (const k in LAB_MODES) o[k] = lab[k]; objMix.set(mixTarget, o); }
        const o = objMix.get(mixTarget); o[m] = !o[m];
      }
      renderLab();
    }));
    // Mix 머리줄: 객체를 고르는 중이면 'All' = 전체 Mix 로 돌아감 · 'Reset' = 이 객체를 다시 전체 Mix 를 따르게
    $('mixAll').addEventListener('click', () => { mixTarget = null; renderLab(); });
    $('mixReset').addEventListener('click', () => { if (mixTarget != null) objMix.delete(mixTarget); renderLab(); });
    // Layer 패널: 맨 뒤 · 뒤로 · 앞으로 · 맨 앞
    $('layerCard').querySelectorAll('.ly-btn').forEach((b) => b.addEventListener('click', () => shiftLayer(+b.dataset.d)));
    renderLayer();
    renderLab();
    // 재생 · 10초 되감기 · 10초 빨리감기
    $('resetBtn').addEventListener('click', () => { resetWithUndo(); renderDash(); });   // 오른쪽 위 Reset (Undo 로 되돌릴 수 있게 직전 화면을 보관)
    $('dashPlay').addEventListener('click', () => { setPaused(!state.paused); renderDash(); });
    $('backBtn').addEventListener('click', () => { if (ice) ice.rewind(10); renderDash(); });
    $('fwdBtn').addEventListener('click', () => {
      for (let t = 0; t < 10; t += 1 / 30) {
        frost.update(1 / 30);
        const env = modeEnv();
        if (ice) { ice.setTemperature(env.iceT); ice.update(1 / 30); }
        if (microbes) microbes.update(1 / 30, ...env.micro);
        if (bubbles) bubbles.update(1 / 30, ...env.bub);
        if (corrode) corrode.update(1 / 30, ...env.cor);
        if (desert) desert.update(1 / 30, ...env.des);
        if (slime) slime.update(1 / 30, ...env.slm);
        if (moss) moss.update(1 / 30, ...env.mos);
      }
      renderDash();
    });
    window.addEventListener('resize', () => { pills.forEach((p) => p.render()); drawPictograms(); });
    drawPictograms();
    renderDash();
  }
  /*
   * Vitality — 끄면 결빙 모드: −10 °C 이하에서 성에가 생기고, 습하면 녹아 물이 됨 (미생물은 사라짐)
   *            켜면 생장 모드: 얼지 않고, +10 °C 이상에서 미생물이 누끼 사진 위와 클릭한 자리에서 자람
   */
  function setVitality(on) {
    state.vitality = !!on;
    if (ice) ice.setFreezing(!state.vitality);
    const sw = $('vitalSw');
    sw.setAttribute('aria-checked', String(state.vitality));
    $('vitalBig').textContent = state.vitality ? 'On' : 'Off';
    $('vitalHint').textContent = state.vitality ? 'living' : 'non-living';   // Life: 생물 / 무생물 모드
    renderLab();
  }
  /*
   * Lab mode 켜기/끄기 — 켤 때는 지금 보이던 모드를 Mix 에 미리 켜 둠 (그대로 이어서 섞을 수 있게)
   */
  function setLab(on) {
    if (on && !lab.on) {
      const v = state.vitality;
      lab.frost = !v && state.temperature <= DT.ICE.frostPoint;
      lab.slime = sliming();
      lab.moss = mossing();
      lab.microbe = v && !lab.slime && !lab.moss;
      lab.corrode = corroding();
      lab.desert = deserting();
      lab.bubble = bubbling();
    }
    lab.on = !!on;
    renderLab();
  }
  // 매 프레임: 사라진 객체의 Mix 를 지우고, 사진마다 성에·배경 지움을 photoice 에 알림 (Lab mode 가 아니면 전체 설정)
  function syncObjMix() {
    const ids = ice ? ice.items.map((it) => it.id) : [], keys = new Set(ids);
    if (typing) for (const p of typing.photos) keys.add(p.key);
    let gone = false;
    for (const k of [...objMix.keys()]) if (!keys.has(k)) { objMix.delete(k); gone = true; }
    if (mixTarget != null && !keys.has(mixTarget)) { mixTarget = null; gone = true; }
    if (gone) renderLab();
    if (ice) for (const id of ids) {
      if (!lab.on) { ice.setItemMode(id, null); continue; }
      const frost = modeOn(id, 'frost');   // 전체 Mix 와 같은 규칙: 성에 = 얼음, 성에 없이 미생물·점균·이끼 = 누끼(배경 지움)
      ice.setItemMode(id, { frost, cut: !frost && (modeOn(id, 'microbe') || modeOn(id, 'slime') || modeOn(id, 'moss')) });
    }
  }
  function renderLab() {
    $('labSw').setAttribute('aria-checked', String(lab.on));
    $('stage').dataset.lab = lab.on ? 'on' : 'off';
    $('vitalCard').hidden = lab.on;   // Lab mode 에서는 Vitality 대신 Mix 카드
    $('mixCard').hidden = !lab.on;
    const picked = [], tg = lab.on ? mixTarget : null;
    $('mixGrid').querySelectorAll('.mix-btn').forEach((b) => { const m = b.dataset.mode, on = tg != null ? modeOn(tg, m) : lab[m]; b.setAttribute('aria-pressed', String(!!on)); if (on) picked.push(m); });
    const n = Object.keys(LAB_MODES).length;
    if (tg == null) $('mixHint').textContent = picked.length ? `${picked.length} of ${n} on · all` : 'pick modes · right-click an object';
    else {
      const name = typeof tg === 'number' ? `Photo ${trayOrder.indexOf(tg) + 1}` : typing && typing.current && typing.keyOf(typing.current) === tg ? `T-${String(typing.current.no).padStart(2, '0')}` : 'Text';
      $('mixHint').textContent = `${name} only${objMix.has(tg) ? '' : ' (follows all)'}`;
    }
    $('mixAll').hidden = tg == null;
    $('mixReset').hidden = tg == null || !objMix.has(tg);
    $('mixCard').dataset.scope = tg == null ? 'all' : 'one';
    updateBio();
    renderDash();
  }
  /*
   * 생장 배경: 평소 생장 모드(또는 Lab 에서 미생물만) = 흰색, 점균 조건(또는 Lab 에서 점균을 켬) = 파란색
   *  점균 조건은 기온·습도·산소로 바뀌므로 매 프레임 확인 (바뀔 때만 DOM 을 건드림)
   */
  function updateBio() {
    const picked = Object.keys(LAB_MODES).filter((m) => lab[m]).length;
    const blue = lab.on ? lab.slime : sliming(), soil = !blue && (lab.on ? lab.moss : mossing());   // 점균 = 파랑, 이끼 = 흙빛
    const on = blue || soil || (lab.on ? lab.microbe && picked === 1 : state.vitality);
    const bg = $('bioBg'), tone = blue ? 'slime' : soil ? 'moss' : 'white';
    if (bg.dataset.on !== String(on)) bg.dataset.on = String(on);
    if (bg.dataset.tone !== tone) bg.dataset.tone = tone;
    const v = on ? 'on' : 'off';
    if ($('stage').dataset.vital !== v) $('stage').dataset.vital = v;  }
  /*
   * 모드 픽토그램 — 수소 원자 오비탈 확률 밀도 |ψ|² 그림처럼 (가운데 검은 덩어리 → 파랑 → 초록 → 흰 바탕)
   *  성에 = 6갈래 눈꽃(cos²3θ) · 부식 = 대각선 네 잎 + 안쪽 클로버 (4,2,1) · 기포 = 동심원 고리 (4,0,0)
   *  미생물 = 둘로 갈라지는 세포 (4,1,1) · 사막화 = 위아래로 쌓인 모래 언덕 띠 (3,1,0)
   */
  const PICTO = {
    frost:   (r, t) => Math.pow(r, 6) * Math.exp(-r / 1.6) * Math.pow(Math.cos(3 * t), 2),
    corrode: (r, t) => Math.pow(r, 0.6) * Math.pow(r * r * (12 - r), 2) * Math.exp(-r / 2) * Math.pow(Math.sin(2 * t), 2),
    bubble:  (r) => Math.pow(r, 0.8) * Math.pow(27 - 18 * r + 2 * r * r, 2) * Math.exp(-2 * r / 3),
    microbe: (r, t) => Math.pow(r * (20 - 10 * r + r * r), 2) * Math.exp(-r / 2) * Math.pow(Math.cos(t), 2),
    desert:  (r, t) => Math.pow(r, 1.2) * Math.pow(r * (6 - r), 2) * Math.exp(-2 * r / 3) * Math.pow(Math.sin(t), 2),
    // 점균 = 가운데 덩어리에서 다섯 갈래로 뻗는 줄기 (cos⁸ 5θ 로 가늘게) + 바깥 고리
    slime:   (r, t) => Math.exp(-r / 2.2) * (0.25 + Math.pow(Math.cos(2.5 * t), 8) * Math.pow(r, 1.3)) + 0.18 * Math.exp(-Math.pow(r - 9, 2) / 2),
    // 이끼 = 가운데 둥근 방석 둘레에 작은 별 싹이 여덟 개 (cos² 4θ 꽃잎)
    moss:    (r, t) => Math.exp(-Math.pow(r - 5.5, 2) / 3) * (0.35 + Math.pow(Math.cos(4 * t), 2)) + 0.5 * Math.exp(-r * r / 6),
  };
  const PICTO_R = { frost: 30, corrode: 40, bubble: 30, microbe: 42, desert: 27, slime: 13, moss: 10 };   // 타일 가장자리까지의 반지름 (ρ)
  // 밀도 0~1 → 색 (흰 → 연두 → 청록 → 파랑 → 남색 → 검정) — 레퍼런스처럼 진한 곳은 넓게 검게
  const PICTO_STOPS = [[0, [255, 255, 255]], [0.1, [222, 242, 206]], [0.24, [120, 204, 130]], [0.36, [40, 170, 200]], [0.47, [20, 100, 215]], [0.55, [8, 30, 120]], [0.6, [0, 0, 0]], [1, [0, 0, 0]]];
  function pictoColor(v) {
    for (let i = 1; i < PICTO_STOPS.length; i++) {
      const [b, cb] = PICTO_STOPS[i];
      if (v <= b) { const [a, ca] = PICTO_STOPS[i - 1], t = (v - a) / (b - a); return ca.map((c, j) => c + (cb[j] - c) * t); }
    }
    return [0, 0, 0];
  }
  function drawPictograms() {
    document.querySelectorAll('.m-tile').forEach((tile) => {
      const cv = tile.querySelector('.m-pic'), f = PICTO[tile.dataset.mode], R = PICTO_R[tile.dataset.mode];
      const S = Math.round((cv.clientWidth || 56) * Math.min(2, window.devicePixelRatio || 1));
      if (cv.width === S && cv.dataset.done) return;
      cv.width = cv.height = S;
      const g = cv.getContext('2d'), img = g.createImageData(S, S), d = new Float32Array(S * S);
      let max = 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const px = (x + 0.5) / S * 2 - 1, py = (y + 0.5) / S * 2 - 1;
        const v = f(Math.hypot(px, py) * R, Math.atan2(py, px));
        d[y * S + x] = v; if (v > max) max = v;
      }
      // 흰색 모양 + 투명 배경 (밀도가 높을수록 불투명)
      for (let i = 0; i < d.length; i++) {
        const t = Math.min(1, Math.max(0, (Math.pow(d[i] / max, 0.5) - 0.12) / 0.88));
        img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = Math.round(255 * Math.pow(t, 1.3));
      }
      g.putImageData(img, 0, 0);
      cv.dataset.done = '1';
    });
  }
  /*
   * 모드 가이드 — 아래 상태바의 모드 타일을 누르면, 그 모드가 되려면 무엇을 바꿔야 하는지 말풍선이 알려 줌
   *  지금 값과 비교해 아직 안 맞는 조건만 한 문장으로 말함. 시킨 대로 다 맞추면(null) 가이드가 끝나고 말풍선이 사라짐
   */
  let guide = null;   // { fn, key }
  const sDeg = (t) => (t > 0 ? `+${Math.round(t)}°` : fmtDeg(t));
  /*
   * 모드마다 켜지는 조건 — 값은 모두 DT (각 모드 파일의 설정)에서 읽음. 말풍선 가이드 · 실험노트(조건 표 · 지금 할 일)가 함께 씀
   *  조건 하나 = { k: 'life' | 'T' | 'RH' | 'L'(빛 lx) | 'O2', op: '>=' | '<=' | '<' | 'on' | 'off', v, ok, say } — 경계: 이상(≥) 포함 · 미만(<) 제외
   */
  const fmtLx = (v) => `${Number(v).toLocaleString('en-US')} lx`;
  function needsOf(mode, T = state.temperature, RH = state.humidity, O2 = state.oxygen, V = state.vitality, L = state.light) {
    const on = { k: 'life', op: 'on', ok: V, say: 'turn Life on' }, off = { k: 'life', op: 'off', ok: !V, say: 'turn Life off' };
    const tMin = (v) => ({ k: 'T', op: '>=', v, ok: T >= v, say: `warm me to ${sDeg(v)} or more` }), tMax = (v) => ({ k: 'T', op: '<=', v, ok: T <= v, say: `cool me to ${sDeg(v)} or below` });
    const tBelow = (v) => ({ k: 'T', op: '<', v, ok: T < v, say: `keep me below ${sDeg(v)}` });
    const hMin = (v) => ({ k: 'RH', op: '>=', v, ok: RH >= v, say: `raise the humidity to ${v}%+` }), hMax = (v) => ({ k: 'RH', op: '<=', v, ok: RH <= v, say: `dry the air to ${v}% humidity or less` });
    const oMin = (v) => ({ k: 'O2', op: '>=', v, ok: O2 >= v, say: `raise the oxygen to ${v}%+` });
    const lMin = (v) => ({ k: 'L', op: '>=', v, ok: L >= v, say: `brighten the light to ${fmtLx(v)}+` }), lMax = (v) => ({ k: 'L', op: '<=', v, ok: L <= v, say: `dim the light to ${fmtLx(v)} or less` });
    const M = DT.MICROBE, B = DT.BUBBLE, C = DT.CORRODE, D = DT.DESERT, S = DT.SLIME, Mo = DT.MOSS;
    return ({
      frost: [off, tMax(DT.ICE.frostPoint)],
      microbe: [on, tMin(M.minTemp), tBelow(M.maxTemp), hMin(M.humFrom)],
      bubble: [off, tMin(B.tempFrom), hMin(B.humFrom), oMin(B.o2From)],
      corrode: [off, tMin(C.tempFrom), tBelow(C.tempTo), hMin(C.humFrom), oMin(C.o2From)],
      desert: [off, tMin(D.tempFrom), hMax(D.humTo)],
      slime: [on, tMin(S.tempFrom), tBelow(S.tempTo), hMin(S.humFrom), lMax(S.lightTo), oMin(S.o2From)],
      moss: [on, tMin(Mo.tempFrom), tBelow(Mo.tempTo), hMin(Mo.humFrom), lMin(Mo.lightFrom)],
    }[mode] || []).slice();
  }
  // 모드 순서 (실험노트 · 표) — 조건이 겹치지 않으므로 우선순위는 없음
  const MODE_ORDER = { on: ['moss', 'slime', 'microbe'], off: ['frost', 'corrode', 'bubble', 'desert'] };
  // 모드가 켜진 뒤 그 안에서 밀도 · 크기를 바꾸는 다이얼 (실험노트 Mode table) — [무엇, 다이얼, 방향]. 정점 값은 DT 에서
  const modeLook = () => ({
    frost: [['crystals', 'Humidity', '↑'], ['size', 'Temperature', `peak ${sDeg(DT.FROST.sizePeak)}`]],
    microbe: [['density', 'Temperature', '↑'], ['size', 'Oxygen', '↑'], ['speed', 'Humidity', '↑']],
    slime: [['density', 'Humidity', '↑'], ['thickness', 'Oxygen', '↑']],
    moss: [['density', 'Humidity', '↑'], ['size', 'Light', '↑']],
    corrode: [['density', 'Humidity', '↑'], ['rust size', 'Oxygen', '↑']],
    bubble: [['count', 'Oxygen', '↑'], ['size', 'Temperature', '↑'], ['stay', 'Humidity', '↑']],
    desert: [['speed', 'Temperature', '↑'], ['grain', 'Humidity', '↑'], ['falling sand', 'Oxygen', '↑']],
  });
  // 그 값에서 켜지는 모드 (겹치지 않으므로 많아야 하나), 없으면 null
  function modeAt(V, T, RH, O2, L = state.light) { return modesOn(V, T, RH, O2, L)[0] || null; }
  // 실험노트(js/notebook.js)에 넘길 것 — 지금 값 · 조건(needsOf) · 우선순위 · 그 값에서 켜지는 모드(modeAt)
  let notebook = null;
  function notebookCtx() {
    return {
      get T() { return state.temperature; }, get RH() { return state.humidity; }, get O2() { return state.oxygen; },
      get life() { return state.vitality; }, get lab() { return lab.on; }, get mix() { const o = {}; for (const m in LAB_MODES) o[m] = !!lab[m]; return o; },
      get L() { return state.light; }, get rate() { return state.reactivity; },
      get hasPhoto() { return !!(ice && ice.hasPhoto); },
      tempRange: DT.FROST.controlRange, lightRange: [0.1, 1e5], names: LAB_MODES, ORDER: MODE_ORDER, needsOf, modeAt, modesOn, fmtLx, look: modeLook,
      activeMode: () => (lab.on ? null : modeAt(state.vitality, state.temperature, state.humidity, state.oxygen, state.light)),
    };
  }
  // 그 모드의 조건 중 빛만 안 맞으면 그 한마디 ('dim the light to 100 lx or less'), 아니면 null — 말풍선
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function lightOnly(mode) { const miss = needsOf(mode).filter((c) => !c.ok); return miss.length === 1 && miss[0].k === 'L' ? miss[0].say : null; }
  function guideText(mode) {
    const name = LAB_MODES[mode];
    if (lab.on) return lab[mode] ? null : `Switch ${name} on in Mix.`;
    const need = needsOf(mode);
    if (!(ice && ice.hasPhoto) && mode !== 'microbe') need.push({ ok: false, say: 'give me a sample with +' });
    const miss = need.filter((c) => !c.ok).map((c) => c.say);
    if (!miss.length) return null;   // 시킨 대로 다 됨 → 가이드 끝
    const list = miss.length > 1 ? `${miss.slice(0, -1).join(', ')} and ${miss[miss.length - 1]}` : miss[0];
    return `For ${name.toLowerCase()}, ${list}.`;
  }
  // 가이드 띄우기 — fn 은 그릴 때마다 다시 불러 지금 값을 반영. 시간이 지나도 사라지지 않고, fn 이 null 을 낼 때(다 맞춤) 끝남
  function showGuide(mode) {
    guide = { fn: () => guideText(mode), key: mode };
    document.querySelectorAll('.m-tile').forEach((t) => { t.dataset.picked = String(t.dataset.mode === mode); });
    renderDash();
  }
  function endGuide() {
    guide = null;
    document.querySelectorAll('.m-tile').forEach((t) => { t.dataset.picked = 'false'; });
  }
  // 말풍선이 시킨 일 중 '조건'으로 알 수 없는 것(Space 로 찍기 · 커서로 쓸기 · Growth Rate 올리기)은 해냈을 때 여기 표시 → 그 말이 사라짐
  const dashDone = new Set();
  const markDone = (key) => { if (!dashDone.has(key)) { dashDone.add(key); renderDash(); } };
  function setupModeGuide() {
    document.querySelectorAll('.m-tile').forEach((t) => {
      t.setAttribute('role', 'button'); t.tabIndex = 0;
      t.setAttribute('aria-label', `${LAB_MODES[t.dataset.mode]} — how to get there`);
      t.addEventListener('click', () => showGuide(t.dataset.mode));
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); showGuide(t.dataset.mode); } });
    });
  }
  /*
   * 말풍선 — step by step: 시킬 말(ask)이 바뀔 때마다 새 단계 말풍선이 차례로 생김
   *  · 새 단계: 번호(01, 02 …)와 함께 아래에서 떠오르고, 글자가 하나씩 써짐 (같은 단계에서 숫자만 바뀌면 그대로 바꿔 씀)
   *  · 지난 단계: 남기지 않음 — 새 말풍선이 앞의 것을 바꿔 씀 (TALK.keep 을 올리면 위에 작게 ✓ 로 남길 수 있음)
   *  · 시킨 대로 다 하면: 지금 단계에 ✓ 가 붙고 TALK.doneHold 뒤 사라짐
   */
  const TALK = { keep: 0, cps: 55, doneHold: 1600 };   // keep 0 = 지난 단계 말풍선은 남기지 않음 (지금 말풍선 하나만)
  const talk = { cur: null, prev: [], no: 0, shown: 0, timer: 0, doneAt: 0 };
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function talkType() {
    clearInterval(talk.timer);
    const el = $('dashTitle');
    if (reduceMotion()) { talk.shown = talk.cur.text.length; el.textContent = talk.cur.text; return; }
    talk.timer = setInterval(() => {
      if (!talk.cur) { clearInterval(talk.timer); return; }
      talk.shown = Math.min(talk.cur.text.length, talk.shown + 2);
      el.textContent = talk.cur.text.slice(0, talk.shown);
      if (talk.shown >= talk.cur.text.length) clearInterval(talk.timer);
    }, 2000 / TALK.cps);
  }
  function talkPrev() {
    $('talkPrev').innerHTML = talk.prev.map((p) => `<li><b></b>${p.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</li>`).join('');
  }
  function talkArchive() {   // 지금 단계를 지난 단계로
    if (!talk.cur) return;
    talk.prev.push({ no: talk.no, text: talk.cur.text });
    talk.prev = TALK.keep > 0 ? talk.prev.slice(-TALK.keep) : [];   // slice(-0) 은 전부를 돌려주므로 0 은 따로
    talkPrev();
  }
  function talkStep(line, ask) {
    const el = $('talk');
    if (line) {
      talk.doneAt = 0; el.classList.remove('done');
      if (!talk.cur || talk.cur.ask !== ask) {   // 새 단계
        talkArchive();
        talk.cur = { ask, text: line }; talk.no++; talk.shown = 0;
        $('dashTitle').textContent = '';
        el.hidden = false;
        el.classList.remove('talk-new'); void el.offsetWidth; el.classList.add('talk-new');
        talkType();
      } else if (talk.cur.text !== line) {     // 같은 단계 — 숫자만 바뀜
        const typing = talk.shown < talk.cur.text.length;
        talk.cur.text = line;
        if (!typing) { talk.shown = line.length; $('dashTitle').textContent = line; }
      }
      el.hidden = false;
    } else if (talk.cur) {                      // 시킨 대로 해냄 → ✓ 잠깐 보이고 사라짐
      const now = performance.now();
      if (!talk.doneAt) { talk.doneAt = now; el.classList.add('done'); clearInterval(talk.timer); $('dashTitle').textContent = talk.cur.text; }
      else if (now - talk.doneAt > TALK.doneHold) { talkArchive(); talk.cur = null; el.hidden = true; el.classList.remove('done'); }
    } else el.hidden = true;
  }
  // 상태 문구 · 타임라인 · 재생 버튼 (값은 다이얼 외에 리셋·콘솔로도 바뀌므로 주기적으로 다시 그림)
  function renderDash() {
    if (!pills.length) return;
    pills.forEach((p) => p.render());
    const T = state.temperature, cold = !state.vitality && T <= DT.ICE.frostPoint;   // 생장 모드에서는 얼지 않음
    const clock = ice ? ice.clock : 0, end = ice ? ice.clockEnd : 1, k = Math.min(1, clock / end);
    // 상태 카드: 지금 상태 한 줄 (피사체 분리 중이면 그것을 먼저)
    const busy = $('spinner').dataset.on === 'true';
    const mixed = Object.keys(LAB_MODES).filter((m) => lab[m]).map((m) => LAB_MODES[m]);
    // 작품이 관람자에게 시키는 한 문장 (아래 가운데 말풍선) — 시킨 대로 하면 말풍선이 사라짐
    //  지금 시킬 일이 없으면(그냥 일어나는 중) null → 말풍선 숨김. 누끼 따는 중 안내는 오른쪽 위 wait-note 가 맡음
    const hasPhoto = !!(ice && ice.hasPhoto);
    if (guide && !guide.fn()) endGuide();   // 모드 가이드: 시킨 조건을 다 맞추면 끝
    const colonies = !!(microbes && microbes.colonies);
    const title = busy ? null
      : guide ? guide.fn()
      : state.paused || state.timeScale === 0 ? null
      : lab.on ? (mixed.length ? null : 'Pick a few modes in Mix and I’ll blend them.')
      : !hasPhoto && !state.vitality ? 'Give me a sample — press + at the top left to choose one.'
      : cold && k > 0.97 ? 'I’m frozen solid — press Space to keep this moment.'
      : cold || clock > 0.05 || corroding() ? null
      : deserting() ? 'I’m turning to sand — sweep me with your cursor.'
      : sliming() ? (hasPhoto ? 'Raise Growth Rate to make the slime mold hungrier.' : 'Give me a sample — slime mold will grow inside it.')
      : mossing() ? (hasPhoto ? null : 'Give me a sample and moss will cover it.')
      : lightOnly('slime') ? `${cap(lightOnly('slime'))} and slime mold will wake up.`   // 빛만 안 맞을 때 (어둡게)
      : lightOnly('moss') ? `${cap(lightOnly('moss'))} and moss will grow.`              // 빛만 안 맞을 때 (밝게)
      : !state.vitality && bubbles && bubbles.strength > 0 ? null
      : !state.vitality && T >= DT.BUBBLE.tempFrom && state.humidity >= DT.BUBBLE.humFrom && state.oxygen < DT.BUBBLE.o2From ? `Raise the air to ${DT.BUBBLE.o2From}% oxygen and I’ll start to bubble.`
      : !state.vitality && T >= DT.BUBBLE.tempFrom && state.oxygen >= DT.BUBBLE.o2From && state.humidity < DT.BUBBLE.humFrom && state.humidity > DT.DESERT.humTo ? `Raise the humidity to ${DT.BUBBLE.humFrom}% for bubbles.`
      : state.vitality && T >= DT.MICROBE.deathTemp ? (colonies ? 'Cool me down before the microbes die.' : 'It’s too hot for anything to live — cool me down.')
      : state.vitality && T >= DT.MICROBE.maxTemp ? `Cool me below +${DT.MICROBE.maxTemp}° so life can grow.`
      : state.vitality && T >= DT.MICROBE.minTemp && state.humidity < DT.MICROBE.humFrom ? `Raise the humidity to ${DT.MICROBE.humFrom}% and life will come.`
      : state.vitality ? (T >= DT.MICROBE.minTemp ? (colonies ? null : 'Click anywhere on me to plant microbes.') : colonies ? null : `Warm me to +${DT.MICROBE.minTemp}° so life can grow.`)
      : `Lower the temperature to ${fmtDeg(DT.ICE.frostPoint)} or below and I’ll start to freeze.`;
    // 조건으로 알 수 없는 일은 해낸 표시(dashDone)로 — 시킬 말이 바뀌면 표시를 지워, 나중에 다시 그 상황이 오면 또 말함
    const ask = guide ? 'g:' + guide.key : title && title.includes('Space') ? 'keep' : title && title.includes('sweep') ? 'sweep' : title && title.includes('Growth Rate') ? 'react' : title;
    if (ask !== renderDash.ask) { renderDash.ask = ask; dashDone.clear(); }
    const line = title && !dashDone.has(ask) ? maxSentences(title, 3) : null;   // 말풍선은 3문장까지
    talkStep(line, ask);
    // 요약 칩
    // 오른쪽 세로 상태바: 모드마다 값 + 지금 동작 중이면 빛남
    const corK = corrode ? corrode.visible : 0, desK = desert ? desert.visible : 0;
    // 모두 0 ~ 100% 로 (넘지 않게). 기포·미생물은 개수 대신 누끼 피사체를 덮은 비율 (사진이 없으면 개수를 기준 개수로 나눔)
    const pct = (x) => `${Math.round(Math.min(1, Math.max(0, x || 0)) * 100)}%`;
    const fillOf = (m, boost, cap) => {
      if (!m) return 0;
      const its = ice ? ice.items.filter((it) => !it.segmenting) : [];
      if (!its.length) return m.count / cap;
      return its.reduce((a, it) => a + Math.min(1, m.photoFill(it.id) * boost), 0) / its.length;
    };
    $('sumFrost').textContent = pct(k);
    $('sumCorrode').textContent = pct(corK);
    $('sumBubbles').textContent = pct(fillOf(bubbles, 1, 150));
    $('sumMicrobes').textContent = pct(fillOf(microbes, 1.25, 300));
    $('sumDesert').textContent = pct(desK);
    const slmK = slime ? slime.visible : 0;
    $('sumSlime').textContent = pct(slime ? slime.coverage : 0);
    $('sumMoss').textContent = pct(moss ? moss.coverage : 0);
    const live = {
      slime: slmK > 0.01,
      moss: !!moss && moss.visible > 0.01,
      frost: lab.on ? lab.frost : cold || k > 0.01,
      corrode: corK > 0.01,
      bubble: !!bubbles && bubbles.strength > 0,
      microbe: lab.on ? lab.microbe : vital() && !!microbes && microbes.count > 0,
      desert: desK > 0.01,
    };
    document.querySelectorAll('.m-tile').forEach((t) => { const on = String(!!live[t.dataset.mode]); if (t.dataset.on !== on) t.dataset.on = on; });
    const play = $('dashPlay'), playing = !state.paused;
    if (play.dataset.playing !== String(playing)) {
      play.dataset.playing = String(playing);
      play.title = playing ? 'Pause' : 'Play'; play.setAttribute('aria-label', play.title);
    }
  }

  // ---------------- 시드 / 재생 / 내보내기 ----------------
  function setSeed(s) {
    state.seed = s >>> 0 || 1;
    if ($('seedInput')) $('seedInput').value = state.seed;
    resetSimulation();
  }
  function setPaused(p) {
    state.paused = p;
    const b = $('playBtn');
    if (!b) return;
    b.textContent = p ? 'Play' : 'Pause';
    b.setAttribute('aria-pressed', p ? 'true' : 'false');
  }
  function exportInfo() {
    return { text: state.text, city: scene().name, seed: state.seed };
  }
  // 내보내기 (패널 버튼이 없어도 콘솔 __DIFFUSE__.savePNG() / saveSVG() 로 사용)
  async function savePNG() {
    // 패턴(WebGL) 위에 점·성에 레이어를 합성한 작품 이미지만 저장
    engine.render(renderParams());
    particles.draw();
    const out = document.createElement('canvas');
    out.width = engine.canvas.width; out.height = engine.canvas.height;
    const octx = out.getContext('2d');
    octx.drawImage(engine.canvas, 0, 0);
    octx.drawImage(particles.canvas, 0, 0, out.width, out.height);
    if (ice) { ice.render(); octx.drawImage(ice.canvas, 0, 0, out.width, out.height); }
    const blob = await DT.exportPNG(out);
    const name = DT.buildFilename('png', exportInfo());
    DT.downloadBlob(blob, name);
    return `Saved PNG: ${name} (${Math.round(blob.size / 1024)} KB)`;
  }
  function saveSVG() {
    const V = engine.readV();
    const svg = DT.exportSVG(V, field, renderParams(), sim.protectDepth(params.sim.erosion), {
      text: state.text, seed: state.seed, preset: DT.PRESETS[state.preset].label, city: scene().name, step: sim.stepCount,
    }, particles.toSVG());
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const name = DT.buildFilename('svg', exportInfo());
    DT.downloadBlob(blob, name);
    return `Saved SVG (pure vector, no texture): ${name} (${Math.round(blob.size / 1024)} KB)`;
  }
  function setupControls() {
    const si = $('seedInput');
    if (!si) return; // 조절 패널 없음
    si.value = state.seed;
    si.addEventListener('change', () => {
      const v = Math.floor(Number(si.value));
      if (!isFinite(v) || v < 1 || v > 4294967295) { si.value = state.seed; return; }
      setSeed(v);
    });
    $('randomSeed').addEventListener('click', () => setSeed(DT.randomSeed()));
    $('resetBtn').addEventListener('click', resetSimulation);
    $('playBtn').addEventListener('click', () => setPaused(!state.paused));

    const status = $('exportStatus');
    $('pngBtn').addEventListener('click', async () => {
      try { status.textContent = await savePNG(); } catch (e) { status.textContent = 'PNG export failed: ' + e.message; }
    });
    $('svgBtn').addEventListener('click', () => {
      const btn = $('svgBtn');
      btn.disabled = true;
      status.textContent = 'Generating SVG vector paths…';
      setTimeout(() => {
        try { status.textContent = saveSVG(); } catch (e) { status.textContent = 'SVG export failed: ' + e.message; }
        btn.disabled = false;
      }, 30);
    });
  }

  // ---------------- 메인 루프 ----------------
  let last = performance.now(), fps = 0, fpsFrames = 0, fpsT = 0, stepsLastSec = 0, stepsAcc = 0, barT = 0;
  function tick(now) {
    const dt = Math.max(0, (now - last) / 1000);
    last = now;
    if (!lost) {
      const fadeBefore = fade;
      fade += (fadeTarget - fade) * Math.min(1, dt * C.patternFade);
      if (Math.abs(fade - fadeTarget) < 0.002) fade = fadeTarget;
      if (!state.paused) particles.update(dt);
      // 점이 다 모이고 이전 패턴이 사라지면 → 같은 시드로 성장 시작
      if (phase === 'gathering' && particles.settled() && fade < 0.03 && !state.paused) {
        restartGrowth();
        phase = 'growing';
        fadeTarget = 1;
        if (scene().frost) {
          frost.start(field, state.seed);
          if (scene().dots && scene().dots.fadeOnFrost) particles.fadeDots(0, 4); // 이제 성에가 글자를 이룸 (점은 약 0.6초에 사라짐)
        }
      }
      const sdt = state.paused ? 0 : dt * state.timeScale;   // 대시보드 Time 배율이 적용된 시간
      // 모드 진행 시간 — Reactivity 를 올릴수록 모든 모드가 빨리 100% 로. 한 프레임 최대 0.1초 (프레임이 느려져도 계산이 쌓여 더 느려지지 않게)
      const mdt = Math.min(0.1, sdt * reactSpeed());
      frost.update(sdt);
      if (phase === 'empty' && fade < 0.03 && sim.field !== field) restartGrowth();
      const n = phase === 'growing' ? sim.frame(dt, params.sim, state.paused) : 0;
      stepsAcc += n;
      eroT += dt;
      if (phase === 'growing' && n > 0 && eroT > 0.4) {
        eroT = 0;
        particles.applyErosion(engine.readV(), field, sim.protectDepth(params.sim.erosion));
      }
      const breathing = stepBreath(state.paused ? 0 : dt);   // 입김 응결은 매 프레임 움직이므로 매 프레임 그림
      if (n > 0 || dirty || breathing || fade !== fadeBefore) { engine.render(renderParams()); dirty = false; }
      particles.draw();
      syncObjMix();
      renderLayer();
      const env = modeEnv();   // 평소엔 실제 환경, Lab mode 에선 Mix 에서 켠 모드
      // 사진 표면 결빙 → 그 위에 커서의 차가운 입자
      if (ice) {
        const idt = mdt;
        ice.setFreezing(env.freezing);
        ice.setEdgeFrost(env.edge);
        ice.setTemperature(env.iceT);
        ice.setBubbles(env.noWater);   // 기포·부식·사막화 모드: 물방울·물 없이
        ice.setAir(env.air);           // 성에 모드: 공기(산소)가 많을수록 커서 방향으로 바람
        // 확대는 마우스 휠 (카메라는 쓰지 않음) — 멈춤과 무관하게 부드럽게 따라감
        ice.stepView(dt);
        const istep = Math.max(1 / 20, idt / 2);   // 한 프레임에 최대 2번만 계산 (반응성이 높아도 렉이 덜 걸리게)
        for (let left = idt; left > 1e-6; left -= istep) ice.update(Math.min(left, istep));
        ice.render();   // 사진이 없어도 화면 가장자리 성에는 그려짐
        viewT += dt;
        if (viewT > 0.5) { viewT = 0; if (window.innerWidth !== viewW || window.innerHeight !== viewH) { viewW = window.innerWidth; viewH = window.innerHeight; updateView(); } }   // 창 크기 변화 확인 (가장자리 성에가 실제 화면 가장자리에 붙도록)
        updateSelection();   // 얼기 시작하면 선택 테두리를 숨김
      }
      // 미생물 (시간 배율 적용, 멈춤이면 그대로)
      if (microbes) {
        // 누끼가 끝난 사진마다 그 피사체 모양 위에 군집 (Vitality 켜짐 · +10 °C 이상일 때 새로 심음)
        const fw = $('frame').clientWidth, k = ice ? fw / ice.canvas.width : 1;
        const photos = ice ? ice.items.filter((it) => !it.segmenting).map((it) => ({ key: it.id, rect: it.rect.map((v) => v * k), mask: ice.maskOf(it.id), lum: ice.lumOf(it.id) })).filter((p) => p.mask) : [];
        microbes.syncPhotos(onlyFor('microbe', layered(photos)), env.microGrow);   // + 친 글자 (겹침 순서대로)
        // 생장 모드: 미생물이 피사체를 덮은 만큼 원래 사진이 사라짐 → 다 덮으면 사진은 미생물로만 이뤄짐
        const others = (p) => Math.max(corrode ? corrode.visible : 0, desert ? desert.visible : 0, bubbles ? bubbles.photoFill(p.key) : 0);
        // Lab mode: 그 사진에 켠 모드만 사진을 지움 (객체별 Mix)
        const labFade = (p) => { const on = (m) => modeOn(p.key, m); return Math.max(on('slime') && slime ? slime.visible : 0, on('moss') && moss ? Math.min(1, moss.photoFill(p.key) * 1.15) : 0, on('microbe') ? Math.min(1, microbes.photoFill(p.key) * 1.25) : 0, on('corrode') && corrode ? corrode.visible : 0, on('desert') && desert ? desert.visible : 0, on('bubble') && bubbles ? bubbles.photoFill(p.key) : 0); };
        if (ice) for (const p of photos) ice.setPhotoFade(p.key, lab.on ? labFade(p) : Math.max(slime ? slime.visible : 0, moss ? Math.min(1, moss.photoFill(p.key) * 1.15) : 0, state.vitality ? Math.min(1, microbes.photoFill(p.key) * 1.25) : others(p)));   // 점균 모드: 원래 사진은 보이지 않고 점균만   // Lab mode: 켠 모드들이 덮은 만큼 사진이 사라짐   // 기포 모드: 기포가 채운 만큼 사진이 사라지고 흰 기포만 남음 · 부식 모드: 부식 점으로 바뀜
        const vw = ice ? ice.view : { zoom: 1, off: [0, 0] };
        microbes.setView(vw.zoom, vw.off[0] * k, vw.off[1] * k);   // 같은 확대
        microbes.update(mdt, ...env.micro);
      }
      // 기포 (Vitality 끔 + 습도·산소 높음) — 누끼 피사체 자리에 모여 맺히고 터짐
      if (bubbles) {
        const fw = $('frame').clientWidth, k = ice ? fw / ice.canvas.width : 1;
        bubbles.syncPhotos(onlyFor('bubble', layered(ice ? ice.items.filter((it) => !it.segmenting).map((it) => ({ key: it.id, rect: it.rect.map((v) => v * k), mask: ice.maskOf(it.id), lum: ice.lumOf(it.id) })) : [])));   // + 친 글자
        const vw = ice ? ice.view : { zoom: 1, off: [0, 0] };
        bubbles.setView(vw.zoom, vw.off[0] * k, vw.off[1] * k);
        bubbles.update(mdt, ...env.bub);   // 부식 모드에서는 기포 없음 (Lab mode 에선 함께 켤 수 있음)
      }
      // 부식 (Vitality 끔 + 기온·습도·산소 모두 높음) — 누끼 피사체가 녹·녹청 두 색의 격자 점으로 (움직임 없음)
      if (corrode) {
        const fw = $('frame').clientWidth, k = ice ? fw / ice.canvas.width : 1;
        corrode.syncPhotos(onlyFor('corrode', layered(ice ? ice.items.filter((it) => !it.segmenting).map((it) => ({ key: it.id, rect: it.rect.map((v) => v * k), mask: ice.maskOf(it.id), photo: ice.photoOf(it.id) })) : [])));   // + 친 글자
        const vw = ice ? ice.view : { zoom: 1, off: [0, 0] };
        corrode.setView(vw.zoom, vw.off[0] * k, vw.off[1] * k);
        corrode.update(mdt, ...env.cor);
      }
      // 사막화 (Vitality 끔 + 건조 + 뜨거움 + 산소 낮음) — 사진이 몇 가지 색으로 줄고, 사진은 그대로 둔 채 아랫부분에서 모래가 흘러내림 (커서로 쓸어도) — 모래는 화면 아래에 쌓임
      if (desert) {
        const fw = $('frame').clientWidth, k = ice ? fw / ice.canvas.width : 1;
        desert.syncPhotos(onlyFor('desert', layered(ice ? ice.items.filter((it) => !it.segmenting).map((it) => ({ key: it.id, rect: it.rect.map((v) => v * k), mask: ice.maskOf(it.id), photo: ice.photoOf(it.id) })) : [])));   // + 친 글자
        if (typing) typing.setEnv(state.temperature, state.humidity);   // Breathe — 기온·습도에 따라 굵기
        if (typing) typing.update();   // 굵기(Breathe) · 캐럿 · 표본 라벨 위치 (확대·모드에 따라)
        const vw = ice ? ice.view : { zoom: 1, off: [0, 0] };
        desert.setView(vw.zoom, vw.off[0] * k, vw.off[1] * k);
        desert.update(mdt, ...env.des);
      }
      // 점균 (Vitality 켬 + 따뜻 + 습함 + 산소 적음) — 피사체·클릭한 자리에서 노란 원형질이 그물을 뻗으며 퍼짐
      if (slime) {
        const fw = $('frame').clientWidth, k = ice ? fw / ice.canvas.width : 1;
        slime.syncPhotos(onlyFor('slime', layered(ice ? ice.items.filter((it) => !it.segmenting).map((it) => ({ key: it.id, rect: it.rect.map((v) => v * k), mask: ice.maskOf(it.id), lum: ice.lumOf(it.id) })) : [])));   // + 친 글자 · lum = 사진 밝기 (명도 대비가 센 곳 위주로 자람)
        const vw = ice ? ice.view : { zoom: 1, off: [0, 0] };
        slime.setView(vw.zoom, vw.off[0] * k, vw.off[1] * k);
        slime.update(mdt, ...env.slm);
        updateBio();
      }
      // 이끼 (Vitality 켬 + 아주 습함 + 온화 + 공기 있음) — 피사체 위에 작은 별 모양 싹이 돋아 방석처럼 덮음
      if (moss) {
        const fw = $('frame').clientWidth, k = ice ? fw / ice.canvas.width : 1;
        moss.syncPhotos(onlyFor('moss', layered(ice ? ice.items.filter((it) => !it.segmenting).map((it) => ({ key: it.id, rect: it.rect.map((v) => v * k), mask: ice.maskOf(it.id), lum: ice.lumOf(it.id) })) : [])));
        const vw = ice ? ice.view : { zoom: 1, off: [0, 0] };
        moss.setView(vw.zoom, vw.off[0] * k, vw.off[1] * k);
        moss.update(mdt, ...env.mos);
      }
      // 성에 글자 (성에 모드 · 오른쪽 클릭으로 친 글자) — −10 °C 이하에서 빽빽하게 얼어붙음
      if (frostType) {
        const fw = $('frame').clientWidth, k = ice ? fw / ice.canvas.width : 1, vw = ice ? ice.view : { zoom: 1, off: [0, 0] };
        frostType.sync(onlyFor('frost', layered(ice ? ice.items.filter((it) => !it.segmenting).map((it) => ({ key: it.id, rect: it.rect.map((v) => v * k), mask: ice.maskOf(it.id) })) : []).filter((p) => typeof p.key === 'string')));   // 글자만 (사진보다 뒤인 글자는 겹친 자리가 잘림)
        frostType.setView(vw.zoom, vw.off[0] * k, vw.off[1] * k);
        frostType.update(mdt, frostTyping(), frostFrozen());
      }
      inkT += dt;
      if (inkT > 0.6) { inkT = 0; updateInk(); }   // 배경 밝기 → 대시보드 글자색 (픽셀을 읽지 않고 상태로 계산)
      if (rec) recordFrame(now);   // 영상 녹화 중: 작품 레이어만 합성해 한 프레임
    }
    fpsFrames++; fpsT += dt;
    if (fpsT >= 0.5) { fps = fpsFrames / fpsT; stepsLastSec = stepsAcc / fpsT; fpsFrames = 0; fpsT = 0; stepsAcc = 0; }
    barT += dt;
    if (barT > 0.25) { barT = 0; updateOverlay(); renderDash(); }   // 말풍선·아래 모드 % 도 0.25초마다 (모드가 자라는 동안 바뀌므로)
    dashT += dt;
    if (dashT > 0.1) { dashT = 0; renderDash(); }
    requestAnimationFrame(tick);
  }
  /*
   * 대시보드 글자색 자동 — 패널 뒤 배경의 밝기로 정함 (생장 배경 흰색 · 점균 파랑 · 이끼 검정 · 그 밖은 검정 + Prism 배경색)
   *  밝으면 검정 글자(.stage[data-ink="dark"]), 어두우면 흰 글자. 경계에서 깜박이지 않게 두 문턱값(히스테리시스)
   *  예전엔 화면 픽셀을 읽어(getImageData) 쟀는데, GPU 가 그리던 것을 다 끝낼 때까지 화면이 멈춰(0.6초마다 수십~수백 ms) 렉의 큰 원인이었음
   */
  let inkT = 0, ink = 'light', inkLum = 0;
  const INK_DARK = 0.56, INK_LIGHT = 0.44;
  function updateInk() {
    const white = $('bioBg').dataset.on === 'true', tone = $('bioBg').dataset.tone;
    let c = !white ? [0, 0, 0] : tone === 'slime' ? [0x3a, 0x6f, 0xc4].map((v) => v / 255) : tone === 'moss' ? [0, 0, 0] : [0.984, 0.984, 0.973];   // bioFill 과 같은 색
    if (prismOn(state.prismBg)) {   // Prism 배경색 — 화면과 같게: 밝은 배경엔 곱하기, 어두운 배경엔 스크린, 검정은 덮음
      const light = white && tone !== 'moss', p = hsl2rgb(prismHue(state.prismBg), 0.7, light ? 0.78 : 0.24);
      c = prismBlack(state.prismBg) ? [0, 0, 0] : light ? c.map((v, i) => v * p[i]) : c.map((v, i) => 1 - (1 - v) * (1 - p[i]));
    }
    const lum = inkLum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const next = ink === 'light' ? (lum > INK_DARK ? 'dark' : 'light') : (lum < INK_LIGHT ? 'light' : 'dark');
    if (next !== ink) { ink = next; $('stage').dataset.ink = ink; drawMiniGlobe(); }
  }
  function updateOverlay() {
    const ov = $('overlay');
    if (state.paused) { ov.hidden = false; ov.textContent = 'Paused'; }
    else ov.hidden = true;
  }
  // 화면에는 표시하지 않는 상태 정보 (콘솔 __DIFFUSE__.status 로 확인)
  function statusText() {
    const s = params.sim, wm = Math.hypot(s.windX, s.windY);
    return `${engine.label} · ${scene().name} · ${grid.w}×${grid.h} grid · step ${sim.stepCount} · ${Math.round(stepsLastSec)} steps/s · ${fps.toFixed(0)} fps · ` +
      `F ${s.F.toFixed(4)} K ${s.K.toFixed(4)} · Du ${s.Du.toFixed(2)} Dv ${s.Dv.toFixed(2)} · flow ${wm.toFixed(3)} cells/step`;
  }

  // 검증·디버그용 (브라우저 콘솔에서 사용 가능)
  window.__DIFFUSE__ = {
    state,
    // 검증용: 되돌리기 · 실험노트 · 다이얼
    undo, redo, resetWithUndo, histCommit,
    get history() { return { undo: hist.undo.map((e) => e.label + (e.heavy ? '*' : '')), redo: hist.redo.map((e) => e.label) }; },
    get notebook() { return notebook; },
    modeAt, needsOf, soloMode, setTemperature, setHumidity, setOxygen, setReactivity, setLight, setLab,
    get lab() { return lab; },
    get mods() { return { microbes, bubbles, corrode, desert, slime, moss, frostType }; },
    get photoIds() { return ice ? ice.items.map((it) => it.id) : []; },
    get iceItems() { return ice ? ice.items.map((it) => Object.assign({ id: it.id, rect: it.rect.map(Math.round) }, ice.itemState(it.id))) : []; },
    loadPhoto: (img, mask) => loadPhoto(img, mask),
    get params() { return params; },
    get stepCount() { return sim.stepCount; },
    get warmupLeft() { return sim.warmupLeft; },
    get engineKind() { return engine.kind; },
    get resetCount() { return resetCount; },
    get phase() { return phase; },
    get sceneId() { return scene().id; },
    get status() { return statusText(); },
    get transitioning() { return transitioning; },
    get fieldStyle() { return field ? scene().glyph : null; },
    get dotsScene() { return particles.sceneId; },
    get fade() { return fade; },
    get particleCount() { return particles.count; },
    get frost() { return { freeze: frost.freeze, photo: frost.hasPhoto, temperature: frost.temperature, applied: frost.appliedTemperature, levels: frost.levels, branches: frost.branchCount, nuclei: frost.nuclei, fronts: frost.fronts, thaw: frost.thaw, wind: frost.wind, view: frost.view, running: frost.running }; },
    setTemperature,
    setHumidity,
    setOxygen,
    get bubbles() { return bubbles; },
    lab,
    setLab,   // 검증용: 기포 (count, strength)
    // 표면 물리 상태: 이슬점·서리점·표면 온도와 각 전이 계수 (0~1)
    get env() { return ice ? ice.env : null; },
    // 사진마다 물질 상태 요약 (균사·가장자리·물방울·성에·균열·결정질 — js/growth.js stats)
    get growth() { return ice ? ice.growthStats() : []; },
    savePNG,
    saveSVG,
    savePhoto,
    snapshot: () => composeView(),   // References 패널 (js/refpanel.js) — 지금 화면 캡처
    resetAll,
    get microbes() { return microbes; },
    get slime() { return slime; },
    get moss() { return moss; },   // 검증용: 이끼 (count, coverage, visible)   // 검증용: 점균 (count, coverage, visible, spawn(x, y))
    setVitality,   // 검증용: 미생물 군집 (spawn(x, y), count, colonies)
    get ink() { return { ink, lum: +inkLum.toFixed(3) }; },   // 검증용: 배경 평균 밝기 → 대시보드 글자색
    updateInk,
    // 성장이 시작되고 빠른 피어남(warmup)까지 끝났는지
    get ready() { return phase === 'growing' && sim.warmupLeft === 0; },
    setPaused,
    reset: resetSimulation,
    runSteps(n) { sim.run(n, params.sim); engine.render(renderParams()); },
    get ice() { return ice ? ice.debug : null; },
    // 검증용: 사진 결빙을 sec 초만큼 진행 (커서 위치 [x, y] 를 주면 그 자리에 머문 것으로)
    stepIce(sec, cursor) { if (!ice) return; if (cursor) ice.pointer(cursor[0], cursor[1]); for (let t = 0; t < sec; t += 1 / 60) { ice.setTemperature(state.temperature); ice.update(1 / 60); } ice.render(); },
    growFrost(sec) { for (let t = 0; t < sec; t += 1 / 60) { frost.update(1 / 60); particles.update(1 / 60); } particles.draw(); },
    hashV() {
      const v = engine.readV();
      let h = 2166136261;
      for (let i = 0; i < v.length; i++) { h ^= Math.round(v[i] * 1e5); h = Math.imul(h, 16777619); }
      return (h >>> 0).toString(16);
    },
    glyphArea() { let a = 0; for (const m of field.mask) if (m >= 0.5) a++; return a; },
    stats() {
      const v = engine.readV(), f = field, P = sim.protectDepth(params.sim.erosion);
      const r = sim.radiusAt(sim.stepCount, params.sim);
      let inN = 0, inMax = 0, ringN = 0, ringOn = 0, farN = 0, farOn = 0;
      for (let i = 0; i < v.length; i++) {
        if (f.dIn[i] > P + 2) { inN++; if (v[i] > inMax) inMax = v[i]; }
        else if (f.mask[i] < 0.5 && f.dOut[i] > 1 && f.dOut[i] < 20 * f.scale) { ringN++; if (v[i] > 0.15) ringOn++; }
        else if (f.dOut[i] > r * 1.45 + 10) { farN++; if (v[i] > 0.15) farOn++; }
      }
      return { interiorCells: inN, interiorMaxV: inMax, ringCoverage: ringOn / Math.max(1, ringN), farCoverage: farOn / Math.max(1, farN), radius: r, protect: P };
    },
  };

  // ---------------- 시작 ----------------
  function start() {
    try {
      setupEngine();
    } catch (e) {
      showNotice('Graphics initialisation failed: ' + e.message);
      return;
    }
    particles.setScene(scene());
    state.preset = scene().preset;
    setupPresets();
    setupSliders();
    setupTemp();
    setupHumidity();
    setupScenes();
    setupSurfaceInput();
    setupSaveButton();
    setupRecorder();
    updateParams();
    setupControls();
    $('stage').dataset.mode = 'scene';
    setupDashboard();
    setupUndo();
    if (DT.createNotebook) notebook = DT.createNotebook(notebookCtx());   // 실험노트 (js/notebook.js)
    $('pTemp').focus({ preventScroll: true }); // 화살표 키로 바로 기온 조절
    restartGrowth(); // 시작 화면: 아무것도 없는 검은 화면 — 사진을 끌어다 놓으면 크게 뜸
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.DT = window.DT || {});
