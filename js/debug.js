/*
 * 진단 모드 — 주소 끝에 ?debug 를 붙였을 때만 켜짐 (보통 방문자에게는 아무것도 하지 않음)
 *  휴대폰에서 문제가 생길 때 원인을 알기 위해: 화면 아래 작은 상자에
 *   - 기기 · 브라우저 · WebGL2 지원 여부
 *   - 자바스크립트 오류 (어느 파일 몇 번째 줄)
 *   - 사진을 고른 직후 페이지가 다시 시작됐는지 (= 메모리 부족으로 탭이 죽은 것)
 *  다른 스크립트보다 먼저 (index.html head) — 불러오는 중 오류도 잡도록
 */
(function () {
  'use strict';
  if (!/[?&]debug\b/.test(location.search)) return;
  var lines = [], box = null, KEY = 'polar-debug-pick';
  function show() {
    if (!box) {
      if (!document.body) return;
      box = document.createElement('pre');
      box.setAttribute('style', 'position:fixed;left:6px;right:6px;bottom:6px;z-index:99999;max-height:45vh;overflow:auto;margin:0;padding:8px 10px;' +
        'background:rgba(0,0,0,.85);color:#9f9;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all;border-radius:8px;pointer-events:auto');
      document.body.appendChild(box);
    }
    box.textContent = lines.join('\n');
  }
  function log(s) { lines.push(s); if (lines.length > 40) lines.shift(); show(); }
  window.__polarDebug = log;
  var t0 = Date.now();
  var stamp = function () { return ((Date.now() - t0) / 1000).toFixed(1) + 's '; };

  // 지난번 페이지가 스스로 닫히지 않고 갑자기 다시 시작됐는지 (= 탭이 메모리 부족으로 죽음)
  //  살아 있는 동안 1초마다 심장박동 + 마지막 조작을 sessionStorage 에 적고, 정상으로 떠날 때(pagehide)는 'clean' 표시
  var HB = 'polar-debug-hb', LAST = 'polar-debug-last', CLEAN = 'polar-debug-clean';
  try {
    var hb = +sessionStorage.getItem(HB), clean = sessionStorage.getItem(CLEAN), last = sessionStorage.getItem(LAST);
    if (hb && !clean && Date.now() - hb < 120000) log('!! The page CRASHED and restarted (out of memory). Last thing done before it: ' + (last || 'nothing recorded') + '.');
    sessionStorage.removeItem(CLEAN); sessionStorage.removeItem(KEY);
  } catch (e) { /* */ }
  var beat = function () { try { sessionStorage.setItem(HB, String(Date.now())); } catch (e) { /* */ } };
  beat(); setInterval(beat, 1000);
  window.addEventListener('pagehide', function () { try { sessionStorage.setItem(CLEAN, '1'); } catch (e) { /* */ } });
  var lastDone = function (s) { try { sessionStorage.setItem(LAST, s + ' (at ' + ((Date.now() - t0) / 1000).toFixed(0) + 's)'); } catch (e) { /* */ } };
  // 조절 카드·버튼을 만질 때마다 '마지막 조작'으로 적어 둠
  document.addEventListener('pointerdown', function (e) {
    var t = e.target, el = t && t.closest && t.closest('[aria-label], button, .card');
    if (!el) return;
    var name = el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24) || el.id || el.className;
    lastDone('touched "' + name + '"');
  }, true);

  log('UA: ' + navigator.userAgent);
  log('screen ' + screen.width + 'x' + screen.height + ' · window ' + innerWidth + 'x' + innerHeight + ' · dpr ' + devicePixelRatio + (navigator.deviceMemory ? ' · RAM ~' + navigator.deviceMemory + 'GB' : ''));
  try {
    var c = document.createElement('canvas'), gl = c.getContext('webgl2');
    log('WebGL2: ' + (gl ? 'yes · float targets: ' + (gl.getExtension('EXT_color_buffer_float') ? 'yes' : 'no') + ' · max texture ' + gl.getParameter(gl.MAX_TEXTURE_SIZE) : 'NO'));
    if (gl && gl.getExtension('WEBGL_lose_context')) gl.getExtension('WEBGL_lose_context').loseContext();
  } catch (e) { log('WebGL2 check failed: ' + e.message); }

  window.addEventListener('error', function (e) {
    var f = (e.filename || '').replace(/^.*\//, '');
    log(stamp() + 'ERROR ' + (e.message || e.type) + (f ? ' @ ' + f + ':' + e.lineno + ':' + e.colno : (e.target && e.target.src ? ' loading ' + e.target.src : '')));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason; log(stamp() + 'PROMISE ERROR ' + (r && (r.stack || r.message) || r));
  });
  var warn = console.warn;
  console.warn = function () { try { log(stamp() + 'warn ' + Array.prototype.map.call(arguments, function (a) { return a && a.message ? a.message : String(a); }).join(' ')); } catch (e) { /* */ } return warn.apply(console, arguments); };

  // 오프닝 화면에서 손가락이 실제로 무엇을 눌렀는지
  document.addEventListener('pointerup', function (e) {
    var intro = document.getElementById('intro');
    if (!intro || intro.hidden || !intro.contains(e.target)) return;
    var t = e.target; log(stamp() + 'tap on ' + (t.id ? '#' + t.id : '.' + String(t.className || t.tagName).split(' ')[0]) + ' (' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ')');
  }, true);
  // 사진 고르기 → 다음 화면까지 단계별로
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.r-pick, .g-pick');
    if (!b) return;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch (err) { /* */ }
    log(stamp() + 'picked a sample' + (b.disabled ? ' (disabled — still loading)' : ''));
    var stage = document.getElementById('stage');
    setTimeout(function () {
      var px = 0; Array.prototype.forEach.call(document.querySelectorAll('canvas'), function (c) { px += c.width * c.height; });
      log(stamp() + '+1.5s · screen: ' + (stage && stage.dataset.intro === 'off' ? 'MAIN (ok)' : 'still OPENING') + ' · photos: ' + (window.__DIFFUSE__ ? window.__DIFFUSE__.photoIds.length : '?') +
        ' · canvases ' + Math.round(px * 4 / 1048576) + 'MB · low-memory mode ' + (window.DT && window.DT.LOWMEM ? 'ON' : 'off'));
    }, 1500);
    setTimeout(function () { try { sessionStorage.removeItem(KEY); } catch (err) { /* */ } log(stamp() + '+8s · still alive' + (window.__DIFFUSE__ ? ' · photos: ' + window.__DIFFUSE__.photoIds.length : '')); }, 8000);
  }, true);
  window.addEventListener('load', function () {
    show();
    var D = window.__DIFFUSE__;
    log(stamp() + 'loaded · app ' + (D ? 'ready' : 'NOT ready') + ' · photo engine ' + (D ? (D.env ? 'ok' : 'NOT available') : '?'));
    // 화면에 잠깐 뜨는 안내 문구(오류 포함)도 여기에 남김
    var n = document.getElementById('notice');
    if (n) new MutationObserver(function () { if (!n.hidden && n.textContent) log(stamp() + 'notice: ' + n.textContent); }).observe(n, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  });
  document.addEventListener('DOMContentLoaded', show);
})();
