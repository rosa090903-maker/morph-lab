/*
 * 사진 → 성에 필드
 *  드래그해 넣은 사진을 화면 가운데에 크게 배치하고, 그 사진 영역을 '얼어붙는 판'으로 보는 필드를 만듭니다.
 *  frost.js 는 글자 대신 이 필드로 성에를 키웁니다 (사진 가장자리 → 중앙, 사진 밖으로 퍼짐, 창 테두리).
 *  - mask / dIn / dOut / noise / maxIn : textfield.js 의 글자 필드와 같은 형식
 *  - tone  : 사진 밝기(0~1) — 밝은 곳일수록 성에가 빽빽해져 사진의 형태가 성에 밀도로도 읽힘
 *  - chars : 사진 전체를 하나의 '조각'으로 (3D 얼음 판)
 *  - photo / photoCold : 출력 해상도 캔버스에 배치한 원본 / 얼어붙은 색감의 사진
 */
(function (DT) {
  'use strict';

  DT.PHOTO = {
    fit: [0.8, 0.72],   // 사진이 넘지 않을 비율 [가로, 세로] (캔버스 대비 — 넓은 화면에서 위아래가 잘려도 보이도록)
    coldFilter: 'saturate(0.35) brightness(0.9) contrast(1.06)',
    coldTint: 'rgba(150,190,240,0.55)',   // soft-light 로 덮는 얼음빛
  };

  // 정확한 유클리드 거리 대신, 사각형은 해석적으로 계산 (가장자리까지 거리)
  DT.buildPhotoField = function (img, w, h, outScale, seed) {
    const P = DT.PHOTO;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const k = Math.min((w * P.fit[0]) / iw, (h * P.fit[1]) / ih);
    const rw = iw * k, rh = ih * k, rx = (w - rw) / 2, ry = (h - rh) / 2;
    const N = w * h;
    const mask = new Float32Array(N), dIn = new Float32Array(N), dOut = new Float32Array(N);
    let maxIn = 0;
    for (let y = 0; y < h; y++) {
      const cy = y + 0.5;
      for (let x = 0; x < w; x++) {
        const cx = x + 0.5, i = y * w + x;
        const ix = Math.min(cx - rx, rx + rw - cx), iy = Math.min(cy - ry, ry + rh - cy);
        if (ix >= 0 && iy >= 0) {
          mask[i] = Math.min(1, Math.min(ix, iy) + 0.5);
          dIn[i] = Math.min(ix, iy);
          if (dIn[i] > maxIn) maxIn = dIn[i];
        } else {
          const ox = Math.max(0, -ix), oy = Math.max(0, -iy);
          dOut[i] = Math.hypot(ox, oy);
        }
      }
    }
    // 노이즈 (textfield.js 와 같은 방식의 값 노이즈)
    const nr = DT.mulberry32((seed ^ 0xA511E9B3) >>> 0);
    const vnoise = (cell) => {
      const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, g = new Float32Array(gw * gh);
      for (let i = 0; i < g.length; i++) g[i] = nr();
      const out = new Float32Array(N);
      for (let y = 0; y < h; y++) {
        const gy = y / cell, iy = gy | 0; let fy = gy - iy; fy = fy * fy * (3 - 2 * fy);
        for (let x = 0; x < w; x++) {
          const gx = x / cell, ix = gx | 0; let fx = gx - ix; fx = fx * fx * (3 - 2 * fx);
          const o = iy * gw + ix;
          out[y * w + x] = (g[o] + (g[o + 1] - g[o]) * fx) * (1 - fy) + (g[o + gw] + (g[o + gw + 1] - g[o + gw]) * fx) * fy;
        }
      }
      return out;
    };
    const n1 = vnoise(Math.max(8, Math.round(w / 34))), n2 = vnoise(Math.max(4, Math.round(w / 110)));
    const noise = new Float32Array(N);
    for (let i = 0; i < N; i++) noise[i] = 0.62 * n1[i] + 0.38 * n2[i];

    // 밝기 (격자 해상도)
    const tc = document.createElement('canvas'); tc.width = w; tc.height = h;
    const tctx = tc.getContext('2d', { willReadFrequently: true });
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(img, rx, ry, rw, rh);
    const td = tctx.getImageData(0, 0, w, h).data, tone = new Float32Array(N);
    for (let i = 0; i < N; i++) tone[i] = (0.2126 * td[i * 4] + 0.7152 * td[i * 4 + 1] + 0.0722 * td[i * 4 + 2]) / 255;

    // 출력 해상도: 사진 영역(흰 판), 원본 사진, 얼어붙은 색감의 사진
    const W = w * outScale, H = h * outScale, X = rx * outScale, Y = ry * outScale, RW = rw * outScale, RH = rh * outScale;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const glyphHi = mk(); { const g = glyphHi.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(X, Y, RW, RH); }
    const photo = mk(); { const g = photo.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, X, Y, RW, RH); }
    const photoCold = mk();
    {
      const g = photoCold.getContext('2d');
      g.filter = P.coldFilter; g.drawImage(photo, 0, 0); g.filter = 'none';
      g.globalCompositeOperation = 'soft-light'; g.fillStyle = P.coldTint; g.fillRect(X, Y, RW, RH);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(glyphHi, 0, 0);
      g.globalCompositeOperation = 'source-over';
    }

    return {
      w, h, lines: [], text: '', scale: w / 960,
      mask, dOut, dIn, noise, maxIn, tone,
      ring: new Int32Array(0), near: new Int32Array(0),
      glyphHi, outScale,
      chars: [{ ch: 'photo', line: 0, x0: X, x1: X + RW, y0: Y, y1: Y + RH }],
      photo, photoCold, rect: [X, Y, RW, RH],
    };
  };

  // File → HTMLImageElement (EXIF 회전은 브라우저가 처리)
  DT.loadImageFile = function (file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 0); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image file')); };
      img.src = url;
    });
  };
})(window.DT = window.DT || {});
