/**
 * Porta de entrada do app (pedido do Pedro, 2026-09-09): a senha é pedida
 * ANTES de qualquer tela, uma única vez por aparelho — fica no chaveiro e as
 * próximas aberturas entram direto. É a mesma chave da página /entrar do
 * site; trocar depois em Ajustes.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { getBaseUrl, setAccessKey } from "../store";
import { C, F } from "../theme";

export default function Unlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function enter() {
    if (!key.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const base = await getBaseUrl();
      const res = await fetch(`${base}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Senha incorreta." : `Servidor respondeu ${res.status}.`);
        setBusy(false);
        return;
      }
      await setAccessKey(key.trim());
      onUnlocked();
    } catch {
      setError("Sem conexão com o servidor — confira a internet.");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: C.paper }}
    >
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 28, gap: 18 }}>
        <Image
          source={require("../../assets/iris-wordmark.png")}
          style={{ width: 210, height: 45 }}
          resizeMode="contain"
        />
        <Text
          style={{
            fontFamily: F.sans,
            fontSize: 13.5,
            color: C.ink2,
            textAlign: "center",
            lineHeight: 19,
          }}
        >
          A redação é fechada.{"\n"}Digite a senha para entrar — só na primeira vez.
        </Text>
        <TextInput
          value={key}
          onChangeText={setKey}
          onSubmitEditing={enter}
          placeholder="senha"
          placeholderTextColor={C.ink3}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          autoFocus
          returnKeyType="go"
          style={{
            width: "100%",
            maxWidth: 320,
            backgroundColor: C.panel,
            borderWidth: 1,
            borderColor: C.line,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontFamily: F.sansBold,
            fontSize: 16,
            color: C.ink,
            textAlign: "center",
          }}
        />
        <Pressable
          onPress={enter}
          disabled={!key.trim() || busy}
          style={({ pressed }) => ({
            width: "100%",
            maxWidth: 320,
            backgroundColor: pressed ? C.brandInk : C.navy,
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: "center",
            opacity: !key.trim() || busy ? 0.6 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ fontFamily: F.sansBold, fontSize: 15, color: "#fff" }}>Entrar</Text>
          )}
        </Pressable>
        {Boolean(error) && (
          <Text style={{ fontFamily: F.sansBold, fontSize: 13, color: C.danger, textAlign: "center" }}>
            {error}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
