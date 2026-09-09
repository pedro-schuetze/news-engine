/**
 * Config do app: URL do servidor (AsyncStorage) e chave de acesso
 * (SecureStore — é credencial de escrita, não vai em storage comum).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const DEFAULT_BASE = "https://news-engine-six.vercel.app";
const KEY_BASE = "iris.base_url";
const KEY_ACCESS = "iris.access_key";

let cachedBase: string | null = null;
let cachedKey: string | null = null;

export async function getBaseUrl(): Promise<string> {
  if (cachedBase) return cachedBase;
  const stored = await AsyncStorage.getItem(KEY_BASE);
  cachedBase = (stored ?? DEFAULT_BASE).replace(/\/$/, "");
  return cachedBase;
}

export async function setBaseUrl(url: string): Promise<void> {
  cachedBase = url.trim().replace(/\/$/, "") || DEFAULT_BASE;
  await AsyncStorage.setItem(KEY_BASE, cachedBase);
}

export async function getAccessKey(): Promise<string> {
  if (cachedKey !== null) return cachedKey;
  cachedKey = (await SecureStore.getItemAsync(KEY_ACCESS)) ?? "";
  return cachedKey;
}

export async function setAccessKey(key: string): Promise<void> {
  cachedKey = key.trim();
  await SecureStore.setItemAsync(KEY_ACCESS, cachedKey);
}
