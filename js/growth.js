/*
 * 온도 × 습도 — 유기적 물질 생장 (사진마다 하나씩, WebGL2, js/photoice.js 의 GL 컨텍스트 안에서)
 *
 *  사진마다 '표면 상태'를 사진 자신의 좌표(가장자리 밖으로 조금 넓힌 영역)에 저장합니다.
 *  → 사진을 옮기거나 크기를 바꿔도 그 위에 자란 물질이 그대로 따라가고, 환경을 바꿔도 상태가 초기화되지 않습니다.
 *
 *  상태 텍스처 (RGBA16F 두 장, 핑퐁)
 *   A = (U 기질, V 균사·미생물, W 물, I 얼음)
 *   B = (나이, 건조 균열, 결정질 표면, -)
 *  기질 텍스처 = (영양 — 사진 안·피사체일수록 많음, 표면 — 사진 안 1, 밖으로 부드럽게 0)
 *
 *  물리 (매 프레임, JS)
 *   이슬점 Td, 서리점 Tf : 기온 T 와 상대습도 RH 로 계산 (Magnus 식, 물/얼음)
 *   표면 온도 Ts         : 공기보다 조금 차갑고(복사 냉각) 늦게 따라감(열관성) — 공기 온도와 같은 값으로 두지 않음
 *   응결   = Td − Ts 가 클수록 (표면이 이슬점보다 차가울 때만)
 *   성에   = 표면 0 °C 이하 × 서리점 이하의 수증기 공급(Tf − Ts) — 그냥 춥거나 습하다고 생기지 않음
 *   얼어붙음/녹음 = 표면 온도 0 °C 부근에서 연속적으로 (물방울 ↔ 얼음)
 *   증식   = 습도(RH 55→88 %) × 기온(2→20 °C, 52 °C 위로 감소)
 *   건조   = 고온 × 저습, 결정화 = 저온 × 저습, 활동성(움직임·확산 속도) = 기온
 *  모든 계수는 smoothstep 으로 이어져 있어 경계에서 갑자기 켜지거나 꺼지지 않습니다.
 *
 *  생장 (셰이더)
 *   탄생 — 불규칙한 자리에 포자 / 성장·분기·전파 — Gray–Scott (자리마다 산호형·세포분열형 패턴과 속도가 다름)
 *   상호작용 — 군집이 만나면 이어짐 / 쇠퇴 — 오래된 영역은 제거율이 올라 줄어듦 / 재생 — 쇠퇴한 자리 주변에 새 포자
 *   물 — 불규칙한 핵에서 맺힌 물방울이 자라며 닿으면 합쳐짐 (표면장력: 약한 Allen–Cahn)
 *   얼음 — 얼어붙은 물방울·곰팡이 표면에서 시작해 끝(tip)에서 가지를 치며 자람(방향성 있는 확률 성장), 쌓이면 두꺼워짐
 *   균열 — 건조가 쌓이면 다각형 균열이 열리며 군집을 갈라 놓음 / 결정질 — 저온·저습에서 미세한 결정면 결이 생김
 *
 * 수치는 DT.GROWTH 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  DT.GROWTH = {
    res: 320,             // 사진 하나의 시뮬레이션 격자 긴 변(칸)
    margin: 0.1,          // 사진 가장자리 밖으로 넓힌 영역(사진 크기 대비) — 물질이 경계를 넘어 조금 번질 수 있음
    stepsPerSec: 480,     // 초당 계산 단계 (프레임 속도와 무관)
    maxSteps: 16,         // 한 프레임 최대 단계
    gsSpeed: 0.42,        // 균사 성장 속도 (Gray–Scott 단계 크기, 활동성이 곱해짐)
    surfaceOffset: 1.5,   // 표면이 공기보다 차가운 정도(°C)
    surfaceLag: 8,        // 표면 온도가 공기를 따라가는 시간상수(초)
    birthRate: 1.4,       // 증식 조건이 최대일 때 사진 하나에 초당 생기는 포자 수
    cursorScrape: 0.07,   // 커서로 문질렀을 때 걷히는 정도(단계당)
    defaultHumidity: 50,  // %
    dustCell: 2.4,        // 균사 속 미세 먼지 간격(px, 1920 기준)
    dustRadius: 0.24,     // 먼지 점 반경(먼지 칸 대비) — 가우시안이라 보이는 크기는 약 1px
  };

  // ---------------- 셰이더 ----------------
  const NOISE = `
  uniform sampler2D uNoise;
  float n1(vec2 p){ return texture(uNoise, p / 256.0).r; }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n1(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
  float h13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
  vec2 vhash(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  // 보로노이: (가장 가까운 점까지 거리, 경계까지 거리 근사)
  vec2 voro(vec2 x){
    vec2 n = floor(x), f = fract(x); float d1 = 8.0, d2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)), r = g + vhash(n + g) - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
  }
  // 건조 균열 (시뮬레이션과 화면이 같은 모양을 씀): 열린 정도 × 선
  float crackAt(vec2 p, float crk, float seed, out float open){
    vec2 w = vec2(fbm(p * 5.0 + 1.0 + seed), fbm(p * 5.0 + 4.0 - seed)) - 0.5;
    vec2 vo = voro(p * 14.0 + w * 0.9 + seed * 5.0);
    float thr = 0.22 + 0.62 * fbm(p * 4.0 + 3.0 + seed);
    open = smoothstep(thr - 0.08, thr + 0.08, crk);
    float wd = mix(0.004, 0.028, open);
    return 1.0 - smoothstep(wd, wd + 0.016, vo.y);
  }`;

  const STEP_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  layout(location=0) out vec4 oA;
  layout(location=1) out vec4 oB;
  uniform sampler2D uA, uB, uSub;
  uniform vec2 uTexel; uniform float uAsp, uSeed, uTime, uStep, uDtS, uGsDt, uAct;
  uniform float uGrow, uDry, uCrys, uCond, uEvap, uDep, uSubl, uFreeze, uMelt, uSpawn, uBucket;
  uniform vec4 uSeeds[6];
  uniform vec4 uCur; uniform float uCurAmt, uCurRad;` + NOISE + `
  void main(){
    vec2 uv = vUv, tx = uTexel, p = uv * vec2(uAsp, 1.0);
    vec4 A = texture(uA, uv), B = texture(uB, uv);
    vec2 sb = texture(uSub, uv).rg; float sub = sb.r, surf = sb.g;
    vec4 Al = texture(uA, uv - vec2(tx.x, 0.0)), Ar = texture(uA, uv + vec2(tx.x, 0.0));
    vec4 Ad = texture(uA, uv - vec2(0.0, tx.y)), Au = texture(uA, uv + vec2(0.0, tx.y));
    vec4 A1 = texture(uA, uv + tx), A2 = texture(uA, uv - tx), A3 = texture(uA, uv + vec2(tx.x, -tx.y)), A4 = texture(uA, uv + vec2(-tx.x, tx.y));
    vec4 lap = 0.2 * (Al + Ar + Ad + Au) + 0.05 * (A1 + A2 + A3 + A4) - A;
    float u = A.r, v = A.g, W = A.b, I = A.a, age = B.r, crk = B.g, crs = B.b;
    vec3 fc = vec3(gl_FragCoord.xy, mod(uStep, 8192.0) + uSeed * 17.0);

    // ---- 균사·미생물: Gray–Scott. 자리마다 패턴(산호형 가지 ↔ 세포분열형)과 성장 속도가 다르고 천천히 바뀜 ----
    //  기질(영양)은 성장 '속도'만 바꿈 — F 를 영양으로 크게 깎으면 (F, K) 가 생존 영역(K < √F/2 − F) 밖으로 나가 모든 포자가 죽음.
    //  사진 밖(여백)에서만 K 를 올려 군집이 사진 가장자리 너머로 조금만 번지고 멈추게 함
    float nA = fbm(p * 2.6 + uSeed * 0.37 + uTime * 0.006);
    float nR = fbm(p * 1.9 + 11.0 + uSeed * 0.11 - uTime * 0.004);
    float mt = smoothstep(0.4, 0.62, nA);
    float inP = smoothstep(0.05, 0.4, sub), rich = clamp((sub - 0.4) / 0.6, 0.0, 1.0);
    float F = mix(0.0545, 0.0367, mt) * mix(0.75, 1.0, inP);
    float K = mix(0.062, 0.0649, mt) + (1.0 - inP) * 0.02 + (1.0 - uGrow) * 0.006 + uDry * 0.01 + smoothstep(0.55, 1.0, age) * 0.008;   // 저습·건조 → 수축, 오래된 곳 → 쇠퇴
    float dS = mix(1.0, 0.5, uDry) * mix(1.0, 0.7, uCrys);                                                          // 건조·결정화 → 확산이 줄고 경계가 선명
    dS *= mix(0.45, 1.3, fbm(p * 1.4 + 23.0 + uSeed * 0.71));                                                     // 자리마다 가지 굵기가 다름 (가는 균사 ↔ 굵은 군집)
    float dt = uGsDt * mix(0.2, 1.0, smoothstep(0.25, 0.75, nR)) * mix(0.7, 1.25, rich);                          // 자리마다 빠르게/느리게
    float r = u * v * v;
    u += dt * (dS * lap.r - r + F * (1.0 - u));
    v += dt * (0.5 * dS * lap.g + r - (F + K) * v);
    // 탄생: 포자 무리 (JS 가 불규칙한 자리를 고름) — 중심 하나 + 비껴 난 작은 덩어리 하나 → 처음부터 비대칭
    for (int i = 0; i < 6; i++) {
      vec4 s = uSeeds[i];
      if (s.z > 0.0) {
        vec2 d = (uv - s.xy) / tx, o = (vec2(fract(s.z * 91.7), fract(s.w * 53.3)) - 0.5) * s.w * 2.2;
        float g = s.z * max(exp(-dot(d, d) / (s.w * s.w)), 0.8 * exp(-dot(d - o, d - o) / (0.4 * s.w * s.w)));
        v = max(v, 0.3 * g); u = min(u, 1.0 - 0.5 * g);
      }
    }
    // 재생: 쇠퇴한 자리(가운데가 빈 고리 안쪽)에서 새 포자 (거친 칸마다 확률적으로, 1/4초에 한 번)
    if (uSpawn > 0.5 && uGrow > 0.001) {
      vec2 c0 = floor(gl_FragCoord.xy / 9.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {   // 이웃 칸의 포자도 봄 (칸 경계에서 잘리지 않게)
        vec2 cc = c0 + vec2(float(i), float(j));
        vec2 ctr = (cc + vec2(h13(vec3(cc, uBucket + 1.7)), h13(vec3(cc, uBucket + 3.1)))) * 9.0;
        vec2 cuv = ctr * tx;
        float ok = smoothstep(0.08, 0.5, texture(uB, cuv).r) * step(texture(uA, cuv).g, 0.06) * smoothstep(0.3, 0.45, texture(uSub, cuv).r);
        if (h13(vec3(cc, uBucket + uSeed * 7.0)) < uGrow * 0.08 * ok) { vec2 d = gl_FragCoord.xy - ctr; float g = exp(-dot(d, d) / 9.0); v = max(v, 0.3 * g); u = min(u, 1.0 - 0.5 * g); }
      }
    }
    age = clamp(age + uDtS * uAct * (v > 0.12 ? 0.035 * (0.4 + nR) : -0.04), 0.0, 1.2);
    // 머문 시간(빠른 시계): 막 점유한 자리 = 0 → 앞선 가장자리. 화면에서 밝은 테두리·촘촘한 먼지로 그림
    float occ = B.a;
    occ = clamp(occ + uDtS * (v > 0.1 ? 0.4 * max(uAct, 0.1) : -0.6), 0.0, 1.0);

    // ---- 건조 균열 / 결정질 표면 ----
    crk = clamp(crk + uDtS * (uDry * 0.05 * surf - (1.0 - uDry) * 0.008), 0.0, 1.0);
    if (crk > 0.003) { float open; float ln = crackAt(p, crk, uSeed, open) * open; v *= 1.0 - ln * 0.04; u = mix(u, 1.0, ln * 0.04); }
    crs = clamp(crs + uDtS * (uCrys * 0.04 * surf - (1.0 - uCrys) * 0.02), 0.0, 1.0);

    // ---- 물: 마른 자리의 불규칙한 핵 → 응결로 자람 → 닿으면 합쳐져 둥글게 → 커지면 흘러내림 ----
    //  표면장력: 대칭 Allen–Cahn (경계가 곡률에 따라 둥글어지고, 합쳐진 물방울은 다시 둥근 모양으로)
    //  (반응 속도는 실제 시간 단위 — 단계 수와 무관해서 증발·응결과의 균형이 프레임 속도에 따라 바뀌지 않음)
    float Wc = clamp(W, 0.0, 1.0);
    W += 0.008 * lap.b + uDtS * 4.0 * Wc * (1.0 - Wc) * (Wc - 0.5);
    if (uSpawn > 0.5 && uCond > 0.001) {
      // 핵생성: 7칸마다 하나의 후보 (칸 안 아무 데나). 이웃 칸의 핵도 봐야 칸 경계에서 물방울이 잘리지 않음
      vec2 c0 = floor(gl_FragCoord.xy / 7.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 cc = c0 + vec2(float(i), float(j));
        vec2 ctr = (cc + vec2(h13(vec3(cc, uBucket + 7.7)), h13(vec3(cc, uBucket + 9.3)))) * 7.0, cuv = ctr * tx;
        float dryAt = 1.0 - smoothstep(0.05, 0.3, texture(uA, cuv).b);          // 이미 젖은 곳에는 새 핵이 생기지 않음
        if (h13(vec3(cc, uBucket * 1.31 + 5.0 + uSeed)) < uCond * 0.03 * texture(uSub, cuv).g * dryAt) {
          vec2 d = gl_FragCoord.xy - ctr; float rr = 1.3 + 1.4 * h13(vec3(cc, uBucket + 2.9));
          W = max(W, 1.0 * exp(-dot(d, d) / (rr * rr)));
        }
      }
    }
    // 응결은 이미 맺힌 물방울 위에서만 자람 (균일한 막을 만들지 않음) / 증발
    //  증발이 표면장력(최대 ≈ 0.19/초)보다 세면 물방울이 가장자리부터 줄어 사라짐 — 이슬점보다 조금만 따뜻하면 천천히, 많이 따뜻하면 빨리
    W += uDtS * surf * (uCond * 0.7 * smoothstep(0.1, 0.5, W) - uEvap * 1.2 * (1.15 - 0.5 * Wc));
    // 흘러내림: 반경 ~5칸 안이 거의 다 젖은 큰 물방울은 아래로 미끄러짐 (풍상 이류, 화면 아래 = uv −y)
    //  → 지나간 자리가 다시 마르고 그곳에 새 물방울이 맺힘. 8방향을 22.5° 돌려 재서 축 방향 결이 생기지 않음
    float Wm = 0.0;
    for (int k = 0; k < 8; k++) { float an = 0.3927 + 0.7854 * float(k); Wm += texture(uA, uv + vec2(cos(an), sin(an)) * 5.0 * tx).b; }
    Wm *= 0.125;
    float slide = 0.035 * smoothstep(0.78, 0.97, Wm) * surf * (1.0 - uFreeze);
    if (slide > 1e-4) {
      float mx = (fbm(p * 4.0 + 31.0 + uSeed) - 0.5) * 2.4;                    // 흘러내리는 길이 좌우로 구불구불 (곧은 줄무늬 방지)
      W += slide * (texture(uA, uv + vec2(mx * tx.x, tx.y)).b - W);
    }

    // ---- 얼어붙음 / 녹음 / 승화 ----
    float fr = uFreeze * uDtS * 0.8 * clamp(W, 0.0, 1.0);
    W -= fr; I += fr * 1.6;                                   // 물방울이 얼면 얼음 핵이 됨
    float ml = min(I, uMelt * uDtS * 0.45);
    I -= ml; W += ml * 0.9;                                   // 녹으면 그 자리에서 물방울로
    I = max(0.0, I - uSubl * uDtS * 0.04);

    // ---- 성에 가지: 얼음 칸의 끝(이웃 1개)에서 잘 자라고, 2개면 가끔 곁가지, 그 이상은 거의 안 자람 ----
    if (I < 0.5 && uDep > 0.001 && surf > 0.05) {
      float th = 6.2831 * fbm(p * 1.3 + uSeed * 2.0);       // 자리마다 결정 방향
      float cnt = 0.0, w = 0.0;
      #define NB(S, dx, dy, k) if (S.a > 0.5) { cnt += 1.0; w += k * (0.3 + 0.7 * pow(0.5 + 0.5 * cos(6.0 * (atan(dy, dx) - th)), 4.0)); }
      NB(Al, 1.0, 0.0, 1.0) NB(Ar, -1.0, 0.0, 1.0) NB(Ad, 0.0, 1.0, 1.0) NB(Au, 0.0, -1.0, 1.0)
      NB(A1, -1.0, -1.0, 0.7) NB(A2, 1.0, 1.0, 0.7) NB(A3, -1.0, 1.0, 0.7) NB(A4, 1.0, -1.0, 0.7)
      float tip = cnt < 0.5 ? 0.0 : (cnt < 1.5 ? 1.0 : (cnt < 2.5 ? 0.22 : 0.02));
      float pg = uDep * (0.6 + 1.5 * Wc + 0.6 * smoothstep(0.2, 0.5, v)) * tip * w * uDtS * 14.0;
      float pn = uDep * surf * uDtS * (0.0004 + 0.01 * smoothstep(0.2, 0.5, v) + 0.02 * smoothstep(0.3, 0.8, Wc));   // 곰팡이·물방울 표면에서 잘 맺힘
      if (h13(fc + 5.3) < pg || h13(fc + 9.1) < pn) { I = 1.0; W *= 0.3; }
    } else if (I >= 0.5) I = min(2.0, I + uDep * uDtS * 0.06);   // 쌓이며 두꺼워짐

    // ---- 커서: 문지른 자리의 물질이 걷힘 (이후 조건이 맞으면 다시 자람) ----
    if (uCurAmt > 0.0) {
      vec2 q = uv * vec2(uAsp, 1.0), a = uCur.xy * vec2(uAsp, 1.0), b = uCur.zw * vec2(uAsp, 1.0), pa = q - a, ba = b - a;
      float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0), d = length(pa - ba * hh);
      float k = clamp(uCurAmt * exp(-d * d / (uCurRad * uCurRad)) * (0.5 + fbm(q * 30.0 + uTime)), 0.0, 0.9);
      v *= 1.0 - k; u = mix(u, 1.0, k); W *= 1.0 - k; I *= 1.0 - k * 0.6;
    }
    oA = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), clamp(W, 0.0, 1.4), clamp(I, 0.0, 2.0));
    oB = vec4(age, crk, crs, occ);
  }`;

  // 화면: 현미경으로 들여다본 듯한 미세한 표현 (사진 위, 점 레이어 아래)
  const DRAW_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uA, uB, uSub, uPhoto;
  uniform vec2 uTexel, uPx; uniform float uAsp, uSeed, uActT, uMarg, uPhotoK, uDustK, uDustR;` + NOISE + `
  void over(inout vec3 C, inout float Aa, vec3 c, float a){ C = c * a + C * (1.0 - a); Aa = a + Aa * (1.0 - a); }
  /*
   * 미세 먼지 (균사 안의 포자·세포) — 물질에 붙은 좌표 q(먼지 칸 단위, 격자 1칸 = uDustK 칸)에서
   *  칸마다 흩뜨린 위치에 가우시안 점 하나. 밀도 dens 보다 해시가 작은 칸에만 점이 있음 → 밀도가 오르면 점이 '생겨남'
   *  깜박임·미세한 떨림, 점마다 밝기가 다름
   */
  float dustLayer(vec2 q, float dens, float t, float salt){
    vec2 cell = floor(q); float lum = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      float h1 = h13(vec3(c, salt + 1.3)), h2 = h13(vec3(c, salt + 2.7)), h3 = h13(vec3(c, salt + 4.1)), h4 = h13(vec3(c, salt + 5.9));
      float on = smoothstep(h3 - 0.06, h3 + 0.06, dens);
      if (on < 0.001) continue;
      vec2 pos = c + 0.18 + 0.64 * vec2(h1, h2) + 0.12 * vec2(sin(t * (0.6 + h4) + h1 * 6.28), cos(t * (0.5 + h3) + h2 * 6.28));
      vec2 d = q - pos;
      float tw = 0.45 + 0.55 * (0.5 + 0.5 * sin(t * (1.1 + 2.6 * h4) + h2 * 40.0));
      lum += on * tw * (0.35 + 0.9 * h4 * h4) * exp(-dot(d, d) / (uDustR * uDustR));
    }
    return lum;
  }
  /*
   * 밖으로 흘러가는 먼지 (Ring Field 의 '안에서 바깥으로 떠가는 고운 먼지'를 균사 생장으로) — flow map:
   *  같은 먼지 층을 반 주기 어긋난 두 위상으로 흐름 방향 fl 만큼 밀어 내고 교차로 섞음 → 끊김 없이 계속 바깥으로 흐르고,
   *  섞이는 동안 점이 생기고 사라짐(재배치). fl 은 먼지 칸 단위/주기
   */
  float dustFlow(vec2 q, vec2 fl, float dens, float t, float salt){
    float ph = t * 0.22, a = fract(ph), b = fract(ph + 0.5);
    float wa = 1.0 - abs(2.0 * a - 1.0);
    return wa * dustLayer(q - fl * a, dens, t, salt + floor(ph) * 7.0) + (1.0 - wa) * dustLayer(q - fl * b, dens, t, salt + floor(ph + 0.5) * 7.0 + 3.0);
  }
  void main(){
    vec2 uv = vUv, tx = uTexel, p = uv * vec2(uAsp, 1.0), px = uv * uPx;
    vec4 A = texture(uA, uv), B = texture(uB, uv);
    float surf = texture(uSub, uv).g;
    vec4 Al = texture(uA, uv - vec2(tx.x, 0.0)), Ar = texture(uA, uv + vec2(tx.x, 0.0));
    vec4 Ad = texture(uA, uv - vec2(0.0, tx.y)), Au = texture(uA, uv + vec2(0.0, tx.y));
    vec3 col = vec3(0.0); float a = 0.0;
    float t = uActT;   // 활동성으로 흐르는 시간 (JS 가 누적 — 기온을 바꿔도 튀지 않고 빨라지거나 느려지기만 함)

    // 결정질 표면 (저온·저습) — 미세한 결정면 결과 옅은 광택. 성에·물방울은 아님
    float crs = B.b * surf;
    if (crs > 0.003) {
      vec2 w = vec2(fbm(p * 6.0 + 2.0), fbm(p * 6.0 + 8.0)) - 0.5;
      vec2 vo = voro(p * 38.0 + w * 1.4 + uSeed * 3.0);
      float facet = 1.0 - smoothstep(0.012, 0.04, vo.y);
      over(col, a, vec3(0.80, 0.86, 0.92) * (0.75 + 0.25 * vo.x), facet * crs * 0.42 + crs * 0.05);
    }
    // 균사·미생물 군집: 옅은 몸체(안쪽 밀도 차) + 안에서 밖으로 흘러가는 미세 먼지 + 막 점유한 앞선 가장자리의 밝은 테두리
    float v = A.g;
    float m = smoothstep(0.1, 0.32, v);
    float sp = smoothstep(0.025, 0.09, v) * (1.0 - m);
    float old = smoothstep(0.5, 1.1, B.r);                                    // 오래된 곳 = 성기고 어두움 (쇠퇴)
    float young = smoothstep(0.1, 0.24, v) * (1.0 - smoothstep(0.03, 0.3, B.a));   // 막 점유한 자리
    float edge = smoothstep(0.04, 0.2, length(vec2(Ar.g - Al.g, Au.g - Ad.g))) * smoothstep(0.03, 0.15, v);
    float gr = fbm(p * 9.0 + uSeed * 3.1 + vec2(t * 0.02, -t * 0.015));
    vec3 mc = mix(vec3(0.46, 0.55, 0.54), vec3(0.92, 0.94, 0.89), clamp(m * 0.5 + edge * 0.5 + young * 0.4, 0.0, 1.0));
    mc = mix(mc, vec3(0.52, 0.47, 0.40), B.g * 0.55);                         // 마르면 흙빛으로
    over(col, a, mc, clamp(m * (0.2 + 0.26 * gr) * (1.0 - 0.45 * old) + edge * 0.3 + young * 0.18, 0.0, 0.85));
    // 흐름: 오래된 쪽 → 젊은 쪽(나이 기울기) + 군집 → 빈 곳(밀도 기울기). 3칸 떨어진 곳에서 재어 부드럽게
    if (v > 0.02 || sp > 0.0) {
      vec2 o3 = tx * 3.0;
      float gx = (texture(uB, uv + vec2(o3.x, 0.0)).r - texture(uB, uv - vec2(o3.x, 0.0)).r) + 0.6 * (texture(uA, uv + vec2(o3.x, 0.0)).g - texture(uA, uv - vec2(o3.x, 0.0)).g);
      float gy = (texture(uB, uv + vec2(0.0, o3.y)).r - texture(uB, uv - vec2(0.0, o3.y)).r) + 0.6 * (texture(uA, uv + vec2(0.0, o3.y)).g - texture(uA, uv - vec2(0.0, o3.y)).g);
      vec2 g2 = -vec2(gx, gy);
      float gl2 = length(g2);
      vec2 fl = gl2 > 1e-4 ? g2 / gl2 * smoothstep(0.0, 0.08, gl2) : vec2(0.0);
      fl += 0.35 * (vec2(fbm(p * 3.0 + 5.0 + t * 0.03), fbm(p * 3.0 - 9.0 - t * 0.03)) - 0.5);   // 흐름도 조금씩 흔들림
      vec2 q = uv / tx * uDustK;
      float dens = clamp(smoothstep(0.03, 0.3, v) * (0.5 + 0.3 * gr) * (1.0 - 0.6 * old) + young * 0.45 + sp * 0.25, 0.0, 0.95);
      float ta = t + 3.0;                                                       // 추우면 먼지도 느려짐 (t = 시간 × 활동성)
      float du = dustFlow(q, fl * 2.4, dens, ta, uSeed) + 0.6 * dustFlow(q * 1.73 + 11.0, fl * 4.2, dens * 0.8, ta * 1.1, uSeed + 19.0);
      du *= 1.0 + 1.3 * young;                                                  // 앞선 가장자리는 더 밝게 반짝임
      vec3 dc = mix(vec3(0.95, 0.94, 0.88), vec3(0.80, 0.90, 1.0), gr);
      dc = mix(dc, vec3(0.62, 0.56, 0.47), B.g * 0.6);
      over(col, a, dc, clamp(du * 0.85, 0.0, 0.95));
    }
    // 건조 균열
    if (B.g > 0.003) { float open; float ln = crackAt(p, B.g, uSeed, open) * open * surf; over(col, a, vec3(0.015, 0.012, 0.01), ln * 0.8); }
    // 물: 작은 점 → 굴절하는 물방울 (사진이 비침) + 가장자리 그늘 + 반짝임
    float Ws = (A.b * 4.0 + Al.b + Ar.b + Ad.b + Au.b) / 8.0;
    float drop = smoothstep(0.42, 0.58, Ws), haze = smoothstep(0.03, 0.35, Ws) * (1.0 - drop);
    // 돔 모양 법선: 2칸 떨어진 곳의 기울기 (가장자리에서 가파르고 가운데로 갈수록 평평 → 렌즈처럼 사진이 굴절)
    vec2 o2 = tx * 2.0;
    vec2 g = 0.5 * vec2(texture(uA, uv + vec2(o2.x, 0.0)).b - texture(uA, uv - vec2(o2.x, 0.0)).b, texture(uA, uv + vec2(0.0, o2.y)).b - texture(uA, uv - vec2(0.0, o2.y)).b) + 0.5 * vec2(Ar.b - Al.b, Au.b - Ad.b);
    vec3 n = normalize(vec3(-g * 2.2, 1.0));
    float spec = pow(max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0), 28.0) * drop;
    float rim = drop * smoothstep(0.08, 0.35, length(g));
    vec2 puv = (uv - uMarg) / (1.0 - 2.0 * uMarg) - n.xy * 0.02 * drop;
    bool inP = all(greaterThanEqual(puv, vec2(0.0))) && all(lessThanEqual(puv, vec2(1.0)));
    vec3 refr = inP ? texture(uPhoto, puv).rgb : vec3(0.0);
    float wa = drop * (0.25 + 0.6 * uPhotoK) + haze * 0.12;
    if (wa > 0.001) {
      vec3 wc = (refr * uPhotoK * 1.05 * drop + vec3(0.75, 0.82, 0.88) * (haze * 0.12 + drop * 0.08)) / wa;
      over(col, a, mix(wc, vec3(0.02, 0.03, 0.04), rim * 0.5), wa);
    }
    col += vec3(0.95, 0.97, 1.0) * spec * 0.9; a = max(a, min(1.0, spec));
    // 성에: 가늘게 분기한 결정, 두껍게 쌓인 곳은 희게
    float Is = (A.a * 4.0 + Al.a + Ar.a + Ad.a + Au.a) / 8.0;
    float il = smoothstep(0.38, 0.62, Is), thick = smoothstep(1.0, 1.9, Is);
    float gl = smoothstep(0.82, 0.95, n1(px * 1.2 + 13.0 + uSeed));
    over(col, a, mix(vec3(0.62, 0.80, 1.0), vec3(0.94, 0.98, 1.0), clamp(thick * 0.8 + gl * 0.3, 0.0, 1.0)), il * (0.62 + 0.3 * thick));
    // 누끼 모양으로만 보임: 피사체 표면 + 윤곽 밖으로 조금 번진 균사 자리. 그 밖(사진의 배경·네모 가장자리)은 어떤 상태가 남아 있어도 그리지 않음
    vec2 sb = texture(uSub, uv).rg;
    float shape = max(smoothstep(0.02, 0.3, sb.g), smoothstep(0.03, 0.3, sb.r) * smoothstep(0.02, 0.2, v));
    o = vec4(col, a) * shape;
  }`;

  /*
   * gl: photoice 의 WebGL2 컨텍스트, sh: 공용 도구 { program, QUAD_VS, quadVao, noise, H }
   */
  DT.createGrowth = function (gl, sh) {
    const G = DT.GROWTH;
    const pStep = sh.program(gl, sh.QUAD_VS, STEP_FS), pDraw = sh.program(gl, sh.QUAD_VS, DRAW_FS);
    const env = { T: 15, RH: G.defaultHumidity, Ts: null, Td: 0, Tf: 0, cond: 0, evap: 0, dep: 0, subl: 0, freeze: 0, melt: 0, grow: 0, dry: 0, crys: 0, act: 1 };
    let time = 0, actTime = 0, stepN = 0, bucket = -1;

    const mkTex = (w, h) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };

    /*
     * 기질 — 누끼(피사체 매트) 모양 그대로. 사진의 네모 모양은 어디에도 쓰지 않음
     *  표면(물방울·물막·성에·균열·결정질이 생기는 곳) = 피사체 매트 (배경 = 0, 머리카락 같은 경계는 부드럽게)
     *  영양(균사) = 피사체 매트를 조금 번지게 한 것 → 균사는 피사체 윤곽 밖으로 아주 조금만 번짐
     *  (매트는 누끼 결과가 오면 refresh 로 다시 계산)
     */
    function substrate(it) {
      const s = it.grow, gw = s.gw, gh = s.gh, m = G.margin, M = it.mask;
      const iw = Math.max(2, Math.round(gw / (1 + 2 * m))), ih = Math.max(2, Math.round(gh / (1 + 2 * m)));
      const c = document.createElement('canvas'); c.width = iw; c.height = ih;
      const g2 = c.getContext('2d', { willReadFrequently: true }); g2.drawImage(it.canvas, 0, 0, iw, ih);
      const px = g2.getImageData(0, 0, iw, ih).data;
      const maskAt = (u, v) => {
        const x = Math.min(M.w - 1, Math.max(0, Math.round(u * M.w - 0.5))), y = Math.min(M.h - 1, Math.max(0, Math.round(v * M.h - 0.5)));
        return M.m[y * M.w + x];
      };
      // 격자 칸마다 매트 값 (사진 밖 = 0)
      const mk = new Float32Array(gw * gh);
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const u = (x + 0.5) / gw * (1 + 2 * m) - m, v = (y + 0.5) / gh * (1 + 2 * m) - m;   // 사진 안 좌표 (위가 0)
        mk[y * gw + x] = u < 0 || u > 1 || v < 0 || v > 1 ? 0 : clamp01(maskAt(u, v));
      }
      // 번진 매트 (가로·세로 상자 흐림 두 번 ≈ 가우시안, 반경 ~4칸) — 균사가 윤곽 밖으로 조금 번지는 범위
      const blur = (src, r) => {
        const tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = 1 / (2 * r + 1);
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { let a = 0; for (let i = -r; i <= r; i++) a += src[y * gw + Math.min(gw - 1, Math.max(0, x + i))]; tmp[y * gw + x] = a * k; }
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { let a = 0; for (let i = -r; i <= r; i++) a += tmp[Math.min(gh - 1, Math.max(0, y + i)) * gw + x]; out[y * gw + x] = a * k; }
        return out;
      };
      const spread = blur(blur(mk, 2), 2);
      const d = new Uint8Array(gw * gh * 2);
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const u = (x + 0.5) / gw * (1 + 2 * m) - m, v = (y + 0.5) / gh * (1 + 2 * m) - m;
          const a = mk[y * gw + x];
          const surf = sstep(0.15, 0.6, a);                                  // 물·얼음은 피사체 표면에만
          const creep = Math.max(a, 0.7 * sstep(0.05, 0.5, spread[y * gw + x]));   // 균사는 윤곽 밖으로 조금만
          const cu = Math.min(1, Math.max(0, u)), cv = Math.min(1, Math.max(0, v));
          const o = (Math.min(ih - 1, (cv * ih) | 0) * iw + Math.min(iw - 1, (cu * iw) | 0)) * 4;
          const lum = (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255;
          const sub = creep * (0.4 + 0.4 * a + 0.2 * (1 - lum));
          const r = ((gh - 1 - y) * gw + x) * 2;   // 아래 행이 먼저 (사진 텍스처와 같은 방향)
          d[r] = Math.round(sub * 255); d[r + 1] = Math.round(surf * 255);
        }
      }
      gl.bindTexture(gl.TEXTURE_2D, s.sub);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, gw, gh, 0, gl.RG, gl.UNSIGNED_BYTE, d);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    function attach(it) {
      const gw = Math.max(16, Math.round(it.aspect >= 1 ? G.res : G.res * it.aspect)), gh = Math.max(16, Math.round(it.aspect >= 1 ? G.res / it.aspect : G.res));
      const s = { gw, gh, cur: 0, seed: (it.id * 7.31) % 97, sub: gl.createTexture(), A: [mkTex(gw, gh), mkTex(gw, gh)], B: [mkTex(gw, gh), mkTex(gw, gh)], f: [], last: null };
      for (let i = 0; i < 2; i++) {
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.A[i], 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, s.B[i], 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('growth framebuffer incomplete');
        gl.clearBufferfv(gl.COLOR, 0, [1, 0, 0, 0]);
        gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
        s.f.push(f);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      it.grow = s;
      substrate(it);
    }
    function detach(it) {
      const s = it.grow; if (!s) return;
      s.A.concat(s.B, [s.sub]).forEach((t) => gl.deleteTexture(t));
      s.f.forEach((f) => gl.deleteFramebuffer(f));
      it.grow = null;
    }

    // 이슬점·서리점 (Magnus, 물 / 얼음)
    const esw = (T) => 6.112 * Math.exp(17.62 * T / (243.12 + T));
    function updateEnv(Ta, RH, dt) {
      env.T = Ta; env.RH = RH;
      const target = Ta - G.surfaceOffset;
      env.Ts = env.Ts == null ? target : env.Ts + (target - env.Ts) * Math.min(1, dt / G.surfaceLag);
      const e = Math.max(1e-4, RH / 100) * esw(Ta), L = Math.log(e / 6.112);
      env.Td = 243.12 * L / (17.62 - L);
      env.Tf = 272.62 * L / (22.46 - L);
      const Ts = env.Ts;
      env.freeze = sstep(-0.2, -2.5, Ts);                                   // 표면의 물이 얼어붙음
      env.melt = sstep(0.2, 2.5, Ts);                                       // 얼음이 녹음
      env.cond = sstep(-0.3, 2.5, env.Td - Ts) * (1 - env.freeze);          // 이슬점 아래의 표면 → 물방울
      env.dep = sstep(-0.3, 2.0, env.Tf - Ts) * env.freeze;                  // 0 °C 아래 + 서리점 아래 → 성에 (수증기 공급이 있을 때만)
      env.evap = sstep(0.5, 6, Ts - env.Td) * (0.4 + 0.6 * sstep(0, 30, Ta));
      env.subl = sstep(0.5, 6, Ts - env.Tf) * env.freeze;
      env.act = 0.06 + 0.94 * sstep(-12, 26, Ta);                            // 추울수록 움직임·확산이 느려짐
      env.grow = sstep(55, 88, RH) * sstep(2, 20, Ta) * (1 - sstep(40, 52, Ta));
      env.dry = sstep(14, 30, Ta) * (1 - sstep(30, 60, RH));
      env.crys = (1 - sstep(-8, 5, Ta)) * (1 - sstep(30, 62, RH));
    }

    const seedArr = new Float32Array(24), zero = new Float32Array(24);
    /*
     * items: photoice 의 항목들, cursor: { x, y } 캔버스 px(확대 전) 또는 null, scrape: 커서 효과 배율(0~1), H: 캔버스 높이
     */
    function update(dt, items, Ta, RH, cursor, scrape) {
      time += dt;
      updateEnv(Ta, RH, dt);
      actTime += dt * env.act;
      if (!items.length) return;
      const n = Math.max(1, Math.min(G.maxSteps, Math.round(dt * G.stepsPerSec))), dtS = dt / n;
      const nb = Math.floor(time * 4), spawnNow = nb !== bucket; bucket = nb;
      gl.disable(gl.BLEND);
      gl.bindVertexArray(sh.quadVao);
      gl.useProgram(pStep.p);
      const L = pStep.loc;
      gl.uniform4f(L.uRect, -1, -1, 1, 1);
      gl.uniform1i(L.uA, 0); gl.uniform1i(L.uB, 1); gl.uniform1i(L.uSub, 2); gl.uniform1i(L.uNoise, 3);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, sh.noise);
      gl.uniform1f(L.uTime, time); gl.uniform1f(L.uDtS, dtS); gl.uniform1f(L.uGsDt, G.gsSpeed * env.act); gl.uniform1f(L.uAct, env.act);
      gl.uniform1f(L.uGrow, env.grow); gl.uniform1f(L.uDry, env.dry); gl.uniform1f(L.uCrys, env.crys);
      gl.uniform1f(L.uCond, env.cond); gl.uniform1f(L.uEvap, env.evap); gl.uniform1f(L.uDep, env.dep); gl.uniform1f(L.uSubl, env.subl);
      gl.uniform1f(L.uFreeze, env.freeze); gl.uniform1f(L.uMelt, env.melt); gl.uniform1f(L.uBucket, nb % 4096);
      for (const it of items) {
        const s = it.grow; if (!s) continue;
        const m = G.margin, dw = it.w * (1 + 2 * m), dh = it.h * (1 + 2 * m), dx0 = it.cx - dw / 2, dy0 = it.cy - dh / 2;
        // 포자 탄생 (증식 조건 × 활동성에 비례, 사진 안의 불규칙한 자리)
        seedArr.fill(0);
        let lam = env.grow * env.act * dt * G.birthRate, k = 0;
        while (k < 6 && Math.random() < lam) {
          const im = m / (1 + 2 * m);
          seedArr.set([im + Math.random() * (1 - 2 * im), im + Math.random() * (1 - 2 * im), 0.7 + Math.random() * 0.3, 2.4 + Math.random() * 1.6], k * 4);   // 너무 작은 포자는 바로 죽음 → 반경 2.4~4칸
          k++; lam -= 1;
        }
        // 커서: 사진 기준 좌표에서 움직인 만큼 (사진을 끌어 옮기는 동안에는 상대 움직임이 없어 걷히지 않음)
        let curAmt = 0, cu = null;
        if (cursor) {
          cu = [(cursor.x - dx0) / dw, 1 - (cursor.y - dy0) / dh];
          const inside = cu[0] > -0.1 && cu[0] < 1.1 && cu[1] > -0.1 && cu[1] < 1.1;
          if (inside && s.last) {
            const mv = Math.hypot((cu[0] - s.last[0]) * dw, (cu[1] - s.last[1]) * dh) / sh.H;
            curAmt = G.cursorScrape * clamp01(mv / 0.02) * scrape;
          }
        }
        gl.uniform2f(L.uTexel, 1 / s.gw, 1 / s.gh); gl.uniform1f(L.uAsp, s.gw / s.gh); gl.uniform1f(L.uSeed, s.seed);
        gl.uniform1f(L.uCurAmt, curAmt);
        if (curAmt > 0) { gl.uniform4f(L.uCur, s.last[0], s.last[1], cu[0], cu[1]); gl.uniform1f(L.uCurRad, 0.06 * sh.H / dh); }
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, s.sub);
        gl.viewport(0, 0, s.gw, s.gh);
        for (let i = 0; i < n; i++) {
          gl.uniform4fv(L['uSeeds[0]'], i === 0 ? seedArr : zero);
          gl.uniform1f(L.uSpawn, spawnNow && i === 0 ? 1 : 0);
          gl.uniform1f(L.uStep, stepN++ % 8192);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.A[s.cur]);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, s.B[s.cur]);
          gl.bindFramebuffer(gl.FRAMEBUFFER, s.f[1 - s.cur]);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          s.cur = 1 - s.cur;
        }
        s.last = cu;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // 사진 하나의 물질 그리기. rect = 클립 좌표 [x0, y아래, x1, y위], pxW/pxH = 화면에서의 영역 크기(px), photoK = 사진이 보이는 정도
    function draw(it, rect, pxW, pxH, photoK) {
      const s = it.grow; if (!s) return;
      gl.useProgram(pDraw.p);
      const L = pDraw.loc;
      gl.uniform4f(L.uRect, rect[0], rect[1], rect[2], rect[3]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.A[s.cur]); gl.uniform1i(L.uA, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, s.B[s.cur]); gl.uniform1i(L.uB, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, s.sub); gl.uniform1i(L.uSub, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, sh.noise); gl.uniform1i(L.uNoise, 3);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, it.photoT); gl.uniform1i(L.uPhoto, 4);
      gl.uniform2f(L.uTexel, 1 / s.gw, 1 / s.gh); gl.uniform2f(L.uPx, pxW, pxH);
      gl.uniform1f(L.uAsp, s.gw / s.gh); gl.uniform1f(L.uSeed, s.seed); gl.uniform1f(L.uActT, actTime % 3600);
      gl.uniform1f(L.uMarg, G.margin / (1 + 2 * G.margin)); gl.uniform1f(L.uPhotoK, photoK);
      // 먼지 칸: 크기를 확정한 사진(점 샘플링 크기) 기준 약 dustCell px → 물질에 붙어 있어 확대·이동해도 그대로
      const texelPx = (it.sampledW || it.w) * (1 + 2 * G.margin) / s.gw;
      gl.uniform1f(L.uDustK, Math.max(0.5, texelPx / (G.dustCell * (sh.S || 1)))); gl.uniform1f(L.uDustR, G.dustRadius);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.activeTexture(gl.TEXTURE0);
    }

    return {
      attach, detach, refresh: (it) => { if (it.grow) substrate(it); }, draw, update,
      get env() { return env; },
      /*
       * 검증용: 사진 표면(여백 제외) 상태 요약 — 콘솔 __DIFFUSE__.growth
       *  mold 균사 점유율(v>0.12) · front 막 점유한 가장자리 비율 · water 물방울(W>0.4) · drops 물방울 개수(연결 성분) ·
       *  ice 성에(I>0.5) · crack 건조 균열 평균 · crys 결정질 평균 · age 균사 평균 나이
       */
      stats(items) {
        return items.filter((it) => it.grow).map((it) => {
          const s = it.grow, n = s.gw * s.gh, A = new Float32Array(n * 4), B = new Float32Array(n * 4);
          gl.bindFramebuffer(gl.FRAMEBUFFER, s.f[s.cur]);
          gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0, 0, s.gw, s.gh, gl.RGBA, gl.FLOAT, A);
          gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.readPixels(0, 0, s.gw, s.gh, gl.RGBA, gl.FLOAT, B);
          gl.readBuffer(gl.COLOR_ATTACHMENT0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          const m = G.margin / (1 + 2 * G.margin), x0 = Math.ceil(s.gw * m), x1 = Math.floor(s.gw * (1 - m)), y0 = Math.ceil(s.gh * m), y1 = Math.floor(s.gh * (1 - m));
          let N = 0, mold = 0, front = 0, water = 0, ice = 0, crack = 0, crys = 0, age = 0, outMold = 0, outN = 0;
          const wet = new Uint8Array(n);
          for (let y = 0; y < s.gh; y++) for (let x = 0; x < s.gw; x++) {
            const i = y * s.gw + x, v = A[i * 4 + 1];
            if (x < x0 || x >= x1 || y < y0 || y >= y1) { outN++; if (v > 0.12) outMold++; continue; }
            N++;
            if (v > 0.12) { mold++; age += B[i * 4]; if (B[i * 4 + 3] < 0.2) front++; }
            if (A[i * 4 + 2] > 0.5) { water++; wet[i] = 1; }
            if (A[i * 4 + 3] > 0.5) ice++;
            crack += B[i * 4 + 1]; crys += B[i * 4 + 2];
          }
          // 물방울 개수: 젖은 칸의 연결 성분 (합쳐지면 줄어듦)
          let drops = 0; const st = [];
          for (let i = 0; i < n; i++) {
            if (!wet[i]) continue;
            drops++; wet[i] = 0; st.push(i);
            while (st.length) { const j = st.pop(), x = j % s.gw; for (const k of [j - 1, j + 1, j - s.gw, j + s.gw]) if (k >= 0 && k < n && wet[k] && Math.abs((k % s.gw) - x) <= 1) { wet[k] = 0; st.push(k); } }
          }
          const r = (x) => +x.toFixed(4);
          return { id: it.id, mold: r(mold / N), front: r(front / N), water: r(water / N), drops, ice: r(ice / N), crack: r(crack / N), crys: r(crys / N), age: r(mold ? age / mold : 0), outsideMold: r(outMold / Math.max(1, outN)) };
        });
      },
      // 영역 (캔버스 px): 사진보다 margin 만큼 넓음
      domain(it) { const m = G.margin, dw = it.w * (1 + 2 * m), dh = it.h * (1 + 2 * m); return [it.cx - dw / 2, it.cy - dh / 2, dw, dh]; },
    };
  };
})(window.DT = window.DT || {});
