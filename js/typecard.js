/*
 * Type 카드 (늘 보임) — 친 글자의 글꼴(표본) · 굵기(Mass) · Density(자간·줄 간격)를 고름. 돔의 층을 눌러 표본을 고름 (오른쪽 목록 · 키보드로도)
 *  레퍼런스(Sleep Score 카드): 흐린 유리 카드 + 가는 선 돔 + 오른쪽 점 목록 + 왼쪽 아래 큰 숫자
 *  돔의 층 하나 = 표본 하나 (위 → 아래 = S-01 → S-04). 고른 층이 굵은 링이 되고 그 위에 그 글꼴의 '가' (지금 굵기 live 로)
 *  Mass = 기준 굵기(base) 100 ~ 900. 오른쪽으로 갈수록 눈금이 두꺼워짐. 흰 원 = base, 바 아래 ▲ = 지금 굵기(live)
 *   굵기가 둘뿐인 글꼴(Galmuri · D2Coding)은 400 / 700 으로 맞춤
 *  Breathe (머리줄 토글): 켜면 굵기가 기온·습도에 따라 천천히 바뀜 (js/typing.js) — 큰 숫자 = live, 옆 작은 글자 = base
 *  Density = 0 ~ 100% 점선 바 (오른쪽일수록 점이 촘촘). 70% = 원래 모양
 *  고르면 앞으로 칠 글자 + 지금 치는(없으면 마지막으로 친) 글자에 바로 적용 (js/typing.js setFont · setDensity)
 *  수치는 DT.TYPECARD 에서 조절합니다.
 */
(function (DT) {
  'use strict';

  DT.TYPECARD = {
    dome: { cx: 60, base: 100, R: 56, H: 78, levels: [0.8, 0.58, 0.36, 0.14] },   // 돔 크기 · 층 높이 (위 → 아래)
    glyph: 30,                                                                      // 돔 위 '가' 크기 (px)
    ticks: 17,                                                                      // Mass 눈금 수
    barPad: 9,                                                                      // 바 양 끝 여백 (px)
    dots: { gap: [14, 4], r: [1.1, 1.6] },                                          // Density 점 간격 · 반지름 (왼쪽 성김 → 오른쪽 빽빽)
    densityStep: 0.05,                                                              // 화살표 키 · 휠 한 칸 (5%)
    names: { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' },
  };

  DT.createTypeCard = function (card, typing) {
    const TC = DT.TYPECARD, T = DT.TYPING, D = TC.dome, P = TC.barPad;
    const $ = (s) => card.querySelector(s);
    const dome = $('.ty-dome'), list = $('.ty-list'), bar = $('.ty-mass-bar'), dbar = $('.ty-dens-bar');
    const big = $('.ty-big'), baseEl = $('.ty-base'), liveMark = $('.ty-live'), densVal = $('.ty-dens-val'), breatheSw = $('.ty-breathe');
    const NS = 'http://www.w3.org/2000/svg';
    const svgOf = (el) => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('aria-hidden', 'true'); el.appendChild(s); return s; };
    const svgBar = svgOf(bar), svgDens = svgOf(dbar);
    let glyph = null;   // 돔 위 '가' (live 굵기로 매 프레임)

    // 오른쪽 목록 — 이름은 그 글꼴로
    const btns = T.fonts.map((f, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ty-item'; b.setAttribute('role', 'radio');
      b.innerHTML = `<i></i><span style='font-family:${f.family}'>${f.name}</span>`;
      b.title = `${f.no} · ${f.name}`;
      b.addEventListener('click', () => set(i, typing.font.weight));
      list.appendChild(b);
      return b;
    });
    list.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const i = (typing.font.face + d + T.fonts.length) % T.fonts.length;
      set(i, typing.font.weight); btns[i].focus();
    });

    // 돔을 누르면 그 높이에서 가장 가까운 층(표본)으로 — 마우스를 올린 층은 밝게
    let hov = -1;
    const layerAt = (e) => {
      const r = dome.getBoundingClientRect(), y = ((e.clientY - r.top) / Math.max(1, r.height)) * dome.viewBox.baseVal.height;
      let best = 0;
      D.levels.forEach((t, i) => { if (Math.abs(D.base - t * D.H - y) < Math.abs(D.base - D.levels[best] * D.H - y)) best = i; });
      return best;
    };
    dome.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); set(layerAt(e), typing.font.weight); });
    dome.addEventListener('pointermove', (e) => { const i = layerAt(e); if (i !== hov) { hov = i; render(); } });
    dome.addEventListener('pointerleave', () => { hov = -1; render(); });

    // Breathe 토글
    breatheSw.addEventListener('click', () => { typing.setBreathe(!typing.breathe); render(); });

    function drawDome(face, weight) {
      const thin = 'stroke="currentColor" stroke-opacity="0.5" stroke-width="0.7" fill="none"';
      const { cx, base, R, H } = D;
      let s = `<path d="M${cx - R} ${base} A ${R} ${H} 0 0 1 ${cx + R} ${base}" ${thin}/>`;
      for (const k of [0.62, 0.28]) s += `<path d="M${cx - R * k} ${base} A ${R * k} ${H} 0 0 1 ${cx + R * k} ${base}" ${thin} opacity="0.7"/>`;
      s += `<ellipse cx="${cx}" cy="${base}" rx="${R}" ry="${R * 0.24}" ${thin}/>`;
      D.levels.forEach((t, i) => {
        const r = R * Math.sqrt(1 - t * t), y = base - t * H;
        s += i === face
          ? `<ellipse cx="${cx}" cy="${y}" rx="${r}" ry="${r * 0.24}" fill="rgba(255,255,255,0.1)" stroke="currentColor" stroke-width="2.6"/>`
          : i === hov
            ? `<ellipse cx="${cx}" cy="${y}" rx="${r}" ry="${r * 0.24}" fill="rgba(255,255,255,0.06)" stroke="currentColor" stroke-opacity="0.95" stroke-width="1.4"/>`
            : `<ellipse cx="${cx}" cy="${y}" rx="${r}" ry="${r * 0.24}" ${thin}/>`;
      });
      const t = D.levels[face], r = R * Math.sqrt(1 - t * t), y = base - t * H, f = T.fonts[face];
      s += `<text x="${cx}" y="${y - r * 0.06}" text-anchor="middle" fill="currentColor" font-size="${TC.glyph}" font-weight="${weight}" style='font-family:${f.family}'>가</text>`;
      dome.innerHTML = s;
      glyph = dome.querySelector('text');
    }

    const massX = (w) => P + ((w - 100) / 800) * ((bar.clientWidth || 200) - 2 * P);
    function drawBar(face, weight) {
      const W = bar.clientWidth || 200, H = bar.clientHeight || 26, y = H / 2;
      const f = T.fonts[face], x = massX;
      let s = `<line x1="${P}" y1="${y}" x2="${W - P}" y2="${y}" stroke="currentColor" stroke-opacity="0.3"/>`;
      // 그 글꼴이 가진 굵기 범위만 또렷하게
      s += `<line x1="${x(f.weights[0])}" y1="${y}" x2="${x(f.weights[1])}" y2="${y}" stroke="currentColor" stroke-opacity="0.55"/>`;
      for (let i = 0; i < TC.ticks; i++) {
        const k = i / (TC.ticks - 1), w = 100 + k * 800, tw = 0.6 + k * 2.4, inRange = w >= f.weights[0] - 1 && w <= f.weights[1] + 1;
        s += `<rect x="${x(w) - tw / 2}" y="${y - 6}" width="${tw}" height="12" fill="currentColor" fill-opacity="${w <= weight ? 0.85 : inRange ? 0.4 : 0.15}"/>`;
      }
      s += `<circle cx="${x(weight)}" cy="${y}" r="7" fill="#fff"/><circle cx="${x(weight)}" cy="${y}" r="11" fill="none" stroke="currentColor" stroke-opacity="0.4"/>`;
      svgBar.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svgBar.innerHTML = s;
    }

    // Density 점선 — 왼쪽(0%) 성김 → 오른쪽(100%) 빽빽. 지금 값까지 진하게 + 흰 원 손잡이
    const densX = (d) => P + d * ((dbar.clientWidth || 200) - 2 * P);
    function drawDens(d) {
      const W = dbar.clientWidth || 200, H = dbar.clientHeight || 22, y = H / 2, G = TC.dots;
      let s = '';
      for (let x = P; x <= W - P + 0.1;) {
        const t = (x - P) / Math.max(1, W - 2 * P);
        s += `<circle cx="${x.toFixed(1)}" cy="${y}" r="${(G.r[0] + (G.r[1] - G.r[0]) * t).toFixed(2)}" fill="currentColor" fill-opacity="${t <= d + 0.001 ? 0.85 : 0.3}"/>`;
        x += G.gap[0] + (G.gap[1] - G.gap[0]) * t;
      }
      const kx = densX(d);
      s += `<circle cx="${kx}" cy="${y}" r="7" fill="#fff"/><circle cx="${kx}" cy="${y}" r="11" fill="none" stroke="currentColor" stroke-opacity="0.4"/>`;
      svgDens.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svgDens.innerHTML = s;
    }

    let shownVer = -1, shownLive = null, shownX = null;
    function render() {
      const { face, weight } = typing.font, f = T.fonts[face], d = typing.density, pct = Math.round(d * 100);
      shownVer = typing.version; shownLive = null; shownX = null;
      drawDome(face, Math.round(typing.live)); drawBar(face, weight); drawDens(d);
      btns.forEach((b, i) => { b.setAttribute('aria-checked', String(i === face)); b.tabIndex = i === face ? 0 : -1; });
      breatheSw.setAttribute('aria-checked', String(typing.breathe));
      baseEl.textContent = `base ${weight}`;
      bar.setAttribute('aria-valuemin', f.weights[0]); bar.setAttribute('aria-valuemax', f.weights[1]);
      bar.setAttribute('aria-valuenow', weight); bar.setAttribute('aria-valuetext', `base ${weight} ${TC.names[weight] || ''}`);
      densVal.textContent = `${pct}%`;
      dbar.setAttribute('aria-valuemin', 0); dbar.setAttribute('aria-valuemax', 100);
      dbar.setAttribute('aria-valuenow', pct); dbar.setAttribute('aria-valuetext', `${pct}% — ${pct >= 85 ? 'tight' : pct <= 40 ? 'loose' : 'normal'} spacing`);
      tick(true);
    }
    // 매 프레임 — live 굵기: 큰 숫자 · 돔 '가' · 바 아래 ▲ (바뀔 때만 손댐)
    function tick(once) {
      if (typing.version !== shownVer) render();   // 글자를 눌러 이어 치거나 아카이브를 불러와 값이 바뀜
      const live = typing.live, lv = Math.round(live);
      if (lv !== shownLive) {
        shownLive = lv;
        big.textContent = lv;
        if (glyph) glyph.setAttribute('font-weight', lv);
        big.title = `now ${lv} ${TC.names[Math.round(lv / 100) * 100] || ''}`;
      }
      const x = massX(live);
      if (shownX == null || Math.abs(x - shownX) > 0.2) { shownX = x; liveMark.style.transform = `translateX(${x.toFixed(1)}px)`; }
      if (once !== true) requestAnimationFrame(tick);
    }

    function set(face, weight) { typing.setFont(face, weight); render(); }
    function setD(d) { typing.setDensity(Math.min(1, Math.max(0, d))); render(); }

    // 끌기 (Mass · Density 같은 방식)
    function draggable(el, onX) {
      const fromX = (e) => { const r = el.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left - P) / Math.max(1, r.width - 2 * P))); };
      let pid = null;
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); pid = e.pointerId; el.focus({ preventScroll: true });
        try { el.setPointerCapture(pid); } catch (_) { /* 이미 끝난 포인터 — 끌기 없이 값만 */ }
        onX(fromX(e));
      });
      el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) onX(fromX(e)); });
      const up = (e) => { if (e.pointerId === pid) pid = null; };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    }
    draggable(bar, (k) => set(typing.font.face, 100 + k * 800));
    draggable(dbar, (k) => setD(Math.round(k * 100) / 100));

    // Mass 화살표 키 · 휠
    bar.addEventListener('keydown', (e) => {
      const { face, weight } = typing.font, f = T.fonts[face];
      const st = f.steps || null, i = st ? st.indexOf(weight) : -1;
      let w = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') w = st ? st[Math.min(st.length - 1, i + 1)] : weight + 100;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') w = st ? st[Math.max(0, i - 1)] : weight - 100;
      else if (e.key === 'Home') w = f.weights[0];
      else if (e.key === 'End') w = f.weights[1];
      if (w == null) return;
      e.preventDefault(); e.stopPropagation(); set(face, w);
    });
    bar.addEventListener('wheel', (e) => { e.preventDefault(); const { face, weight } = typing.font; set(face, weight + (e.deltaY < 0 ? 100 : -100) * (T.fonts[face].steps ? 3 : 1)); }, { passive: false });
    // Density 화살표 키(5%) · Home/End · 휠
    dbar.addEventListener('keydown', (e) => {
      const d = typing.density, s = TC.densityStep;
      let v = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = d + s;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = d - s;
      else if (e.key === 'Home') v = 0;
      else if (e.key === 'End') v = 1;
      if (v == null) return;
      e.preventDefault(); e.stopPropagation(); setD(v);
    });
    dbar.addEventListener('wheel', (e) => { e.preventDefault(); setD(typing.density + (e.deltaY < 0 ? 1 : -1) * TC.densityStep); }, { passive: false });

    // 웹폰트가 늦게 오면 돔의 '가' 와 목록을 다시 그림 · 카드 크기가 바뀌면 바 폭에 맞춰 다시 그림
    if (document.fonts) document.fonts.addEventListener('loadingdone', render);
    if (window.ResizeObserver) { const ro = new ResizeObserver(render); ro.observe(bar); ro.observe(dbar); }
    render();
    requestAnimationFrame(tick);
    return { render };
  };
})(window.DT = window.DT || {});
