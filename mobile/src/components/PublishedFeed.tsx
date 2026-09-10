/**
 * Feed dos publicados — a visualização "como no Instagram": uma imagem por
 * tela, paging vertical entre posts, swipe horizontal entre slides. Desde
 * 2026-09-10 é a PRIMEIRA subaba de Posts (era rota drill-down escondida —
 * feedback do Pedro). Ordena por Recentes ou, com o Instagram sincronizado,
 * por Populares (likes).
 */
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { Image } from "expo-image";
import { absoluteUrl, api, type PostListItem } from "../api";
import { C, F, VERTICAL_LABEL } from "../theme";

function SlidePager({ post, width, height }: { post: PostListItem; width: number; height: number }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  useEffect(() => {
    Promise.all((post.slides ?? []).map((s) => absoluteUrl(s.url))).then(setUrls);
  }, [post.story_id]);

  const imgH = Math.min(height, width * 1.25);
  return (
    <View style={{ width, height: imgH }}>
      <FlatList
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={urls}
        keyExtractor={(u, i) => `${post.story_id}-${i}`}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item }}
            style={{ width, height: imgH }}
            contentFit="contain"
            transition={120}
          />
        )}
      />
      {urls.length > 1 && (
        <View
          style={{
            position: "absolute",
            bottom: 10,
            alignSelf: "center",
            flexDirection: "row",
            gap: 5,
          }}
        >
          {urls.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === page ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === page ? "#fff" : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export default function PublishedFeed() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [pageH, setPageH] = useState(0);

  const [posts, setPosts] = useState<PostListItem[] | null>(null);
  const [order, setOrder] = useState<"recent" | "popular">("recent");
  const [hasMetrics, setHasMetrics] = useState(false);

  const load = useCallback(async () => {
    const r = await api.posts().catch(() => ({ posts: [] as PostListItem[] }));
    const published = r.posts.filter((p) => p.status === "published" && p.slides?.length);
    setPosts(published);
    setHasMetrics(published.some((p) => p.ig));
  }, []);

  useEffect(() => {
    load();
    // métricas frescas quando o Instagram está conectado (silencioso)
    api.igStatus().then((s) => {
      if (s.connected) api.igSync().then(load).catch(() => {});
    }).catch(() => {});
  }, [load]);

  const ordered = useMemo(() => {
    const list = [...(posts ?? [])];
    if (order === "popular") list.sort((a, b) => (b.ig?.likes ?? -1) - (a.ig?.likes ?? -1));
    else list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return list;
  }, [posts, order]);

  return (
    <View
      style={{ flex: 1, backgroundColor: "#05070C", borderRadius: 18, overflow: "hidden" }}
      onLayout={(e) => setPageH(e.nativeEvent.layout.height)}
    >
      <View style={{ flex: 1 }}>
        {/* topo: ordenação */}
        <View
          style={{
            position: "absolute",
            top: 10,
            left: 0,
            right: 0,
            zIndex: 10,
            flexDirection: "row",
            justifyContent: "flex-end",
            paddingHorizontal: 14,
          }}
        >
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(
              [
                ["recent", "Recentes"],
                ["popular", "Populares"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setOrder(value)}
                disabled={value === "popular" && !hasMetrics}
                style={{
                  backgroundColor: order === value ? "#fff" : "rgba(0,0,0,0.45)",
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  opacity: value === "popular" && !hasMetrics ? 0.45 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: F.sansBold,
                    fontSize: 12,
                    color: order === value ? C.ink : "#fff",
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {!posts && <ActivityIndicator style={{ marginTop: 120 }} color="#fff" />}
        {posts && ordered.length === 0 && (
          <Text style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center", marginTop: 140, paddingHorizontal: 40 }}>
            Nada publicado ainda — aprove um post e marque como publicado para ele aparecer aqui.
          </Text>
        )}

        {pageH > 0 && (
        <FlatList
          data={ordered}
          keyExtractor={(p) => p.story_id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={pageH}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ length: pageH, offset: pageH * index, index })}
          renderItem={({ item }) => (
            <View style={{ height: pageH, width, justifyContent: "center" }}>
              <SlidePager post={item} width={width} height={pageH - 130} />
              {/* rodapé do post */}
              <View style={{ position: "absolute", bottom: 18, left: 16, right: 16, gap: 6 }}>
                <Text
                  style={{ fontFamily: F.serifBold, fontSize: 17, lineHeight: 22, color: "#fff" }}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Text style={{ fontFamily: F.sansBold, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                    {VERTICAL_LABEL[item.vertical] ?? item.vertical} ·{" "}
                    {new Date(item.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </Text>
                  {item.ig && (
                    <Text style={{ fontFamily: F.sansBold, fontSize: 12, color: "rgba(255,255,255,0.9)" }}>
                      ♥ {item.ig.likes} · 💬 {item.ig.comments}
                    </Text>
                  )}
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/post/[story]",
                        params: { story: item.story_id, run: item.run_file },
                      })
                    }
                    hitSlop={8}
                  >
                    <Text style={{ fontFamily: F.sansBold, fontSize: 12, color: "#9DB8FF" }}>
                      Abrir post ›
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
        )}
      </View>
    </View>
  );
}
