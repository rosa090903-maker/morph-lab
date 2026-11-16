/*
 * 휴대폰·태블릿(≤1000px) 아래 서랍 — 'Controls' 손잡이를 누르면 조절 카드가 펼쳐지고 다시 누르면 접힘 (css/mobile.css)
 *  접힌 상태: 손잡이 + 모드 상태바만 → 작품이 화면 대부분에 보임
 *  손잡이를 위·아래로 쓸어도 펼침·접힘. 데스크톱에서는 .sheet 가 상자 없이(display: contents) 그대로 대시보드 격자에 놓임
 */
(() => {
  'use strict';
  const sheet = document.getElementById('sheet'), btn = document.getElementById('sheetBtn');
  if (!sheet || !btn) return;
  const set = (open) => {
    sheet.dataset.open = open ? 'true' : 'false';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) sheet.scrollTop = 0;
  };
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
  const stage = document.getElementById('stage');
  if (stage) new MutationObserver(() => { if (stage.dataset.intro === 'on' || stage.dataset.archive === 'on') set(false); })
    .observe(stage, { attributes: true, attributeFilter: ['data-intro', 'data-archive'] });
})();
