/*
 * CPU 대체 엔진 — GPU 셰이더와 같은 Gray–Scott 계산을 저해상도 Float32Array 로 수행합니다.
 */
(function (DT) {
  'use strict';
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  DT.createCPUEngine = function (canvas, outScale) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available.');
    const st = { w: 0, h: 0, U: null, V: null, U2: null, V2: null, field: null };
    const base = document.createElement('canvas'), over = document.createElement('canvas');
    let ivoryGlyph = null;

    return {
      kind: 'cpu',
      label: 'CPU fallback (low resolution)',
      canvas,
      init(field, state) {
        st.w = field.w; st.h = field.h; st.field = field;
        st.U = Float32Array.from(state.U); st.V = Float32Array.from(state.V);
        st.U2 = new Float32Array(st.U.length); st.V2 = new Float32Array(st.V.length);
        canvas.width = field.w * outScale; canvas.height = field.h * outScale;
        base.width = over.width = field.w; base.height = over.height = field.h;
        // 아이보리 색 글자 레이어
        ivoryGlyph = document.createElement('canvas');
        ivoryGlyph.width = field.glyphHi.width; ivoryGlyph.height = field.glyphHi.height;
        const g = ivoryGlyph.getContext('2d');
        g.drawImage(field.glyphHi, 0, 0);
        g.globalCompositeOperation = 'source-in';
        const iv = DT.PALETTE.ivory;
        g.fillStyle = `rgb(${iv[0] * 255},${iv[1] * 255},${iv[2] * 255})`;
        g.fillRect(0, 0, ivoryGlyph.width, ivoryGlyph.height);
      },
      step(p, n, dropsAt) {
        const { w, h } = st, f = st.field;
        const mask = f.mask, dOut = f.dOut, dIn = f.dIn, noise = f.noise;
        for (let k = 0; k < n; k++) {
          const U = st.U, V = st.V, U2 = st.U2, V2 = st.V2;
          for (let y = 0; y < h; y++) {
            const ym = (y > 0 ? y - 1 : 0) * w, y0 = y * w, yp = (y < h - 1 ? y + 1 : h - 1) * w;
            for (let x = 0; x < w; x++) {
              const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : w - 1;
              const i = y0 + x;
              const u = U[i], v = V[i];
              const lu = 0.2 * (U[y0 + xp] + U[y0 + xm] + U[ym + x] + U[yp + x]) + 0.05 * (U[ym + xp] + U[ym + xm] + U[yp + xp] + U[yp + xm]) - u;
              const lv = 0.2 * (V[y0 + xp] + V[y0 + xm] + V[ym + x] + V[yp + x]) + 0.05 * (V[ym + xp] + V[ym + xm] + V[yp + xp] + V[yp + xm]) - v;
              const au = -(p.windX * (U[y0 + xp] - U[y0 + xm]) + p.windY * (U[yp + x] - U[ym + x])) * 0.5;
              const av = -(p.windX * (V[y0 + xp] - V[y0 + xm]) + p.windY * (V[yp + x] - V[ym + x])) * 0.5;
              const front = p.radius * (0.62 + 0.76 * noise[i]);
              const allow = 1 - smooth(front - p.feather, front + p.feather, dOut[i]);
              const kEff = p.K + 0.07 * (1 - allow);
              const uvv = u * v * v;
              let nu = u + (p.Du * lu - uvv + p.F * (1 - u) + au) * p.dt;
              let nv = v + (p.Dv * lv + uvv - (p.F + kEff) * v + av) * p.dt;
              const prot = smooth(p.protect, p.protect + 1.5, dIn[i]);
              const kill = Math.max(prot, 1 - smooth(0, 0.08, allow)) * 0.3;
              nu += (1 - nu) * kill; nv -= nv * kill;
              U2[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
              V2[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
            }
          }
          const drops = dropsAt ? dropsAt(k) : null;
          if (drops) {
            for (const d of drops) {
              const R = Math.ceil(d[2]);
              for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                const x = d[0] + dx, y = d[1] + dy;
                if (x < 0 || y < 0 || x >= w || y >= h || dx * dx + dy * dy >= d[2] * d[2]) continue;
                const i = y * w + x;
                if (mask[i] >= 0.5) continue;
                V2[i] = Math.max(V2[i], 0.5); U2[i] = Math.min(U2[i], 0.5);
              }
            }
          }
          st.U = U2; st.V = V2; st.U2 = U; st.V2 = V;
        }
      },
      render(r) {
        const { w, h, V } = st, P = DT.PALETTE, f = st.field;
        const bctx = base.getContext('2d'), octx = over.getContext('2d');
        const bimg = bctx.createImageData(w, h), oimg = octx.createImageData(w, h);
        const bd = bimg.data, od = oimg.data;
        const teal = mix3(P.teal, P.warmTeal, r.warmth), lime = mix3(P.lime, P.warmLime, r.warmth);
        const lo = 0.10 - r.softness * 0.05, hi = 0.34 + r.softness * 0.10;
        const op = r.opacity == null ? 1 : r.opacity, glyphMix = r.glyphMix || 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x, v = V[i];
            const gx = V[y * w + Math.min(w - 1, x + 1)] - V[y * w + Math.max(0, x - 1)];
            const gy = V[Math.min(h - 1, y + 1) * w + x] - V[Math.max(0, y - 1) * w + x];
            const body = smooth(lo, hi, v) * op;
            let pc = mix3(P.deep, teal, smooth(0.08, 0.26, v));
            pc = mix3(pc, lime, smooth(0.27, 0.48, v));
            const shade = Math.min(1, Math.max(0, 0.5 + (gx + gy) * 2.2));
            const k = (0.7 + 0.6 * shade) * r.contrast;
            const ux = (x + 0.5) / w - 0.5, uy = (y + 0.5) / h - 0.5;
            const vig = 0.6 + 0.45 * smooth(1.3, 0.2, Math.hypot(ux * 1.6, uy));
            const mem = 1 - body * (1 - body) * 4 * 0.22;
            const o = i * 4;
            for (let c = 0; c < 3; c++) {
              const ty = (y + 0.5) / h;
              const bgc = (P.bgTop[c] + (P.bgBot[c] - P.bgTop[c]) * ty) * vig;
              bd[o + c] = 255 * Math.min(1, (bgc + (pc[c] * k - bgc) * body) * mem);
            }
            bd[o + 3] = 255;
            // 외곽 침식 레이어 (글자 위에 덮어 그림)
            const eaten = smooth(0.16, 0.34, v) * (1 - smooth(r.protect, r.protect + 1.5, f.dIn[i]));
            if (eaten > 0.001 && f.mask[i] > 0.01) {
              od[o] = bd[o]; od[o + 1] = bd[o + 1]; od[o + 2] = bd[o + 2]; od[o + 3] = 255 * eaten;
            }
          }
        }
        bctx.putImageData(bimg, 0, 0);
        octx.putImageData(oimg, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
        if (glyphMix > 0) {
          ctx.globalAlpha = glyphMix;
          ctx.drawImage(ivoryGlyph, 0, 0, canvas.width, canvas.height);
          ctx.drawImage(over, 0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1;
        }
      },
      readV() { return Float32Array.from(st.V); },
      isLost() { return false; },
    };
  };
})(window.DT = window.DT || {});
