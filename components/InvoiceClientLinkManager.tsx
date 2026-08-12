"use client";

import { Link2, Search, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { canonicalClientName, normalizeClientText, setInvoiceClientAliasLinks } from "@/lib/clientNames";
import {
  createInvoiceClientGroup,
  deleteInvoiceClientGroup,
  INVOICE_CLIENT_LINKS_EVENT,
  invoiceAliasKey,
  listInvoiceClientLinks,
  type InvoiceClientLink,
} from "@/lib/invoiceClientLinks";
import { ANALYSIS_DATA_EVENT, loadAnalysisState, OFFLINE_DATA_CLEARED_EVENT } from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

export default function InvoiceClientLinkManager() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [isInvoices, setIsInvoices] = useState(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const dataRef = useRef(data);
  const [links, setLinks] = useState<InvoiceClientLink[]>([]);
  const [tab, setTab] = useState<"unlinked" | "linked">("unlinked");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [canonical, setCanonical] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { dataRef.current = data; }, [data]);

  const refreshDashboard = (nextLinks: InvoiceClientLink[]) => {
    setInvoiceClientAliasLinks(nextLinks);
    const current = dataRef.current;
    if (current.invoices.length || current.receipts.length) {
      window.dispatchEvent(new CustomEvent<ImportState>(ANALYSIS_DATA_EVENT, { detail: { ...current } }));
    }
    const periodSelect = document.querySelector<HTMLSelectElement>(".filter-bar select");
    periodSelect?.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const reloadLinks = async () => {
    try {
      const next = await listInvoiceClientLinks();
      setLinks(next);
      refreshDashboard(next);
      return next;
    } catch {
      setError("Não foi possível carregar os vínculos salvos.");
      return [];
    }
  };

  useEffect(() => {
    let active = true;
    void Promise.all([loadAnalysisState(), listInvoiceClientLinks()]).then(([stored, nextLinks]) => {
      if (!active) return;
      if (stored) {
        dataRef.current = stored;
        setData(stored);
      }
      setLinks(nextLinks);
      setInvoiceClientAliasLinks(nextLinks);
      if (stored) window.dispatchEvent(new CustomEvent<ImportState>(ANALYSIS_DATA_EVENT, { detail: { ...stored } }));
      document.querySelector<HTMLSelectElement>(".filter-bar select")?.dispatchEvent(new Event("change", { bubbles: true }));
    }).catch(() => setError("Não foi possível carregar os vínculos salvos."));

    const onData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) {
        dataRef.current = detail;
        setData(detail);
      }
    };
    const onLinks = () => { void reloadLinks(); };
    const onClear = () => {
      const empty = { invoices: [], receipts: [] } satisfies ImportState;
      dataRef.current = empty;
      setData(empty);
    };

    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    window.addEventListener(INVOICE_CLIENT_LINKS_EVENT, onLinks);
    window.addEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
      window.removeEventListener(INVOICE_CLIENT_LINKS_EVENT, onLinks);
      window.removeEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const nextTarget = document.querySelector<HTMLElement>(".topbar-actions");
      setPortalTarget((current) => current === nextTarget ? current : nextTarget);
      const title = document.querySelector<HTMLElement>(".topbar-title h1")?.textContent?.trim().toLowerCase() || "";
      setIsInvoices(title === "emissões" || title === "emissoes");
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
    data.invoices.forEach((invoice) => {
      const name = invoice.clientName.replace(/\s+/g, " ").trim();
      const key = invoiceAliasKey(name);
      if (key && name && !map.has(key)) map.set(key, name);
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data.invoices]);

  const linkedKeys = useMemo(() => new Set(links.map((link) => link.alias_key)), [links]);
  const unlinked = useMemo(() => currentNames.filter((name) => !linkedKeys.has(invoiceAliasKey(name))), [currentNames, linkedKeys]);
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
      await createInvoiceClientGroup(canonical, selected);
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
    if (!window.confirm("Desfazer este vínculo? Os nomes voltarão a ser tratados separadamente nas Emissões.")) return;
    setBusy(true);
    setError("");
    try {
      await deleteInvoiceClientGroup(groupId);
      await reloadLinks();
    } catch {
      setError("Não foi possível desfazer o vínculo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {portalTarget && isInvoices ? createPortal(
        <button type="button" className="invoice-client-link-trigger" onClick={() => { setOpen(true); setError(""); }}>
          <Link2 size={16} /> Vincular clientes
          {unlinked.length ? <b>{unlinked.length}</b> : null}
        </button>, portalTarget,
      ) : null}

      {open ? createPortal(
        <div className="invoice-client-link-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setOpen(false); }}>
          <section className="invoice-client-link-modal">
            <header>
              <div><span>EMISSÕES</span><h2>Cadastro e vínculo de clientes</h2><p>Os nomes vêm da FINR020. Estes vínculos são separados dos vínculos de Recebimentos.</p></div>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}><X size={18} /></button>
            </header>
            <div className="invoice-client-link-tabs">
              <button type="button" className={tab === "unlinked" ? "active" : ""} onClick={() => setTab("unlinked")}>Não vinculados <b>{unlinked.length}</b></button>
              <button type="button" className={tab === "linked" ? "active" : ""} onClick={() => setTab("linked")}>Vinculados <b>{groups.length}</b></button>
              <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" /></label>
            </div>
            {error ? <div className="invoice-client-link-error">{error}</div> : null}

            {tab === "unlinked" ? (
              <div className="invoice-client-link-body">
                <div className="invoice-client-link-list">
                  {visibleUnlinked.map((name) => (
                    <label key={invoiceAliasKey(name)} className={selected.includes(name) ? "selected" : ""}>
                      <input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)} />
                      <span>{name}</span>
                    </label>
                  ))}
                  {!visibleUnlinked.length ? <div className="invoice-client-link-empty">Nenhum nome não vinculado encontrado.</div> : null}
                </div>
                <aside>
                  <span>CRIAR VÍNCULO</span>
                  <strong>{selected.length} nomes selecionados</strong>
                  <p>Escolha qual nome será exibido como principal nas Emissões. Os demais passam a apontar para ele.</p>
                  <label><small>Nome principal</small><select value={canonical} onChange={(event) => setCanonical(event.target.value)} disabled={!selected.length}><option value="">Selecione</option>{selected.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
                  <button type="button" onClick={() => void save()} disabled={busy || selected.length < 2 || !canonical}>{busy ? "Salvando..." : "Unificar selecionados"}</button>
                  {selected.length ? <button type="button" className="secondary" onClick={() => { setSelected([]); setCanonical(""); }} disabled={busy}>Limpar seleção</button> : null}
                </aside>
              </div>
            ) : (
              <div className="invoice-client-link-groups">
                {visibleGroups.map((group) => (
                  <article key={group.id}>
                    <div><span>NOME PRINCIPAL</span><strong>{canonicalClientName(group.canonical)}</strong><small>{group.aliases.length} nomes vinculados</small></div>
                    <ul>{group.aliases.map((alias) => <li key={`${group.id}-${alias}`} className={invoiceAliasKey(alias) === invoiceAliasKey(group.canonical) ? "canonical" : ""}>{alias}</li>)}</ul>
                    <button type="button" onClick={() => void removeGroup(group.id)} disabled={busy}><Trash2 size={14} /> Desfazer vínculo</button>
                  </article>
                ))}
                {!visibleGroups.length ? <div className="invoice-client-link-empty">Nenhum vínculo cadastrado.</div> : null}
              </div>
            )}
          </section>
        </div>, document.body,
      ) : null}

      <style jsx global>{`
        .invoice-client-link-trigger{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 12px;border:1px solid #dfe4ee;border-radius:9px;background:#fff;color:#46516a;font-size:11px;font-weight:800;cursor:pointer}.invoice-client-link-trigger:hover{border-color:#aeb9f7;color:#5367df}.invoice-client-link-trigger b{display:grid;min-width:19px;height:19px;place-items:center;padding:0 5px;border-radius:999px;background:#eef0ff;color:#5367df;font-size:9px}.invoice-client-link-backdrop{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;background:rgba(21,26,39,.45);backdrop-filter:blur(3px)}.invoice-client-link-modal{width:min(1040px,96vw);max-height:88vh;overflow:hidden;border:1px solid #e1e5ee;border-radius:18px;background:#fff;box-shadow:0 28px 80px rgba(22,29,50,.2);color:#252c40}.invoice-client-link-modal>header{display:flex;justify-content:space-between;gap:20px;padding:20px 22px 16px;border-bottom:1px solid #edf0f5}.invoice-client-link-modal>header span{color:#5d72f6;font-size:9px;font-weight:900;letter-spacing:.09em}.invoice-client-link-modal>header h2{margin:4px 0 5px;font-size:21px}.invoice-client-link-modal>header p{margin:0;color:#858ea1;font-size:10.5px}.invoice-client-link-modal>header>button{display:grid;width:34px;height:34px;place-items:center;border:1px solid #e1e5ed;border-radius:9px;background:#fff;color:#727c90;cursor:pointer}.invoice-client-link-tabs{display:flex;align-items:center;gap:7px;padding:12px 16px;border-bottom:1px solid #edf0f5;background:#fafbfe}.invoice-client-link-tabs>button{height:34px;padding:0 11px;border:1px solid #e0e4ed;border-radius:9px;background:#fff;color:#667086;font-size:10px;font-weight:800;cursor:pointer}.invoice-client-link-tabs>button.active{border-color:#9eaaf5;background:#f1f3ff;color:#5367df}.invoice-client-link-tabs label{display:flex;align-items:center;gap:7px;width:min(280px,36vw);height:34px;margin-left:auto;padding:0 10px;border:1px solid #e0e4ed;border-radius:9px;background:#fff;color:#929aac}.invoice-client-link-tabs input{width:100%;border:0;outline:0;background:transparent;font-size:10.5px}.invoice-client-link-error{margin:10px 16px 0;padding:9px 11px;border:1px solid #efcaca;border-radius:9px;background:#fff6f6;color:#9f3d3d;font-size:10px}.invoice-client-link-body{display:grid;grid-template-columns:minmax(0,1fr) 300px;height:min(64vh,560px);min-height:0}.invoice-client-link-list{min-height:0;overflow-y:auto;padding:12px 14px 28px}.invoice-client-link-list>label{display:flex;align-items:flex-start;gap:9px;padding:10px 11px;border-bottom:1px solid #eef1f5;color:#414b61;font-size:10.5px;cursor:pointer}.invoice-client-link-list>label:hover{background:#fafbff}.invoice-client-link-list>label.selected{background:#f4f6ff}.invoice-client-link-body aside{display:flex;min-height:0;flex-direction:column;gap:9px;padding:18px;border-left:1px solid #e9edf3;background:#fafbfe}.invoice-client-link-body aside>span{color:#5d72f6;font-size:8px;font-weight:900;letter-spacing:.08em}.invoice-client-link-body aside>strong{font-size:16px}.invoice-client-link-body aside>p{margin:0 0 4px;color:#838c9f;font-size:10px;line-height:1.5}.invoice-client-link-body aside label{display:grid;gap:5px}.invoice-client-link-body aside small{color:#858ea0;font-size:8px;font-weight:800;text-transform:uppercase}.invoice-client-link-body aside select{width:100%;min-height:40px;padding:0 9px;border:1px solid #dfe4ed;border-radius:9px;background:#fff;color:#3e485d;font-size:10px}.invoice-client-link-body aside>button{height:39px;border:1px solid #5d72f6;border-radius:9px;background:#5d72f6;color:#fff;font-size:10px;font-weight:850;cursor:pointer}.invoice-client-link-body aside>button:disabled{opacity:.45;cursor:not-allowed}.invoice-client-link-body aside>button.secondary{border-color:#dfe4ed;background:#fff;color:#697287}.invoice-client-link-groups{display:grid;gap:10px;max-height:64vh;overflow-y:auto;padding:14px 14px 28px}.invoice-client-link-groups article{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,1.3fr) auto;gap:14px;align-items:start;padding:14px;border:1px solid #e6eaf1;border-radius:12px;background:#fff}.invoice-client-link-groups article>div{display:grid;gap:4px}.invoice-client-link-groups article>div span{color:#8790a3;font-size:7.5px;font-weight:900;letter-spacing:.07em}.invoice-client-link-groups article>div strong{font-size:11px}.invoice-client-link-groups article>div small{color:#9199aa;font-size:9px}.invoice-client-link-groups ul{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.invoice-client-link-groups li{padding:5px 7px;border:1px solid #e5e8ef;border-radius:7px;background:#fafbfc;color:#687286;font-size:8.5px}.invoice-client-link-groups li.canonical{border-color:#d9dfff;background:#f1f3ff;color:#5367df;font-weight:800}.invoice-client-link-groups article>button{display:flex;align-items:center;gap:6px;height:32px;padding:0 9px;border:1px solid #edcccc;border-radius:8px;background:#fff;color:#a24444;font-size:9px;font-weight:800;cursor:pointer}.invoice-client-link-empty{padding:34px;text-align:center;color:#8d96a8;font-size:11px}@media(max-width:760px){.invoice-client-link-backdrop{padding:8px}.invoice-client-link-modal{width:100%;max-height:94vh}.invoice-client-link-tabs{flex-wrap:wrap}.invoice-client-link-tabs label{width:100%;margin-left:0}.invoice-client-link-body{grid-template-columns:1fr;height:72vh;overflow:auto}.invoice-client-link-list{max-height:42vh}.invoice-client-link-body aside{border-left:0;border-top:1px solid #e9edf3}.invoice-client-link-groups article{grid-template-columns:1fr}}
      `}</style>
    </>
  );
}
