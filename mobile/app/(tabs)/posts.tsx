/** Posts — tudo que existe, com estado; tocar abre o editor. */
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { absoluteUrl, api, type PostListItem } from "../../src/api";
import PublishedFeed from "../../src/components/PublishedFeed";
import { C, F, VERTICAL_LABEL } from "../../src/theme";

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "rascunho", color: C.ink2, bg: C.panel2 },
  approved: { label: "✓ aprovado", color: C.brandInk, bg: C.brandSoft },
  published: { label: "✓ publicado", color: C.ok, bg: "#E7F3EE" },
  rejected: { label: "arquivado", color: C.ink3, bg: C.panel2 },
};

function Row({ post, onPress }: { post: PostListItem; onPress: () => void }) {
  const [cover, setCover] = useState<string | null>(null);
  useState(() => {
    if (post.cover_url) absoluteUrl(post.cover_url).then(setCover);
  });
  const st = STATUS[post.status] ?? STATUS.draft;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 12,
        backgroundColor: pressed ? C.panel2 : C.panel,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.line,
        padding: 10,
      })}
    >
      <View
        style={{
          width: 56,
          height: 70,
          borderRadius: 8,
          backgroundColor: C.navy,
          overflow: "hidden",
        }}
      >
        {cover && <Image source={{ uri: cover }} style={{ flex: 1 }} contentFit="cover" />}
      </View>
      <View style={{ flex: 1, gap: 5, justifyContent: "center" }}>
        <Text style={{ fontFamily: F.serifBold, fontSize: 14.5, lineHeight: 19, color: C.ink }} numberOfLines={2}>
          {post.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <View style={{ backgroundColor: st.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontFamily: F.sansBold, fontSize: 10, color: st.color }}>{st.label}</Text>
          </View>
          <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.ink3 }}>
            {VERTICAL_LABEL[post.vertical] ?? post.vertical}
            {post.has_content
              ? ` · ${post.slide_count} slides${post.images_done ? " · fotos ok" : " · faltam fotos"}`
              : " · só triagem"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function PostsScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostListItem[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"feed" | "all" | "approved">("feed");

  const load = useCallback(async () => {
    try {
      setError("");
      const r = await api.posts();
      setPosts(r.posts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const shown = (posts ?? []).filter((p) =>
    filter === "all" ? p.status !== "rejected" : p.status === "approved",
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }} edges={["top"]}>
      <View style={{ paddingHorizontal: 18, paddingTop: 12, gap: 10 }}>
        <Text style={{ fontFamily: F.serif, fontSize: 26, color: C.navy }}>Posts</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {(
            [
              ["feed", "▶ Feed"],
              ["all", "Todos"],
              ["approved", "Aprovados"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={{
                backgroundColor: filter === value ? C.navy : C.panel,
                borderWidth: 1,
                borderColor: filter === value ? C.navy : C.line,
                borderRadius: 999,
                paddingHorizontal: 13,
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: F.sansBold,
                  fontSize: 12,
                  color: filter === value ? "#fff" : C.ink2,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {filter === "feed" ? (
        <View style={{ flex: 1, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6 }}>
          <PublishedFeed />
        </View>
      ) : (
        <>
      {!posts && !error && <ActivityIndicator style={{ marginTop: 60 }} color={C.brand} />}
      {Boolean(error) && (
        <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.danger, marginTop: 40, textAlign: "center" }}>
          {error}
        </Text>
      )}
      <FlatList
        data={shown}
        keyExtractor={(p) => `${p.run_file}-${p.story_id}`}
        contentContainerStyle={{ padding: 18, gap: 10 }}
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
        renderItem={({ item }) => (
          <Row
            post={item}
            onPress={() =>
              router.push({
                pathname: "/post/[story]",
                params: { story: item.story_id, run: item.run_file },
              })
            }
          />
        )}
        ListEmptyComponent={
          posts ? (
            <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.ink3, textAlign: "center", marginTop: 40 }}>
              Nada por aqui ainda.
            </Text>
          ) : null
        }
      />
        </>
      )}
    </SafeAreaView>
  );
}
