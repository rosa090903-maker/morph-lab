/*
 * 내보내기
 *  - PNG: 작품 캔버스만 (조절 UI 제외), 출력 해상도 그대로
 *  - SVG: V 농도장과 글자 잉크장을 마칭 스퀘어 등고선으로 변환한 '순수 벡터' 경로
 */
(function (DT) {
  'use strict';

  DT.sanitizeFilename = function (s) {
    let r = String(s).normalize('NFC')
      .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-. ]+$/g, '');
    if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(r)) r = '_' + r;
    return r.slice(0, 120) || 'diffuse-type';
  };

  DT.buildFilename = function (ext, info) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const text = Array.from(info.text || '').slice(0, 16).join('') || 'empty';
    const base = ['DIFFUSE-TYPE', text, info.city || 'manual', 'seed' + info.seed, stamp].map(DT.sanitizeFilename).join('_');
    return base + '.' + ext;
  };

  DT.downloadBlob = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  DT.exportPNG = function (canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG generation failed'))), 'image/png');
    });
  };

  // ---------- 마칭 스퀘어 ----------
  // field(w×h)를 값 0 으로 한 칸 둘러싸 모든 등고선이 닫히도록 한 뒤 iso 경계를 폐곡선 목록으로 반환
  const SEG = [
    [], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[3, 0], [2, 1]], [[0, 2]], [[0, 3]],
    [[0, 3]], [[0, 2]], [[0, 1], [3, 2]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], [],
  ];
  function contours(field, w, h, iso) {
    const W = w + 2, H = h + 2;
    const val = (x, y) => (x <= 0 || y <= 0 || x > w || y > h ? 0 : field[(y - 1) * w + (x - 1)]);
    const nE = W * H * 2;
    const nb1 = new Int32Array(nE).fill(-1), nb2 = new Int32Array(nE).fill(-1);
    const px = new Float32Array(nE), py = new Float32Array(nE);
    const hEdge = (x, y) => (y * W + x) * 2;       // (x,y)-(x+1,y)
    const vEdge = (x, y) => (y * W + x) * 2 + 1;   // (x,y)-(x,y+1)
    const link = (a, b) => {
      if (nb1[a] < 0) nb1[a] = b; else nb2[a] = b;
      if (nb1[b] < 0) nb1[b] = a; else nb2[b] = a;
    };
    for (let y = 0; y < H - 1; y++) {
      let tl = val(0, y), bl = val(0, y + 1);
      for (let x = 0; x < W - 1; x++) {
        const tr = val(x + 1, y), br = val(x + 1, y + 1);
        const c = (tl > iso ? 8 : 0) | (tr > iso ? 4 : 0) | (br > iso ? 2 : 0) | (bl > iso ? 1 : 0);
        if (c !== 0 && c !== 15) {
          const ids = [hEdge(x, y), vEdge(x + 1, y), hEdge(x, y + 1), vEdge(x, y)];
          const setP = (e) => {
            const id = ids[e];
            if (px[id] !== 0 || py[id] !== 0) return;
            let ax, ay, bx, by, va, vb;
            if (e === 0) { ax = x; ay = y; bx = x + 1; by = y; va = tl; vb = tr; }
            else if (e === 1) { ax = x + 1; ay = y; bx = x + 1; by = y + 1; va = tr; vb = br; }
            else if (e === 2) { ax = x; ay = y + 1; bx = x + 1; by = y + 1; va = bl; vb = br; }
            else { ax = x; ay = y; bx = x; by = y + 1; va = tl; vb = bl; }
            const t = Math.abs(vb - va) < 1e-9 ? 0.5 : (iso - va) / (vb - va);
            px[id] = ax + (bx - ax) * t + 1e-6; py[id] = ay + (by - ay) * t + 1e-6;
          };
          for (const s of SEG[c]) { setP(s[0]); setP(s[1]); link(ids[s[0]], ids[s[1]]); }
        }
        tl = tr; bl = br;
      }
    }
    const seen = new Uint8Array(nE), loops = [];
    for (let e = 0; e < nE; e++) {
      if (nb1[e] < 0 || seen[e]) continue;
      const pts = [];
      let prev = -1, cur = e;
      while (cur >= 0 && !seen[cur]) {
        seen[cur] = 1;
        pts.push(px[cur] - 0.5, py[cur] - 0.5); // 패딩 보정(-1) + 셀 중심(+0.5)
        const n = nb1[cur] !== prev ? nb1[cur] : nb2[cur];
        prev = cur; cur = n;
      }
      if (pts.length >= 8) loops.push(pts);
    }
    return loops;
  }

  // 닫힌 곡선 단순화 (Ramer–Douglas–Peucker)
  function simplify(pts, eps) {
    const n = pts.length / 2;
    if (n < 5) return pts;
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
      let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((pts[i * 2] - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / len;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
    return out;
  }

  function loopsToPath(loops, scale, eps, minArea) {
    const parts = [];
    for (const raw of loops) {
      const pts = simplify(raw, eps);
      if (pts.length < 6) continue;
      let area = 0;
      for (let i = 0, n = pts.length / 2; i < n; i++) {
        const j = (i + 1) % n;
        area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
      }
      if (Math.abs(area) / 2 < minArea) continue;
      let d = 'M' + (pts[0] * scale).toFixed(1) + ' ' + (pts[1] * scale).toFixed(1) + 'L';
      const seg = [];
      for (let i = 2; i < pts.length; i += 2) seg.push((pts[i] * scale).toFixed(1) + ' ' + (pts[i + 1] * scale).toFixed(1));
      parts.push(d + seg.join(' ') + 'Z');
    }
    return parts.join('');
  }

  const rgb = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const escapeXml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

  /*
   * V(w×h), 필드, 렌더 파라미터 → SVG 문자열 (순수 벡터)
   */
  DT.exportSVG = function (V, field, render, protect, meta, dotsSVG) {
    const opacity = render.opacity == null ? 1 : render.opacity;
    const glyphMix = render.glyphMix || 0;
    const { w, h } = field;
    const os = field.outScale;
    const OW = w * os, OH = h * os;
    const P = DT.PALETTE;
    const teal = mix3(P.teal, P.warmTeal, render.warmth), lime = mix3(P.lime, P.warmLime, render.warmth);
    const k = render.contrast;
    // 화면 셰이더의 패턴 경계(smoothstep 중간값 ≈ 0.22)에 맞춘 3단계 등고선
    const levels = [
      { iso: 0.2, color: mix3(P.bg, mix3(P.deep, teal, 0.5), 0.75).map((c) => c * k) },
      { iso: 0.28, color: mix3(P.deep, teal, 0.85).map((c) => c * k) },
      { iso: 0.4, color: mix3(teal, lime, 0.8).map((c) => c * k) },
    ];
    const patternPaths = opacity < 0.02 ? [] :
      levels.map((L) => ({ color: L.color, d: loopsToPath(contours(V, w, h, L.iso), os, 0.3, 1.2) }));

    // (선택) 면으로 된 글자: 고해상도 글자 알파 × (1 − 외곽 침식). 기본은 별가루 점이 글자를 대신함
    let glyphD = '';
    if (glyphMix > 0) {
    const gctx = field.glyphHi.getContext('2d');
    const gA = gctx.getImageData(0, 0, OW, OH).data;
    const ink = new Float32Array(OW * OH);
    const bil = (arr, sx, sy) => {
      sx = Math.min(w - 1, Math.max(0, sx)); sy = Math.min(h - 1, Math.max(0, sy));
      const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const a = arr[y0 * w + x0], b = arr[y0 * w + x1], c = arr[y1 * w + x0], d = arr[y1 * w + x1];
      return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };
    for (let y = 0; y < OH; y++) {
      for (let x = 0; x < OW; x++) {
        const i = y * OW + x, a = gA[i * 4 + 3] / 255;
        if (a <= 0) continue;
        const sx = (x + 0.5) / os - 0.5, sy = (y + 0.5) / os - 0.5;
        const v = bil(V, sx, sy), dIn = bil(field.dIn, sx, sy);
        const eaten = smooth(0.16, 0.34, v) * (1 - smooth(protect, protect + 1.5, dIn));
        ink[i] = a * (1 - eaten);
      }
    }
    glyphD = loopsToPath(contours(ink, OW, OH, 0.5), 1, 0.25, 0.5);
    }

    const desc = `Vector SVG — Gray–Scott V concentration contours (${levels.map((l) => l.iso).join(', ')}) traced with marching squares, plus the stardust dots (circles) forming the glyphs and background stars. On-screen twinkle, nebula bloom, shading and vignette are not included.`;
    const out = [];
    out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${OW}" height="${OH}" viewBox="0 0 ${OW} ${OH}">`);
    out.push(`<title>${escapeXml('DIFFUSE TYPE — ' + meta.text)}</title>`);
    out.push(`<desc>${escapeXml(desc + ' Seed ' + meta.seed + ', pattern ' + meta.preset + ', environment ' + meta.city + ', step ' + meta.step)}</desc>`);
    out.push(`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rgb(P.bgTop)}"/><stop offset="1" stop-color="${rgb(P.bgBot)}"/></linearGradient></defs>`);
    out.push(`<rect width="100%" height="100%" fill="url(#bg)"/>`);
    const fo = opacity < 0.999 ? ` fill-opacity="${opacity.toFixed(3)}"` : '';
    for (const p of patternPaths) if (p.d) out.push(`<path fill="${rgb(p.color)}"${fo} fill-rule="evenodd" d="${p.d}"/>`);
    if (glyphD) out.push(`<path fill="${rgb(P.ivory)}" fill-opacity="${glyphMix}" fill-rule="evenodd" d="${glyphD}"/>`);
    if (dotsSVG) out.push(dotsSVG);
    out.push(`</svg>`);
    return out.join('\n');
  };

  DT._contours = contours; // 검증용
})(window.DT = window.DT || {});
