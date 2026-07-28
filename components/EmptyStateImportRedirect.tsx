"use client";

import { useEffect } from "react";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export default function EmptyStateImportRedirect() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!document.querySelector(".empty-state")) return;

      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button");
      if (!button) return;

      const label = normalize(button.textContent ?? "");
      const isImportAction = label.includes("importar planilhas") || label === "importar dados";
      if (!isImportAction) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.location.assign("/importar");
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
