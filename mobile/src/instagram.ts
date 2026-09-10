/**
 * Compartilhar no Instagram (fluxo manual; o publicar DIRETO via API é outro
 * botão). Revisão 2026-09-10 (feedback do Pedro: fotos duplicadas no rolo):
 * o share sheet recebe os arquivos direto do CACHE do app — nada é salvo no
 * rolo no caminho feliz. Só se o share falhar, oferecemos salvar no álbum
 * "Iris News" como plano B (aí sim pede permissão de fotos).
 */
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import Share from "react-native-share";
import { Linking } from "react-native";
import { absoluteUrl } from "./api";

export interface ShareProgress {
  step: string;
  done: number;
  total: number;
}

async function downloadAll(
  slides: { slide_number: number; render_url: string }[],
  onProgress: (p: ShareProgress) => void,
): Promise<string[]> {
  let done = 0;
  onProgress({ step: `Baixando ${slides.length} slides…`, done: 0, total: slides.length });
  return Promise.all(
    slides.map(async (s) => {
      const url = await absoluteUrl(s.render_url);
      const file = new File(Paths.cache, `iris-slide-${s.slide_number}.png`);
      if (file.exists) file.delete();
      const downloaded = await File.downloadFileAsync(url, file);
      done += 1;
      onProgress({ step: `Baixando slides… ${done}/${slides.length}`, done, total: slides.length });
      return downloaded.uri;
    }),
  );
}

export async function sendToInstagram(
  slides: { slide_number: number; render_url: string }[],
  caption: string,
  onProgress: (p: ShareProgress) => void,
): Promise<{ ok: boolean; message: string }> {
  const files = await downloadAll(slides, onProgress);
  await Clipboard.setStringAsync(caption);

  onProgress({ step: "Abrindo o compartilhamento…", done: slides.length, total: slides.length });
  try {
    await Share.open({ urls: files, failOnCancel: false });
    return {
      ok: true,
      message:
        "Legenda copiada. No Instagram os slides vão direto — confira a ordem e cole a legenda.",
    };
  } catch {
    // plano B: salvar no rolo (álbum Iris News) e abrir o Instagram
    try {
      const MediaLibrary = await import("expo-media-library/legacy");
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        return { ok: false, message: "Compartilhamento indisponível e sem acesso ao rolo." };
      }
      const assets: import("expo-media-library/legacy").Asset[] = [];
      for (const uri of files) assets.push(await MediaLibrary.createAssetAsync(uri));
      const album = await MediaLibrary.getAlbumAsync("Iris News");
      if (album) await MediaLibrary.addAssetsToAlbumAsync(assets, album, false);
      else await MediaLibrary.createAlbumAsync("Iris News", assets[0], false);
      const opened = await Linking.canOpenURL("instagram://app");
      if (opened) await Linking.openURL("instagram://app");
      return {
        ok: true,
        message:
          "Slides salvos no álbum Iris News e legenda copiada — selecione as fotos na ordem no Instagram.",
      };
    } catch {
      return { ok: false, message: "Não deu para compartilhar nem salvar os slides." };
    }
  }
}
