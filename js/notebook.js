/*
 * 실험노트 (Lab Notebook) — 처음 쓰는 사람이 '어떤 조건에서 어떤 모드가 켜지는지'와 '숨은 조작'을 알 수 있게
 *  오른쪽 위 Notebook 버튼 또는 N 키 → 먼저 '파일 서랍'이 열림 (참고: 탭 달린 파일이 층층이 꽂힌 서랍, 커서를 대면 파일이 살짝 올라옴)
 *   · 검은 탭 = 묶음(C 조건 · M 모드 · H 도움말), 번호 탭 = 파일. 파일을 누르면 그 파일이 열림
 *   · 톤 = 처음 화면과 같게: 어두운 막 위 반투명 유리 파일 · 가는 흰 선 · 흰 글자 (css .notebook)
 *   · 열린 파일 = 고정폭 글꼴 · 유리 둥근 카드 · 큰 숫자 · 줄마다 ON/OFF 스위치
 *   · 파일 오른쪽 위 ≡ = 서랍으로 · ← → = 앞뒤 파일 · Esc · 바깥 클릭 = 접힘. 펼쳐 있어도 작품은 계속 돌아감
 *  숫자는 직접 적지 않음 — app.js 가 넘겨 주는 needsOf(DT 설정) · modeAt(DT.*Strength) 로 그림 → 조건을 바꾸면 노트도 저절로 맞음
 *  처음 접속한 브라우저에서 한 번만 버튼이 깜박이며 'Open the notebook (N)' (localStorage 'polar.notebookSeen')
 */
(function (DT) {
  'use strict';

  DT.NOTEBOOK = {
    colors: { frost: '#5fb4ff', microbe: '#8ee05a', bubble: '#6fe3f0', corrode: '#ff7a3d', desert: '#ffc247', slime: '#ffd21a', moss: '#6fae35' },   // Mix 버튼과 같은 색
    cells: [60, 40],               // 조건 지도 칸 수 (기온 × 습도)
    refresh: 250,                  // 펼쳐 있는 동안 다시 그리는 간격(ms) — 지금 값 · 이긴 모드 · 할 일
    hintFor: 9000,                 // 처음 접속 힌트를 보여 두는 시간(ms)
    seenKey: 'polar.notebookSeen',
    // 서랍 그림 (svg 단위) — 뒤 파일일수록 좁고(원근) 위에
    drawer: { w: 600, rowH: 22, tabH: 17, top: 40, halfBack: 226, halfFront: 256, tabW: 0.29 },
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const deg = (t) => `${t < 0 ? '−' : t > 0 ? '+' : ''}${Math.abs(Math.round(t))}°`;
  const pad = (n) => String(n).padStart(2, '0');

  // 숨은 조작 — 그림(svg 경로)
  const ICON = {
    dbl: '<path d="M9 4v11l3-3 2.5 5 2-1-2.5-5H18z"/><path d="M4.5 6.5a5 5 0 0 1 3-3M3 4a8 8 0 0 1 3-2.5" opacity=".7"/>',
    right: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v7M6 10h12"/><path d="M12 3.4a5.6 5.6 0 0 1 5.6 5.6V10H12z" fill="currentColor" stroke="none"/>',
    wheel: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 6.5v4"/>',
    space: '<rect x="2.5" y="9" width="19" height="7" rx="1.6"/><path d="M7 12.5h10"/>',
    hold: '<path d="M9 6v11l3-3 2.5 5 2-1-2.5-5H18z"/><circle cx="9" cy="6" r="3.2" opacity=".55"/><circle cx="9" cy="6" r="5.4" opacity=".3"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M8.5 17l2.5-3 2 2 1.5-1.5 2 2.5"/>',
    tile: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="10.5" r="3"/><path d="M8 16.5h8"/>',
    keyN: '<rect x="4" y="4" width="16" height="16" rx="2.4"/><path d="M9 15.5v-7l6 7v-7"/>',
    keyR: '<rect x="4" y="4" width="16" height="16" rx="2.4"/><circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/>',
    undo: '<path d="M8 8H4V4"/><path d="M4.3 8A8 8 0 1 1 6 17"/>',
  };
  const MODE_KEYS = ['frost', 'microbe', 'bubble', 'corrode', 'desert', 'slime', 'moss'];

  DT.createNotebook = function (ctx) {
    const N = DT.NOTEBOOK, C = N.colors;
    const btn = document.getElementById('noteBtn');
    const root = document.createElement('div');
    root.className = 'notebook'; root.id = 'notebook'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Lab notebook');
    root.innerHTML = `<div class="nbd" aria-label="Choose a file"></div><article class="nbf" hidden></article>`;
    document.getElementById('stage').appendChild(root);
    const drawerEl = root.querySelector('.nbd'), fileEl = root.querySelector('.nbf');
    const name = (m) => ctx.names[m];

    // ---------- 파일 목록 (서랍 뒤 → 앞) ----------
    //  sec = 묶음 탭(검정), 나머지 = 파일. col = 탭 자리 (l 왼쪽 · m 가운데 · r 오른쪽)
    const FILES = [
      { id: 'map', title: 'Condition map', page: fileMap },
      { id: 'table', title: 'Condition table', page: fileTable },
      { id: 'modes', title: 'Mode table', page: fileModes },
      { id: 'next', title: 'Next step', page: fileNext },
      ...MODE_KEYS.map((m) => ({ id: m, title: name(m), mode: m, page: () => fileMode(m) })),
      { id: 'controls', title: 'Controls', page: fileControls },
      { id: 'terms', title: 'Terms', page: fileTerms },
    ];
    FILES.forEach((f, i) => { f.no = i + 1; });
    const SECTIONS = [{ k: 'C', name: 'Conditions', from: 0, to: 1 }, { k: 'M', name: 'Modes', from: 2, to: 10 }, { k: 'H', name: 'Help', from: 11, to: 12 }];
    const ROWS = [];
    for (const s of SECTIONS) {
      ROWS.push({ sec: s });
      for (let i = s.from; i <= s.to; i++) ROWS.push({ file: FILES[i] });
    }
    let view = 'drawer', cur = 0, timer = 0;

    // ---------- 서랍 ----------
    function renderDrawer() {
      const G = N.drawer, n = ROWS.length, cx = G.w / 2, th = G.tabH;
      const bot = G.top + (n - 1) * G.rowH + th + 36, H = bot + 74;
      const act = ctx.activeMode();
      const secX = [0.1, 0.03, 0.18];
      let fi = 0, si = 0, out = '', defs = '';
      ROWS.forEach((row, i) => {
        const half = G.halfBack + (G.halfFront - G.halfBack) * i / (n - 1), L = cx - half, R = cx + half, Wr = R - L, y = G.top + i * G.rowH, t = y + th;
        let tx, tw, label, cls;
        if (row.sec) {
          tw = Wr * 0.24; tx = L + Wr * secX[si++ % secX.length];
          label = `<text x="${tx + 18}" y="${y + th * 0.74}">${row.sec.k}</text><text x="${tx + tw - 16}" y="${y + th * 0.74}" text-anchor="end">${pad(row.sec.to - row.sec.from + 1).padStart(3, '0')}</text>`;
          cls = 'nbd-f nbd-sec';
        } else {
          const f = row.file, col = fi === 6 || fi === 11 ? 'l' : fi % 2 ? 'r' : 'm'; fi++;
          tw = Math.max(Wr * G.tabW, 64 + f.title.length * 7); tx = Math.min(R - tw - 6, L + Wr * (col === 'l' ? 0.07 : col === 'm' ? 0.37 : 0.665));   // 긴 이름은 탭을 넓힘 (번호와 겹치지 않게)
          label = `<text x="${tx + 18}" y="${y + th * 0.74}">${pad(f.no)}</text><text x="${tx + tw - 14}" y="${y + th * 0.74}" text-anchor="end">${esc(f.title.toLowerCase())}</text>`;
          cls = 'nbd-f' + (f.mode && f.mode === act ? ' nbd-now' : '');
        }
        const r = 6, s = 9;
        const body = `M${L},${bot} V${t + r} Q${L},${t} ${L + r},${t} H${tx} L${tx + s},${y} H${tx + tw - s} L${tx + tw},${t} H${R - r} Q${R},${t} ${R},${t + r} V${bot}`;
        const tab = `M${tx},${t} L${tx + s},${y} H${tx + tw - s} L${tx + tw},${t}Z`;
        const data = row.sec ? `data-sec="${row.sec.from}"` : `data-file="${row.file.no - 1}"`;
        // 반투명 파일: 앞 파일에 가려지는 아래쪽은 칠하지 않음 (겹쳐 진해지거나 뒤 선이 비치지 않게) — 띠 아래 10px 는 겹쳐 윗변이 살짝 밝게, 위 14px 는 커서를 대 올라올 때 몫
        const clipB = i === n - 1 ? bot + 2 : t + G.rowH + 10;
        defs += `<clipPath id="nbdc${i}"><rect x="0" y="${y - 14}" width="${G.w}" height="${clipB - y + 14}"/></clipPath>`;
        out += `<g class="${cls}" ${data} style="--d:${i * 22}ms" tabindex="0" role="button" aria-label="${esc(row.sec ? row.sec.name : row.file.title)}"><path class="nbd-body" d="${body}" clip-path="url(#nbdc${i})"/><path class="nbd-tab" d="${tab}"/>${label}</g>`;
      });
      // 서랍 앞판 + 노란 이름표
      const fh = G.halfFront + 16, lw = 190;
      out += `<g class="nbd-front"><path d="M${cx - fh},${bot} H${cx + fh} V${bot + 58} H${cx - fh}Z"/><path d="M${cx - fh},${bot + 8} H${cx + fh}" class="nbd-lip"/>
        <rect class="nbd-label" x="${cx - lw / 2}" y="${bot + 24}" width="${lw}" height="22" rx="6"/><text x="${cx}" y="${bot + 39}" text-anchor="middle">laboratory's lab notes</text></g>`;
      drawerEl.innerHTML = `<svg viewBox="0 0 ${G.w} ${H}" aria-hidden="false"><defs>${defs}</defs>${out}</svg>
        <p class="nbd-hint">Pick a file · N or Esc to close</p>`;
    }
    drawerEl.addEventListener('click', (e) => {
      const g = e.target.closest('.nbd-f'); if (!g) return;
      openFile(g.dataset.file != null ? +g.dataset.file : +g.dataset.sec);
    });
    drawerEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const g = e.target.closest('.nbd-f'); if (!g) return;
      e.preventDefault(); openFile(g.dataset.file != null ? +g.dataset.file : +g.dataset.sec);
    });

    // ---------- 파일 조각 (참고 스타일) ----------
    // 조건 하나씩 → 짧은 글 (기온 · 습도 · 빛 · 산소 · Life) — 이상(≥) 포함 · 미만(<) 제외
    function fmtNeed(list, k) {
      const c = list.filter((x) => x.k === k);
      if (k === 'life') return c.length ? (c[0].op === 'on' ? 'on' : 'off') : 'any';
      if (!c.length) return 'any';
      const v = (x) => (k === 'T' ? deg(x.v) : k === 'L' ? ctx.fmtLx(x.v) : `${x.v}%`);
      const lo = c.find((x) => x.op === '>=' || x.op === '>'), hi = c.find((x) => x.op === '<=' || x.op === '<');
      if (lo && hi) return `${v(lo)} – ${hi.op === '<' ? '<' : ''}${v(hi)}`;
      const x = lo || hi;
      return `${{ '>=': '≥', '>': '>', '<=': '≤', '<': '<' }[x.op]} ${v(x)}`;
    }
    const okOf = (list, k) => list.filter((x) => x.k === k).every((x) => x.ok);
    const nowVal = (k) => (k === 'T' ? `${deg(ctx.T)}C` : k === 'RH' ? `${Math.round(ctx.RH)}%` : k === 'O2' ? `${Math.round(ctx.O2)}%` : k === 'L' ? ctx.fmtLx(ctx.L) : ctx.life ? 'on' : 'off');
    const KEYN = { T: 'Temperature', RH: 'Humidity', L: 'Light', O2: 'Oxygen', life: 'Life' };
    const dot = (m) => `<i class="nbf-dot" style="background:${C[m]}"></i>`;
    const sw = (on) => `<span class="nbf-sw${on ? ' on' : ''}" aria-label="${on ? 'on' : 'off'}">${on ? 'ON' : 'OFF'}</span>`;
    // 위: 시계 · 이름 + 큰 제목 + ≡
    function top(f) {
      const d = new Date();
      return `<div class="nbf-bar"><span>${pad(d.getHours())}:${pad(d.getMinutes())}</span><span>Nº ${pad(f.no)} / ${pad(FILES.length)}</span></div>
        <header class="nbf-head"><h2>${esc(f.title)}</h2>
          <button type="button" class="nbf-menu" title="Back to the file drawer" aria-label="Back to the file drawer"><i></i><i></i><i></i></button></header>`;
    }
    // 둥근 알약 카드: 큰 기온 + 한마디 + 고리(%)
    function nowPill(say, pct, ringLabel) {
      const p = Math.max(0, Math.min(100, Math.round(pct))), R = 19, L = 2 * Math.PI * R;
      return `<section class="nbf-pill"><b class="nbf-temp">${ctx.T < 0 ? '−' : ''}${Math.abs(ctx.T).toFixed(1)}°C</b><p>${say}</p>
        <svg class="nbf-ring" viewBox="0 0 48 48" aria-label="${p}% ${esc(ringLabel)}"><circle cx="24" cy="24" r="${R}"/><circle class="v" cx="24" cy="24" r="${R}" stroke-dasharray="${(L * p / 100).toFixed(1)} ${L.toFixed(1)}"/><text x="24" y="27.5" text-anchor="middle">${p}%</text></svg></section>`;
    }
    const nowSay = () => {
      const act = ctx.activeMode();
      return `${ctx.lab ? 'Lab is on — Mix decides.' : act ? `${esc(name(act))} is running` : 'Nothing is growing yet'}<br><span>${Math.round(ctx.RH)}% RH · ${Math.round(ctx.O2)}% O₂ · Life ${ctx.life ? 'on' : 'off'}</span>`;
    };
    // 가는 선 카드: 이름 · 작은 설명 · [이름, 값, 흐림?] 들 (+ 왼쪽 그림)
    function card(label, sub, pairs, art) {
      const kv = pairs.map(([k, v, dim]) => `<div class="nbf-kv${dim ? ' dim' : ''}"><small>${esc(k)}</small><b>${v}</b></div>`).join('');
      return `<section class="nbf-card"><div class="nbf-card-h"><span>${esc(label)}</span><em>${esc(sub)}</em>${art || ''}</div><div class="nbf-card-v">${kv}</div></section>`;
    }
    // 줄 표: rows = [{ cells: [...], on, now, sub }] — 마지막 칸에 ON/OFF 스위치 (on 이 null 이면 없음)
    function rows(add, head, list) {
      const h = head ? `<div class="nbf-row nbf-row-h">${head.map((c) => `<span>${esc(c)}</span>`).join('')}${list.some((r) => r.on != null) ? '<span></span>' : ''}</div>` : '';
      const body = list.map((r) => `<div class="nbf-row${r.now ? ' now' : ''}">${r.cells.map((c) => `<span>${c}</span>`).join('')}${r.on != null ? `<span class="nbf-sw-c">${sw(r.on)}</span>` : ''}</div>${r.sub ? `<div class="nbf-sub">${r.sub}</div>` : ''}`).join('');
      const cols = (head || list[0].cells).length, hasSw = list.some((r) => r.on != null);
      const tpl = (cols === 2 ? 'minmax(9em, 0.8fr) 2fr' : cols === 3 ? 'minmax(9em, 1fr) 1fr 1fr' : `minmax(8.5em, 1.3fr) repeat(${cols - 1}, minmax(0, 1fr))`) + (hasSw ? ' auto' : '');
      return `<p class="nbf-add">${esc(add)}</p><div class="nbf-rows${cols === 2 ? ' nbf-rows-2' : ''}" style="--tpl:${tpl}">${h}${body}</div>`;
    }

    // ---------- 파일들 ----------
    // 조건 지도 (canvas) — 칸마다 그 값에서 실제로 켜지는 모드의 색 (modeAt = DT.*Strength)
    function drawMap(cv, life) {
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const [T0, T1] = ctx.tempRange, [nx, ny] = N.cells, O2 = ctx.O2, Lx = ctx.L, cw = W / nx, ch = H / ny;
      const sum = {};
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const T = Math.round(T0 + (i + 0.5) / nx * (T1 - T0)), RH = Math.round(100 - (j + 0.5) / ny * 100), m = ctx.modeAt(life, T, RH, O2, Lx);
        if (!m) continue;
        g.fillStyle = C[m]; g.globalAlpha = 0.7; g.fillRect(i * cw, j * ch, cw + 0.6, ch + 0.6);
        const s = sum[m] || (sum[m] = [0, 0, 0]); s[0] += i * cw; s[1] += j * ch; s[2]++;
      }
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255, 255, 255, 0.3)'; g.lineWidth = 1; g.setLineDash([2, 3]);
      const x0 = (0 - T0) / (T1 - T0) * W;
      g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.setLineDash([]);
      const fs = Math.max(10, Math.min(13, H / 11)), placed = [];
      g.font = `400 ${fs}px "DM Mono", ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0, 0, 0, 0.7)'; g.shadowBlur = 4;
      for (const m in sum) {
        const s = sum[m]; if (s[2] <= 6) continue;
        let x = s[0] / s[2] + cw / 2, y = s[1] / s[2] + ch / 2;
        while (placed.some((p) => Math.abs(p[0] - x) < fs * 5 && Math.abs(p[1] - y) < fs)) y += fs;
        y = Math.min(H - fs / 2, y); placed.push([x, y]);
        g.fillText(name(m).toUpperCase(), x, y);
      }
      g.shadowBlur = 0;
      // 지금 다이얼 자리
      const px = (ctx.T - T0) / (T1 - T0) * W, py = (1 - ctx.RH / 100) * H, here = ctx.life === life;
      g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.fillStyle = '#fff';
      g.beginPath(); g.arc(px, py, here ? 4.5 : 4, 0, 6.2832); if (here) g.fill(); else g.stroke();
    }
    function fileMap() {
      const map = (life) => {
        const notes = ctx.ORDER[life ? 'on' : 'off'].map((m) => { const n = ctx.needsOf(m), l = fmtNeed(n, 'L'); return `<li class="${okOf(n, 'L') ? '' : 'dim'}">${dot(m)}${esc(name(m))} <em>O₂ ${esc(fmtNeed(n, 'O2'))}${l === 'any' ? '' : ` · ${esc(l)}`}</em></li>`; }).join('');
        return `<section class="nbf-card nbf-map"><div class="nbf-card-h"><span>Life ${life ? 'on' : 'off'}</span><em>${life ? 'living' : 'non-living'}</em></div>
          <div class="nbf-plot"><canvas data-life="${life ? 1 : 0}"></canvas><div class="nbf-ax"><span>${deg(ctx.tempRange[0])}</span><span>0°</span><span>${deg(ctx.tempRange[1])}</span></div></div><ul class="nbf-legend">${notes}</ul></section>`;
      };
      return nowPill(nowSay(), ctx.RH, 'humidity') + `<div class="nbf-grid">${map(true)}${map(false)}</div>
        <p class="nbf-note">Across = temperature, up = humidity. Drawn at your ${Math.round(ctx.O2)}% oxygen and ${esc(ctx.fmtLx(ctx.L))} light. The dot is where your dials are now — no two modes ever share a spot.</p>`;
    }
    function fileTable() {
      const act = ctx.activeMode();
      const list = [...ctx.ORDER.on, ...ctx.ORDER.off].map((m) => {
        const n = ctx.needsOf(m), cell = (k) => `<i class="${n.some((x) => x.k === k) && !okOf(n, k) ? 'off' : ''}">${esc(fmtNeed(n, k))}</i>`;
        return { cells: [`${dot(m)}${esc(name(m).toUpperCase())}`, cell('T'), cell('RH'), cell('L'), cell('O2'), cell('life')], on: n.every((x) => x.ok), now: m === act };
      });
      return nowPill(nowSay(), ctx.RH, 'humidity') + rows('+ every column must match', ['Mode', 'Temp', 'Humidity', 'Light', 'O₂', 'Life'], list)
        + `<p class="nbf-note">Grey = your dial doesn’t match yet. “≥” includes the number, “&lt;” stops just before it. Lab mode ignores this table — the modes picked in Mix run at full strength.</p>`;
    }
    // 조건 → 화살표 (↑ 높음 · ↑↑ 아주 높음 · ↓ 낮음 · ↓↓ 아주 낮음 · → 중간 · · 상관없음)
    const RANGE = { T: () => ctx.tempRange, RH: () => [0, 100], O2: () => [0, 100], L: () => ctx.lightRange };
    function arrowOf(list, k) {
      const c = list.filter((x) => x.k === k);
      if (!c.length) return '·';
      const [a, b] = RANGE[k](), norm = (v) => (k === 'L' ? (Math.log10(v) - Math.log10(a)) / (Math.log10(b) - Math.log10(a)) : (v - a) / (b - a));
      const lo = c.find((x) => x.op === '>=' || x.op === '>'), hi = c.find((x) => x.op === '<=' || x.op === '<');
      if (lo && hi) { const m = (norm(lo.v) + norm(hi.v)) / 2; return m < 0.2 ? '↓↓' : m < 0.4 ? '↓' : m < 0.6 ? '→' : m < 0.8 ? '↑' : '↑↑'; }
      if (lo) return norm(lo.v) >= 0.7 ? '↑↑' : '↑';
      return norm(hi.v) <= 0.3 ? '↓↓' : '↓';
    }
    function fileModes() {
      const act = ctx.activeMode(), look = ctx.look();
      const list = [...ctx.ORDER.on, ...ctx.ORDER.off].map((m) => {
        const n = ctx.needsOf(m);
        return { cells: [`${dot(m)}${esc(name(m).toUpperCase())}`, arrowOf(n, 'T'), arrowOf(n, 'RH'), arrowOf(n, 'L'), arrowOf(n, 'O2'), fmtNeed(n, 'life').toUpperCase()], now: m === act,
          sub: look[m].map(([what, dial, dir]) => `${esc(what)} ← ${esc(dial)} ${esc(dir)}`).join(' · ') };
      });
      return nowPill(nowSay(), ctx.RH, 'humidity') + rows('+ what each mode likes', ['Mode', 'Temp', 'Hum.', 'Light', 'O₂', 'Life'], list)
        + `<p class="nbf-note">↑ high · ↑↑ very high · ↓ low · ↓↓ very low · → middle · · doesn’t matter. Under each mode: the dials that change it once it is on.</p>`;
    }
    function nextOf(m) {
      const act = ctx.activeMode();
      if (ctx.lab) return ctx.mix[m] ? 'On in Mix.' : 'Switch it on in Mix.';
      if (m === act) return 'Running now.';
      const miss = ctx.needsOf(m).filter((x) => !x.ok);
      const say = [...miss.filter((x) => x.k !== 'life'), ...miss.filter((x) => x.k === 'life')].map((x) => x.say.replace(/\bme\b/, 'it'));
      const txt = say.length ? `${say.length > 1 ? say.slice(0, -1).join(', ') + ' and ' + say[say.length - 1] : say[0]}.` : `Dials match, but ${name(act)} is on.`;
      return txt.charAt(0).toUpperCase() + txt.slice(1);
    }
    function fileNext() {
      const act = ctx.activeMode();
      const list = [...ctx.ORDER.on, ...ctx.ORDER.off].map((m) => ({ cells: [`${dot(m)}${esc(name(m).toUpperCase())}`, esc(nextOf(m))], on: ctx.lab ? !!ctx.mix[m] : m === act, now: m === act }));
      return nowPill(nowSay(), ctx.RH, 'humidity') + rows('+ what to do next', null, list)
        + (ctx.hasPhoto ? '' : '<p class="nbf-note">Most modes grow on a sample — press + at the top left to pick one.</p>');
    }
    function fileMode(m) {
      const n = ctx.needsOf(m), ok = n.filter((x) => x.ok).length, act = ctx.activeMode();
      const run = ctx.lab ? !!ctx.mix[m] : m === act;
      const keys = ['T', 'RH', 'L', 'O2', 'life'].filter((k) => n.some((x) => x.k === k));
      const art = `<svg class="nbf-art" viewBox="0 0 64 40" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<rect x="${2 + i * 7}" y="2" width="5" height="36" rx="2.5"/>`).join('')}</svg>`;
      return nowPill(`${dot(m)}${esc(name(m))} ${run ? 'is running' : 'is off'}<br><span>${run ? 'conditions met' : esc(nextOf(m))}</span>`, n.length ? ok / n.length * 100 : 100, 'of conditions met')
        + `<div class="nbf-grid">
          ${card('Conditions', run ? 'Active' : 'Waiting', keys.slice(0, 3).map((k) => [KEYN[k], esc(fmtNeed(n, k)), !okOf(n, k)]), art)}
          ${card('Dials', 'once it is on', ctx.look()[m].slice(0, 3).map(([what, dial, dir]) => [what, `${esc(dial)} ${esc(dir)}`]))}
        </div>`
        + rows('+ condition', null, keys.map((k) => ({ cells: [KEYN[k].toUpperCase(), esc(fmtNeed(n, k)), `now ${esc(nowVal(k))}`], on: okOf(n, k), now: false })));
    }
    function fileControls() {
      const r = (ic, k, d) => ({ cells: [`<svg class="nbf-ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[ic]}</svg>${esc(k.toUpperCase())}`, esc(d)] });
      return rows('+ hidden controls', null, [
        r('dbl', 'Double-click', 'type text where you click'),
        r('right', 'Right-click', 'Lab: pick one photo or text for its own Mix'),
        r('wheel', 'Wheel', 'zoom in and out around the cursor'),
        r('space', 'Space', 'save this moment to the Archive'),
        r('keyR', 'R', 'record a video of the artwork (no panels)'),
        r('hold', 'Press & hold', 'corrosion grows where you hold'),
        r('file', 'Intro title', 'click to choose a file · or drop an image'),
        r('tile', 'Mode tile', 'click a mode on the bottom bar for its guide'),
        r('keyN', 'N', 'open or close this notebook'),
        r('undo', 'Ctrl+Z', 'undo · Ctrl+Shift+Z redo — Reset can be undone too'),
      ]);
    }
    function fileTerms() {
      const t = (k, d) => ({ cells: [esc(k.toUpperCase()), esc(d)] });
      return rows('+ terms', null, [
        t('Life', 'On = living modes (Slime, Moss, Microbes) · off = non-living (Frost, Bubbles, Corrosion, Desert).'),
        t('Growth Rate', 'How fast and how strongly the reaction spreads.'),
        t('Light', 'Brightness and contrast of the whole scene, from night (0.1 lx) to full sun (100k lx).'),
        t('Latitude', 'The equator is warm and saturated, the poles turn white and colourless.'),
        t('Spectrum', 'Light split into colour — tints the background and the effects.'),
        t('Lab', 'Ignore the conditions and blend the modes you pick in Mix.'),
        t('Rust', 'Orange-brown rust (iron) and green-blue verdigris (copper) together.'),
      ]);
    }
    function renderFile() {
      const f = FILES[cur], prev = FILES[cur - 1], next = FILES[cur + 1];
      fileEl.innerHTML = top(f) + `<div class="nbf-body">${f.page()}</div>
        <nav class="nbf-nav"><button type="button" class="nbf-go" data-d="-1" ${prev ? '' : 'disabled'}>← ${prev ? `${pad(prev.no)} ${esc(prev.title)}` : ''}</button>
          <button type="button" class="nbf-go" data-d="1" ${next ? '' : 'disabled'}>${next ? `${pad(next.no)} ${esc(next.title)}` : ''} →</button></nav>`;
      fileEl.querySelectorAll('canvas[data-life]').forEach((cv) => drawMap(cv, cv.dataset.life === '1'));
    }
    fileEl.addEventListener('click', (e) => {
      if (e.target.closest('.nbf-menu')) { showDrawer(); return; }
      const g = e.target.closest('.nbf-go'); if (g && !g.disabled) openFile(cur + +g.dataset.d);
    });

    // ---------- 보기 전환 ----------
    function showDrawer() {
      view = 'drawer'; fileEl.hidden = true; drawerEl.hidden = false;
      renderDrawer(); lastKey = '';
      drawerEl.classList.remove('in'); void drawerEl.offsetWidth; drawerEl.classList.add('in');
      const g = drawerEl.querySelector(`[data-file="${cur}"]`); if (g) g.focus({ preventScroll: true });
    }
    function openFile(i) {
      cur = Math.max(0, Math.min(FILES.length - 1, i));
      view = 'file'; drawerEl.hidden = true; fileEl.hidden = false;
      lastKey = ''; renderFile(); fileEl.scrollTop = 0;
      fileEl.classList.remove('in'); void fileEl.offsetWidth; fileEl.classList.add('in');
    }
    // 펼쳐 있는 동안 — 지금 값으로 (바뀐 게 없으면 DOM 은 그대로)
    let lastKey = '';
    function tick() {
      if (root.hidden) return;
      const key = [view, cur, ctx.T, ctx.RH, ctx.O2, ctx.L, ctx.life, ctx.lab, ctx.activeMode(), ctx.hasPhoto, JSON.stringify(ctx.mix), new Date().getMinutes()].join('|');
      if (key !== lastKey) { lastKey = key; if (view === 'file') renderFile(); else renderDrawer(); }
      timer = setTimeout(tick, N.refresh);
    }
    function open() {
      if (!root.hidden) return;
      root.hidden = false;
      showDrawer(); tick();   // 늘 서랍부터 — 파일을 골라 엶
      btn.setAttribute('aria-expanded', 'true'); btn.classList.add('on');
      seen();
      requestAnimationFrame(() => root.classList.add('open'));
    }
    function close() {
      if (root.hidden) return;
      clearTimeout(timer); root.classList.remove('open'); root.hidden = true;
      btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('on');
    }
    const toggle = () => (root.hidden ? open() : close());
    const go = (i) => { if (root.hidden) open(); openFile(i); };

    btn.addEventListener('click', toggle);
    root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });   // 바깥(어두운 막)을 누르면 접힘
    window.addEventListener('resize', () => { if (!root.hidden) lastKey = ''; });
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t.closest && t.closest('input, textarea, [contenteditable]')) return;
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggle(); return; }
      if (root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      else if (view === 'file' && e.key === 'ArrowRight' && !t.closest('[role="slider"]')) { e.preventDefault(); openFile(cur + 1); }
      else if (view === 'file' && e.key === 'ArrowLeft' && !t.closest('[role="slider"]')) { e.preventDefault(); openFile(cur - 1); }
      else if (view === 'file' && e.key === 'Backspace') { e.preventDefault(); showDrawer(); }
    }, true);

    // ---------- 처음 접속 힌트 (이 브라우저에서 한 번만) ----------
    const store = { get() { try { return localStorage.getItem(N.seenKey); } catch (e) { return '1'; } }, set() { try { localStorage.setItem(N.seenKey, '1'); } catch (e) { /* 저장 안 됨 — 이번만 */ } } };
    let hint = null;
    function seen() { store.set(); btn.classList.remove('nb-ping'); if (hint) { hint.remove(); hint = null; } }
    if (!store.get()) {
      btn.classList.add('nb-ping');
      hint = document.createElement('div'); hint.className = 'nb-hint'; hint.textContent = 'Open the notebook (N)';
      btn.parentElement.appendChild(hint);
      setTimeout(() => { if (hint) { hint.classList.add('out'); setTimeout(() => { if (hint) { hint.remove(); hint = null; } btn.classList.remove('nb-ping'); store.set(); }, 600); } }, N.hintFor);
    }

    return { open, close, toggle, get isOpen() { return !root.hidden; }, go, get view() { return view; } };
  };
})(window.DT = window.DT || {});
