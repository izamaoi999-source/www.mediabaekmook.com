import { json, err, isAdmin, ipHash, tooMany, logEvent, FAIL_LIMIT } from "../../../lib/board.js";

// POST /api/board/admin  (헤더 X-Admin-Password) → 관리자 비밀번호 확인
export async function onRequestPost({ request, env }) {
  const ip = await ipHash(request, env);
  if (await tooMany(env, "fail", ip, FAIL_LIMIT)) return err("비밀번호 오류가 너무 많습니다. 10분 후 다시 시도해 주세요.", 429);
  if (!env.ADMIN_PASSWORD) return err("관리자 비밀번호가 설정되지 않았습니다.", 503);
  if (await isAdmin(request, env)) return json({ ok: true });
  await logEvent(env, "fail", ip);
  return err("관리자 비밀번호가 올바르지 않습니다.", 403);
}
