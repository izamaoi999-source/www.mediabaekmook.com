/* 지점 소개 페이지의 세부 장비 내역 (읽기 전용) — <div data-equipment-list="bangbae"> 안을 /api/equipment 내용으로 채웁니다.
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

  document.querySelectorAll("[data-equipment-list]").forEach(function (box) {
    var studio = box.getAttribute("data-equipment-list");
    fetch("/api/equipment?studio=" + encodeURIComponent(studio), { cache: "no-store" })
      .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then(function (data) { if (data && Array.isArray(data.items)) render(box, data.items); })
      .catch(function () { /* 미리 적어 둔 내용 유지 */ });
  });
})();
