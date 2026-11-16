/*
 * 타이포 — 네 가지 모드(미생물 · 기포 · 부식 · 사막화) 안에서 화면을 클릭하고 키보드로 치면 그 자리에 글자가 생김
 *
 *  글자 덩어리(entry)마다 '글자 모양 누끼 사진'을 만들어 각 모드에 사진처럼 넘김 → 그 모드의 재료로 글자가 그려짐
 *   · mask: 글자 모양 매트 { w, h, m(0~1) } — 미생물·기포·부식·사막화가 모두 이 모양 안에서만 생김
 *   · photo: 글자 안을 채운 무늬 캔버스 (부식 명암·사막화 팔레트·모래 색이 여기서 나옴)
 *   · lum: 무늬 밝기 격자 { w, h, l } (미생물 밝기·기포 대비)
 *  입력은 숨은 textarea 로 받음 → 한글 조합도 그대로. Enter = 줄바꿈, Esc = 입력 끝
 *  좌표 = 확대 전 프레임 CSS px (js/microbe.js 와 같음)
 *  글꼴(표본) · 굵기(Mass) · Density(자간·줄 간격)는 Type 카드에서 고름 (js/typecard.js). 글자 덩어리마다 따로 저장
 *  Breathe: 고른 굵기(base)는 기준값 — 화면의 굵기(live)는 기온·습도에 따라 천천히 바뀜 (더우면 가늘어지고, 습하면 부풂)
 *  고른 글자: 지금 치는(없으면 마지막으로 누른) 글자 덩어리에 테두리 + 모서리 손잡이 — 끌면 사진처럼 크기가 바뀜.
 *   이미 친 글자를 누르면 그 글자가 골라져 Type 카드(표본 · 굵기 · Density)가 그 글자에만 적용됨 → 글자마다 다른 타이포
 *  표본 라벨: Lab mode 에서 글자 덩어리 왼쪽 아래에 실험 기록표 같은 한 줄 (T-번호 · 표본 · 굵기 · 기온 · 습도 · 친 시각)
 *  수치는 DT.TYPING 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  DT.TYPING = {
    size: 0.13,                    // 글자 크기 (프레임 높이 대비, 화면 기준)
    sizeMin: 10, sizeMax: 0.8,     // 모서리 손잡이로 바꿀 수 있는 글자 크기 — 가장 작게(px) · 가장 크게(프레임 높이 대비)
    // 표본 글꼴 — weights: [가장 가는, 가장 굵은] · steps: 고를 수 있는 굵기만 (없으면 100 단위로 전부)
    fonts: [
      { no: 'S-01', name: 'Pretendard', family: '"Pretendard Polar", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif', weights: [100, 900] },
      { no: 'S-02', name: 'Noto Serif KR', family: '"Noto Serif KR", "Batang", "AppleMyungjo", serif', weights: [200, 900] },
      { no: 'S-03', name: 'Galmuri', family: '"Galmuri11", "Malgun Gothic", monospace', weights: [400, 700], steps: [400, 700] },
      { no: 'S-04', name: 'D2Coding', family: '"D2Coding Polar", "D2Coding", "Malgun Gothic", monospace', weights: [400, 700], steps: [400, 700] },
    ],
    face: 0,                       // 처음 표본 (fonts 의 번호)
    weight: 900,                   // 처음 굵기 (base)
    // Density (0~1) — 자간 · 줄 간격. 점 사이는 직선으로 이어 붙임 [density, 자간(em), 줄 간격(글자 크기 대비)]
    density: 0.7,                  // 처음 값
    plainDensity: 0.7,             // 자간 0 · 줄 간격 1.12 인 자리 (Density 가 없는 예전 저장본은 이 값으로)
    densityStops: [[0, 0.5, 1.7], [0.7, 0, 1.12], [1, -0.04, 0.95]],
    // Breathe — 목표 굵기 = base + 열 + 습도, 그 글꼴의 굵기 범위 안으로. 굵기가 둘뿐인 글꼴은 반응 없음
    breathe: true,                 // 처음엔 켜짐
    breath: {
      ref: 20, heat: -10,          // 기온이 ref °C 보다 높으면 1 °C 마다 heat (60 °C 에서 −400) — 증발하듯 가늘어짐
      humMid: 50, hum: 4,          // (습도 − humMid) × hum (100% 에서 +200, 0% 에서 −200) — 습하면 부풀고 건조하면 마름
      follow: 0.3,                 // live 가 1초에 남은 차이의 이만큼 목표 쪽으로
      step: 10, gap: 0.15,         // 매트 다시 만들기: 마지막으로 그린 굵기와 step 이상 다르고 + 마지막 build 뒤 gap 초 지났을 때만
      settle: 0.6,                 // 거의 다 따라오면 이 초 뒤 마지막 한 번 정확한 굵기로 다시 그림
    },
    lineBox: 1.12,                 // 마지막 줄 높이 (글자 크기 대비 — 줄 간격이 좁아도 아래가 잘리지 않게)
    pad: 0.12,                     // 글자 덩어리 둘레 여백 (글자 크기 대비)
    maskMax: 900,                  // 매트 해상도 상한 (긴 변 px)
    lumMax: 320,                   // 밝기 격자 상한 (긴 변 칸)
    // 글자 안 무늬 (위 → 아래 그라데이션 + 얼룩) — 모래 색·사막화 팔레트·부식 명암의 바탕
    tones: [[226, 196, 140], [176, 150, 92], [96, 128, 70], [58, 84, 52]],
  };

  DT.createTyping = function (frame, opts) {
    const T = DT.TYPING, B = T.breath;
    // { id, no(T-번호), born(처음 친 시각 ms), x, y(첫 줄 위쪽), size, text, face, weight(base), live, drawn(그린 굵기), density, builtAt, built: { rect, mask, lum, photo } }
    const entries = [];
    let nextId = 1, seq = 0, cur = null;
    const ta = document.createElement('textarea');
    ta.setAttribute('aria-label', 'Type text'); ta.autocomplete = 'off'; ta.spellcheck = false;
    Object.assign(ta.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', padding: '0', border: '0', resize: 'none', pointerEvents: 'none', zIndex: '-1', fontSize: '16px' });   // 16px: iOS 가 입력칸에 초점이 갈 때 화면을 확대하지 않게
    document.body.appendChild(ta);
    const caret = document.createElement('div');
    caret.className = 'type-caret'; caret.hidden = true;
    document.body.appendChild(caret);
    const labels = new Map();  // entry id → 라벨 DOM
    // 고른 글자 덩어리 테두리 + 모서리 손잡이 (사진처럼 끌어서 크기 조절). Type 카드도 이 글자에 적용됨
    const selBox = document.createElement('div');
    selBox.className = 'sel-box type-sel'; selBox.hidden = true;
    selBox.innerHTML = ['tl', 'tr', 'bl', 'br'].map((c) => `<i class="sel-h" data-c="${c}"></i>`).join('');
    document.body.appendChild(selBox);
    let drag = null;           // 크기 조절 중 { e, ax, ay(고정 모서리), r0(처음 rect), x0, y0, s0, f, pid, t }
    const mc = document.createElement('canvas').getContext('2d');
    const env = { T: B.ref, RH: B.humMid };   // 지금 기온 · 습도 (setEnv)
    let version = 0;           // 카드가 다시 그릴 때를 알도록 — 글꼴·굵기·Density·Breathe 가 바뀔 때마다 +1
    const faceOf = (e) => T.fonts[e.face] || T.fonts[0];
    const stepped = (face) => !!(T.fonts[face] || T.fonts[0]).steps;
    const fontOf = (e, px) => `${e.drawn} ${Math.max(1, Math.round(px))}px ${faceOf(e).family}`;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    let last = null;           // 마지막으로 친 글자 덩어리 — 글꼴을 바꾸면 이것도 같이 바뀜
    const active = () => cur || (entries.includes(last) ? last : null);
    // 고른 굵기를 그 글꼴이 가진 굵기로 맞춤
    function fitWeight(face, w) {
      const f = T.fonts[face] || T.fonts[0];
      if (f.steps) return f.steps.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
      return Math.min(f.weights[1], Math.max(f.weights[0], Math.round(w / 100) * 100));
    }
    // Breathe 목표 굵기 (그 글꼴의 범위 안)
    function targetOf(face, base) {
      if (!T.breathe || stepped(face)) return base;
      const f = T.fonts[face] || T.fonts[0];
      return clamp(base + Math.max(0, env.T - B.ref) * B.heat + (env.RH - B.humMid) * B.hum, f.weights[0], f.weights[1]);
    }
    // Density → 자간(em) · 줄 간격(배)
    function spacing(d) {
      const S = T.densityStops; d = clamp(d, 0, 1);
      let i = 1; while (i < S.length - 1 && d > S[i][0]) i++;
      const a = S[i - 1], b = S[i], t = (d - a[0]) / (b[0] - a[0]);
      return { ls: a[1] + (b[1] - a[1]) * t, lh: a[2] + (b[2] - a[2]) * t };
    }
    // 자간: ctx.letterSpacing 이 있으면 그것으로, 없으면 글자를 하나씩. 폭 = 글자 사이 자간만 포함 (끝 글자 뒤는 뺌)
    const native = 'letterSpacing' in mc;
    const trailing = native ? (() => { mc.font = '20px sans-serif'; mc.letterSpacing = '10px'; const a = mc.measureText('ab').width; mc.letterSpacing = '0px'; return a - mc.measureText('ab').width > 15; })() : false;
    const glyphs = (l) => Array.from(l);
    function lineWidth(g, l, ls) {
      if (!l) return 0;
      const n = glyphs(l).length;
      if (native) { g.letterSpacing = `${ls}px`; const w = g.measureText(l).width - (trailing ? ls : 0); g.letterSpacing = '0px'; return w; }
      let w = 0; for (const c of glyphs(l)) w += g.measureText(c).width;
      return w + ls * (n - 1);
    }
    function drawLine(g, l, x, y, ls) {
      if (native) { g.letterSpacing = `${ls}px`; g.fillText(l, x, y); g.letterSpacing = '0px'; return; }
      for (const c of glyphs(l)) { g.fillText(c, x, y); x += g.measureText(c).width + ls; }
    }
    // 웹폰트가 아직 안 받아졌으면 받은 뒤 다시 그림 (캔버스는 글꼴이 늦게 와도 저절로 다시 그려지지 않음)
    function ensureFont(e) {
      const f = fontOf(e, 40);
      if (!document.fonts || document.fonts.check(f, e.text)) return;
      document.fonts.load(f, e.text).then(() => { if (entries.includes(e) && document.fonts.check(f, e.text)) build(e); }, () => {});
    }

    function layout(e) {
      const lines = e.text.split('\n'), F = e.size, sp = spacing(e.density), lh = F * sp.lh, ls = F * sp.ls, pad = F * T.pad;
      mc.font = fontOf(e, F);
      const widths = lines.map((l) => lineWidth(mc, l, ls));
      return { lines, F, lh, ls, pad, widths, w: Math.max(F * 0.5, ...widths) + pad * 2, h: (lines.length - 1) * lh + F * T.lineBox + pad * 2 };
    }

    // 글자 → 매트 · 무늬 · 밝기 격자
    function build(e) {
      e.builtAt = performance.now();
      if (!e.text.trim()) { e.built = null; return; }
      ensureFont(e);
      const L = layout(e), k = Math.min(1, T.maskMax / Math.max(L.w, L.h));
      const w = Math.max(4, Math.round(L.w * k)), h = Math.max(4, Math.round(L.h * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.scale(k, k); g.font = fontOf(e, L.F); g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
      L.lines.forEach((l, i) => drawLine(g, l, L.pad, L.pad + i * L.lh + L.F * 0.86, L.ls));
      const a = g.getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) m[i] = a[i * 4 + 3] / 255;
      // 무늬: 위 → 아래 그라데이션 + 둥근 얼룩 (글자마다 같은 씨앗)
      const photo = document.createElement('canvas'); photo.width = w; photo.height = h;
      const pg = photo.getContext('2d');
      const grad = pg.createLinearGradient(0, 0, 0, h);
      T.tones.forEach((t, i) => grad.addColorStop(i / (T.tones.length - 1), `rgb(${t})`));
      pg.fillStyle = grad; pg.fillRect(0, 0, w, h);
      let s = e.id * 9973 + 1; const R = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 40; i++) {
        const t = T.tones[(R() * T.tones.length) | 0], x = R() * w, y = R() * h, r = (0.05 + R() * 0.25) * h;
        const rg = pg.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(${t},0.55)`); rg.addColorStop(1, `rgba(${t},0)`);
        pg.fillStyle = rg; pg.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const lk = Math.min(1, T.lumMax / Math.max(w, h)), lw = Math.max(2, Math.round(w * lk)), lh = Math.max(2, Math.round(h * lk));
      const lc = document.createElement('canvas'); lc.width = lw; lc.height = lh;
      const lg = lc.getContext('2d', { willReadFrequently: true }); lg.drawImage(photo, 0, 0, lw, lh);
      const px = lg.getImageData(0, 0, lw, lh).data, l = new Float32Array(lw * lh);
      for (let i = 0; i < lw * lh; i++) l[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
      e.built = { rect: [e.x, e.y - L.pad, L.w, L.h], mask: { w, h, m }, lum: { w: lw, h: lh, l }, photo };
    }

    function placeCaret() {
      if (!cur || !opts.active()) { caret.hidden = true; return; }
      const L = layout(cur), n = L.lines.length - 1;
      const cx = L.widths[n] + (L.lines[n] ? L.ls : 0);   // 다음 글자가 올 자리 (자간 포함)
      const [sx, sy, sc] = opts.toScreen(cur.x + L.pad + cx, cur.y + n * L.lh);   // 글자는 rect 왼쪽에서 pad 만큼 안쪽부터
      const sh = L.F * sc;
      caret.hidden = false;
      Object.assign(caret.style, { left: `${sx + 2}px`, top: `${sy + sh * 0.08}px`, height: `${sh * 0.95}px` });
      Object.assign(ta.style, { left: `${sx}px`, top: `${sy}px` });   // 한글 조합 창이 글자 옆에 뜨도록
    }

    // 표본 라벨 한 줄 — "T-03 · S-02 Noto Serif KR · 700→640 · 32° · 78% · 10:42"
    const two = (n) => String(n).padStart(2, '0');
    function labelOf(e) {
      const f = faceOf(e), live = Math.round(e.live);
      const w = T.breathe && !stepped(e.face) ? `${e.weight}→${live}` : `${e.weight}`;
      const t = Math.round(env.T), d = e.born ? new Date(e.born) : null;
      return `T-${two(e.no)} · ${f.no} ${f.name} · ${w} · ${t < 0 ? '−' : ''}${Math.abs(t)}° · ${Math.round(env.RH)}% · ${d ? `${two(d.getHours())}:${two(d.getMinutes())}` : '--:--'}`;
    }
    // 라벨 DOM — 글자 덩어리 왼쪽 아래 바로 밑 (확대·이동을 따라감), 화면 밖이면 숨김
    function placeLabels() {
      const show = opts.labels ? opts.labels() : false;
      for (const [id, el] of labels) if (!entries.some((e) => e.id === id && e.built)) { el.remove(); labels.delete(id); }
      if (!show) { for (const el of labels.values()) el.hidden = true; return; }
      for (const e of entries) {
        if (!e.built) continue;
        let el = labels.get(e.id);
        if (!el) { el = document.createElement('div'); el.className = 'type-label'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); labels.set(e.id, el); }
        const r = e.built.rect, pad = e.size * T.pad;
        const [sx, sy] = opts.toScreen(r[0] + pad, r[1] + r[3] - pad * 0.6);
        const s = labelOf(e);
        if (el.textContent !== s) el.textContent = s;
        const off = sx > innerWidth || sy > innerHeight || sy < -12 || sx + el.offsetWidth < 0;
        el.hidden = off;
        if (!off) el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      }
    }

    // 고른 글자 테두리 — 지금 치는(없으면 마지막으로 고른) 글자. 글자를 칠 수 있는 모드에서만
    function placeSel() {
      const e = active(), show = e && e.built && opts.active() && (!opts.shown || opts.shown());
      if (!show) { selBox.hidden = true; return; }
      const r0 = e.built.rect, r = drag && drag.e === e
        ? [drag.ax + (drag.r0[0] - drag.ax) * drag.f, drag.ay + (drag.r0[1] - drag.ay) * drag.f, drag.r0[2] * drag.f, drag.r0[3] * drag.f] : r0;
      const [x0, y0] = opts.toScreen(r[0], r[1]), [x1, y1] = opts.toScreen(r[0] + r[2], r[1] + r[3]);
      selBox.hidden = false;
      Object.assign(selBox.style, { left: `${x0}px`, top: `${y0}px`, width: `${Math.max(1, x1 - x0)}px`, height: `${Math.max(1, y1 - y0)}px` });
    }
    // 모서리 손잡이를 끌면 반대쪽 모서리를 고정한 채 글자 크기를 바꿈 (끄는 동안은 가끔만 다시 build — 무겁지 않게)
    const toFrame = (cx, cy) => { const o = opts.toScreen(0, 0); return [(cx - o[0]) / o[2], (cy - o[1]) / o[2]]; };
    selBox.addEventListener('pointerdown', (ev) => {
      const h = ev.target.closest && ev.target.closest('.sel-h'), e = active();
      if (!h || !e || !e.built || ev.button !== 0) return;
      ev.preventDefault(); ev.stopPropagation();
      const r = e.built.rect, c = h.dataset.c, sx = c.includes('r') ? 1 : -1, sy = c.includes('b') ? 1 : -1;
      drag = { e, ax: sx > 0 ? r[0] : r[0] + r[2], ay: sy > 0 ? r[1] : r[1] + r[3], r0: r.slice(), x0: e.x, y0: e.y, s0: e.size, f: 1, pid: ev.pointerId, t: 0 };
      try { h.setPointerCapture(ev.pointerId); } catch (_) { /* 이미 끝난 포인터 */ }
    });
    selBox.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.pid) return;
      const [fx, fy] = toFrame(ev.clientX, ev.clientY), d = drag, fh = frame.clientHeight || 600;
      d.f = Math.min(T.sizeMax * fh / d.s0, Math.max(T.sizeMin / d.s0, Math.max(Math.abs(fx - d.ax) / d.r0[2], Math.abs(fy - d.ay) / d.r0[3])));
      d.e.size = d.s0 * d.f; d.e.x = d.ax + (d.x0 - d.ax) * d.f; d.e.y = d.ay + (d.y0 - d.ay) * d.f;
      const now = performance.now();
      if (now - d.t > 60) { d.t = now; build(d.e); }
      placeSel(); placeCaret();
    });
    const dragEnd = (ev) => { if (!drag || ev.pointerId !== drag.pid) return; const e = drag.e; drag = null; build(e); placeSel(); placeCaret(); if (opts.onChange) opts.onChange(); };
    selBox.addEventListener('pointerup', dragEnd); selBox.addEventListener('pointercancel', dragEnd);

    function end() {
      if (cur && !cur.text.trim()) entries.splice(entries.indexOf(cur), 1);
      cur = null; caret.hidden = true; ta.blur();
    }
    ta.addEventListener('input', () => { if (!cur) return; cur.text = ta.value; last = cur; build(cur); placeCaret(); if (opts.onChange) opts.onChange(); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); end(); } e.stopPropagation(); });
    ta.addEventListener('blur', () => { if (cur) setTimeout(() => { if (document.activeElement !== ta) end(); }, 0); });

    // 글자 덩어리 안을 눌렀는지 (확대 전 프레임 px)
    function hit(x, y) {
      for (let i = entries.length - 1; i >= 0; i--) { const b = entries[i].built; if (b && x >= b.rect[0] && y >= b.rect[1] && x <= b.rect[0] + b.rect[2] && y <= b.rect[1] + b.rect[3]) return entries[i]; }
      return null;
    }
    function make(o) {
      const e = Object.assign({ id: nextId++, text: '', built: null, builtAt: 0 }, o);
      if (e.live == null) e.live = targetOf(e.face, e.weight);
      e.drawn = Math.round(e.live);
      return e;
    }

    let lastT = performance.now();
    return {
      /*
       * 클릭한 자리에서 입력 시작 (x, y = 확대 전 프레임 px, 클릭이 글자 높이의 가운데가 되도록), zoom = 지금 확대 배율
       *  이미 있는 글자를 누르면 그 글자에 이어서 침 (카드도 그 글자의 글꼴 · 굵기 · Density 로)
       */
      start(x, y, zoom) {
        const old = hit(x, y);
        if (cur && cur !== old && !cur.text.trim()) entries.splice(entries.indexOf(cur), 1);
        if (old) { cur = old; last = old; T.face = old.face; T.weight = old.weight; T.density = old.density; version++; }   // 이 글자를 고름 — Type 카드가 이 글자에 적용됨 (글자마다 다른 표본 · 굵기 · Density)
        else {
          const size = (frame.clientHeight || 600) * T.size / (zoom || 1);
          cur = make({ no: ++seq, born: Date.now(), x, y: y - size * 0.55, size, face: T.face, weight: fitWeight(T.face, T.weight), density: T.density });
          entries.push(cur);
        }
        ta.value = cur.text;
        try { ta.focus({ preventScroll: true }); } catch (e) { /* */ }   // 터치 기기: 누른 순간(사용자 동작 안)에 초점을 줘야 키보드가 뜸 (iOS)
        setTimeout(() => { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); placeCaret(); }, 0);
        placeCaret();
      },
      get editing() { return !!cur; },
      // 끌어 옮기기: (x, y) 의 글자 덩어리를 고름 (Type 카드도 그 글자로) — 없으면 null. 좌표 = 확대 전 프레임 px
      pick(x, y, any) {
        const e = any || opts.active() ? hit(x, y) : null;
        if (!e) return null;
        if (cur && cur !== e) end();
        last = e; T.face = e.face; T.weight = e.weight; T.density = e.density; version++;
        return e;
      },
      // 지금 고른 글자 덩어리 (치는 중이거나 마지막으로 고른 것) — 레이어 패널 · 글자별 Mix
      get current() { return active(); },
      keyOf: (e) => 'txt' + e.id,
      // 겹침 순서 (글자끼리): delta = +1 앞으로 · −1 뒤로 · ±Infinity 맨 앞/맨 뒤
      shiftLayer(e, delta) {
        const i = entries.indexOf(e); if (i < 0) return;
        const j = Math.max(0, Math.min(entries.length - 1, delta === Infinity ? entries.length - 1 : delta === -Infinity ? 0 : i + delta));
        if (j !== i) entries.splice(j, 0, entries.splice(i, 1)[0]);
      },
      layerOf(e) { return [entries.indexOf(e), entries.length]; },
      // 겹침 순서 맞추기 — keys = 'txt' + id 를 뒤 → 앞 순서로 (사진과 함께 쓰는 Layer 순서에서)
      setOrder(keys) { const pos = new Map(keys.map((k, i) => [k, i])), at = (e) => (pos.has('txt' + e.id) ? pos.get('txt' + e.id) : 1e9); entries.sort((a, b) => at(a) - at(b)); },
      // 글자 덩어리를 (x, y)(첫 줄 위쪽 왼쪽)로 옮김 — 매트는 그대로, 자리만
      moveTo(e, x, y) {
        const dx = x - e.x, dy = y - e.y;
        e.x = x; e.y = y;
        if (e.built) { e.built.rect[0] += dx; e.built.rect[1] += dy; }
        placeSel(); placeCaret();
        if (opts.onChange) opts.onChange();
      },
      // Type 카드: 지금 글꼴 · 굵기(base). setFont 는 앞으로 칠 글자 + 지금 치는(없으면 마지막으로 친) 글자에 적용
      get font() { return { face: T.face, weight: fitWeight(T.face, T.weight) }; },
      // 지금 굵기 (live) — 지금 치는(없으면 마지막으로 친) 글자의 것, 없으면 새로 칠 글자의 목표
      get live() { const e = active(); return e ? e.live : targetOf(T.face, fitWeight(T.face, T.weight)); },
      get version() { return version; },
      fitWeight,
      setFont(face, weight) {
        T.face = Math.min(T.fonts.length - 1, Math.max(0, face | 0));
        T.weight = fitWeight(T.face, weight);
        version++;
        const e = active();
        if (e) {
          const f = T.fonts[T.face], off = e.live - e.weight;   // 환경 때문에 벌어진 만큼은 그대로 두고 base 만 옮김
          e.face = T.face; e.weight = T.weight;
          e.live = stepped(e.face) || !T.breathe ? e.weight : clamp(e.weight + off, f.weights[0], f.weights[1]);
          e.drawn = Math.round(e.live); build(e); placeCaret();
        }
      },
      // Density (0~1) — 적용 범위는 setFont 와 같음
      get density() { return T.density; },
      setDensity(d) {
        T.density = clamp(Math.round(d * 100) / 100, 0, 1);
        version++;
        const e = active();
        if (e && e.density !== T.density) { e.density = T.density; build(e); placeCaret(); }
      },
      // Breathe 켜기/끄기 — 끄면 모든 글자가 바로 base 로
      get breathe() { return T.breathe; },
      setBreathe(on) {
        T.breathe = !!on; version++;
        if (!T.breathe) for (const e of entries) { e.live = e.weight; if (e.drawn !== e.weight) { e.drawn = e.weight; build(e); } }
      },
      // 매 프레임 앞에 — 지금 기온(°C) · 습도(%)
      setEnv(t, rh) { env.T = t; env.RH = rh; },
      // 각 모드에 사진처럼 넘길 목록: [{ key, rect, mask, lum, photo }]
      get photos() { return entries.filter((e) => e.built).map((e) => ({ key: 'txt' + e.id, rect: e.built.rect, mask: e.built.mask, lum: e.built.lum, photo: e.built.photo, fine: true })); },
      // 아카이브 포스터용 라벨 줄들
      labels() { return entries.filter((e) => e.built).map(labelOf); },
      // 매 프레임 — Breathe(live 가 목표를 따라감 · 필요할 때만 다시 build) · 캐럿 · 라벨 위치
      update() {
        const now = performance.now(), dt = Math.min(0.25, (now - lastT) / 1000), k = 1 - Math.pow(1 - B.follow, dt);
        lastT = now;
        for (const e of entries) {
          if (!e.text.trim()) continue;
          const tg = targetOf(e.face, e.weight);
          e.live = tg === e.weight && (!T.breathe || stepped(e.face)) ? tg : e.live + (tg - e.live) * k;
          const since = now - e.builtAt, diff = Math.abs(e.live - e.drawn);
          if ((diff >= B.step && since >= B.gap * 1000) || (diff >= 1 && Math.abs(tg - e.live) < 1 && since >= B.settle * 1000)) { e.drawn = Math.round(e.live); build(e); }
        }
        placeCaret(); placeLabels(); placeSel();
      },
      end,
      clear() { end(); entries.length = 0; last = null; seq = 0; placeLabels(); },
      // 되돌리기용: 글자 덩어리를 그대로(번호 · 만든 매트까지) 보관 / 되돌림 — 매트가 같아 각 모드가 같은 글자로 알아봄
      stash() { return { list: entries.filter((e) => e.text.trim()).map((e) => Object.assign({}, e, { built: e.built && Object.assign({}, e.built, { rect: e.built.rect.slice() }) })), nextId, seq, lastId: last && last.id }; },
      unstash(s) {
        end(); entries.length = 0;
        for (const e of s.list) entries.push(Object.assign({}, e, { built: e.built && Object.assign({}, e.built, { rect: e.built.rect.slice() }) }));
        nextId = Math.max(nextId, s.nextId); seq = s.seq;
        last = entries.find((e) => e.id === s.lastId) || entries[entries.length - 1] || null;
        version++; placeLabels(); placeSel();
      },
      // 같은지 비교용 (자리 · 크기 · 글자 · 글꼴)
      get sig() { return entries.filter((e) => e.text.trim()).map((e) => [e.id, Math.round(e.x), Math.round(e.y), Math.round(e.size), e.text, e.face, e.weight, e.density]); },
      // 아카이브 저장용: 친 글자 목록 (좌표는 확대 전 프레임 px + 그때의 프레임 너비)
      snapshot() { return { fw: frame.clientWidth || 1, breathe: T.breathe, list: entries.filter((e) => e.text.trim()).map((e) => ({ x: e.x, y: e.y, size: e.size, text: e.text, face: e.face, weight: e.weight, live: e.live, density: e.density, born: e.born, no: e.no })) }; },
      // 아카이브에서 불러오기: 지금 프레임 크기에 맞춰 비율 조정. 예전 저장본은 S-01 · 900 · Density 70% · Breathe 켬
      restore(snap) {
        end(); entries.length = 0; last = null; seq = 0;
        if (snap && snap.breathe != null) T.breathe = !!snap.breathe;
        version++;
        if (!snap || !snap.list) return;
        const k = (frame.clientWidth || 1) / (snap.fw || frame.clientWidth || 1);
        snap.list.forEach((s, i) => {
          const e = make({ no: s.no || i + 1, born: s.born || null, x: s.x * k, y: s.y * k, size: s.size * k, text: s.text, face: s.face || 0, weight: s.weight || 900, live: s.live != null ? s.live : null, density: s.density != null ? s.density : T.plainDensity });
          seq = Math.max(seq, e.no);
          build(e); entries.push(e);
        });
        last = entries[entries.length - 1] || null;
        if (last) { T.face = last.face; T.weight = last.weight; T.density = last.density; }   // 카드도 마지막 글자의 값으로
      },
    };
  };
})(window.DT = window.DT || {});
