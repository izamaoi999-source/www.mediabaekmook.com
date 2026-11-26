(function () {
  var site = window.SITE || {};

  // 브랜드명 치환 ([data-brand])
  // 이름 텍스트만 바꾸고 <small class="brand-tag">강의 전문</small> 은 유지
  document.querySelectorAll("[data-brand]").forEach(function (el) {
    if (!site.brandName) return;
    var tag = el.querySelector(".brand-tag");
    el.textContent = site.brandName;
    if (site.brandTag) {
      if (!tag) { tag = document.createElement("small"); tag.className = "brand-tag"; }
      tag.textContent = site.brandTag;
      el.appendChild(tag);
    }
  });

  // 가격 표시
  document.querySelectorAll("[data-price]").forEach(function (el) {
    var p = site.pricePerHour || 40000;
    el.textContent = p.toLocaleString("ko-KR") + "원";
  });
  document.querySelectorAll("[data-price-weekend]").forEach(function (el) {
    var p = site.pricePerHourWeekend || 46000;
    el.textContent = p.toLocaleString("ko-KR") + "원";
  });
  document.querySelectorAll("[data-min-hours]").forEach(function (el) {
    el.textContent = String(site.minHours || 2);
  });
  document.querySelectorAll("[data-tel]").forEach(function (el) {
    var t = site.telephone || "";
    if (el.tagName === "A") {
      el.href = "tel:" + t.replace(/-/g, "");
      el.textContent = t;
    } else {
      el.textContent = t;
    }
  });
  document.querySelectorAll("[data-email]").forEach(function (el) {
    var e = site.email || "";
    if (el.tagName === "A") {
      el.href = "mailto:" + e;
      el.textContent = e;
    } else {
      el.textContent = e;
    }
  });

  // 모바일 메뉴
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // 맨 위 가격·영업시간 배너 (모든 공개 페이지, 예약 관리 페이지 제외). 값은 js/config.js
  (function initTopBanner() {
    if (document.querySelector(".top-banner") || document.body.classList.contains("booking-admin-page")) return;
    var won = function (n) { return Number(n).toLocaleString("ko-KR") + "원"; };
    var hours = String(site.businessHours || "").split("·")[0].trim();
    var bar = document.createElement("div");
    bar.className = "top-banner";
    bar.setAttribute("role", "note");
    bar.setAttribute("aria-label", "요금과 영업시간");
    var inner = document.createElement("div");
    inner.className = "container top-banner-inner";
    var add = function (cls, label, text, small) {
      var item = document.createElement("span");
      item.className = "tb-item " + cls;
      var b = document.createElement("b"); b.textContent = label; item.appendChild(b);
      item.appendChild(document.createTextNode(" " + text));
      if (small) { var s = document.createElement("small"); s.textContent = small; item.appendChild(s); }
      inner.appendChild(item);
    };
    add("tb-price", "평일", won(site.pricePerHour || 40000) + "/시간");
    add("tb-price", "토·일·공휴일", won(site.pricePerHourWeekend || 46000) + "/시간", "(VAT 별도)");
    if (hours) add("tb-hours", "영업시간", hours);
    if (!/\/booking$/.test(location.pathname)) {
      var a = document.createElement("a");
      a.className = "tb-cta"; a.href = "/booking"; a.textContent = "온라인 예약";
      inner.appendChild(a);
    }
    bar.appendChild(inner);
    document.body.insertBefore(bar, document.body.firstChild);
  })();

  // 연도
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  // 총 방문자 수: 브라우저 세션당 1회만 증가, 이후는 조회만. 실패 시 해당 줄 숨김.
  (function initVisitorCount() {
    var el = document.getElementById("visitor-count");
    if (!el) return;
    var line = el.closest(".visitor-count");
    var hide = function () {
      if (line) line.hidden = true;
    };
    // 로컬 미리보기·기능 검증은 운영 방문자 수에 포함하지 않습니다.
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") { hide(); return; }
    var already = false;
    try {
      already = sessionStorage.getItem("mbm-visit-counted") === "1";
    } catch (e) {}
    // 자체 카운터(D1). 예전 abacus 카운터 값(2026-11-26)을 이어받음
    fetch("/api/visits", { method: already ? "GET" : "POST", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        var n = data && data.value;
        if (typeof n !== "number") n = parseInt(n, 10);
        if (!isFinite(n)) throw new Error("bad count");
        el.textContent = n.toLocaleString("ko-KR");
        if (!already) {
          try { sessionStorage.setItem("mbm-visit-counted", "1"); } catch (e) {}
        }
      })
      .catch(function () {
        hide();
      });
  })();

  // 사진 라이트박스 (방배점 갤러리·콘텐츠 이미지)
  (function initLightbox() {
    if (document.querySelector(".lightbox")) return;
    var box = document.createElement("div");
    box.className = "lightbox";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "사진 크게 보기");
    box.innerHTML =
      '<button type="button" class="lightbox-close" aria-label="닫기">×</button>' +
      '<button type="button" class="lightbox-prev" aria-label="이전 사진">‹</button>' +
      '<img class="lightbox-img" alt="">' +
      '<button type="button" class="lightbox-next" aria-label="다음 사진">›</button>' +
      '<p class="lightbox-caption"></p>';
    document.body.appendChild(box);

    var imgEl = box.querySelector(".lightbox-img");
    var capEl = box.querySelector(".lightbox-caption");
    var btnPrev = box.querySelector(".lightbox-prev");
    var btnNext = box.querySelector(".lightbox-next");
    var group = [];
    var index = 0;
    var lastFocus = null;

    function show(i) {
      if (!group.length) return;
      index = (i + group.length) % group.length;
      var t = group[index];
      imgEl.src = t.src;
      imgEl.alt = t.alt || "";
      capEl.textContent = t.caption || t.alt || "";
      capEl.hidden = !capEl.textContent;
      var many = group.length > 1;
      btnPrev.hidden = !many;
      btnNext.hidden = !many;
    }

    function openFrom(trigger) {
      var name = trigger.getAttribute("data-lightbox");
      if (!name) return;
      group = Array.prototype.slice.call(document.querySelectorAll("[data-lightbox=\"" + name + "\"]")).map(function (el) {
        var inner = el.querySelector("img");
        var captionEl = el.closest("figure") && el.closest("figure").querySelector("figcaption");
        return {
          src: el.getAttribute("data-lightbox-src") || (inner && inner.getAttribute("src")) || "",
          alt: el.getAttribute("data-lightbox-alt") || (inner && inner.getAttribute("alt")) || "",
          caption: captionEl ? captionEl.textContent : ""
        };
      }).filter(function (t) { return t.src; });
      var src = trigger.getAttribute("data-lightbox-src") || (trigger.querySelector("img") && trigger.querySelector("img").getAttribute("src"));
      index = 0;
      for (var i = 0; i < group.length; i++) {
        if (group[i].src === src) { index = i; break; }
      }
      lastFocus = trigger;
      box.hidden = false;
      document.body.classList.add("lightbox-open");
      show(index);
      box.querySelector(".lightbox-close").focus();
    }

    function close() {
      box.hidden = true;
      document.body.classList.remove("lightbox-open");
      imgEl.removeAttribute("src");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-lightbox]");
      if (!t) return;
      e.preventDefault();
      openFrom(t);
    });

    box.addEventListener("click", function (e) {
      if (e.target === box) close();
    });
    box.querySelector(".lightbox-close").addEventListener("click", close);
    btnPrev.addEventListener("click", function () { show(index - 1); });
    btnNext.addEventListener("click", function () { show(index + 1); });
    document.addEventListener("keydown", function (e) {
      if (box.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") show(index - 1);
      else if (e.key === "ArrowRight") show(index + 1);
    });
  })();
})();
