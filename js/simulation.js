/*
 * 시뮬레이션 제어: 단계 수 기반 시간, 성장 영역 확장, 빗방울 씨앗, 예열, 프레임 독립 속도
 * 모든 시간 의존 값은 '단계 수'의 함수이므로, 같은 시드·같은 설정이면 같은 결과가 나옵니다.
 */
(function (DT) {
  'use strict';

  DT.Simulation = function (engine, timing) {
    this.engine = engine;
    this.timing = timing;       // { sps, maxPerFrame, warmup, warmupChunk }
    this.field = null;
    this.stepCount = 0;
    this.acc = 0;
    this.warmupLeft = 0;
    this.dropRng = null;
    this.seed = 0;
  };

  const P = DT.Simulation.prototype;

  P.reset = function (field, seed) {
    this.field = field;
    this.seed = seed >>> 0;
    this.engine.init(field, DT.createInitialState(field, this.seed));
    this.stepCount = 0;
    this.acc = 0;
    this.warmupLeft = this.timing.warmup;
    this.dropRng = DT.mulberry32((this.seed ^ 0x5BD1E995) >>> 0);
  };

  P.radiusAt = function (step, sim) {
    const C = DT.CONFIG, s = this.field.scale;
    const r0 = C.zoneStart * s, r1 = sim.zoneMax * s;
    return r0 + (r1 - r0) * (1 - Math.exp(-step / C.zoneTau));
  };

  P.protectDepth = function (erosion) {
    const f = this.field;
    const maxE = Math.min(DT.CONFIG.maxErodeCells * f.scale, f.maxIn * 0.3);
    return erosion * maxE;
  };

  P.uniforms = function (sim) {
    const s = this.field.scale;
    // 낮은 해상도 격자에서는 확산을 줄여 글자 대비 패턴 크기를 비슷하게 유지
    const dk = Math.max(0.35, s);
    return {
      F: sim.F, K: sim.K, Du: sim.Du * dk, Dv: sim.Dv * dk, dt: sim.dt,
      windX: sim.windX, windY: sim.windY,
      // 구간 시작 단계로 양자화 → 프레임 분할 방식과 무관하게 동일
      radius: this.radiusAt(this.stepCount - (this.stepCount % DT.CONFIG.dropInterval), sim),
      feather: DT.CONFIG.zoneFeather * s,
      protect: this.protectDepth(sim.erosion),
    };
  };

  // 빗방울: dropInterval 단계마다 dropRate 확률로 성장 영역 안쪽에 점 씨앗
  P.dropsFor = function (step, sim, radius) {
    if (sim.dropRate <= 0 || step % DT.CONFIG.dropInterval !== 0) return null;
    const rng = this.dropRng, f = this.field;
    if (rng() >= sim.dropRate || !f.near.length) return null;
    const out = [];
    const count = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 8; tries++) {
        const i = f.near[Math.floor(rng() * f.near.length)];
        if (f.dOut[i] < radius * 0.9 && f.dOut[i] > 2) {
          out.push([i % f.w, Math.floor(i / f.w), (1.3 + rng() * 1.8) * Math.max(0.6, f.scale)]);
          break;
        }
      }
    }
    return out.length ? out : null;
  };

  // n 단계 계산. 반경·빗방울을 바꾸기 위해 최대 dropInterval 단위로 묶어서 보냄
  P.run = function (n, sim) {
    const I = DT.CONFIG.dropInterval;
    while (n > 0) {
      const toBoundary = I - (this.stepCount % I);
      const chunk = Math.min(n, toBoundary);
      const u = this.uniforms(sim);
      const start = this.stepCount;
      const drops = this.dropsFor(start, sim, u.radius);
      this.engine.step(u, chunk, drops ? (k) => (k === 0 ? drops : null) : null);
      this.stepCount += chunk;
      n -= chunk;
    }
  };

  // 프레임마다 호출. dtSec 는 실제 경과 시간
  P.frame = function (dtSec, sim, paused) {
    const T = this.timing;
    if (this.warmupLeft > 0) {
      const n = Math.min(T.warmupChunk, this.warmupLeft);
      this.run(n, sim);
      this.warmupLeft -= n;
      return n;
    }
    if (paused) { this.acc = 0; return 0; }
    this.acc += Math.min(dtSec, 0.1) * T.sps * sim.speedMul;
    let n = Math.floor(this.acc);
    this.acc -= n;
    if (n > T.maxPerFrame) { n = T.maxPerFrame; this.acc = 0; }
    if (n > 0) this.run(n, sim);
    return n;
  };
})(window.DT = window.DT || {});
