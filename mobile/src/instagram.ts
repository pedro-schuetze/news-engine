/**
 * Publicação manual fluida (decisão 2026-09-09: share primeiro, API depois):
 * baixa os slides renderizados, salva no álbum "Iris News" do rolo, copia a
 * legenda e abre o Instagram — lá é só escolher as fotos do álbum e colar.
 */
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library/legacy";
import { Linking } from "react-native";
import { absoluteUrl } from "./api";

export interface ShareProgress {
  step: string;
  done: number;
  total: number;
}

export async function sendToInstagram(
  slides: { slide_number: number; render_url: string }[],
  caption: string,
  onProgress: (p: ShareProgress) => void,
): Promise<{ ok: boolean; message: string }> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) {
    return { ok: false, message: "Sem acesso ao rolo — autorize em Ajustes do iPhone." };
  }

  const assets: MediaLibrary.Asset[] = [];
  for (let i = 0; i < slides.length; i++) {
    onProgress({ step: `Baixando slide ${i + 1}/${slides.length}…`, done: i, total: slides.length });
    const url = await absoluteUrl(slides[i].render_url);
    const file = new File(Paths.cache, `iris-slide-${slides[i].slide_number}.png`);
    if (file.exists) file.delete();
    const downloaded = await File.downloadFileAsync(url, file);
    assets.push(await MediaLibrary.createAssetAsync(downloaded.uri));
  }

  onProgress({ step: "Salvando no álbum…", done: slides.length, total: slides.length });
  const album = await MediaLibrary.getAlbumAsync("Iris News");
  if (album) await MediaLibrary.addAssetsToAlbumAsync(assets, album, false);
  else await MediaLibrary.createAlbumAsync("Iris News", assets[0], false);

  await Clipboard.setStringAsync(caption);

  const opened = await Linking.canOpenURL("instagram://app");
  if (opened) await Linking.openURL("instagram://app");
  return {
    ok: true,
    message: opened
      ? "Slides no rolo (álbum Iris News) e legenda copiada — no Instagram, crie o post e selecione as fotos na ordem."
      : "Slides no rolo (álbum Iris News) e legenda copiada. Abra o Instagram para publicar.",
  };
}
