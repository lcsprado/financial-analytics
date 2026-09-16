"use client";

export type ImportAuditKind = "invoices" | "receipts";

export type ImportAuditEntry = {
  importedAt: string;
  importedBy: string;
  fileName: string;
};

export type ImportAuditState = {
  invoices?: ImportAuditEntry;
  receipts?: ImportAuditEntry;
};

export type ImportedFileEventDetail = {
  kind: ImportAuditKind;
  fileName: string;
  importedAt: string;
};

export const IMPORT_AUDIT_EVENT = "financial-analytics-import-audit-updated";
export const IMPORTED_FILE_EVENT = "financial-analytics-file-imported";

const IMPORT_AUDIT_KEY = "financial-analytics-import-audit-v1";

function validEntry(value: unknown): ImportAuditEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<ImportAuditEntry>;
  if (typeof candidate.importedAt !== "string" || typeof candidate.importedBy !== "string" || typeof candidate.fileName !== "string") return undefined;
  return {
    importedAt: candidate.importedAt,
    importedBy: candidate.importedBy,
    fileName: candidate.fileName,
  };
}

export function readImportAudit(): ImportAuditState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(IMPORT_AUDIT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      invoices: validEntry(parsed.invoices),
      receipts: validEntry(parsed.receipts),
    };
  } catch {
    return {};
  }
}

export function writeImportAudit(audit: ImportAuditState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IMPORT_AUDIT_KEY, JSON.stringify(audit));
  window.dispatchEvent(new CustomEvent<ImportAuditState>(IMPORT_AUDIT_EVENT, { detail: audit }));
}

export function importAuditFromMetadata(metadata: Record<string, unknown> | null | undefined): ImportAuditState {
  if (!metadata || typeof metadata !== "object") return {};
  const raw = metadata.import_audit;
  if (!raw || typeof raw !== "object") return {};
  const parsed = raw as Record<string, unknown>;
  return {
    invoices: validEntry(parsed.invoices),
    receipts: validEntry(parsed.receipts),
  };
}

export function importAuditMetadata(audit: ImportAuditState) {
  return { import_audit: audit };
}

export function formatImportAudit(entry?: ImportAuditEntry) {
  if (!entry) return "Última importação: ainda não registrada";
  const date = new Date(entry.importedAt);
  if (Number.isNaN(date.getTime())) return `Última importação: ${entry.fileName}`;
  const day = date.toLocaleDateString("pt-BR");
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Última importação: ${day} às ${time} • ${entry.importedBy}`;
}
