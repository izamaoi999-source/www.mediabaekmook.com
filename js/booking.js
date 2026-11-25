/* 방배점 온라인 예약 요청·조회. 개인정보와 비밀번호를 브라우저 저장소에 보관하지 않습니다. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var form = $("booking-form");
  if (!form) return;
  var steps = Array.from(form.querySelectorAll(".booking-step"));
  var types = { ppt: "PPT·화면 설명", board: "칠판·전자칠판", chromakey: "크로마키", other: "기타 촬영" };
  var statuses = { requested: "접수 · 확인 대기", confirmed: "예약 확정", completed: "이용 완료", cancelled: "취소" };
  var state = { config: null, step: 0, busy: [], busyDate: "", availabilitySeq: 0, requestId: null, submitting: false, lastReference: "" };
  var dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
  var dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" });
  function input(name) { return form.elements.namedItem(name); }
  function money(value) { return Number(value || 0).toLocaleString("ko-KR") + "원"; }
  function kstDay() {
    var parts = dayFormat.formatToParts(new Date());
    var get = function (type) { return parts.find(function (part) { return part.type === type; }).value; };
    return get("year") + "-" + get("month") + "-" + get("day");
  }
  function dayPlus(day, amount) {
    var value = new Date(day + "T12:00:00Z");
    value.setUTCDate(value.getUTCDate() + amount);
    return value.toISOString().slice(0, 10);
  }
  function dateLabel(day) { return dateFormat.format(new Date(day + "T00:00:00+09:00")); }
  function timeLabel(start, duration) { return start + " ~ " + String(Number(start.slice(0, 2)) + Number(duration)).padStart(2, "0") + ":00 (" + duration + "시간)"; }
  function weekend(day) { var n = new Date(day + "T12:00:00Z").getUTCDay(); return n === 0 || n === 6; }
  function validDate(day) { return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day + "T12:00:00Z")) && new Date(day + "T12:00:00Z").toISOString().slice(0, 10) === day; }
  function message(id, text) { $(id).textContent = text || ""; $(id).hidden = !text; }
  function api(path, options) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 15000);
    return fetch("/api/bookings" + path, Object.assign({ cache: "no-store", signal: controller.signal, credentials: "same-origin" }, options || {}))
      .then(async function (res) {
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) { var error = new Error(data.error || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."); error.status = res.status; throw error; }
        return data;
      }).catch(function (error) {
        if (error.status) throw error;
        var failure = new Error("서버에 연결하지 못했거나 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
        failure.network = true; throw failure;
      }).finally(function () { window.clearTimeout(timer); });
  }
  function post(path, body) { return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }
  function activateTab(which, focus) {
    ["request", "lookup"].forEach(function (name) {
      var selected = name === which;
      $("tab-" + name).setAttribute("aria-selected", String(selected));
      $("tab-" + name).tabIndex = selected ? 0 : -1;
      $("panel-" + name).hidden = !selected;
    });
    if (focus) $("tab-" + which).focus();
  }
  ["request", "lookup"].forEach(function (name) {
    $("tab-" + name).addEventListener("click", function () { if (!state.submitting) activateTab(name); });
    $("tab-" + name).addEventListener("keydown", function (event) {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && !state.submitting) {
        event.preventDefault();
        activateTab(event.key === "Home" ? "request" : event.key === "End" ? "lookup" : name === "request" ? "lookup" : "request", true);
      }
    });
  });
  function showStep(index, focus) {
    state.step = index;
    steps.forEach(function (step, i) { step.hidden = i !== index; });
    document.querySelectorAll(".booking-stepper li").forEach(function (item, i) {
      item.classList.toggle("is-current", i === index); item.classList.toggle("is-done", i < index);
      if (i === index) item.setAttribute("aria-current", "step"); else item.removeAttribute("aria-current");
    });
    if (focus) steps[index].querySelector("h2").focus();
  }
  function validStep(index) {
    var controls = Array.from(steps[index].querySelectorAll("input, select, textarea"));
    for (var control of controls) {
      if (!control.checkValidity()) { showStep(index, false); control.reportValidity(); return false; }
    }
    if (index === 0 && (!state.config || !state.busyDate || state.busyDate !== input("date").value || !input("start_time").value)) {
      message("booking-availability", "촬영 날짜와 시작 시간을 확인해 주세요.");
      showStep(0, true); return false;
    }
    return true;
  }
  form.querySelectorAll("[data-next]").forEach(function (button) { button.addEventListener("click", function () { if (validStep(state.step)) showStep(Math.min(2, state.step + 1), true); }); });
  form.querySelectorAll("[data-prev]").forEach(function (button) { button.addEventListener("click", function () { showStep(Math.max(0, state.step - 1), true); }); });
  function renderSummary() {
    var date = input("date").value, start = input("start_time").value, duration = Number(input("duration").value);
    $("summary-date").textContent = validDate(date) ? dateLabel(date) : "날짜를 선택해 주세요";
    $("summary-time").textContent = start ? timeLabel(start, duration) : "시작 시간을 선택해 주세요";
    $("summary-type").textContent = types[input("shoot_type").value] || "기타 촬영";
    $("summary-people").textContent = (input("people").value || 1) + "명";
    var hasDate = state.config && validDate(date) && date >= input("date").min && date <= input("date").max;
    if (!hasDate || !start) {
      $("summary-rental").textContent = "일정 선택 후 계산"; $("summary-vat").textContent = "—"; $("summary-total").textContent = "—";
      $("summary-assist-row").hidden = true; $("summary-rate").textContent = ""; return;
    }
    var config = state.config, isWeekend = weekend(date), rate = isWeekend ? config.weekendRate : config.weekdayRate;
    var rental = rate * duration, assist = input("assist").checked ? config.assistRate * duration : 0;
    var vat = Math.round((rental + assist) * .1);
    $("summary-rental").textContent = money(rental);
    $("summary-assist-row").hidden = !assist; $("summary-assist").textContent = money(assist);
    $("summary-vat").textContent = money(vat); $("summary-total").textContent = money(rental + assist + vat);
    $("summary-rate").textContent = (isWeekend ? "토·일 기준 " : "평일 기준 ") + money(rate) + "/시간 × " + duration + "시간 · 공휴일 별도 확인";
  }
  function updateStartOptions() {
    var select = input("start_time"), old = select.value, duration = Number(input("duration").value), config = state.config, date = input("date").value;
    if (!validDate(date) || !state.busyDate) {
      select.replaceChildren(new Option("날짜를 먼저 선택해 주세요", ""));
      select.disabled = true; $("booking-next-time").disabled = true;
      message("booking-availability", ""); renderSummary(); return;
    }
    select.replaceChildren(new Option("시작 시간을 선택해 주세요", ""));
    if (!config || state.busyDate !== date) { select.disabled = true; $("booking-next-time").disabled = true; renderSummary(); return; }
    var count = 0;
    var now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    for (var hour = config.openHour; hour + duration <= config.closeHour; hour++) {
      var value = String(hour).padStart(2, "0") + ":00";
      var unavailable = state.busy.some(function (busy) { var begin = Number(String(busy.start_time).split(":")[0]); return hour < begin + Number(busy.duration) && hour + duration > begin; });
      var past = input("date").value === kstDay() && value <= now;
      var option = new Option(value + (unavailable ? " · 확정 예약 있음" : past ? " · 지난 시간" : ""), value);
      option.disabled = unavailable || past;
      if (!option.disabled) count++;
      select.add(option);
    }
    select.disabled = count === 0;
    if (Array.from(select.options).some(function (option) { return option.value === old && !option.disabled; })) select.value = old;
    if (count === 0) message("booking-availability", "선택한 이용 시간으로 요청할 수 있는 시작 시간이 없습니다. 다른 날짜나 이용 시간을 선택해 주세요.");
    else message("booking-availability", "온라인 확정 예약을 확인했습니다. 시작 시간을 선택해 주세요. 기존 예약표와 대조한 후 최종 확정합니다.");
    $("booking-next-time").disabled = count === 0;
    renderSummary();
  }
  async function loadAvailability() {
    var date = input("date").value, sequence = ++state.availabilitySeq;
    state.busyDate = ""; state.busy = [];
    $("booking-retry-availability").hidden = true; $("booking-next-time").disabled = true;
    input("start_time").replaceChildren(new Option("날짜를 먼저 선택해 주세요", "")); input("start_time").disabled = true;
    renderSummary();
    if (!validDate(date) || date < input("date").min || date > input("date").max) { message("booking-availability", "선택 가능한 촬영 날짜를 입력해 주세요."); return; }
    input("start_time").options[0].textContent = "예약 시간을 확인하고 있습니다";
    message("booking-availability", "온라인 확정 예약을 확인하고 있습니다.");
    try {
      var data = await api("/availability?studio=bangbae&date=" + encodeURIComponent(date));
      if (sequence !== state.availabilitySeq) return;
      if (!Array.isArray(data.busy)) throw new Error("예약 시간 정보를 읽지 못했습니다.");
      state.busy = data.busy; state.busyDate = date; updateStartOptions();
    } catch (error) {
      if (sequence !== state.availabilitySeq) return;
      input("start_time").options[0].textContent = "예약 시간 확인이 필요합니다";
      message("booking-availability", error.message + " 다시 확인하거나 010-2928-6068로 문의해 주세요.");
      $("booking-retry-availability").hidden = false;
    }
  }
  async function loadConfig() {
    state.config = null; $("booking-config-state").hidden = false;
    $("booking-request-content").hidden = true; $("booking-service-error").hidden = true;
    try {
      var data = await api("/config"), config = data.studio;
      if (!config || config.id !== "bangbae" || !["openHour", "closeHour", "minHours", "maxPeople", "weekdayRate", "weekendRate", "assistRate"].every(function (key) { return typeof config[key] === "number" && Number.isFinite(config[key]); }) || config.minHours < 1 || config.closeHour <= config.openHour || config.maxPeople < 1) throw new Error("예약 설정을 읽지 못했습니다.");
      state.config = config;
      var duration = input("duration"); duration.replaceChildren();
      for (var hours = config.minHours; hours <= config.closeHour - config.openHour; hours++) duration.add(new Option(hours + "시간" + (hours === config.minHours ? " · 최소 이용" : ""), hours));
      input("people").replaceChildren();
      for (var people = 1; people <= config.maxPeople; people++) input("people").add(new Option(people + "명", people));
      input("date").min = kstDay(); input("date").max = dayPlus(kstDay(), 180);
      $("booking-assist-rate").textContent = money(config.assistRate);
      $("booking-config-state").hidden = true; $("booking-request-content").hidden = false;
      renderSummary();
      if (input("date").value) await loadAvailability();
      else $("booking-next-time").disabled = true;
    } catch (error) {
      $("booking-config-state").hidden = true; $("booking-service-error").hidden = false;
      $("booking-service-error-text").textContent = error.message + " 현재 온라인 예약을 시작할 수 없습니다. 전화 또는 문의 게시판을 이용해 주세요.";
    }
  }
  input("date").addEventListener("change", loadAvailability);
  input("duration").addEventListener("change", updateStartOptions);
  $("booking-retry-availability").addEventListener("click", loadAvailability);
  $("booking-retry-config").addEventListener("click", loadConfig);
  form.addEventListener("input", function () { state.requestId = null; renderSummary(); });
  form.addEventListener("change", function () { state.requestId = null; renderSummary(); });
  $("booking-password-confirm").addEventListener("input", function () { this.setCustomValidity(""); });
  input("password").addEventListener("input", function () { $("booking-password-confirm").setCustomValidity(""); });
  input("name").addEventListener("input", function () { this.setCustomValidity(""); });
  input("contact").addEventListener("input", function () { this.setCustomValidity(""); });

  function renderBooking(target, booking) {
    target.replaceChildren();
    var badge = document.createElement("span"); badge.className = "booking-status booking-status-" + (Object.hasOwn(statuses, booking.status) ? booking.status : "requested"); badge.textContent = statuses[booking.status] || "확인 필요"; target.appendChild(badge);
    var dl = document.createElement("dl"); dl.className = "booking-record";
    var estimate = booking.estimate || {};
    var rows = [["예약번호", booking.reference], ["예약자", booking.name], ["연락처", booking.contact], ["지점", "방배점"], ["촬영 날짜", validDate(booking.date) ? dateLabel(booking.date) : booking.date], ["촬영 시간", timeLabel(String(booking.start_time || "00:00"), booking.duration)], ["촬영 유형", types[booking.shoot_type] || "기타 촬영"], ["방문 인원", booking.people + "명"], ["촬영대행 요청", booking.assist ? "요청함 · 가능 여부 별도 확인" : "요청하지 않음"], ["예상 금액", money(estimate.total) + " (VAT 포함 · 최종 금액 별도 안내)"]];
    if (booking.notes) rows.push(["요청사항", booking.notes]);
    rows.forEach(function (row) { var term = document.createElement("dt"), description = document.createElement("dd"); term.textContent = row[0]; description.textContent = row[1] || "—"; dl.append(term, description); });
    target.appendChild(dl);
    var notice = document.createElement("p"); notice.className = "booking-notice";
    notice.textContent = booking.status === "requested" ? "담당자가 기존 예약표와 대조한 후 예약 확정과 결제를 안내합니다. 현재는 확인 대기 상태입니다." : booking.status === "confirmed" ? "예약이 확정된 상태입니다. 최종 금액·결제·입실 안내는 담당자에게 받은 내용을 확인해 주세요." : booking.status === "cancelled" ? "취소된 예약입니다. 일정 변경 또는 재신청은 담당자에게 문의해 주세요." : "이용이 완료된 예약입니다. 추가 문의는 담당자에게 연락해 주세요.";
    target.appendChild(notice);
  }
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (state.submitting) return;
    if (state.step < 2) { if (validStep(state.step)) showStep(state.step + 1, true); return; }
    message("booking-submit-error", ""); $("booking-submit-fallback").hidden = true;
    var confirm = $("booking-password-confirm");
    confirm.setCustomValidity(input("password").value === confirm.value ? "" : "비밀번호가 일치하지 않습니다.");
    input("name").setCustomValidity(input("name").value.trim() ? "" : "예약자 이름을 입력해 주세요.");
    var contact = input("contact").value.trim();
    input("contact").setCustomValidity(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || /^\+?[\d ()-]{7,30}$/.test(contact) && contact.replace(/\D/g, "").length >= 7 ? "" : "연락받을 전화번호 또는 이메일을 입력해 주세요.");
    for (var i = 0; i < steps.length; i++) if (!validStep(i)) return;
    if (!state.requestId) state.requestId = uuid();
    var payload = { name: input("name").value.trim(), contact: input("contact").value.trim(), studio: "bangbae", date: input("date").value, start_time: input("start_time").value, duration: Number(input("duration").value), people: Number(input("people").value), shoot_type: input("shoot_type").value, assist: input("assist").checked, notes: input("notes").value.trim(), password: input("password").value, consent: input("consent").checked, website: input("website").value, request_id: state.requestId };
    state.submitting = true; steps.forEach(function (step) { step.disabled = true; });
    $("tab-lookup").disabled = true; $("booking-submit").textContent = "접수하고 있습니다";
    try {
      var data = await post("", payload);
      if (!data.booking || !data.booking.reference) throw new Error("접수 결과를 확인하지 못했습니다. 입력을 바꾸지 않고 다시 시도해 주세요.");
      state.lastReference = data.booking.reference;
      $("booking-success-reference").textContent = state.lastReference;
      renderBooking($("booking-success-details"), data.booking);
      $("booking-request-content").hidden = true; $("booking-success").hidden = false;
      input("password").value = ""; confirm.value = "";
      $("booking-success-title").focus();
    } catch (error) {
      var extra = error.network ? " 접수 여부를 확인하지 못했으므로 입력을 바꾸지 않고 다시 접수해 주세요. 같은 요청은 중복 접수를 방지합니다." : "";
      message("booking-submit-error", error.message + extra); $("booking-submit-fallback").hidden = false;
    } finally {
      payload.password = ""; state.submitting = false;
      steps.forEach(function (step) { step.disabled = false; }); $("tab-lookup").disabled = false;
      $("booking-submit").textContent = "예약 요청 접수";
    }
  });
  $("booking-copy-reference").addEventListener("click", async function () {
    try { await navigator.clipboard.writeText(state.lastReference); message("booking-copy-state", "예약번호를 복사했습니다. 신청할 때 입력한 비밀번호도 함께 기억해 주세요."); }
    catch (_) { message("booking-copy-state", "자동 복사를 지원하지 않습니다. 위 예약번호를 직접 선택해 복사해 주세요."); }
  });
  $("booking-go-lookup").addEventListener("click", function () { activateTab("lookup"); $("lookup-reference").value = state.lastReference; $("lookup-password").focus(); });
  $("booking-new-request").addEventListener("click", function () {
    form.reset(); state.requestId = null; state.busyDate = ""; state.busy = []; state.availabilitySeq++; state.lastReference = "";
    $("booking-success-reference").textContent = ""; $("booking-success-details").replaceChildren();
    $("booking-success").hidden = true; $("booking-request-content").hidden = false;
    message("booking-copy-state", ""); message("booking-submit-error", ""); $("booking-submit-fallback").hidden = true;
    updateStartOptions(); showStep(0, true);
  });
  $("booking-lookup-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var lookup = this, button = $("booking-lookup-submit");
    if (button.disabled || !lookup.reportValidity()) return;
    message("booking-lookup-error", ""); $("booking-lookup-result").hidden = true;
    button.disabled = true; button.textContent = "예약을 확인하고 있습니다";
    try {
      var data = await post("/lookup", { reference: $("lookup-reference").value.trim().toUpperCase(), password: $("lookup-password").value });
      if (!data.booking || !data.booking.reference) throw new Error("예약 정보를 읽지 못했습니다. 잠시 후 다시 조회해 주세요.");
      renderBooking($("booking-lookup-details"), data.booking); $("booking-lookup-result").hidden = false;
      $("lookup-password").value = ""; $("lookup-result-title").focus();
    } catch (error) { message("booking-lookup-error", error.message + " 도움이 필요하면 010-2928-6068로 문의해 주세요."); }
    finally { button.disabled = false; button.textContent = "예약 조회"; }
  });
  if (window.location.hash === "lookup") activateTab("lookup");
  loadConfig();
})();
