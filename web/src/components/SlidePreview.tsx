"use client";

/**
 * Réplica HTML/CSS do slide — o PREVIEW da edição (2026-09-03).
 *
 * Insight do Pedro: na edição só se escolhe FOTO e POSIÇÃO do texto — o texto
 * em si não muda. Então o preview não precisa do renderizador do servidor
 * (satori, 25-30s): este componente reproduz o layout 1:1 em HTML (mesmas
 * fontes via next/font, mesmos gradientes, mesmos px, escalado por container
 * query) e reage a qualquer clique INSTANTANEAMENTE, sem rede.
 *
 * O PNG oficial continua sendo o satori (export/Instagram/Prontos) — gerado
 * uma vez, no Salvar. Os números daqui espelham web/src/lib/slides/render.tsx;
 * mudou lá, mude aqui (e vice-versa).
 */

import { useLayoutEffect, useRef, useState } from "react";
import type { MediaCandidate } from "@/lib/types";

export type Placement = "TOP" | "CENTER" | "BOTTOM";

export interface PreviewSlide {
  n: number;
  kind: "cover" | "body" | "final";
  headline: string; // capa: manchete; internos: kicker
  body: string;
  pageCount: number;
}

const INK_DARK = "#0A0A0A";
const IVORY = "#F7F5F1";
const ROYAL = "#1D4ED8";

const BANDS: Record<Placement, string> = {
  TOP: "linear-gradient(180deg, rgba(5,7,12,0.9) 0%, rgba(5,7,12,0.88) 34%, rgba(5,7,12,0.45) 46%, rgba(5,7,12,0) 58%, rgba(5,7,12,0) 100%)",
  CENTER:
    "linear-gradient(180deg, rgba(5,7,12,0) 8%, rgba(5,7,12,0.5) 26%, rgba(5,7,12,0.86) 38%, rgba(5,7,12,0.86) 66%, rgba(5,7,12,0.45) 76%, rgba(5,7,12,0) 88%)",
  BOTTOM:
    "linear-gradient(180deg, rgba(5,7,12,0) 20%, rgba(5,7,12,0.45) 44%, rgba(5,7,12,0.84) 60%, rgba(5,7,12,0.9) 100%)",
};
const CHROME =
  "linear-gradient(180deg, rgba(5,7,12,0.62) 0%, rgba(5,7,12,0) 12%, rgba(5,7,12,0) 86%, rgba(5,7,12,0.72) 100%)";

const JUSTIFY: Record<Placement, string> = {
  TOP: "flex-start",
  CENTER: "center",
  BOTTOM: "flex-end",
};
const ALIGN_ITEMS: Record<string, string> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

function coverHeadlineSize(text: string): number {
  if (text.length <= 28) return 104;
  if (text.length <= 48) return 88;
  if (text.length <= 68) return 74;
  return 62;
}

/** corpo com **negrito**, como o RichText do renderer */
function Rich({ text, size, align }: { text: string; size: number; align: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <div
      style={{
        fontFamily: "var(--font-jakarta)",
        fontSize: size,
        color: "#FFFFFF",
        lineHeight: 1.34,
        textAlign: align as "left" | "center" | "right",
        textShadow: "0 2px 18px rgba(0,0,0,0.95), 0 0 42px rgba(0,0,0,0.7)",
        maxWidth: 880,
      }}
    >
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <b key={i} style={{ fontWeight: 700 }}>
            {p.slice(2, -2)}
          </b>
        ) : (
          <span key={i} style={{ fontWeight: 400 }}>
            {p}
          </span>
        ),
      )}
    </div>
  );
}

export default function SlidePreview({
  slide,
  candidate,
  placement,
  align,
  subBrand,
  imageUrl,
}: {
  slide: PreviewSlide;
  candidate: MediaCandidate | null;
  placement: Placement;
  align: "left" | "center" | "right";
  subBrand: string; // WORLD | ENTERTAINMENT | CURIOSITY
  imageUrl: string | null;
}) {
  const isCover = slide.kind === "cover";
  const isFinal = slide.kind === "final";
  const plain = (s: string) => s.replace(/\*\*/g, "");

  // cover exato guiado pelo foco (mesma matemática do renderer)
  let imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  };
  if (candidate?.width && candidate.height && candidate.focus_x != null) {
    const scale = Math.max(1080 / candidate.width, 1350 / candidate.height);
    const w = Math.round(candidate.width * scale);
    const h = Math.round(candidate.height * scale);
    const left = Math.round(
      Math.min(0, Math.max(-(w - 1080), -(w * (candidate.focus_x ?? 0.5) - 540))),
    );
    const top = Math.round(
      Math.min(0, Math.max(-(h - 1350), -(h * (candidate.focus_y ?? 0.45) - 675))),
    );
    imgStyle = { position: "absolute", left, top, width: w, height: h };
  }

  // escala medida de verdade: scale() exige número puro — calc(100cqw/1080)
  // é CSS inválido e o browser o ignorava (bug do primeiro deploy: o slide
  // 1080px aparecia sem escala, só o canto da foto)
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / 1080);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ width: "100%" }}>
      <div
        ref={wrapRef}
        style={{ width: "100%", aspectRatio: "1080 / 1350", overflow: "hidden", borderRadius: 8 }}
      >
        <div
          style={{
            width: 1080,
            height: 1350,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "relative",
            backgroundColor: INK_DARK,
            overflow: "hidden",
            visibility: scale ? "visible" : "hidden",
          }}
        >
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" style={imgStyle} />
          )}
          {/* scrim: faixa local + barras de chrome + véu */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `${BANDS[placement]}, ${CHROME}, linear-gradient(180deg, rgba(5,7,12,${isCover ? 0.2 : 0.16}) 0%, rgba(5,7,12,${isCover ? 0.2 : 0.16}) 100%)`,
            }}
          />
          {/* conteúdo */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              padding: isCover ? "56px 64px 48px" : "52px 72px 46px",
            }}
          >
            {isCover ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/gpb-wordmark-light.png" alt="GPB" width={240} height={85} />
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: ROYAL }} />
                  <span
                    style={{
                      fontFamily: "var(--font-jakarta)",
                      fontSize: 20,
                      fontWeight: 900,
                      color: "rgba(247,245,241,0.92)",
                      letterSpacing: 7,
                    }}
                  >
                    {subBrand}
                  </span>
                  <span style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: ROYAL }} />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 16, alignSelf: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/gpb-wordmark-light.png" alt="GPB" width={118} height={42} />
                <span
                  style={{
                    fontFamily: "var(--font-jakarta)",
                    fontSize: 17,
                    fontWeight: 900,
                    color: "rgba(247,245,241,0.85)",
                    letterSpacing: 5,
                  }}
                >
                  {subBrand}
                </span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexGrow: 1,
                flexDirection: "column",
                width: "100%",
                justifyContent: JUSTIFY[placement],
                alignItems: ALIGN_ITEMS[align] ?? "center",
                paddingTop: placement === "TOP" ? (isCover ? 30 : 26) : 0,
                paddingBottom: placement === "BOTTOM" ? (isCover ? 40 : 34) : 0,
                gap: isCover ? 30 : 34,
              }}
            >
              {isCover ? (
                <>
                  <div
                    style={{
                      fontFamily: "var(--font-fraunces)",
                      fontWeight: 900,
                      fontSize: coverHeadlineSize(plain(slide.headline)),
                      color: IVORY,
                      textAlign: align,
                      lineHeight: 1.06,
                      textShadow: "0 4px 24px rgba(0,0,0,0.98), 0 0 60px rgba(0,0,0,0.85)",
                    }}
                  >
                    {plain(slide.headline)}
                  </div>
                  {slide.body && <Rich text={slide.body} size={35} align={align} />}
                  <div style={{ width: 76, height: 7, backgroundColor: ROYAL, borderRadius: 4 }} />
                </>
              ) : (
                <>
                  {slide.headline && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: ALIGN_ITEMS[align] ?? "center",
                        gap: 12,
                      }}
                    >
                      <span style={{ width: 44, height: 6, borderRadius: 3, backgroundColor: ROYAL }} />
                      <span
                        style={{
                          fontFamily: "var(--font-jakarta)",
                          fontSize: 25,
                          fontWeight: 900,
                          color: "rgba(247,245,241,0.95)",
                          letterSpacing: 5,
                          textTransform: "uppercase",
                          textAlign: align,
                        }}
                      >
                        {plain(slide.headline)}
                      </span>
                    </div>
                  )}
                  <Rich text={slide.body} size={44} align={align} />
                  {isFinal && (
                    <div
                      style={{
                        backgroundColor: ROYAL,
                        color: IVORY,
                        fontFamily: "var(--font-jakarta)",
                        fontWeight: 900,
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
                </>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
              {slide.pageCount > 1 && (
                <div style={{ display: "flex", gap: 10 }}>
                  {Array.from({ length: slide.pageCount }, (_, i) => (
                    <span
                      key={i}
                      style={{
                        width: i + 1 === slide.n ? 26 : 10,
                        height: 10,
                        borderRadius: 6,
                        backgroundColor: i + 1 === slide.n ? "#FFFFFF" : "rgba(255,255,255,0.38)",
                      }}
                    />
                  ))}
                </div>
              )}
              {!isFinal && (
                <span
                  style={{
                    fontFamily: "var(--font-jakarta)",
                    fontSize: 23,
                    fontWeight: 900,
                    color: "rgba(247,245,241,0.94)",
                    letterSpacing: 4,
                  }}
                >
                  {"ARRASTE PARA O LADO >>"}
                </span>
              )}
              {candidate?.credit && (
                <span
                  style={{
                    fontFamily: "var(--font-jakarta)",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "rgba(247,245,241,0.55)",
                    letterSpacing: 1,
                  }}
                >
                  {`FOTO: ${candidate.credit}`.slice(0, 90)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
