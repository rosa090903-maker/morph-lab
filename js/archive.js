/*
 * 아카이브 — 셔터로 찍은 장면을 '배양 접시 포스터'로 보관 (레퍼런스: Alliance for Biosolutions 포스터)
 *  - 포스터: 연회색 바탕 · 위에 점 세 개 · 두 줄 제목(측정 항목 / 조건) · 가운데 둥근 유리 접시 안에 찍은 장면 · 아래 큰 숫자 + 단위
 *  - 아카이브 창: 검은 바탕에 펼친 책자 — 표지 · 목차 다음 쪽마다 샘플 하나 (← → · 휠로 넘김) — 비어 있으면 가운데 큰 'Archive.'
 *  - 포스터를 누르면 크게 봄 (← → 넘기기, 내려받기, 삭제, Esc 닫기)
 *  - 'Edit': 찍을 때의 본 화면(Mix·기온·습도·산소·색·사진·글자)을 그대로 불러와 다시 편집
 *  - 브라우저 IndexedDB 에 저장 → 앱을 다시 켜도 남아 있음 (못 쓰면 이번 실행 동안만)
 */
(function (DT) {
  'use strict';

  const DB_NAME = 'polar-archive', STORE = 'shots';
  const PW = 1470, PH = 1960, S = PW / 735;   // 포스터 크기 (레퍼런스 735×980 의 2배)
  const DISH = { x: 367.5, y: 490, r: 212 };  // 레퍼런스 좌표 기준
  const BG = '#e4e6e7', INK = '#111214';
  const FONT = '"Inter Tight", "Helvetica Neue", "Segoe UI", Arial, sans-serif';
  const THUMB = 176;                          // 고리 카드의 접시 썸네일 지름(px)
  const SHOT = 1400;                          // 책자 쪽 그림으로 함께 보관하는 장면 크기 (긴 변 px)
  const SPEC = { y: 744, head: 10, size: 8.5, gap: 13, max: 5 };   // 'Type specimens' 기록 (레퍼런스 좌표 · 글자 크기 · 줄 간격 · 최대 줄 수)

  // ---------- IndexedDB (실패하면 null → 메모리에만) ----------
  function openDB() {
    return new Promise((resolve) => {
      try {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  function tx(db, mode, fn) {
    if (!db) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : null);
        t.onerror = t.onabort = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  // ---------- 그리기 ----------
  // 찍은 장면에서 가운데 정사각형을 잘라 지름 d 의 원(유리 접시)으로 그림 — 바탕은 투명
  function drawDish(g, src, cx, cy, r) {
    const side = Math.min(src.width, src.height), sx = (src.width - side) / 2, sy = (src.height - side) / 2;
    // 접시 그림자
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.16)'; g.shadowBlur = r * 0.09; g.shadowOffsetY = r * 0.03;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = '#d9dcdd'; g.fill();
    g.restore();
    // 안쪽: 장면
    g.save();
    g.beginPath(); g.arc(cx, cy, r * 0.975, 0, Math.PI * 2); g.clip();
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, sx, sy, side, side, cx - r, cy - r, r * 2, r * 2);
    // 유리 가장자리의 옅은 굴절 그늘
    const v = g.createRadialGradient(cx, cy, r * 0.82, cx, cy, r);
    v.addColorStop(0, 'rgba(255, 255, 255, 0)'); v.addColorStop(0.85, 'rgba(255, 255, 255, 0.08)'); v.addColorStop(1, 'rgba(255, 255, 255, 0.32)');
    g.fillStyle = v; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.restore();
    // 테두리: 바깥 회색 선 · 유리 띠 · 안쪽 선
    g.save();
    g.lineWidth = r * 0.028; g.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    g.beginPath(); g.arc(cx, cy, r * 0.988, 0, Math.PI * 2); g.stroke();
    g.lineWidth = r * 0.005; g.strokeStyle = 'rgba(110, 116, 122, 0.55)';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(120, 126, 132, 0.35)';
    g.beginPath(); g.arc(cx, cy, r * 0.972, 0, Math.PI * 2); g.stroke();
    // 왼쪽 위 반사광
    const hl = g.createLinearGradient(cx - r, cy - r, cx, cy);
    hl.addColorStop(0, 'rgba(255, 255, 255, 0.95)'); hl.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.lineWidth = r * 0.012; g.strokeStyle = hl; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, r * 0.955, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
    g.restore();
  }

  function setSpacing(g, em, px) { if ('letterSpacing' in g) g.letterSpacing = (em * px).toFixed(2) + 'px'; }

  // stats: { title, sub, value, unit, specimens?: [친 글자 라벨 줄] }
  function renderPoster(src, stats) {
    const c = document.createElement('canvas'); c.width = PW; c.height = PH;
    const g = c.getContext('2d');
    g.fillStyle = BG; g.fillRect(0, 0, PW, PH);
    // 위: 점 세 개 (첫 점은 반쯤 옅게)
    const dy = 74 * S, dr = 6 * S, dx = 367.5 * S;
    const lg = g.createLinearGradient(dx - 12 * S - dr, 0, dx - 12 * S + dr, 0);
    lg.addColorStop(0, 'rgba(17, 18, 20, 0.08)'); lg.addColorStop(1, INK);
    g.fillStyle = lg; g.beginPath(); g.arc(dx - 12 * S, dy, dr, 0, Math.PI * 2); g.fill();
    g.fillStyle = INK;
    g.beginPath(); g.arc(dx, dy, dr, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(dx + 12 * S, dy, dr, 0, Math.PI * 2); g.fill();
    // 두 줄 제목 — 측정 항목 / 실험 조건(기온·습도·산소). 둘 다 검정으로 크게 (넓으면 줄임)
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const line = (txt, size, y) => {
      let fs = size;
      g.font = `400 ${fs}px ${FONT}`; setSpacing(g, -0.01, fs);
      const w = g.measureText(txt).width, maxW = 640 * S;
      if (w > maxW) { fs *= maxW / w; g.font = `400 ${fs}px ${FONT}`; setSpacing(g, -0.01, fs); }
      g.fillStyle = INK; g.fillText(txt, PW / 2, y);
    };
    line(stats.title, 20 * S, 140 * S);
    line(stats.sub, 20 * S, 172 * S);
    // 접시
    drawDish(g, src, DISH.x * S, DISH.y * S, DISH.r * S);
    // 접시 아래: Type specimens — 친 글자마다 표본 라벨 한 줄 (많으면 앞의 몇 줄 + '+N more')
    const sp = stats.specimens || [];
    if (sp.length) {
      const rows = sp.length > SPEC.max ? sp.slice(0, SPEC.max - 1).concat(`+${sp.length - SPEC.max + 1} more`) : sp;
      const small = (txt, size, y, a) => {
        let fs = size;
        g.font = `400 ${fs}px ${FONT}`; setSpacing(g, 0.01, fs);
        const w = g.measureText(txt).width, maxW = 600 * S;
        if (w > maxW) { fs *= maxW / w; g.font = `400 ${fs}px ${FONT}`; setSpacing(g, 0.01, fs); }
        g.fillStyle = `rgba(17, 18, 20, ${a})`; g.fillText(txt, PW / 2, y);
      };
      small('Type specimens', SPEC.head * S, SPEC.y * S, 1);
      rows.forEach((r, i) => small(r, SPEC.size * S, (SPEC.y + SPEC.gap * (i + 1.15)) * S, 0.62));
    }
    // 아래: 큰 숫자 + 단위 (둘을 묶어 가운데 정렬)
    g.textAlign = 'left';
    let fs = 122 * S;
    g.font = `400 ${fs}px ${FONT}`; setSpacing(g, -0.045, fs);
    let nw = g.measureText(stats.value).width;
    const maxW = 470 * S;
    if (nw > maxW) { fs *= maxW / nw; g.font = `400 ${fs}px ${FONT}`; setSpacing(g, -0.045, fs); nw = g.measureText(stats.value).width; }
    const us = 11 * S, gap = 16 * S;
    g.font = `400 ${us}px ${FONT}`; setSpacing(g, -0.01, us);
    const uw = g.measureText(stats.unit).width;
    const x0 = (PW - (nw + gap + uw)) / 2, base = 920 * S;
    g.fillStyle = INK; g.font = `400 ${fs}px ${FONT}`; setSpacing(g, -0.045, fs);
    g.fillText(stats.value, x0, base);
    g.font = `400 ${us}px ${FONT}`; setSpacing(g, -0.01, us);
    g.fillText(stats.unit, x0 + nw + gap, base - fs * 0.66);
    return c;
  }

  DT.renderArchivePoster = renderPoster;   // 점검용 (콘솔·하네스)

  function renderThumb(src) {
    const c = document.createElement('canvas'); c.width = c.height = THUMB;
    drawDish(c.getContext('2d'), src, THUMB / 2, THUMB / 2, THUMB / 2 - 6);
    return c.toDataURL('image/png');
  }

  const toBlob = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image generation failed'))), 'image/jpeg', 0.93));
  const pad = (n, k = 2) => String(n).padStart(k, '0');
  const stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fileStamp = (t) => { const d = new Date(t); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };

  /*
   * opts: { root, rail, back, stage, view, img, meta, prev, next, save, del, close, load, onLoad(scene, no) }
   *  scene = 찍을 때의 본 화면 상태 (Mix·환경·사진·글자 — js/app.js captureScene). 있으면 'Edit' 로 본 화면에 다시 불러와 편집
   */
  DT.createArchive = function (opts) {
    const items = [];   // { id, no, created, blob, thumb, stats, scene, url }
    let db = null, seq = 0, cur = -1, loaded = null;
    const fontReady = (document.fonts && document.fonts.load) ? document.fonts.load(`400 ${122 * S}px "Inter Tight"`).catch(() => {}) : Promise.resolve();
    const urlOf = (it) => it.url || (it.url = URL.createObjectURL(it.blob));
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /*
     * 책자 (레퍼런스: 미생물 도감 'Microorganisms — Visual Research') — 검은 바탕에 펼친 흰 두 쪽
     *  첫 쪽 = 표지 · 목차, 그다음 쪽마다 샘플 하나 (최신 것부터). 쪽 배치는 번갈아: 둥근 접시 · 네모 · 둥근 접시 · 한 면 가득(흰 원 안에 설명)
     *  쪽마다: 위 작은 머리글 · 쪽 번호 / 큰 그림 (흑백 · 초록 톤 — 올리면 원래 색) / 왼쪽 아래 이름 · 모드 / ⓘ 설명 / Edit · Poster · Save · Remove
     *  넘기기: ← → 키 · 휠 · 아래 화살표 · 쪽을 누름 — 종이가 넘어가듯 3D 로 뒤집힘
     */
    const LAYOUTS = ['circle', 'square', 'circle', 'bleed'];
    const book = document.createElement('div'); book.className = 'book';
    const pgL = document.createElement('div'), pgR = document.createElement('div');
    pgL.className = 'pg pg-l'; pgR.className = 'pg pg-r';
    book.append(pgL, pgR);
    const nav = document.createElement('div'); nav.className = 'book-nav';
    nav.innerHTML = '<button type="button" class="book-arrow" data-d="-1" title="Previous pages (←)" aria-label="Previous pages"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button><span class="book-folio" aria-live="polite"></span><button type="button" class="book-arrow" data-d="1" title="Next pages (→)" aria-label="Next pages"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg></button>';
    opts.rail.append(book, nav);
    let spread = 0, flipping = false, pages = [];
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 그림: 새로 찍은 것은 깨끗한 장면(shot), 예전 것은 포스터의 접시 부분을 잘라 씀
    function shotUrl(it) {
      if (it.shotUrl) return Promise.resolve(it.shotUrl);
      if (it.shot) return Promise.resolve(it.shotUrl = URL.createObjectURL(it.shot));
      if (!it.shotP) it.shotP = createImageBitmap(it.blob).then((bm) => {
        const side = Math.round(DISH.r * S * 2 * 0.96), c = document.createElement('canvas'); c.width = c.height = side;
        c.getContext('2d').drawImage(bm, DISH.x * S - side / 2, DISH.y * S - side / 2, side, side, 0, 0, side, side);
        return new Promise((res) => c.toBlob((b) => res(it.shotUrl = b ? URL.createObjectURL(b) : urlOf(it)), 'image/jpeg', 0.9));
      }).catch(() => urlOf(it));
      return it.shotP;
    }
    function buildPages() {
      pages = [{ kind: 'cover' }];
      for (let i = items.length - 1; i >= 0; i--) pages.push({ kind: 'item', it: items[i] });
      if (pages.length % 2) pages.push({ kind: 'blank' });
    }
    const spreads = () => Math.max(1, pages.length / 2);
    const head = (left, idx) => `<div class="pg-head"><span>${left}</span><span>${pad(idx + 1, 3)}</span></div>`;
    // 쪽 하나의 내용
    function pageEl(idx) {
      const P = pages[idx], el = document.createElement('div');
      el.className = 'pg-c';
      if (!P || P.kind === 'blank') { el.innerHTML = P ? head('polar v2 — archive', idx) : ''; return el; }
      if (P.kind === 'cover') {
        const rows = pages.map((q, k) => q.kind === 'item' ? `<li><button type="button" data-p="${k}"><span>No. ${pad(q.it.no, 3)}</span><span>${esc(q.it.stats.title)}</span><span>${pad(k + 1, 3)}</span></button></li>` : '').join('');
        el.classList.add('cover');
        el.innerHTML = head('polar v2 — archive', idx) +
          `<h2 class="cv-title">Archive of<br>Samples.</h2>` +
          `<p class="cv-sub">${items.length} specimen${items.length === 1 ? '' : 's'} — grown, frozen, corroded and dried on photographs and type.</p>` +
          `<ol class="cv-index">${rows}</ol>`;
        el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); go(Math.floor(+b.dataset.p / 2)); }));
        return el;
      }
      const it = P.it, no = pad(it.no, 3), st = it.stats || {}, layout = LAYOUTS[(it.no - 1) % LAYOUTS.length], tone = layout === 'square' ? 'green' : 'mono';
      const mode = it.scene && it.scene.label ? it.scene.label : 'Poster only';
      const sp = st.specimens && st.specimens.length ? `<div><dt>Type</dt><dd>${st.specimens.slice(0, 3).map(esc).join('<br>')}${st.specimens.length > 3 ? `<br>+${st.specimens.length - 3} more` : ''}</dd></div>` : '';
      const nPh = it.scene && it.scene.photos ? it.scene.photos.length : 0, nTx = it.scene && it.scene.text && it.scene.text.list ? it.scene.text.list.length : 0;
      const info = `<div class="pg-info"><span class="pg-i" aria-hidden="true">i</span><dl>` +
        `<div><dt>No.</dt><dd>${no}</dd></div>` +
        `<div><dt>Mode</dt><dd>${esc(mode)}</dd></div>` +
        (st.sub ? `<div><dt>Conditions</dt><dd>${esc(st.sub)}</dd></div>` : '') +
        `<div><dt>Result</dt><dd>${esc(st.value)} ${esc(st.unit)}</dd></div>` +
        (it.scene ? `<div><dt>Material</dt><dd>${nPh} photo${nPh === 1 ? '' : 's'} · ${nTx} type</dd></div>` : '') +
        `<div><dt>Captured</dt><dd>${stamp(it.created)}</dd></div>` + sp + `</dl></div>`;
      const cap = `<div class="pg-cap"><b>${esc(st.title)}</b><i>${esc(mode)}</i></div>`;
      el.classList.add('item', layout, tone);
      el.innerHTML = head(`polar v2 — ${esc(mode).toLowerCase()} — no. ${no}`, idx) +
        `<button type="button" class="pg-fig" title="${it.scene ? `Use sample No. ${no} again` : `Open poster No. ${no}`}" aria-label="${it.scene ? 'Use sample' : 'Open poster'} No. ${no}"><img alt="${esc(st.title)} — No. ${no}"></button>` +
        (layout === 'bleed' ? `<div class="pg-hole">${cap}${info}</div>` : cap + info) +
        `<div class="pg-acts"><button type="button" data-a="edit"${it.scene ? '' : ' disabled'}>Edit</button><button type="button" data-a="view">Poster</button><button type="button" data-a="save">Save</button><button type="button" data-a="del">Remove</button></div>`;
      const img = el.querySelector('img');
      // 어두운 장면(검은 바탕)은 음화로 — 레퍼런스처럼 흰 종이 위 어두운 표본 (올리면 원래 색)
      if (it.dark) el.classList.add('neg');
      img.addEventListener('load', () => {
        if (it.dark == null) {
          const c = document.createElement('canvas'); c.width = c.height = 24;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0, 24, 24);
          const px = g.getImageData(0, 0, 24, 24).data; let s = 0;
          for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          it.dark = s / (px.length / 4) / 255 < 0.38;
        }
        el.classList.toggle('neg', it.dark);
      }, { once: true });
      shotUrl(it).then((u) => { img.src = u; });
      el.querySelector('.pg-fig').addEventListener('click', (e) => { e.stopPropagation(); it.scene ? load(it) : show(items.indexOf(it)); });
      el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const a = b.dataset.a;
        if (a === 'edit') load(it); else if (a === 'view') show(items.indexOf(it)); else if (a === 'save') download(it); else remove(it);
      }));
      return el;
    }
    function fillPage(slot, idx) { slot.replaceChildren(pageEl(idx)); }
    function renderSpread() {
      spread = Math.min(spread, spreads() - 1);
      fillPage(pgL, spread * 2); fillPage(pgR, spread * 2 + 1);
      const n = items.length, a = spread * 2 + 1, b = spread * 2 + 2;
      nav.querySelector('.book-folio').textContent = `${pad(a, 3)}–${pad(b, 3)}  /  ${pad(pages.length, 3)}`;
      nav.querySelector('[data-d="-1"]').disabled = spread <= 0;
      nav.querySelector('[data-d="1"]').disabled = spread >= spreads() - 1;
      opts.root.dataset.empty = n ? 'false' : 'true';
    }
    function renderRail() { buildPages(); renderSpread(); }
    // 넘기기 — 앞으로: 오른쪽 쪽이 왼쪽으로 넘어감 (앞면 = 지금 오른쪽 쪽, 뒷면 = 다음 왼쪽 쪽) · 뒤로는 그 반대
    function go(to) {
      to = Math.max(0, Math.min(spreads() - 1, to));
      if (to === spread || flipping) return;
      const dir = to > spread ? 1 : -1, old = spread;
      spread = to;
      if (still) { renderSpread(); return; }
      flipping = true;
      const leaf = document.createElement('div'), front = document.createElement('div'), back = document.createElement('div');
      leaf.className = 'leaf ' + (dir > 0 ? 'fwd' : 'bwd'); front.className = 'pg face front'; back.className = 'pg face back';
      if (dir > 0) { front.append(pageEl(old * 2 + 1)); back.append(pageEl(to * 2)); fillPage(pgR, to * 2 + 1); }
      else { front.append(pageEl(old * 2)); back.append(pageEl(to * 2 + 1)); fillPage(pgL, to * 2); }
      leaf.append(front, back); book.append(leaf);
      let ended = false;
      const fin = () => { if (ended) return; ended = true; leaf.remove(); flipping = false; renderSpread(); };
      requestAnimationFrame(() => requestAnimationFrame(() => leaf.classList.add('turn')));
      leaf.addEventListener('transitionend', (e) => { if (e.target === leaf) fin(); });
      setTimeout(fin, 1300);
    }
    nav.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) go(spread + +b.dataset.d); });
    // 쪽의 빈 곳을 누르면: 오른쪽 쪽 → 다음, 왼쪽 쪽 → 앞
    pgR.addEventListener('click', () => go(spread + 1));
    pgL.addEventListener('click', () => go(spread - 1));
    // 휠 한 번 = 한 장
    let wheelT = 0;
    opts.root.addEventListener('wheel', (e) => {
      if (!opts.view.hidden || !items.length) return;
      e.preventDefault();
      const now = performance.now(), d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(d) < 4 || now - wheelT < 650) return;
      wheelT = now; go(spread + (d > 0 ? 1 : -1));
    }, { passive: false });
    // 책 크기: 화면에 맞춰 한 쪽 너비(--pw) — 쪽 비율 1 : 1.414
    function sizeBook() {
      const W = window.innerWidth - 2 * Math.max(24, window.innerWidth * 0.05), H = window.innerHeight - 96 - 78;
      opts.rail.style.setProperty('--pw', `${Math.max(140, Math.floor(Math.min(W / 2, H / 1.414)))}px`);
    }
    window.addEventListener('resize', sizeBook);
    sizeBook();

    function download(it) { DT.downloadBlob(it.blob, `LABORATORY-ARCHIVE_No${pad(it.no, 3)}_${fileStamp(it.created)}.jpg`); }
    // 본 화면으로 불러와 다시 편집 → 아카이브 창은 닫힘
    function load(it) {
      if (!it || !it.scene || !opts.onLoad) return;
      opts.onLoad(it.scene, it.no);
      close();
    }

    // 포스터 보기
    function show(i) {
      if (!items.length) { hide(); return; }
      cur = (i + items.length) % items.length;
      const it = items[cur];
      opts.img.src = urlOf(it);
      opts.img.alt = `No. ${pad(it.no, 3)} — ${it.stats.title}, ${it.stats.value} ${it.stats.unit}`;
      opts.meta.textContent = `No. ${pad(it.no, 3)}  ·  ${stamp(it.created)}` + (it.scene && it.scene.label ? `  ·  ${it.scene.label}` : '');
      opts.prev.disabled = opts.next.disabled = items.length < 2;
      if (opts.load) { opts.load.disabled = !it.scene; opts.load.title = it.scene ? 'Load into the artwork and edit' : 'Captured before scene saving — poster only'; }
      opts.view.hidden = false;
    }
    function hide() { opts.view.hidden = true; cur = -1; }

    function remove(it) {
      const i = items.indexOf(it); if (i < 0) return;
      items.splice(i, 1);
      if (it.url) URL.revokeObjectURL(it.url);
      if (it.shotUrl) URL.revokeObjectURL(it.shotUrl);
      tx(db, 'readwrite', (s) => s.delete(it.id));
      renderRail();
      if (!opts.view.hidden) { if (items.length) show(Math.min(i, items.length - 1)); else hide(); }
    }

    // 열기 / 닫기 — 열 때는 레일·제목이 멀리서 다가오듯, 닫을 때는 오프닝처럼 앞으로 커지며 사라짐 (css .arriving / .leaving)
    const MS = 900;
    let t1 = 0, t2 = 0;
    function open() {
      clearTimeout(t1); clearTimeout(t2);
      const root = opts.root;
      root.classList.remove('leaving');
      root.hidden = false; hide();
      opts.stage.dataset.archive = 'on';
      sizeBook(); spread = 0; renderRail();   // 표지(최신 결과 목록)부터
      if (!still) { root.classList.remove('arriving'); void root.offsetWidth; root.classList.add('arriving'); t1 = setTimeout(() => root.classList.remove('arriving'), MS); }
    }
    function close() {
      const root = opts.root;
      if (root.hidden || root.classList.contains('leaving')) return;
      clearTimeout(t1); clearTimeout(t2);
      hide(); root.classList.remove('arriving');
      const done = () => { root.hidden = true; root.classList.remove('leaving'); opts.stage.dataset.archive = 'off'; };
      if (still) { done(); return; }
      root.classList.add('leaving');
      opts.stage.classList.remove('entering'); void opts.stage.offsetWidth; opts.stage.classList.add('entering');   // 본 화면이 오프닝에서 들어올 때처럼 나타남
      t1 = setTimeout(done, MS);
      t2 = setTimeout(() => opts.stage.classList.remove('entering'), 1300);
    }
    const isOpen = () => !opts.root.hidden && !opts.root.classList.contains('leaving');

    // 찍은 장면 보관 → 번호 돌려줌
    async function add(src, stats, scene) {
      await Promise.all([fontReady, loaded]);   // 번호가 저장된 것과 겹치지 않게
      const poster = renderPoster(src, stats);
      // 책자 쪽에 쓸 깨끗한 장면 (긴 변 SHOT px 이하)
      const k = Math.min(1, SHOT / Math.max(src.width, src.height)), sc = document.createElement('canvas');
      sc.width = Math.round(src.width * k); sc.height = Math.round(src.height * k);
      sc.getContext('2d').drawImage(src, 0, 0, sc.width, sc.height);
      const it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), no: ++seq, created: Date.now(), blob: await toBlob(poster), shot: await toBlob(sc).catch(() => null), thumb: renderThumb(src), stats, scene: (await Promise.resolve(scene).catch(() => null)) || null };
      items.push(it);
      renderRail();
      await tx(db, 'readwrite', (s) => s.put({ id: it.id, no: it.no, created: it.created, blob: it.blob, shot: it.shot, thumb: it.thumb, stats: it.stats, scene: it.scene }));
      return it.no;
    }

    // 이벤트
    opts.back.addEventListener('click', close);
    opts.close.addEventListener('click', hide);
    opts.prev.addEventListener('click', () => show(cur - 1));
    opts.next.addEventListener('click', () => show(cur + 1));
    opts.save.addEventListener('click', () => { const it = items[cur]; if (it) download(it); });
    opts.del.addEventListener('click', () => { const it = items[cur]; if (it) remove(it); });
    if (opts.load) opts.load.addEventListener('click', () => load(items[cur]));
    // 크게 보기에서도 포스터를 누르면 그 샘플을 다시 사용
    opts.img.addEventListener('click', () => { const it = items[cur]; if (it && it.scene) load(it); });
    opts.view.addEventListener('click', (e) => { if (e.target === opts.view) hide(); });   // 포스터 바깥을 누르면 닫힘
    // 아카이브가 열려 있으면 키는 여기서만 (본 화면의 Delete·글자 입력 등으로 새지 않게)
    window.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      const viewing = !opts.view.hidden;
      if (e.key === 'Escape') { viewing ? hide() : close(); }
      else if (viewing && e.key === 'ArrowLeft') show(cur - 1);
      else if (viewing && e.key === 'ArrowRight') show(cur + 1);
      else if (!viewing && (e.key === 'ArrowLeft' || e.key === 'PageUp')) go(spread - 1);    // 책장 넘기기
      else if (!viewing && (e.key === 'ArrowRight' || e.key === 'PageDown')) go(spread + 1);
      else if (!viewing && e.key === 'Home') go(0);
      else if (viewing && (e.key === 'Delete' || e.key === 'Backspace')) opts.del.click();
      else if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') return;   // 버튼 조작은 그대로
      else return void e.stopImmediatePropagation();
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);

    // 저장해 둔 포스터 불러오기
    loaded = (async () => {
      renderRail();
      db = await openDB();
      const rows = (await tx(db, 'readonly', (s) => s.getAll())) || [];
      rows.sort((a, b) => a.created - b.created);
      for (const r of rows) { items.push({ id: r.id, no: r.no, created: r.created, blob: r.blob, shot: r.shot || null, thumb: r.thumb, stats: r.stats, scene: r.scene || null }); seq = Math.max(seq, r.no || 0); }
      renderRail();
    })();

    return { open, close, add, isOpen, get count() { return items.length; } };
  };
})(window.DT = window.DT || {});
