/*
 * 성에(서리 결정) 레이어 — 차가운 환경(scene.frost)에서만 동작
 *
 * 글자는 외곽선이 아니라 '성에 밀도'로 읽힙니다.
 *  - 글자 안: 작은 결정핵이 촘촘하게 생기고 잔가지를 많이 내어 빽빽해짐 (밀도 1)
 *  - 글자 밖: 거리가 멀수록 결정핵이 드물고, 가지가 덜 갈라지고, 더 옅어짐
 *  - 창 가장자리: 실제 유리창처럼 화면 테두리에서도 성에가 안쪽으로 피어남
 *
 * 가장자리 → 중앙: 세 개의 '성장 전선'이 시간에 따라 전진합니다.
 *  - 글자 안 전선: 획 가장자리로부터의 깊이(dIn). 전선이 지나간 깊이까지만 결정핵이 생기고 가지가 자람
 *  - 글자 밖 전선: 글자로부터의 거리(dOut). 확산 범위(spreadRadius)를 넘지 않음
 *  - 창 테두리 전선: 화면 가장자리로부터의 거리
 *  결정핵은 전선 기준 거리 순으로 정렬된 후보에서 차례로 생기고, 글자 안의 결정은 안쪽을 향해 뻗으므로
 *  가장자리에서 시작한 결정들이 안쪽으로 번지며 서로 맞닿아 연결됩니다.
 *
 * 판(plate) 두 장: 글자 성에(부유 움직임을 따름) / 창 테두리 성에(유리에 고정)
 *  - 누적 캔버스: 매 프레임 '새로 자란 마디'만 그려 쌓으므로 결정이 많아져도 비용이 일정합니다.
 *  - 점유 격자: 다른 결정과 부딪힌 가지는 멈춥니다(결정끼리 맞닿아 연결되는 모양).
 *
 * 온도: 적용 온도가 목표 온도를 부드럽게 따라가며 성장 속도·크기·밀도·범위를 매 프레임 계산.
 *  - 추울수록 빠르고, 크고, 촘촘하게. 따뜻할수록 느리고, 작고, 성기게.
 *  - 범위가 줄면 바깥 서리가 천천히 녹고, 추워지면 멈춰 있던 가지 끝이 다시 자랍니다.
 *  - 녹는점(meltPoint)을 넘으면 성장이 멈추고 전체가 아래로 살짝 흘러내리며 옅어져 녹습니다.
 *    다 녹은 뒤 다시 추워지면 처음처럼 가장자리부터 다시 피어납니다.
 *
 * 얼음 조형: 획 깊이를 높이로 본 베벨 표면(법선 → 빛 받는 면/그늘/하이라이트) + 유리에 지는 그림자.
 *  성에는 이 반투명 얼음 면 위에 쌓이고, 같은 빛·그늘을 받아 입체 표면 위에 자란 것처럼 보입니다.
 *  3D: 글자마다 잘라 낸 앞면을 3D 회전(아핀 + 약한 원근)으로 그리고, 실루엣 단면을 깊이 방향으로 쌓아 두께를 만듭니다.
 *  커서를 올리면 글자가 돌아보고, 드래그하면 전체 시점이 돕니다(스프링·관성).
 * 바람: 추울수록 강함(녹는 중에는 약해짐). 세기(wind.w)와 돌풍(gust)을 점 레이어가 글자 움직임에 쓰고,
 *  글자 가장자리에서는 얼음 조각이, 화면에는 옅은 바람결이 바람 방향으로 흩날립니다.
 * 결정 배치는 시드로 고정됩니다.
 */
(function (DT) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const lerp = (r, t) => r[0] + (r[1] - r[0]) * t;
  const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  // [따뜻할 때, 추울 때] — 길이는 1920 폭 기준 px
  DT.FROST = {
    controlRange: [-60, 60],      // 컨트롤 바 기온 범위(°C) — +10 °C 위에서는 미생물이 자람 (js/microbe.js)
    tempRange: [-60, 0],          // 성장 파라미터가 변하는 범위(°C). 낮을수록 추움 — Frost 모드 구간(0° 이하) 전체
    meltPoint: 0,                 // 이 기온 이하 = 극지(성에가 자람), 넘으면 녹기 시작(°C) — DT.ICE.frostPoint 와 같게
    sizePeak: -15,                // 결정이 가장 크게 자라는 기온(°C) — 0 °C 와 아주 추운 쪽으로 작아짐 (maxCrystalSize)
    meltSpan: 8,                  // 녹는점 위로 이만큼 올라가면 가장 빠르게 녹음(°C)
    meltTime: [7, 2.2],           // 다 녹는 데 걸리는 시간(초) [녹는점 바로 위, meltSpan 이상]
    tempFollow: 2.2,              // 목표 → 적용 온도 추종 속도(1/초). 갑작스러운 변화 방지
    /*
     * 성장 시뮬레이션은 '어디에 얼마나' 성에가 덮였는지(덮임 지도)만 정하고, 눈에 보이는 결은
     * 화면 전체 크기의 미세 결정 텍스처(buildMicro)가 그 덮임만큼 드러나며 만듭니다.
     * → 큰 나뭇가지·눈송이 모양 없이, 작은 결정들이 이어져 표면을 덮는 성에. 밀도 차이로 글자가 읽힘
     */
    growthRate: [10, 52],         // 덮임이 번져 나가는 속도(px/초)
    frontRate: [4, 16],            // 글자 안 성장 전선(가장자리 → 중앙) 전진 속도(px/초)
    maxCrystalSize: [4, 16],      // 한 결정 무리가 뻗는 평균 최대 길이(px)
    spreadRadius: [8, 80],        // 글자 밖으로 성에가 퍼지는 최대 거리(px)
    borderExtent: [0.02, 0.11],   // 창 테두리 성에 폭 (화면 짧은 변 대비)
    sideSpacing: [4, 1.8],        // 갈래 간격(px) — 추울수록 촘촘
    sideLength: [0.35, 0.8],      // 갈래 길이 = 남은 길이 × 이 값
    subBranch: [0.25, 0.85],      // 갈래의 갈래 비율
    nucleation: [120, 760],       // 초당 결정핵 생성 수
    budget: [1400, 9000],         // 결정핵 총 개수 상한 (밀도) — 사진 판은 글자보다 넓어서 늘림
    maxBranches: 48000,           // 가지 총 개수 상한 (성능)
    // 덮임 지도에 칠하는 부드러운 붓 (1/4 해상도에서 확대되어 경계가 흐릿한 얼룩이 됨)
    cover: { width: [7, 5.5, 4.5, 3.5], alpha: [0.2, 0.16, 0.13, 0.1] },   // 세대별 폭(px, 1920 기준)·불투명도
    // 미세 결정 텍스처 (1920 폭 기준 px)
    micro: { density: 1 / 46, seg: [0.7, 2.0], steps: [2, 7], width: [0.38, 0.75], fork: 0.32, film: [0.16, 0.36], sparkle: 1 / 900 },
    // 얼음 조형(입체 글자)
    ice: {
      bevel: 7,                   // 베벨(둥글게 솟은 가장자리) 폭 (격자 셀, 960 기준)
      depth: 10,                  // 옆면 두께(px)
      light: [-0.55, -0.65, 0.75],// 빛 방향 (왼쪽 위에서)
      bodyAlpha: [0.15, 0.24],    // 얼음 면 불투명도 [면 가운데, 가장자리] — 외곽이 빛나 보이지 않게 차이를 작게
      shade: 0.5,                 // 빛 반대쪽 면의 그늘 세기
      spec: 0.45,                 // 하이라이트 세기 (절제)
      shadow: 0.14,               // 유리에 지는 그림자
    },
    // 3D 얼음 조형: 글자마다 돌출된 입체 (앞면 + 두께 + 뒷면), 글자별·전체 회전, 관성 있는 조작
    sculpt: {
      depth: 64,                  // 두께(px, 1920 기준) — 커진 글자에 맞춘 두께
      layers: 12,                 // 두께를 그리는 단면 수
      persp: 2600,                // 원근 초점 거리(px)
      rest: [-0.2, 0.1],          // 기본 시점 [좌우 회전, 위아래 기울기](rad) — 가만히 있어도 두께가 보이게
      letterRest: 0.06,           // 글자마다 번갈아 살짝 다른 방향 (조형물처럼)
      hover: [0.5, 0.32],         // 커서 쪽으로 도는 정도 [좌우, 위아래](rad)
      spring: 34, damp: 8,        // 글자 회전 스프링 (관성 있게, 튀지 않게)
      drag: 0.0022,               // 드래그 감도 (rad/px)
      dragLimit: [0.72, 0.5],     // 드래그 회전 한계 [좌우, 위아래]
      ret: 0.9,                   // 손을 떼면 기본 시점으로 천천히 돌아오는 힘
    },
    // 바람: 추울수록 강함. 녹는 중에는 약해짐 (방향: 북동풍 → 화면 왼쪽 아래로)
    wind: {
      curve: 1.25,                // 세기 = cold ^ curve × (1 − 녹음)
      follow: 1.2,                // 세기 변화 추종 속도(1/초)
      dir: [-0.97, 0.24],
      drift: 170,                 // 글자 가장자리에서 날리는 얼음 조각 (초당, 최대 세기)
      driftSpeed: [260, 600],     // 조각 속도(px/초)
      streaks: 20,                // 화면을 가르는 옅은 바람결 수 (최대 세기)
    },
  };

  // 온도(°C) → 성에 파라미터
  DT.frostLevels = function (temp) {
    const F = DT.FROST;
    const cold = 1 - clamp01((temp - F.tempRange[0]) / (F.tempRange[1] - F.tempRange[0]));
    return {
      cold,
      melt: clamp01((temp - F.meltPoint) / F.meltSpan), // 0 이면 얼어 있음, >0 녹는 중
      melting: temp > F.meltPoint,
      growthRate: lerp(F.growthRate, Math.pow(cold, 1.15)),
      frontRate: lerp(F.frontRate, cold),
      // 결정 크기: sizePeak(−15 °C)에서 가장 큼, 녹는점(0 °C)과 가장 추운 쪽(−60 °C)으로 작아짐 — 범위 [4, 16] 그대로
      maxCrystalSize: lerp(F.maxCrystalSize, temp >= F.sizePeak ? sstep((F.meltPoint - temp) / (F.meltPoint - F.sizePeak)) : sstep((temp - F.tempRange[0]) / (F.sizePeak - F.tempRange[0]))),
      spreadRadius: lerp(F.spreadRadius, cold),
      borderExtent: lerp(F.borderExtent, cold),
      sideSpacing: lerp(F.sideSpacing, cold),
      sideLength: lerp(F.sideLength, cold),
      subBranch: lerp(F.subBranch, cold),
      nucleation: lerp(F.nucleation, cold),
      budget: Math.round(lerp(F.budget, cold)),
    };
  };

  DT.createFrostLayer = function () {
    const F = DT.FROST;
    const GS = 0.25, NB = 4, NG = 4;
    // 판: 0 글자(부유), 1 창 테두리(고정)
    const plates = [0, 1].map(() => {
      const cvs = document.createElement('canvas'), glow = document.createElement('canvas');
      const seg = []; for (let i = 0; i < NG * NB; i++) seg.push([]);
      // glow = 덮임 지도(1/4 해상도), cvs = 보이는 성에(미세 결정 텍스처 ∩ 덮임), stale = cvs 를 다시 만들어야 함
      return { cvs, octx: cvs.getContext('2d'), glow, gctx: glow.getContext('2d'), seg, dirty: false, stale: false };
    });
    let micro = null;   // 미세 결정 텍스처 (W×H, 한 번 생성)
    const melt = document.createElement('canvas'), mctx = melt.getContext('2d'); // 격자 해상도 녹임 마스크
    let W = 0, H = 0, scale = 1, minWH = 1, field = null, os = 1, fw = 0, fh = 0, maxDepth = 0;
    let rng = Math.random, nuclei = 0, treeN = 0;
    // 결정핵 후보: 0 글자 안, 1 글자 밖, 2 창 테두리 — 각각 '전선 기준 거리' 순으로 정렬
    let lists = [], ptr = [0, 0, 0], acc = [0, 0, 0];
    let front = [0, 0, 0];
    let branches = [], dead = 0;
    let occ = null, occW = 0, occH = 0, occC = 3;
    let running = false, alpha = 0, alphaTarget = 0;
    let tempT = -40, tempS = -40;
    let reachSp = 0, reachExt = 0, meltT = 0, meltRebuildT = 0, meltImg = null;
    let thaw = 0;   // 녹는점 위에서 녹은 정도 0~1 (1 이면 다 녹음)
    let sag = 0;    // 녹으면서 아래로 처지는 거리(px) — 부드럽게 따라감
    // 얼음 조형 지도 (글자마다 한 번 계산)
    const comp = document.createElement('canvas'), cctx = comp.getContext('2d');   // 매 프레임 합성
    const side = document.createElement('canvas');                                  // 옆면(두께)
    const bodyMap = document.createElement('canvas'), shadeMap = document.createElement('canvas'), specMap = document.createElement('canvas');
    const shadowMap = document.createElement('canvas');
    const edgeMap = document.createElement('canvas');   // 모서리에 뭉친 성에 (획 가장자리 띠, 불규칙한 두께)
    let edgeCells = null;   // 바람에 날릴 조각이 생기는 글자 가장자리 위치
    // 바람
    let windS = 0, wtime = 0, gust = 0.5;
    const drift = [], streaks = [];
    // 3D 글자
    let letters = [], textC = [0, 0];
    const G = { yaw: 0, pitch: 0, vy: 0, vp: 0, drag: false };   // 전체 시점
    let hoverP = null;                                            // 커서 위치 (캔버스 px) 또는 null
    // 사진 (photo.js 필드): 3D 얼음 판의 앞면에 그려짐. freeze = 극지 정도 0~1 (기온이 녹는점 이하이면 1로)
    let photo = null, photoCold = null, photoA = 0, freeze = 0;
    const rgba = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

    const gidx = (x, y) => {
      let gx = (x / os) | 0, gy = (y / os) | 0;
      if (gx < 0) gx = 0; else if (gx >= fw) gx = fw - 1;
      if (gy < 0) gy = 0; else if (gy >= fh) gy = fh - 1;
      return gy * fw + gx;
    };
    const edgeOf = (x, y) => Math.min(x, y, W - x, H - y);
    const occAt = (x, y) => {
      const cx = (x / occC) | 0, cy = (y / occC) | 0;
      return (cx < 0 || cy < 0 || cx >= occW || cy >= occH) ? -1 : cy * occW + cx;
    };
    const gradAngle = (arr, gx, gy) => { // arr 가 커지는 방향
      const at = (x, y) => arr[Math.min(fh - 1, Math.max(0, y)) * fw + Math.min(fw - 1, Math.max(0, x))];
      const dx = at(gx + 1, gy) - at(gx - 1, gy), dy = at(gx, gy + 1) - at(gx, gy - 1);
      return Math.hypot(dx, dy) > 0.2 ? Math.atan2(dy, dx) : rng() * TAU;
    };

    // 현재 허용 범위 (전선은 시간에 따라 전진, 온도는 상한을 정함)
    const lim = { depth: 0, sp: 0, ext: 0 };
    function limits(L) {
      lim.depth = front[0];
      lim.sp = Math.min(L.spreadRadius * scale, front[1]);
      lim.ext = Math.min(L.borderExtent * minWH, front[2]);
    }
    // 위치의 성에 밀도(0~1)
    function density(x, y) {
      const gi = gidx(x, y), dOut = field.dOut[gi] * os;
      if (dOut <= 0) return field.tone ? 0.45 + 0.55 * field.tone[gi] : 1;   // 사진: 밝은 곳일수록 빽빽하게
      const g = Math.exp(-dOut / (0.33 * Math.max(lim.sp, 4 * scale))) * 0.55;
      const e = lim.ext > 0 ? 0.55 * Math.max(0, 1 - edgeOf(x, y) / lim.ext) : 0;
      return Math.max(g, e);
    }
    function allowed(x, y) {
      const i = gidx(x, y), dOut = field.dOut[i] * os;
      if (dOut <= 0) return field.dIn[i] * os <= lim.depth + 1.5 * scale;
      return dOut <= lim.sp || edgeOf(x, y) <= lim.ext;
    }

    function clearPlates() {
      for (const p of plates) {
        p.octx.clearRect(0, 0, p.cvs.width, p.cvs.height);
        p.gctx.clearRect(0, 0, p.glow.width, p.glow.height);
        p.dirty = false; p.stale = false;
      }
    }

    /*
     * 미세 결정 텍스처 (화면 크기 한 장 — 타일 반복 없음, 시드 고정)
     *  1) 반투명 얼음 막: 1.5~10px 크기의 값 노이즈로 미세한 명도 차이
     *  2) 작은 결정: 0.7~2px 마디 2~7개가 불규칙하게 꺾이며 이어지는 짧은 사슬 + 짧은 갈래 — 서로 겹쳐 그물처럼 연결
     *  3) 아주 드문 1px 반짝임
     *  확대해도 픽셀이 커진 느낌이 아니라 결정 결이 보이도록, 선은 화면 해상도 그대로(서브픽셀 굵기) 그림
     */
    function buildMicro(w, h) {
      const M = F.micro, s = Math.max(0.6, w / 1920);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      const R = DT.mulberry32(0xF2057E);
      // 1) 얼음 막
      const img = g.createImageData(w, h), d = img.data;
      const grid = (cell) => { const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, a = new Float32Array(gw * gh); for (let i = 0; i < a.length; i++) a[i] = R(); return { a, gw, cell }; };
      const g1 = grid(1.6 * s), g2 = grid(4 * s), g3 = grid(10 * s);
      const vn = (G, x, y) => {
        const fx0 = x / G.cell, fy0 = y / G.cell, ix = fx0 | 0, iy = fy0 | 0;
        let fx = fx0 - ix, fy = fy0 - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        const o = iy * G.gw + ix, a = G.a;
        return (a[o] + (a[o + 1] - a[o]) * fx) * (1 - fy) + (a[o + G.gw] + (a[o + G.gw + 1] - a[o + G.gw]) * fx) * fy;
      };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const n = 0.35 * vn(g1, x, y) + 0.4 * vn(g2, x, y) + 0.25 * vn(g3, x, y);
          const o = (y * w + x) * 4, v = 0.9 + 0.1 * n;
          d[o] = 226 * v; d[o + 1] = 240 * v; d[o + 2] = 252 * v;
          d[o + 3] = 255 * (M.film[0] + (M.film[1] - M.film[0]) * n);
        }
      }
      g.putImageData(img, 0, 0);
      // 2) 결정 사슬 (불투명도 4단계로 묶어 한 번에 그림)
      const bins = [[], [], [], []];
      const count = Math.round(w * h * M.density / (s * s));
      for (let k = 0; k < count; k++) {
        let x = R() * w, y = R() * h, a = R() * Math.PI * 2;
        const b = bins[(R() * 4) | 0];
        const n = M.steps[0] + ((R() * (M.steps[1] - M.steps[0] + 1)) | 0);
        for (let i = 0; i < n; i++) {
          a += (R() - 0.5) * 1.5;
          const L = (M.seg[0] + R() * (M.seg[1] - M.seg[0])) * s;
          const nx = x + Math.cos(a) * L, ny = y + Math.sin(a) * L;
          b.push(x, y, nx, ny);
          if (R() < M.fork) { const fa = a + (R() < 0.5 ? 1 : -1) * (0.7 + R() * 0.9), fl = L * (0.4 + R() * 0.6); b.push(nx, ny, nx + Math.cos(fa) * fl, ny + Math.sin(fa) * fl); }
          x = nx; y = ny;
        }
      }
      g.lineCap = 'round';
      bins.forEach((b, i) => {
        g.beginPath();
        for (let j = 0; j < b.length; j += 4) { g.moveTo(b[j], b[j + 1]); g.lineTo(b[j + 2], b[j + 3]); }
        g.lineWidth = (M.width[0] + (M.width[1] - M.width[0]) * (i / 3)) * s;
        g.strokeStyle = `rgba(${240 + i * 4},${248 + i * 2},255,${(0.32 + 0.16 * i).toFixed(2)})`;
        g.stroke();
      });
      // 3) 드문 반짝임
      const sp = Math.round(w * h * M.sparkle);
      for (let k = 0; k < sp; k++) { g.fillStyle = `rgba(255,255,255,${(0.45 + R() * 0.45).toFixed(2)})`; g.fillRect((R() * w) | 0, (R() * h) | 0, 1, 1); }
      return c;
    }
    // 보이는 성에 = 미세 결정 텍스처를 덮임 지도(부드럽게 확대)만큼 드러냄
    function refreshVis(pl) {
      if (!pl.stale) return;
      pl.stale = false;
      if (!micro || micro.width !== W || micro.height !== H) micro = buildMicro(W, H);
      const c = pl.octx;
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.clearRect(0, 0, W, H);
      c.drawImage(micro, 0, 0);
      c.globalCompositeOperation = 'destination-in';
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(pl.glow, 0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
    }
    function clearAll() {
      clearPlates();
      branches = []; dead = 0;
      if (occ) occ.fill(0);
      reachSp = reachExt = 0; meltT = 0;
    }
    // 다 녹은 뒤: 처음처럼 가장자리부터 다시 피어나도록 전선과 후보를 되돌림
    function restartGrowth() {
      clearAll();
      ptr = [0, 0, 0]; acc = [0, 0, 0]; front = [0, 0, 0]; nuclei = 0;
    }

    function addBranch(x, y, a, frac, gen, tree, plate) {
      if (branches.length >= F.maxBranches) return;
      branches.push({ x, y, a, curl: (rng() - 0.5) * 0.05 / scale, len: 0, frac, gen, tree, plate, next: 0, side: rng() < 0.5 ? 1 : -1, dead: false });
    }
    const sizeVar = () => Math.exp((rng() + rng() + rng() - 1.5) * 0.7); // 크기 편차 (로그정규 비슷)

    // 결정핵: 크기·가지 수·방향을 매번 다르게 (반복되는 브러시처럼 보이지 않도록)
    function spawnNucleus(kind, x, y) {
      const oi = occAt(x, y);
      if (oi < 0 || occ[oi]) return false;
      const tree = ++treeN;
      occ[oi] = tree;
      nuclei++;
      const gx = Math.min(fw - 1, (x / os) | 0), gy = Math.min(fh - 1, (y / os) | 0);
      let base, size;
      if (kind === 0) { base = gradAngle(field.dIn, gx, gy); size = 1; }               // 글자 안: 중앙을 향해
      else if (kind === 1) { base = gradAngle(field.dOut, gx, gy); size = 1.5; }       // 글자 밖: 바깥으로
      else {                                                                             // 창 테두리: 화면 안쪽으로
        const e = [x, y, W - x, H - y], k = e.indexOf(Math.min.apply(null, e));
        base = [0, Math.PI / 2, Math.PI, -Math.PI / 2][k]; size = 2.2;
      }
      const plate = kind === 2 ? 1 : 0;
      const n = 1 + Math.floor(rng() * 3) + (rng() < 0.25 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const a = base + (rng() - 0.5) * (k === 0 ? 1.2 : 2.6);
        addBranch(x, y, a, size * sizeVar() * (k === 0 ? 1 : 0.65), 0, tree, plate);
      }
      if (rng() < 0.3) addBranch(x, y, base + Math.PI + (rng() - 0.5), size * 0.35 * sizeVar(), 0, tree, plate);
      return true;
    }

    function nucleate(dt, L) {
      if (nuclei >= L.budget) return;
      const share = [0.66, 0.14, 0.2];
      const gate = [lim.depth, lim.sp, lim.ext];
      for (let k = 0; k < 3; k++) {
        const list = lists[k];
        acc[k] = Math.min(acc[k] + L.nucleation * share[k] * dt, 30);
        let tries = 0;
        while (acc[k] >= 1 && ptr[k] < list.n && list.key[ptr[k]] <= gate[k] && tries++ < 60) {
          const j = ptr[k]++;
          if (spawnNucleus(k, list.x[j], list.y[j])) acc[k]--;
          if (nuclei >= L.budget) return;
        }
      }
    }

    function grow(dt, L) {
      const maxS = L.maxCrystalSize * scale;
      const rate = L.growthRate * scale * dt;
      const sp = L.sideSpacing * scale;
      const n0 = branches.length;
      for (let k = 0; k < n0; k++) {
        const b = branches[k];
        if (b.dead) continue;
        const limit = b.frac * maxS;
        if (b.len >= limit) continue;          // 최대 크기 — 추워지면 다시 자람
        if (!allowed(b.x, b.y)) continue;      // 전선/범위 밖 — 전선이 오거나 추워지면 다시 자람
        const step = Math.min(rate * (b.gen ? 0.8 : 1) * (1 - 0.45 * b.len / limit), 2.2 * scale + 0.8);
        b.a += b.curl * step + (rng() - 0.5) * 0.18;
        const nx = b.x + Math.cos(b.a) * step, ny = b.y + Math.sin(b.a) * step;
        const oi = occAt(nx, ny);
        if (oi < 0 || (occ[oi] && occ[oi] !== b.tree)) { b.dead = true; dead++; continue; } // 다른 결정과 맞닿음
        occ[oi] = b.tree;
        const d = density(nx, ny);
        plates[b.plate].seg[b.gen * NB + Math.min(NB - 1, (d * NB) | 0)].push(b.x, b.y, nx, ny);
        b.x = nx; b.y = ny; b.len += step;
        if (!b.next) b.next = sp * (0.4 + 0.9 * rng());
        // 잔가지: 34~74° 사이 불규칙한 각도, 줄기 끝으로 갈수록 짧게. 밀도가 낮은 곳은 덜 갈라짐
        while (b.len >= b.next && b.gen < NG - 1) {
          b.next += sp * (0.6 + 0.9 * rng()) * (b.gen ? 0.75 : 1);
          const p = (b.gen === 0 ? 1 : b.gen === 1 ? 0.85 : L.subBranch * 0.7) * (0.3 + 0.7 * d);
          if (rng() > p) continue;
          const cl = (limit - b.len) * L.sideLength * (0.4 + 0.8 * rng());
          if (cl < 1.5 * scale) continue;
          const sides = rng() < 0.3 ? [1, -1] : [b.side];
          b.side = -b.side;
          for (const s of sides) addBranch(b.x, b.y, b.a + s * (0.6 + 0.7 * rng()), cl / maxS, b.gen + 1, b.tree, b.plate);
        }
      }
      // 덮임 지도에 부드러운 붓으로 칠함 (1/4 해상도 — 확대되면 경계 없는 얼룩). 보이는 결은 refreshVis 에서
      for (const pl of plates) {
        const { gctx, seg } = pl;
        gctx.lineCap = 'round'; gctx.lineJoin = 'round';
        for (let g = 0; g < NG; g++) {
          for (let bk = 0; bk < NB; bk++) {
            const s = seg[g * NB + bk];
            if (!s.length) continue;
            const am = (bk + 1) / NB;
            gctx.beginPath();
            for (let i = 0; i < s.length; i += 4) { gctx.moveTo(s[i] * GS, s[i + 1] * GS); gctx.lineTo(s[i + 2] * GS, s[i + 3] * GS); }
            gctx.lineWidth = Math.max(0.7, F.cover.width[g] * scale * GS);
            gctx.strokeStyle = `rgba(255,255,255,${(F.cover.alpha[g] * am).toFixed(3)})`;
            gctx.stroke();
            s.length = 0;
            pl.dirty = true; pl.stale = true;
          }
        }
      }
      if (dead > 3000 && dead > branches.length / 2) { branches = branches.filter((b) => !b.dead); dead = 0; }
    }

    // 따뜻해져 범위가 줄면: 글자 밖 + 창 테두리 범위를 벗어난 서리를 녹임 (글자 안은 유지)
    function rebuildMelt(sp, ext) {
      const fe = 6 * scale;
      const d = meltImg.data, dOut = field.dOut;
      for (let gy = 0; gy < fh; gy++) {
        for (let gx = 0; gx < fw; gx++) {
          const i = gy * fw + gx;
          const e = Math.min(gx + 0.5, gy + 0.5, fw - gx - 0.5, fh - gy - 0.5) * os;
          d[i * 4 + 3] = 255 * Math.min(sstep((dOut[i] * os - sp) / fe), sstep((e - ext) / fe));
        }
      }
      mctx.putImageData(meltImg, 0, 0);
      const gone = (x, y) => field.dOut[gidx(x, y)] * os > sp + fe && edgeOf(x, y) > ext + fe;
      for (let cy = 0; cy < occH; cy++) {
        for (let cx = 0; cx < occW; cx++) {
          const k = cy * occW + cx;
          if (occ[k] && gone((cx + 0.5) * occC, (cy + 0.5) * occC)) occ[k] = 0;
        }
      }
      for (const b of branches) if (!b.dead && gone(b.x, b.y)) { b.dead = true; dead++; }
    }
    function eachCtx(fn) { for (const p of plates) { fn(p.octx, p.cvs.width, p.cvs.height, 1); fn(p.gctx, p.glow.width, p.glow.height, GS); p.stale = true; } }

    // 녹는점 위: 옅은 잔가지부터 가늘어지며(destination-out), 전체가 옅어지고 아래로 조금 처짐(draw 에서)
    function thawStep(dt, L) {
      if (!branches.length && !plates[0].dirty && !plates[1].dirty) return; // 이미 다 녹음
      thaw = Math.min(1, thaw + dt / lerp(F.meltTime, L.melt));
      eachCtx((c, w, h) => {
        c.globalCompositeOperation = 'destination-out';
        c.globalAlpha = Math.min(1, dt * (0.35 + 0.7 * L.melt));
        c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      });
      if (thaw >= 1) { restartGrowth(); thaw = 0; sag = 0; }
    }
    // 녹다가 다시 얼면: 지금 보이는 옅어진 상태를 캔버스에 굳혀서 '되살아나는' 현상 없이 이어서 자람
    function bakeThaw() {
      const a = sstep(thaw);
      if (a > 0.003) eachCtx((c, w, h) => {
        c.globalCompositeOperation = 'destination-out'; c.globalAlpha = a; c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      });
      // 꽤 녹았다면: 옅게 남은 흔적 위로 다시 가장자리부터 새 결정이 피어나도록 성장 상태만 되돌림
      if (a > 0.25) {
        branches = []; dead = 0; occ.fill(0);
        ptr = [0, 0, 0]; acc = [0, 0, 0]; front = [0, 0, 0]; nuclei = 0; reachSp = reachExt = 0;
      }
      thaw = 0;
    }

    /*
     * 얼음 조형 지도: 획 깊이(dIn)를 높이로 보고 가장자리가 둥글게 솟은 베벨 표면을 만든 뒤
     *  - bodyMap  : 반투명 얼음 면 (가장자리일수록 진함 = 프레넬), 빛 받는 면은 밝게
     *  - shadeMap : 빛 반대쪽 면의 차가운 그늘 (얼음 면 + 성에 위에 source-atop)
     *  - specMap  : 베벨 모서리의 하이라이트
     *  - side     : 오른쪽 아래로 밀린 얇은 옆면(두께)
     *  - shadowMap: 유리에 지는 흐린 그림자 (글자보다 덜 움직여 깊이감)
     */
    function buildIce(f) {
      const I = F.ice, N = fw * fh, dIn = f.dIn, mask = f.mask;
      const bevel = Math.max(2, Math.min(f.maxIn * 0.9, I.bevel * f.scale));
      const h = new Float32Array(N);
      for (let i = 0; i < N; i++) h[i] = mask[i] * sstep(dIn[i] / bevel);
      let lx = I.light[0], ly = I.light[1], lz = I.light[2];
      const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
      let hx = lx, hy = ly, hz = lz + 1; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
      [bodyMap, shadeMap, specMap].forEach((c) => { c.width = fw; c.height = fh; });
      const bI = bodyMap.getContext('2d').createImageData(fw, fh), sI = shadeMap.getContext('2d').createImageData(fw, fh), pI = specMap.getContext('2d').createImageData(fw, fh);
      const b = bI.data, s = sI.data, p = pI.data, k = 2.6;
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const i = y * fw + x, m = mask[i];
          if (m <= 0.01) continue;
          const nxv = -(h[y * fw + Math.min(fw - 1, x + 1)] - h[y * fw + Math.max(0, x - 1)]) * k;
          const nyv = -(h[Math.min(fh - 1, y + 1) * fw + x] - h[Math.max(0, y - 1) * fw + x]) * k;
          const nl = Math.hypot(nxv, nyv, 1), nx = nxv / nl, ny = nyv / nl, nz = 1 / nl;
          const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
          const spec = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 28);
          const edge = 1 - h[i];
          const o = i * 4;
          // 얼음 면: 차가운 흰빛, 빛 받는 쪽 밝게, 가장자리 진하게
          const lit = 0.75 + 0.25 * diff;
          b[o] = 205 * lit + 30; b[o + 1] = 225 * lit + 25; b[o + 2] = 245 * lit + 10;
          b[o + 3] = 255 * m * (I.bodyAlpha[0] + (I.bodyAlpha[1] - I.bodyAlpha[0]) * edge);
          s[o] = 46; s[o + 1] = 86; s[o + 2] = 128;
          s[o + 3] = 255 * m * Math.min(0.6, Math.max(0, 0.78 - diff) * I.shade);
          const rim = edge * Math.max(0, -nx * 0.6 - ny * 0.8) * 0.2;   // 모서리 빛은 절제
          p[o] = p[o + 1] = p[o + 2] = 255;
          p[o + 3] = 255 * m * Math.min(1, spec * I.spec + rim);
        }
      }
      // 모서리 응결: 획 가장자리에서 안쪽으로 1~3셀, 노이즈로 두께가 불규칙하게 (얼음이 더 뭉친 모서리)
      edgeMap.width = fw; edgeMap.height = fh;
      const eI = edgeMap.getContext('2d').createImageData(fw, fh), e4 = eI.data, nz = f.noise;
      const band = Math.max(1.2, 2.6 * f.scale);
      for (let i = 0; i < N; i++) {
        const m = mask[i];
        if (m <= 0.01) continue;
        const wdt = band * (0.55 + 0.9 * nz[i]);
        const v = m * (1 - sstep(dIn[i] / wdt)) * (0.55 + 0.45 * nz[(i * 7) % N]);
        e4[i * 4] = 248; e4[i * 4 + 1] = 252; e4[i * 4 + 2] = 255; e4[i * 4 + 3] = 255 * Math.min(1, v);
      }
      edgeMap.getContext('2d').putImageData(eI, 0, 0);
      bodyMap.getContext('2d').putImageData(bI, 0, 0);
      shadeMap.getContext('2d').putImageData(sI, 0, 0);
      specMap.getContext('2d').putImageData(pI, 0, 0);
      // 옆면: 글자 실루엣을 빛 반대 방향으로 조금씩 밀어 쌓고, 윗면 자리는 비움
      const tint = document.createElement('canvas'); tint.width = W; tint.height = H;
      const tc = tint.getContext('2d');
      tc.drawImage(f.glyphHi, 0, 0); tc.globalCompositeOperation = 'source-in';
      tc.fillStyle = 'rgb(92,132,172)'; tc.fillRect(0, 0, W, H);
      side.width = W; side.height = H;
      const sc = side.getContext('2d'), steps = 8, dep = I.depth * scale;
      for (let q = steps; q >= 1; q--) {
        sc.globalAlpha = 0.07 + 0.05 * (q / steps);
        sc.drawImage(tint, -lx * dep * q / steps / Math.hypot(lx, ly), -ly * dep * q / steps / Math.hypot(lx, ly));
      }
      sc.globalAlpha = 1; sc.globalCompositeOperation = 'destination-out';
      sc.drawImage(f.glyphHi, 0, 0);
      sc.globalCompositeOperation = 'source-over';
      // 그림자: 1/8 해상도로 줄였다 키워 흐리게
      shadowMap.width = Math.ceil(W / 8); shadowMap.height = Math.ceil(H / 8);
      const shc = shadowMap.getContext('2d');
      shc.filter = 'blur(1.5px)';
      shc.drawImage(tint, 0, 0, shadowMap.width, shadowMap.height);
      shc.filter = 'none';
      comp.width = W; comp.height = H;
      // 바람 조각이 생길 가장자리
      const ec = [];
      for (let i = 0; i < N; i++) if (mask[i] >= 0.5 && dIn[i] * os <= 5 * scale) ec.push(i);
      edgeCells = Int32Array.from(ec);
    }

    // 돌풍: 서로 다른 느린 주기의 사인을 겹친 0~1 값 (규칙적으로 보이지 않게)
    function gustAt(t) {
      return Math.min(1, Math.max(0, 0.55 + 0.3 * Math.sin(t * 0.83) + 0.17 * Math.sin(t * 2.1 + 1.3) + 0.1 * Math.sin(t * 5.3 + 0.4)));
    }
    function updateWind(dt, L) {
      const Wd = F.wind;
      const target = running ? Math.pow(L.cold, Wd.curve) * (1 - L.melt) * (1 - sstep(thaw)) : 0;
      windS += (target - windS) * Math.min(1, dt * Wd.follow);
      wtime += dt; gust = gustAt(wtime);
      const w = windS;
      // 글자 가장자리에서 얼음 조각이 바람 방향으로 흩날림 (성에가 이미 핀 곳에서만)
      if (edgeCells && edgeCells.length && w > 0.03 && alpha > 0.3) {
        let n = Wd.drift * Math.pow(w, 1.5) * (0.5 + gust) * dt;
        while (n > 0 && drift.length < 260) {
          if (n < 1 && Math.random() > n) break;
          n--;
          const i = edgeCells[(Math.random() * edgeCells.length) | 0];
          if (field.dIn[i] * os > front[0]) continue;
          const sp = (Wd.driftSpeed[0] + Math.random() * (Wd.driftSpeed[1] - Wd.driftSpeed[0])) * scale * w * (0.6 + 0.4 * gust);
          drift.push({ x: ((i % fw) + Math.random()) * os, y: (((i / fw) | 0) + Math.random()) * os,
            vx: Wd.dir[0] * sp, vy: Wd.dir[1] * sp + (Math.random() - 0.5) * 40 * scale,
            life: 0, max: 0.35 + Math.random() * 0.75, wd: (0.5 + Math.random()) * scale + 0.3 });
        }
      }
      for (let k = drift.length - 1; k >= 0; k--) {
        const d = drift[k];
        d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 14 * scale * dt; d.life += dt;
        if (d.life >= d.max) drift.splice(k, 1);
      }
      // 화면을 가르는 옅은 바람결
      const want = Math.round(Wd.streaks * w);
      while (streaks.length < want) streaks.push({ x: Math.random() * W, y: Math.random() * H, len: (120 + Math.random() * 260) * scale, sp: (900 + Math.random() * 900) * scale, a: 0.03 + Math.random() * 0.06 });
      if (streaks.length > want) streaks.length = want;
      for (const s of streaks) {
        s.x += Wd.dir[0] * s.sp * (0.5 + gust) * dt; s.y += Wd.dir[1] * s.sp * (0.5 + gust) * dt;
        if (s.x + s.len < 0 || s.y > H + 10) { s.x = W + Math.random() * W * 0.3; s.y = Math.random() * H * 0.9; }
      }
    }

    /*
     * 3D 얼음 글자 — 글자마다 잘라 낸 조각(sprite)을 3D 회전시켜 그림
     *  성에는 지금처럼 글자 전체 판에서 자라고(가장자리→중앙, 밀도, 녹음 그대로), 매 프레임 글자별로 잘라
     *  얼음 면·그늘·하이라이트와 합성한 '앞면'을 만듭니다.
     *  회전된 평면은 (직교)투영에서 아핀 변환이 되므로 ctx.transform 으로 앞면을 그리고,
     *  두께는 글자 실루엣 단면을 앞면 법선 반대 방향으로 겹겹이 쌓아 실제 돌출된 입체를 만듭니다(+ 약한 원근).
     *  글자 바깥으로 퍼진 성에는 가장 가까운 글자에 속하도록 나눕니다(소유 지도).
     */
    function buildLetters(f) {
      letters = [];
      const chars = f.chars || [];
      if (!chars.length) return;
      const S = F.sculpt, N = fw * fh;
      const lab = new Int16Array(N).fill(-1), q = new Int32Array(N);
      let qh = 0, qt = 0;
      const boxes = chars.map((c) => [c.x0 / os, c.y0 / os, c.x1 / os, c.y1 / os]);
      for (let i = 0; i < N; i++) {
        if (f.mask[i] < 0.5) continue;
        const x = i % fw + 0.5, y = (i / fw | 0) + 0.5;
        let best = -1, bd = Infinity;
        for (let k = 0; k < boxes.length; k++) {
          const b = boxes[k];
          const dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]);
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = k; if (d === 0) break; }
        }
        lab[i] = best; q[qt++] = i;
      }
      while (qh < qt) { // 가장 가까운 글자로 바깥 영역을 나눔 (BFS)
        const i = q[qh++], x = i % fw, l = lab[i];
        if (x > 0 && lab[i - 1] < 0) { lab[i - 1] = l; q[qt++] = i - 1; }
        if (x < fw - 1 && lab[i + 1] < 0) { lab[i + 1] = l; q[qt++] = i + 1; }
        if (i >= fw && lab[i - fw] < 0) { lab[i - fw] = l; q[qt++] = i - fw; }
        if (i < N - fw && lab[i + fw] < 0) { lab[i + fw] = l; q[qt++] = i + fw; }
      }
      const pad = (F.spreadRadius[1] + F.maxCrystalSize[1] * 1.6) * scale;
      const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      let tx0 = Infinity, ty0 = Infinity, tx1 = -Infinity, ty1 = -Infinity;
      chars.forEach((ch, k) => {
        tx0 = Math.min(tx0, ch.x0); ty0 = Math.min(ty0, ch.y0); tx1 = Math.max(tx1, ch.x1); ty1 = Math.max(ty1, ch.y1);
        const gx0 = Math.max(0, Math.floor((ch.x0 - pad) / os)), gy0 = Math.max(0, Math.floor((ch.y0 - pad) / os));
        const gx1 = Math.min(fw, Math.ceil((ch.x1 + pad) / os)), gy1 = Math.min(fh, Math.ceil((ch.y1 + pad) / os));
        const gw = gx1 - gx0, gh = gy1 - gy0;
        if (gw <= 0 || gh <= 0) return;
        const bw = gw * os, bh = gh * os, x0 = gx0 * os, y0 = gy0 * os;
        // 소유 지도 (격자 → 부드럽게 확대)
        const og = mk(gw, gh), oc = og.getContext('2d'), od = oc.createImageData(gw, gh);
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (lab[(gy0 + y) * fw + gx0 + x] === k) od.data[(y * gw + x) * 4 + 3] = 255;
        oc.putImageData(od, 0, 0);
        const own = mk(bw, bh), owc = own.getContext('2d');
        owc.imageSmoothingEnabled = true; owc.drawImage(og, 0, 0, bw, bh);
        // 두께 단면: 글자 실루엣 (어두운 쪽 / 밝은 쪽)
        const silOf = (col) => {
          const c = mk(bw, bh), cc = c.getContext('2d');
          cc.drawImage(f.glyphHi, x0, y0, bw, bh, 0, 0, bw, bh);
          cc.globalCompositeOperation = 'destination-in'; cc.drawImage(own, 0, 0);
          cc.globalCompositeOperation = 'source-in'; cc.fillStyle = col; cc.fillRect(0, 0, bw, bh);
          return c;
        };
        const silL = silOf('rgb(236,245,253)');
        // 옆면 텍스처의 모양: 실루엣을 살짝 부풀려 모서리에 붙은 성에 뿌리까지 포함
        const silMask = mk(bw, bh), smc = silMask.getContext('2d'), dl = 1.6 * scale + 0.4;
        for (const [ddx, ddy] of [[0, 0], [dl, 0], [-dl, 0], [0, dl], [0, -dl], [dl * 0.7, dl * 0.7], [-dl * 0.7, -dl * 0.7]]) smc.drawImage(silL, ddx, ddy);
        // 단면마다 아주 조금씩 다른 위치 (같은 결이 줄무늬처럼 반복돼 보이지 않게, 모서리는 거칠게)
        const jit = [];
        for (let qn = 0; qn <= S.layers; qn++) jit.push([(rng() - 0.5) * 1.4 * scale, (rng() - 0.5) * 1.4 * scale, 0.8 + rng() * 0.4]);
        letters.push({
          k, x0, y0, bw, bh, gx0, gy0, gw, gh,
          cx: (ch.x0 + ch.x1) / 2, cy: (ch.y0 + ch.y1) / 2, hgt: ch.y1 - ch.y0, wid: ch.x1 - ch.x0,
          own, silD: silOf('rgb(92,134,178)'), silL, silMask, jit, front: mk(bw, bh), side: mk(bw, bh),
          restYaw: (k % 2 ? 1 : -1) * S.letterRest * (0.6 + 0.8 * rng()), restPitch: (rng() - 0.5) * 0.06, ph: rng() * TAU,
          yaw: 0, pitch: 0, roll: 0, vy: 0, vp: 0, vr: 0,
        });
      });
      textC = [(tx0 + tx1) / 2, (ty0 + ty1) / 2];
      for (const L of letters) { L.yaw = L.restYaw; L.pitch = L.restPitch; }
    }

    // 회전 행렬 (x 오른쪽, y 아래, z 화면 밖) R = Ry(yaw)·Rx(pitch)·Rz(roll), 행 우선 9개
    function rotM(yaw, pitch, roll) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
      const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp], rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
      return mul(mul(ry, rx), rz);
    }
    function mul(a, b) {
      const o = new Array(9);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
      return o;
    }

    // 글자 회전: 기본 자세 + 커서 쪽으로 돌기 + 부유 + 바람 펄럭임 → 스프링(관성)으로 따라감
    function stepSculpt(dt) {
      if (!letters.length) return;
      const S = F.sculpt;
      // 사진: 얼지 않았을 때는 정면 그대로(평평한 사진), 얼수록 얼음 판처럼 기울고 돌아봄
      const fk = photo ? freeze : 1;
      if (!G.drag) { // 손을 떼면 관성으로 조금 더 돌다가 기본 시점으로 천천히 돌아옴
        G.vy += ((S.rest[0] * fk - G.yaw) * S.ret * 3 - G.vy * 2.4) * dt;
        G.vp += ((S.rest[1] * fk - G.pitch) * S.ret * 3 - G.vp * 2.4) * dt;
        G.yaw += G.vy * dt; G.pitch += G.vp * dt;
      }
      const Rg = rotM(G.yaw, G.pitch, 0), w = windS, t = wtime;
      for (const L of letters) {
        let ty = (L.restYaw + 0.025 * Math.sin(t * 0.35 + L.ph)) * fk;
        let tp = (L.restPitch + 0.018 * Math.sin(t * 0.29 + L.ph * 1.7)) * fk;
        let tr = 0;
        if (hoverP && !G.drag && fk > 0.01) {
          const px = L.cx - textC[0], py = L.cy - textC[1];
          const sx = textC[0] + Rg[0] * px + Rg[1] * py, sy = textC[1] + Rg[3] * px + Rg[4] * py;
          const sg = L.hgt * 0.75, dx = (hoverP[0] - sx) / sg, dy = (hoverP[1] - sy) / sg;
          const inf = Math.exp(-(dx * dx + dy * dy) * 0.35);
          ty += Math.max(-1.4, Math.min(1.4, dx)) * S.hover[0] * inf * fk;
          tp += -Math.max(-1.4, Math.min(1.4, dy)) * S.hover[1] * inf * fk;
        }
        if (w > 0.001) { // 바람: 글자마다 다른 위상으로 펄럭이듯 (세기에 비례, 절제된 진폭)
          ty += w * 0.11 * gust * Math.sin(t * 1.6 + L.ph);
          tp += w * 0.04 * Math.sin(t * 1.9 + L.ph * 0.7);
          tr += w * 0.035 * gust * Math.sin(t * 2.2 + L.ph * 1.3);
        }
        L.vy += ((ty - L.yaw) * S.spring - L.vy * S.damp) * dt; L.yaw += L.vy * dt;
        L.vp += ((tp - L.pitch) * S.spring - L.vp * S.damp) * dt; L.pitch += L.vp * dt;
        L.vr += ((tr - L.roll) * S.spring - L.vr * S.damp) * dt; L.roll += L.vr * dt;
      }
    }

    const LV = (() => { const l = [-0.42, -0.52, 0.74], n = Math.hypot(l[0], l[1], l[2]); return [l[0] / n, l[1] / n, l[2] / n]; })();
    const LV2 = (() => { const n = Math.hypot(LV[0], LV[1]); return [LV[0] / n, LV[1] / n]; })();
    /*
     * 얼어붙은 덩어리로 그리기
     *  앞면  : 얼음 면 → 성에 → 모서리 응결 → (소유 영역만) → 베벨 그늘 → 하이라이트
     *  옆면  : 매 프레임 그 글자의 앞면(얼음+성에)을 살짝 부푼 실루엣으로 잘라 '옆면 텍스처'를 만들고,
     *          단면마다 조금씩 어긋나게 깊이 방향으로 쌓음 → 옆·위·아래·깊이 면에 앞면 성에가 끊김 없이 이어지고
     *          면이 바뀌는 모서리에서도 같은 결·밀도가 계속됨. 옆면이 빛을 향하는지에 따라 밝기·그늘이 달라짐.
     *  뒷면  : 반투명 얼음을 통해 비치는 성에 + 뒤 모서리의 옅은 응결
     */
    function drawSculpt(ctx, a, bodyA) {
      const S = F.sculpt, D = S.depth * scale, NL = S.layers, f = S.persp * scale;
      const specA = photo ? bodyA : Math.max(bodyA, a * 0.4);
      // 1) 글자별 앞면 합성
      for (const L of letters) {
        const c = L.front.getContext('2d');
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
        c.clearRect(0, 0, L.bw, L.bh);
        if (photo && photoA > 0.003) { // 사진 → 얼수록 차가운 색감으로
          c.globalAlpha = photoA; c.drawImage(photo, L.x0, L.y0, L.bw, L.bh, 0, 0, L.bw, L.bh);
          if (freeze > 0.003) { c.globalAlpha = photoA * freeze; c.drawImage(photoCold, L.x0, L.y0, L.bw, L.bh, 0, 0, L.bw, L.bh); }
          c.globalAlpha = 1;
        }
        if (bodyA > 0.003) { c.globalAlpha = bodyA; c.drawImage(bodyMap, L.gx0, L.gy0, L.gw, L.gh, 0, 0, L.bw, L.bh); }
        if (a > 0.003) {
          c.globalAlpha = a;
          c.drawImage(plates[0].cvs, L.x0, L.y0, L.bw, L.bh, 0, 0, L.bw, L.bh);
        }
        if (bodyA > 0.003) { c.globalAlpha = bodyA * 0.22; c.drawImage(edgeMap, L.gx0, L.gy0, L.gw, L.gh, 0, 0, L.bw, L.bh); }
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'destination-in'; c.drawImage(L.own, 0, 0);
        c.globalCompositeOperation = 'source-atop';
        c.globalAlpha = photo ? bodyA : 1;
        if (c.globalAlpha > 0.003) c.drawImage(shadeMap, L.gx0, L.gy0, L.gw, L.gh, 0, 0, L.bw, L.bh);
        c.globalAlpha = 1;
        if (specA > 0.003) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = specA; c.drawImage(specMap, L.gx0, L.gy0, L.gw, L.gh, 0, 0, L.bw, L.bh); }
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      }
      // 2) 3D 배치: 전체 시점 회전 → 글자 위치·깊이, 글자 자체 회전 → 앞면 방향
      const Rg = rotM(G.yaw, G.pitch, 0);
      const items = letters.map((L) => {
        const R = mul(Rg, rotM(L.yaw, L.pitch, L.roll));
        const px = L.cx - textC[0], py = L.cy - textC[1];
        const P = [Rg[0] * px + Rg[1] * py, Rg[3] * px + Rg[4] * py, Rg[6] * px + Rg[7] * py];
        return { L, R, P };
      }).sort((p, q2) => p.P[2] - q2.P[2]);
      for (const { L, R, P } of items) {
        const ez = [R[2], R[5], R[8]];
        const base = ctx.getTransform();
        const place = (zl, jx, jy) => {
          const z = P[2] + zl * ez[2], s = f / (f - z);
          const X = textC[0] + (P[0] + zl * ez[0]) * s + (jx || 0), Y = textC[1] + (P[1] + zl * ez[1]) * s + (jy || 0);
          ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
          ctx.transform(R[0] * s, R[3] * s, R[1] * s, R[4] * s, X, Y);
        };
        const ox = L.x0 - L.cx, oy = L.y0 - L.cy;
        if (bodyA > 0.003) {
          // 보이는 옆면이 빛을 향하는 정도: 두께가 튀어나온 방향(−ez)과 빛 방향(화면 평면)으로
          const dl = Math.hypot(ez[0], ez[1]) || 1;
          const facing = (-ez[0] / dl) * LV2[0] + (-ez[1] / dl) * LV2[1];       // +1 빛 쪽, −1 그늘 쪽
          const sc = L.side.getContext('2d');
          sc.globalCompositeOperation = 'source-over';
          sc.clearRect(0, 0, L.bw, L.bh);
          sc.globalAlpha = 0.55; sc.drawImage(L.silD, 0, 0);                    // 반투명 얼음 바탕
          sc.globalAlpha = 1; sc.drawImage(L.front, 0, 0);                       // 앞면의 성에가 옆면으로 이어짐
          sc.globalCompositeOperation = 'destination-in'; sc.drawImage(L.silMask, 0, 0);
          sc.globalCompositeOperation = 'source-atop';
          sc.fillStyle = `rgba(34,74,118,${(0.08 + 0.3 * (1 - facing) / 2).toFixed(3)})`; sc.fillRect(0, 0, L.bw, L.bh);
          if (facing > 0) { sc.fillStyle = `rgba(255,255,255,${(0.22 * facing).toFixed(3)})`; sc.fillRect(0, 0, L.bw, L.bh); }
          sc.globalCompositeOperation = 'source-over';
          // 뒷면: 비쳐 보이는 성에 + 뒤 모서리 응결
          place(-D); ctx.globalAlpha = bodyA * 0.35; ctx.drawImage(L.side, ox, oy);
          ctx.globalAlpha = a * 0.12; ctx.drawImage(L.front, ox, oy);
          // 두께: 뒤에서 앞으로, 단면마다 살짝 어긋나게 (뒤로 갈수록 짙게)
          for (let qn = NL; qn >= 1; qn--) {
            const tt = qn / NL, j = L.jit[qn];
            place(-D * tt, j[0], j[1]);
            ctx.globalAlpha = bodyA * (0.11 + 0.08 * tt) * j[2];
            ctx.drawImage(L.side, ox, oy);
          }
          place(-D / NL * 0.6); ctx.globalAlpha = bodyA * 0.07; ctx.drawImage(L.silL, ox, oy); // 앞 모서리 (외곽이 빛나 보이지 않게 아주 옅게)
        } else if (a > 0.003 && !photo) {
          place(-D); ctx.globalAlpha = a * 0.12; ctx.drawImage(L.front, ox, oy);
        }
        // 앞면
        place(0); ctx.globalAlpha = 1; ctx.drawImage(L.front, ox, oy);
        // 빛 쪽으로 돌면 표면이 반짝 (광택)
        const g = ez[0] * LV[0] + ez[1] * LV[1] + ez[2] * LV[2];
        if (g > 0.8 && (!photo || freeze > 0.05)) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.18, (g - 0.8) * 1.2); ctx.drawImage(L.front, ox, oy); ctx.globalCompositeOperation = 'source-over'; }
        ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
      }
      ctx.globalAlpha = 1;
    }
    function sortedList(xs, ys, keys) {
      const idx = keys.map((_, i) => i).sort((a, b) => keys[a] - keys[b]);
      return { n: idx.length, x: idx.map((i) => xs[i]), y: idx.map((i) => ys[i]), key: idx.map((i) => keys[i]) };
    }

    return {
      get temperature() { return tempT; },
      get appliedTemperature() { return tempS; },
      get levels() { return DT.frostLevels(tempS); },
      get branchCount() { return branches.length - dead; },
      get nuclei() { return nuclei; },
      get thaw() { return thaw; },
      get fronts() { return { inside: front[0], outside: front[1], border: front[2], maxDepth }; },
      get running() { return running; },
      get freeze() { return freeze; },
      get hasPhoto() { return !!photo; },

      setTemperature(t, immediate) {
        tempT = Math.min(F.controlRange[1], Math.max(F.controlRange[0], t));
        if (immediate) tempS = tempT;
      },

      // 글자가 다 모인 뒤 호출: 결정핵 후보를 만들고 가장자리부터 성장 시작
      start(f, seed) {
        field = f; os = f.outScale; fw = f.w; fh = f.h;
        const w = fw * os, h = fh * os;
        if (w !== W || h !== H) {
          W = w; H = h;
          for (const p of plates) {
            p.cvs.width = w; p.cvs.height = h;
            p.glow.width = Math.ceil(w * GS); p.glow.height = Math.ceil(h * GS);
          }
          scale = w / 1920; minWH = Math.min(w, h);
          occC = Math.max(2, 2.6 * scale);
          occW = Math.ceil(w / occC); occH = Math.ceil(h / occC);
          occ = new Int32Array(occW * occH);
        }
        if (melt.width !== fw || melt.height !== fh) {
          melt.width = fw; melt.height = fh;
          meltImg = mctx.createImageData(fw, fh);
          for (let i = 0; i < meltImg.data.length; i += 4) meltImg.data[i] = meltImg.data[i + 1] = meltImg.data[i + 2] = 255;
        }
        clearAll();
        thaw = 0;
        rng = DT.mulberry32((seed ^ 0x1CE5EED5) >>> 0);
        maxDepth = f.maxIn * os;
        const spMax = F.spreadRadius[1] * scale;
        const L0 = [[], [], []], L1 = [[], [], []], L2 = [[], [], []];
        for (let i = 0; i < fw * fh; i++) {
          const gx = i % fw, gy = (i / fw) | 0;
          if (f.mask[i] >= 0.5) { // 0: 글자 안 — 깊이(가장자리로부터 거리) 순
            if (rng() < 0.55) { L0[0].push((gx + rng()) * os); L0[1].push((gy + rng()) * os); L0[2].push(f.dIn[i] * os + rng() * 4 * scale); }
          } else {                // 1: 글자 밖 — 거리 순, 멀수록 드물게
            const d = f.dOut[i] * os;
            if (d <= spMax && rng() < 0.12 * Math.exp(-d / (0.3 * spMax))) {
              L1[0].push((gx + rng()) * os); L1[1].push((gy + rng()) * os); L1[2].push(d + rng() * 6 * scale);
            }
          }
        }
        // 2: 창 테두리 — 화면 가장자리 띠에서
        const nb = Math.round((2 * (w + h)) / (5 * scale));
        for (let k = 0; k < nb; k++) {
          const t = rng() * 2 * (w + h), depth = Math.pow(rng(), 2) * 0.03 * minWH;
          let x, y;
          if (t < w) { x = t; y = depth; } else if (t < w + h) { x = w - depth; y = t - w; }
          else if (t < 2 * w + h) { x = t - w - h; y = h - depth; } else { x = depth; y = t - 2 * w - h; }
          L2[0].push(Math.min(w - 1, Math.max(1, x))); L2[1].push(Math.min(h - 1, Math.max(1, y))); L2[2].push(depth + rng() * 4 * scale);
        }
        lists = [sortedList(...L0), sortedList(...L1), sortedList(...L2)];
        ptr = [0, 0, 0]; acc = [0, 0, 0]; front = [0, 0, 0];
        nuclei = 0; treeN = 0;
        if (!micro || micro.width !== W || micro.height !== H) micro = buildMicro(W, H);
        if ((f.photo || null) !== photo) photoA = 0;   // 새 사진은 서서히 나타남
        photo = f.photo || null; photoCold = f.photoCold || null;
        buildIce(f);
        buildLetters(f);
        const rk = photo ? freeze : 1; // 사진: 얼지 않았으면 정면
        G.yaw = F.sculpt.rest[0] * rk; G.pitch = F.sculpt.rest[1] * rk; G.vy = G.vp = 0; G.drag = false;
        if (photo) for (const L of letters) { L.yaw = L.restYaw * rk; L.pitch = L.restPitch * rk; }
        drift.length = 0;
        running = true; alpha = alphaTarget = 1;
      },
      // 글자가 바뀌거나 지워질 때: 서서히 사라짐. immediate 면 즉시 지움(환경 전환)
      stop(immediate) {
        running = false; alphaTarget = 0;
        if (immediate) { alpha = 0; clearAll(); windS = 0; drift.length = 0; streaks.length = 0; }
      },

      update(dt) {
        if (!dt) return;
        dt = Math.min(dt, 1 / 30);
        tempS += (tempT - tempS) * Math.min(1, dt * F.tempFollow);
        if (Math.abs(tempT - tempS) < 0.01) tempS = tempT;
        alpha += (alphaTarget - alpha) * Math.min(1, dt * 2.2);
        sag += (Math.pow(thaw, 1.4) * 9 * scale - sag) * Math.min(1, dt * 1.5);
        const L = DT.frostLevels(tempS);
        // 극지 정도: 녹는점 이하이면 1 로, 넘으면 0 으로 부드럽게 (사진 색감·기울기·입김·돋보기에 씀)
        freeze += ((running && !L.melting ? 1 : 0) - freeze) * Math.min(1, dt * 0.7);
        if (freeze < 0.001) freeze = 0;
        if (photo) photoA = Math.min(1, photoA + dt * 1.4);
        if (W) { updateWind(dt, L); stepSculpt(dt); }
        if (!running) {
          if (alpha < 0.01 && (plates[0].dirty || plates[1].dirty || branches.length)) { alpha = 0; clearAll(); }
          return;
        }
        if (L.melting) { thawStep(dt, L); return; }   // 녹는점 위: 자라지 않고 녹기만
        if (thaw > 0) bakeThaw();
        // 전선 전진: 글자 안(가장자리 → 중앙), 글자 밖, 창 테두리(화면 가장자리 → 안쪽)
        front[0] = Math.min(front[0] + L.frontRate * scale * dt, maxDepth + 4 * scale);
        front[1] += L.frontRate * 2.2 * scale * dt;
        front[2] += L.frontRate * 3 * scale * dt;
        limits(L);
        nucleate(dt, L);
        grow(dt, L);
        // 따뜻해져 범위가 줄면 바깥 서리를 천천히 녹임
        meltRebuildT -= dt;
        if (lim.sp >= reachSp && lim.ext >= reachExt) {
          reachSp = lim.sp; reachExt = lim.ext;
        } else if ((lim.sp < reachSp - 1.5 * scale || lim.ext < reachExt - 1.5 * scale) && meltRebuildT <= 0) {
          rebuildMelt(lim.sp, lim.ext); reachSp = lim.sp; reachExt = lim.ext; meltT = 2.4; meltRebuildT = 0.2;
        }
        if (meltT > 0) {
          meltT -= dt;
          // 마지막 한 번은 완전히 지움 (8비트 알파는 반복 감쇠가 약 6% 에서 멈춰 잔상이 남음)
          const a = meltT <= 0 ? 1 : Math.min(1, dt * 1.8);
          eachCtx((c, w, h) => {
            c.globalCompositeOperation = 'destination-out'; c.globalAlpha = a;
            c.drawImage(melt, 0, 0, w, h);
            c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
          });
        }
      },

      // 점 레이어 캔버스 위에 합성. part: 'fixed'(창 테두리) | 'float'(글자 — 부유 이동 적용 후 호출됨)
      // motion: 글자의 부유·바람 이동량 {dx, dy} — 그림자는 이보다 덜 움직여 글자가 유리 앞에 떠 있는 깊이감
      draw(ctx, part, motion) {
        if (!W) return;
        // 녹는 중에는 전체 불투명도를 부드럽게 낮춤 (8비트 알파 감쇠만으로는 끝에 잔상이 남아 튀므로)
        const melt = 1 - sstep(thaw);
        const a = alpha * melt;
        // 얼음 몸체는 성에 전선이 진행하는 만큼 얼어붙고, 녹으면 함께 사라짐
        const bodyA = a * sstep(front[0] / (maxDepth * 0.8 + 1));
        const tw = ctx.canvas.width, th = ctx.canvas.height;
        refreshVis(plates[part === 'fixed' ? 1 : 0]);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        if (part === 'fixed') {
          if (bodyA > 0.003) { // 유리에 지는 그림자
            const m = motion || { dx: 0, dy: 0 }, I = F.ice;
            ctx.globalAlpha = bodyA * I.shadow;
            // 전체 시점 회전을 따라 납작하게 기울어진 그림자 (글자보다 덜 움직여 유리와의 거리감)
            const Rg = rotM(G.yaw, G.pitch, 0);
            ctx.translate(textC[0] + 16 * scale + m.dx * 0.35, textC[1] + 24 * scale + m.dy * 0.35 + sag);
            ctx.transform(Rg[0], Rg[3], Rg[1], Rg[4], 0, 0);
            ctx.drawImage(shadowMap, -textC[0], -textC[1], tw, th);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
          if (a > 0.003) {
            ctx.globalAlpha = a;
            ctx.drawImage(plates[1].cvs, 0, 0, tw, th);
          }
          // 옅은 바람결
          if (streaks.length) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8 * scale + 0.2; ctx.lineCap = 'round';
            const d = F.wind.dir;
            for (const s of streaks) {
              ctx.globalAlpha = s.a * windS;
              ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - d[0] * s.len, s.y - d[1] * s.len); ctx.stroke();
            }
          }
          ctx.restore();
          return;
        }
        if ((a > 0.003 || bodyA > 0.003 || photo) && letters.length) {
          ctx.translate(0, sag);
          drawSculpt(ctx, a, bodyA);            // 3D 얼음 글자 (글자별 입체)
          ctx.translate(0, -sag);
        } else if (a > 0.003 || bodyA > 0.003) {
          // (글자 정보가 없을 때) 평면 합성: 얼음 옆면·면 → 성에 → 빛 반대쪽 그늘(source-atop) → 하이라이트
          const c = cctx;
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 1;
          c.clearRect(0, 0, W, H);
          if (bodyA > 0.003) {
            c.globalAlpha = bodyA;
            c.drawImage(side, 0, 0);
            c.drawImage(bodyMap, 0, 0, W, H);
          }
          c.globalAlpha = a;
          c.drawImage(plates[0].cvs, 0, 0);
          c.globalCompositeOperation = 'source-atop';
          c.globalAlpha = 1;
          c.drawImage(shadeMap, 0, 0, W, H);
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = Math.max(bodyA, a * 0.4);
          c.drawImage(specMap, 0, 0, W, H);
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 1;
          ctx.drawImage(comp, 0, sag, tw, th);
        }
        // 바람에 흩날리는 얼음 조각 (글자 가장자리에서 떨어져 나감)
        if (drift.length) {
          ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
          for (const d of drift) {
            const f = d.life / d.max;
            ctx.globalAlpha = 0.6 * (1 - f) * Math.min(1, d.life / 0.06) * melt;
            ctx.lineWidth = d.wd;
            ctx.beginPath(); ctx.moveTo(d.x, d.y + sag); ctx.lineTo(d.x - d.vx * 0.022, d.y - d.vy * 0.022 + sag); ctx.stroke();
          }
        }
        ctx.restore();
      },
      // 지금 바람 상태 (점 레이어가 글자 움직임에 사용): w 세기 0~1, gust 돌풍 0~1
      get wind() { return { w: windS, gust }; },
      // ---- 3D 글자 조작 (캔버스 px 좌표) ----
      // 커서를 올리면 가까운 글자가 커서 쪽으로 돌아봄. null 이면 기본 자세로
      hover(x, y) { hoverP = x == null ? null : [x, y]; },
      // 왼쪽 드래그: 전체 시점을 돌림 (손을 떼면 관성 → 천천히 기본 시점으로)
      grab() { G.drag = true; G.vy = G.vp = 0; },
      dragBy(dx, dy, dt) {
        const S = F.sculpt;
        const ny = Math.max(S.rest[0] - S.dragLimit[0], Math.min(S.rest[0] + S.dragLimit[0], G.yaw + dx * S.drag));
        const np = Math.max(S.rest[1] - S.dragLimit[1], Math.min(S.rest[1] + S.dragLimit[1], G.pitch - dy * S.drag));
        const k = 1 / Math.max(0.008, dt || 0.016);
        G.vy = G.vy * 0.6 + (ny - G.yaw) * k * 0.4; G.vp = G.vp * 0.6 + (np - G.pitch) * k * 0.4;
        G.yaw = ny; G.pitch = np;
      },
      release() { G.drag = false; G.vy *= 0.8; G.vp *= 0.8; },
      // 커서가 글자(조형물) 위에 있는지 — 렌즈/조작 판단용
      overText(x, y) {
        if (!letters.length || (photo && freeze < 0.3)) return false;   // 사진은 얼었을 때만 돌릴 수 있음
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const L of letters) { const hw = Math.max(L.hgt * 0.6, L.wid / 2); x0 = Math.min(x0, L.cx - hw); x1 = Math.max(x1, L.cx + hw); y0 = Math.min(y0, L.cy - L.hgt * 0.75); y1 = Math.max(y1, L.cy + L.hgt * 0.75); }
        return x >= x0 && x <= x1 && y >= y0 && y <= y1;
      },
      get view() { return { yaw: G.yaw, pitch: G.pitch, letters: letters.length }; },
    };
  };
})(window.DT = window.DT || {});
