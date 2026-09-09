/**
 * Réplica RN do slide 1080×1350 — o preview instantâneo da edição, irmã da
 * réplica HTML do site (web/src/components/SlidePreview.tsx). Os números
 * (gradientes, tamanhos, paddings) espelham web/src/lib/slides/render.tsx;
 * mudou o renderer, mude aqui e lá.
 */
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { View, Text } from "react-native";
import { C, F } from "../theme";
import type { PoolCandidate, StorySlide } from "../api";

export type Placement = "TOP" | "CENTER" | "BOTTOM";
type Align = "left" | "center" | "right";

const IVORY = "#F7F5F1";
const ROYAL = "#1D4ED8";

// mesmas rampas do renderer (rgba(5,7,12,…))
const ink = (a: number) => `rgba(5,7,12,${a})`;
const BANDS: Record<Placement, { colors: string[]; locations: number[] }> = {
  TOP: {
    colors: [ink(0.9), ink(0.88), ink(0.45), ink(0), ink(0)],
    locations: [0, 0.34, 0.46, 0.58, 1],
  },
  CENTER: {
    colors: [ink(0), ink(0.5), ink(0.86), ink(0.86), ink(0.45), ink(0)],
    locations: [0.08, 0.26, 0.38, 0.66, 0.76, 0.88],
  },
  BOTTOM: {
    colors: [ink(0), ink(0.45), ink(0.84), ink(0.9)],
    locations: [0.2, 0.44, 0.6, 1],
  },
};
const CHROME = {
  colors: [ink(0.62), ink(0), ink(0), ink(0.72)],
  locations: [0, 0.12, 0.86, 1],
};

function coverHeadlineSize(text: string): number {
  if (text.length <= 28) return 104;
  if (text.length <= 48) return 88;
  if (text.length <= 68) return 74;
  return 62;
}

const alignItems = (a: Align) =>
  a === "left" ? "flex-start" : a === "right" ? "flex-end" : "center";
const justify = (p: Placement) =>
  p === "TOP" ? "flex-start" : p === "BOTTOM" ? "flex-end" : "center";

/** corpo com **negrito**, como o RichText do renderer */
function Rich({ text, size, align }: { text: string; size: number; align: Align }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text
      style={{
        fontSize: size,
        color: "#FFFFFF",
        lineHeight: size * 1.34,
        textAlign: align,
        maxWidth: 880,
        textShadowColor: "rgba(0,0,0,0.95)",
        textShadowRadius: 18,
        textShadowOffset: { width: 0, height: 2 },
      }}
    >
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <Text key={i} style={{ fontFamily: F.sansBold }}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          <Text key={i} style={{ fontFamily: F.sans }}>
            {p}
          </Text>
        ),
      )}
    </Text>
  );
}

export default function SlidePreview({
  slide,
  candidate,
  placement,
  align,
  subBrand,
  imageUrl,
  width,
  pageCount,
}: {
  slide: StorySlide;
  candidate: PoolCandidate | null;
  placement: Placement;
  align: Align;
  subBrand: string;
  imageUrl: string | null;
  /** largura disponível em px de tela; o slide 1080×1350 é escalado para ela */
  width: number;
  pageCount: number;
}) {
  const scale = width / 1080;
  const isCover = slide.kind === "cover";
  const isFinal = slide.kind === "final";
  const plain = (s: string) => s.replace(/\*\*/g, "");

  // cover exato guiado pelo foco (mesma matemática do renderer)
  let img: { left: number; top: number; w: number; h: number } | null = null;
  if (candidate?.width && candidate.height) {
    const s = Math.max(1080 / candidate.width, 1350 / candidate.height);
    const w = Math.round(candidate.width * s);
    const h = Math.round(candidate.height * s);
    const fx = candidate.focus_x ?? 0.5;
    const fy = candidate.focus_y ?? 0.45;
    img = {
      left: Math.round(Math.min(0, Math.max(-(w - 1080), -(w * fx - 540)))),
      top: Math.round(Math.min(0, Math.max(-(h - 1350), -(h * fy - 675)))),
      w,
      h,
    };
  }

  return (
    <View
      style={{
        width,
        height: (1350 / 1080) * width,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: C.ink,
      }}
    >
      <View
        style={{
          width: 1080,
          height: 1350,
          transform: [{ scale }],
          transformOrigin: "top left",
        }}
      >
        {imageUrl &&
          (img ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ position: "absolute", left: img.left, top: img.top, width: img.w, height: img.h }}
              contentFit="fill"
              transition={90}
            />
          ) : (
            <Image
              source={{ uri: imageUrl }}
              style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1350 }}
              contentFit="cover"
              transition={90}
            />
          ))}

        {/* scrim: faixa local + chrome + véu */}
        <LinearGradient
          colors={BANDS[placement].colors as [string, string, ...string[]]}
          locations={BANDS[placement].locations as [number, number, ...number[]]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <LinearGradient
          colors={CHROME.colors as [string, string, ...string[]]}
          locations={CHROME.locations as [number, number, ...number[]]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: ink(isCover ? 0.2 : 0.16),
          }}
        />

        {/* conteúdo */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: isCover ? 56 : 52,
            paddingHorizontal: isCover ? 64 : 72,
            paddingBottom: isCover ? 48 : 46,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {isCover ? (
            <View style={{ alignItems: "center", gap: 14 }}>
              <Image
                source={require("../../assets/iris-wordmark-light.png")}
                style={{ width: 300, height: 64 }}
                contentFit="contain"
              />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: ROYAL }} />
                <Text
                  style={{
                    fontFamily: F.sansBlack,
                    fontSize: 20,
                    color: "rgba(247,245,241,0.92)",
                    letterSpacing: 7,
                  }}
                >
                  {subBrand}
                </Text>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: ROYAL }} />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Image
                source={require("../../assets/iris-wordmark-light.png")}
                style={{ width: 170, height: 36 }}
                contentFit="contain"
              />
              <Text
                style={{
                  fontFamily: F.sansBlack,
                  fontSize: 17,
                  color: "rgba(247,245,241,0.85)",
                  letterSpacing: 5,
                }}
              >
                {subBrand}
              </Text>
            </View>
          )}

          <View
            style={{
              flexGrow: 1,
              width: "100%",
              justifyContent: justify(placement),
              alignItems: alignItems(align),
              paddingTop: placement === "TOP" ? (isCover ? 30 : 26) : 0,
              paddingBottom: placement === "BOTTOM" ? (isCover ? 40 : 34) : 0,
              gap: isCover ? 30 : 34,
            }}
          >
            {isCover ? (
              <>
                <Text
                  style={{
                    fontFamily: F.serif,
                    fontSize: coverHeadlineSize(plain(slide.headline)),
                    color: IVORY,
                    textAlign: align,
                    lineHeight: coverHeadlineSize(plain(slide.headline)) * 1.06,
                    textShadowColor: "rgba(0,0,0,0.98)",
                    textShadowRadius: 24,
                    textShadowOffset: { width: 0, height: 4 },
                  }}
                >
                  {plain(slide.headline)}
                </Text>
                {Boolean(slide.body) && <Rich text={slide.body} size={35} align={align} />}
                <View style={{ width: 76, height: 7, borderRadius: 4, backgroundColor: ROYAL }} />
              </>
            ) : (
              <>
                {Boolean(slide.headline) && (
                  <View style={{ alignItems: alignItems(align), gap: 12 }}>
                    <View style={{ width: 44, height: 6, borderRadius: 3, backgroundColor: ROYAL }} />
                    <Text
                      style={{
                        fontFamily: F.sansBlack,
                        fontSize: 25,
                        color: "rgba(247,245,241,0.95)",
                        letterSpacing: 5,
                        textTransform: "uppercase",
                        textAlign: align,
                      }}
                    >
                      {plain(slide.headline)}
                    </Text>
                  </View>
                )}
                <Rich text={slide.body} size={44} align={align} />
                {isFinal && (
                  <View
                    style={{
                      backgroundColor: ROYAL,
                      paddingVertical: 20,
                      paddingHorizontal: 42,
                      borderRadius: 999,
                      marginTop: 10,
                    }}
                  >
                    <Text style={{ fontFamily: F.sansBlack, fontSize: 27, letterSpacing: 3, color: IVORY }}>
                      {"SIGA PARA MAIS >>"}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          <View style={{ alignItems: "center", gap: 16, width: "100%" }}>
            {/* dots de progresso */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {Array.from({ length: Math.max(1, pageCount) }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: i + 1 === slide.slide_number ? 26 : 10,
                    height: 10,
                    borderRadius: 6,
                    backgroundColor:
                      i + 1 === slide.slide_number ? "#FFFFFF" : "rgba(255,255,255,0.38)",
                  }}
                />
              ))}
            </View>
            {!isFinal && (
              <Text
                style={{
                  fontFamily: F.sansBlack,
                  fontSize: 23,
                  color: "rgba(247,245,241,0.94)",
                  letterSpacing: 4,
                }}
              >
                {"ARRASTE PARA O LADO >>"}
              </Text>
            )}
            {Boolean(candidate?.credit) && (
              <Text
                style={{
                  fontFamily: F.sansBold,
                  fontSize: 15,
                  color: "rgba(247,245,241,0.55)",
                  letterSpacing: 1,
                }}
                numberOfLines={1}
              >
                {`FOTO: ${candidate!.credit}`.slice(0, 90)}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

