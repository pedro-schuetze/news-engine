/**
 * Publicação manual fluida (decisão 2026-09-09: share primeiro, API depois).
 *
 * Fluxo (revisto após o teste do Pedro no build 4 — "deveria abrir o insta
 * com o post iniciado" e "demora infinito"):
 *   1. baixa os slides EM PARALELO (era sequencial — 5x mais lento);
 *   2. salva no álbum "Iris News" do rolo (garantia + fallback);
 *   3. copia a legenda;
 *   4. abre o SHARE SHEET nativo com as N imagens — tocar em Instagram
 *      inicia o post já com os slides carregados.
 */
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library/legacy";
import Share from "react-native-share";
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

  // 1. download paralelo (os PNGs ficam pré-renderizados no CDN; o primeiro
  // acesso a um slide recém-editado ainda pode renderizar ao vivo no servidor)
  let done = 0;
  onProgress({ step: `Baixando ${slides.length} slides…`, done: 0, total: slides.length });
  const files = await Promise.all(
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

  // 2. rolo (álbum Iris News)
  onProgress({ step: "Salvando no rolo…", done: slides.length, total: slides.length });
  const assets: MediaLibrary.Asset[] = [];
  for (const uri of files) assets.push(await MediaLibrary.createAssetAsync(uri));
  const album = await MediaLibrary.getAlbumAsync("Iris News");
  if (album) await MediaLibrary.addAssetsToAlbumAsync(assets, album, false);
  else await MediaLibrary.createAlbumAsync("Iris News", assets[0], false);

  // 3. legenda
  await Clipboard.setStringAsync(caption);

  // 4. share sheet com as imagens (Instagram = post iniciado com os slides)
  onProgress({ step: "Abrindo o compartilhamento…", done: slides.length, total: slides.length });
  try {
    await Share.open({ urls: files, failOnCancel: false });
    return {
      ok: true,
      message:
        "Legenda copiada. No Instagram: os slides já vão carregados — confira a ordem e cole a legenda.",
    };
  } catch {
    // fallback: abre o Instagram; as fotos estão no álbum Iris News
    const opened = await Linking.canOpenURL("instagram://app");
    if (opened) await Linking.openURL("instagram://app");
    return {
      ok: true,
      message:
        "Slides no álbum Iris News do rolo e legenda copiada — crie o post no Instagram selecionando as fotos na ordem.",
    };
  }
}
