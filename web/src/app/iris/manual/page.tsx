import { redirect } from "next/navigation";
import ComposeForm from "@/components/IrisComposeForm";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const params=await searchParams;
  if(params.run) redirect(`/iris/editor?run=${encodeURIComponent(params.run)}`);
  return <main className="mx-auto max-w-3xl"><header className="iris-page-heading"><div><p className="microlabel">Criação manual</p><h1>Uma pauta sua.</h1><p>Adicione os links das matérias. O Iris lê o conteúdo e prepara um carrossel para você revisar no editor.</p></div></header><div className="iris-panel mt-5"><ComposeForm currentRun="" /></div></main>;
}
