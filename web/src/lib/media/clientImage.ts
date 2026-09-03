/**
 * Preparo das imagens no navegador, antes do upload.
 *
 * As imagens do ChatGPT vêm em PNG de 1,5 a 3MB cada; cinco delas estouram o
 * limite de corpo da requisição (o servidor respondia "Request Entity Too
 * Large" em texto puro, o que aparecia como erro de JSON no dashboard).
 *
 * Aqui cada arquivo é REDIMENSIONADO (nunca cortado — 2026-09-02: o corte
 * cego no cliente amputava elementos importantes; agora o recorte 4:5 é do
 * renderer, guiado pelo ponto focal que a análise calcula) e salvo como JPEG.
 * Payload cai para ~200-400KB e o servidor recebe a imagem INTEIRA.
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
    // só reduz (nunca amplia nem corta): cabe em 1440px no maior lado
    const MAX_SIDE = 1440;
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas indisponível neste navegador");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

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
