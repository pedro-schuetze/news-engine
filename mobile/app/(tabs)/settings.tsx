/** Ajustes — servidor e chave de acesso (a mesma do site, página /entrar). */
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getAccessKey, getBaseUrl, setAccessKey, setBaseUrl } from "../../src/store";
import { C, F } from "../../src/theme";

export default function SettingsScreen() {
  const [base, setBase] = useState("");
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    getBaseUrl().then(setBase);
    getAccessKey().then(setKey);
  }, []);

  async function save() {
    setStatus("");
    await setBaseUrl(base);
    await setAccessKey(key);
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      setStatus(res.ok ? "✓ conectado — chave aceita" : "chave recusada pelo servidor");
    } catch {
      setStatus("servidor inacessível — confira a URL");
    }
  }

  const label = { fontFamily: F.sansBold, fontSize: 12, color: C.ink2, letterSpacing: 0.5 } as const;
  const input = {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: F.sans,
    fontSize: 14,
    color: C.ink,
  } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
        <Text style={{ fontFamily: F.serif, fontSize: 26, color: C.navy }}>Ajustes</Text>
        <View style={{ gap: 7 }}>
          <Text style={label}>SERVIDOR</Text>
          <TextInput
            value={base}
            onChangeText={setBase}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={input}
          />
        </View>
        <View style={{ gap: 7 }}>
          <Text style={label}>CHAVE DE ACESSO</Text>
          <TextInput
            value={key}
            onChangeText={setKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="a mesma chave da página /entrar"
            placeholderTextColor={C.ink3}
            style={input}
          />
          <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.ink3 }}>
            Necessária para criar, editar, aprovar e publicar. Fica no chaveiro do aparelho.
          </Text>
        </View>
        <Pressable
          onPress={save}
          style={({ pressed }) => ({
            backgroundColor: pressed ? C.brandInk : C.brand,
            borderRadius: 12,
            paddingVertical: 13,
            alignItems: "center",
          })}
        >
          <Text style={{ fontFamily: F.sansBold, fontSize: 14, color: "#fff" }}>
            Salvar e testar conexão
          </Text>
        </Pressable>
        {Boolean(status) && (
          <Text
            style={{
              fontFamily: F.sansBold,
              fontSize: 13,
              color: status.startsWith("✓") ? C.ok : C.danger,
              textAlign: "center",
            }}
          >
            {status}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
