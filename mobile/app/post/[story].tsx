/**
 * Editor do post — o mesmo desenho local-first do site (2026-09-03): tocar
 * em foto ou posição atualiza o preview NA HORA (réplica RN, zero rede);
 * nada é gravado até Salvar, que manda tudo num único POST /apply.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { absoluteUrl, api, uploadImages, type PoolCandidate, type StoryDetail } from "../../src/api";
import SlidePreview, { type Placement } from "../../src/components/SlidePreview";
import { sendToInstagram } from "../../src/instagram";
import { C, F, VERTICAL_LABEL } from "../../src/theme";
import { TextInput } from "react-native";

interface SlideState {
  candidateId: string | null;
  placement: Placement;
  align: "left" | "center" | "right";
}

const PLACEMENTS: { value: Placement; label: string }[] = [
  { value: "TOP", label: "▔ topo" },
  { value: "CENTER", label: "▬ meio" },
  { value: "BOTTOM", label: "▁ base" },
];

export default function PostScreen() {
  const router = useRouter();
  const { story: storyId, run } = useLocalSearchParams<{ story: string; run: string }>();
  const { width } = useWindowDimensions();
  const slideW = width - 36;

  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<number, SlideState>>({});
  const [draft, setDraft] = useState<Record<number, SlideState>>({});
  const [notice, setNotice] = useState("");
  const [adjustText, setAdjustText] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [igConnected, setIgConnected] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const d = await api.story(String(run ?? "latest"), String(storyId));
      setDetail(d);
      const st: Record<number, SlideState> = {};
      for (const s of d.selection) {
        st[s.slide_number] = {
          candidateId: s.candidate_id,
          placement: s.placement,
          align: s.align,
        };
      }
      for (const s of d.slides) {
        if (!st[s.slide_number]) st[s.slide_number] = { candidateId: null, placement: "BOTTOM", align: "center" };
      }
      setSaved(st);
      setDraft(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [run, storyId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.igStatus().then((s) => setIgConnected(s.connected)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!detail?.slides?.length) return;
    detail.slides.forEach((s) => {
      absoluteUrl(s.render_url).then((u) => fetch(u).catch(() => {}));
    });
  }, [detail?.story_id, detail?.slides]);

  const byId = useMemo(
    () => new Map((detail?.pool ?? []).map((c) => [c.id, c])),
    [detail],
  );
  const ordered = useMemo(
    () => [...(detail?.pool ?? [])].sort((a, b) => b.score - a.score),
    [detail],
  );

  const changes = (detail?.slides ?? [])
    .map(({ slide_number: n }) => {
      const d = draft[n];
      const s = saved[n];
      if (!d) return null;
      const cand = d.candidateId !== s?.candidateId;
      const place = d.placement !== s?.placement;
      if (!cand && !place) return null;
      return {
        slide_number: n,
        ...(cand ? { candidate_id: d.candidateId } : {}),
        ...(place ? { placement: d.placement } : {}),
      };
    })
    .filter(Boolean) as { slide_number: number; candidate_id?: string | null; placement?: string }[];
  const dirty = changes.length > 0;
  const imagesDone =
    (detail?.slides ?? []).length > 0 &&
    (detail?.slides ?? []).every((s) => draft[s.slide_number]?.candidateId);

  function pick(n: number, c: PoolCandidate) {
    Haptics.selectionAsync();
    setNotice("");
    setDraft((d) => ({
      ...d,
      [n]: { candidateId: c.id, placement: c.placement, align: c.align },
    }));
  }

  function place(n: number, p: Placement) {
    Haptics.selectionAsync();
    setNotice("");
    setDraft((d) => ({ ...d, [n]: { ...d[n], placement: p } }));
  }

  async function act(name: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(name);
    setError("");
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      after?.();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    act("save", () => api.apply(String(storyId), String(run), changes), () => {
      setSaved(draft);
      setNotice("salvo — os arquivos finais atualizam em segundo plano");
    });

  const generate = () =>
    act("generate", () => api.generate(String(storyId), String(run)), () => load());

  const fetchPhotos = () =>
    act("media", () => api.fetchMedia(String(storyId), String(run)), () => load());

  const generateArt = (slide?: number) =>
    act(slide ? `ai-${slide}` : "ai", () => api.generateAI(String(storyId), String(run), slide), () => load());

  const pickAndUpload = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.92,
    });
    if (res.canceled || !res.assets?.length) return;
    await act(
      "upload",
      () =>
        uploadImages(
          String(storyId),
          String(run),
          res.assets.map((a) => ({ uri: a.uri, mime: a.mimeType === "image/png" ? "image/png" : "image/jpeg" })),
        ),
      () => load(),
    );
  };

  const saveTitle = () =>
    act("title", () => api.setHeadline(String(storyId), String(run), titleDraft.trim()), () => {
      setEditingTitle(false);
      setNotice("manchete atualizada — a capa muda na hora, o PNG final atualiza em segundo plano");
      load();
    });

  const askAdjust = () =>
    act("adjust", () => api.adjust(String(storyId), String(run), adjustText.trim()), () => {
      setAdjustText("");
      setShowAdjust(false);
      load();
    });

  const archive = () =>
    act(
      "archive",
      () => api.review(String(storyId), detail!.run_id, detail!.vertical, "REJECTED"),
      () => router.back(),
    );

  const approve = () =>
    act(
      "approve",
      () => api.review(String(storyId), detail!.run_id, detail!.vertical, "APPROVED"),
      () => load(),
    );

  const publishDirect = () => {
    if (!detail) return;
    Alert.alert(
      "Publicar no Instagram?",
      "O carrossel vai AO AR na conta conectada, com a legenda e hashtags. Não dá para desfazer por aqui.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Publicar agora",
          style: "destructive",
          onPress: () =>
            act(
              "igpublish",
              () => api.igPublish(String(storyId), String(run)),
              () => {
                setNotice("publicado no Instagram ✓");
                load();
              },
            ),
        },
      ],
    );
  };

  const publish = async () => {
    if (!detail) return;
    setBusy("share");
    setError("");
    try {
      const r = await sendToInstagram(
        detail.slides,
        `${detail.caption}\n\n${detail.hashtags.join(" ")}`,
        (p) => setNotice(p.step),
      );
      setNotice(r.message);
      if (r.ok) {
        Alert.alert("Marcar como publicado?", "Os slides estão no rolo e a legenda copiada.", [
          { text: "Ainda não", style: "cancel" },
          {
            text: "Publiquei",
            onPress: () =>
              act("publish", () => api.review(String(storyId), detail.run_id, detail.vertical, "PUBLISHED"), () => load()),
          },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!detail && !error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.paper, justifyContent: "center" }}>
        <ActivityIndicator color={C.brand} />
      </SafeAreaView>
    );
  }

  const btn = (
    label: string,
    onPress: () => void,
    opts: { kind?: "primary" | "dark" | "ghost" | "ok"; disabled?: boolean; loading?: boolean; half?: boolean } = {},
  ) => {
    const bg =
      opts.kind === "dark" ? C.ink : opts.kind === "ghost" ? C.panel : opts.kind === "ok" ? C.ok : C.brand;
    return (
      <Pressable
        onPress={onPress}
        disabled={opts.disabled || Boolean(busy)}
        style={{
          backgroundColor: opts.kind === "ghost" ? C.panel : bg,
          borderWidth: opts.kind === "ghost" ? 1 : 0,
          borderColor: C.line,
          borderRadius: 12,
          height: 44,
          justifyContent: "center",
          paddingHorizontal: 14,
          alignItems: "center",
          opacity: opts.disabled ? 0.5 : 1,
          width: opts.half ? "48.5%" : "100%",
        }}
      >
        {opts.loading ? (
          <ActivityIndicator size="small" color={opts.kind === "ghost" ? C.brand : "#fff"} />
        ) : (
          <Text
            style={{
              fontFamily: F.sansBold,
              fontSize: 13.5,
              color: opts.kind === "ghost" ? C.ink2 : "#fff",
            }}
          >
            {label}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }} edges={["top"]}>
      {/* topo */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 8,
          gap: 10,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontFamily: F.sansBold, fontSize: 15, color: C.brandInk }}>‹ Voltar</Text>
        </Pressable>
        <Text style={{ fontFamily: F.sansBold, fontSize: 12, color: C.ink3, flex: 1 }} numberOfLines={1}>
          {VERTICAL_LABEL[detail?.vertical ?? ""] ?? detail?.vertical} ·{" "}
          {detail?.status === "published" ? "publicado" : detail?.status === "approved" ? "aprovado" : "rascunho"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={{ paddingHorizontal: 18, gap: 6 }}>
          {editingTitle ? (
            <View style={{ gap: 8 }}>
              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                multiline
                autoFocus
                maxLength={90}
                style={{
                  fontFamily: F.serifBold,
                  fontSize: 19,
                  lineHeight: 25,
                  color: C.navy,
                  backgroundColor: C.panel,
                  borderWidth: 1,
                  borderColor: C.brand,
                  borderRadius: 12,
                  padding: 12,
                }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={saveTitle}
                  disabled={titleDraft.trim().length < 8 || busy === "title"}
                  style={{ backgroundColor: C.brand, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, opacity: titleDraft.trim().length < 8 ? 0.5 : 1 }}
                >
                  {busy === "title" ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ fontFamily: F.sansBold, fontSize: 13, color: "#fff" }}>Salvar manchete</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setEditingTitle(false)}
                  style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 }}
                >
                  <Text style={{ fontFamily: F.sansBold, fontSize: 13, color: C.ink2 }}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                if (!detail) return;
                setTitleDraft(detail.headline || detail.title);
                setEditingTitle(true);
              }}
            >
              <Text style={{ fontFamily: F.serifBold, fontSize: 20, lineHeight: 26, color: C.navy }}>
                {detail?.headline || detail?.title}
                <Text style={{ fontFamily: F.sans, fontSize: 14, color: C.ink3 }}>  ✎</Text>
              </Text>
            </Pressable>
          )}
          {Boolean(detail?.summary) && (
            <Text style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 19, color: C.ink2 }}>
              {detail?.summary}
            </Text>
          )}
        </View>

        {Boolean(error) && (
          <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.danger, padding: 18 }}>{error}</Text>
        )}

        {/* triagem: ainda sem conteúdo */}
        {detail && detail.slides.length === 0 && (
          <View style={{ padding: 18, gap: 10 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.ink2 }}>
              Este post está só na triagem. Gere o pacote completo (slides, fotos e legenda) para editar.
            </Text>
            {btn("✦ Gerar conteúdo (~40s)", generate, { kind: "dark", loading: busy === "generate" })}
          </View>
        )}

        {/* slides: pager horizontal, cada página com controles embaixo */}
        {detail && detail.slides.length > 0 && (
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={detail.slides}
            keyExtractor={(s) => String(s.slide_number)}
            style={{ marginTop: 14 }}
            snapToInterval={slideW + 12}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: 18, gap: 12 }}
            renderItem={({ item: slide }) => {
              const st = draft[slide.slide_number];
              const cand = st?.candidateId ? (byId.get(st.candidateId) ?? null) : null;
              return (
                <View style={{ width: slideW, gap: 10 }}>
                  <SlidePreview
                    slide={slide}
                    candidate={cand}
                    placement={st?.placement ?? "BOTTOM"}
                    align={st?.align ?? "center"}
                    subBrand={detail.sub_brand}
                    imageUrl={cand?.url ?? null}
                    width={slideW}
                    pageCount={detail.page_count}
                  />
                  {/* posição do texto + IA deste slide */}
                  <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 }}>
                    {PLACEMENTS.map((p) => (
                      <Pressable
                        key={p.value}
                        onPress={() => place(slide.slide_number, p.value)}
                        style={{
                          backgroundColor: st?.placement === p.value ? C.brandSoft : C.panel,
                          borderWidth: 1,
                          borderColor: st?.placement === p.value ? C.brand : C.line,
                          borderRadius: 10,
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: F.sansBold,
                            fontSize: 12,
                            color: st?.placement === p.value ? C.brandInk : C.ink2,
                          }}
                        >
                          {p.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
                    <Pressable
                      onPress={() => generateArt(slide.slide_number)}
                      disabled={Boolean(busy)}
                      style={{
                        backgroundColor: C.panel,
                        borderWidth: 1,
                        borderColor: C.line,
                        borderRadius: 10,
                        height: 34,
                        justifyContent: "center",
                        paddingHorizontal: 14,
                        minWidth: 132,
                        alignItems: "center",
                      }}
                    >
                      {busy === `ai-${slide.slide_number}` ? (
                        <ActivityIndicator size="small" color={C.brand} />
                      ) : (
                        <Text style={{ fontFamily: F.sansBold, fontSize: 12, color: C.brandInk }}>✦ IA neste slide</Text>
                      )}
                    </Pressable>
                    {Boolean(slide.image_prompt) && (
                      <Pressable
                        onPress={async () => {
                          await Clipboard.setStringAsync(slide.image_prompt!);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          setNotice(`prompt do slide ${slide.slide_number} copiado — gere no GPT e use Subir fotos`);
                        }}
                        style={{
                          backgroundColor: C.panel,
                          borderWidth: 1,
                          borderColor: C.line,
                          borderRadius: 10,
                          height: 34,
                          justifyContent: "center",
                          paddingHorizontal: 14,
                          minWidth: 128,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontFamily: F.sansBold, fontSize: 12, color: C.ink2 }}>⧉ copiar prompt</Text>
                      </Pressable>
                    )}
                  </View>
                  {/* candidatas */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {ordered
                      .filter(
                        (c) =>
                          c.generated_for_slide === slide.slide_number ||
                          c.generated_for_slide === null,
                      )
                      .map((c) => {
                        const sel = st?.candidateId === c.id;
                        return (
                          <Pressable key={c.id} onPress={() => pick(slide.slide_number, c)}>
                            <Image
                              source={{ uri: c.url }}
                              style={{
                                width: 58,
                                height: 72,
                                borderRadius: 8,
                                borderWidth: 2,
                                borderColor: sel ? C.brand : C.line,
                                opacity: sel ? 1 : 0.85,
                              }}
                              contentFit="cover"
                            />
                          </Pressable>
                        );
                      })}
                  </ScrollView>
                </View>
              );
            }}
          />
        )}

        {/* ações */}
        {detail && detail.slides.length > 0 && (
          <View style={{ paddingHorizontal: 18, paddingTop: 14, gap: 10 }}>
            <Text style={{ fontFamily: F.sansBlack, fontSize: 11, color: C.ink3, letterSpacing: 1 }}>
              FOTOS
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 }}>
              {btn("Buscar fotos", fetchPhotos, { kind: "ghost", loading: busy === "media", half: true })}
              {btn("Subir fotos", pickAndUpload, { kind: "ghost", loading: busy === "upload", half: true })}
              {btn("✦ Gerar IA (todos)", () => generateArt(), { kind: "ghost", loading: busy === "ai", half: true })}
              {btn("⧉ Prompts p/ GPT", async () => {
                const all = (detail?.slides ?? [])
                  .filter((s) => s.image_prompt)
                  .map((s) => `── SLIDE ${s.slide_number} ──\n${s.image_prompt}`)
                  .join("\n\n");
                await Clipboard.setStringAsync(all);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setNotice("prompts de todos os slides copiados — gere no GPT (1 imagem por prompt, arquivos separados) e use Subir fotos");
              }, { kind: "ghost", half: true })}
            </View>
            {busy === "ai" && (
              <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.ink3, textAlign: "center" }}>
                gerando 3 opções por slide — leva 1 a 2 minutos
              </Text>
            )}
            {dirty && (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {btn(`Salvar (${changes.length})`, save, { loading: busy === "save", half: true })}
                {btn("Descartar", () => setDraft(saved), { kind: "ghost", half: true })}
              </View>
            )}
            {Boolean(notice) && (
              <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.brandInk }}>{notice}</Text>
            )}
            {detail.status === "draft" &&
              btn(
                imagesDone ? "Aprovar post" : "Aprovar (complete as fotos antes)",
                approve,
                { kind: "ok", disabled: !imagesDone || dirty, loading: busy === "approve" },
              )}
            {detail.status !== "draft" && (
              <View style={{ gap: 8 }}>
                {igConnected &&
                  detail.status === "approved" &&
                  btn("Publicar no Instagram (direto)", publishDirect, {
                    loading: busy === "igpublish",
                  })}
                {btn(
                  igConnected ? "Compartilhar manual (rolo + Instagram)" : "Enviar ao Instagram",
                  publish,
                  { kind: "dark", loading: busy === "share" },
                )}
              </View>
            )}
            {dirty && detail.status === "draft" && (
              <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.ink3, textAlign: "center" }}>
                salve as alterações antes de aprovar
              </Text>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              {btn(showAdjust ? "Fechar ajustes" : "Pedir ajustes no texto", () => setShowAdjust(!showAdjust), { kind: "ghost", half: true })}
              {btn("Arquivar", archive, { kind: "ghost", loading: busy === "archive", half: true })}
            </View>
            {showAdjust && (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={adjustText}
                  onChangeText={setAdjustText}
                  placeholder="ex.: manchete mais direta; corte o 2º slide"
                  placeholderTextColor={C.ink3}
                  multiline
                  style={{
                    backgroundColor: C.panel,
                    borderWidth: 1,
                    borderColor: C.line,
                    borderRadius: 12,
                    padding: 12,
                    minHeight: 70,
                    fontFamily: F.sans,
                    fontSize: 13.5,
                    color: C.ink,
                  }}
                />
                {btn("Reescrever com o ajuste (~30s)", askAdjust, {
                  kind: "dark",
                  disabled: adjustText.trim().length < 5,
                  loading: busy === "adjust",
                })}
              </View>
            )}
          </View>
        )}

        {/* legenda */}
        {detail && Boolean(detail.caption) && (
          <View style={{ paddingHorizontal: 18, paddingTop: 18, gap: 6 }}>
            <Text style={{ fontFamily: F.sansBlack, fontSize: 11, color: C.ink3, letterSpacing: 1 }}>
              LEGENDA
            </Text>
            <View style={{ backgroundColor: C.panel, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14 }}>
              <Text style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 19, color: C.ink2 }}>
                {detail.caption}
              </Text>
              <Text style={{ fontFamily: F.sansBold, fontSize: 12, color: C.brandInk, marginTop: 8 }}>
                {detail.hashtags.join(" ")}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
