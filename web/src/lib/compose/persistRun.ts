/**
 * Grava um PipelineRun alterado pelo dashboard (ajuste de texto, post novo,
 * descarte) tanto no latest.json quanto no arquivo do histórico.
 *
 * Reaproveita as fontes de dados: filesystem em dev, commit via API em
 * produção. É o mesmo cuidado de coerência que a persistência de imagens tem
 * (Prontos e Histórico leem data/runs/, não o latest).
 */

import { DATA_MODE, dataSource, findRunFile, loadRun } from "../data";
import type { PipelineRun } from "../types";

export async function persistRun(
  run: PipelineRun,
  runFile: string,
  message: string,
): Promise<string[]> {
  const payload = JSON.stringify(run, null, 2);
  const isManual = runFile.startsWith("manual_");
  const targets: string[] = [];

  // latest só é alvo quando o run editado É o latest
  if (!isManual) {
    if (runFile === "latest") {
      targets.push("data/latest.json");
    } else {
      const latest = await loadRun("latest");
      if (latest?.run_id === run.run_id) targets.push("data/latest.json");
    }
  }
  const historyFile = runFile && runFile !== "latest" ? runFile : await findRunFile(run.run_id);
  if (historyFile) targets.push(`data/runs/${historyFile}`);

  const src = dataSource();
  for (const target of targets) {
    await src.writeTextFile(target, payload, message);
  }
  return targets;
}

/** Apaga um run manual descartado. */
export async function deleteManualRun(runFile: string): Promise<void> {
  if (!/^manual_[\w.-]+\.json$/.test(runFile)) {
    throw new Error("só runs manuais podem ser descartados");
  }
  await dataSource().deleteFile(`data/runs/${runFile}`, `discard: ${runFile}`);
}
