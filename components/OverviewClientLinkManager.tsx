"use client";

import { Link2, Search, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { canonicalInvoiceClientName, normalizeClientText } from "@/lib/clientNames";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import {
  createOverviewClientGroup,
  deleteOverviewClientGroup,
  listOverviewClientLinks,
  OVERVIEW_CLIENT_LINKS_EVENT,
  overviewAliasKey,
  type OverviewClientLink,
} from "@/lib/overviewClientLinks";
import { ANALYSIS_DATA_EVENT, loadAnalysisState } from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

type NameItem = { name: string; source: "Emissões" | "Recebimentos" };

export default function OverviewClientLinkManager() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const dataRef = useRef(data);
  const [links, setLinks] = useState<OverviewClientLink[]>([]);
  const [tab, setTab] = useState<"unlinked" | "linked">("unlinked");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [canonical, setCanonical] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { dataRef.current = data; }, [data]);

  const reloadLinks = async () => {
    const next = await listOverviewClientLinks();
    setLinks(next);
    window.dispatchEvent(new Event(OVERVIEW_CLIENT_LINKS_EVENT));
    return next;
  };

  useEffect(() => {
    let active = true;
    void Promise.all([loadAnalysisState(), listOverviewClientLinks()]).then(([stored, nextLinks]) => {
      if (!active) return;
      if (stored) setData(stored);
      setLinks(nextLinks);
    }).catch(() => setError("Não foi possível carregar os grupos da Visão Geral."));

    const onData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) setData(detail);
    };
    const onLinks = () => { void listOverviewClientLinks().then(setLinks); };
    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    window.addEventListener(OVERVIEW_CLIENT_LINKS_EVENT, onLinks);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
      window.removeEventListener(OVERVIEW_CLIENT_LINKS_EVENT, onLinks);
    };
  }, []);

  useEffect(() => {
    const sync = () => setTarget(document.querySelector<HTMLElement>(".topbar-actions"));
    sync();
    const timer = window.setTimeout(sync, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const names = useMemo(() => {
    const map = new Map<string, NameItem>();
    data.invoices.forEach((invoice) => {
      const name = canonicalInvoiceClientName(invoice.clientName);
      const key = overviewAliasKey(name);
      if (key && !map.has(key)) map.set(key, { name, source: "Emissões" });
    });
    data.receipts.forEach((receipt) => {
      const name = canonicalReceiptClientName(receipt.clientHint || receipt.description);
      const key = overviewAliasKey(name);
      if (!key) return;
      const current = map.get(key);
      if (!current) map.set(key, { name, source: "Recebimentos" });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data]);

  const linkedKeys = useMemo(() => new Set(links.map((link) => link.alias_key)), [links]);
  const unlinked = useMemo(() => names.filter((item) => !linkedKeys.has(overviewAliasKey(item.name))), [names, linkedKeys]);
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; canonical: string; aliases: string[] }>();
    links.forEach((link) => {
      const group = map.get(link.group_id) ?? { id: link.group_id, canonical: link.canonical_name, aliases: [] };
      if (!group.aliases.includes(link.alias_name)) group.aliases.push(link.alias_name);
      map.set(link.group_id, group);
    });
    return [...map.values()].sort((a, b) => a.canonical.localeCompare(b.canonical, "pt-BR"));
  }, [links]);

  const q = normalizeClientText(query);
  const visibleUnlinked = unlinked.filter((item) => !q || normalizeClientText(item.name).includes(q));
  const visibleGroups = groups.filter((group) => !q
    || normalizeClientText(group.canonical).includes(q)
    || group.aliases.some((alias) => normalizeClientText(alias).includes(q)));

  const toggle = (name: string) => {
    setSelected((current) => {
      const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
      if (!next.length) setCanonical("");
      else if (!canonical) setCanonical(next[0]);
      return next;
    });
  };

  const save = async () => {
    if (selected.length < 2 || !canonical.trim()) {
      setError("Selecione pelo menos dois nomes e defina o nome exibido na Visão Geral.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createOverviewClientGroup(canonical, selected);
      setSelected([]);
      setCanonical("");
      await reloadLinks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o grupo.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (groupId: string) => {
    if (!window.confirm("Desfazer este grupo da Visão Geral? Emissões e Recebimentos não serão alterados.")) return;
    setBusy(true);
    setError("");
    try {
      await deleteOverviewClientGroup(groupId);
      await reloadLinks();
    } catch {
      setError("Não foi possível desfazer o grupo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {target ? createPortal(
        <button type="button" className="overview-client-link-trigger" onClick={() => { setOpen(true); setError(""); }}>
          <Link2 size={16} /> Vincular visão geral
        </button>, target,
      ) : null}

      {open ? createPortal(
        <div className="overview-client-link-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setOpen(false); }}>
          <section className="overview-client-link-modal">
            <header>
              <div><span>VISÃO GERAL</span><h2>Grupos de clientes</h2><p>Une nomes somente para análise da Visão Geral. Emissões e Recebimentos permanecem intactos.</p></div>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}><X size={18} /></button>
            </header>
            <div className="overview-client-link-tabs">
              <button type="button" className={tab === "unlinked" ? "active" : ""} onClick={() => setTab("unlinked")}>Não vinculados <b>{unlinked.length}</b></button>
              <button type="button" className={tab === "linked" ? "active" : ""} onClick={() => setTab("linked")}>Vinculados <b>{groups.length}</b></button>
              <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" /></label>
            </div>
            {error ? <div className="overview-client-link-error">{error}</div> : null}

            {tab === "unlinked" ? (
              <div className="overview-client-link-body">
                <div className="overview-client-link-list">
                  {visibleUnlinked.map((item) => (
                    <label key={overviewAliasKey(item.name)} className={selected.includes(item.name) ? "selected" : ""}>
                      <input type="checkbox" checked={selected.includes(item.name)} onChange={() => toggle(item.name)} />
                      <span>{item.name}</span><small>{item.source}</small>
                    </label>
                  ))}
                  {!visibleUnlinked.length ? <div className="overview-client-link-empty">Nenhum nome disponível.</div> : null}
                </div>
                <aside>
                  <span>CRIAR GRUPO</span>
                  <strong>{selected.length} nomes selecionados</strong>
                  <p>Escolha os nomes que representam o mesmo cliente e informe como ele deve aparecer apenas na Visão Geral.</p>
                  <label><small>Nome exibido</small><input value={canonical} onChange={(event) => setCanonical(event.target.value)} placeholder="Ex.: CISNE" /></label>
                  <button type="button" onClick={() => void save()} disabled={busy || selected.length < 2 || !canonical.trim()}>{busy ? "Salvando..." : "Criar grupo"}</button>
                  {selected.length ? <button type="button" className="secondary" onClick={() => { setSelected([]); setCanonical(""); }} disabled={busy}>Limpar seleção</button> : null}
                </aside>
              </div>
            ) : (
              <div className="overview-client-link-groups">
                {visibleGroups.map((group) => (
                  <article key={group.id}>
                    <div><span>NOME NA VISÃO GERAL</span><strong>{group.canonical}</strong><small>{group.aliases.length} nomes vinculados</small></div>
                    <ul>{group.aliases.map((alias) => <li key={`${group.id}-${alias}`}>{alias}</li>)}</ul>
                    <button type="button" onClick={() => void remove(group.id)} disabled={busy}><Trash2 size={14} /> Desfazer grupo</button>
                  </article>
                ))}
                {!visibleGroups.length ? <div className="overview-client-link-empty">Nenhum grupo cadastrado.</div> : null}
              </div>
            )}
          </section>
        </div>, document.body,
      ) : null}

      <style jsx global>{`
        .overview-client-link-trigger{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 12px;border:1px solid #dfe4ee;border-radius:9px;background:#fff;color:#46516a;font-size:11px;font-weight:800;cursor:pointer}.overview-client-link-trigger:hover{border-color:#aeb9f7;color:#5367df}
        .overview-client-link-backdrop{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;background:rgba(21,26,39,.45);backdrop-filter:blur(3px)}.overview-client-link-modal{width:min(1040px,96vw);max-height:88vh;overflow:hidden;border:1px solid #e1e5ee;border-radius:18px;background:#fff;box-shadow:0 28px 80px rgba(22,29,50,.2);color:#252c40}.overview-client-link-modal>header{display:flex;justify-content:space-between;gap:20px;padding:20px 22px 16px;border-bottom:1px solid #edf0f5}.overview-client-link-modal>header span{color:#5d72f6;font-size:9px;font-weight:900;letter-spacing:.09em}.overview-client-link-modal>header h2{margin:4px 0 5px;font-size:21px}.overview-client-link-modal>header p{margin:0;color:#858ea1;font-size:10.5px}.overview-client-link-modal>header>button{display:grid;width:34px;height:34px;place-items:center;border:1px solid #e1e5ed;border-radius:9px;background:#fff;color:#727c90;cursor:pointer}
        .overview-client-link-tabs{display:flex;align-items:center;gap:7px;padding:12px 16px;border-bottom:1px solid #edf0f5;background:#fafbfe}.overview-client-link-tabs>button{height:34px;padding:0 11px;border:1px solid #e0e4ed;border-radius:9px;background:#fff;color:#667086;font-size:10px;font-weight:800;cursor:pointer}.overview-client-link-tabs>button.active{border-color:#9eaaf5;background:#f1f3ff;color:#5367df}.overview-client-link-tabs label{display:flex;align-items:center;gap:7px;width:min(280px,36vw);height:34px;margin-left:auto;padding:0 10px;border:1px solid #e0e4ed;border-radius:9px;background:#fff;color:#929aac}.overview-client-link-tabs input{width:100%;border:0;outline:0;background:transparent;font-size:10.5px}.overview-client-link-error{margin:10px 16px 0;padding:9px 11px;border:1px solid #efcaca;border-radius:9px;background:#fff6f6;color:#9f3d3d;font-size:10px}
        .overview-client-link-body{display:grid;grid-template-columns:minmax(0,1fr) 300px;height:min(64vh,560px);min-height:0}.overview-client-link-list{min-height:0;overflow-y:auto;padding:12px 14px 28px}.overview-client-link-list>label{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:9px;padding:10px 11px;border-bottom:1px solid #eef1f5;color:#414b61;font-size:10.5px;cursor:pointer}.overview-client-link-list>label:hover{background:#fafbff}.overview-client-link-list>label.selected{background:#f4f6ff}.overview-client-link-list small{color:#8b94a7;font-size:9px}.overview-client-link-body aside{display:flex;min-height:0;flex-direction:column;gap:9px;padding:18px;border-left:1px solid #e9edf3;background:#fafbfe}.overview-client-link-body aside>span{color:#5d72f6;font-size:8px;font-weight:900;letter-spacing:.08em}.overview-client-link-body aside>strong{font-size:16px}.overview-client-link-body aside>p{margin:0 0 4px;color:#838c9f;font-size:10px;line-height:1.5}.overview-client-link-body aside label{display:grid;gap:5px}.overview-client-link-body aside input{height:36px;padding:0 10px;border:1px solid #dfe4ed;border-radius:8px;background:#fff;font-size:11px}.overview-client-link-body aside>button{height:36px;border:0;border-radius:8px;background:#5d72f6;color:#fff;font-size:10.5px;font-weight:800;cursor:pointer}.overview-client-link-body aside>button.secondary{border:1px solid #dfe4ed;background:#fff;color:#687288}.overview-client-link-body aside>button:disabled{opacity:.5;cursor:not-allowed}
        .overview-client-link-groups{max-height:64vh;overflow:auto;padding:14px 16px 28px}.overview-client-link-groups article{display:grid;grid-template-columns:240px minmax(0,1fr) auto;gap:18px;align-items:start;padding:14px;border:1px solid #e8ebf2;border-radius:12px;margin-bottom:10px}.overview-client-link-groups article>div{display:grid;gap:4px}.overview-client-link-groups article>div span{color:#5d72f6;font-size:8px;font-weight:900}.overview-client-link-groups article>div strong{font-size:13px}.overview-client-link-groups article>div small{color:#929aac;font-size:9px}.overview-client-link-groups ul{margin:0;padding-left:18px;color:#566075;font-size:10px}.overview-client-link-groups article>button{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:1px solid #efcaca;border-radius:8px;background:#fff7f7;color:#a64b4b;font-size:9.5px;font-weight:800;cursor:pointer}.overview-client-link-empty{padding:28px;color:#929aac;text-align:center;font-size:11px}
        @media(max-width:760px){.overview-client-link-body{grid-template-columns:1fr;height:auto;max-height:72vh;overflow:auto}.overview-client-link-body aside{border-left:0;border-top:1px solid #e9edf3}.overview-client-link-tabs{flex-wrap:wrap}.overview-client-link-tabs label{width:100%;margin-left:0}.overview-client-link-groups article{grid-template-columns:1fr}}
        @media print{.overview-client-link-trigger,.overview-client-link-backdrop{display:none!important}}
      `}</style>
    </>
  );
}
