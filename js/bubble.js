/*
 * 기포 — Air(산소) 패널 · 습도와 함께 (Vitality 끔일 때만)
 *
 *  조건: Vitality 끔 + 습도 ≥ humFrom + 산소 ≥ o2From → 기포 모드 (기온: 뜨거우면 작고 빽빽, 차가우면 크고 성김 — tempRange)
 *        두 값이 높을수록(…Full 까지) 더 빽빽하고, 산소가 많을수록 큰 기포가 많아짐
 *
 *  움직임 (참고 영상) — 떠오르지 않고 피사체 자리에 모여 끊임없이 맺히고 터짐
 *   · 누끼 피사체 안(윤곽 쪽 조금 더)에서 맺혀 빠르게 부풀고, 몇 초 머물며 살짝 흔들리다 터져 사라짐 → 그 자리에 새 기포
 *   · 작은 기포 = 굵고 밝은 고리, 큰 기포 = 가늘고 옅은 고리
 *   · 기포가 피사체를 채운 만큼 원래 사진이 사라짐 → 검은 화면에 흰 기포로만 이뤄진 형태 (photoFade)
 *   · 조건이 깨지면 남은 기포가 차례로 터지고 사진이 돌아옴
 *
 *  모양 (참고 포스터) — 고리끼리 겹치거나 닿는 자리가 거품 막처럼 오목한 삼각형(필렛)으로 채워짐
 *   기포마다 고리 둘레에 g = 1 − √(고리까지 거리 / k) 를 더해 쌓고(가산 블렌딩), 합이 1 을 넘는 곳을 칠함
 *   → 고리 하나는 선(굵기 w)만, 두 고리가 만나면 √d₁/√k₁ + √d₂/√k₂ < 1 인 오목한 별 모양이 이어 붙음
 *   k = fillet(필렛 크기), 클수록 만나는 자리가 두껍게 메워짐
 *
 *  좌표 = 프레임 CSS px (js/microbe.js 와 같음), 휠 확대는 setView 로 맞춤. WebGL2 가 없으면 고리만 그림(필렛 없음)
 *  수치는 DT.BUBBLE 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  DT.BUBBLE = {
    // 켜지는 조건 (Life 끔): 기온 tempFrom 이상 · 습도 humFrom 이상 · 산소 o2From 이상 (끓는 물처럼 뜨거울 때)
    tempFrom: 45,                  // 기온(°C) — 45° 이상
    humFrom: 70, humFull: 95,      // 습도(%) — 이 아래면 생기지 않음 / 여기서 최대
    o2From: 15, o2Full: 100,       // 산소(%) — 이 아래면 생기지 않음 / 여기서 최대 — 켜지는 구간 전체(15 → 100 %)가 밀도 최소 → 최대
    defaultOxygen: 21,             // 시작 산소(%) — 보통 공기
    // 개수
    density: 40,                    // 피사체 넓이 10,000 px² 당 기포 수 (가장 좋은 조건)
    o2Density: [1, 7],             // 산소 o2From → o2Full 일 때 기포 수 배율 (Air 를 높일수록 빽빽 — 곧게 비례해 조금만 올려도 늘어남)
    humDensity: [0.35, 2.6],       // (예전: 습도 → 기포 수 배율 — 지금은 습도가 머무는 시간 humLife 를 정함)
    humLife: [0.6, 1.8],           // 습도 humFrom → 100 % 일 때 기포가 머무는 시간 배율 (습할수록 잘 안 터짐)
    photoMax: 10000,               // 사진 하나의 최대 기포 수
    freeCount: 650,                // 사진이 없을 때 화면 가운데 원에 생기는 기포 수 (× 산소 배율)
    max: 18000,                    // 화면 전체 최대 (올라오는 탄산 기포 포함)
    // 어디에 모이나 — 누끼 윤곽과 명암 대비가 센 곳(사진의 형태가 보이는 곳)에 몰림
    baseWeight: 0.08,              // 피사체 안 아무 곳의 무게
    edgeWeight: 9.0,               // 누끼 윤곽의 무게
    edgeWidth: 1.2,                // 윤곽 띠 두께(밝기 격자 칸, 1칸 ≈ 사진의 1/160)
    rimShare: 0.3,                 // 누끼 윤곽선 바로 위에 맺히는 작은 기포 비율 → 외곽이 구슬 줄처럼 또렷
    rimR: [1.5, 3.2],              // 윤곽선 기포 반지름(px)
    rimLife: 1.8,                  // 윤곽선 기포는 이만큼 더 오래 머묾 (외곽이 끊기지 않게)
    // 친 글자 (js/typing.js) — 획이 가늘어 작고 촘촘하게, 윤곽을 더 많이
    fineSize: 0.38,                // 기포 크기 배율
    fineDensity: 4,                // 기포 수 배율
    fineRim: 0.5,                  // 윤곽선 기포 비율
    // 탄산 — 화면 전체에서 아래 → 위로 올라오는 작은 기포 (기포 모드일 때)
    fizzRate: 70,                  // 가장 좋은 조건에서 초당 생기는 수 (× o2Density)
    fizzStreams: 22,               // 같은 자리에서 줄지어 올라오는 줄기 수 (탄산처럼)
    fizzStreamShare: 0.55,         // 줄기에서 나오는 비율 (나머지는 아무 자리)
    fizzR: [0.9, 3.6],             // 처음 반지름(px) — 올라가며 커짐
    fizzGrowUp: 1.7,               // 꼭대기에 닿을 때 크기 배율
    fizzSpeed: [60, 170],          // 처음 오르는 속도(px/초) — 올라가며 빨라짐
    fizzAccel: 0.6,                // 초당 속도 증가 비율
    fizzWobble: 7,                 // 좌우 흔들림(px)
    // 커서 — 지나가면 주변 기포가 커서 쪽으로 모여듦 (모여 있는 동안은 잘 터지지 않음)
    cursorReach: 160,              // 끌어당기는 반경(px)
    cursorPull: 3.2,               // 끌려오는 빠르기(초당 거리 비율)
    cursorHold: 0.8,               // 커서 근처에서 수명이 덜 줄어드는 정도 (0~1)
    contrastWeight: 4.5,           // 명암 대비(밝기 변화)가 센 곳의 무게
    contrastRange: [0.03, 0.22],   // 이 밝기 변화부터 ~ 여기까지 무게가 커짐
    detailSize: 0.5,              // 윤곽·대비가 센 곳의 기포 크기 배율 (작을수록 더 잘게)
    edgeBias: 0.12,                // (밝기 정보가 없을 때만) 피사체 윤곽에서 맺히는 비율
    // 크기 · 수명
    r: [1.4, 18],                  // 반지름 범위(px) — 작은 것이 훨씬 많음
    sizeSkew: 2.6,                 // 클수록 작은 기포 비율이 높아짐
    o2Size: [0.6, 2.4],            // (예전: 산소 → 크기 — 지금은 쓰지 않음, 크기는 기온)
    o2SizeFollow: 2.5,             // 크기 배율이 다이얼을 따라가는 빠르기(초당)
    // 기온 → 크기 — 뜨거울수록 큰 기포 (끓을 때처럼). Bubble 이 켜지는 기온 구간(45° → 최고 기온) 전체
    tempRange: [45, 60],           // 기온(°C) 구간 [덜 뜨거움, 가장 뜨거움]
    tempSize: [0.45, 1.9],         // 크기 배율 [덜 뜨거움, 가장 뜨거움] — 예전 범위 그대로, 방향만 반대 · 이미 맺힌 기포도 함께 커짐
    tempDensity: [0.5, 2.4],       // (예전: 기온 → 개수 — 지금은 쓰지 않음, 개수는 산소)
    growTime: [0.2, 0.7],          // 맺혀서 다 부풀기까지(초)
    life: [1.2, 5],                // 머무는 시간(초)
    popTime: 0.22,                 // 터지며 사라지는 시간(초) — 살짝 커지며 옅어짐
    drift: 5,                      // 흔들림(px/초)
    dieRate: 1.4,                  // 조건이 깨지면 초당 터지는 비율
    // 모양
    lineW: [2.4, 0.9],             // 고리 굵기(px): [가장 작은 기포, 가장 큰 기포]
    bright: [1, 0.5],              // 밝기: [가장 작은 기포, 가장 큰 기포]
    fillet: 6,                     // 겹친 자리 필렛 크기(px) — 0 이면 필렛 없음
    filletOfR: 0.7,                // 작은 기포는 필렛도 작게 (반지름 × 이 값까지)
    color: [1, 1, 1],              // 기포 색 (흰색)
    photoFade: 1.0,                // 기포가 피사체를 채우면 원래 사진이 사라지는 정도 (0 = 사진 그대로)
    maxDpr: 1.5,
  };

  const TAU = Math.PI * 2;
  const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const lerp = (r, k) => r[0] + (r[1] - r[0]) * k;
  const rand = (r) => lerp(r, Math.random());

  // 조건 → 세기 0~1 (Vitality 켬이면 0)
  DT.bubbleStrength = function (vitality, humidity, oxygen, T) {
    const B = DT.BUBBLE;
    if (vitality || humidity < B.humFrom || oxygen < B.o2From || T == null || T < B.tempFrom) return 0;
    return (0.3 + 0.7 * sstep(B.humFrom, B.humFull, humidity)) * (0.3 + 0.7 * sstep(B.o2From, B.o2Full, oxygen));
  };

  // ---------- WebGL2 거품 렌더러 ----------
  const VS_RING = `#version 300 es
  layout(location=0) in vec2 aCorner;
  layout(location=1) in vec4 aC;    // x, y, r, 밝기
  layout(location=2) in vec2 aWK;   // 굵기, 필렛
  uniform vec2 uCanvas; uniform vec4 uView;   // 확대, 이동 x, y, dpr
  out vec2 vLocal; out vec4 vB;
  void main() {
    float ext = aC.z + aWK.y + aWK.x + 2.0;
    vLocal = aCorner * ext;
    vB = vec4(aC.z, aWK.x, aWK.y, aC.w);
    vec2 s = ((aC.xy + vLocal) * uView.x + uView.yz) * uView.w;
    gl_Position = vec4(s.x / uCanvas.x * 2.0 - 1.0, 1.0 - s.y / uCanvas.y * 2.0, 0.0, 1.0);
  }`;
  const FS_RING = `#version 300 es
  precision highp float;
  in vec2 vLocal; in vec4 vB; uniform float uScale; out vec4 o;
  void main() {
    float d = abs(length(vLocal) - vB.x);
    float e = max(0.0, d - 0.5 * vB.y);
    float g = max(0.0, 1.0 - sqrt(e / max(vB.z, 0.5)));
    if (g <= 0.0) discard;
    o = vec4(g, 0.0, 0.0, vB.w * min(1.0, g * 2.0)) * uScale;   // r = 모양(더함), a = 밝기(가장 밝은 기포를 따름)
  }`;
  const VS_FULL = `#version 300 es
  void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const FS_COMP = `#version 300 es
  precision highp float;
  uniform sampler2D uF; uniform float uInv; uniform vec3 uColor; out vec4 o;
  void main() {
    vec4 f = texelFetch(uF, ivec2(gl_FragCoord.xy), 0) * uInv;
    float fw = clamp(fwidth(f.r), 0.02, 0.6);
    float ink = smoothstep(0.97 - fw, 0.97, f.r);
    float b = clamp(f.a, 0.0, 1.0) * ink;
    o = vec4(uColor * b, b);
  }`;

  function createGL(canvas, B) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const half = !!gl.getExtension('EXT_color_buffer_float');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    const pRing = prog(VS_RING, FS_RING), pComp = prog(VS_FULL, FS_COMP);
    const U = (p, n) => gl.getUniformLocation(p, n);
    const uR = { canvas: U(pRing, 'uCanvas'), view: U(pRing, 'uView'), scale: U(pRing, 'uScale') };
    const uC = { f: U(pComp, 'uF'), inv: U(pComp, 'uInv'), color: U(pComp, 'uColor') };
    // 사각형(모서리) + 기포마다 6개 값 (인스턴스)
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const corner = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    const data = new Float32Array(B.max * 6);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 16); gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    const emptyVao = gl.createVertexArray();
    let tex = null, fbo = null, tw = 0, th = 0;
    // 쌓는 텍스처: 반정밀도 실수(되면) — 아니면 8비트에 1/4 로 줄여 담음
    const scale = half ? 1 : 0.25;
    function target(w, h) {
      if (tex && tw === w && th === h) return;
      if (tex) { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); }
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      tw = w; th = h;
    }
    return {
      render(list, n, view, dpr) {
        const w = canvas.width, h = canvas.height;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        if (!n) return;
        target(w, h);
        for (let i = 0; i < n; i++) data.set(list[i], i * 6);
        gl.bindBuffer(gl.ARRAY_BUFFER, inst); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 6);
        // 1) 고리 둘레의 g 를 쌓음 (가산)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.blendEquationSeparate(gl.FUNC_ADD, gl.MAX);
        gl.useProgram(pRing);
        gl.uniform2f(uR.canvas, w, h); gl.uniform4f(uR.view, view[0], view[1], view[2], dpr); gl.uniform1f(uR.scale, scale);
        gl.bindVertexArray(vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
        // 2) 합이 1 을 넘는 곳 = 선 + 필렛 → 흰색으로
        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(pComp);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(uC.f, 0); gl.uniform1f(uC.inv, 1 / scale); gl.uniform3f(uC.color, B.color[0], B.color[1], B.color[2]);
        gl.bindVertexArray(emptyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
      },
    };
  }

  DT.createBubbles = function (canvas, frame) {
    const B = DT.BUBBLE;
    let temperature = 15;
    let sizeK = 1;   // 산소에 따른 기포 크기 배율 (다이얼을 부드럽게 따라감)
    let lifeK = 1;   // 습도에 따른 머무는 시간 배율
    let Wc = 1, Hc = 1, dpr = 1, time = 0, strength = 0, oxygen = B.defaultOxygen;
    let vz = 1, vox = 0, voy = 0;
    let ptr = null;            // 커서 (확대 전 프레임 px) — null = 화면 밖
    const list = [];
    let regions = [];          // [{ key, rect, shape, area }] — 사진(누끼 피사체), 없으면 화면 가운데 원 하나
    const shapes = new Map();
    const counts = new Map();  // key → 지금 기포 수
    const carry = new Map();   // key → 맺힐 몫(소수)
    let gl = null, ctx2d = null;
    try { gl = createGL(canvas, B); } catch (e) { console.warn('[POLAR] bubble WebGL unavailable:', e); gl = null; }
    if (!gl) ctx2d = canvas.getContext('2d');

    function resize() {
      dpr = Math.min(B.maxDpr, window.devicePixelRatio || 1);
      Wc = frame.clientWidth || 1; Hc = frame.clientHeight || 1;
      const w = Math.round(Wc * dpr), h = Math.round(Hc * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    resize();

    /*
     * 무게 지도 — 사진 밝기 격자(lum, 긴 변 ≈160칸) 위에서 칸마다
     *   무게 = base + edgeWeight × 누끼 윤곽 + contrastWeight × 명암 대비(밝기 기울기)   (피사체 안만)
     *   detail(0~1) = 윤곽·대비 정도 → 기포 크기를 줄이는 데 씀
     */
    function buildMap(mask, lum) {
      if (!lum) return null;
      const w = lum.w, h = lum.h, L = lum.l;
      const mAt = (x, y) => {
        if (!mask) return 1;
        x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y));
        return mask.m[(((y + 0.5) / h * mask.h) | 0) * mask.w + (((x + 0.5) / w * mask.w) | 0)];
      };
      const lAt = (x, y) => L[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
      const ew = Math.max(1, Math.ceil(B.edgeWidth));
      const idx = [], wts = [], detail = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (mAt(x, y) < 0.5) continue;
        // 윤곽: 가까운 칸 중 피사체 밖이 있으면 (사진 테두리는 윤곽으로 보지 않음)
        let edge = 0;
        if (mask) for (let k = 1; k <= ew && !edge; k++) {
          for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && mAt(xx, yy) < 0.5) { edge = 1 - (k - 1) / ew; break; }
          }
        }
        // 명암 대비: 밝기 기울기 (소벨)
        const gx = (lAt(x + 1, y - 1) + 2 * lAt(x + 1, y) + lAt(x + 1, y + 1)) - (lAt(x - 1, y - 1) + 2 * lAt(x - 1, y) + lAt(x - 1, y + 1));
        const gy = (lAt(x - 1, y + 1) + 2 * lAt(x, y + 1) + lAt(x + 1, y + 1)) - (lAt(x - 1, y - 1) + 2 * lAt(x, y - 1) + lAt(x + 1, y - 1));
        const con = sstep(B.contrastRange[0], B.contrastRange[1], Math.hypot(gx, gy) / 4);
        const i = y * w + x;
        detail[i] = Math.min(1, edge + con);
        idx.push(i); wts.push(B.baseWeight + B.edgeWeight * edge + B.contrastWeight * con);
      }
      if (!idx.length) return null;
      const cdf = new Float32Array(wts.length);
      let t = 0; for (let i = 0; i < wts.length; i++) { t += wts[i]; cdf[i] = t; }
      return { w, h, idx: Int32Array.from(idx), cdf, total: t, detail };
    }

    const freeRegion = () => ({ key: '__free', free: true, cx: Wc / 2, cy: Hc / 2, rad: Math.min(Wc, Hc) * 0.28, area: Math.PI * (Math.min(Wc, Hc) * 0.28) ** 2 });
    const heat = () => sstep(B.tempRange[0], B.tempRange[1], temperature);   // 0 = 차가움, 1 = 뜨거움
    const o2Dens = () => lerp(B.o2Density, Math.min(1, Math.max(0, (oxygen - B.o2From) / (B.o2Full - B.o2From))));   // 산소 ↑ → 기포가 많아짐 (곧게 비례 — 다이얼을 조금만 돌려도 보임)
    const targetOf = (g) => Math.min(g.free ? B.freeCount * B.o2Density[1] : B.photoMax, (g.free ? B.freeCount : B.density * (g.fine ? B.fineDensity : 1) * g.area / 10000) * o2Dens()) * strength;

    function site(g) {
      if (g.free) { const a = Math.random() * TAU, r = g.rad * Math.sqrt(Math.random()); return [g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r]; }
      // 누끼 윤곽선 바로 위 (작은 기포가 줄지어 외곽을 그림)
      const E = g.shape && g.shape.edge;
      if (E && E.length && Math.random() < (g.fine ? B.fineRim : B.rimShare)) {
        const q = E[(Math.random() * E.length) | 0], j = 1 / Math.max(g.shape.w, g.shape.h);
        return [g.rect[0] + (q[0] + (Math.random() - 0.5) * j) * g.rect[2], g.rect[1] + (q[1] + (Math.random() - 0.5) * j) * g.rect[3], 'rim'];
      }
      if (g.map) {   // 윤곽·대비 무게 지도에서 뽑음
        const M = g.map, u = Math.random() * M.total;
        let lo = 0, hi = M.cdf.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (M.cdf[mid] < u) lo = mid + 1; else hi = mid; }
        const i = M.idx[lo], cx = i % M.w, cy = (i / M.w) | 0;
        return [g.rect[0] + (cx + Math.random()) / M.w * g.rect[2], g.rect[1] + (cy + Math.random()) / M.h * g.rect[3], M.detail[i]];
      }
      const S = g.shape;
      const pts = S && (Math.random() < B.edgeBias && S.edge.length ? S.edge : S.inner);
      if (pts && pts.length) {
        const q = pts[(Math.random() * pts.length) | 0];
        const j = 2 / Math.max(S.w, S.h);   // 칸 크기만큼 흩뜨림 (격자 무늬가 보이지 않게)
        return [g.rect[0] + (q[0] + (Math.random() - 0.5) * j) * g.rect[2], g.rect[1] + (q[1] + (Math.random() - 0.5) * j) * g.rect[3]];
      }
      return [g.rect[0] + Math.random() * g.rect[2], g.rect[1] + Math.random() * g.rect[3]];
    }
    function spawn(g) {
      if (list.length >= B.max) return;
      const [x, y, d] = site(g);
      const rim = d === 'rim';
      const s = rim ? Math.random() * 0.15 : Math.pow(Math.random(), B.sizeSkew);   // 0 = 가장 작음 (굵고 밝은 고리)
      const big = 1;   // 크기(기온)는 그릴 때 sizeK 로 — 이미 맺힌 기포도 따라 커짐
      const r = (rim ? rand(B.rimR) : Math.max(B.r[0] * 0.8, lerp(B.r, s) * big * (1 - (1 - B.detailSize) * (d || 0)))) * (g.fine && !rim ? B.fineSize : 1);   // 윤곽·대비가 센 곳일수록 작게 · 글자는 획에 맞게 작게
      const a = Math.random() * TAU, dr = rim ? 0.25 : 1;   // 윤곽선 기포는 거의 제자리
      list.push({
        key: g.key, x, y, r, s, grow: rand(B.growTime), life: rand(B.life) * (rim ? B.rimLife : 1) * lifeK, age: 0, pop: -1, dr,   // 습할수록 오래 머묾
        vx: Math.cos(a) * B.drift * Math.random() * dr, vy: Math.sin(a) * B.drift * Math.random() * dr, seed: Math.random() * TAU,
      });
      counts.set(g.key, (counts.get(g.key) || 0) + 1);
    }
    function kill(i) { const b = list[i]; counts.set(b.key, Math.max(0, (counts.get(b.key) || 1) - 1)); list.splice(i, 1); }

    const inst = [];
    // humidity · oxy · T = 켜질지 정하는 값, dT · dRH · dO2 = 다이얼 값 (크기 · 머무는 시간 · 개수 — 없으면 T · humidity · oxy). Lab mode 에서는 따로 옴
    function update(dt, vitality, humidity, oxy, T, dT, dRH, dO2) {
      oxygen = dO2 != null ? dO2 : oxy;                                                       // 산소 → 개수
      lifeK = lerp(B.humLife, sstep(B.humFrom, 100, dRH != null ? dRH : humidity));          // 습도 → 머무는 시간
      temperature = dT != null ? dT : T != null ? T : temperature;                             // 기온 → 크기
      strength = DT.bubbleStrength(vitality, humidity, oxy, T);
      const sizeT = lerp(B.tempSize, heat());   // 뜨거울수록 큰 기포
      if (dt > 0) {
        time += dt;
        sizeK += (sizeT - sizeK) * Math.min(1, dt * B.o2SizeFollow);
        // 맺힘: 구역마다 목표 수를 채우도록 (수명만큼 계속 갈아 끼움)
        const meanLife = (B.life[0] + B.life[1]) / 2 + (B.growTime[0] + B.growTime[1]) / 2;
        for (const g of regions) {
          const T = targetOf(g), n = counts.get(g.key) || 0;
          if (T <= 0) continue;
          let c = (carry.get(g.key) || 0) + (T / meanLife + Math.max(0, T - n) * 1.2) * dt;
          while (c >= 1 && (counts.get(g.key) || 0) < T * 1.1) { c -= 1; spawn(g); }
          carry.set(g.key, Math.min(c, 5));
        }
        // 일생: 부풂 → 머묾(흔들림) → 터짐
        for (let i = list.length - 1; i >= 0; i--) {
          const b = list[i];
          b.age += dt;
          b.x += (b.vx + Math.sin(time * 1.7 + b.seed) * B.drift * 0.6 * b.dr) * dt;
          b.y += (b.vy + Math.cos(time * 1.3 + b.seed) * B.drift * 0.6 * b.dr) * dt;
          if (ptr) {   // 커서 쪽으로 모임 — 커서 바로 곁(반지름만큼)에서는 멈춰 거품처럼 뭉침
            const dx = ptr[0] - b.x, dy = ptr[1] - b.y, d = Math.hypot(dx, dy), R = B.cursorReach / vz;
            if (d < R && d > 1e-3) {
              const f = (1 - d / R) * (1 - d / R) + 0.15 * (1 - d / R), gap = Math.max(0, d - b.r * 0.9);
              const k = Math.min(1, B.cursorPull * f * dt) * gap / d;
              b.x += dx * k; b.y += dy * k;
              b.age -= dt * B.cursorHold * Math.min(1, f * 3);
            }
          }
          const gone = !regions.some((g) => g.key === b.key);
          if (b.pop < 0 && (b.age >= b.grow + b.life || gone || (strength <= 0 && Math.random() < B.dieRate * dt))) b.pop = 0;
          if (b.pop >= 0) { b.pop += dt; if (b.pop >= B.popTime) kill(i); }
        }
        stepFizz(dt);
      }
      draw();
    }

    /*
     * 탄산: 화면 아래에서 맺혀 위로 올라옴 (화면 좌표 CSS px — 휠 확대와 무관하게 화면 전체)
     *  일부는 정해진 줄기 자리에서 줄지어 나옴, 올라가며 커지고 빨라지며 좌우로 살짝 흔들림, 위쪽에서 터짐
     */
    const fizz = [];
    let fizzAcc = 0, streams = [];
    function stepFizz(dt) {
      if (streams.length !== B.fizzStreams) streams = Array.from({ length: B.fizzStreams }, () => Math.random());
      const rate = strength > 0 ? B.fizzRate * strength * o2Dens() : 0;
      fizzAcc = Math.min(fizzAcc + rate * dt, 20);
      while (fizzAcc >= 1 && list.length + fizz.length < B.max) {
        fizzAcc -= 1;
        const st = Math.random() < B.fizzStreamShare;
        const x = (st ? streams[(Math.random() * streams.length) | 0] + (Math.random() - 0.5) * 0.004 : Math.random()) * Wc;
        const s = Math.pow(Math.random(), B.sizeSkew);
        fizz.push({ x0: x, x, y: Hc + 6, r0: lerp(B.fizzR, s), s, v: rand(B.fizzSpeed), age: 0, pop: -1, popY: Hc * (Math.random() < 0.7 ? Math.random() * 0.12 - 0.04 : Math.random() * 0.8), seed: Math.random() * TAU });
      }
      for (let i = fizz.length - 1; i >= 0; i--) {
        const f = fizz[i];
        f.age += dt;
        if (f.pop >= 0) { f.pop += dt; if (f.pop >= B.popTime) fizz.splice(i, 1); continue; }
        f.v *= 1 + B.fizzAccel * dt;
        f.y -= f.v * dt;
        if (ptr) {   // 올라오던 탄산도 커서 쪽으로 휘어 모임 (화면 좌표)
          const sx = ptr[0] * vz + vox, sy = ptr[1] * vz + voy, dx = sx - f.x, dy = sy - f.y, d = Math.hypot(dx, dy), R = B.cursorReach;
          if (d < R && d > 1e-3) {
            const g = (1 - d / R) * (1 - d / R) + 0.15 * (1 - d / R), k = Math.min(1, B.cursorPull * g * dt) * Math.max(0, d - f.r0 * 1.5) / d;
            f.x0 += dx * k; f.y += dy * k;
            f.v *= 1 - Math.min(0.9, g * 4 * dt);   // 커서 곁에서는 거의 멈춤
            if (f.y <= f.popY + 4) f.popY = -40;   // 커서에 붙은 동안은 꼭대기에서 터지지 않음 (떠나면 화면 위로 올라가 터짐)
          }
        }
        f.x = f.x0 + Math.sin(f.age * 3.1 + f.seed) * B.fizzWobble * Math.min(1, Math.max(0, f.age));
        if (f.y <= f.popY || (strength <= 0 && Math.random() < B.dieRate * dt)) f.pop = 0;
      }
    }

    function draw() {
      // 기포마다 [x, y, r, 밝기, 굵기, 필렛]
      inst.length = 0;
      for (const b of list) {
        const g = 1 - Math.pow(1 - Math.min(1, b.age / b.grow), 3);   // 부풂 (빠르게 시작해 천천히 멈춤)
        const p = b.pop < 0 ? 0 : b.pop / B.popTime;
        const r = b.r * (b.s < 0.15 && b.dr < 1 ? 1 : sizeK) * (0.15 + 0.85 * g) * (1 + 0.18 * p);   // 산소 크기 배율 (윤곽선 기포는 외곽이 또렷하도록 그대로)
        const a = lerp(B.bright, Math.pow(b.s, 0.7)) * Math.min(1, b.age * 6) * (1 - p);
        const w = lerp(B.lineW, Math.pow(b.s, 0.5)) * (1 - 0.5 * p);
        inst.push([b.x, b.y, r, a, w, Math.min(B.fillet, r * B.filletOfR)]);
      }
      // 탄산 (화면 좌표 → 확대 전 자리로 바꿔 같은 변환에 태움, 크기는 확대와 무관하게)
      for (const f of fizz) {
        const p = f.pop < 0 ? 0 : f.pop / B.popTime;
        const up = 1 - Math.min(1, Math.max(0, f.y / Hc));   // 0 = 바닥, 1 = 꼭대기
        const r = f.r0 * sizeK * (1 + (B.fizzGrowUp - 1) * up) * Math.min(1, f.age * 8) * (1 + 0.18 * p) / vz;
        const a = lerp(B.bright, Math.pow(f.s, 0.7)) * 0.85 * Math.min(1, f.age * 4) * (1 - p);
        const w = lerp(B.lineW, Math.pow(f.s, 0.5)) * (1 - 0.5 * p) / vz;
        inst.push([(f.x - vox) / vz, (f.y - voy) / vz, r, a, w, Math.min(B.fillet, r * vz * B.filletOfR) / vz]);
      }
      if (inst.length > B.max) inst.length = B.max;
      if (gl) { gl.render(inst, inst.length, [vz, vox, voy], dpr); return; }
      // 대체: 고리만
      const c = ctx2d;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
      c.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);
      const col = B.color.map((v) => Math.round(v * 255)).join(',');
      for (const q of inst) { c.beginPath(); c.arc(q[0], q[1], q[2], 0, TAU); c.lineWidth = q[4]; c.strokeStyle = `rgba(${col},${q[3]})`; c.stroke(); }
    }

    return {
      canvas,
      resize() { resize(); draw(); },
      setView(z, ox, oy) { vz = z; vox = ox; voy = oy; },
      // 커서 (확대 전 프레임 CSS px), x == null = 화면을 벗어남
      pointer(x, y) { ptr = x == null ? null : [x, y]; },
      /*
       * photos: [{ key, rect: 프레임 px [x, y, w, h], mask }] — 누끼가 끝난 사진. 기포는 피사체 안에 모임
       *  사진이 하나도 없으면 화면 가운데 원에 모임
       */
      syncPhotos(ps) {   // ps[i].lum = 사진 밝기 격자 { w, h, l } (photoice.lumOf)
        const out = [];
        for (const p of ps) {
          let s = shapes.get(p.key);
          if (!s || s.mask !== p.mask || s.lum !== p.lum) { s = { mask: p.mask, lum: p.lum, shape: p.mask && DT.maskShape ? DT.maskShape(p.mask) : null, map: buildMap(p.mask, p.lum) }; shapes.set(p.key, s); }
          const area = (s.shape ? s.shape.area : 1) * p.rect[2] * p.rect[3];
          out.push({ key: p.key, rect: p.rect, shape: s.shape, map: s.map, area, fine: !!p.fine });   // fine = 친 글자 (획이 가늘어 작고 촘촘한 기포)
        }
        for (const k of shapes.keys()) if (!ps.some((p) => p.key === k)) shapes.delete(k);
        regions = out.length ? out : [freeRegion()];
      },
      // 기포가 그 사진 피사체를 채운 정도 (0~1) × photoFade — 그만큼 원래 사진을 지움
      photoFill(key) {
        const g = regions.find((q) => q.key === key);
        if (!g) return 0;
        const full = Math.min(B.photoMax, B.density * g.area / 10000) * 0.5;
        return Math.min(1, (counts.get(key) || 0) / Math.max(1, full)) * B.photoFade;
      },
      update,
      clear() { list.length = 0; fizz.length = 0; counts.clear(); carry.clear(); draw(); },
      get count() { return list.length + fizz.length; },
      get strength() { return strength; },
    };
  };
})(window.DT = window.DT || {});
