/* 수동 문자 안내: URL에는 수신번호만 넣고 실제 전송은 휴대전화에서 진행합니다. */
(function (root) {
  "use strict";

  function normalizePhone(contact) {
    if (typeof contact !== "string" || contact.length > 64) return "";
    var value = contact.trim();
    if (!/^[+\d\s()-]+$/.test(value)) return "";
    value = value.replace(/[\s()-]/g, "");
    if (/^(?:\+82|0082)/.test(value)) {
      value = "0" + value.replace(/^(?:\+82|0082)0?/, "");
    }
    return /^(?:010\d{8}|01[16789]\d{7,8})$/.test(value) ? value : "";
  }

  function smsHref(phone) {
    var normalized = normalizePhone(phone);
    return normalized ? "sms:" + normalized : "";
  }

  function schedule(booking) {
    var date = typeof booking.date === "string" ? booking.date : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "일정은 담당자에게 확인해 주세요.";
    var parsed = new Date(date + "T00:00:00Z");
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return "일정은 담당자에게 확인해 주세요.";
    var time = typeof booking.start_time === "string" ? booking.start_time : "";
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || !Number.isInteger(booking.duration) || booking.duration < 1 || booking.duration > 24) return "일정은 담당자에게 확인해 주세요.";
    var end = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + booking.duration * 60;
    if (end > 24 * 60) return "일정은 담당자에게 확인해 주세요.";
    return "일정: " + date + " " + time + "~" + String(Math.floor(end / 60)).padStart(2, "0") + ":" + String(end % 60).padStart(2, "0") + " (" + booking.duration + "시간)";
  }

  function buildMessage(booking) {
    booking = booking || {};
    var location = booking.studio === "bangbae" ? "방배점 " : "";
    var lines = ["[스튜디오 미디어백묵]"];
    switch (booking.status) {
      case "requested":
        lines.push(location + "예약 요청이 접수되었습니다.", schedule(booking), "담당자가 일정을 확인한 후 확정 안내드립니다. 현재 예약 확정 전입니다.");
        break;
      case "confirmed":
        lines.push(location + "예약이 확정되었습니다.", schedule(booking), "결제 방법과 준비사항은 담당자 안내를 확인해 주세요.");
        break;
      case "cancelled":
        lines.push(location + "예약이 취소되었습니다.", schedule(booking), "취소 관련 문의는 담당자에게 연락해 주세요.");
        break;
      case "completed":
        lines.push(location + "스튜디오를 이용해 주셔서 감사합니다.", schedule(booking));
        break;
      default:
        lines.push("예약 상태를 관리자 화면에서 확인한 후 안내 문구를 작성해 주세요.");
    }
    lines.push("문의: 010-2928-6068");
    return lines.join("\n");
  }

  root.BookingSms = Object.freeze({ normalizePhone: normalizePhone, smsHref: smsHref, buildMessage: buildMessage });
})(typeof globalThis !== "undefined" ? globalThis : window);
