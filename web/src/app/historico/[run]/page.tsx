import { redirect } from "next/navigation";
export default async function Page({params}: {params: Promise<{run:string}>}) { const {run}=await params; redirect(`/iris/editor?run=${encodeURIComponent(run)}`); }
