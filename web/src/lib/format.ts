const TZ = process.env.NEWS_TIMEZONE ?? "America/Sao_Paulo";

export function fmtLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function recency(iso: string | null | undefined): string {
  if (!iso) return "—";
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 0) return "agora";
  if (hours < 1) return `há ${Math.round(hours * 60)} min`;
  if (hours < 48) return `há ${Math.round(hours)}h`;
  return `há ${Math.round(hours / 24)} dias`;
}

export function fmtInt(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

export function fmtCost(usd: number | null): string {
  if (usd === null || usd === undefined) return "n/d";
  return `US$ ${usd.toFixed(4)}`;
}
