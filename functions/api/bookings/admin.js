import * as board from "../../../lib/board.js";
import { adminGuard, adminBooking, isValidDate, STATUSES, ADMIN_PAGE_SIZE } from "../../../lib/booking.js";

const { json, err } = board;

// GET /api/bookings/admin?page=1&status=requested&date=YYYY-MM-DD (관리자) → 예약 목록
export async function onRequestGet({ request, env }) {
  const denied = await adminGuard(request, env, board);
  if (denied) return denied;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const date = url.searchParams.get("date") || "";
  if (status && !Object.prototype.hasOwnProperty.call(STATUSES, status)) return err("예약 상태가 올바르지 않습니다.");
  if (date && !isValidDate(date)) return err("날짜 형식이 올바르지 않습니다.");

  const where = [], args = [];
  if (status) { where.push("status = ?"); args.push(status); }
  if (date) { where.push("date = ?"); args.push(date); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM reservations ${whereSql}`).bind(...args).first();
  const total = totalRow?.n || 0;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  let page = parseInt(url.searchParams.get("page") || "1", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > pages) page = pages;
  const { results } = await env.DB.prepare(
    `SELECT * FROM reservations ${whereSql} ORDER BY date ASC, start_time ASC, id ASC LIMIT ? OFFSET ?`
  ).bind(...args, ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE).all();
  return json({ bookings: results.map(adminBooking), total, page, pages, pageSize: ADMIN_PAGE_SIZE });
}
