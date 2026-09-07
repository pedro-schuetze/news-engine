"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { /* storage unavailable */ }
    setDark(next);
  }
  return <button type="button" aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"} onClick={toggle} aria-pressed={dark} className="theme-toggle">{dark ? "☼" : "☾"}</button>;
}
