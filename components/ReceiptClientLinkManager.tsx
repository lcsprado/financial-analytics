"use client";

import { Link2, Search, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { normalizeClientText } from "@/lib/clientNames";
import {
  createReceiptClientGroup,
  deleteReceiptClientGroup,
  listReceiptClientLinks,
  receiptAliasKey,
  RECEIPT_CLIENT_LINKS_EVENT,
  type ReceiptClientLink,
} from "@/lib/receiptClientLinks";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import { ANALYSIS_DATA_EVENT, loadAnalysisState, OFFLINE_DATA_CLEARED_EVENT } from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

function sourceReceiptName(description: string, hint: string) {
  return canonicalReceiptClientName(description) || canonicalReceiptClientName(hint);
}

export default function ReceiptClientLinkManager() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [isReceipts, setIsReceipts] = useState(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const [links, setLinks] = useState<ReceiptClientLink[]>([]);
  const [tab, setTab] = useState<"unlinked" | "linked">("unlinked");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [canonical, setCanonical] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reloadLinks = async () => {
    try {
      setLinks(await listReceiptClientLinks());
    } catch {
      setError("Não foi possível carregar os vínculos salvos.");
    }
  };

  useEffect(() => {
    let active = true;
    void loadAnalysisState().then((stored) => {
      if (active && stored) setData(stored);
    });
    void reloadLinks();

    const onData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) setData(detail);
    };
    const onLinks = () => { void reloadLinks(); };
    const onClear = () => setData({ invoices: [], receipts: [] });

    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    window.addEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinks);
    window.addEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
      window.removeEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinks);
      window.removeEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const nextTarget = document.querySelector<HTMLElement>(".topbar-actions");
      setPortalTarget((current) => current === nextTarget ? current : nextTarget);
      const title = document.querySelector<HTMLElement>(".topbar-title h1")?.textContent?.trim().toLowerCase() || "";
      const nextIsReceipts = title === "recebimentos";
      setIsReceipts((current) => current === nextIsReceipts ? current : nextIsReceipts);
    };

    const scheduleSync = () => window.setTimeout(sync, 0);
    sync();
    document.addEventListener("click", scheduleSync, true);
    const timer = window.setInterval(sync, 700);
    return () => {
      document.removeEventListener("click", scheduleSync, true);
      window.clearInterval(timer);
    };
  }, []);

  const currentNames = useMemo(() => {
    const map = new Map<string, string>();
    data.receipts.forEach((receipt) => {
      const name = sourceReceiptName(receipt.description, receipt.clientHint);
      const key = receiptAliasKey(name);
      if (key && name && !map.has(key)) map.set(key, name);
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data.receipts]);

  const linkedKeys = useMemo(() => new Set(links.map((link) => link.alias_key)), [links]);
  const unlinked = useMemo(() => currentNames.filter((name) => !linkedKeys.has(receiptAliasKey(name))), [currentNames, linkedKeys]);

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; canonical: string; aliases: string[] }>();
    links.forEach((link) => {
      const group = map.get(link.group_id) ?? { id: link.group_id, canonical: link.canonical_name, aliases: [] };
      if (!group.aliases.includes(link.alias_name)) group.aliases.push(link.alias_name);
      map.set(link.group_id, group);
    });
    return [...map.values()].sort((a, b) => a.canonical.localeCompare(b.canonical, "pt-BR"));
  }, [links]);

  const normalizedQuery = normalizeClientText(query);
  const visibleUnlinked = unlinked.filter((name) => !normalizedQuery || normalizeClientText(name).includes(normalizedQuery));
  const visibleGroups = groups.filter((group) => !normalizedQuery
    || normalizeClientText(group.canonical).includes(normalizedQuery)
    || group.aliases.some((alias) => normalizeClientText(alias).includes(normalizedQuery)));

  const toggle = (name: string) => {
    setSelected((current) => {
      const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
      if (!next.length) setCanonical("");
      else if (!next.includes(canonical)) setCanonical(next[0]);
      return next;
    });
  };

  const save = async () => {
    if (selected.length < 2 || !canonical) {
      setError("Selecione pelo menos dois nomes e escolha o nome principal.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createReceiptClientGroup(canonical, selected);
      setSelected([]);
      setCanonical("");
      await reloadLinks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o vínculo.");
    } finally {
      setBusy(false);
    }
  };

  const removeGroup = async (groupId: string) => {
    if (!window.confirm("Desfazer este vínculo? Os nomes voltarão a ser tratados separadamente quando não houver outra regra automática segura.")) return;
    setBusy(true);
    setError("");
    try {
      await deleteReceiptClientGroup(groupId);
      await reloadLinks();
    } catch {
      setError("Não foi possível desfazer o vínculo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {portalTarget && isReceipts ? createPortal(
        <button type="button" className="receipt-client-link-trigger-v17" onClick={() => { setOpen(true); setError(""); }}>
          <Link2 size={16} /> Vincular clientes
          {unlinked.length ? <b>{unlinked.length}</b> : null}
        </button>,
        portalTarget,
      ) : null}

      {open ? createPortal(
        <div className="receipt-client-link-backdrop-v17" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setOpen(false); }}>
          <section className="receipt-client-link-modal-v17">
            <header>
              <div><span>RECEBIMENTOS</span><h2>Cadastro e vínculo de clientes</h2><p>Os nomes vêm da planilha importada. Seus vínculos ficam salvos e têm prioridade nas próximas importações.</p></div>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}><X size={18} /></button>
            </header>

            <div className="receipt-client-link-tabs-v17">
              <button type="button" className={tab === "unlinked" ? "active" : ""} onClick={() => setTab("unlinked")}>Não vinculados <b>{unlinked.length}</b></button>
              <button type="button" className={tab === "linked" ? "active" : ""} onClick={() => setTab("linked")}>Vinculados <b>{groups.length}</b></button>
              <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" /></label>
            </div>

            {error ? <div className="receipt-client-link-error-v17">{error}</div> : null}

            {tab === "unlinked" ? (
              <div className="receipt-client-link-body-v17">
                <div className="receipt-client-link-list-v17">
                  {visibleUnlinked.map((name) => (
                    <label key={receiptAliasKey(name)} className={selected.includes(name) ? "selected" : ""}>
                      <input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)} />
                      <span>{name}</span>
                    </label>
                  ))}
                  {!visibleUnlinked.length ? <div className="receipt-client-link-empty-v17">Nenhum nome não vinculado encontrado.</div> : null}
                </div>
                <aside>
                  <span>CRIAR VÍNCULO</span>
                  <strong>{selected.length} nomes selecionados</strong>
                  <p>Escolha qual nome será exibido como principal. Os demais passam a apontar para ele.</p>
                  <label><small>Nome principal</small><select value={canonical} onChange={(event) => setCanonical(event.target.value)} disabled={!selected.length}><option value="">Selecione</option>{selected.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
                  <button type="button" onClick={() => void save()} disabled={busy || selected.length < 2 || !canonical}>{busy ? "Salvando..." : "Unificar selecionados"}</button>
                  {selected.length ? <button type="button" className="secondary" onClick={() => { setSelected([]); setCanonical(""); }} disabled={busy}>Limpar seleção</button> : null}
                </aside>
              </div>
            ) : (
              <div className="receipt-client-link-groups-v17">
                {visibleGroups.map((group) => (
                  <article key={group.id}>
                    <div><span>NOME PRINCIPAL</span><strong>{group.canonical}</strong><small>{group.aliases.length} nomes vinculados</small></div>
                    <ul>{group.aliases.map((alias) => <li key={`${group.id}-${alias}`} className={receiptAliasKey(alias) === receiptAliasKey(group.canonical) ? "canonical" : ""}>{alias}</li>)}</ul>
                    <button type="button" onClick={() => void removeGroup(group.id)} disabled={busy}><Trash2 size={14} /> Desfazer vínculo</button>
                  </article>
                ))}
                {!visibleGroups.length ? <div className="receipt-client-link-empty-v17">Nenhum vínculo cadastrado.</div> : null}
              </div>
            )}
          </section>
        </div>,
        document.body,
      ) : null}

      <style jsx global>{`
        .receipt-client-link-trigger-v17{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 12px;border:1px solid #dfe4ee;border-radius:9px;background:#fff;color:#46516a;font-size:11px;font-weight:800;cursor:pointer}.receipt-client-link-trigger-v17:hover{border-color:#aeb9f7;color:#5367df}.receipt-client-link-trigger-v17 b{display:grid;min-width:19px;height:19px;place-items:center;padding:0 5px;border-radius:999px;background:#eef0ff;color:#5367df;font-size:9px}.receipt-client-link-backdrop-v17{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;background:rgba(21,26,39,.45);backdrop-filter:blur(3px)}.receipt-client-link-modal-v17{width:min(1040px,96vw);max-height:88vh;overflow:hidden;border:1px solid #e1e5ee;border-radius:18px;background:#fff;box-shadow:0 28px 80px rgba(22,29,50,.2);color:#252c40}.receipt-client-link-modal-v17>header{display:flex;justify-content:space-between;gap:20px;padding:20px 22px 16px;border-bottom:1px solid #edf0f5}.receipt-client-link-modal-v17>header span{color:#5d72f6;font-size:9px;font-weight:900;letter-spacing:.09em}.receipt-client-link-modal-v17>header h2{margin:4px 0 5px;font-size:21px}.receipt-client-link-modal-v17>header p{margin:0;color:#858ea1;font-size:10.5px}.receipt-client-link-modal-v17>header>button{display:grid;width:34px;height:34px;place-items:center;border:1px solid #e1e5ed;border-radius:9px;background:#fff;color:#727c90;cursor:pointer}.receipt-client-link-tabs-v17{display:flex;align-items:center;gap:7px;padding:12px 16px;border-bottom:1px solid #edf0f5;background:#fafbfe}.receipt-client-link-tabs-v17>button{height:34px;padding:0 11px;border:1px solid #e0e4ed;border-radius:9px;background:#fff;color:#667086;font-size:10px;font-weight:800;cursor:pointer}.receipt-client-link-tabs-v17>button.active{border-color:#9eaaf5;background:#f1f3ff;color:#5367df}.receipt-client-link-tabs-v17>button b{margin-left:5px}.receipt-client-link-tabs-v17 label{display:flex;align-items:center;gap:7px;width:min(280px,36vw);height:34px;margin-left:auto;padding:0 10px;border:1px solid #e0e4ed;border-radius:9px;background:#fff;color:#929aac}.receipt-client-link-tabs-v17 input{width:100%;border:0;outline:0;background:transparent;font-size:10.5px}.receipt-client-link-error-v17{margin:10px 16px 0;padding:9px 11px;border:1px solid #efcaca;border-radius:9px;background:#fff6f6;color:#9f3d3d;font-size:10px}.receipt-client-link-body-v17{display:grid;grid-template-columns:minmax(0,1fr) 300px;height:min(64vh,560px);min-height:0}.receipt-client-link-list-v17{min-height:0;overflow-y:scroll;overscroll-behavior:contain;scrollbar-gutter:stable;padding:12px 14px 28px}.receipt-client-link-list-v17::-webkit-scrollbar,.receipt-client-link-groups-v17::-webkit-scrollbar{width:10px}.receipt-client-link-list-v17::-webkit-scrollbar-track,.receipt-client-link-groups-v17::-webkit-scrollbar-track{background:#f4f6fa;border-radius:10px}.receipt-client-link-list-v17::-webkit-scrollbar-thumb,.receipt-client-link-groups-v17::-webkit-scrollbar-thumb{background:#b9c1d1;border:2px solid #f4f6fa;border-radius:10px}.receipt-client-link-list-v17::-webkit-scrollbar-thumb:hover,.receipt-client-link-groups-v17::-webkit-scrollbar-thumb:hover{background:#929db1}.receipt-client-link-list-v17{scrollbar-color:#b9c1d1 #f4f6fa;scrollbar-width:auto}.receipt-client-link-list-v17>label{display:flex;align-items:flex-start;gap:9px;padding:10px 11px;border-bottom:1px solid #eef1f5;color:#414b61;font-size:10.5px;cursor:pointer}.receipt-client-link-list-v17>label:hover{background:#fafbff}.receipt-client-link-list-v17>label.selected{background:#f4f6ff}.receipt-client-link-list-v17 input{margin-top:1px}.receipt-client-link-list-v17 span{line-height:1.35}.receipt-client-link-body-v17 aside{display:flex;min-height:0;flex-direction:column;gap:9px;padding:18px;border-left:1px solid #e9edf3;background:#fafbfe}.receipt-client-link-body-v17 aside>span{color:#5d72f6;font-size:8px;font-weight:900;letter-spacing:.08em}.receipt-client-link-body-v17 aside>strong{font-size:16px}.receipt-client-link-body-v17 aside>p{margin:0 0 4px;color:#838c9f;font-size:10px;line-height:1.5}.receipt-client-link-body-v17 aside label{display:grid;gap:5px}.receipt-client-link-body-v17 aside small{color:#858ea0;font-size:8px;font-weight:800;text-transform:uppercase}.receipt-client-link-body-v17 aside select{width:100%;min-height:40px;padding:0 9px;border:1px solid #dfe4ed;border-radius:9px;background:#fff;color:#3e485d;font-size:10px}.receipt-client-link-body-v17 aside>button{height:39px;border:1px solid #5d72f6;border-radius:9px;background:#5d72f6;color:#fff;font-size:10px;font-weight:850;cursor:pointer}.receipt-client-link-body-v17 aside>button:disabled{opacity:.45;cursor:not-allowed}.receipt-client-link-body-v17 aside>button.secondary{border-color:#dfe4ed;background:#fff;color:#697287}.receipt-client-link-groups-v17{display:grid;gap:10px;max-height:64vh;overflow-y:scroll;overscroll-behavior:contain;scrollbar-gutter:stable;padding:14px 14px 28px}.receipt-client-link-groups-v17 article{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,1.3fr) auto;gap:14px;align-items:start;padding:14px;border:1px solid #e6eaf1;border-radius:12px;background:#fff}.receipt-client-link-groups-v17 article>div{display:grid;gap:4px}.receipt-client-link-groups-v17 article>div span{color:#8790a3;font-size:7.5px;font-weight:900;letter-spacing:.07em}.receipt-client-link-groups-v17 article>div strong{font-size:11px}.receipt-client-link-groups-v17 article>div small{color:#9199aa;font-size:9px}.receipt-client-link-groups-v17 ul{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.receipt-client-link-groups-v17 li{padding:5px 7px;border:1px solid #e5e8ef;border-radius:7px;background:#fafbfc;color:#687286;font-size:8.5px}.receipt-client-link-groups-v17 li.canonical{border-color:#d9dfff;background:#f1f3ff;color:#5367df;font-weight:800}.receipt-client-link-groups-v17 article>button{display:flex;align-items:center;gap:6px;height:32px;padding:0 9px;border:1px solid #edcccc;border-radius:8px;background:#fff;color:#a24444;font-size:9px;font-weight:800;cursor:pointer}.receipt-client-link-empty-v17{padding:34px;text-align:center;color:#8d96a8;font-size:11px}@media(max-width:760px){.receipt-client-link-backdrop-v17{padding:8px}.receipt-client-link-modal-v17{width:100%;max-height:94vh}.receipt-client-link-tabs-v17{flex-wrap:wrap}.receipt-client-link-tabs-v17 label{width:100%;margin-left:0}.receipt-client-link-body-v17{grid-template-columns:1fr;height:72vh;overflow:auto}.receipt-client-link-list-v17{max-height:42vh}.receipt-client-link-body-v17 aside{border-left:0;border-top:1px solid #e9edf3}.receipt-client-link-groups-v17 article{grid-template-columns:1fr}.receipt-client-link-groups-v17 article>button{width:max-content}}
      `}</style>
    </>
  );
}
