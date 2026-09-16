"use client";

import { useEffect } from "react";
import { formatImportAudit, IMPORT_AUDIT_EVENT, readImportAudit, type ImportAuditKind } from "@/lib/importAudit";

function resolveKind(card: Element): ImportAuditKind | null {
  const title = card.querySelector("h3")?.textContent ?? "";
  if (title.includes("FINR020")) return "invoices";
  if (title.includes("Conciliação")) return "receipts";
  return null;
}

function refreshImportAuditStamps() {
  const audit = readImportAudit();
  document.querySelectorAll(".upload-grid .upload-card").forEach((card) => {
    const kind = resolveKind(card);
    if (!kind) return;

    const content = Array.from(card.children).find((child) => child.querySelector?.("h3"));
    if (!(content instanceof HTMLElement)) return;

    let stamp = content.querySelector<HTMLElement>("[data-import-audit]");
    if (!stamp) {
      stamp = document.createElement("span");
      stamp.className = "import-audit-stamp";
      stamp.dataset.importAudit = kind;
      content.appendChild(stamp);
    }

    const text = formatImportAudit(audit[kind]);
    if (stamp.textContent !== text) stamp.textContent = text;
  });
}

export default function ImportAuditEnhancer() {
  useEffect(() => {
    refreshImportAuditStamps();

    const handleAuditUpdate = () => refreshImportAuditStamps();
    const observer = new MutationObserver(() => refreshImportAuditStamps());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener(IMPORT_AUDIT_EVENT, handleAuditUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener(IMPORT_AUDIT_EVENT, handleAuditUpdate);
    };
  }, []);

  return <style jsx global>{`
    .import-audit-stamp {
      display: block;
      margin-top: 8px;
      color: #687089;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.35;
    }
  `}</style>;
}
