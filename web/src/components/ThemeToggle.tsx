"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }
  return <button type="button" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={toggle} className="theme-toggle">{dark ? "☼" : "☾"}</button>;
}
