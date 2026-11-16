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

  // 지난번에 사진을 고른 직후 페이지가 다시 시작됐는지
  try {
    var prev = sessionStorage.getItem(KEY);
    if (prev && Date.now() - +prev < 60000) log('!! The page RESTARTED ' + Math.round((Date.now() - +prev) / 1000) + 's after picking a sample — the browser tab most likely ran out of memory and crashed.');
    sessionStorage.removeItem(KEY);
  } catch (e) { /* */ }

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
    setTimeout(function () { log(stamp() + '+1.5s · screen: ' + (stage && stage.dataset.intro === 'off' ? 'MAIN (ok)' : 'still OPENING') + ' · photos: ' + (window.__DIFFUSE__ ? window.__DIFFUSE__.photoIds.length : '?')); }, 1500);
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
