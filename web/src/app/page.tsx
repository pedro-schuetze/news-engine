/**
 * Raiz do site → Iris (decisão 2026-09-07: o Iris é o app principal).
 * O painel antigo continua idêntico em /dashboard, e o resto do app antigo
 * segue nas rotas de sempre (/hoje, /historico, /prontos, /gerar, /config) —
 * o link "App antigo" no topo do Iris leva até lá.
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/iris");
}
