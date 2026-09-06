import TodayPage from "@/components/TodayPage";
import { loadSnapshot } from "@/lib/news";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await loadSnapshot();
  if (!snapshot) return <div className="p-8">No front-page snapshot is available yet.</div>;
  return <TodayPage snapshot={snapshot} />;
}
