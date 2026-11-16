/*
 * 성에 글자 — '성에' 모드에서 오른쪽 클릭한 자리에 친 글자(js/typing.js)를 얼음 점으로 그림
 *
 *  글자 모양 매트 안에 흩뜨린 격자로 점을 깔고, 점마다 나타나는 문턱값이 달라 '맺히듯' 차오름
 *   - 성에 모드인데 아직 따뜻함(−10 °C 위): 옅게 김 서린 정도 (frostK = warm)
 *   - −10 °C 이하: 끝까지 빽빽하게 얼어붙음, 아주 약한 바람 흔들림 + 반짝임
 *   - 다른 모드로 바뀌면 서서히 사라짐 (글자는 남아 그 모드의 재료가 됨)
 *  좌표 = 확대 전 프레임 CSS px (js/microbe.js 와 같음), 휠 확대는 setView 로 맞춤
 *  수치는 DT.FROSTTYPE 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  DT.FROSTTYPE = {
    spacing: 2.3,        // 점 간격 (프레임 px)
    dot: [0.55, 1.3],    // 점 반지름 범위 (프레임 px)
    warm: 0.32,          // 성에 모드 · 아직 따뜻할 때 차오르는 정도 (0~1)
    grow: 7,             // 얼어붙을 때 다 차기까지(초)
    fade: 1.6,           // 녹거나 모드가 바뀌어 사라지기까지(초)
    edge: 1.8,           // 글자 윤곽 근처 점을 더 밝게 (윤곽에서 몇 px 까지)
    maxDpr: 1.5,
  };

  DT.createFrostType = function (canvas, frame) {
    const F = DT.FROSTTYPE;
    const ctx = canvas.getContext('2d');
    let dpr = 1, W = 1, H = 1, vz = 1, vox = 0, voy = 0, time = 0, k = 0;
    const cache = new Map();   // key → { mask, rect, dots: Float32Array [x, y, r, th, ph, edge] }

    function resize() {
      dpr = Math.min(F.maxDpr, window.devicePixelRatio || 1);
      W = frame.clientWidth || 1; H = frame.clientHeight || 1;
      const w = Math.round(W * dpr), h = Math.round(H * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    resize();

    // 매트 안에 흩뜨린 격자로 점 배치 (매트·위치가 바뀔 때만 다시)
    function sample(p) {
      const [rx, ry, rw, rh] = p.rect, M = p.mask, sp = F.spacing;
      let s = 0x9E3779B9 ^ (String(p.key).length * 7919); const R = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      const at = (u, v) => M.m[Math.min(M.h - 1, Math.max(0, (v * M.h) | 0)) * M.w + Math.min(M.w - 1, Math.max(0, (u * M.w) | 0))];
      const eu = F.edge / rw, ev = F.edge / rh, out = [];
      for (let y = sp / 2; y < rh; y += sp) {
        for (let x = sp / 2; x < rw; x += sp) {
          const jx = x + (R() - 0.5) * sp, jy = y + (R() - 0.5) * sp, u = jx / rw, v = jy / rh;
          if (at(u, v) < 0.5) continue;
          const edge = Math.min(at(u - eu, v), at(u + eu, v), at(u, v - ev), at(u, v + ev)) < 0.5 ? 1 : 0;
          out.push(rx + jx, ry + jy, F.dot[0] + (F.dot[1] - F.dot[0]) * R() * R(), edge ? R() * 0.6 : R(), R() * 6.283, edge);   // 윤곽 점이 먼저 맺힘
        }
      }
      return Float32Array.from(out);
    }

    function draw(fade) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (fade < 0.01 || !cache.size) return;
      ctx.setTransform(dpr * vz, 0, 0, dpr * vz, dpr * vox, dpr * voy);
      // 두 겹: 막 맺힌 점 = 옅고 큰 서리(흐림) → 윤곽·자리 잡은 점 = 또렷한 얼음 점
      for (const pass of [0, 1]) {
        ctx.beginPath();
        for (const c of cache.values()) {
          const d = c.dots;
          for (let i = 0; i < d.length; i += 6) {
            if (d[i + 3] > k || (pass === 1) !== (d[i + 5] > 0 || d[i + 3] < k * 0.55)) continue;
            const wob = Math.sin(time * 0.9 + d[i + 4]) * 0.35 * k;   // 아주 약한 바람 흔들림
            const r = d[i + 2] * (pass ? 1 : 1.9) * (0.55 + 0.45 * Math.min(1, (k - d[i + 3]) * 6));
            ctx.moveTo(d[i] + wob + r, d[i + 1]); ctx.arc(d[i] + wob, d[i + 1], r, 0, 6.2832);
          }
        }
        ctx.fillStyle = pass ? 'rgba(236,246,255,0.92)' : 'rgba(170,205,240,0.38)';
        ctx.globalAlpha = fade * (pass ? 0.85 + 0.1 * Math.sin(time * 1.7) : 1);   // 아주 느린 반짝임
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    return {
      canvas,
      resize,
      setView(z, ox, oy) { vz = z; vox = ox; voy = oy; },
      // photos: [{ key, rect(프레임 px), mask }] — 친 글자 목록 (js/typing.js photos)
      sync(photos) {
        const keep = new Set();
        for (const p of photos) {
          keep.add(p.key);
          const c = cache.get(p.key);
          if (!c || c.mask !== p.mask || c.rect.join() !== p.rect.join()) cache.set(p.key, { mask: p.mask, rect: p.rect.slice(), dots: sample(p) });
        }
        for (const key of cache.keys()) if (!keep.has(key)) cache.delete(key);
      },
      /*
       * dt: 흐른 시간(초), on: 성에 모드인지, frozen: 얼어붙는 조건(−10 °C 이하 등)인지
       */
      update(dt, on, frozen) {
        time += dt;
        const target = on ? (frozen ? 1 : F.warm) : 0;
        k += target > k ? Math.min(target - k, dt / F.grow) : -Math.min(k - target, dt / F.fade);
        draw(Math.min(1, k / 0.08));
      },
      get amount() { return k; },
    };
  };
})(window.DT = window.DT || {});
