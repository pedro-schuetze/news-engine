/**
 * Hoje — a capa do Google News, organizada por seção. O coração do fluxo:
 * escolher a pauta e criar o post (o rascunho abre direto no editor).
 */
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, type TodaySnapshot, type TodayStory } from "../../src/api";
import { C, F } from "../../src/theme";

function age(iso: string | null): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `há ${m}m` : `há ${Math.floor(m / 60)}h`;
}

function StoryCard({
  story,
  snapshotId,
  onCreated,
}: {
  story: TodayStory;
  snapshotId: string;
  onCreated: (runFile: string, storyId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const r = await api.createFromNews(snapshotId, story.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated(r.run_file, r.story_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        backgroundColor: C.panel,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.line,
        padding: 16,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: F.sansBold, fontSize: 11, color: C.ink3, letterSpacing: 1 }}>
          #{story.rank} · {age(story.published_at)}
        </Text>
        {story.is_new && (
          <View style={{ backgroundColor: "#E7F3EE", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.sansBlack, fontSize: 9, color: C.ok, letterSpacing: 1 }}>NOVA</Text>
          </View>
        )}
      </View>
      <Text style={{ fontFamily: F.serifBold, fontSize: 17, lineHeight: 23, color: C.ink }}>
        {story.title}
      </Text>
      <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.ink2 }} numberOfLines={1}>
        {story.outlets.map((o) => o.name).filter(Boolean).join(" · ")}
      </Text>
      <Pressable
        onPress={create}
        disabled={busy}
        style={({ pressed }) => ({
          backgroundColor: busy ? C.brandSoft : pressed ? C.brandInk : C.ink,
          borderRadius: 12,
          paddingVertical: 11,
          alignItems: "center",
        })}
      >
        {busy ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" color={C.brandInk} />
            <Text style={{ fontFamily: F.sansBold, fontSize: 13, color: C.brandInk }}>
              Lendo fontes e escrevendo…
            </Text>
          </View>
        ) : (
          <Text style={{ fontFamily: F.sansBold, fontSize: 13, color: "#fff" }}>
            Criar post desta pauta
          </Text>
        )}
      </Pressable>
      {Boolean(error) && (
        <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.danger }}>{error}</Text>
      )}
    </View>
  );
}

export default function TodayScreen() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<string>("");

  const load = useCallback(async () => {
    try {
      setError("");
      setSnapshot(await api.today());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sections = useMemo(() => {
    const out: { label: string; stories: TodayStory[] }[] = [];
    for (const s of snapshot?.stories ?? []) {
      const found = out.find((x) => x.label === s.section_label);
      if (found) found.stories.push(s);
      else out.push({ label: s.section_label, stories: [s] });
    }
    return out;
  }, [snapshot]);

  const active = section || sections[0]?.label || "";
  const stories = sections.find((s) => s.label === active)?.stories ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }} edges={["top"]}>
      <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4, gap: 2 }}>
        <Image
          source={require("../../assets/iris-wordmark.png")}
          style={{ width: 132, height: 28 }}
          resizeMode="contain"
        />
        <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.ink2, marginTop: 6 }}>
          {snapshot
            ? `Capa do Google News · ${new Date(snapshot.fetched_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
            : "A sua próxima publicação começa aqui"}
        </Text>
      </View>

      {/* seções */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 10, gap: 8 }}
      >
        {sections.map((s) => (
          <Pressable
            key={s.label}
            onPress={() => setSection(s.label)}
            style={{
              backgroundColor: s.label === active ? C.navy : C.panel,
              borderWidth: 1,
              borderColor: s.label === active ? C.navy : C.line,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 7,
            }}
          >
            <Text
              style={{
                fontFamily: F.sansBold,
                fontSize: 12.5,
                color: s.label === active ? "#fff" : C.ink2,
              }}
            >
              {s.label} · {s.stories.length}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={C.brand}
          />
        }
      >
        {!snapshot && !error && <ActivityIndicator style={{ marginTop: 60 }} color={C.brand} />}
        {Boolean(error) && (
          <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.danger, marginTop: 40, textAlign: "center" }}>
            {error}
          </Text>
        )}
        {snapshot &&
          stories.map((s) => (
            <StoryCard
              key={s.id}
              story={s}
              snapshotId={snapshot.id}
              onCreated={(runFile, storyId) =>
                router.push({ pathname: "/post/[story]", params: { story: storyId, run: runFile } })
              }
            />
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}
