/*
 * 실행 방법 하나로 — 갤러리 · Archive(IndexedDB · localStorage)는 주소(origin)마다 따로 저장되므로 늘 http://localhost:5174/ 에서 열리게
 *  index.html 이 file:// 로 열리면 로컬 서버(start.cmd)가 돌고 있는지 확인 → 있으면 그쪽으로 옮겨 감, 없으면 아래 가운데 작은 안내
 *  다른 스크립트보다 먼저 (index.html 맨 앞) — 옮겨 갈 때 무거운 초기화를 하지 않도록
 */
(function () {
  'use strict';
  if (location.protocol !== 'file:') return;
  var URL = 'http://localhost:5174/', NOTE = 'Opened without the local server. Gallery and Archive are saved separately. Run start.cmd.';
  // 서버가 없을 때 안내 문구는 띄우지 않음 (화면을 가리지 않게) — 콘솔에만
  function note() { if (window.console) console.info('[Laboratory] ' + NOTE); }
  // 서버가 있으면 응답(불투명 응답이라도)이 오고, 없으면 연결이 거부되어 실패 — 1.2초 안에 답이 없으면 없는 것으로
  var done = false, t = setTimeout(function () { if (!done) { done = true; note(); } }, 1200);
  try {
    fetch(URL + 'index.html', { mode: 'no-cors', cache: 'no-store' }).then(function () {
      if (done) return; done = true; clearTimeout(t);
      location.replace(URL + location.search + location.hash);
    }, function () { if (!done) { done = true; clearTimeout(t); note(); } });
  } catch (e) { done = true; clearTimeout(t); note(); }
})();
