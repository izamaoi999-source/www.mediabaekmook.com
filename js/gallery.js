/* 촬영샘플 (유튜브·Vimeo) — 썸네일 먼저, 클릭하면 플레이어 로드. /api/gallery/* 사용 */
(function () {
  "use strict";
  var API = "/api/gallery";
  var ADMIN_KEY = "mbm-admin-pw"; // 견적 게시판과 같은 관리자 세션
  var $ = function (id) { return document.getElementById(id); };
  function adminPw() { try { return sessionStorage.getItem(ADMIN_KEY) || ""; } catch (e) { return ""; } }
  function setAdminPw(v) { try { v ? sessionStorage.setItem(ADMIN_KEY, v) : sessionStorage.removeItem(ADMIN_KEY); } catch (e) {} }
  function fmtDate(ms) {
    var d = new Date(ms), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate());
  }
  function api(method, path, body) {
    var headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (adminPw()) headers["X-Admin-Password"] = adminPw();
    return fetch(API + path, { method: method, headers: headers, cache: "no-store", body: body !== undefined ? JSON.stringify(body) : undefined })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) { var e = new Error(data.error || "요청을 처리하지 못했습니다. (" + res.status + ")"); e.status = res.status; throw e; }
          return data;
        });
      }, function () { throw new Error("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); });
  }
  function safeUrl(u, hosts) {
    try { var x = new URL(u); return x.protocol === "https:" && hosts.test(x.hostname) ? x.toString() : ""; } catch (e) { return ""; }
  }

  function renderCard(v, opts) {
    var card = document.createElement("article");
    card.className = "video-card";
    var media = document.createElement("div");
    media.className = "video-media";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "video-thumb";
    btn.setAttribute("aria-label", v.title + " 재생");
    var thumb = safeUrl(v.thumb, /(^|\.)(ytimg\.com|vimeocdn\.com)$/);
    if (thumb) {
      var img = document.createElement("img");
      img.src = thumb; img.alt = ""; img.loading = "lazy"; img.width = 480; img.height = 270;
      btn.appendChild(img);
    }
    var play = document.createElement("span");
    play.className = "video-play video-play-" + (v.provider === "vimeo" ? "vimeo" : "youtube");
    play.setAttribute("aria-hidden", "true");
    btn.appendChild(play);
    var badge = document.createElement("span");
    badge.className = "video-provider"; badge.textContent = v.provider === "vimeo" ? "Vimeo" : "YouTube";
    btn.appendChild(badge);
    btn.addEventListener("click", function () {
      var src = safeUrl(v.embed, /^(www\.youtube-nocookie\.com|player\.vimeo\.com)$/);
      if (!src) return;
      var ifr = document.createElement("iframe");
      ifr.src = src;
      ifr.title = v.title;
      ifr.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write";
      ifr.setAttribute("allowfullscreen", "");
      ifr.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      media.replaceChild(ifr, btn);
    });
    media.appendChild(btn);
    card.appendChild(media);

    var body = document.createElement("div");
    body.className = "video-body";
    var h = document.createElement("h3");
    h.textContent = v.title;
    if (v.pinned) { var pin = document.createElement("span"); pin.className = "video-pin"; pin.textContent = "고정"; h.prepend(pin); }
    body.appendChild(h);
    if (v.description) { var d = document.createElement("p"); d.className = "video-desc"; d.textContent = v.description; body.appendChild(d); }
    var date = document.createElement("p"); date.className = "video-date"; date.textContent = fmtDate(v.created_at);
    body.appendChild(date);
    if (opts && opts.admin) {
      var row = document.createElement("div"); row.className = "video-admin";
      var bp = document.createElement("button"); bp.type = "button"; bp.className = "btn btn-ghost btn-sm";
      bp.textContent = v.pinned ? "고정 해제" : "맨 위 고정";
      bp.addEventListener("click", function () { opts.onPin(v); });
      var bd = document.createElement("button"); bd.type = "button"; bd.className = "btn btn-danger btn-sm"; bd.textContent = "삭제";
      bd.addEventListener("click", function () { opts.onDelete(v); });
      row.appendChild(bp); row.appendChild(bd); body.appendChild(row);
    }
    card.appendChild(body);
    return card;
  }

  // ---------- 홈·지점 페이지: 최신 영상 3개 (없으면 섹션 숨김) ----------
  document.querySelectorAll("[data-video-latest]").forEach(function (section) {
    var grid = section.querySelector("[data-video-grid]");
    var n = parseInt(section.getAttribute("data-video-latest"), 10) || 3;
    api("GET", "/videos?limit=" + n).then(function (data) {
      if (!data.videos || !data.videos.length) { section.hidden = true; return; }
      grid.textContent = "";
      data.videos.forEach(function (v) { grid.appendChild(renderCard(v)); });
      section.hidden = false;
    }).catch(function () { section.hidden = true; });
  });

  // ---------- 촬영샘플 페이지 ----------
  var root = $("video-gallery");
  if (!root) return;
  var grid = $("video-grid"), more = $("video-more"), empty = $("video-empty"), state = { page: 0, pages: 1 };
  function msg(id, text, ok) { var el = $(id); el.textContent = text || ""; el.hidden = !text; el.classList.toggle("ok", !!ok); }
  function isAdminMode() { return !!adminPw(); }
  function refreshAdminUi() {
    var on = isAdminMode();
    $("video-admin-panel").hidden = !on;
    $("video-admin-login").hidden = true;
    $("video-admin-link").hidden = on;
  }
  function load(reset) {
    if (reset) { state.page = 0; grid.textContent = ""; }
    var next = state.page + 1;
    return api("GET", "/videos?limit=12&page=" + next).then(function (data) {
      state.page = data.page; state.pages = data.pages;
      data.videos.forEach(function (v) {
        grid.appendChild(renderCard(v, isAdminMode() ? { admin: true, onPin: pin, onDelete: del } : null));
      });
      empty.hidden = data.total > 0;
      more.hidden = state.page >= state.pages;
    }).catch(function (e) { msg("video-msg", e.message); });
  }
  function pin(v) {
    api("PATCH", "/videos/" + v.id, { pinned: !v.pinned }).then(function () { load(true); }).catch(function (e) { msg("video-msg", e.message); });
  }
  function del(v) {
    if (!confirm("'" + v.title + "' 영상을 촬영샘플에서 삭제할까요?")) return;
    api("DELETE", "/videos/" + v.id).then(function () { msg("video-msg", "영상을 삭제했습니다.", true); load(true); })
      .catch(function (e) { msg("video-msg", e.message); });
  }
  more.addEventListener("click", function () { load(false); });

  $("video-add-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, submit = f.querySelector("[type=submit]");
    var body = { url: f.elements.url.value.trim(), title: f.elements.title.value.trim(), description: f.elements.description.value.trim() };
    if (!body.url) return msg("video-add-msg", "영상 주소를 붙여넣어 주세요.");
    submit.disabled = true; msg("video-add-msg", "영상 정보를 확인하는 중…", true);
    api("POST", "/videos", body).then(function (data) {
      f.reset();
      msg("video-add-msg", "'" + data.video.title + "' 영상을 추가했습니다.", true);
      return load(true);
    }).catch(function (e2) {
      if (e2.status === 403) { setAdminPw(""); refreshAdminUi(); }
      msg("video-add-msg", e2.message);
    }).then(function () { submit.disabled = false; });
  });

  function showLogin() { $("video-admin-login").hidden = false; $("video-admin-pw").value = ""; msg("video-login-msg", ""); $("video-admin-pw").focus(); }
  $("video-admin-link").addEventListener("click", function (e) { e.preventDefault(); history.replaceState(null, "", "?admin"); showLogin(); });
  $("video-admin-cancel").addEventListener("click", function () { $("video-admin-login").hidden = true; history.replaceState(null, "", location.pathname); });
  $("video-admin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    setAdminPw($("video-admin-pw").value);
    api("POST", "/admin").then(function () {
      history.replaceState(null, "", location.pathname);
      refreshAdminUi(); load(true);
    }).catch(function (e2) { setAdminPw(""); msg("video-login-msg", e2.message); });
  });
  $("video-admin-logout").addEventListener("click", function () { setAdminPw(""); refreshAdminUi(); load(true); });

  refreshAdminUi();
  load(true);
  if (/[?&]admin\b/.test(location.search) && !isAdminMode()) showLogin();
})();
