export default function StatBlock({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5">
      <div className="microlabel">{label}</div>
      <div
        className={`mt-1.5 text-[22px] leading-tight font-semibold tracking-tight ${
          accent ? "text-brand-ink" : "text-navy"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}
