/* 지점별 장비 리스트 (방배점 | 연건점) — /api/equipment 사용 */
(function () {
  "use strict";
  var ADMIN_KEY = "mbm-admin-pw";
  var STUDIOS = { bangbae: "방배점", yeongeon: "연건점" };
  var EMPTY = {
    bangbae: "등록된 장비가 없습니다.",
    yeongeon: "연건점은 오픈 준비중입니다. 장비 목록은 곧 안내해 드릴게요."
  };
  var $ = function (id) { return document.getElementById(id); };
  function adminPw() { try { return sessionStorage.getItem(ADMIN_KEY) || ""; } catch (e) { return ""; } }
  function setAdminPw(v) { try { v ? sessionStorage.setItem(ADMIN_KEY, v) : sessionStorage.removeItem(ADMIN_KEY); } catch (e) {} }
  function api(method, path, body) {
    var headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (adminPw()) headers["X-Admin-Password"] = adminPw();
    return fetch(path, { method: method, headers: headers, cache: "no-store", body: body !== undefined ? JSON.stringify(body) : undefined })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) { var e = new Error(data.error || "요청을 처리하지 못했습니다. (" + res.status + ")"); e.status = res.status; throw e; }
          return data;
        });
      }, function () { throw new Error("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); });
  }
  function msg(el, text, ok) { el.textContent = text || ""; el.hidden = !text; el.classList.toggle("ok", !!ok); }
  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; }

  var current = null, editing = null;
  var tabs = document.querySelectorAll("[data-eq-tab]");

  function selectTab(studio, focus) {
    if (!STUDIOS[studio]) studio = "bangbae";
    current = studio; editing = null;
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-eq-tab") === studio;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $("eq-panel").setAttribute("aria-labelledby", "tab-" + studio);
    $("eq-panel").setAttribute("data-studio", studio);
    $("eq-title").textContent = STUDIOS[studio] + " 장비 리스트";
    $("eq-form-studio").textContent = STUDIOS[studio];
    resetForm();
    if (location.hash !== "#" + studio) history.replaceState(null, "", location.pathname + location.search + "#" + studio);
    load();
  }

  function load() {
    var studio = current, list = $("eq-list");
    msg($("eq-msg"), "");
    return api("GET", "/api/equipment?studio=" + studio).then(function (data) {
      if (studio !== current) return;
      list.textContent = "";
      $("eq-empty").textContent = EMPTY[studio];
      $("eq-empty").hidden = data.items.length > 0;
      var admin = !!adminPw(), lastCat = null, table = null;
      data.items.forEach(function (it, i) {
        var cat = it.category || "기타";
        if (cat !== lastCat) {
          lastCat = cat;
          var group = el("section", "eq-group");
          group.appendChild(el("h3", "eq-cat", cat));
          table = el("ul", "eq-items");
          group.appendChild(table);
          list.appendChild(group);
        }
        var li = el("li", "eq-item");
        var main = el("div", "eq-main");
        var name = el("span", "eq-name", it.name);
        main.appendChild(name);
        if (it.qty !== null && it.qty !== undefined) main.appendChild(el("span", "eq-qty", it.qty + "개"));
        li.appendChild(main);
        if (it.model) li.appendChild(el("p", "eq-model", it.model));
        if (it.note) li.appendChild(el("p", "eq-note", it.note));
        if (admin) {
          var row = el("div", "eq-admin");
          [["↑", "위로", function () { move(it, "up"); }, i === 0],
           ["↓", "아래로", function () { move(it, "down"); }, i === data.items.length - 1],
           ["수정", "", function () { startEdit(it); }],
           ["삭제", "", function () { remove(it); }]].forEach(function (b) {
            var btn = el("button", "btn btn-sm " + (b[0] === "삭제" ? "btn-danger" : "btn-ghost"), b[0]);
            btn.type = "button";
            if (b[1]) btn.setAttribute("aria-label", it.name + " " + b[1]);
            if (b[3]) btn.disabled = true;
            btn.addEventListener("click", b[2]);
            row.appendChild(btn);
          });
          li.appendChild(row);
        }
        table.appendChild(li);
      });
    }).catch(function (e) { msg($("eq-msg"), e.message); });
  }

  function move(it, dir) { api("PATCH", "/api/equipment/" + it.id, { move: dir }).then(load).catch(function (e) { msg($("eq-msg"), e.message); }); }
  function remove(it) {
    if (!confirm("'" + it.name + "' 장비를 " + STUDIOS[current] + " 목록에서 삭제할까요?")) return;
    api("DELETE", "/api/equipment/" + it.id).then(function () { msg($("eq-msg"), "삭제했습니다.", true); load(); })
      .catch(function (e) { msg($("eq-msg"), e.message); });
  }
  function resetForm() {
    editing = null;
    var f = $("eq-form"); f.reset();
    $("eq-form-mode").textContent = "장비 추가";
    $("eq-form-submit").textContent = "추가";
    $("eq-form-cancel").hidden = true;
    msg($("eq-form-msg"), "");
  }
  function startEdit(it) {
    editing = it;
    var f = $("eq-form");
    f.elements.category.value = it.category || "";
    f.elements.name.value = it.name;
    f.elements.model.value = it.model || "";
    f.elements.qty.value = it.qty === null || it.qty === undefined ? "" : it.qty;
    f.elements.note.value = it.note || "";
    $("eq-form-mode").textContent = "장비 수정 — " + it.name;
    $("eq-form-submit").textContent = "저장";
    $("eq-form-cancel").hidden = false;
    msg($("eq-form-msg"), "");
    f.scrollIntoView({ behavior: "smooth", block: "center" });
    f.elements.name.focus();
  }
  $("eq-form-cancel").addEventListener("click", resetForm);
  $("eq-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var body = {
      category: f.elements.category.value.trim(), name: f.elements.name.value.trim(),
      model: f.elements.model.value.trim(), qty: f.elements.qty.value.trim(), note: f.elements.note.value.trim()
    };
    if (!body.name) return msg($("eq-form-msg"), "장비 이름을 입력해 주세요.");
    var req = editing
      ? api("PATCH", "/api/equipment/" + editing.id, body)
      : api("POST", "/api/equipment", Object.assign({ studio: current }, body)); // 지점은 현재 탭으로 고정
    var was = editing;
    req.then(function () {
      resetForm();
      msg($("eq-form-msg"), was ? "수정했습니다." : STUDIOS[current] + "에 추가했습니다.", true);
      load();
    }).catch(function (e2) {
      if (e2.status === 403) { setAdminPw(""); refreshAdmin(); }
      msg($("eq-form-msg"), e2.message);
    });
  });

  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t.getAttribute("data-eq-tab")); });
    t.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next.getAttribute("data-eq-tab"), true);
    });
  });
  window.addEventListener("hashchange", function () {
    var h = location.hash.slice(1);
    if (STUDIOS[h] && h !== current) selectTab(h);
  });

  // 관리자
  function refreshAdmin() {
    var on = !!adminPw();
    $("eq-admin-panel").hidden = !on;
    $("eq-admin-login").hidden = true;
    $("eq-admin-link").hidden = on;
  }
  function showLogin() { $("eq-admin-login").hidden = false; $("eq-admin-pw").value = ""; msg($("eq-login-msg"), ""); $("eq-admin-pw").focus(); }
  $("eq-admin-link").addEventListener("click", function (e) { e.preventDefault(); showLogin(); });
  $("eq-admin-cancel").addEventListener("click", function () { $("eq-admin-login").hidden = true; });
  $("eq-admin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    setAdminPw($("eq-admin-pw").value);
    api("POST", "/api/gallery/admin").then(function () {
      history.replaceState(null, "", location.pathname + "#" + current);
      refreshAdmin(); load();
    }).catch(function (e2) { setAdminPw(""); msg($("eq-login-msg"), e2.message); });
  });
  $("eq-admin-logout").addEventListener("click", function () { setAdminPw(""); refreshAdmin(); load(); });

  refreshAdmin();
  selectTab(location.hash.slice(1));
  if (/[?&]admin\b/.test(location.search) && !adminPw()) showLogin();
})();
