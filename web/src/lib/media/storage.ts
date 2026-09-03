/**
 * Armazenamento de mídia no Cloudflare R2 (fase 2 da performance, 2026-09-02).
 *
 * POR QUE: sem banco, o repositório era o storage de TUDO — cada imagem
 * gravada virava blob num commit (2-4s) e cada leitura passava pela GitHub
 * Contents API (base64, lento, sem CDN). Com o R2: gravação é um PUT S3
 * (~200ms) e leitura é URL pública com CDN da Cloudflare. Os JSONs (runs,
 * reviews) CONTINUAM no repo — são leves e valem como trilha de auditoria.
 *
 * Config (env): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET (default news-engine-media), R2_PUBLIC_URL (r2.dev ou domínio).
 * SEM essas envs, r2Enabled() = false e tudo se comporta como antes
 * (binários no repo) — o adapter é opt-in por configuração, não big-bang.
 *
 * A CHAVE no bucket é o mesmo caminho relativo usado no repo
 * ("data/media/<story>/pool/<id>.jpg") — migração e rollback triviais.
 */

import { AwsClient } from "aws4fetch";

const ACCOUNT_ID = (process.env.R2_ACCOUNT_ID ?? "").trim();
const ACCESS_KEY = (process.env.R2_ACCESS_KEY_ID ?? "").trim();
const SECRET_KEY = (process.env.R2_SECRET_ACCESS_KEY ?? "").trim();
const BUCKET = (process.env.R2_BUCKET ?? "news-engine-media").trim();
const PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").trim().replace(/\/$/, "");

let client: AwsClient | null = null;

export function r2Enabled(): boolean {
  return Boolean(ACCOUNT_ID && ACCESS_KEY && SECRET_KEY && PUBLIC_URL);
}

function s3(): AwsClient {
  if (!client) {
    client = new AwsClient({
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      service: "s3",
      region: "auto",
    });
  }
  return client;
}

function endpoint(key: string): string {
  return `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** URL pública (CDN) de uma chave — para <img> e para o renderer. */
export function r2PublicUrl(key: string): string {
  return `${PUBLIC_URL}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function r2Put(key: string, bytes: Buffer, contentType: string): Promise<void> {
  const res = await s3().fetch(endpoint(key), {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(bytes.length) },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) {
    throw new Error(`R2 PUT ${key}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  }
}

/** Leitura direta (para análise/thumbs); via URL pública, com fallback assinado. */
export async function r2Get(key: string): Promise<Buffer | null> {
  try {
    const pub = await fetch(r2PublicUrl(key), { cache: "no-store" });
    if (pub.ok) return Buffer.from(await pub.arrayBuffer());
    const signed = await s3().fetch(endpoint(key), { method: "GET" });
    if (!signed.ok) return null;
    return Buffer.from(await signed.arrayBuffer());
  } catch {
    return null;
  }
}
