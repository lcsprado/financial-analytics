"use client";

import { ReactNode, useEffect, useState } from "react";
import { setReceiptClientAliasLinks } from "@/lib/analytics";
import {
  listReceiptClientLinks,
  RECEIPT_CLIENT_LINKS_EVENT,
} from "@/lib/receiptClientLinks";

export default function SandboxAnalyticsReady({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const refresh = async (firstLoad = false) => {
      try {
        const links = await listReceiptClientLinks();
        if (!active) return;
        setReceiptClientAliasLinks(links);
      } catch {
        if (!active) return;
        // Mantém o cálculo disponível mesmo se os vínculos não puderem ser carregados.
        setReceiptClientAliasLinks([]);
      } finally {
        if (active && firstLoad) setReady(true);
      }
    };

    void refresh(true);
    const onLinksChanged = () => { void refresh(false); };
    window.addEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinksChanged);

    return () => {
      active = false;
      window.removeEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinksChanged);
    };
  }, []);

  if (!ready) {
    return (
      <div className="sandbox-analytics-loading" role="status" aria-live="polite">
        <div className="sandbox-analytics-loading-card">
          <span className="sandbox-loading-dot" />
          <div>
            <strong>Preparando o painel</strong>
            <small>Sincronizando a base compartilhada e os vínculos...</small>
          </div>
        </div>
        <style jsx global>{`
          .sandbox-analytics-loading {
            min-height: calc(100vh - 40px);
            display: grid;
            place-items: center;
            padding: 24px;
            background: #f4f6fb;
          }
          .sandbox-analytics-loading-card {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 17px 19px;
            border: 1px solid #e3e7f0;
            border-radius: 15px;
            background: #fff;
            box-shadow: 0 14px 38px rgba(31,39,67,.07);
          }
          .sandbox-analytics-loading-card > div {
            display: grid;
            gap: 3px;
          }
          .sandbox-analytics-loading-card strong {
            color: #252c40;
            font-size: 13px;
          }
          .sandbox-analytics-loading-card small {
            color: #8b94a7;
            font-size: 10px;
          }
          .sandbox-loading-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #5d72f6;
            box-shadow: 0 0 0 6px rgba(93,114,246,.12);
            animation: sandboxPulse 1s ease-in-out infinite alternate;
          }
          @keyframes sandboxPulse {
            to { transform: scale(.72); opacity: .65; }
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
}
