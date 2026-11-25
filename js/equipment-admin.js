/* 예약 관리 페이지의 '장비 내역 관리' — 지점별 장비를 추가·수정·삭제·순서 변경합니다.
   예약 관리와 같은 관리자 비밀번호(sessionStorage mbm-admin-pw)를 쓰며, 로그인해서 작업 화면이 보일 때 불러옵니다.
   여기서 바꾼 내용은 지점 소개 페이지(/bangbae/)와 장비 리스트(/equipment)에 바로 반영됩니다. */
(function () {
  "use strict";
  var ADMIN_KEY = "mbm-admin-pw";
  var STUDIOS = { bangbae: "방배점", yeongeon: "연건점" };
  var PAGES = { bangbae: "/bangbae/#equipment", yeongeon: "/equipment#yeongeon" };
  var $ = function (id) { return document.getElementById(id); };
  var workspace = $("ba-workspace"), form = $("ba-eq-form");
  if (!workspace || !form) return;

  var studio = "bangbae", editing = null, items = [], busy = false, loadedOnce = false;

  function password() { try { return sessionStorage.getItem(ADMIN_KEY) || ""; } catch (_) { return ""; } }
  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = String(text); return x; }
  function message(id, text, error) { var m = $(id); m.textContent = text || ""; m.hidden = !text; m.classList.toggle("ba-error", !!error); }
  function api(method, path, body) {
    var headers = { "X-Admin-Password": password() };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(path, { method: method, headers: headers, cache: "no-store", credentials: "same-origin", body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || "요청을 처리하지 못했습니다. (" + res.status + ")");
          return data;
        });
      }, function () { throw new Error("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); });
  }
  function setBusy(on) {
    busy = on;
    $("ba-equipment").querySelectorAll("button, input, select").forEach(function (b) { if (!b.hasAttribute("data-eq-locked")) b.disabled = on; });
  }

  function load() {
    var want = studio;
    message("ba-eq-message", "");
    $("ba-eq-view").href = PAGES[studio];
    return api("GET", "/api/equipment?studio=" + want).then(function (data) {
      if (want !== studio) return;
      items = data.items || [];
      render();
    }).catch(function (e) { message("ba-eq-message", e.message, true); });
  }

  function render() {
    var list = $("ba-eq-list"), cats = {};
    list.textContent = "";
    $("ba-eq-count").textContent = STUDIOS[studio] + " · " + items.length + "개 항목";
    if (!items.length) list.appendChild(el("p", "ba-empty", "등록된 장비가 없습니다. 아래에서 추가하세요."));
    var lastCat = null;
    items.forEach(function (it, i) {
      var cat = it.category || "기타";
      cats[cat] = true;
      if (cat !== lastCat) { lastCat = cat; list.appendChild(el("h3", "ba-eq-cat", cat)); }
      var row = el("div", "ba-eq-item" + (editing && editing.id === it.id ? " is-editing" : ""));
      var info = el("div", "ba-eq-info");
      var title = el("p", "ba-eq-name", it.name);
      if (it.qty !== null && it.qty !== undefined) title.appendChild(el("span", "ba-eq-qty", " · " + it.qty + "개"));
      info.appendChild(title);
      if (it.model) info.appendChild(el("p", "ba-eq-sub", it.model));
      if (it.note) info.appendChild(el("p", "ba-eq-sub ba-eq-note", it.note));
      row.appendChild(info);
      var actions = el("div", "ba-eq-actions");
      [["↑", it.name + " 위로", function () { move(it, "up"); }, i === 0],
       ["↓", it.name + " 아래로", function () { move(it, "down"); }, i === items.length - 1],
       ["수정", it.name + " 수정", function () { startEdit(it); }],
       ["삭제", it.name + " 삭제", function () { remove(it); }]].forEach(function (b) {
        var btn = el("button", "btn btn-sm " + (b[0] === "삭제" ? "btn-danger" : "btn-ghost"), b[0]);
        btn.type = "button";
        btn.setAttribute("aria-label", b[1]);
        btn.disabled = !!b[3];
        if (b[3]) btn.setAttribute("data-eq-locked", "");
        btn.addEventListener("click", b[2]);
        actions.appendChild(btn);
      });
      row.appendChild(actions);
      list.appendChild(row);
    });
    // 분류 자동완성
    var dl = $("ba-eq-cats");
    dl.textContent = "";
    Object.keys(cats).forEach(function (c) { var o = document.createElement("option"); o.value = c; dl.appendChild(o); });
  }

  function run(promise, okText) {
    setBusy(true);
    return promise.then(function () {
      if (okText) message("ba-eq-message", okText);
      return load();
    }).catch(function (e) { message("ba-eq-message", e.message, true); })
      .then(function () { setBusy(false); render(); });
  }
  function move(it, dir) { if (!busy) run(api("PATCH", "/api/equipment/" + it.id, { move: dir })); }
  function remove(it) {
    if (busy || !window.confirm("'" + it.name + "' 장비를 " + STUDIOS[studio] + " 목록에서 삭제할까요?\n삭제하면 되돌릴 수 없습니다.")) return;
    if (editing && editing.id === it.id) resetForm();
    run(api("DELETE", "/api/equipment/" + it.id), "'" + it.name + "' 을(를) 삭제했습니다.");
  }

  function resetForm() {
    editing = null;
    form.reset();
    $("ba-eq-form-title").textContent = "장비 추가";
    $("ba-eq-submit").textContent = "추가";
    $("ba-eq-cancel").hidden = true;
    message("ba-eq-form-message", "");
  }
  function startEdit(it) {
    editing = it;
    var f = form.elements;
    f.category.value = it.category || "";
    f.name.value = it.name || "";
    f.model.value = it.model || "";
    f.qty.value = it.qty === null || it.qty === undefined ? "" : it.qty;
    f.note.value = it.note || "";
    $("ba-eq-form-title").textContent = "장비 수정 — " + it.name;
    $("ba-eq-submit").textContent = "저장";
    $("ba-eq-cancel").hidden = false;
    message("ba-eq-form-message", "");
    render();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    f.name.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var f = form.elements;
    var body = { category: f.category.value.trim(), name: f.name.value.trim(), model: f.model.value.trim(), qty: f.qty.value.trim(), note: f.note.value.trim() };
    if (!body.name) { message("ba-eq-form-message", "장비 이름을 입력해 주세요.", true); f.name.focus(); return; }
    var was = editing;
    var req = was ? api("PATCH", "/api/equipment/" + was.id, body) : api("POST", "/api/equipment", Object.assign({ studio: studio }, body));
    setBusy(true);
    req.then(function () {
      resetForm();
      message("ba-eq-form-message", was ? "'" + body.name + "' 을(를) 수정했습니다." : STUDIOS[studio] + "에 '" + body.name + "' 을(를) 추가했습니다.");
      return load();
    }).catch(function (e2) { message("ba-eq-form-message", e2.message, true); })
      .then(function () { setBusy(false); render(); });
  });
  $("ba-eq-cancel").addEventListener("click", function () { resetForm(); render(); });
  $("ba-eq-studio").addEventListener("change", function (e) {
    studio = STUDIOS[e.target.value] ? e.target.value : "bangbae";
    $("ba-eq-form-studio").textContent = STUDIOS[studio];
    resetForm();
    load();
  });

  // 로그인해서 작업 화면이 보이면 불러오고, 로그아웃하면 비움
  function sync() {
    if (workspace.hidden) { loadedOnce = false; items = []; $("ba-eq-list").textContent = ""; resetForm(); return; }
    if (!loadedOnce) { loadedOnce = true; load(); }
  }
  new MutationObserver(sync).observe(workspace, { attributes: true, attributeFilter: ["hidden"] });
  sync();
})();
