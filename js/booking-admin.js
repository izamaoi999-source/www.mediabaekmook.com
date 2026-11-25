/* 예약 관리자: 관리자 비밀번호는 기존 문의 게시판과 같은 탭 세션에서만 사용합니다. */
(function () {
  "use strict";
  var ADMIN_KEY = "mbm-admin-pw";
  var labels = { requested: "접수 대기", confirmed: "예약 확정", completed: "이용 완료", cancelled: "취소" };
  var shootLabels = { ppt: "PPT·PC 강의", board: "칠판·전자칠판", chromakey: "크로마키", other: "기타" };
  // 관리자 직권: 모든 상태로 변경 가능
  var statusOrder = ["requested", "confirmed", "completed", "cancelled"];
  var state = { authenticated: false, password: "", bookings: [], current: null, page: 1, loading: false, saving: false, generation: 0 };
  var $ = function (id) { return document.getElementById(id); };

  function storedPassword() { try { return sessionStorage.getItem(ADMIN_KEY) || ""; } catch (_) { return ""; } }
  function rememberPassword(value) { state.password = value; try { if (value) sessionStorage.setItem(ADMIN_KEY, value); else sessionStorage.removeItem(ADMIN_KEY); } catch (_) {} }
  function message(id, text, error) { var el = $(id); el.textContent = text || ""; el.hidden = !text; el.classList.toggle("ba-error", !!error); }
  function element(tag, className, text) { var el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = String(text); return el; }
  function statusClass(status) { return Object.prototype.hasOwnProperty.call(labels, status) ? "ba-status-" + status : ""; }
  function money(value) { return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ko-KR") + "원" : "확인 필요"; }
  function timeRange(booking) {
    var match = /^(\d{2}):(\d{2})$/.exec(booking.start_time || "");
    if (!match || !Number.isFinite(booking.duration)) return "시간 확인 필요";
    var end = Number(match[1]) * 60 + Number(match[2]) + booking.duration * 60;
    return booking.start_time + "–" + String(Math.floor(end / 60)).padStart(2, "0") + ":" + String(end % 60).padStart(2, "0") + " · " + booking.duration + "시간";
  }
  function dateTime(value) {
    var date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date) : "-";
  }
  function clearDetails() {
    state.current = null;
    $("ba-detail-body").hidden = true;
    $("ba-detail-empty").hidden = false;
    ["ba-reference", "ba-person-title", "ba-current-status", "ba-facts", "ba-notes", "ba-estimate-lines", "ba-status", "ba-updated"].forEach(function (id) { $(id).textContent = ""; });
    $("ba-admin-note").value = "";
    $("ba-calendar-checked").checked = false;
    $("ba-confirm-check").hidden = true;
    $("ba-force").checked = false;
    ["ba-edit-date", "ba-edit-name", "ba-edit-contact", "ba-edit-notes"].forEach(function (id) { $(id).value = ""; });
    $("ba-edit-estimate").textContent = "";
    closeDelete();
    message("ba-detail-message", "");
    $("ba-sms-phone").value = "";
    $("ba-sms-text").value = "";
    $("ba-sms-state").textContent = "";
    message("ba-sms-message", "");
    updateSmsLink();
  }
  function showLogin(text) {
    state.generation++;
    state.authenticated = false;
    state.bookings = [];
    state.loading = false;
    state.saving = false;
    rememberPassword("");
    $("ba-list").textContent = "";
    $("ba-pager").textContent = "";
    $("ba-count").textContent = "";
    $("ba-password").value = "";
    clearDetails();
    $("ba-workspace").hidden = true;
    $("ba-logout").hidden = true;
    $("ba-login").hidden = false;
    $("ba-login-submit").disabled = false;
    $("ba-password").disabled = false;
    setBusy(false);
    message("ba-main-message", "");
    message("ba-login-message", text, !!text);
  }
  function api(path, options) {
    options = options || {};
    var headers = { "X-Admin-Password": state.password };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(path, { method: options.method || "GET", headers: headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), credentials: "same-origin", cache: "no-store" }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { var error = new Error(data.error || "요청을 처리하지 못했습니다. (" + res.status + ")"); error.status = res.status; throw error; }
        return data;
      });
    }, function () { throw new Error("서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."); });
  }
  function setBusy(busy) {
    $("ba-filter-form").querySelectorAll("input, select, button").forEach(function (el) { el.disabled = busy; });
    $("ba-list").querySelectorAll("button").forEach(function (el) { el.disabled = busy; });
    $("ba-pager").querySelectorAll("button").forEach(function (el) { el.disabled = busy || el.dataset.pageDisabled === "true"; });
    $("ba-update-form").querySelectorAll("input, select, textarea, button").forEach(function (el) { el.disabled = busy; });
    $("ba-delete-open").disabled = busy;
    $("ba-delete-reference").disabled = busy;
    $("ba-delete-cancel").disabled = busy;
    $("ba-delete-submit").disabled = busy || !deleteMatches();
    $("ba-sms-phone").disabled = busy;
    $("ba-sms-text").disabled = busy;
    $("ba-sms-copy").disabled = busy;
    $("ba-sms-reset").disabled = busy;
    updateSmsLink();
    $("ba-list-panel").setAttribute("aria-busy", busy ? "true" : "false");
  }
  function renderList(data) {
    var list = $("ba-list"); list.textContent = "";
    state.bookings.forEach(function (booking) {
      var button = element("button", "ba-booking-card"); button.type = "button"; button.setAttribute("aria-pressed", state.current && state.current.id === booking.id ? "true" : "false");
      var top = element("span", "ba-card-top");
      top.appendChild(element("span", "ba-card-name", booking.name || "이름 확인 필요"));
      top.appendChild(element("span", "ba-status " + statusClass(booking.status), labels[booking.status] || "상태 확인 필요"));
      button.appendChild(top);
      button.appendChild(element("span", "ba-card-time", (booking.date || "날짜 확인 필요") + " · " + timeRange(booking)));
      button.appendChild(element("span", "ba-card-option", (shootLabels[booking.shoot_type] || "기타") + (booking.assist ? " · 촬영대행 요청" : " · 셀프 촬영")));
      button.appendChild(element("span", "ba-card-reference", booking.reference || ""));
      button.addEventListener("click", function () { if (!state.saving && !state.loading) openBooking(booking, true); });
      list.appendChild(button);
    });
    $("ba-empty").hidden = state.bookings.length !== 0;
    $("ba-count").textContent = "총 " + Number(data.total || 0).toLocaleString("ko-KR") + "건";
    var nav = $("ba-pager"); nav.textContent = "";
    var page = Number(data.page) || 1, pages = Number(data.pages) || 1;
    function pager(label, target, disabled) { var button = element("button", "", label); button.type = "button"; button.disabled = disabled; button.dataset.pageDisabled = disabled ? "true" : "false"; button.addEventListener("click", function () { loadList(target); }); nav.appendChild(button); }
    if (pages > 1) { pager("이전", page - 1, page <= 1); nav.appendChild(element("span", "", page + " / " + pages)); pager("다음", page + 1, page >= pages); }
  }
  function fact(term, value) { $("ba-facts").appendChild(element("dt", "", term)); $("ba-facts").appendChild(element("dd", "", value || "-")); }
  function openBooking(booking, focus) {
    state.current = booking;
    $("ba-detail-empty").hidden = true; $("ba-detail-body").hidden = false;
    $("ba-reference").textContent = booking.reference || "";
    $("ba-person-title").textContent = (booking.name || "고객") + " 님";
    $("ba-current-status").textContent = labels[booking.status] || "상태 확인 필요";
    $("ba-current-status").className = "ba-status " + statusClass(booking.status);
    $("ba-facts").textContent = "";
    fact("스튜디오", booking.studio === "bangbae" ? "방배점" : booking.studio);
    fact("이용 날짜", booking.date); fact("이용 시간", timeRange(booking)); fact("연락처", booking.contact);
    fact("이용 인원", String(booking.people || "-") + "명"); fact("촬영 방식", shootLabels[booking.shoot_type] || "기타");
    fact("촬영대행", booking.assist ? "요청함 · 일정 확인 필요" : "요청하지 않음"); fact("접수 시각", dateTime(booking.created_at));
    $("ba-notes").textContent = booking.notes || "별도 요청사항이 없습니다.";
    var estimate = booking.estimate || {}, lines = $("ba-estimate-lines"); lines.textContent = "";
    [["공급가액", estimate.subtotal], ["부가가치세", estimate.vat], ["예상 합계", estimate.total]].forEach(function (row) { lines.appendChild(element("dt", "", row[0])); lines.appendChild(element("dd", "", money(row[1]))); });
    var status = $("ba-status"); status.textContent = "";
    statusOrder.forEach(function (value) { var option = element("option", "", labels[value] + (value === booking.status ? " · 현재 상태 유지" : "")); option.value = value; status.appendChild(option); });
    status.value = booking.status;
    fillEdit(booking);
    closeDelete();
    $("ba-admin-note").value = booking.admin_note || "";
    $("ba-calendar-checked").checked = false;
    $("ba-updated").textContent = "마지막 변경: " + dateTime(booking.updated_at);
    message("ba-detail-message", ""); updateConfirmCheck();
    resetSms();
    $("ba-list").querySelectorAll(".ba-booking-card").forEach(function (button, index) { button.setAttribute("aria-pressed", state.bookings[index].id === booking.id ? "true" : "false"); });
    if (focus) $("ba-person-title").focus({ preventScroll: false });
  }
  // ── 직권 수정 ──
  function pad(n) { return String(n).padStart(2, "0"); }
  function fillSelect(select, values, current, label) {
    select.textContent = "";
    var list = values.slice();
    if (current !== "" && current !== null && current !== undefined && list.indexOf(current) === -1) list.push(current);
    list.sort(function (a, b) { return String(a).localeCompare(String(b), "en", { numeric: true }); });
    list.forEach(function (value) { var option = element("option", "", label(value)); option.value = String(value); select.appendChild(option); });
    select.value = String(current);
  }
  function range(from, to) { var out = []; for (var i = from; i <= to; i++) out.push(i); return out; }
  function fillEdit(booking) {
    $("ba-edit-date").value = booking.date || "";
    fillSelect($("ba-edit-start"), range(6, 22).map(function (h) { return pad(h) + ":00"; }), booking.start_time || "", function (v) { return v; });
    fillSelect($("ba-edit-duration"), range(1, 14), Number(booking.duration) || 2, function (v) { return v + "시간"; });
    fillSelect($("ba-edit-people"), range(1, 10), Number(booking.people) || 1, function (v) { return v + "명"; });
    $("ba-edit-name").value = booking.name || "";
    $("ba-edit-contact").value = booking.contact || "";
    $("ba-edit-type").value = Object.prototype.hasOwnProperty.call(shootLabels, booking.shoot_type) ? booking.shoot_type : "other";
    $("ba-edit-assist").checked = !!booking.assist;
    $("ba-edit-notes").value = booking.notes || "";
    $("ba-force").checked = false;
    updateEstimatePreview();
  }
  function editValues() {
    return {
      date: $("ba-edit-date").value, start_time: $("ba-edit-start").value, duration: Number($("ba-edit-duration").value),
      people: Number($("ba-edit-people").value), name: $("ba-edit-name").value.trim(), contact: $("ba-edit-contact").value.trim(),
      shoot_type: $("ba-edit-type").value, assist: $("ba-edit-assist").checked, notes: $("ba-edit-notes").value.trim()
    };
  }
  function scheduleText(v) {
    var h = Number(String(v.start_time).slice(0, 2));
    return v.date + " " + v.start_time + "–" + pad(h + v.duration) + ":00 · " + v.duration + "시간";
  }
  function updateEstimatePreview() {
    var el = $("ba-edit-estimate");
    if (!state.current) { el.textContent = ""; return; }
    var v = editValues(), cur = state.current;
    var changed = v.date !== cur.date || v.duration !== cur.duration || v.assist !== !!cur.assist;
    if (!changed) { el.textContent = ""; return; }
    var site = window.SITE || {}, studio = (site.studios || {}).bangbae || {}, addon = ((site.addons || {}).producerAssist || {});
    var day = new Date(v.date + "T12:00:00Z").getUTCDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Number.isFinite(day)) { el.textContent = ""; return; }
    var rate = day === 0 || day === 6 ? studio.pricePerHourWeekend : studio.pricePerHour;
    if (!rate) { el.textContent = "저장하면 예상 견적이 다시 계산됩니다."; return; }
    var subtotal = rate * v.duration + (v.assist ? (addon.pricePerHour || 0) * v.duration : 0);
    el.textContent = "저장 시 예상 합계: " + money(subtotal + Math.round(subtotal * .1)) + " (VAT 포함, 기존 " + money((cur.estimate || {}).total) + ")";
  }
  ["ba-edit-date", "ba-edit-start", "ba-edit-duration", "ba-edit-people", "ba-edit-assist"].forEach(function (id) { $(id).addEventListener("change", function () { updateEstimatePreview(); message("ba-detail-message", ""); }); });
  $("ba-edit-reset").addEventListener("click", function () { if (state.current && !state.saving) { fillEdit(state.current); $("ba-status").value = state.current.status; $("ba-admin-note").value = state.current.admin_note || ""; updateConfirmCheck(); message("ba-detail-message", ""); } });

  // ── 삭제 ──
  function deleteMatches() { return !!state.current && $("ba-delete-reference").value.trim().toUpperCase() === String(state.current.reference || "").toUpperCase(); }
  function closeDelete() {
    $("ba-delete-form").hidden = true; $("ba-delete-open").hidden = false;
    $("ba-delete-reference").value = ""; $("ba-delete-submit").disabled = true;
    message("ba-delete-message", "");
  }
  $("ba-delete-open").addEventListener("click", function () {
    if (!state.current || state.saving || state.loading) return;
    $("ba-delete-expected").textContent = state.current.reference;
    $("ba-delete-form").hidden = false; $("ba-delete-open").hidden = true;
    $("ba-delete-reference").focus();
  });
  $("ba-delete-cancel").addEventListener("click", function () { closeDelete(); $("ba-delete-open").focus(); });
  $("ba-delete-reference").addEventListener("input", function () { $("ba-delete-submit").disabled = !deleteMatches(); });
  $("ba-delete-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!state.current || state.saving || state.loading || !state.authenticated || !deleteMatches()) return;
    var booking = state.current, generation = state.generation;
    if (!window.confirm(booking.reference + " (" + (booking.name || "") + " 님) 예약을 영구 삭제합니다. 계속할까요?")) return;
    state.saving = true; setBusy(true); message("ba-delete-message", "삭제하고 있습니다.");
    try {
      await api("/api/bookings/" + encodeURIComponent(booking.id), { method: "DELETE", body: { reference: booking.reference, version: booking.version } });
      if (!state.authenticated || generation !== state.generation) return;
      state.saving = false; state.current = null;
      await loadList(state.page, { text: booking.reference + " 예약을 삭제했습니다.", error: false });
    } catch (error) {
      if (!state.authenticated || generation !== state.generation) return;
      if (error.status === 401 || error.status === 403) { showLogin("관리자 인증이 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요."); return; }
      if (error.status === 409) { state.saving = false; await loadList(state.page, { text: error.message, error: true }); }
      else message("ba-delete-message", error.message, true);
    } finally { state.saving = false; if (state.authenticated && !state.loading) setBusy(false); }
  });

  function updateConfirmCheck() { $("ba-confirm-check").hidden = !state.current || $("ba-status").value !== "confirmed" || state.current.status === "confirmed"; }
  function updateSmsLink() {
    var link = $("ba-sms-open");
    var href = state.authenticated && state.current && !state.loading && !state.saving ? BookingSms.smsHref($("ba-sms-phone").value) : "";
    if (href) { link.href = href; link.removeAttribute("tabindex"); }
    else { link.removeAttribute("href"); link.setAttribute("tabindex", "-1"); }
    link.setAttribute("aria-disabled", href ? "false" : "true");
  }
  function resetSms() {
    if (!state.current) return;
    $("ba-sms-phone").value = BookingSms.normalizePhone(state.current.contact);
    $("ba-sms-text").value = BookingSms.buildMessage(state.current);
    $("ba-sms-state").textContent = "저장된 상태: " + (labels[state.current.status] || "확인 필요") + ". 상태를 바꾸려면 먼저 아래의 변경 저장을 눌러 주세요.";
    message("ba-sms-message", $("ba-sms-phone").value ? "" : "저장된 연락처가 휴대전화 번호 형식이 아닙니다. 고객의 휴대전화 번호를 입력해 주세요.", !$("ba-sms-phone").value);
    updateSmsLink();
  }
  $("ba-sms-phone").addEventListener("input", function () { updateSmsLink(); message("ba-sms-message", ""); });
  $("ba-sms-text").addEventListener("input", function () { message("ba-sms-message", ""); });
  $("ba-sms-reset").addEventListener("click", resetSms);
  $("ba-sms-copy").addEventListener("click", async function () {
    if (!state.authenticated || !state.current || state.loading || state.saving) return;
    var text = $("ba-sms-text").value.trim();
    if (!text) { message("ba-sms-message", "복사할 문자 내용을 입력해 주세요.", true); $("ba-sms-text").focus(); return; }
    var generation = state.generation, currentId = state.current.id;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      if (!state.authenticated || !state.current || state.current.id !== currentId || generation !== state.generation) return;
      message("ba-sms-message", "문자 문구를 복사했습니다. 휴대폰 문자앱을 열어 붙여넣고 전송해 주세요.");
    } catch (_) {
      if (!state.authenticated || !state.current || state.current.id !== currentId || generation !== state.generation) return;
      $("ba-sms-text").focus(); $("ba-sms-text").select();
      message("ba-sms-message", "자동 복사를 사용할 수 없습니다. 선택된 문구를 길게 눌러 복사하거나 Ctrl+C를 눌러 주세요.", true);
    }
  });
  $("ba-sms-open").addEventListener("click", function (event) {
    if (!state.authenticated || !state.current || state.loading || state.saving || !BookingSms.smsHref($("ba-sms-phone").value)) {
      event.preventDefault(); message("ba-sms-message", "받는 휴대전화 번호를 확인해 주세요.", true); $("ba-sms-phone").focus(); return;
    }
    message("ba-sms-message", "문자앱에서 복사한 문구를 붙여넣고 직접 전송해 주세요. 앱이 열리지 않으면 휴대폰에서 이 화면을 이용해 주세요.");
  });
  async function loadList(page, afterMessage) {
    if (!state.authenticated || state.saving) return;
    var generation = ++state.generation;
    state.loading = true; state.page = Math.max(1, Number(page) || 1);
    var currentId = state.current && state.current.id;
    state.bookings = []; $("ba-list").textContent = ""; $("ba-pager").textContent = ""; $("ba-count").textContent = "";
    clearDetails(); $("ba-empty").hidden = true; $("ba-loading").hidden = false;
    message("ba-main-message", ""); setBusy(true);
    var query = new URLSearchParams({ page: String(state.page) });
    if ($("ba-filter-status").value) query.set("status", $("ba-filter-status").value);
    if ($("ba-filter-date").value) query.set("date", $("ba-filter-date").value);
    try {
      var data = await api("/api/bookings/admin?" + query.toString());
      if (!state.authenticated || generation !== state.generation) return;
      if (!Array.isArray(data.bookings)) throw new Error("예약 응답 형식이 올바르지 않습니다. 잠시 후 다시 조회해 주세요.");
      state.bookings = data.bookings; state.page = Number(data.page) || 1; renderList(data);
      var selected = currentId && state.bookings.find(function (booking) { return booking.id === currentId; });
      if (selected) openBooking(selected, false);
      if (afterMessage) message("ba-main-message", afterMessage.text, afterMessage.error);
    } catch (error) {
      if (!state.authenticated || generation !== state.generation) return;
      if (error.status === 401 || error.status === 403) { showLogin("관리자 인증이 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요."); return; }
      message("ba-main-message", error.message, true);
    } finally {
      if (generation === state.generation) { state.loading = false; $("ba-loading").hidden = true; setBusy(false); }
    }
  }
  async function login(password) {
    var generation = ++state.generation;
    state.password = password;
    $("ba-login-submit").disabled = true; $("ba-password").disabled = true; message("ba-login-message", "로그인 확인 중입니다.");
    try {
      var result = await api("/api/board/admin", { method: "POST" });
      if (result.ok !== true) throw new Error("관리자 인증 응답을 확인하지 못했습니다. 다시 시도해 주세요.");
      if (generation !== state.generation) return;
      state.authenticated = true; rememberPassword(password); $("ba-password").value = "";
      $("ba-login").hidden = true; $("ba-workspace").hidden = false; $("ba-logout").hidden = false; message("ba-login-message", "");
      await loadList(1);
    } catch (error) {
      if (generation !== state.generation) return;
      showLogin(error.message); $("ba-password").focus();
    } finally { $("ba-login-submit").disabled = false; $("ba-password").disabled = false; }
  }

  $("ba-login-form").addEventListener("submit", function (event) { event.preventDefault(); var password = $("ba-password").value; if (password) login(password); });
  $("ba-logout").addEventListener("click", function () { showLogin(); $("ba-password").focus(); });
  $("ba-filter-form").addEventListener("submit", function (event) { event.preventDefault(); loadList(1); });
  $("ba-filter-reset").addEventListener("click", function () { $("ba-filter-status").value = "requested"; $("ba-filter-date").value = ""; loadList(1); });
  $("ba-status").addEventListener("change", function () { $("ba-calendar-checked").checked = false; updateConfirmCheck(); message("ba-detail-message", ""); });
  $("ba-update-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!state.current || state.saving || state.loading || !state.authenticated) return;
    var booking = state.current, targetStatus = $("ba-status").value;
    if (targetStatus === "confirmed" && booking.status !== "confirmed" && !$("ba-calendar-checked").checked) { message("ba-detail-message", "기존 예약표와 촬영 지원 가능 여부를 확인한 뒤 체크해 주세요.", true); $("ba-calendar-checked").focus(); return; }
    var edit = editValues();
    if (!edit.date || !edit.start_time || !edit.name || !edit.contact) { message("ba-detail-message", "날짜·시작 시간·예약자·연락처를 입력해 주세요.", true); return; }
    var scheduleChanged = edit.date !== booking.date || edit.start_time !== booking.start_time || edit.duration !== booking.duration;
    if (scheduleChanged && !window.confirm("일정을 변경합니다.\n변경 전: " + scheduleText(booking) + "\n변경 후: " + scheduleText(edit) + "\n\n고객에게는 자동 안내되지 않으니 저장 후 문자로 알려 주세요.")) return;
    var payload = Object.assign({ status: targetStatus, admin_note: $("ba-admin-note").value.trim(), version: booking.version, force: $("ba-force").checked }, edit);
    var generation = state.generation;
    state.saving = true; setBusy(true); message("ba-detail-message", "저장하고 있습니다.");
    try {
      var data = await api("/api/bookings/" + encodeURIComponent(booking.id), { method: "PATCH", body: payload });
      if (!state.authenticated || generation !== state.generation) return;
      if (!data.booking) throw new Error("저장 응답을 확인하지 못했습니다. 목록을 다시 조회해 주세요.");
      state.saving = false;
      await loadList(state.page, { text: data.unchanged ? "변경된 내용이 없습니다." : "예약 변경을 저장했습니다." + (scheduleChanged ? " 일정이 바뀌었으니 고객에게 문자로 안내해 주세요." : " 고객 안내와 결제 확인은 별도로 진행해 주세요."), error: false });
    } catch (error) {
      if (!state.authenticated || generation !== state.generation) return;
      if (error.status === 401 || error.status === 403) { showLogin("관리자 인증이 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요."); return; }
      if (error.status === 409 && /제한 무시/.test(error.message)) { message("ba-detail-message", error.message, true); $("ba-force").focus(); }
      else if (error.status === 409) { state.saving = false; await loadList(state.page, { text: error.message + " 최신 목록을 불러왔습니다. 예약을 다시 선택해 확인해 주세요.", error: true }); }
      else message("ba-detail-message", error.message, true);
    } finally { state.saving = false; if (state.authenticated && !state.loading) setBusy(false); }
  });

  var saved = storedPassword();
  if (saved) login(saved);
})();
