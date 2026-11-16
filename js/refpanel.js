/*
 * References 패널 — 지금 화면(모드 · 기온·습도·산소·빛 · Lab mix)과 비슷한 시각 레퍼런스를 찾아 줌
 *  기본: 키 없이 — 모드별 시각 어휘로 검색어를 만들고 Are.na · Pinterest · Google 이미지 · Behance 링크 + Are.na 이미지 + 작가·작품
 *  선택: Claude API 키가 있으면 화면 캡처를 Claude 에 보내 '지금 화면에서 일어나는 일' 설명 · 검색어 · 레퍼런스를 받아 씀
 *  Similar design effects: 지금 준 효과(모드 · 환경값 · 화면 특징)와 비슷한 기존 디자인 이펙트(포토샵·AE 필터, 셰이더, 제너러티브 알고리즘)를
 *   유사도 순으로 — 패널이 열려 있으면 2초마다 갱신. 키가 있으면 Claude 가 화면을 보고 다시 골라 줌
 *  패널 DOM 은 여기서 만들어 #hud 에 붙임 (index.html 은 link/script 두 줄만)
 */
(() => {
  'use strict';
  const hud = document.getElementById('hud');
  if (!hud) return;
  const $ = (id) => document.getElementById(id);

  // ── 모드별 시각 어휘 (영어 이미지 검색어) ──
  const VOCAB = {
    frost: ['hoarfrost macro photography', 'frost crystals on glass', 'ice dendrite microscope', 'frozen photograph texture'],
    microbe: ['bacterial colony petri dish', 'microbial growth pattern', 'reaction diffusion pattern', 'agar plate art'],
    bubble: ['soap foam macro', 'bubble cell structure', 'voronoi foam texture', 'effervescence macro photography'],
    corrode: ['rust corrosion macro', 'oxidized metal patina', 'corroded surface texture', 'pitting corrosion pattern'],
    desert: ['desert sand ripples aerial', 'cracked dry earth', 'wind erosion sand texture', 'desertification photography'],
    moss: ['moss macro photography', 'leafy moss texture', 'bryophyte under microscope', 'moss growing on stone'],
    slime: ['physarum slime mold network', 'slime mold growth pattern', 'physarum simulation', 'biological transport network'],
    none: ['morphogenesis graphic design', 'natural form generative art', 'organic pattern typography'],
  };
  // 여러 모드를 섞은 문구에 쓰는 짧은 말 (예: 'hoarfrost macro and rust corrosion texture')
  const BLEND = {
    frost: 'hoarfrost macro', microbe: 'bacterial colony', bubble: 'soap foam', corrode: 'rust corrosion texture',
    desert: 'desert sand ripples', moss: 'moss macro', slime: 'physarum slime mold',
  };
  const NAMES = { frost: 'Frost', microbe: 'Microbes', bubble: 'Bubbles', corrode: 'Corrosion', desert: 'Desert', moss: 'Moss', slime: 'Slime' };
  // 작가·작품 — 실제로 있는 것만
  const ARTISTS = {
    frost: [['Wilson A. Bentley', 'Snow crystal photomicrographs (1885–1931)'], ['Kenneth Libbrecht', 'Snow crystal photography']],
    microbe: [['Ernst Haeckel', 'Kunstformen der Natur (1904)'], ['Klari Reis', 'Petri dish paintings'], ['Karl Sims', 'Reaction-diffusion studies']],
    bubble: [['Frei Otto', 'Soap-film form-finding models'], ["D'Arcy Thompson", 'On Growth and Form']],
    corrode: [['Andy Warhol', 'Oxidation Paintings (1978)'], ['Alberto Burri', 'Combustioni, Cretti']],
    desert: [['Edward Burtynsky', 'Aerial landscapes'], ['Alberto Burri', 'Grande Cretto']],
    moss: [['Ernst Haeckel', 'Muscinae plate'], ['Nervous System', 'growth-based generative design']],
    slime: [['Sage Jenson', 'Physarum simulations'], ['Nervous System', 'Hyphae']],
  };
  const ALWAYS = [["D'Arcy Thompson", 'On Growth and Form (1917)'], ['Anders Hoff (inconvergent)', 'Generative growth systems']];
  const LINKS = [
    ['Are.na', (q) => 'https://www.are.na/search/' + encodeURIComponent(q)],
    ['Pinterest', (q) => 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(q)],
    ['Google', (q) => 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q)],
    ['Behance', (q) => 'https://www.behance.net/search/projects?search=' + encodeURIComponent(q)],
  ];
  // ── 디자인 이펙트 라이브러리 — 지금 준 효과가 어떤 기존 디자인 이펙트(필터·셰이더·알고리즘)와 닮았는지 ──
  //  modes: 이 앱의 모드와 얼마나 닮았나(0~1) · when: 환경값이 이 효과 쪽인지(0~1) · look: 화면 특징 목표값(0~1)
  //  화면 특징 — lum 밝기 · sat 채도 · contrast 대비 · edge 경계·선 · fine 미세한 결 · cool 푸른 색감 · warm 붉은·갈색 색감
  const R = (v, a, b) => (v == null || !Number.isFinite(v) ? 0.4 : Math.max(0, Math.min(1, (v - a) / (b - a))));
  const lux = (s) => Math.log10(Math.max(0.1, s.light == null ? 100 : s.light));
  const EFFECTS = [
    { name: 'Reaction–diffusion (Gray–Scott)', tool: 'Generative · Processing / TouchDesigner / shader', how: '두 물질이 퍼지며 반응해 점·미로 무늬가 자람 — F·K 값으로 무늬가 바뀜', q: 'reaction diffusion generative design',
      modes: { microbe: 1, slime: 0.5, moss: 0.4, corrode: 0.3 }, when: (s) => (s.vitality ? 1 : 0.4), cond: 'Life 켜짐', look: { edge: 0.55, fine: 0.5, contrast: 0.6 } },
    { name: 'Diffusion-limited aggregation (DLA)', tool: 'Generative · Processing / Houdini', how: '떠도는 입자가 달라붙으며 가지처럼 자람 — 성에·산호·번개 같은 수지상', q: 'diffusion limited aggregation generative art',
      modes: { frost: 1, moss: 0.6, corrode: 0.3, slime: 0.3 }, when: (s) => Math.max(R(s.temperature, 0, -20), R(s.humidity, 40, 90) * 0.6), cond: '영하 · 습함', look: { edge: 0.65, fine: 0.6, cool: 0.5 } },
    { name: 'Glass distortion — Frosted', tool: 'Photoshop · Filter › Distort › Glass (Frosted)', how: '유리 질감 맵으로 이미지를 미세하게 굴절 — 김 서린 유리', q: 'frosted glass effect graphic design',
      modes: { frost: 0.8, bubble: 0.4 }, when: (s) => Math.max(R(s.humidity, 50, 95), R(s.temperature, 5, -15)), cond: '습함 · 추움', look: { edge: 0.3, contrast: 0.3, lum: 0.6, sat: 0.25 } },
    { name: 'Crystallize', tool: 'Photoshop · Filter › Pixelate › Crystallize', how: '이미지를 불규칙한 다각형 셀로 나눠 평균색으로 채움', q: 'crystallize filter poster design',
      modes: { frost: 0.6, bubble: 0.5, desert: 0.3 }, when: (s) => R(s.temperature, 0, -25), cond: '영하', look: { edge: 0.45, fine: 0.3, contrast: 0.5 } },
    { name: 'Voronoi / Worley cellular noise', tool: 'Shader · Blender / TouchDesigner / Houdini', how: '점들 사이 경계로 세포·거품·갈라짐 같은 망을 만듦', q: 'voronoi pattern graphic design',
      modes: { bubble: 1, desert: 0.6, microbe: 0.4 }, when: (s) => Math.max(R(s.oxygen, 21, 40), R(s.humidity, 35, 5)), cond: '산소 많음 · 건조', look: { edge: 0.5, fine: 0.35 } },
    { name: 'Physarum transport network', tool: 'Generative · agent simulation (compute shader)', how: '수많은 에이전트가 흔적을 따라가며 가장 짧은 길망을 만듦', q: 'physarum simulation generative art',
      modes: { slime: 1, microbe: 0.3, moss: 0.3 }, when: (s) => R(s.reactivity, 20, 90), cond: 'Reactivity 높음', look: { edge: 0.6, fine: 0.55, contrast: 0.65 } },
    { name: 'Space colonization (venation)', tool: 'Generative · Processing / Grasshopper', how: '빈 공간의 목표점을 향해 가지가 뻗음 — 잎맥·이끼·뿌리', q: 'space colonization algorithm generative',
      modes: { moss: 1, slime: 0.5, frost: 0.3 }, when: (s) => (s.vitality ? 1 : 0.3), cond: 'Life 켜짐', look: { edge: 0.55, fine: 0.5 } },
    { name: 'Displacement map', tool: 'After Effects · Displacement Map / Photoshop · Distort › Displace', how: '다른 이미지의 밝기로 픽셀을 밀어 표면 굴곡을 만듦', q: 'displacement map typography effect',
      modes: { desert: 0.7, corrode: 0.5, bubble: 0.4 }, when: () => 0.5, cond: '', look: { contrast: 0.5, edge: 0.4 } },
    { name: 'Turbulent Displace', tool: 'After Effects · Distort › Turbulent Displace', how: '프랙탈 노이즈로 가장자리를 녹아내리듯 흔듦', q: 'turbulent displace after effects',
      modes: { corrode: 0.6, slime: 0.5, bubble: 0.4, microbe: 0.3 }, when: (s) => R(s.temperature, 10, 40), cond: '더움', look: { edge: 0.4 } },
    { name: 'Film grain / Add Noise', tool: 'Photoshop · Filter › Noise › Add Noise / Lightroom Grain', how: '미세한 점 노이즈로 건조하고 거친 표면', q: 'grain texture gradient poster',
      modes: { desert: 0.8, corrode: 0.3 }, when: (s) => R(s.humidity, 40, 10), cond: '건조', look: { fine: 0.8, edge: 0.35, sat: 0.3 } },
    { name: 'Color Halftone', tool: 'Photoshop · Filter › Pixelate › Color Halftone', how: '명암을 크기가 다른 점으로 — 인쇄 망점', q: 'halftone graphic design poster',
      modes: { microbe: 0.6, bubble: 0.5 }, when: () => 0.4, cond: '', look: { fine: 0.6, contrast: 0.7, edge: 0.5 } },
    { name: 'Dithering / stippling', tool: 'Photoshop · Bitmap › Diffusion Dither / p5.js', how: '명암을 흩뿌린 점의 밀도로 표현', q: 'dithering stippling graphic design',
      modes: { microbe: 0.7, desert: 0.5 }, when: (s) => R(lux(s), 2, 0.5), cond: '빛 적음', look: { fine: 0.8, sat: 0.15, contrast: 0.7 } },
    { name: 'Glow / Bloom', tool: 'After Effects · Stylize › Glow / Deep Glow', how: '밝은 부분이 번져 빛 무리를 만듦', q: 'bloom glow effect graphic design',
      modes: {}, when: (s) => R(lux(s), 2.2, 4.5), cond: '빛 강함', look: { lum: 0.7, contrast: 0.4 } },
    { name: 'Chromatic aberration / RGB split', tool: 'After Effects · Channel offset / shader', how: 'R·G·B 채널을 어긋나게 겹쳐 무지갯빛 테두리', q: 'chromatic aberration graphic design',
      modes: {}, when: (s) => R(s.prism, 6, 40), cond: 'Prism 켜짐', look: { sat: 0.7, edge: 0.5 } },
    { name: 'Gradient Map / duotone', tool: 'Photoshop · Adjustments › Gradient Map', how: '밝기를 정한 두세 가지 색으로 다시 칠함', q: 'duotone gradient map poster',
      modes: {}, when: (s) => Math.max(R(s.prism, 6, 30), R(s.temperature, -5, -25) * 0.6), cond: 'Prism · 푸른 냉기', look: { sat: 0.6, contrast: 0.55 } },
    { name: 'Rust / oxidation weathering', tool: 'Substance 3D Designer · weathering / Photoshop texture overlay', how: '가장자리부터 녹이 번지고 점식 구멍이 생기는 풍화 질감', q: 'rust texture graphic design',
      modes: { corrode: 1 }, when: (s) => Math.max(R(s.oxygen, 21, 40), R(s.humidity, 50, 90)), cond: '산소 · 습기', look: { warm: 0.7, fine: 0.6, sat: 0.5 } },
    { name: 'Roughen Edges', tool: 'After Effects · Stylize › Roughen Edges', how: '가장자리를 갉아먹은 듯 거칠게 — 부식·침식', q: 'roughen edges after effects typography',
      modes: { corrode: 0.8, desert: 0.6 }, when: () => 0.5, cond: '', look: { edge: 0.5, contrast: 0.6 } },
    { name: 'Erosion simulation', tool: 'Houdini · Heightfield Erode / World Machine', how: '물·바람이 깎아낸 골짜기와 모래 결', q: 'erosion simulation generative',
      modes: { desert: 1, corrode: 0.4 }, when: (s) => R(s.humidity, 40, 10), cond: '건조', look: { warm: 0.6, edge: 0.4 } },
    { name: 'Burn / scorch', tool: 'Photoshop · Burn tool / After Effects · CC Burn Film', how: '열로 그을리고 타 들어간 가장자리', q: 'burnt paper effect graphic design',
      modes: { desert: 0.5, corrode: 0.4 }, when: (s) => R(s.temperature, 30, 60), cond: '고온', look: { warm: 0.8, contrast: 0.7, lum: 0.35 } },
    { name: 'Craquelure', tool: 'Photoshop · Filter › Texture › Craquelure', how: '마른 물감·흙처럼 표면이 망으로 갈라짐', q: 'craquelure texture design',
      modes: { desert: 0.9, frost: 0.3 }, when: (s) => R(s.humidity, 35, 5), cond: '건조', look: { edge: 0.55, fine: 0.45 } },
    { name: 'Metaballs / blob SDF', tool: 'Shader · SDF smooth-min / Cinema 4D Volume', how: '둥근 덩어리가 가까워지면 끈적하게 합쳐짐', q: 'metaballs generative design',
      modes: { bubble: 0.8, slime: 0.6, microbe: 0.4 }, when: (s) => R(s.humidity, 50, 90), cond: '습함', look: { edge: 0.25, contrast: 0.5 } },
    { name: 'Ripple / Ocean Ripple', tool: 'Photoshop · Filter › Distort › Ripple · Ocean Ripple', how: '물결처럼 일렁이는 굴절', q: 'ocean ripple effect poster',
      modes: { bubble: 0.5, desert: 0.4 }, when: (s) => R(s.humidity, 60, 95), cond: '습함', look: { edge: 0.35 } },
    { name: 'Fractal Noise (Perlin)', tool: 'After Effects · Noise & Grain › Fractal Noise', how: '여러 크기의 노이즈를 겹친 구름·이끼·흙 결', q: 'fractal noise texture design',
      modes: { moss: 0.6, desert: 0.5, corrode: 0.4 }, when: () => 0.4, cond: '', look: { fine: 0.5, contrast: 0.4 } },
    { name: 'Flow field / curl noise', tool: 'Generative · p5.js / TouchDesigner particles', how: '보이지 않는 흐름을 따라 입자가 선을 그음', q: 'flow field generative art',
      modes: { slime: 0.6, desert: 0.4, microbe: 0.3 }, when: () => 0.4, cond: '', look: { edge: 0.5, fine: 0.5 } },
    { name: 'Ink bleed / wet edge', tool: 'Photoshop · Wet Media brushes / shader bleed', how: '젖은 종이에 잉크가 번지는 가장자리', q: 'ink bleed typography',
      modes: { microbe: 0.6, moss: 0.4, bubble: 0.3 }, when: (s) => R(s.humidity, 55, 95), cond: '습함', look: { edge: 0.3, sat: 0.4 } },
    { name: 'Condensation / water droplets', tool: 'Shader · rain-on-glass / Photoshop droplet overlay', how: '차가운 유리에 맺힌 물방울 렌즈', q: 'condensation glass droplets design',
      modes: { bubble: 0.5, frost: 0.4 }, when: (s) => R(s.humidity, 60, 100) * (s.temperature == null ? 1 : R(s.temperature, 30, 5)), cond: '습하고 서늘함', look: { lum: 0.5, edge: 0.35, cool: 0.5 } },
    { name: 'Find Edges', tool: 'Photoshop · Filter › Stylize › Find Edges', how: '윤곽선만 남겨 가는 선 드로잉처럼', q: 'find edges filter graphic design',
      modes: { frost: 0.5, slime: 0.4 }, when: () => 0.35, cond: '', look: { edge: 0.85, lum: 0.65, sat: 0.15 } },
    { name: 'Emboss / bas-relief', tool: 'Photoshop · Filter › Stylize › Emboss', how: '빛 방향으로 볼록·오목한 부조 표면', q: 'emboss texture design',
      modes: { corrode: 0.5, desert: 0.5, frost: 0.3 }, when: () => 0.35, cond: '', look: { sat: 0.15, contrast: 0.4, lum: 0.5 } },
  ];
  const LOOK_NAMES = { lum: '밝기', sat: '채도', contrast: '대비', edge: '선·경계', fine: '미세한 결', cool: '푸른 색감', warm: '붉은·갈색 색감' };

  // 화면 특징 (0~1) — 작게 줄인 캡처에서
  function features(view) {
    try {
      const c = shrink(view, 128), w = c.width, h = c.height;
      const d = c.getContext('2d').getImageData(0, 0, w, h).data;
      const L = new Float32Array(w * h);
      let sl = 0, ss = 0, cool = 0, warm = 0;
      for (let i = 0; i < w * h; i++) {
        const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b; sl += L[i];
        ss += mx > 0.04 ? (mx - mn) / mx : 0;
        if (mx > 0.12 && b > r + 0.08 && b >= g - 0.05) cool++;
        if (mx > 0.12 && r > b + 0.1 && r >= g - 0.1) warm++;
      }
      const n = w * h, lum = sl / n;
      let sv = 0, gr = 0, lp = 0, m = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, v = L[i];
        sv += (v - lum) * (v - lum);
        gr += Math.abs(L[i + 1] - v) + Math.abs(L[i + w] - v);
        lp += Math.abs(4 * v - L[i - 1] - L[i + 1] - L[i - w] - L[i + w]);
        m++;
      }
      const k = (v) => Math.max(0, Math.min(1, v));
      return {
        lum: k(lum), sat: k(ss / n), contrast: k(Math.sqrt(sv / m) * 3),
        edge: k((gr / m) * 6), fine: k((lp / m) * 5), cool: k((cool / n) * 2), warm: k((warm / n) * 2),
      };
    } catch (e) { return null; }   // 캔버스를 읽을 수 없으면 (예: file:// 사진) 특징 없이
  }

  // 지금 상태 + 화면 특징 → 비슷한 디자인 이펙트 순위
  function matchEffects(st, feat, n) {
    const act = st.modes;
    return EFFECTS.map((E) => {
      const keys = Object.keys(E.modes), why = [];
      let mode;
      if (!keys.length) mode = 0.35;
      else if (!act.length) mode = 0.15;
      else {
        const ws = act.map((k) => E.modes[k] || 0);
        mode = Math.max(...ws) * 0.8 + (ws.reduce((a, b) => a + b, 0) / ws.length) * 0.2;
        for (const k of act) if ((E.modes[k] || 0) >= 0.5) why.push(NAMES[k] + ' 모드');
      }
      const when = Math.max(0, Math.min(1, E.when(st)));
      if (E.cond && when >= 0.6) why.push(E.cond);
      let look = 0.5;
      if (feat) {
        const lk = Object.keys(E.look);
        const sims = lk.map((k) => Math.max(0, 1 - Math.abs(feat[k] - E.look[k]) * 1.6));
        look = sims.reduce((a, b) => a + b, 0) / sims.length;
        lk.forEach((k, i) => { if (sims[i] >= 0.8) why.push(LOOK_NAMES[k] + ' 비슷'); });
      }
      const score = keys.length ? 0.5 * mode + 0.25 * when + 0.25 * look : 0.15 + 0.5 * when + 0.3 * look;
      return { name: E.name, tool: E.tool, how: E.how, q: E.q, match: Math.round(Math.max(0.05, Math.min(0.98, score)) * 100), why: why.join(' · ') };
    }).sort((a, b) => b.match - a.match).slice(0, n || 5);
  }

  const CONCEPT = '자연의 형태변화를 시각 언어로 사용한 그래픽 실험실. 사진·글자는 환경값(기온·습도·산소·빛)에 따라 변하는 표본이다.';
  const KEY_STORE = 'polar.ref.apikey';
  const MODEL = 'claude-opus-5-5';

  // ── 작은 DOM 도우미 ──
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k in n && typeof attrs[k] !== 'string') n[k] = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  }
  const ext = (href, text, cls) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', class: cls || '', text });
  const shown = (n) => n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
  const num = (s) => { const v = parseFloat(String(s).replace(/[−–]/g, '-').replace(/[^\d.+-]/g, '')); return Number.isFinite(v) ? v : null; };

  // ── 지금 상태 읽기 ──
  function readState() {
    const cards = [];
    for (const c of hud.querySelectorAll('.card')) {
      if (c.closest('.ref-panel')) continue;
      const l = c.querySelector('.c-label'), b = c.querySelector('.c-big');
      if (!l || !b || !shown(c)) continue;
      cards.push({ label: l.textContent.trim(), value: b.textContent.trim() });
    }
    const card = (label) => { const f = cards.find((c) => c.label.toLowerCase() === label); return f ? f.value : null; };
    const S = window.__DIFFUSE__ && window.__DIFFUSE__.state;
    const pick = (key, label) => (S && Number.isFinite(S[key]) ? S[key] : num(card(label)));
    const lab = $('stage') && $('stage').dataset.lab === 'on';
    const modes = lab
      ? [...document.querySelectorAll('.mix-btn[aria-pressed="true"]')].map((b) => b.dataset.mode)
      : [...document.querySelectorAll('.m-tile[data-on="true"]')].map((t) => t.dataset.mode);
    const life = card('life');
    return {
      lab,
      vitality: S && 'vitality' in S ? !!S.vitality : life ? /on/i.test(life) : false,
      temperature: pick('temperature', 'temperature'),
      humidity: pick('humidity', 'humidity'),
      oxygen: pick('oxygen', 'air'),
      light: S && Number.isFinite(S.light) ? S.light : null,
      reactivity: S && Number.isFinite(S.reactivity) ? S.reactivity : null,
      prism: S ? Math.max(S.prismBg || 0, S.prismFx || 0) : 0,
      modes: [...new Set(modes)].filter((m) => VOCAB[m]),
      cards,
      status: ($('dashTitle') && $('dashTitle').textContent.trim()) || '',
    };
  }

  // ── 화면 캡처 ──
  function snapshot() {
    const D = window.__DIFFUSE__;
    if (D && typeof D.snapshot === 'function') {
      try { const c = D.snapshot(); if (c && c.width && c.height) return c; } catch (e) { /* 아래 방법으로 */ }
    }
    const layers = $('layers'), r = layers.getBoundingClientRect();
    const out = el('canvas');
    out.width = Math.max(1, Math.round(r.width)); out.height = Math.max(1, Math.round(r.height));
    const ctx = out.getContext('2d');
    for (const c of layers.querySelectorAll('canvas')) {
      if (!c.width || !c.height || !shown(c)) continue;
      const q = c.getBoundingClientRect();
      try { ctx.drawImage(c, q.left - r.left, q.top - r.top, q.width, q.height); } catch (e) { /* 그릴 수 없는 캔버스는 건너뜀 */ }
    }
    return out;
  }
  function shrink(src, w) {
    const k = Math.min(1, w / src.width), c = el('canvas');
    c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);   // JPEG 로 보낼 때 투명 부분이 검게
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  // ── 키 없이: 검색어 · 작가 ──
  function buildQueries(st) {
    const out = [], add = (q) => { q = q.trim(); if (q && !out.includes(q) && out.length < 7) out.push(q); };
    const modes = st.modes;
    if (modes.length > 1) add(modes.slice(0, 3).map((m) => BLEND[m]).join(' and '));
    for (const m of modes) add(VOCAB[m][0]);
    const mods = [];
    if (st.temperature != null && st.temperature <= -10) mods.push('icy blue');
    if (st.temperature != null && st.temperature >= 30) mods.push('heat');
    if (st.humidity != null && st.humidity >= 70) mods.push('wet');
    if (st.humidity != null && st.humidity <= 25) mods.push('dry');
    if (st.vitality) mods.push('organic');
    if (mods.length) add(mods.join(' ') + ' ' + (modes.length ? BLEND[modes[0]] : 'natural texture'));
    const pools = modes.length ? modes.map((m) => VOCAB[m]) : [VOCAB.none];
    for (let i = modes.length ? 1 : 0; i < 4; i++) for (const p of pools) if (p[i]) add(p[i]);
    return out;
  }
  function buildArtists(st) {
    const out = [], seen = new Set();
    for (const [creator, title] of [...st.modes.flatMap((m) => ARTISTS[m] || []), ...ALWAYS]) {
      const k = (creator + '|' + title).toLowerCase();
      if (seen.has(k) || out.length >= 6) continue;
      seen.add(k); out.push({ creator, title, why: '' });
    }
    return out;
  }

  // ── Are.na 공개 API 이미지 ──
  async function arenaImages(queries) {
    const lists = await Promise.all(queries.slice(0, 2).map(async (q) => {
      try {
        const r = await fetch('https://api.are.na/v2/search/blocks?per=8&q=' + encodeURIComponent(q));
        if (!r.ok) return [];
        const j = await r.json();
        return (j.blocks || []).filter((b) => b && b.image && b.image.thumb && b.image.thumb.url);
      } catch (e) { return []; }
    }));
    const out = [], ids = new Set();
    for (const b of lists.flat()) if (!ids.has(b.id) && out.length < 12) { ids.add(b.id); out.push(b); }
    return out;
  }

  // ── Claude (키가 있을 때) ──
  let sessionKey = '';
  const storedKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } };
  const apiKey = () => sessionKey || storedKey();
  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['description', 'effects', 'keywords', 'references'],
    properties: {
      description: { type: 'string' },
      effects: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['name', 'tool', 'match', 'how', 'why'],
          properties: { name: { type: 'string' }, tool: { type: 'string' }, match: { type: 'integer' }, how: { type: 'string' }, why: { type: 'string' } },
        },
      },
      keywords: { type: 'array', items: { type: 'string' } },
      references: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['creator', 'title', 'why'],
          properties: { creator: { type: 'string' }, title: { type: 'string' }, why: { type: 'string' } },
        },
      },
    },
  };
  async function askClaude(key, st, view, feat, guess) {
    const jpeg = shrink(view, 1024).toDataURL('image/jpeg', 0.85).split(',')[1];
    const f = (v, u) => (v == null ? '?' : Math.round(v * 10) / 10 + u);
    const featText = feat ? Object.keys(LOOK_NAMES).map((k) => `${LOOK_NAMES[k]} ${Math.round(feat[k] * 100)}`).join(' / ') : '측정 못 함';
    const text = [
      '작품 개념: ' + CONCEPT,
      '',
      '지금 설정:',
      `- Lab mode: ${st.lab ? 'on' : 'off'}`,
      `- Vitality(Life): ${st.vitality ? 'on' : 'off'}`,
      `- 켜진 모드: ${st.modes.length ? st.modes.map((m) => NAMES[m]).join(', ') : '없음'}`,
      `- 기온 ${f(st.temperature, ' °C')} · 습도 ${f(st.humidity, '%')} · 산소 ${f(st.oxygen, '%')} · 빛 ${f(st.light, ' lx')} · Prism ${f(st.prism, '')}`,
      `- 카드 값: ${st.cards.map((c) => `${c.label} ${c.value}`).join(' / ') || '없음'}`,
      `- 상태 문구: ${st.status || '없음'}`,
      `- 화면 특징(0~100): ${featText}`,
      `- 규칙으로 고른 비슷한 이펙트 후보: ${guess.map((g) => `${g.name}(${g.match})`).join(', ')}`,
      '',
      '첨부한 이미지는 사진·글자에 이 효과를 준 지금 작품 화면이다. 사용자는 자기가 준 효과가 기존의 어떤 디자인 이펙트와 비슷한지 알고 싶어 한다.',
      'description 은 지금 화면에 준 효과가 사진을 어떻게 바꾸는지(질감·구조·색·가장자리·움직임)를 한국어 2문장으로,',
      'effects 는 이 효과와 시각적으로 가장 비슷한 기존 디자인 이펙트 최대 6개를 유사도 높은 순으로.',
      '  디자인 이펙트 = 포토샵·애프터이펙트·일러스트레이터 필터, 셰이더 기법, 제너러티브 알고리즘, 인쇄·사진 기법 등 디자이너가 이름으로 찾아 쓸 수 있는 것.',
      '  후보는 참고만 하고, 화면을 보고 더 맞는 것이 있으면 바꿀 것. 실제로 있는 이름만.',
      '  name 은 영어 원래 이름, tool 은 어디서 어떻게 만드는지(예: "Photoshop · Filter › Distort › Glass"),',
      '  match 는 0~100 유사도, how 는 비슷하게 만드는 법 한국어 1문장, why 는 화면의 어떤 점이 닮았는지 한국어 1문장.',
      'keywords 는 이 이펙트들을 쓴 디자인·작품을 찾을 영어 이미지 검색어 6개,',
      'references 는 실제로 확인 가능한 작가·과학자·사진가·작품 최대 5개(지어내지 말 것)와 한국어 이유(why).',
    ].join('\n');
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
    let r, j;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'anthropic-beta': 'server-side-fallback-2026-07-01',   // 안전 분류기가 거절하면 서버가 다른 모델로 다시 답함
        },
        body: JSON.stringify({
          model: MODEL, max_tokens: 8000,
          fallbacks: 'default',
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg } },
            { type: 'text', text },
          ] }],
        }),
      });
      j = await r.json().catch(() => null);
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'timed out' : 'network error');
    } finally { clearTimeout(timer); }
    if (!r.ok) throw new Error((j && j.error && j.error.message) || 'HTTP ' + r.status);
    if (!j || j.stop_reason === 'refusal') throw new Error('refusal');
    if (j.stop_reason === 'max_tokens') throw new Error('answer was cut off');
    const block = (j.content || []).find((b) => b.type === 'text');
    if (!block) throw new Error('empty answer');
    let out;
    try { out = JSON.parse(block.text); } catch (e) { throw new Error('could not read the answer'); }
    return {
      description: String(out.description || ''),
      effects: (out.effects || []).filter((x) => x && x.name).slice(0, 6)
        .map((x) => ({ name: String(x.name), tool: String(x.tool || ''), how: String(x.how || ''), why: String(x.why || ''), match: Math.max(0, Math.min(100, Math.round(+x.match || 0))), q: x.name + ' effect graphic design' })),
      keywords: (out.keywords || []).map(String).filter(Boolean).slice(0, 7),
      references: (out.references || []).filter((x) => x && x.creator).slice(0, 5),
    };
  }

  // ── DOM ──
  const tab = el('button', { type: 'button', class: 'ref-tab', id: 'refTab', 'aria-expanded': 'false', 'aria-controls': 'refPanel', title: 'Find visual references similar to the current screen' },
    el('i', { class: 'ref-dot', 'aria-hidden': 'true' }), 'References');
  const hint = el('span', { class: 'c-hint' });
  const close = el('button', { type: 'button', class: 'ref-close', title: 'Close (Esc)', 'aria-label': 'Close', text: '×' });
  const thumb = el('canvas', { class: 'ref-thumb', width: 320, height: 200, 'aria-label': 'Current screen', role: 'img' });
  const chips = el('ul', { class: 'ref-chips', 'aria-label': 'Current settings' });
  const find = el('button', { type: 'button', class: 'ref-find', text: 'Find similar references' });
  // 결과 영역 = 늘 보이는 '비슷한 디자인 이펙트(실시간)' + 버튼을 눌렀을 때의 결과(out)
  const fxList = el('ul', { class: 'ref-fx-list' });
  const fxBox = el('div', { class: 'ref-fx' },
    el('h3', { class: 'ref-sub' }, el('i', { class: 'ref-live', 'aria-hidden': 'true' }), 'Similar design effects · live'),
    fxList);
  const out = el('div', { class: 'ref-out', 'aria-live': 'polite' });
  const results = el('div', { class: 'ref-results' }, fxBox, out);
  const keyIn = el('input', { type: 'password', class: 'ref-key-in', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false, 'aria-label': 'Claude API key' });
  const keySave = el('button', { type: 'button', class: 'ref-key-save', text: 'Save' });
  const keyRemember = el('input', { type: 'checkbox' });
  const keyNote = el('p', { class: 'ref-key-note' });
  const keyBox = el('details', { class: 'ref-key' },
    el('summary', { text: 'Claude API key' }),
    el('div', { class: 'ref-key-row' }, keyIn, keySave),
    el('label', { class: 'ref-key-rem' }, keyRemember, ' Remember on this computer'),
    keyNote);
  const panel = el('section', { class: 'card ref-panel', id: 'refPanel', role: 'dialog', 'aria-label': 'References', hidden: true },
    el('header', { class: 'c-head' }, el('span', { class: 'c-label', text: 'References' }), hint, close),
    el('div', { class: 'ref-now' }, thumb, chips),
    find, results, keyBox);
  hud.append(tab, panel);

  function renderKeyState() {
    const has = !!apiKey(), saved = !!storedKey();
    hint.textContent = has ? 'Claude' : 'keywords';
    keyRemember.checked = saved;
    keyIn.placeholder = has ? 'Saved — paste a new key to replace' : 'sk-ant-…';
    keyNote.textContent = has
      ? (saved ? 'Key saved on this computer. Save an empty field to remove it.' : 'Key kept for this session only.')
      : 'Without a key, references come from keywords. The key is sent only to api.anthropic.com.';
  }
  keySave.addEventListener('click', () => {
    const v = keyIn.value.trim();
    sessionKey = v;
    try { if (v && keyRemember.checked) localStorage.setItem(KEY_STORE, v); else localStorage.removeItem(KEY_STORE); } catch (e) { /* 저장 불가 — 세션에만 */ }
    keyIn.value = '';
    renderKeyState();
  });
  keyIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') keySave.click(); });

  // 썸네일 · 칩 · 실시간 이펙트 순위를 지금 상태로 (캡처는 한 번만)
  function refreshNow() {
    const st = readState();
    let v = null;
    try { v = snapshot(); } catch (e) { /* 캡처 없이 */ }
    if (v) try {
      const ctx = thumb.getContext('2d');
      // 16:10 로 가운데를 잘라 320 × 200 에
      const ar = 16 / 10, sw = Math.min(v.width, v.height * ar), sh = sw / ar;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 200);
      ctx.drawImage(v, (v.width - sw) / 2, (v.height - sh) / 2, sw, sh, 0, 0, 320, 200);
    } catch (e) { /* 썸네일 없이 */ }
    chips.replaceChildren();
    for (const m of st.modes) chips.append(el('li', { class: 'ref-chip on', text: NAMES[m] }));
    for (const c of st.cards.slice(0, 5)) chips.append(el('li', { class: 'ref-chip', text: `${c.label} ${c.value}` }));
    if (st.lab) chips.append(el('li', { class: 'ref-chip mix', text: 'Lab mix' }));
    return { st, view: v, top: updateLive(st, v) };   // v 가 없으면 화면 특징 없이 상태만으로
  }

  const section = (title) => el('h3', { class: 'ref-sub', text: title });
  // 이펙트 한 줄: 이름 · 유사도 막대 · 어디서 만드는지 · 만드는 법 · 왜 비슷한지 · 찾기 링크
  function effectItems(list) {
    return list.map((e) => el('li', { class: 'ref-fx-item' },
      el('div', { class: 'ref-fx-top' }, el('span', { class: 'ref-fx-name', text: e.name }), el('span', { class: 'ref-fx-pct', text: e.match + '%' })),
      el('div', { class: 'ref-fx-bar', 'aria-hidden': 'true' }, el('i', { style: `width:${e.match}%` })),
      e.tool ? el('p', { class: 'ref-fx-tool', text: e.tool }) : null,
      e.how ? el('p', { class: 'ref-fx-how', text: e.how }) : null,
      e.why ? el('p', { class: 'ref-fx-why', text: e.why }) : null,
      el('span', { class: 'ref-links' },
        ext('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(e.q), 'Images', 'ref-link'),
        ext('https://www.are.na/search/' + encodeURIComponent(e.q), 'Are.na', 'ref-link'),
        ext('https://www.youtube.com/results?search_query=' + encodeURIComponent(e.name + ' tutorial'), 'How-to', 'ref-link'))));
  }
  let liveTop = [];
  function updateLive(st, view) {
    liveTop = matchEffects(st, features(view), 5);
    fxList.replaceChildren(...effectItems(liveTop));
    return liveTop;
  }
  function renderResults({ description, effects, queries, artists, note }) {
    out.replaceChildren();
    if (note) out.append(el('p', { class: 'ref-note', text: note }));
    if (description) out.append(section('What Claude sees'), el('p', { class: 'ref-desc', text: description }));
    if (effects && effects.length) out.append(section('Claude · similar design effects'), el('ul', { class: 'ref-fx-list' }, ...effectItems(effects)));
    out.append(section('Similar images'));
    const grid = el('div', { class: 'ref-grid' }, el('p', { class: 'ref-wait', text: 'Loading images…' }));
    out.append(grid);
    out.append(section('Search'));
    const list = el('ul', { class: 'ref-queries' });
    for (const q of queries) {
      list.append(el('li', null, el('span', { class: 'ref-q', text: q }),
        el('span', { class: 'ref-links' }, ...LINKS.map(([name, url]) => ext(url(q), name, 'ref-link')))));
    }
    out.append(list);
    out.append(section('Artists & works'));
    const al = el('ul', { class: 'ref-artists' });
    for (const a of artists) {
      const g = 'https://www.google.com/search?q=' + encodeURIComponent(`${a.creator} ${a.title || ''}`.trim());
      al.append(el('li', null, ext(g, a.creator, 'ref-artist'), a.title ? el('span', { class: 'ref-work', text: ' — ' + a.title }) : null,
        a.why ? el('p', { class: 'ref-why', text: a.why }) : null));
    }
    out.append(al);
    return grid;
  }
  function fillImages(grid, blocks) {
    grid.replaceChildren();
    if (!blocks.length) { grid.append(el('p', { class: 'ref-wait', text: 'No images came back. Use the search links below.' })); return; }
    for (const b of blocks) {
      const a = ext('https://www.are.na/block/' + b.id, '', 'ref-img');
      a.title = b.title || b.generated_title || 'Are.na block';
      a.append(el('img', { src: b.image.thumb.url, alt: a.title, loading: 'lazy', referrerPolicy: 'no-referrer' }));
      grid.append(a);
    }
  }

  let runId = 0;
  async function run() {
    const id = ++runId;
    const { st, view, top } = refreshNow();
    find.disabled = true;
    const key = apiKey();
    let res = null, note = '';
    if (key && view) {
      find.textContent = 'Asking Claude…';
      out.replaceChildren(el('p', { class: 'ref-wait', text: 'Claude is comparing the screen with design effects…' }));
      const feat = features(view);
      try { res = await askClaude(key, st, view, feat, matchEffects(st, feat, 8)); } catch (e) { note = `Claude could not answer (${e.message}). Showing keyword results instead.`; }
      if (id !== runId) return;
    }
    // 검색어: 가장 비슷한 이펙트 두 개를 먼저 (이펙트를 쓴 디자인 이미지를 찾도록)
    const fxFirst = ((res && res.effects.length ? res.effects : top) || []).slice(0, 2).map((e) => e.q);
    const queries = [...new Set([...fxFirst, ...(res && res.keywords.length ? res.keywords : buildQueries(st))])].slice(0, 8);
    const artists = res && res.references.length ? res.references : buildArtists(st);
    const grid = renderResults({ description: res ? res.description : '', effects: res ? res.effects : null, queries, artists, note });
    results.scrollTop = 0;
    find.disabled = false; find.textContent = 'Find similar references';
    const blocks = await arenaImages(queries);
    if (id === runId) fillImages(grid, blocks);
  }
  find.addEventListener('click', run);

  // ── 열기 · 닫기 ──
  // 패널이 열려 있는 동안 2초마다 이펙트 순위를 다시 계산 — 기온·습도·모드를 바꾸면 바로 반영
  let liveTimer = 0;
  function liveTick() {
    if (panel.hidden || document.hidden || find.disabled) return;
    try { refreshNow(); } catch (e) { /* 다음 틱에 */ }
  }
  function open() {
    panel.hidden = false; tab.setAttribute('aria-expanded', 'true');
    renderKeyState(); refreshNow();
    clearInterval(liveTimer); liveTimer = setInterval(liveTick, 2000);
    find.focus({ preventScroll: true });
  }
  function shut() {
    if (panel.hidden) return;
    clearInterval(liveTimer); liveTimer = 0;
    panel.hidden = true; tab.setAttribute('aria-expanded', 'false');
    if (panel.contains(document.activeElement)) tab.focus({ preventScroll: true });
  }
  tab.addEventListener('click', () => (panel.hidden ? open() : shut()));
  close.addEventListener('click', shut);
  // 패널 안 키 입력은 작품(타이핑 · 스페이스 셔터 · R 녹화 · Ctrl+Z)으로 새지 않게
  for (const t of ['keydown', 'keyup', 'keypress']) panel.addEventListener(t, (e) => {
    e.stopPropagation();
    if (t === 'keydown' && e.key === 'Escape') { e.preventDefault(); shut(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) shut(); });

  renderKeyState();
  window.__REFPANEL__ = { open, close: shut, run, readState, buildQueries, buildArtists, features, matchEffects, effects: EFFECTS };   // 검증용
})();
