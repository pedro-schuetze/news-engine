/**
 * Preparo das imagens no navegador, antes do upload.
 *
 * As imagens do ChatGPT vêm em PNG de 1,5 a 3MB cada; cinco delas estouram o
 * limite de corpo da requisição (o servidor respondia "Request Entity Too
 * Large" em texto puro, o que aparecia como erro de JSON no dashboard).
 *
 * Aqui cada arquivo é redesenhado no tamanho exato do slide (1080x1350, corte
 * "cover" centralizado) e salvo como JPEG. Isso corta o payload para ~200KB
 * por imagem e ainda garante o formato que a análise de contraste do servidor
 * sabe ler.
 */

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export interface PreparedImage {
  file: File;
  originalKB: number;
  finalKB: number;
}

export async function prepareForUpload(file: File, quality = 0.86): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SLIDE_W;
    canvas.height = SLIDE_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas indisponível neste navegador");

    // corte "cover": preenche o quadro sem distorcer, centralizado
    const scale = Math.max(SLIDE_W / bitmap.width, SLIDE_H / bitmap.height);
    const drawW = bitmap.width * scale;
    const drawH = bitmap.height * scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, (SLIDE_W - drawW) / 2, (SLIDE_H - drawH) / 2, drawW, drawH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("não consegui converter a imagem");

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      file: new File([blob], name, { type: "image/jpeg" }),
      originalKB: Math.round(file.size / 1024),
      finalKB: Math.round(blob.size / 1024),
    };
  } finally {
    bitmap.close();
  }
}
