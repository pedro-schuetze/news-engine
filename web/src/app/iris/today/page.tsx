import TodayPage from "@/components/IrisTodayPage";
import { loadSnapshot } from "@/lib/news";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await loadSnapshot();
  if (!snapshot) return <div className="p-8">Nenhuma capa coletada ainda — a primeira chega em até 3 horas.</div>;
  return <TodayPage snapshot={snapshot} />;
}
