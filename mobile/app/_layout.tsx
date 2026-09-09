import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import Unlock from "../src/components/Unlock";
import { getAccessKey } from "../src/store";
import { C } from "../src/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    "Fraunces-Black": require("../assets/fonts/Fraunces-Black.ttf"),
    "Fraunces-Bold": require("../assets/fonts/Fraunces-Bold.ttf"),
    "Jakarta-Medium": require("../assets/fonts/Jakarta-Medium.ttf"),
    "Jakarta-Bold": require("../assets/fonts/Jakarta-Bold.ttf"),
    "Jakarta-ExtraBold": require("../assets/fonts/Jakarta-ExtraBold.ttf"),
  });

  // porta de entrada: sem chave salva, o app abre pedindo a senha (uma vez
  // por aparelho — depois fica no chaveiro e entra direto)
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  useEffect(() => {
    getAccessKey().then((k) => setUnlocked(Boolean(k)));
  }, []);

  useEffect(() => {
    if (loaded && unlocked !== null) SplashScreen.hideAsync();
  }, [loaded, unlocked]);
  if (!loaded || unlocked === null) return null;

  if (!unlocked) {
    return (
      <>
        <StatusBar style="dark" />
        <Unlock onUnlocked={() => setUnlocked(true)} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.paper },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="post/[story]" options={{ presentation: "card" }} />
      </Stack>
    </>
  );
}
