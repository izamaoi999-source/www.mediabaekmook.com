/* 홈 '오시는 길' 지도 — <div data-naver-map data-lat data-lng data-title>
   js/config.js 의 SITE.naverMapKeyId(네이버 클라우드 Maps 'Client ID')가 있으면 네이버 지도를 띄우고,
   없거나 불러오지 못하면 HTML에 적어 둔 주소 카드(네이버 지도 링크)를 그대로 둡니다. */
(function () {
  "use strict";
  var site = window.SITE || {};
  var boxes = document.querySelectorAll("[data-naver-map]");
  if (!boxes.length || !site.naverMapKeyId) return;

  function draw() {
    var maps = window.naver && window.naver.maps;
    if (!maps) return;
    boxes.forEach(function (box) {
      var lat = parseFloat(box.getAttribute("data-lat")), lng = parseFloat(box.getAttribute("data-lng"));
      if (!isFinite(lat) || !isFinite(lng)) return;
      var pos = new maps.LatLng(lat, lng);
      box.textContent = "";
      box.classList.add("is-live");
      var map = new maps.Map(box, {
        center: pos,
        zoom: parseInt(box.getAttribute("data-zoom"), 10) || 16,
        scrollWheel: false, // 페이지 스크롤을 지도가 가로채지 않게
        zoomControl: true,
        zoomControlOptions: { position: maps.Position.TOP_RIGHT }
      });
      new maps.Marker({ position: pos, map: map, title: box.getAttribute("data-title") || "" });
    });
  }

  var s = document.createElement("script");
  s.src = "https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=" + encodeURIComponent(site.naverMapKeyId);
  s.async = true;
  s.onload = draw;
  document.head.appendChild(s);
})();
