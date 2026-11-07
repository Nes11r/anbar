/**
 * Manual backup: `npm run backup`
 * Uses local pg_dump if available, otherwise `docker exec` into the compose "db" container.
 * Output: BACKUP_DIR (default ./backups)/hecotec_YYYYMMDD_HHMMSS.dump (custom format, restore with pg_restore).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

function env(key) {
  if (process.env[key]) return process.env[key];
  if (!existsSync(".env")) return undefined;
  const m = readFileSync(".env", "utf8").match(new RegExp(`^${key}\\s*=\\s*"?([^"\\r\\n]*)"?`, "m"));
  return m?.[1];
}

const url = new URL(env("DATABASE_URL"));
const dir = path.resolve(env("BACKUP_DIR") ?? "./backups");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
const file = path.join(dir, `hecotec_${stamp}.dump`);
const dbName = url.pathname.slice(1);
const user = decodeURIComponent(url.username);

let r = spawnSync("pg_dump", ["-h", url.hostname, "-p", url.port || "5432", "-U", user, "-d", dbName, "-Fc", "-f", file], {
  env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
  stdio: "inherit",
});
if (r.error) {
  console.log("pg_dump tapılmadı — docker konteyneri vasitəsilə ehtiyat nüsxə alınır…");
  r = spawnSync("docker", ["compose", "exec", "-T", "db", "pg_dump", "-U", user, "-d", dbName, "-Fc"], { maxBuffer: 1024 * 1024 * 1024 });
  if (r.status === 0) writeFileSync(file, r.stdout);
  else process.stderr.write(r.stderr ?? "");
}
if (r.status === 0) console.log(`Ehtiyat nüsxə hazırdır: ${file}`);
else {
  console.error("Ehtiyat nüsxə alınmadı.");
  process.exit(1);
}
