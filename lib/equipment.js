import { clean } from "./board.js";
export const STUDIO_NAMES = { bangbae: "방배점", yeongeon: "연건점" };
export const isStudio = (s) => Object.prototype.hasOwnProperty.call(STUDIO_NAMES, s);

// 관리자 입력 검증 → {ok, fields} | {error}
export function readFields(body, partial) {
  const f = {};
  if (!partial || body.name !== undefined) {
    f.name = clean(body.name, 60);
    if (!f.name) return { error: "장비 이름을 입력해 주세요." };
  }
  if (!partial || body.category !== undefined) f.category = clean(body.category, 30);
  if (!partial || body.model !== undefined) f.model = clean(body.model, 80);
  if (!partial || body.note !== undefined) f.note = clean(body.note, 200);
  if (!partial || body.qty !== undefined) {
    if (body.qty === null || body.qty === "" || body.qty === undefined) f.qty = null;
    else {
      const n = Number(body.qty);
      if (!Number.isInteger(n) || n < 0 || n > 999) return { error: "수량은 0~999 사이 숫자로 입력해 주세요." };
      f.qty = n;
    }
  }
  return { ok: true, fields: f };
}

export const publicItem = (r) => ({
  id: r.id, studio: r.studio, category: r.category, name: r.name, model: r.model,
  qty: r.qty, note: r.note, sort_order: r.sort_order,
});
