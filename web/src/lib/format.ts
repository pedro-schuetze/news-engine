const TZ = process.env.NEWS_TIMEZONE ?? "America/Sao_Paulo";

function dt(iso: string): Date {
  return new Date(iso);
}

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
    }).format(dt(iso));
  } catch {
    return iso;
  }
}

export function fmtDayMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(
      dt(iso),
    );
  } catch {
    return iso;
  }
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(
      dt(iso),
    );
  } catch {
    return iso;
  }
}

/** "sábado, 30 de agosto" — cabeçalho de Posts de hoje */
export function fmtDayLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(dt(iso));
  } catch {
    return iso;
  }
}

export function recency(iso: string | null | undefined): string {
  if (!iso) return "—";
  const hours = (Date.now() - dt(iso).getTime()) / 3_600_000;
  if (hours < 0) return "agora";
  if (hours < 1) return `há ${Math.round(hours * 60)} min`;
  if (hours < 48) return `há ${Math.round(hours)}h`;
  return `há ${Math.round(hours / 24)} dias`;
}

export function isSameLocalDay(iso: string | null | undefined, ref: Date = new Date()): boolean {
  if (!iso) return false;
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short" });
  return f.format(dt(iso)) === f.format(ref);
}

export function fmtInt(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

export function fmtCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return "n/d";
  return `US$ ${usd.toFixed(4)}`;
}

export function pct(part: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((100 * part) / total)}%`;
}
