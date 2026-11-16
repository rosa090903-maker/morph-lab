/*
 * 점 레이어 — 글자를 이루는 작은 점들 + 환경별 배경 입자
 * 텍스트(또는 환경)가 바뀌면 점들이 흩어진 곳/이전 글자에서 날아와 새 글자 모양으로 모입니다.
 * 모두 모이면(settled) 그 외곽에서 Gray–Scott 패턴이 자라기 시작합니다.
 *
 * 점 스타일: glow(별빛) · crisp(얼음 결정) · soft(습기 머금은 빛) · sand(모래알) · bubble(물방울)
 * 점 움직임: breathe · frozen · sway · shimmer(열 아지랑이) · bob(물결)
 * 배경 입자: stars · snow · rain(+안개) · sand(모래바람) · ocean(거품+빛줄기)
 */
(function (DT) {
  'use strict';

  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const rgbStr = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

  // 고해상도 글자 알파에서 지터 격자로 점 위치를 뽑음 (시드 고정)
  DT.sampleGlyphPoints = function (glyphCanvas, seed) {
    const P = DT.CONFIG.particles;
    const w = glyphCanvas.width, h = glyphCanvas.height;
    const a = glyphCanvas.getContext('2d').getImageData(0, 0, w, h).data;
    let area = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i] > 127) area++;
    if (!area) return [];
    const scale = w / 1920;
    const s = Math.max(P.minSpacing * scale, Math.sqrt(area / P.maxDots));
    const rng = DT.mulberry32((seed ^ 0x2545F491) >>> 0);
    const pts = [];
    for (let y = s * 0.5; y < h; y += s) {
      for (let x = s * 0.5; x < w; x += s) {
        const jx = x + (rng() - 0.5) * s * 0.9, jy = y + (rng() - 0.5) * s * 0.9;
        const r = s * P.dotSize * (0.65 + 0.7 * rng() * rng());
        const b = 0.55 + 0.45 * rng();
        const ix = Math.round(jx), iy = Math.round(jy);
        if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
        if (a[(iy * w + ix) * 4 + 3] > 127) pts.push({ x: jx, y: jy, r, b });
      }
    }
    return pts;
  };

  // 점 스프라이트 (64px). [위치, 불투명도] 정지점 목록
  const SPRITE_STOPS = {
    glow: [[0, 1], [0.3, 0.95], [0.42, 0.28], [1, 0]],
    crisp: [[0, 1], [0.42, 1], [0.5, 0.25], [0.62, 0]],
    soft: [[0, 1], [0.2, 0.85], [0.5, 0.3], [1, 0]],
    sand: [[0, 1], [0.45, 0.95], [0.58, 0]],
    bubble: [[0, 0.06], [0.36, 0.16], [0.47, 0.95], [0.56, 0.3], [0.7, 0]],
  };
  // 스프라이트 크기 대비 점 반지름 (코어 끝이 점 반지름이 되도록)
  const SPRITE_SCALE = { glow: 5.6, crisp: 4.2, soft: 5.6, sand: 3.8, bubble: 4.6 };

  function makeSprite(style, color) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [o, a] of SPRITE_STOPS[style] || SPRITE_STOPS.glow) grd.addColorStop(o, rgbStr(color, a));
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  DT.createParticleLayer = function (canvas) {
    const ctx = canvas.getContext('2d');
    const P = DT.CONFIG.particles, S = DT.CONFIG.starfield;
    let W = 0, H = 0, scale = 1, time = 0, gatherT = 0, settled = true;
    let dotFade = 1, dotFadeT = 1, dotFadeRate = 1.1; // 글자 점 전체 밝기 (성에가 글자를 대신할 때 사라짐)
    let parts = [], amb = [], extra = [];
    let scene = null, dots = { style: 'glow', color: P.color, size: 1, motion: 'breathe' }, ambType = 'stars';
    let sprite = makeSprite('glow', P.color);
    const mistSprite = document.createElement('canvas');
    mistSprite.width = mistSprite.height = 128;
    {
      const g = mistSprite.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(120,170,120,0.125)'); grd.addColorStop(1, 'rgba(120,170,120,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    }

    function makeAmbient() {
      amb = []; extra = [];
      const R = Math.random;
      if (ambType === 'stars') {
        if (!S.enabled) return;
        const rng = DT.mulberry32(0x51A7F00D); // 하늘은 고정
        for (let i = 0; i < S.count; i++) {
          amb.push({ x: rng() * W, y: rng() * H, r: (0.5 + rng() * 0.9) * scale,
            a: S.maxAlpha * (0.15 + 0.85 * Math.pow(rng(), 2.5)), tw: rng() * Math.PI * 2, sp: 0.2 + rng() * 0.9 });
        }
      } else if (ambType === 'snow') {
        for (let i = 0; i < 130; i++) amb.push({ x: R() * W, y: R() * H, r: (0.7 + R() * 1.7) * scale, vy: (14 + R() * 26) * scale, ph: R() * 6.28, a: 0.25 + R() * 0.45 });
      } else if (ambType === 'rain') {
        for (let i = 0; i < 150; i++) amb.push({ x: R() * W, y: R() * H, len: (16 + R() * 34) * scale, vy: (700 + R() * 450) * scale, a: 0.06 + R() * 0.12 });
        for (let i = 0; i < 6; i++) extra.push({ x: R() * W, y: H * (0.2 + R() * 0.7), r: (260 + R() * 320) * scale, vx: (5 + R() * 12) * scale, a: 0.03 + R() * 0.04 });
      } else if (ambType === 'sand') {
        for (let i = 0; i < 200; i++) amb.push({ x: R() * W, y: R() * H, r: (0.5 + R() * 1.1) * scale, vx: -(160 + R() * 320) * scale, ph: R() * 6.28, a: 0.12 + R() * 0.35 });
      } else if (ambType === 'ocean') {
        for (let i = 0; i < 70; i++) amb.push({ x: R() * W, y: R() * H, r: (1.4 + R() * 4.2) * scale, vy: -(16 + R() * 42) * scale, ph: R() * 6.28, a: 0.15 + R() * 0.35 });
        for (let i = 0; i < 5; i++) extra.push({ x: (0.1 + R() * 0.9) * W, w: (60 + R() * 140) * scale, ph: R() * 6.28, a: 0.03 + R() * 0.03 });
      }
    }

    function updateAmbient(dt) {
      for (const p of amb) {
        if (ambType === 'snow') {
          p.y += p.vy * dt; p.x += (-10 * scale + Math.sin(time * 0.8 + p.ph) * 8 * scale) * dt;
          if (p.y > H + 4) { p.y = -4; p.x = Math.random() * W; }
          if (p.x < -4) p.x = W + 4;
        } else if (ambType === 'rain') {
          p.y += p.vy * dt; p.x += p.vy * 0.06 * dt;
          if (p.y > H + p.len) { p.y = -p.len; p.x = Math.random() * W; }
        } else if (ambType === 'sand') {
          p.x += p.vx * dt; p.y += Math.sin(time * 3 + p.ph) * 12 * scale * dt;
          if (p.x < -10) { p.x = W + 10; p.y = Math.random() * H; }
        } else if (ambType === 'ocean') {
          p.y += p.vy * dt; p.x += Math.sin(time * 1.3 + p.ph) * 10 * scale * dt;
          if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
        }
      }
      if (ambType === 'rain') for (const m of extra) { m.x += m.vx * dt; if (m.x - m.r > W) m.x = -m.r; }
    }

    function drawAmbient() {
      const col = dots.color;
      if (ambType === 'stars') {
        ctx.fillStyle = 'rgb(214,224,255)';
        for (const s of amb) {
          ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(time * s.sp + s.tw));
          ctx.fillRect(s.x - s.r * 0.5, s.y - s.r * 0.5, s.r, s.r);
        }
      } else if (ambType === 'snow') {
        ctx.fillStyle = 'rgb(230,240,255)';
        for (const p of amb) { ctx.globalAlpha = p.a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      } else if (ambType === 'rain') {
        for (const m of extra) { // 안개: 미리 그린 스프라이트를 크게 늘려 그림
          ctx.globalAlpha = m.a * 8; ctx.drawImage(mistSprite, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
        }
        ctx.strokeStyle = 'rgb(200,235,210)'; ctx.lineWidth = 1 * scale + 0.3;
        for (const p of amb) {
          ctx.globalAlpha = p.a; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len * 0.06, p.y + p.len); ctx.stroke();
        }
      } else if (ambType === 'sand') {
        ctx.strokeStyle = rgbStr(col, 1); ctx.lineWidth = 1 * scale + 0.2;
        for (const p of amb) {
          ctx.globalAlpha = p.a;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.018, p.y); ctx.stroke();
        }
      } else if (ambType === 'ocean') {
        for (const b of extra) {
          const sx = b.x + Math.sin(time * 0.25 + b.ph) * 40 * scale;
          const g = ctx.createLinearGradient(0, 0, 0, H * 0.9);
          g.addColorStop(0, `rgba(150,220,255,${b.a})`); g.addColorStop(1, 'rgba(150,220,255,0)');
          ctx.globalAlpha = 1; ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(sx - b.w * 0.3, 0); ctx.lineTo(sx + b.w * 0.3, 0);
          ctx.lineTo(sx + b.w * 0.3 - H * 0.25, H * 0.9); ctx.lineTo(sx - b.w * 1.2 - H * 0.25, H * 0.9); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = 'rgb(170,235,255)'; ctx.lineWidth = 0.9 * scale + 0.2;
        for (const p of amb) { ctx.globalAlpha = p.a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    }

    // 정착한 점의 환경별 미세 움직임 (그리기 위치에만 적용)
    function motion(p) {
      const s = scale;
      switch (dots.motion) {
        case 'frozen': return [0, 0];
        case 'sway': return [Math.sin(time * 1.2 + p.ty * 0.012) * 1.6 * s, Math.cos(time * 0.9 + p.tx * 0.01) * 1.0 * s];
        case 'shimmer': return [Math.sin(time * 9 + p.ty * 0.09) * 1.1 * s, 0];
        case 'bob': return [Math.sin(time * 0.7 + p.ty * 0.008) * 1.4 * s, Math.sin(time * 1.1 + p.tx * 0.006) * 3.0 * s];
        default: return [Math.sin(time * 0.7 + p.tw) * 0.35 * s, 0];
      }
    }

    const layer = {
      canvas,
      underlay: null,
      wind: null,   // () => {w, gust} — 차가운 환경의 바람 (app.js 가 frost 에 연결)
      floatK: null, // () => 0~1 — 부유 움직임 세기 (사진은 얼었을 때만 떠 있음)
      resize(w, h) {
        if (w === W && h === H) return;
        canvas.width = W = w; canvas.height = H = h;
        scale = w / 1920;
        makeAmbient();
      },
      get count() { return parts.filter((p) => !p.dying).length; },
      get sceneId() { return scene ? scene.id : null; },
      settled() { return settled; },

      setScene(sc) {
        scene = sc;
        dots = Object.assign({ style: 'glow', color: P.color, size: 1, motion: 'breathe' }, sc.dots);
        sprite = makeSprite(dots.style, dots.color);
        ambType = sc.ambient || 'stars';
        if (W) makeAmbient();
      },

      // 새 목표 점 배치. scatter=true 면 모든 점을 흩어진 위치에서 다시 모음(리셋)
      setTargets(pts, seed, scatter) {
        const rng = DT.mulberry32((seed ^ 0x68E31DA4) >>> 0);
        const spawn = (p) => {
          p.x = (rng() * 1.3 - 0.15) * W; p.y = (rng() * 1.3 - 0.15) * H;
          const ang = rng() * Math.PI * 2, sp = (10 + rng() * 30) * scale;
          p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
          p.a = 0;
        };
        const live = parts.filter((p) => !p.dying).sort((a, b) => a.x - b.x);
        const targets = pts.slice().sort((a, b) => a.x - b.x);
        const n = targets.length;
        const keep = [];
        if (live.length > n) {
          // 균등하게 n 개만 남기고 나머지는 흩어져 사라짐
          const chosen = new Set();
          for (let i = 0; i < n; i++) chosen.add(Math.floor((i + 0.5) * live.length / n));
          live.forEach((p, i) => { if (chosen.has(i)) keep.push(p); else layer.releaseOne(p, rng); });
        } else keep.push.apply(keep, live);
        while (keep.length < n) { const p = {}; spawn(p); keep.push(p); }
        keep.sort((a, b) => a.x - b.x);
        for (let i = 0; i < n; i++) {
          const p = keep[i], t = targets[i];
          if (scatter) spawn(p);
          p.tx = t.x; p.ty = t.y; p.r = t.r; p.b = t.b;
          p.delay = rng() * P.stagger;
          p.tw = rng() * Math.PI * 2;
          p.eat = p.eat || 0; p.eatT = 0;
          p.dying = false;
        }
        parts = parts.filter((p) => p.dying).concat(keep);
        gatherT = 0;
        dotFadeT = 1; dotFadeRate = 2.5;
        settled = n === 0;
      },
      releaseOne(p, rng) {
        p.dying = true;
        const r = rng || Math.random;
        const ang = r() * Math.PI * 2, sp = (20 + r() * 60) * scale;
        p.vx = (p.vx || 0) * 0.3 + Math.cos(ang) * sp;
        p.vy = (p.vy || 0) * 0.3 + Math.sin(ang) * sp;
      },
      release() {
        parts.forEach((p) => { if (!p.dying) layer.releaseOne(p); });
        settled = true;
      },

      update(dt) {
        dt = Math.min(dt, 1 / 30);
        time += dt; gatherT += dt;
        dotFade += (dotFadeT - dotFade) * Math.min(1, dt * dotFadeRate);
        updateAmbient(dt);
        let all = true;
        const K = P.spring, Cd = P.damping, sw = P.swirl;
        for (const p of parts) {
          if (p.dying) {
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.a -= dt / P.fadeOut;
            continue;
          }
          p.eat += (p.eatT - p.eat) * Math.min(1, dt * 2);
          if (gatherT < p.delay) {
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.a += (0.25 - p.a) * Math.min(1, dt * 2);
            all = false;
            continue;
          }
          const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
          const f = d / (d + 120 * scale);
          p.vx += (K * dx - Cd * p.vx - sw * dy * f) * dt;
          p.vy += (K * dy - Cd * p.vy + sw * dx * f) * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.a += (1 - p.a) * Math.min(1, dt * 2.2);
          if (!(d < 0.8 * scale + 0.3 && Math.hypot(p.vx, p.vy) < 8 * scale)) all = false;
        }
        parts = parts.filter((p) => !p.dying || p.a > 0);
        if (all || gatherT > P.maxGather) settled = true;
      },

      // 외곽 침식: 패턴이 테두리를 먹은 곳의 점은 흐려짐
      applyErosion(V, field, protect) {
        const w = field.w, h = field.h, os = field.outScale;
        for (const p of parts) {
          if (p.dying) continue;
          const x = Math.min(w - 1, Math.max(0, Math.round(p.tx / os - 0.5)));
          const y = Math.min(h - 1, Math.max(0, Math.round(p.ty / os - 0.5)));
          const i = y * w + x;
          p.eatT = smooth(0.16, 0.34, V[i]) * (1 - smooth(protect, protect + 1.5, field.dIn[i]));
        }
      },
      clearErosion() { for (const p of parts) p.eatT = 0; },
      // 글자 점 전체를 target 밝기로 천천히 (0 = 사라짐, 1 = 기본)
      fadeDots(target, rate) { dotFadeT = target; dotFadeRate = rate || 1.1; },

      draw() {
        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        drawAmbient();
        /*
         * 글자 움직임 = 부유 + 바람
         *  부유(scene.float): 서로 다른 느린 주기의 사인을 겹쳐 반복이 드러나지 않게, 아주 작은 진폭으로
         *  바람(layer.wind → {w 세기 0~1, gust 돌풍 0~1}): 바람 방향으로 밀림 · 아주 미세한 기울어짐/쏠림 ·
         *    세기의 제곱에 비례하는 잔떨림 (약한 바람에서는 거의 없고, 강풍에서만 긴장감 있게)
         */
        const fl = scene && scene.float;
        let mdx = 0, mdy = 0, rot = 0, sk = 0;
        if (fl) {
          const A = fl.amp * scale * (layer.floatK ? layer.floatK() : 1), s = fl.speed;
          mdx = A * (0.6 * Math.sin(time * s * 1.0 + 0.3) + 0.4 * Math.sin(time * s * 1.73 + 2.1));
          mdy = A * (0.65 * Math.sin(time * s * 0.81 + 1.2) + 0.35 * Math.sin(time * s * 1.37 + 4.0));
        }
        const wd = fl && layer.wind ? layer.wind() : null;
        if (wd && wd.w > 0.001) {
          const w = wd.w, g = wd.gust, W2 = w * w;
          mdx += -w * 14 * scale * g;                 // 바람 방향(왼쪽)으로 밀림
          mdy += w * 3 * scale * g;
          rot += -w * 0.016 * g;                      // 최대 약 0.9° 기울어짐
          sk += -w * 0.03 * g;                        // 윗부분이 더 밀리는 쏠림
          const tr = W2 * 0.8 * scale;                // 잔떨림 (최대 0.8px)
          mdx += tr * (0.6 * Math.sin(time * 41) + 0.4 * Math.sin(time * 67 + 1));
          mdy += tr * 0.6 * Math.sin(time * 53 + 2);
          rot += W2 * 0.0025 * Math.sin(time * 29 + 0.5);
        }
        const glyphMove = { dx: mdx, dy: mdy };
        if (layer.underlay) layer.underlay(ctx, 'fixed', glyphMove); // 창 테두리 성에·그림자·바람결 (유리에 고정)
        ctx.save();
        if (fl) {
          ctx.translate(W / 2 + mdx, H / 2 + mdy);
          if (rot || sk) { ctx.rotate(rot); ctx.transform(1, 0, sk, 1, 0, 0); }
          ctx.translate(-W / 2, -H / 2);
        }
        if (layer.underlay) layer.underlay(ctx, 'float', glyphMove); // 얼음 글자 + 성에 (frost.js) — 함께 떠 있고 바람을 맞음
        ctx.globalCompositeOperation = dots.style === 'sand' ? 'source-over' : 'lighter';
        const k = SPRITE_SCALE[dots.style] || 5.6;
        const tw = dots.motion === 'frozen' ? 3.2 : 1.6; // 얼음은 날카롭게 반짝임
        for (const p of parts) {
          let a = Math.max(0, p.a) * p.b * (1 - p.eat * 0.85) * (0.86 + 0.14 * Math.sin(time * tw + p.tw)) * (p.dying ? 1 : dotFade);
          if (a <= 0.004) continue;
          const [ox, oy] = p.dying ? [0, 0] : motion(p);
          const size = p.r * k * dots.size;
          ctx.globalAlpha = Math.min(1, a);
          ctx.drawImage(sprite, p.x + ox - size / 2, p.y + oy - size / 2, size, size);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },

      // SVG 용 벡터 원 (반짝임·움직임 없이 기본 밝기)
      toSVG() {
        const out = [];
        const stops = SPRITE_STOPS[dots.style] || SPRITE_STOPS.glow;
        const c = dots.color.map((v) => Math.round(v * 255)).join(',');
        out.push('<defs><radialGradient id="dot">' +
          stops.map(([o, a]) => `<stop offset="${o}" stop-color="rgb(${c})" stop-opacity="${a}"/>`).join('') +
          '</radialGradient></defs>');
        if (ambType === 'stars' || ambType === 'snow') {
          out.push(`<g fill="${ambType === 'stars' ? 'rgb(214,224,255)' : 'rgb(230,240,255)'}">`);
          for (const s of amb) out.push(`<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${(ambType === 'stars' ? s.r * 0.56 : s.r).toFixed(2)}" fill-opacity="${s.a.toFixed(3)}"/>`);
          out.push('</g>');
        } else if (ambType === 'ocean') {
          out.push('<g fill="none" stroke="rgb(170,235,255)">');
          for (const s of amb) out.push(`<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(2)}" stroke-opacity="${s.a.toFixed(3)}"/>`);
          out.push('</g>');
        }
        const k = SPRITE_SCALE[dots.style] || 5.6;
        out.push('<g fill="url(#dot)">');
        for (const p of parts) {
          if (p.dying) continue;
          const a = Math.max(0, p.a) * p.b * (1 - p.eat * 0.85) * dotFade;
          if (a <= 0.01) continue;
          out.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(p.r * k * dots.size / 2).toFixed(2)}" fill-opacity="${Math.min(1, a).toFixed(3)}"/>`);
        }
        out.push('</g>');
        return out.join('\n');
      },
    };
    return layer;
  };
})(window.DT = window.DT || {});
