/*
 * 휴대폰·태블릿(≤1000px) 아래 서랍 — 'Controls' 손잡이를 누르면 조절 카드가 펼쳐지고 다시 누르면 접힘 (css/mobile.css)
 *  접힌 상태: 손잡이 + 모드 상태바만 → 작품이 화면 대부분에 보임
 *  손잡이를 위·아래로 쓸어도 펼침·접힘. 데스크톱에서는 .sheet 가 상자 없이(display: contents) 그대로 대시보드 격자에 놓임
 */
(() => {
  'use strict';
  const sheet = document.getElementById('sheet'), btn = document.getElementById('sheetBtn'), stage = document.getElementById('stage');
  if (!sheet || !btn) return;
  const set = (open) => {
    sheet.dataset.open = open ? 'true' : 'false';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) sheet.scrollTop = 0;
    requestAnimationFrame(fit);
  };

  /*
   * 서랍을 펼치면 작품(16:10 프레임) 전체가 위 버튼줄·말풍선과 서랍 사이 빈 곳에 들어오게 줄임 — css/mobile.css 의 --fk(배율) · --fy(세로 이동)
   *  접으면 원래대로(화면 가득). 줄어드는 움직임이 끝나면 resize 를 알려 작품이 '보이는 영역'을 다시 계산하게 함 (화면 가장자리 성에 등)
   */
  const frame = document.getElementById('frame'), mobileQ = window.matchMedia ? matchMedia('(max-width: 1000px)') : null;
  let fitKey = '', focus = null;   // focus = 펼칠 때 정한 '보여 줄 영역' (프레임 안쪽 px) — 펼쳐 있는 동안 사진을 옮겨도 화면이 따라 움직이지 않게 고정
  // 보여 줄 영역: 놓인 사진들을 모두 감싸는 상자(+ 여백). 사진이 없으면 서랍을 펴기 전에 화면에 보이던 부분
  function focusBox() {
    const fw = frame.offsetWidth, fh = frame.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const boxes = (window.__DIFFUSE__ && window.__DIFFUSE__.photoBoxes) || [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, w, h] of boxes) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); }
    if (x0 === Infinity) { x0 = (fw - vw) / 2; y0 = (fh - vh) / 2; x1 = x0 + vw; y1 = y0 + vh; }
    const m = 0.06 * Math.max(x1 - x0, y1 - y0);   // 둘레 여백 (효과가 사진 밖으로 조금 번지는 것까지)
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(fw, x1 + m); y1 = Math.min(fh, y1 + m);
    return x1 - x0 < 20 || y1 - y0 < 20 ? [0, 0, fw, fh] : [x0, y0, x1 - x0, y1 - y0];
  }
  function fit() {
    if (!stage || !frame) return;
    const open = sheet.dataset.open === 'true' && (!mobileQ || mobileQ.matches);
    stage.dataset.sheet = open ? 'open' : 'closed';
    let k = 1, dx = 0, dy = 0;
    if (open) {
      if (!focus) focus = focusBox();
      const vw = window.innerWidth, vh = window.innerHeight, M = 8;
      let top = 0;
      for (const sel of ['.top-right', '#homeTab', '#tray', '#talk']) {
        const el = document.querySelector(sel);
        if (!el || el.hidden) continue;
        const r = el.getBoundingClientRect();
        if (r.height && r.bottom < vh * 0.6) top = Math.max(top, r.bottom);
      }
      const bottom = sheet.getBoundingClientRect().top;
      const availW = vw - 2 * M, availH = Math.max(60, bottom - top - 2 * M);
      const [bx, by, bw, bh] = focus, fw = frame.offsetWidth, fh = frame.offsetHeight;
      k = Math.min(1, availW / bw, availH / bh);
      // 상자 가운데가 빈 곳 가운데에 오게 (프레임은 화면 가운데를 기준으로 줄어듦)
      dx = vw / 2 - (vw / 2 + (bx + bw / 2 - fw / 2) * k);
      dy = top + M + availH / 2 - (vh / 2 + (by + bh / 2 - fh / 2) * k);
    } else focus = null;
    const key = k.toFixed(3) + '/' + dx.toFixed(0) + '/' + dy.toFixed(0);
    if (key === fitKey) return;
    fitKey = key;
    stage.style.setProperty('--fk', k.toFixed(4));
    stage.style.setProperty('--fx', dx.toFixed(1) + 'px');
    stage.style.setProperty('--fy', dy.toFixed(1) + 'px');
  }
  // 줄어들거나 커지는 움직임이 끝나면 앱에 알림 (보이는 영역 다시 계산)
  if (frame) frame.addEventListener('transitionend', (e) => { if (e.target === frame && e.propertyName === 'transform') window.dispatchEvent(new Event('resize')); });
  window.addEventListener('resize', () => requestAnimationFrame(fit));
  // 말풍선이 나타나거나 사라지면 빈 곳이 바뀜 — 펼쳐 있는 동안 가끔 다시 맞춤
  setInterval(() => { if (sheet.dataset.open === 'true') fit(); }, 600);
  // 손잡이 쓸기: 위로 = 펼침, 아래로 = 접힘 (쓸었으면 뒤따르는 click 은 무시)
  let y0 = null, swipedAt = -1e9;
  btn.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
  btn.addEventListener('pointerup', (e) => {
    if (y0 == null) return;
    const dy = e.clientY - y0; y0 = null;
    if (Math.abs(dy) > 24) { set(dy < 0); swipedAt = performance.now(); }
  });
  btn.addEventListener('click', () => { if (performance.now() - swipedAt > 500) set(sheet.dataset.open !== 'true'); });
  // 터치 화면: 사진 고르기 안내를 '누르기'로
  if (window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches) {
    const h = document.querySelector('.gal-hint');
    if (h) h.textContent = 'Tap a photo to place it. Add new photos with + — each is cut out once and kept.';
  }
  // 오프닝·아카이브로 가면 접어 둠
  if (stage) new MutationObserver(() => { if (stage.dataset.intro === 'on' || stage.dataset.archive === 'on') set(false); })
    .observe(stage, { attributes: true, attributeFilter: ['data-intro', 'data-archive'] });
})();
