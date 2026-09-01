/**
 * Renderer determinístico dos slides (1080x1350) com next/og (satori).
 *
 * Linguagem visual calibrada nas referências do Pedro (2026-09-01):
 * - capa estilo "the bating": foto full-bleed escurecida, manchete gigante
 *   em caixa alta (Archivo Black) + subtítulo de 1 frase;
 * - internos estilo bating/curioso mercado: corpo serifado (Lora) branco,
 *   curto, com **negrito** nos dados-chave;
 * - cor por vertical no kicker/tag (assinatura tipo "the news");
 * - crédito de foto sempre visível (licenças CC exigem atribuição).
 *
 * IA não desenha layout: templates são código; o LLM só fornece o texto.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { toDataUrl } from "../images";
import type { SlideSpec } from "./spec";

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

const VERTICAL_UI: Record<string, { label: string; color: string }> = {
  entertainment: { label: "ENTRETENIMENTO", color: "#FF8A4C" },
  politics: { label: "POLÍTICA", color: "#8FB0FF" },
  facts: { label: "FATOS", color: "#B9A5FF" },
};

const INK_DARK = "#0B0E14";
const BRAND_GREEN = "#2FA98C";

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 700 | 900 }[]> | null = null;

async function loadFonts() {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), "src", "assets", "fonts");
    fontsPromise = Promise.all([
      fs.readFile(path.join(dir, "ArchivoBlack.ttf")).then((data) => ({
        name: "Archivo Black",
        data,
        weight: 900 as const,
      })),
      fs.readFile(path.join(dir, "Lora-Regular.ttf")).then((data) => ({
        name: "Lora",
        data,
        weight: 400 as const,
      })),
      fs.readFile(path.join(dir, "Lora-Bold.ttf")).then((data) => ({
        name: "Lora",
        data,
        weight: 700 as const,
      })),
      fs.readFile(path.join(dir, "PlexMono-SemiBold.ttf")).then((data) => ({
        name: "Plex Mono",
        data,
        weight: 700 as const,
      })),
    ]);
  }
  return fontsPromise;
}

/** Divide texto com **negrito** em palavras marcadas (satori não tem inline flow). */
function richWords(text: string): { word: string; bold: boolean }[] {
  const out: { word: string; bold: boolean }[] = [];
  const parts = text.split("**");
  parts.forEach((part, i) => {
    const bold = i % 2 === 1;
    for (const word of part.split(/\s+/)) {
      if (word) out.push({ word, bold });
    }
  });
  return out;
}

function RichText({
  text,
  size,
  align = "center",
}: {
  text: string;
  size: number;
  align?: "center" | "flex-start";
}) {
  const words = richWords(text);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align,
        columnGap: size * 0.26,
        rowGap: size * 0.34,
      }}
    >
      {words.map((w, i) => (
        <span
          key={i}
          style={{
            fontFamily: "Lora",
            fontWeight: w.bold ? 700 : 400,
            fontSize: size,
            color: "#FFFFFF",
            lineHeight: 1,
            textShadow: "0 2px 14px rgba(0,0,0,0.55)",
          }}
        >
          {w.word}
        </span>
      ))}
    </div>
  );
}

function Background({ imageData }: { imageData: string | null }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: INK_DARK,
        // satori quebra com propriedades undefined — só inclui quando existe
        ...(imageData
          ? {}
          : { backgroundImage: `linear-gradient(160deg, #10141F 0%, ${INK_DARK} 55%, #0E2B24 100%)` }),
      }}
    >
      {imageData && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageData}
          alt=""
          width={SLIDE_W}
          height={SLIDE_H}
          style={{ objectFit: "cover", width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
}

function Scrim({ heavy }: { heavy: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundImage: heavy
          ? "linear-gradient(180deg, rgba(11,14,20,0.42) 0%, rgba(11,14,20,0.28) 40%, rgba(11,14,20,0.62) 68%, rgba(11,14,20,0.92) 100%)"
          : "linear-gradient(180deg, rgba(11,14,20,0.55) 0%, rgba(11,14,20,0.10) 35%, rgba(11,14,20,0.80) 82%, rgba(11,14,20,0.95) 100%)",
      }}
    />
  );
}

function Brand({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <span
        style={{
          fontFamily: "Plex Mono",
          fontSize: 30,
          fontWeight: 700,
          color: "#FFFFFF",
          letterSpacing: 2,
          textShadow: "0 1px 8px rgba(0,0,0,0.5)",
        }}
      >
        NEWS·ENGINE
      </span>
      <span
        style={{
          fontFamily: "Plex Mono",
          fontSize: 21,
          fontWeight: 700,
          color,
          letterSpacing: 5,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Footer({ spec, cta }: { spec: SlideSpec; cta: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        width: "100%",
      }}
    >
      {spec.pageCount > 1 && (
        <div style={{ display: "flex", gap: 10 }}>
          {Array.from({ length: spec.pageCount }, (_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                width: i + 1 === spec.pageIndex ? 26 : 10,
                height: 10,
                borderRadius: 6,
                backgroundColor:
                  i + 1 === spec.pageIndex ? "#FFFFFF" : "rgba(255,255,255,0.38)",
              }}
            />
          ))}
        </div>
      )}
      {cta && (
        <span
          style={{
            fontFamily: "Plex Mono",
            fontSize: 23,
            fontWeight: 700,
            color: "rgba(255,255,255,0.92)",
            letterSpacing: 3,
          }}
        >
          {"ARRASTE PARA O LADO >>"}
        </span>
      )}
      {spec.credit && (
        <span
          style={{
            fontFamily: "Plex Mono",
            fontSize: 15,
            fontWeight: 700,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: 1,
          }}
        >
          {spec.credit.slice(0, 90)}
        </span>
      )}
    </div>
  );
}

function coverHeadlineSize(text: string): number {
  if (text.length <= 28) return 104;
  if (text.length <= 48) return 88;
  if (text.length <= 68) return 74;
  return 62;
}

function CoverSlide({ spec, imageData }: { spec: SlideSpec; imageData: string | null }) {
  const ui = VERTICAL_UI[spec.vertical] ?? { label: spec.vertical.toUpperCase(), color: "#FFD666" };
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative" }}>
      <Background imageData={imageData} />
      <Scrim heavy={false} />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "56px 64px 48px",
        }}
      >
        <Brand color={ui.color} label={ui.label} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 30,
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Archivo Black",
              fontWeight: 900,
              fontSize: coverHeadlineSize(spec.headline),
              color: "#FFFFFF",
              textTransform: "uppercase",
              textAlign: "center",
              lineHeight: 1.04,
              textShadow: "0 4px 26px rgba(0,0,0,0.65)",
            }}
          >
            {spec.headline}
          </div>
          {spec.body && (
            <div
              style={{
                display: "flex",
                fontFamily: "Lora",
                fontSize: 35,
                color: "rgba(255,255,255,0.94)",
                textAlign: "center",
                lineHeight: 1.3,
                maxWidth: 880,
                textShadow: "0 2px 12px rgba(0,0,0,0.6)",
              }}
            >
              {spec.body}
            </div>
          )}
          <div style={{ display: "flex", width: 76, height: 7, backgroundColor: ui.color, borderRadius: 4 }} />
        </div>
        <Footer spec={spec} cta />
      </div>
    </div>
  );
}

function BodySlide({ spec, imageData }: { spec: SlideSpec; imageData: string | null }) {
  const ui = VERTICAL_UI[spec.vertical] ?? { label: spec.vertical.toUpperCase(), color: "#FFD666" };
  const isFinal = spec.kind === "final";
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative" }}>
      <Background imageData={imageData} />
      <Scrim heavy />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "52px 72px 46px",
        }}
      >
        <span
          style={{
            fontFamily: "Plex Mono",
            fontSize: 24,
            fontWeight: 700,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: 2,
          }}
        >
          NEWS·ENGINE
        </span>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 34,
            width: "100%",
          }}
        >
          {spec.headline && (
            <span
              style={{
                fontFamily: "Plex Mono",
                fontSize: 25,
                fontWeight: 700,
                color: ui.color,
                letterSpacing: 4,
                textTransform: "uppercase",
                textAlign: "center",
              }}
            >
              {spec.headline}
            </span>
          )}
          <RichText text={spec.body} size={44} />
          {isFinal && (
            <div
              style={{
                display: "flex",
                backgroundColor: BRAND_GREEN,
                color: "#FFFFFF",
                fontFamily: "Plex Mono",
                fontWeight: 700,
                fontSize: 27,
                letterSpacing: 3,
                padding: "20px 42px",
                borderRadius: 999,
                marginTop: 10,
              }}
            >
              {"SIGA PARA MAIS >>"}
            </div>
          )}
        </div>
        <Footer spec={spec} cta={!isFinal} />
      </div>
    </div>
  );
}

export async function renderSlide(spec: SlideSpec): Promise<ImageResponse> {
  const fonts = await loadFonts();
  const imageData = spec.image ? await toDataUrl(spec.image.url) : null;
  const element =
    spec.kind === "cover" ? (
      <CoverSlide spec={spec} imageData={imageData} />
    ) : (
      <BodySlide spec={spec} imageData={imageData} />
    );
  return new ImageResponse(element, {
    width: SLIDE_W,
    height: SLIDE_H,
    fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: "normal" })),
  });
}
