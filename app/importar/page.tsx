"use client";

import { ArrowLeft, CheckCircle2, FileSpreadsheet, LayoutDashboard, RefreshCcw, UploadCloud, X } from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { parseInvoiceWorkbook, parseReceiptWorkbook } from "@/lib/parsers";
import {
  parseChannelWorkbook,
} from "@/components/ReceiptChannelSummary";
import {
  CHANNEL_DATA_EVENT,
  hasStorageConsent,
  loadAnalysisState,
  saveAnalysisState,
  saveChannelPayload,
  saveImportedFile,
  setStorageConsent,
  STORAGE_CONSENT_EVENT,
} from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

const LEGACY_STORAGE_KEY = "financial-analytics-director-workbook-v1";
const LEGACY_MAIN_STORAGE_KEY = "financial-analytics-data-v1";

type ImportKind = "invoices" | "receipts";

type LegacySnapshot = {
  fileName?: string;
};

function removeLegacyDirectorState() {
  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) return;

  try {
    const legacy = JSON.parse(legacyRaw) as LegacySnapshot;
    const mainRaw = window.localStorage.getItem(LEGACY_MAIN_STORAGE_KEY);
    const main = mainRaw ? JSON.parse(mainRaw) as ImportState : null;

    if (legacy.fileName && main?.invoiceFileName === legacy.fileName) {
      window.localStorage.removeItem(LEGACY_MAIN_STORAGE_KEY);
    }
  } catch {
    // O estado legado inválido pode ser descartado sem afetar as bases normais.
  } finally {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

function UploadCard({
  kind,
  title,
  description,
  fileName,
  loading,
  onFile,
}: {
  kind: ImportKind;
  title: string;
  description: string;
  fileName?: string;
  loading: boolean;
  onFile: (kind: ImportKind, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(kind, file);
  };

  return (
    <div
      className={`upload-card ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          if (file) onFile(kind, file);
          event.target.value = "";
        }}
      />
      <span className="upload-icon"><FileSpreadsheet size={28} /></span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {fileName && <span className="file-pill"><CheckCircle2 size={14} /> {fileName}</span>}
      </div>
      <button className="secondary-button" type="button" disabled={loading}>
        {loading ? <><RefreshCcw className="spin" size={16} /> Processando</> : "Selecionar arquivo"}
      </button>
    </div>
  );
}

export default function ImportarPage() {
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const [loading, setLoading] = useState<ImportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageConsent, setStorageConsentState] = useState(false);

  useEffect(() => {
    removeLegacyDirectorState();
    setStorageConsentState(hasStorageConsent());
    void loadAnalysisState().then((stored) => {
      if (stored) setData(stored);
    });
    const handleConsent = () => setStorageConsentState(hasStorageConsent());
    window.addEventListener(STORAGE_CONSENT_EVENT, handleConsent);
    return () => window.removeEventListener(STORAGE_CONSENT_EVENT, handleConsent);
  }, []);

  async function handleFile(kind: ImportKind, file: File) {
    setLoading(kind);
    setError(null);
    setNotice(null);

    try {
      const current = hasStorageConsent() ? (await loadAnalysisState()) ?? data : data;
      let next: ImportState;

      if (kind === "invoices") {
        const invoices = await parseInvoiceWorkbook(file);
        next = {
          ...current,
          invoices,
          invoiceFileName: file.name,
        };
        await saveImportedFile("invoices", file);
        setNotice(`${invoices.length.toLocaleString("pt-BR")} emissões importadas com sucesso.`);
      } else {
        const [receipts, channels] = await Promise.all([
          parseReceiptWorkbook(file),
          parseChannelWorkbook(file),
        ]);
        next = {
          ...current,
          receipts,
          receiptFileName: file.name,
        };
        await Promise.all([
          saveImportedFile("receipts", file),
          saveChannelPayload(channels),
        ]);
        window.dispatchEvent(new Event(CHANNEL_DATA_EVENT));
        setNotice(
          `${receipts.length.toLocaleString("pt-BR")} recebimentos e `
          + `${channels.entries.length.toLocaleString("pt-BR")} lançamentos Cielo/PIX importados com sucesso.`,
        );
      }

      await saveAnalysisState(next);
      setData(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível processar o arquivo.");
    } finally {
      setLoading(null);
    }
  }

  const hasData = data.invoices.length > 0 || data.receipts.length > 0;

  return (
    <main className="standalone-import-page">
      <div className="standalone-import-header">
        <button className="ghost-button" type="button" onClick={() => window.location.assign("/")}>
          <ArrowLeft size={17} /> Voltar
        </button>
        <div>
          <span>FINANCIAL ANALYTICS</span>
          <h1>Importação das bases</h1>
        </div>
      </div>

      <div className="content-area standalone-import-content">
        {error && <div className="alert error"><X size={18} /> {error}<button onClick={() => setError(null)}>Fechar</button></div>}
        {notice && <div className="alert success"><CheckCircle2 size={18} /> {notice}<button onClick={() => setNotice(null)}>Fechar</button></div>}

        <section className="import-page">
          <div className="import-intro">
            <span className="eyebrow">ATUALIZAÇÃO DAS BASES</span>
            <h2>Importe as duas planilhas do processo financeiro.</h2>
            <p>Você pode carregar apenas uma base ou as duas. Os arquivos são processados localmente no navegador.</p>
          </div>

          <div className="upload-grid">
            <UploadCard
              kind="invoices"
              title="1. FINR020 — Emissões"
              description="Colunas esperadas: Data da Emissão, NF Eletr, Valor, Líquido e Nome Cliente."
              fileName={data.invoiceFileName}
              loading={loading === "invoices"}
              onFile={handleFile}
            />
            <UploadCard
              kind="receipts"
              title="2. Conciliação — Recebimentos"
              description="Abas mensais com blocos por banco e a linha de início RECEBIMENTOS."
              fileName={data.receiptFileName}
              loading={loading === "receipts"}
              onFile={handleFile}
            />
          </div>

          <label className="offline-storage-choice">
            <input
              type="checkbox"
              checked={storageConsent}
              onChange={(event) => {
                setStorageConsent(event.target.checked);
                setStorageConsentState(event.target.checked);
                if (event.target.checked && (data.invoices.length || data.receipts.length)) {
                  void saveAnalysisState(data);
                }
              }}
            />
            <span>
              <strong>Guardar planilhas e análise neste dispositivo</strong>
              <small>Necessário para recuperar esta importação ao abrir o dashboard. Validade de até 30 dias.</small>
            </span>
          </label>

          <div className="import-results">
            <div><span className="result-icon violet"><FileSpreadsheet /></span><strong>{data.invoices.length.toLocaleString("pt-BR")}</strong><span>emissões carregadas</span></div>
            <div><span className="result-icon green"><UploadCloud /></span><strong>{data.receipts.length.toLocaleString("pt-BR")}</strong><span>recebimentos carregados</span></div>
          </div>

          <div className="privacy-note">
            <CheckCircle2 size={18} />
            <div><strong>Seus dados permanecem no navegador.</strong><span>Nenhuma planilha é enviada para um servidor.</span></div>
          </div>

          <div className="import-actions">
            <button className="primary-button" type="button" onClick={() => window.location.assign("/")} disabled={!hasData || !storageConsent}>
              <LayoutDashboard size={17} /> Abrir dashboard
            </button>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .standalone-import-page {
          min-height: 100vh;
          background: #f5f7fc;
          color: #171d2d;
        }
        .standalone-import-header {
          min-height: 84px;
          padding: 18px clamp(18px, 4vw, 54px);
          background: #fff;
          border-bottom: 1px solid #e9edf5;
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .standalone-import-header > div span {
          color: #8a93a8;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .14em;
        }
        .standalone-import-header h1 {
          margin: 3px 0 0;
          font-size: 24px;
        }
        .standalone-import-content {
          max-width: 1180px;
          margin: 0 auto;
          padding: 34px clamp(18px, 4vw, 54px) 54px;
        }
        .standalone-import-page .import-actions {
          justify-content: flex-end;
        }
        @media (max-width: 640px) {
          .standalone-import-header {
            align-items: flex-start;
          }
          .standalone-import-header h1 {
            font-size: 20px;
          }
        }
      `}</style>
    </main>
  );
}
