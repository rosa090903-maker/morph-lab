/*
 * 갤러리 — 쓸 사진을 미리 넣어 두고, 넣는 순간 누끼를 따서 누끼 딴 상태로 보관
 *  - 넣기: 갤러리 패널의 '+' 또는 패널 위로 끌어다 놓기 (여러 장 가능)
 *  - 넣으면 한 장씩 배경 제거 모델(DT.segmentSubject)을 돌려 매트를 저장 → 썸네일은 누끼 딴 모습
 *  - 고르면: 저장된 매트로 바로 화면에 배치 (모델을 다시 돌리지 않음) → 바로 이동·크기 조절
 *  - × = 갤러리에서 삭제
 *  - 브라우저 IndexedDB 에 저장 → 앱을 다시 켜도 남아 있음 (localhost:5174 기준. 못 쓰면 이번 실행 동안만)
 */
(function (DT) {
  'use strict';

  const DB_NAME = 'polar-gallery', STORE = 'photos';
  const THUMB = 220;   // 썸네일 긴 변(px)

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

  // 매트 저장 형식 { w, h, data: Uint8Array } ↔ 쓰는 형식 { w, h, m: Float32Array, coverage, model }
  const packMask = (M) => { const d = new Uint8Array(M.m.length); for (let i = 0; i < d.length; i++) d[i] = Math.round(M.m[i] * 255); return { w: M.w, h: M.h, data: d }; };
  function unpackMask(P) {
    const N = P.w * P.h, m = new Float32Array(N); let area = 0;
    for (let i = 0; i < N; i++) { m[i] = P.data[i] / 255; area += m[i]; }
    return { w: P.w, h: P.h, m, coverage: area / N, model: true };
  }

  // 썸네일: 매트가 있으면 피사체만 (배경 투명)
  function makeThumb(img, packed) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = THUMB / Math.max(iw, ih);
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k));
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
    if (!packed) return c.toDataURL('image/jpeg', 0.85);
    const mc = document.createElement('canvas'); mc.width = packed.w; mc.height = packed.h;
    const mg = mc.getContext('2d'), im = mg.createImageData(packed.w, packed.h);
    for (let i = 0; i < packed.data.length; i++) { im.data[i * 4 + 3] = packed.data[i]; }
    mg.putImageData(im, 0, 0);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(mc, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  /*
   * opts: { panel, tab, grid, count, closeBtn, addBtn, input, stage, intro, ring, title, onPick(img, mask), onStatus(msg) }
   */
  DT.createGallery = function (opts) {
    const items = [];   // { id, blob, mask(packed)|null, state: 'busy'|'ready'|'error', thumb, img, maskF }
    let db = null;
    const queue = [];
    let running = false;

    function render() {
      const grid = opts.grid;
      grid.innerHTML = '';
      for (const it of items) {
        const li = document.createElement('li');
        li.className = 'g-item ' + it.state;
        const label = it.state === 'busy' ? 'Cutting out…' : it.state === 'error' ? 'Cut-out failed — click to place with an approximate cut-out' : 'Place on canvas';
        li.innerHTML = `<button type="button" class="g-pick" title="${label}" aria-label="${label}"${it.state === 'busy' ? ' disabled' : ''}>${it.thumb ? `<img alt="" src="${it.thumb}">` : ''}<i class="g-spin" aria-hidden="true"></i></button>` +
          `<button type="button" class="g-del" title="Remove from gallery" aria-label="Remove from gallery">×</button>`;
        li.querySelector('.g-pick').addEventListener('click', () => pick(it));
        li.querySelector('.g-del').addEventListener('click', () => remove(it));
        grid.appendChild(li);
      }
      const add = document.createElement('li');
      add.className = 'g-item g-add-cell';
      add.appendChild(opts.addBtn);
      grid.appendChild(add);
      const busy = items.filter((x) => x.state === 'busy').length;
      opts.count.textContent = busy ? `cutting out ${busy}…` : `${items.length} photo${items.length === 1 ? '' : 's'}`;
      renderRing();
    }

    /*
     * 처음 화면의 사진 고리 — 수평으로 누운 원 위에 사진 카드를 세워 둠 (카드 면 = 반지름 방향 → 좌우는 정면, 앞뒤는 옆면)
     *  사진이 적으면 같은 사진을 되풀이해 고리를 채움 (RING_MIN 장 이상)
     */
    const RING_MIN = 48;
    function renderRing() {
      const ring = opts.ring;
      ring.innerHTML = '';
      opts.intro.dataset.empty = items.length ? 'false' : 'true';
      if (!items.length) return;
      const reps = Math.max(1, Math.ceil(RING_MIN / items.length)), n = items.length * reps;
      for (let k = 0; k < n; k++) {
        const it = items[k % items.length];
        const card = document.createElement('div');
        card.className = 'r-card ' + it.state;
        card.style.setProperty('--a', (360 * k / n).toFixed(3) + 'deg');
        const label = it.state === 'busy' ? 'Cutting out…' : 'Place on canvas';
        card.innerHTML = `<button type="button" class="r-pick" title="${label}" aria-label="${label}"${it.state === 'busy' ? ' disabled' : ''}${k >= items.length ? ' tabindex="-1"' : ''}>${it.thumb ? `<img alt="" src="${it.thumb}">` : ''}<i class="g-spin" aria-hidden="true"></i></button>` +
          `<button type="button" class="r-del" title="Remove from gallery" aria-label="Remove from gallery" tabindex="-1">×</button>`;
        card.querySelector('.r-pick').addEventListener('click', () => pick(it));
        card.querySelector('.r-del').addEventListener('click', () => remove(it));
        ring.appendChild(card);
      }
    }
    // 고리 회전 (커서가 사진 위에 있으면 멈춤 — 고르기 쉽게)
    let spin = 0, last = 0, raf = 0, hold = false;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function tick(t) {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
      if (!hold && !still) spin = (spin + dt * 4) % 360;   // 90초에 한 바퀴
      opts.ring.style.setProperty('--spin', spin.toFixed(3) + 'deg');
      raf = requestAnimationFrame(tick);
    }
    /*
     * 아이폰(WebKit)은 3D 로 돌린 카드(preserve-3d)를 누른 자리를 잘못 찾아 카드의 click 이 오지 않을 때가 있음
     *  → 오프닝 화면 어디를 눌러도 여기서 받아, 카드를 빗나갔으면 화면에 보이는 카드 위치(getBoundingClientRect)로 직접 찾음
     *  겹치면 더 크게 보이는(= 앞쪽) 카드. 제목을 누른 것은 그대로(사진 올리기)
     */
    function cardAt(x, y) {
      let best = null, bestArea = 0;
      for (const b of opts.ring.querySelectorAll('.r-pick')) {
        const r = b.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom || r.width < 6) continue;
        const a = r.width * r.height;
        if (a > bestArea) { bestArea = a; best = b; }
      }
      return best;
    }
    opts.intro.addEventListener('click', (e) => {
      if (opts.intro.hidden || opts.intro.classList.contains('leaving')) return;
      if (e.target.closest && (e.target.closest('.r-pick') || e.target.closest('.r-del') || e.target.closest('.intro-title'))) return;   // 제대로 맞았으면 원래대로
      const b = cardAt(e.clientX, e.clientY);
      if (b && !b.disabled) { if (window.__polarDebug) window.__polarDebug('tap missed the 3D card → picked by position'); b.click(); }
    });
    opts.ring.addEventListener('pointerover', (e) => { if (e.target.closest('.r-card')) hold = true; });
    opts.ring.addEventListener('pointerout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.r-card')) hold = false; });

    async function imgOf(it) { if (!it.img) it.img = await DT.loadImageFile(it.blob); return it.img; }

    function enqueue(it) { it.state = 'busy'; queue.push(it); render(); if (!running) run(); }
    async function run() {
      running = true;
      while (queue.length) {
        const it = queue.shift();
        if (it.removed) continue;
        try {
          const img = await imgOf(it);
          const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.min(1, 2048 / Math.max(iw, ih));
          const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const M = await DT.segmentSubject(c);
          if (it.removed) continue;
          it.mask = packMask(M); it.maskF = M; it.state = 'ready'; it.thumb = makeThumb(img, it.mask);
          await tx(db, 'readwrite', (s) => s.put({ id: it.id, blob: it.blob, mask: it.mask, created: it.created }));
        } catch (err) {
          console.warn('[POLAR] gallery cut-out failed:', err);
          if (!it.removed) { it.state = 'error'; if (opts.onStatus) opts.onStatus('Could not cut out a gallery photo (the background-removal model failed to load — offline?).'); }
        }
        render();
      }
      running = false;
    }

    async function addFiles(files) {
      const list = Array.from(files || []).filter((f) => /^image\//.test(f.type));
      if (!list.length) { if (opts.onStatus) opts.onStatus('Choose an image file (JPG, PNG, WebP, GIF…).'); return; }
      for (const f of list) {
        const it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), blob: f, mask: null, state: 'busy', created: Date.now() };
        try { it.thumb = makeThumb(await imgOf(it), null); } catch (err) { if (opts.onStatus) opts.onStatus(err.message); continue; }
        items.push(it);
        await tx(db, 'readwrite', (s) => s.put({ id: it.id, blob: it.blob, mask: null, created: it.created }));   // 누끼 전에도 저장 (도중에 꺼도 다음에 이어서)
        enqueue(it);
      }
    }

    async function pick(it) {
      if (it.state === 'busy') return;
      try {
        const img = await imgOf(it);
        if (it.mask && !it.maskF) it.maskF = unpackMask(it.mask);
        opts.onPick(img, it.state === 'ready' ? it.maskF : null);   // 실패한 사진은 화면에서 다시 누끼를 시도
        close();
      } catch (err) { if (opts.onStatus) opts.onStatus(err.message); }
    }

    function remove(it) {
      it.removed = true;
      const i = items.indexOf(it); if (i >= 0) items.splice(i, 1);
      tx(db, 'readwrite', (s) => s.delete(it.id));
      render();
    }

    // intro = 처음 화면 ('Choose a Sample' + 사진 고리, 대시보드는 숨김). 사진을 고르면 작품 화면으로
    /*
     * 오프닝 → 본 화면 전환: 고리·제목이 앞으로 다가오듯 커지며 사라지고(.leaving),
     *  본 화면(작품 프레임 + 대시보드)은 조금 작은 상태에서 제 크기로 커지며 나타남(.entering) — 시간은 css 의 애니메이션과 같게
     */
    const LEAVE_MS = 900, ENTER_MS = 1300;
    let leaveT = 0, enterT = 0;
    function setIntro(on) {
      const wasOn = !opts.intro.hidden && !opts.intro.classList.contains('leaving');
      clearTimeout(leaveT); clearTimeout(enterT);
      opts.intro.classList.remove('leaving');
      if (opts.stage) { opts.stage.dataset.intro = on ? 'on' : 'off'; opts.stage.classList.remove('entering'); }
      if (on || !wasOn || still) {
        opts.intro.hidden = !on;
        cancelAnimationFrame(raf); last = 0; hold = false;
        if (on) raf = requestAnimationFrame(tick);
        return;
      }
      opts.intro.classList.add('leaving');   // 고리는 사라질 때까지 계속 돎
      if (opts.stage) { void opts.stage.offsetWidth; opts.stage.classList.add('entering'); }
      leaveT = setTimeout(() => { opts.intro.hidden = true; opts.intro.classList.remove('leaving'); cancelAnimationFrame(raf); last = 0; hold = false; }, LEAVE_MS);
      enterT = setTimeout(() => { if (opts.stage) opts.stage.classList.remove('entering'); }, ENTER_MS);
    }
    function open(intro) {
      setIntro(intro === true);
      opts.panel.hidden = intro === true;
      opts.tab.setAttribute('aria-expanded', intro === true ? 'false' : 'true'); opts.tab.hidden = true;
    }
    function close() { setIntro(false); opts.panel.hidden = true; opts.tab.setAttribute('aria-expanded', 'false'); opts.tab.hidden = false; }

    // 이벤트
    opts.tab.addEventListener('click', () => open(false));
    if (opts.home) opts.home.addEventListener('click', () => open(true));   // 본 화면 → 오프닝
    opts.title.addEventListener('click', () => opts.input.click());   // 제목을 눌러도 사진 고르기 창 (끌어다 놓기와 같음)
    // (Esc 로 사진 없이 작품 화면에 넘어가던 것은 없앰 — 오프닝에서는 사진을 골라야 넘어감)
    open(true);   // 처음 화면
    opts.closeBtn.addEventListener('click', close);
    opts.addBtn.addEventListener('click', () => opts.input.click());
    opts.input.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    const panel = opts.panel;
    panel.addEventListener('dragover', (e) => { e.preventDefault(); panel.classList.add('drag'); });
    panel.addEventListener('dragleave', (e) => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drag'); });
    panel.addEventListener('drop', (e) => { e.preventDefault(); panel.classList.remove('drag'); addFiles(e.dataTransfer && e.dataTransfer.files); });   // 화면(app.js)의 drop 은 갤러리 위에서는 무시함

    /*
     * 기본 샘플 — 갤러리가 빈 첫 방문자에게 samples/samples.json 의 사진을 넣어 둠 (한 번만: 지운 샘플은 다시 생기지 않음)
     *  samples.json = [{ "image": "a.jpg", "mask": "a.mask.png" }, …] — mask(흑백 PNG, 흰색 = 피사체)가 있으면 모델 없이 바로 'ready',
     *  없으면 보통 사진처럼 누끼 대기열로. file:// 로 열었거나 samples 폴더가 없으면 조용히 건너뜀
     */
    const SAMPLES_DIR = 'samples/';
    const getBlob = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.blob(); };
    async function maskFromPng(blobP) {
      const img = await DT.loadImageFile(await blobP);
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, w, h).data, data = new Uint8Array(w * h);
      for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
      return { w, h, data };
    }
    async function seedSamples() {
      let list;
      try { const r = await fetch(SAMPLES_DIR + 'samples.json', { cache: 'no-cache' }); if (!r.ok) return; list = await r.json(); } catch (e) { return; }
      if (!Array.isArray(list) || !list.length) return;
      // 파일은 한꺼번에 받기 시작하고(느린 휴대폰 망에서도 빨리), 처리는 한 장씩 — 한 장 끝날 때마다 고리에 바로 보임
      const files = list.map((s) => ({ s, img: getBlob(SAMPLES_DIR + s.image), mask: s.mask ? getBlob(SAMPLES_DIR + s.mask) : null }));
      files.forEach((f) => { f.img.catch(() => {}); if (f.mask) f.mask.catch(() => {}); });   // 실패는 아래에서 한 장씩 처리
      let created = Date.now();
      for (const f of files) {
        try {
          const blob = await f.img;
          const it = { id: 'sample-' + f.s.image, blob, mask: null, created: created++, state: 'busy' };
          if (f.mask) { try { it.mask = await maskFromPng(f.mask); } catch (err) { it.mask = null; } }   // 마스크를 못 읽으면 보통 사진처럼 누끼 대기열로
          it.thumb = makeThumb(await imgOf(it), it.mask);
          if (it.mask) it.state = 'ready'; else queue.push(it);
          items.push(it);
          render();
          await tx(db, 'readwrite', (st) => st.put({ id: it.id, blob: it.blob, mask: it.mask, created: it.created }));
        } catch (err) { console.warn('[POLAR] sample could not be added:', f.s, err); }
      }
    }

    // 저장해 둔 사진 불러오기 — 누끼가 없는 것(도중에 껐던 것)은 다시 누끼
    (async () => {
      render();
      db = await openDB();
      const rows = (await tx(db, 'readonly', (s) => s.getAll())) || [];
      rows.sort((a, b) => a.created - b.created);
      for (const r of rows) {
        const it = { id: r.id, blob: r.blob, mask: r.mask, created: r.created, state: r.mask ? 'ready' : 'busy' };
        try { it.thumb = makeThumb(await imgOf(it), r.mask); } catch (err) { continue; }
        items.push(it);
        if (!r.mask) queue.push(it);
        render();   // 한 장씩 바로 고리에
      }
      // 갤러리가 비어 있으면 기본 샘플 (첫 방문 · 지난번에 넣다가 끊긴 경우 · 다 지운 경우 모두 — 빈 고리로 멈춰 있지 않게)
      if (!items.length) await seedSamples();
      render();
      if (queue.length && !running) run();
    })();

    return { open, close, addFiles, get items() { return items.length; } };
  };
})(window.DT = window.DT || {});
