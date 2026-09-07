import NewsRefresh from "@/components/NewsRefresh";
import TodayPage from "@/components/IrisTodayPage";
import { loadSnapshot } from "@/lib/news";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await loadSnapshot();
  if (!snapshot) return <div className="iris-panel"><h1 className="mb-4 text-2xl">Vamos buscar as primeiras notícias.</h1><NewsRefresh /></div>;
  return <TodayPage snapshot={snapshot} />;
}
