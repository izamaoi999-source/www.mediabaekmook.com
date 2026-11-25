import * as board from "../../../lib/board.js";
import {
  adminGuard, adminBooking, adminChanges, checkSchedule, findConflict, startHour, BLOCKING_STATUSES,
} from "../../../lib/booking.js";

const { json, err, readJson, parseId } = board;
const STALE = "다른 화면에서 먼저 변경된 예약입니다. 최신 내용을 다시 불러와 확인해 주세요.";

async function load(env, id) {
  return env.DB.prepare("SELECT * FROM reservations WHERE id = ?").bind(id).first();
}

/**
 * PATCH /api/bookings/:id (관리자 직권 변경)
 * {version, status?, admin_note?, name?, contact?, date?, start_time?, duration?, people?, shoot_type?, assist?, notes?, force?}
 * force=true 면 영업시간·인원 제한과 확정 예약 중복 검사를 건너뜁니다.
 */
export async function onRequestPatch({ request, env, params }) {
  const denied = await adminGuard(request, env, board);
  if (denied) return denied;
  const id = parseId(params);
  if (!id) return err("예약을 찾을 수 없습니다.", 404);
  const body = await readJson(request);
  if (!body) return err("요청 형식이 올바르지 않습니다.");
  const row = await load(env, id);
  if (!row) return err("예약을 찾을 수 없습니다.", 404);
  if (!Number.isInteger(body.version) || body.version !== row.version) return err(STALE, 409);

  const result = adminChanges(row, body);
  if (result.error) return err(result.error);
  const { changes, merged, scheduleChanged } = result;
  const force = body.force === true;

  if (scheduleChanged) {
    const checked = checkSchedule(merged, { force });
    if (checked.error) return err(checked.error + (force ? "" : " 영업시간 밖 일정은 '제한 무시'를 체크하면 저장할 수 있습니다."));
  }
  const becomesBlocking = BLOCKING_STATUSES.includes(merged.status) && (scheduleChanged || "status" in changes);
  if (becomesBlocking && !force) {
    const conflict = await findConflict(env, { studio: merged.studio, date: merged.date, start: startHour(merged.start_time), duration: merged.duration, excludeId: row.id });
    if (conflict) {
      return err(`같은 시간에 확정된 예약(${conflict.reference} · ${conflict.name} · ${conflict.start_time}, ${conflict.duration}시간)이 있습니다. 그래도 저장하려면 '제한 무시'를 체크해 주세요.`, 409);
    }
  }

  const cols = Object.keys(changes);
  if (!cols.length) return json({ booking: adminBooking(row), unchanged: true });
  const updated = await env.DB.prepare(
    `UPDATE reservations SET ${cols.map((c) => `${c} = ?`).join(", ")}, version = version + 1, updated_at = ?
     WHERE id = ? AND version = ? RETURNING *`
  ).bind(...cols.map((c) => changes[c]), Date.now(), row.id, row.version).first();
  if (!updated) return err(STALE, 409);
  return json({ booking: adminBooking(updated) });
}

// DELETE /api/bookings/:id {version, reference} (관리자) → 예약 완전 삭제. 예약번호를 한 번 더 받아 오삭제 방지
export async function onRequestDelete({ request, env, params }) {
  const denied = await adminGuard(request, env, board);
  if (denied) return denied;
  const id = parseId(params);
  if (!id) return err("예약을 찾을 수 없습니다.", 404);
  const body = (await readJson(request)) || {};
  const row = await load(env, id);
  if (!row) return err("예약을 찾을 수 없습니다.", 404);
  if (String(body.reference || "").trim().toUpperCase() !== row.reference) return err("삭제하려면 예약번호를 정확히 입력해 주세요.");
  if (!Number.isInteger(body.version) || body.version !== row.version) return err(STALE, 409);
  const res = await env.DB.prepare("DELETE FROM reservations WHERE id = ? AND version = ?").bind(row.id, row.version).run();
  if (!res.meta?.changes) return err(STALE, 409);
  return json({ ok: true, reference: row.reference });
}
