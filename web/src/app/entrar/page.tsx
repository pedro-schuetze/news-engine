"use client";

/**
 * Porta de entrada da chave de acesso (uma vez por navegador). O middleware
 * exige a chave em toda escrita; leitura segue aberta. Ver middleware.ts.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EntrarPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function enter() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "não deu para validar a chave");
      }
      router.push("/iris");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center gap-5 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/iris-news.png" alt="Iris News" width={150} height={73} />
      <div>
        <h1 className="font-serif text-2xl font-semibold text-navy">Acesso da redação</h1>
        <p className="mt-2 text-[13px] text-ink-2">
          Cole a chave de acesso para aprovar, editar e publicar. A leitura é aberta.
        </p>
      </div>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && key && !busy && enter()}
        placeholder="chave de acesso"
        autoFocus
        className="w-full rounded-xl border border-line bg-panel px-4 py-2.5 text-center font-mono text-[14px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
      />
      <button
        onClick={enter}
        disabled={!key || busy}
        className="w-full rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-ink disabled:opacity-50"
      >
        {busy ? "Entrando…" : "Entrar"}
      </button>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </main>
  );
}
