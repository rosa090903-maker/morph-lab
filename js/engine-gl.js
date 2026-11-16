/*
 * GPU 엔진 (WebGL2 + EXT_color_buffer_float)
 * 두 개의 부동소수점 상태 텍스처(U=r, V=g)를 번갈아 렌더 타깃으로 쓰며 Gray–Scott 을 계산합니다.
 */
(function (DT) {
  'use strict';

  const VERT = `#version 300 es
  in vec2 aPos;
  void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // 한 단계 계산: 확산(9점 라플라시안) + 반응 + 이류 + 성장영역/보호 마스크 + 빗방울 씨앗
  const STEP_FRAG = `#version 300 es
  precision highp float;
  uniform sampler2D uState;
  uniform sampler2D uField;   // r=mask g=dOut b=dIn a=noise
  uniform ivec2 uRes;
  uniform float uF, uK, uDu, uDv, uDt;
  uniform vec2 uWind;         // 셀/단계, 화면 좌표 (y 아래)
  uniform float uRadius, uFeather, uProtect;
  uniform vec4 uDrops[4];     // xy=위치(셀) z=반경
  uniform int uDropCount;
  out vec4 outColor;
  vec2 S(ivec2 p){ return texelFetch(uState, clamp(p, ivec2(0), uRes - 1), 0).rg; }
  void main(){
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec2 c = S(p);
    vec2 e = S(p + ivec2(1,0)), w = S(p - ivec2(1,0));
    vec2 s = S(p + ivec2(0,1)), n = S(p - ivec2(0,1));
    vec2 ne = S(p + ivec2(1,-1)), nw = S(p + ivec2(-1,-1));
    vec2 se = S(p + ivec2(1,1)), sw = S(p + ivec2(-1,1));
    vec2 lap = 0.2 * (e + w + n + s) + 0.05 * (ne + nw + se + sw) - c;
    vec2 adv = -(uWind.x * (e - w) + uWind.y * (s - n)) * 0.5;
    float u = c.r, v = c.g;
    vec4 f = texelFetch(uField, p, 0);
    // 성장 영역 경계: 제거율 K 를 서서히 올려 패턴이 자연스럽게 소멸하도록 (딱딱한 경계선 방지)
    float front = uRadius * (0.62 + 0.76 * f.a);
    float allow = 1.0 - smoothstep(front - uFeather, front + uFeather, f.g);
    float kEff = uK + 0.07 * (1.0 - allow);
    float uvv = u * v * v;
    u += (uDu * lap.r - uvv + uF * (1.0 - u) + adv.r) * uDt;
    v += (uDv * lap.g + uvv - (uF + kEff) * v + adv.g) * uDt;

    // 글자 내부 보호 + 영역 밖 완전 정리
    float prot = smoothstep(uProtect, uProtect + 1.5, f.b);
    float kill = max(prot, 1.0 - smoothstep(0.0, 0.08, allow));
    u = mix(u, 1.0, kill * 0.3);
    v = mix(v, 0.0, kill * 0.3);

    for (int i = 0; i < 4; i++) {
      if (i >= uDropCount) break;
      float d = distance(vec2(p), uDrops[i].xy);
      if (d < uDrops[i].z && allow > 0.5 && f.r < 0.5) { v = max(v, 0.5); u = min(u, 0.5); }
    }
    outColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, 1.0);
  }`;

  /*
   * 입김 응결 (차가운 환경, scene.breath) — 저해상도 누적 버퍼 위의 이류·확산·감쇠
   *  r  = 떠 있는 입김(습기) 밀도: 커서 경로에 주입, 흐름에 실려 번지고, 온도에 따른 시간으로 사라짐
   *  g  = 유리에 맺힌 응결막: 추울수록 r 이 막으로 굳고(이류 없음) 아주 오래 남음
   *  ba = 커서가 남긴 흐름 속도(uv/초) — 빠르게 움직이면 입김이 길게 끌려감
   *  온도(app.js → breathStep): uDecay(입김 수명), uFilmRate/uFilmDecay(응결), uDiff(확산 속도), uCap(축적 상한)
   */
  const BREATH_STEP_FRAG = `#version 300 es
  precision highp float;
  uniform sampler2D uPrev;
  uniform vec2 uRes;
  uniform float uDt, uTime, uAspect;
  uniform vec2 uA, uB, uVel;       // 선분 (텍스처 uv, y 위쪽), 주입 속도
  uniform float uRad, uAmt;
  uniform float uDecay, uFilmRate, uFilmDecay, uDiff, uCap, uBloom;
  out vec4 outColor;
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p){ return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.13 + 7.1) + 0.2 * vnoise(p * 4.7 + 3.3); }
  vec2 curl(vec2 p){
    float e = 0.15;
    float n1 = fbm(p + vec2(0.0, e)), n2 = fbm(p - vec2(0.0, e)), n3 = fbm(p + vec2(e, 0.0)), n4 = fbm(p - vec2(e, 0.0));
    return vec2(n1 - n2, n4 - n3) / (2.0 * e);
  }
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes, px = 1.0 / uRes;
    vec4 c0 = texture(uPrev, uv);
    vec2 q = vec2(uv.x * uAspect, uv.y);
    vec2 flow = curl(q * 2.6 + vec2(uTime * 0.04, -uTime * 0.03)) * 0.018;
    vec2 back = uv - (c0.ba + flow * vec2(1.0 / uAspect, 1.0)) * uDt;
    vec4 c = texture(uPrev, back);
    vec4 nb = 0.25 * (texture(uPrev, back + vec2(px.x, 0.0)) + texture(uPrev, back - vec2(px.x, 0.0))
                    + texture(uPrev, back + vec2(0.0, px.y)) + texture(uPrev, back - vec2(0.0, px.y)));
    // 확산: 노이즈 지도에 따라 번지는 속도가 달라 외곽이 불규칙하게 퍼짐 (따뜻할수록 빠르게 퍼지며 옅어짐)
    float spread = (0.25 + 1.1 * fbm(q * 6.0 + 11.0 + uTime * 0.05)) * (1.0 - exp(-uDt * 6.0 * uDiff));
    c.r = mix(c.r, nb.r, clamp(spread, 0.0, 1.0));
    c.ba = mix(c.ba, nb.ba, clamp(spread, 0.0, 1.0));
    // 응결막: 제자리(이류 없음), 아주 약하게만 번짐
    vec4 nf = 0.25 * (texture(uPrev, uv + vec2(px.x, 0.0)) + texture(uPrev, uv - vec2(px.x, 0.0))
                    + texture(uPrev, uv + vec2(0.0, px.y)) + texture(uPrev, uv - vec2(0.0, px.y)));
    float film = mix(c0.g, nf.g, 1.0 - exp(-uDt * 0.4));
    // 입김 → 응결막 (추울수록), 감쇠 (온도별 수명)
    float cond = c.r * uFilmRate * uDt;
    film = min(1.2, film + cond);
    c.r = max(0.0, (c.r - cond) * exp(-uDt / uDecay) - uDt * 0.006);
    film = max(0.0, film * exp(-uDt / uFilmDecay) - uDt * 0.002);
    c.ba *= exp(-uDt / 0.75);
    /*
     * 헤일로 주입 (Chroma Halo 의 '커서 뒤에서 피어나는 잉크'):
     *  커서 경로 둘레에 큰 잉크 덩어리 + 커서 속도를 흐름에 실어 뒤로 끌리는 꼬리 + 중심에서 바깥으로 밀어내는 흐름(피어남)
     *  모양은 흐름이 만들고, 주입은 낮은 주파수로만 살짝 일그러뜨려 매끈한 덩어리를 유지
     */
    if (uAmt > 0.0) {
      vec2 a = vec2(uA.x * uAspect, uA.y), b = vec2(uB.x * uAspect, uB.y), ab = b - a;
      vec2 w = (vec2(fbm(q * 3.0 + uTime * 0.25), fbm(q * 3.0 + 17.0 - uTime * 0.25)) - 0.5) * uRad * 0.9;
      vec2 qw = q + w;
      float t = clamp(dot(qw - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
      vec2 rel = qw - (a + ab * t);
      float d = length(rel);
      float fall = exp(-d * d / (uRad * uRad));
      c.r += uAmt * fall * max(0.0, 1.0 - c.r / uCap);            // 지나갈수록 쌓이되 온도별 상한으로 부드럽게 포화
      c.ba = mix(c.ba, uVel, clamp(fall * 0.55, 0.0, 1.0));
      vec2 outv = rel / max(d, 1e-4);
      c.ba += vec2(outv.x / uAspect, outv.y) * fall * uBloom * min(1.0, uAmt * 6.0);
    }
    c.g = film;
    outColor = c;
  }`;

  const DISPLAY_FRAG = `#version 300 es
  precision highp float;
  uniform sampler2D uState, uField, uGlyph, uBreath;
  uniform vec2 uOut, uSim;
  uniform float uBreathMix, uTime;
  uniform float uWarmth, uSoft, uContrast, uProtect, uOpacity, uGlyphMix;
  uniform float uGrain, uFog, uEdge;   // 장면별 화면 질감 (scene.screen)
  uniform vec3 uBgTop, uBgBot, uDeep, uTeal, uLime, uWTeal, uWLime, uIvory, uFogCol;
  out vec4 outColor;
  vec4 bil(sampler2D t, vec2 p){
    p -= 0.5;
    ivec2 i = ivec2(floor(p)); vec2 f = fract(p);
    ivec2 mx = textureSize(t, 0) - 1;
    vec4 a = texelFetch(t, clamp(i, ivec2(0), mx), 0);
    vec4 b = texelFetch(t, clamp(i + ivec2(1,0), ivec2(0), mx), 0);
    vec4 c = texelFetch(t, clamp(i + ivec2(0,1), ivec2(0), mx), 0);
    vec4 d = texelFetch(t, clamp(i + ivec2(1,1), ivec2(0), mx), 0);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p){ return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.3 + 7.1) + 0.15 * vnoise(p * 5.1 + 3.7); }
  void main(){
    vec2 frag = vec2(gl_FragCoord.x, uOut.y - gl_FragCoord.y);
    vec2 uv = frag / uOut;
    vec2 sp = uv * uSim;
    float v = bil(uState, sp).g;
    float gx = bil(uState, sp + vec2(1.0, 0.0)).g - bil(uState, sp - vec2(1.0, 0.0)).g;
    float gy = bil(uState, sp + vec2(0.0, 1.0)).g - bil(uState, sp - vec2(0.0, 1.0)).g;
    vec4 fld = bil(uField, sp);

    vec3 teal = mix(uTeal, uWTeal, uWarmth);
    vec3 lime = mix(uLime, uWLime, uWarmth);
    float body = smoothstep(0.10 - uSoft * 0.05, 0.34 + uSoft * 0.10, v);
    vec3 pc = mix(uDeep, teal, smoothstep(0.08, 0.26, v));
    pc = mix(pc, lime, smoothstep(0.27, 0.48, v));
    float shade = clamp(0.5 + (gx + gy) * 2.2, 0.0, 1.0);
    vec3 pat = pc * (0.70 + 0.60 * shade) * uContrast;

    // 성운 같은 옅은 빛 번짐: 주변 V 평균
    float halo = 0.25 * (bil(uState, sp + vec2(4.0, 0.0)).g + bil(uState, sp - vec2(4.0, 0.0)).g
                       + bil(uState, sp + vec2(0.0, 4.0)).g + bil(uState, sp - vec2(0.0, 4.0)).g);

    vec3 col = mix(uBgTop, uBgBot, smoothstep(0.0, 1.0, uv.y));
    float vig = smoothstep(1.3, 0.2, length((uv - 0.5) * vec2(1.6, 1.0)));
    col *= mix(mix(0.6, 1.05, vig), 1.0, uEdge);   // 밝은 화면은 가장자리를 어둡게 하지 않음
    // 차가운 공기: 옅은 안개 얼룩 + 창 가장자리가 하얗게 서림 + 입자감
    if (uFog > 0.0 || uEdge > 0.0) {
      float fogN = fbm(uv * vec2(3.4, 2.1));
      col = mix(col, uFogCol, uFog * smoothstep(0.25, 0.85, fogN));
      vec2 e2 = min(uv, 1.0 - uv) * vec2(1.6, 1.0);
      float edgeD = min(e2.x, e2.y);
      float rim = (1.0 - smoothstep(0.0, 0.22, edgeD + (fogN - 0.5) * 0.08));
      col = mix(col, uFogCol, uEdge * rim * 0.85);
    }
    if (uGrain > 0.0) col += (hash(frag * 0.93 + 3.1) + hash(floor(frag * 0.5) + 11.7) - 1.0) * uGrain;
    col += teal * smoothstep(0.02, 0.3, halo) * 0.10 * uOpacity * uContrast;
    float bodyO = body * uOpacity;
    col = mix(col, pat, bodyO);
    float membrane = bodyO * (1.0 - body) * 4.0;
    col *= 1.0 - membrane * 0.22;

    float gA = texture(uGlyph, uv).a * uGlyphMix;
    float rimZone = 1.0 - smoothstep(uProtect, uProtect + 1.5, fld.b);
    float eaten = smoothstep(0.16, 0.34, v) * rimZone * uOpacity;
    float ink = gA * (1.0 - eaten);
    vec3 iv = uIvory * (0.965 + 0.05 * hash(floor(frag * 0.5)));
    col = mix(col, iv, ink);

    /*
     * 헤일로 (Chroma Halo 레퍼런스): 매끈한 잉크 덩어리를 두 겹의 색으로 —
     *  바깥 겹: 깊은 하늘색이 넓고 부드럽게 / 안쪽 겹: 명도 높은 하늘색(#D8F3FF)이 또렷하지만 깃털처럼 흐린 경계로 /
     *  가장 짙은 곳: 거의 흰 하늘빛. 덩어리 밀도의 기울기로 아주 약한 입체감(겹이 포개진 주름).
     *  입자·결 없이 매끈하게, 응결이 없는 곳은 완전한 검정.
     */
    if (uBreathMix > 0.0) {
      float ar = uOut.x / uOut.y;
      vec2 wp = uv * vec2(ar, 1.0);
      vec2 warp = (vec2(fbm(wp * 2.5 + uTime * 0.02), fbm(wp * 2.5 + 5.3 - uTime * 0.02)) - 0.5) * 0.012;
      vec2 bt = vec2(uv.x, 1.0 - uv.y) + warp;
      // 깃털 같은 외곽: 두 겹 고리(약 1.5 / 3.5 텍셀)로 부드럽게 모은 밀도
      vec2 bpx = 1.0 / vec2(textureSize(uBreath, 0));
      vec4 br = texture(uBreath, bt) * 0.2;
      for (int i = 0; i < 8; i++) {
        float an = float(i) * 0.7854;
        vec2 o = vec2(cos(an), sin(an)) * bpx;
        br += texture(uBreath, bt + o * 1.6) * 0.06 + texture(uBreath, bt + o * 3.6) * 0.04;
      }
      float d = br.r + br.g * 0.85;
      // 덩어리의 존재(알파)와 색은 따로: 옅은 곳(꼬리·사라지는 중·가장자리)은 깊은 하늘색, 짙은 곳(커서 둘레)은 #D8F3FF → 흰 하늘빛
      float a = smoothstep(0.0, 0.42, d);
      float lift = smoothstep(0.18, 0.95, d);
      vec3 deep = vec3(0.46, 0.78, 1.0);                     // 깊은 하늘색 (명도 높게)
      vec3 sky = vec3(0.847, 0.953, 1.0);                    // #D8F3FF
      vec3 pale = vec3(0.93, 0.98, 1.0);                     // 가장 짙은 곳
      vec3 tone = mix(deep, sky, lift);
      tone = mix(tone, pale, smoothstep(1.0, 1.7, d) * 0.6);
      vec3 hc = tone * a * mix(0.74, 1.0, lift);
      col = 1.0 - (1.0 - col) * (1.0 - clamp(hc * uBreathMix, 0.0, 1.0));
    }

    col += (hash(frag + 17.0) - 0.5) * 0.012;
    outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fsrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsrc));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Shader link failed: ' + gl.getProgramInfoLog(p));
    const loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      loc[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, loc };
  }

  DT.createGLEngine = function (canvas, grid, outScale) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser / graphics setup.');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Floating-point render targets (EXT_color_buffer_float) are not supported.');

    const stepP = program(gl, STEP_FRAG);
    const dispP = program(gl, DISPLAY_FRAG);
    const breathP = program(gl, BREATH_STEP_FRAG);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let fmt = { internal: gl.RGBA32F, type: gl.FLOAT, name: 'RGBA32F' };

    function makeTex(w, h, data, f) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, gl.RGBA, f.type, data);
      return t;
    }
    function makeFbo(tex) {
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return ok ? fb : null;
    }

    // 렌더 타깃 지원 확인 (32F → 16F 순서)
    {
      const t = makeTex(4, 4, null, fmt);
      let fb = makeFbo(t);
      if (!fb) {
        fmt = { internal: gl.RGBA16F, type: gl.FLOAT, name: 'RGBA16F' };
        const t2 = makeTex(4, 4, null, fmt);
        fb = makeFbo(t2);
        if (!fb) throw new Error('Could not create a floating-point framebuffer.');
      }
    }

    const st = { w: 0, h: 0, tex: [null, null], fbo: [null, null], cur: 0, field: null, glyph: null };
    const dropArr = new Float32Array(16);
    // 입김 응결 필드 (출력의 1/4 해상도, 선형 보간되는 RGBA16F 두 장)
    const br = { w: 0, h: 0, tex: [null, null], fbo: [null, null], cur: 0, time: 0 };
    const t0 = performance.now();
    function ensureBreath() {
      const w = Math.max(16, Math.round(canvas.width / 4)), h = Math.max(16, Math.round(canvas.height / 4));
      if (w === br.w && h === br.h) return;
      br.w = w; br.h = h;
      [0, 1].forEach((k) => {
        if (br.tex[k]) gl.deleteTexture(br.tex[k]);
        if (br.fbo[k]) gl.deleteFramebuffer(br.fbo[k]);
        br.tex[k] = makeTex(w, h, null, { internal: gl.RGBA16F, type: gl.HALF_FLOAT });
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        br.fbo[k] = makeFbo(br.tex[k]);
      });
      br.cur = 0;
    }

    function setUniformsStep(u) {
      const L = stepP.loc;
      gl.uniform1i(L.uState, 0); gl.uniform1i(L.uField, 1);
      gl.uniform2i(L.uRes, st.w, st.h);
      gl.uniform1f(L.uF, u.F); gl.uniform1f(L.uK, u.K);
      gl.uniform1f(L.uDu, u.Du); gl.uniform1f(L.uDv, u.Dv); gl.uniform1f(L.uDt, u.dt);
      gl.uniform2f(L.uWind, u.windX, u.windY);
      gl.uniform1f(L.uRadius, u.radius); gl.uniform1f(L.uFeather, u.feather); gl.uniform1f(L.uProtect, u.protect);
    }

    const engine = {
      kind: 'gpu',
      label: 'GPU · WebGL2 ' + fmt.name,
      canvas,
      init(field, state) {
        st.w = field.w; st.h = field.h;
        canvas.width = field.w * outScale; canvas.height = field.h * outScale;
        const N = st.w * st.h;
        const s = new Float32Array(N * 4), f = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
          s[i * 4] = state.U[i]; s[i * 4 + 1] = state.V[i]; s[i * 4 + 3] = 1;
          f[i * 4] = field.mask[i]; f[i * 4 + 1] = field.dOut[i]; f[i * 4 + 2] = field.dIn[i]; f[i * 4 + 3] = field.noise[i];
        }
        [0, 1].forEach((k) => {
          if (st.tex[k]) gl.deleteTexture(st.tex[k]);
          if (st.fbo[k]) gl.deleteFramebuffer(st.fbo[k]);
          st.tex[k] = makeTex(st.w, st.h, s, fmt);
          st.fbo[k] = makeFbo(st.tex[k]);
        });
        if (st.field) gl.deleteTexture(st.field);
        st.field = makeTex(st.w, st.h, f, { internal: gl.RGBA32F, type: gl.FLOAT });
        if (st.glyph) gl.deleteTexture(st.glyph);
        st.glyph = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, st.glyph);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, field.glyphHi);
        st.cur = 0;
      },
      // n 단계를 같은 파라미터로 계산. drops 는 첫 단계에만 적용
      step(u, n, dropsAt) {
        gl.useProgram(stepP.p);
        gl.bindVertexArray(vao);
        gl.viewport(0, 0, st.w, st.h);
        setUniformsStep(u);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, st.field);
        for (let k = 0; k < n; k++) {
          const drops = dropsAt ? dropsAt(k) : null;
          const dc = drops ? Math.min(4, drops.length) : 0;
          if (dc) {
            dropArr.fill(0);
            for (let i = 0; i < dc; i++) { dropArr[i * 4] = drops[i][0] + 0.5; dropArr[i * 4 + 1] = drops[i][1] + 0.5; dropArr[i * 4 + 2] = drops[i][2]; }
            gl.uniform4fv(stepP.loc.uDrops, dropArr);
          }
          gl.uniform1i(stepP.loc.uDropCount, dc);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, st.tex[st.cur]);
          gl.bindFramebuffer(gl.FRAMEBUFFER, st.fbo[1 - st.cur]);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          st.cur = 1 - st.cur;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      },
      render(r) {
        const P = DT.PALETTE, L = dispP.loc;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(dispP.p);
        gl.bindVertexArray(vao);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, st.tex[st.cur]);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, st.field);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, st.glyph);
        gl.uniform1i(L.uState, 0); gl.uniform1i(L.uField, 1); gl.uniform1i(L.uGlyph, 2);
        gl.uniform2f(L.uOut, canvas.width, canvas.height);
        gl.uniform2f(L.uSim, st.w, st.h);
        gl.uniform1f(L.uWarmth, r.warmth); gl.uniform1f(L.uSoft, r.softness);
        gl.uniform1f(L.uContrast, r.contrast); gl.uniform1f(L.uProtect, r.protect);
        gl.uniform1f(L.uOpacity, r.opacity == null ? 1 : r.opacity);
        gl.uniform1f(L.uGlyphMix, r.glyphMix == null ? 0 : r.glyphMix);
        gl.uniform3fv(L.uBgTop, P.bgTop || P.bg); gl.uniform3fv(L.uBgBot, P.bgBot || P.bg); gl.uniform3fv(L.uDeep, P.deep); gl.uniform3fv(L.uTeal, P.teal);
        gl.uniform3fv(L.uLime, P.lime); gl.uniform3fv(L.uWTeal, P.warmTeal); gl.uniform3fv(L.uWLime, P.warmLime);
        gl.uniform3fv(L.uIvory, P.ivory);
        gl.uniform3fv(L.uFogCol, P.fog || P.bg);
        gl.uniform1f(L.uGrain, r.grain || 0); gl.uniform1f(L.uFog, r.fog || 0); gl.uniform1f(L.uEdge, r.edge || 0);
        const bm = r.breath && br.tex[0] ? r.breath : 0;
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, bm ? br.tex[br.cur] : null);
        gl.uniform1i(L.uBreath, 3);
        gl.uniform1f(L.uBreathMix, bm);
        gl.uniform1f(L.uTime, (performance.now() - t0) / 1000 % 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      /*
       * 입김 응결 한 단계. input: { a:[x,y], b:[x,y] (화면 uv, y 아래), vel:[vx,vy] (uv/초), rad (화면 높이 비율), amt,
       *   temp: {decay, diff, filmRate, filmDecay, cap} } — amt 가 0 이면 주입 없이 번짐·소멸만 진행
       */
      breathStep(dt, input) {
        if (!canvas.width) return;
        ensureBreath();
        br.time += dt;
        const L = breathP.loc, i = input || {};
        gl.useProgram(breathP.p);
        gl.bindVertexArray(vao);
        gl.viewport(0, 0, br.w, br.h);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, br.tex[br.cur]);
        gl.uniform1i(L.uPrev, 0);
        gl.uniform2f(L.uRes, br.w, br.h);
        gl.uniform1f(L.uDt, Math.min(0.05, dt));
        gl.uniform1f(L.uTime, br.time % 1000);
        gl.uniform1f(L.uAspect, canvas.width / canvas.height);
        const a = i.a || [0, 0], b = i.b || a, v = i.vel || [0, 0];
        gl.uniform2f(L.uA, a[0], 1 - a[1]); gl.uniform2f(L.uB, b[0], 1 - b[1]);
        gl.uniform2f(L.uVel, v[0], -v[1]);
        gl.uniform1f(L.uRad, i.rad || 0.04); gl.uniform1f(L.uAmt, i.amt || 0);
        const T = i.temp || {};
        gl.uniform1f(L.uDecay, T.decay || 2.4); gl.uniform1f(L.uDiff, T.diff || 1);
        gl.uniform1f(L.uFilmRate, T.filmRate || 0); gl.uniform1f(L.uFilmDecay, T.filmDecay || 2);
        gl.uniform1f(L.uCap, T.cap || 1.2);
        gl.uniform1f(L.uBloom, i.bloom || 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, br.fbo[1 - br.cur]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        br.cur = 1 - br.cur;
      },
      clearBreath() {
        if (!br.fbo[0]) return;
        [0, 1].forEach((k) => { gl.bindFramebuffer(gl.FRAMEBUFFER, br.fbo[k]); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      },
      // SVG/검증용 V 농도 읽기 (행 0 = 화면 위쪽)
      readV() {
        const N = st.w * st.h, buf = new Float32Array(N * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, st.fbo[st.cur]);
        gl.readPixels(0, 0, st.w, st.h, gl.RGBA, gl.FLOAT, buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const v = new Float32Array(N);
        for (let i = 0; i < N; i++) v[i] = buf[i * 4 + 1];
        return v;
      },
      isLost() { return gl.isContextLost(); },
    };
    engine.label = 'GPU · WebGL2 ' + fmt.name;

    // 자가 진단: 작은 격자에서 한 단계 계산 후 값이 유효한지 확인
    {
      const tw = 8, th = 8, N = tw * th;
      const tf = { w: tw, h: th, mask: new Float32Array(N), dOut: new Float32Array(N).fill(1), dIn: new Float32Array(N), noise: new Float32Array(N).fill(0.5), glyphHi: document.createElement('canvas') };
      tf.glyphHi.width = tw; tf.glyphHi.height = th;
      const U = new Float32Array(N).fill(1), V = new Float32Array(N); V[27] = 0.5; U[27] = 0.5;
      engine.init(tf, { U, V });
      engine.step({ F: 0.03, K: 0.06, Du: 1, Dv: 0.5, dt: 1, windX: 0, windY: 0, radius: 100, feather: 1, protect: 0 }, 1);
      const v = engine.readV();
      if (!(isFinite(v[27]) && v[27] > 0.05 && v[27] < 0.6 && v[26] > 0)) throw new Error('GPU self-test failed');
    }
    return engine;
  };
})(window.DT = window.DT || {});
