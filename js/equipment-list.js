/* 세부 장비 내역 (읽기 전용) — <div data-equipment-list="bangbae">(지점 페이지 전체 목록), <dl data-equipment-summary="bangbae">(홈 요약) 안을 /api/equipment 내용으로 채웁니다.
   불러오지 못하면 HTML에 미리 적어 둔 내용을 그대로 둡니다. 편집은 /booking-admin 의 '장비 내역 관리'에서 합니다. */
(function () {
  "use strict";
  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; }

  function render(box, items) {
    var frag = document.createDocumentFragment(), lastCat = null, list = null;
    items.forEach(function (it) {
      var cat = it.category || "기타";
      if (cat !== lastCat) {
        lastCat = cat;
        var group = el("section", "eq-group");
        group.appendChild(el("h3", "eq-cat", cat));
        list = el("ul", "eq-items");
        group.appendChild(list);
        frag.appendChild(group);
      }
      var li = el("li", "eq-item"), main = el("div", "eq-main");
      main.appendChild(el("span", "eq-name", it.name));
      if (it.qty !== null && it.qty !== undefined) main.appendChild(el("span", "eq-qty", it.qty + "개"));
      li.appendChild(main);
      if (it.model) li.appendChild(el("p", "eq-model", it.model));
      if (it.note) li.appendChild(el("p", "eq-note", it.note));
      list.appendChild(li);
    });
    if (!items.length) frag.appendChild(el("p", "eq-empty", "등록된 장비가 없습니다."));
    box.textContent = "";
    box.appendChild(frag);
  }

  // 요약: 분류별 한 줄 — "카메라 (모델) · 모니터" (비고는 생략)
  function renderSummary(dl, items) {
    if (!items.length) return;
    var frag = document.createDocumentFragment(), lastCat = null, dd = null, first = true;
    items.forEach(function (it) {
      var cat = it.category || "기타";
      if (cat !== lastCat) {
        lastCat = cat; first = true;
        var row = el("div");
        row.appendChild(el("dt", "", cat));
        dd = el("dd");
        row.appendChild(dd);
        frag.appendChild(row);
      }
      var text = it.name + (it.model ? " (" + it.model + ")" : "") + (it.qty !== null && it.qty !== undefined ? " " + it.qty + "개" : "");
      dd.appendChild(document.createTextNode((first ? "" : " · ") + text));
      first = false;
    });
    dl.textContent = "";
    dl.appendChild(frag);
  }

  function load(selector, draw) {
    document.querySelectorAll("[" + selector + "]").forEach(function (box) {
      var studio = box.getAttribute(selector);
      fetch("/api/equipment?studio=" + encodeURIComponent(studio), { cache: "no-store" })
        .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
        .then(function (data) { if (data && Array.isArray(data.items)) draw(box, data.items); })
        .catch(function () { /* 미리 적어 둔 내용 유지 */ });
    });
  }
  load("data-equipment-list", render);
  load("data-equipment-summary", renderSummary);
})();
