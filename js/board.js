/* 견적 및 문의 게시판 (비밀글) — /api/board/* 사용 */
(function () {
  "use strict";
  var API = "/api/board";
  var ADMIN_KEY = "mbm-admin-pw";
  var $ = function (id) { return document.getElementById(id); };
  var views = ["view-list", "view-admin", "view-write", "view-unlock", "view-post"];
  var state = { page: 1, current: null, currentPw: "", role: null };

  function adminPw() { try { return sessionStorage.getItem(ADMIN_KEY) || ""; } catch (e) { return ""; } }
  function setAdminPw(v) { try { v ? sessionStorage.setItem(ADMIN_KEY, v) : sessionStorage.removeItem(ADMIN_KEY); } catch (e) {} }

  function show(id) {
    views.forEach(function (v) { $(v).hidden = v !== id; });
    $("admin-bar").hidden = !adminPw();
    var top = $("board").getBoundingClientRect().top + window.scrollY - 80;
    if (window.scrollY > top) window.scrollTo(0, top);
  }
  function msg(id, text, ok) {
    var el = $(id);
    el.textContent = text || "";
    el.hidden = !text;
    el.classList.toggle("ok", !!ok);
  }
  function fmtDate(ms, withTime) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    var s = d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate());
    return withTime ? s + " " + p(d.getHours()) + ":" + p(d.getMinutes()) : s;
  }

  function api(method, path, body) {
    var headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    var ap = adminPw();
    if (ap) headers["X-Admin-Password"] = ap;
    return fetch(API + path, {
      method: method, headers: headers, cache: "no-store",
      body: body !== undefined ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var e = new Error(data.error || "요청을 처리하지 못했습니다. (" + res.status + ")");
          e.status = res.status;
          throw e;
        }
        return data;
      });
    }, function () { throw new Error("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); });
  }

  // ---------- 목록 ----------
  function loadList(page) {
    state.page = page || 1;
    msg("list-msg", "");
    return api("GET", "/posts?page=" + state.page).then(function (data) {
      state.page = data.page;
      var rows = $("board-rows");
      rows.textContent = "";
      data.posts.forEach(function (p) {
        var a = document.createElement("a");
        a.className = "board-row";
        a.setAttribute("role", "row");
        a.href = "#post-" + p.id;
        a.addEventListener("click", function (e) { e.preventDefault(); openPost(p); });
        var no = document.createElement("span"); no.className = "c-no"; no.textContent = p.no;
        var t = document.createElement("span"); t.className = "c-title";
        var lock = document.createElement("span"); lock.className = "lock"; lock.setAttribute("aria-label", "비밀글"); lock.textContent = "🔒";
        var tt = document.createElement("span"); tt.className = "t"; tt.textContent = p.title;
        t.appendChild(lock); t.appendChild(tt);
        if (p.replied) { var b = document.createElement("span"); b.className = "badge-done"; b.textContent = "답변완료"; t.appendChild(b); }
        var n = document.createElement("span"); n.className = "c-name"; n.textContent = p.name;
        var d = document.createElement("span"); d.className = "c-date"; d.textContent = fmtDate(p.created_at);
        [no, t, n, d].forEach(function (c) { c.setAttribute("role", "cell"); a.appendChild(c); });
        rows.appendChild(a);
      });
      $("board-empty").hidden = data.total > 0;
      $("board-total").textContent = "전체 " + data.total + "건";
      renderPager(data.page, data.pages);
    }).catch(function (e) { msg("list-msg", e.message); });
  }
  function renderPager(page, pages) {
    var nav = $("board-pager");
    nav.textContent = "";
    if (pages <= 1) return;
    var start = Math.max(1, page - 4), end = Math.min(pages, start + 9);
    start = Math.max(1, end - 9);
    function btn(label, p, cur) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      if (cur) { b.className = "current"; b.setAttribute("aria-current", "page"); }
      b.addEventListener("click", function () { loadList(p); });
      nav.appendChild(b);
    }
    if (page > 1) btn("‹", page - 1);
    for (var i = start; i <= end; i++) btn(String(i), i, i === page);
    if (page < pages) btn("›", page + 1);
  }

  // ---------- 글 열기 ----------
  function openPost(p) {
    state.current = p; state.currentPw = "";
    if (adminPw()) return fetchPost(p.id, "");
    $("unlock-title").textContent = p.title;
    $("unlock-pw").value = "";
    msg("unlock-msg", "");
    show("view-unlock");
    $("unlock-pw").focus();
  }
  function fetchPost(id, pw) {
    return api("POST", "/posts/" + id, { password: pw }).then(function (data) {
      state.currentPw = pw; state.role = data.role;
      renderPost(data.post, data.role);
      show("view-post");
    }).catch(function (e) {
      if (e.status === 403 && adminPw() && !pw) { setAdminPw(""); return openPost(state.current); }
      if (!$("view-unlock").hidden) msg("unlock-msg", e.message); else { show("view-list"); msg("list-msg", e.message); }
    });
  }
  function renderPost(post, role) {
    state.current = post;
    $("post-title").textContent = post.title;
    $("post-meta").textContent = post.name + " · " + fmtDate(post.created_at, true);
    var info = $("post-info"); info.textContent = "";
    [["스튜디오", post.studioLabel], ["희망 날짜", post.desired_date || "-"], ["연락처", post.contact || "-"]].forEach(function (r) {
      var dt = document.createElement("dt"); dt.textContent = r[0];
      var dd = document.createElement("dd"); dd.textContent = r[1];
      info.appendChild(dt); info.appendChild(dd);
    });
    $("post-content").textContent = post.content;
    var hasReply = !!post.reply;
    $("post-reply").hidden = !hasReply;
    if (hasReply) {
      $("reply-content").textContent = post.reply;
      $("reply-meta").textContent = "관리자 · " + fmtDate(post.replied_at, true);
    }
    $("reply-wait").hidden = hasReply || role === "admin";
    $("reply-form").hidden = role !== "admin";
    $("reply-text").value = post.reply || "";
    msg("post-msg", "");
  }

  // ---------- 이벤트 ----------
  document.querySelectorAll("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (/[?&]admin\b/.test(location.search)) history.replaceState(null, "", location.pathname);
      show("view-list"); loadList(state.page);
    });
  });

  $("btn-write").addEventListener("click", function () { msg("write-msg", ""); show("view-write"); });

  $("write-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, v = function (n) { return f.elements[n].value.trim(); };
    var body = {
      name: v("name"), contact: v("contact"), studio: f.elements.studio.value,
      desired_date: v("desired_date"), title: v("title"), content: f.elements.content.value.trim(),
      password: f.elements.password.value, website: f.elements.website.value, consent: f.elements.consent.checked
    };
    if (!body.name) return msg("write-msg", "이름을 입력해 주세요.");
    if (!body.title) return msg("write-msg", "제목을 입력해 주세요.");
    if (!body.content) return msg("write-msg", "내용을 입력해 주세요.");
    if (body.password.length < 4) return msg("write-msg", "비밀번호는 4자 이상 입력해 주세요.");
    if (!body.consent) return msg("write-msg", "개인정보 수집·이용에 동의해 주세요.");
    var submit = f.querySelector("[type=submit]"); submit.disabled = true;
    api("POST", "/posts", body).then(function () {
      f.reset();
      show("view-list");
      return loadList(1).then(function () { msg("list-msg", "문의가 등록되었습니다. 글을 열 때 방금 정한 비밀번호를 입력해 주세요.", true); });
    }).catch(function (e2) { msg("write-msg", e2.message); })
      .then(function () { submit.disabled = false; });
  });

  $("unlock-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = $("unlock-pw").value;
    if (!pw) return;
    fetchPost(state.current.id, pw);
  });

  $("btn-delete").addEventListener("click", function () {
    if (!state.current) return;
    if (!confirm("이 글을 삭제할까요? 삭제한 글은 되돌릴 수 없습니다.")) return;
    api("DELETE", "/posts/" + state.current.id, { password: state.currentPw }).then(function () {
      show("view-list");
      return loadList(state.page).then(function () { msg("list-msg", "글을 삭제했습니다.", true); });
    }).catch(function (e) { msg("post-msg", e.message); });
  });

  $("reply-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var text = $("reply-text").value.trim();
    api("PUT", "/posts/" + state.current.id + "/reply", { reply: text }).then(function (data) {
      state.current.reply = data.reply; state.current.replied_at = data.replied_at;
      renderPost(state.current, "admin");
      msg("post-msg", text ? "답변을 저장했습니다." : "답변을 삭제했습니다.", true);
    }).catch(function (e2) { msg("post-msg", e2.message); });
  });

  function showAdminLogin() { $("admin-pw").value = ""; msg("admin-msg", ""); show("view-admin"); $("admin-pw").focus(); }
  $("admin-link").addEventListener("click", function (e) {
    e.preventDefault();
    if (adminPw()) return;
    history.replaceState(null, "", "?admin");
    showAdminLogin();
  });
  $("admin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = $("admin-pw").value;
    setAdminPw(pw);
    api("POST", "/admin").then(function () {
      history.replaceState(null, "", location.pathname);
      show("view-list"); loadList(state.page);
    }).catch(function (e2) { setAdminPw(""); msg("admin-msg", e2.message); });
  });
  $("admin-logout").addEventListener("click", function () { setAdminPw(""); show("view-list"); loadList(state.page); });

  // 시작
  show("view-list");
  loadList(1);
  if (/[?&]admin\b/.test(location.search) && !adminPw()) showAdminLogin();
})();
