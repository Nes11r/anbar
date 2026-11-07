"use client";
import { useEffect, useState } from "react";

function setCookie(k: string, v: string) {
  document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeControls() {
  const [theme, setTheme] = useState<string>("");
  const [dense, setDense] = useState(false);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme ?? "");
    setDense(document.documentElement.dataset.density === "compact");
  }, []);
  const cycle = () => {
    const next = theme === "" ? "dark" : theme === "dark" ? "light" : "";
    setTheme(next);
    if (next) document.documentElement.dataset.theme = next;
    else delete document.documentElement.dataset.theme;
    setCookie("theme", next || "system");
  };
  const toggleDense = () => {
    const n = !dense;
    setDense(n);
    if (n) document.documentElement.dataset.density = "compact";
    else delete document.documentElement.dataset.density;
    setCookie("density", n ? "compact" : "comfortable");
  };
  return (
    <div className="flex gap-1">
      <button type="button" className="btn btn-sm btn-ghost hidden sm:inline-flex" onClick={toggleDense} title="Cədvəl sıxlığı" aria-pressed={dense}>
        {dense ? "Sıx" : "Rahat"}
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={cycle} title="Mövzu: sistem / tünd / açıq" aria-label="Mövzunu dəyiş">
        {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}
      </button>
    </div>
  );
}
