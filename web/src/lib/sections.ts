/**
 * Rótulos de seção do Google News em PT-BR (os snapshots gravam em inglês).
 * Módulo SEM dependências de servidor: é importado por componentes client —
 * puxar isto de news.ts arrastava node:fs para o bundle do navegador (500).
 */
const SECTION_PT: Record<string, string> = {
  "Top stories": "Principais",
  Brazil: "Brasil",
  World: "Mundo",
  Business: "Negócios",
  Technology: "Tecnologia",
  Entertainment: "Entretenimento",
  Sports: "Esportes",
  Health: "Saúde",
};

export function sectionLabelPt(label: string): string {
  return SECTION_PT[label] ?? label;
}
