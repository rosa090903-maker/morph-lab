/*
 * 텍스트 마스크와 거리장 생성
 *  - mask : 글자 내부 1, 외부 0 (안티앨리어싱 포함)
 *  - dOut : 글자 밖 셀에서 가장 가까운 글자까지의 거리 (성장 영역 제한에 사용)
 *  - dIn  : 글자 안 셀에서 배경까지의 거리 (내부 보호 / 외곽 침식에 사용)
 *  - noise: 시드 기반 값 노이즈 (성장 경계를 불규칙하게)
 */
(function (DT) {
  'use strict';

  DT.FONT_STACK = '"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans KR","Noto Sans CJK KR",system-ui,sans-serif';

  // 시드 고정 난수 (mulberry32)
  DT.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  DT.randomSeed = function () {
    const a = new Uint32Array(1);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return (a[0] % 899999) + 100000;
  };

  DT.splitLines = function (text) {
    const chars = Array.from(text.trim());
    if (chars.length <= 8) return [chars.join('')];
    const mid = chars.length / 2;
    let best = -1, bd = Infinity;
    chars.forEach((c, i) => { if (c === ' ' && Math.abs(i - mid) < bd) { bd = Math.abs(i - mid); best = i; } });
    if (best > 0 && bd < chars.length * 0.3) {
      return [chars.slice(0, best).join('').trim(), chars.slice(best + 1).join('').trim()].filter(Boolean);
    }
    if (chars.length <= 11) return [chars.join('')];
    const m = Math.ceil(chars.length / 2);
    return [chars.slice(0, m).join('').trim(), chars.slice(m).join('').trim()];
  };

  /*
   * 글자 형태(style): weight, outline, swell, tracking, scaleX, skew, wave{amp,period}
   * 모든 길이는 글자 크기(size) 대비 비율이라 시뮬레이션 해상도와 화면 해상도에서 같은 모양이 됩니다.
   */
  const setFont = (ctx, size, st) => { ctx.font = `${st.weight || 'bold'} ${size}px ${DT.FONT_STACK}`; };
  // 자간을 직접 적용하기 위해 글자 단위로 폭 계산
  function lineMetrics(ctx, line, size, st) {
    const chars = Array.from(line);
    const tr = (st.tracking || 0) * size;
    const ws = chars.map((c) => ctx.measureText(c).width);
    const width = ws.reduce((a, b) => a + b, 0) + tr * Math.max(0, chars.length - 1);
    return { chars, ws, tr, width };
  }
  function blockWidth(ctx, lines, size, st) {
    setFont(ctx, size, st);
    const extra = (st.outline || 0) * size + (st.swell || 0) * size + Math.abs(st.skew || 0) * size * 0.9;
    return Math.max.apply(null, lines.map((l) => lineMetrics(ctx, l, size, st).width)) * (st.scaleX || 1) + extra;
  }
  /*
   * 줄 배치 계산 (w×h 캔버스 기준)
   *  style.size  : [한 줄, 두 줄] 글자 크기 (높이 대비, 기본 [0.36, 0.27])
   *  style.fit   : [가로, 세로] 글자 덩어리가 넘지 않을 비율 (기본 [0.84, 1]) — 길면 자동으로 줄어듦.
   *               세로는 넓은 화면에서 캔버스 위아래가 잘려도(cover) 글자가 보이도록
   */
  function layout(ctx, lines, w, h, st) {
    const sz = st.size || [0.36, 0.27], fit = st.fit || [0.84, 1];
    let size = h * (lines.length === 1 ? sz[0] : sz[1]);
    const bw = blockWidth(ctx, lines, size, st);
    if (bw > w * fit[0]) size *= (w * fit[0]) / bw;
    setFont(ctx, size, st);
    let asc = 0, desc = 0;
    lines.forEach((l) => { const m = ctx.measureText(l); asc = Math.max(asc, m.actualBoundingBoxAscent || size * 0.8); desc = Math.max(desc, m.actualBoundingBoxDescent || size * 0.1); });
    const bh = asc + desc + size * 1.12 * (st.wave ? 1.08 : 1) * (lines.length - 1) + (st.swell || 0) * size;
    if (bh > h * fit[1]) size *= (h * fit[1]) / bh;
    return size;
  }

  // 흰 글자(알파) 캔버스. sizeRatio(높이 대비 글자 크기)를 넘기면 같은 배치를 다른 해상도로 재현
  DT.drawGlyphCanvas = function (lines, w, h, sizeRatio, style) {
    const st = style || {};
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const size = sizeRatio != null ? sizeRatio * h : layout(ctx, lines, w, h, st);
    setFont(ctx, size, st);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    ctx.lineJoin = st.outline ? 'miter' : 'round';
    const lh = size * 1.12 * (st.wave ? 1.08 : 1);
    // 실제 글리프 경계 상자를 기준으로 수직 중앙 정렬
    let asc = 0, desc = 0;
    lines.forEach((l) => {
      const m = ctx.measureText(l);
      asc = Math.max(asc, m.actualBoundingBoxAscent || size * 0.8);
      desc = Math.max(desc, m.actualBoundingBoxDescent || size * 0.1);
    });
    const blockH = asc + desc + lh * (lines.length - 1);
    const top = (h - blockH) / 2;
    const chars = []; // 글자별 잉크 상자 (캔버스 px) — 차가운 환경의 3D 글자가 글자 단위로 움직일 때 사용
    lines.forEach((l, i) => {
      const m = lineMetrics(ctx, l, size, st);
      const base = top + asc + i * lh;
      ctx.save();
      // 기준선 중앙을 원점으로: 가로 비율 + 기울기 (y 가 위로 갈수록 오른쪽으로)
      ctx.setTransform(st.scaleX || 1, 0, st.skew || 0, 1, w / 2, base);
      let x = -m.width / 2;
      m.chars.forEach((c, k) => {
        if (c.trim()) {
          const mm = ctx.measureText(c), pad = ((st.outline || 0) + (st.swell || 0)) * size * 0.5;
          const lx0 = x - (mm.actualBoundingBoxLeft || 0) - pad, lx1 = x + (mm.actualBoundingBoxRight || m.ws[k]) + pad;
          const ty0 = -(mm.actualBoundingBoxAscent || size * 0.8) - pad, ty1 = (mm.actualBoundingBoxDescent || 0) + pad;
          const sx = st.scaleX || 1, sk = st.skew || 0;
          const xs = [sx * lx0 + sk * ty0, sx * lx0 + sk * ty1, sx * lx1 + sk * ty0, sx * lx1 + sk * ty1].map((v) => v + w / 2);
          chars.push({ ch: c, line: i, x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: base + ty0, y1: base + ty1 });
        }
        if (st.outline) { ctx.lineWidth = st.outline * size; ctx.strokeText(c, x, 0); }
        else {
          ctx.fillText(c, x, 0);
          if (st.swell) { ctx.lineWidth = st.swell * size; ctx.strokeText(c, x, 0); }
        }
        x += m.ws[k] + m.tr;
      });
      ctx.restore();
    });
    // 물결 왜곡: 세로 띠를 사인 곡선으로 위아래 이동
    if (st.wave) {
      const copy = document.createElement('canvas');
      copy.width = w; copy.height = h;
      copy.getContext('2d').drawImage(cv, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const sw = Math.max(1, Math.round(w / 960));
      const period = st.wave.period * size, amp = st.wave.amp * size;
      for (let x = 0; x < w; x += sw) {
        const dy = amp * Math.sin((2 * Math.PI * x) / period);
        ctx.drawImage(copy, x, 0, sw, h, x, dy, sw, h);
      }
    }
    return { canvas: cv, sizeRatio: size / h, chars };
  };

  // Felzenszwalb–Huttenlocher 정확한 유클리드 거리 변환
  const INF = 1e20;
  function dt1(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  }
  function edt(isFeature, w, h) {
    const g = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = isFeature[i] ? 0 : INF;
    const n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = g[y * w + x];
      dt1(f, h, d, v, z);
      for (let y = 0; y < h; y++) g[y * w + x] = d[y];
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) f[x] = g[o + x];
      dt1(f, w, d, v, z);
      for (let x = 0; x < w; x++) out[o + x] = Math.min(Math.sqrt(d[x]), 1e4);
    }
    return out;
  }

  function valueNoise(w, h, rng, cell) {
    const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const gy = y / cell, iy = Math.floor(gy); let fy = gy - iy; fy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < w; x++) {
        const gx = x / cell, ix = Math.floor(gx); let fx = gx - ix; fx = fx * fx * (3 - 2 * fx);
        const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1], c = grid[(iy + 1) * gw + ix], d = grid[(iy + 1) * gw + ix + 1];
        out[y * w + x] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
      }
    }
    return out;
  }

  /*
   * text, 격자 크기, 출력 배율, 시드 → 시뮬레이션용 필드
   */
  DT.buildTextField = function (text, w, h, outScale, seed, style) {
    const lines = DT.splitLines(text);
    const sim = DT.drawGlyphCanvas(lines, w, h, null, style);
    const img = sim.canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const N = w * h;
    const mask = new Float32Array(N);
    const inside = new Uint8Array(N), outside = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const a = img[i * 4 + 3] / 255;
      mask[i] = a;
      inside[i] = a >= 0.5 ? 1 : 0;
      outside[i] = 1 - inside[i];
    }
    const dOut = edt(inside, w, h);   // 글자까지 거리 (글자 안 = 0)
    const dIn = edt(outside, w, h);   // 배경까지 거리 (글자 밖 = 0)
    let maxIn = 0;
    for (let i = 0; i < N; i++) if (dIn[i] > maxIn) maxIn = dIn[i];

    const nr = DT.mulberry32((seed ^ 0xA511E9B3) >>> 0);
    const n1 = valueNoise(w, h, nr, Math.max(8, Math.round(w / 34)));
    const n2 = valueNoise(w, h, nr, Math.max(4, Math.round(w / 110)));
    const noise = new Float32Array(N);
    for (let i = 0; i < N; i++) noise[i] = 0.62 * n1[i] + 0.38 * n2[i];

    // 외곽 링(씨앗 후보)과 주변 영역(빗방울 후보)
    const ring = [], near = [];
    for (let i = 0; i < N; i++) {
      if (!inside[i]) {
        if (dOut[i] <= 3) ring.push(i);
        if (dOut[i] <= 140 * (w / 960)) near.push(i);
      }
    }

    // 화면 출력용 고해상도 글자 (같은 글자 크기 비율로)
    const hi = DT.drawGlyphCanvas(lines, w * outScale, h * outScale, sim.sizeRatio, style);

    return {
      w, h, lines, text, scale: w / 960,
      mask, dOut, dIn, noise, maxIn,
      ring: Int32Array.from(ring), near: Int32Array.from(near),
      glyphHi: hi.canvas, outScale,
      chars: hi.chars,   // 글자별 잉크 상자 (출력 해상도 px)
    };
  };

  // 같은 시드 → 같은 초기 상태. 외곽 링에 불규칙한 반응 씨앗을 뿌린다.
  DT.createInitialState = function (field, seed) {
    const { w, h, ring, near, dOut, mask, noise } = field;
    const N = w * h;
    const U = new Float32Array(N).fill(1);
    const V = new Float32Array(N);
    const rng = DT.mulberry32(seed >>> 0);
    const s = field.scale;
    const stamp = (cx, cy, r, amp) => {
      const R = Math.ceil(r);
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= w || y >= h || dx * dx + dy * dy > r * r) continue;
          const i = y * w + x;
          if (mask[i] >= 0.5) continue;
          V[i] = Math.max(V[i], amp);
          U[i] = Math.min(U[i], 0.5);
        }
      }
    };
    if (ring.length) {
      const count = Math.max(40, Math.min(1800, Math.round(ring.length * 0.03)));
      for (let k = 0; k < count; k++) {
        const i = ring[Math.floor(rng() * ring.length)];
        // 노이즈가 낮은 곳은 건너뛰어 씨앗 분포를 불규칙하게
        const keep = rng();
        if (noise[i] < 0.35 && keep < 0.6) continue;
        const r = (1.2 + rng() * 2.6) * Math.max(0.6, s);
        stamp(i % w, Math.floor(i / w), r, 0.3 + 0.35 * rng());
      }
    }
    if (near.length) {
      const extra = Math.round(Math.max(10, ring.length * 0.006));
      for (let k = 0; k < extra; k++) {
        const i = near[Math.floor(rng() * near.length)];
        if (dOut[i] > 12 * s || noise[i] < 0.5) continue;
        stamp(i % w, Math.floor(i / w), 1.2 * Math.max(0.6, s), 0.45);
      }
    }
    return { U, V };
  };
})(window.DT = window.DT || {});
