/**
 * Migra os binários existentes de ../data/media/** para o Cloudflare R2,
 * preservando o caminho relativo como chave ("data/media/<story>/...").
 *
 * Uso (na pasta web/, com R2_* no .env.local ou no ambiente):
 *   node scripts/migrate-media-r2.mjs [--dry]
 *
 * Idempotente: PUT sobrescreve a mesma chave; rodar duas vezes não duplica.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { AwsClient } from "aws4fetch";

// carrega web/.env.local no process.env (sem depender do Next)
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* sem .env.local: usa só o ambiente */
}

const ACCOUNT_ID = (process.env.R2_ACCOUNT_ID ?? "").trim();
const ACCESS_KEY = (process.env.R2_ACCESS_KEY_ID ?? "").trim();
const SECRET_KEY = (process.env.R2_SECRET_ACCESS_KEY ?? "").trim();
const BUCKET = (process.env.R2_BUCKET ?? "news-engine-media").trim();
if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error("faltam R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY");
  process.exit(1);
}

const dry = process.argv.includes("--dry");
const root = path.resolve(process.cwd(), "..");
const mediaDir = path.join(root, "data", "media");

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
})(mediaDir);

const s3 = new AwsClient({
  accessKeyId: ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  service: "s3",
  region: "auto",
});

const mimeFor = (f) =>
  f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg";

let done = 0;
let bytes = 0;
const CONCURRENCY = 8;
const queue = [...files];

async function worker() {
  for (;;) {
    const full = queue.shift();
    if (!full) return;
    const key = path.relative(root, full).split(path.sep).join("/");
    const body = readFileSync(full);
    bytes += body.length;
    if (!dry) {
      const url = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      const res = await s3.fetch(url, {
        method: "PUT",
        headers: { "Content-Type": mimeFor(key) },
        body: new Uint8Array(body),
      });
      if (!res.ok) throw new Error(`PUT ${key}: ${res.status} ${await res.text()}`);
    }
    done++;
    if (done % 10 === 0 || queue.length === 0) {
      console.log(`${done}/${files.length} (${(bytes / 1e6).toFixed(1)}MB)${dry ? " [dry]" : ""}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`concluído: ${done} arquivos, ${(bytes / 1e6).toFixed(1)}MB${dry ? " (dry run)" : ""}`);
