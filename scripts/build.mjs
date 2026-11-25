// 정적 파일만 dist/ 로 복사 (Cloudflare Pages 배포 대상)
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "dist");

// 루트 기준 제외 목록
const EXCLUDE_TOP = new Set([
  "dist", "node_modules", "functions", "lib", "scripts", "_archive_old", ".wrangler", ".git",
  "README.md", "DEPLOY.md", "schema.sql", "seed-equipment.sql", "wrangler.toml", "package.json", "package-lock.json",
  "preview.png", ".dev.vars", ".dev.vars.example", ".gitignore",
]);
const EXCLUDE_ANY = (name) => name.endsWith(".TODO") || name === ".DS_Store" || name === "README.md";

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
let count = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = relative(root, abs);
    if (!rel.includes(sep) && EXCLUDE_TOP.has(name)) continue;
    if (EXCLUDE_ANY(name)) continue;
    if (statSync(abs).isDirectory()) { mkdirSync(join(out, rel), { recursive: true }); walk(abs); }
    else { cpSync(abs, join(out, rel)); count++; }
  }
}
walk(root);
console.log(`dist/ ready: ${count} files`);
