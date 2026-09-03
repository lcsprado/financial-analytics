"use client";

import { Link2, Plus, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { normalizeClientText } from "@/lib/clientNames";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import {
  addReceiptClientAliases,
  deleteReceiptClientAlias,
  deleteReceiptClientGroup,
  listReceiptClientLinks,
  receiptAliasKey,
  RECEIPT_CLIENT_LINKS_EVENT,
  type ReceiptClientLink,
} from "@/lib/receiptClientLinks";
import { ANALYSIS_DATA_EVENT, loadAnalysisState } from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

function sourceReceiptName(description: string, hint: string) {
  return canonicalReceiptClientName(description) || canonicalReceiptClientName(hint);
}

type Group = { id: string; canonical: string; aliases: string[] };

function makeGroups(links: ReceiptClientLink[]) {
  const map = new Map<string, Group>();
  links.forEach((link) => {
    const group = map.get(link.group_id) ?? { id: link.group_id, canonical: link.canonical_name, aliases: [] };
    if (!group.aliases.includes(link.alias_name)) group.aliases.push(link.alias_name);
    map.set(link.group_id, group);
  });
  return [...map.values()];
}

export default function ReceiptClientLinkFineControls() {
  const [links, setLinks] = useState<ReceiptClientLink[]>([]);
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const [target, setTarget] = useState<Group | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => setLinks(await listReceiptClientLinks());

  useEffect(() => {
    void reload().catch(() => undefined);
    void loadAnalysisState().then((stored) => { if (stored) setData(stored); });
    const onLinks = () => { void reload().catch(() => undefined); };
    const onData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) setData(detail);
    };
    window.addEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinks);
    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    return () => {
      window.removeEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinks);
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
    };
  }, []);

  const groups = useMemo(() => makeGroups(links), [links]);
  const linkedKeys = useMemo(() => new Set(links.map((link) => link.alias_key)), [links]);
  const unlinked = useMemo(() => {
    const map = new Map<string, string>();
    data.receipts.forEach((receipt) => {
      const name = sourceReceiptName(receipt.description, receipt.clientHint);
      const key = receiptAliasKey(name);
      if (key && name && !linkedKeys.has(key) && !map.has(key)) map.set(key, name);
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data.receipts, linkedKeys]);

  useEffect(() => {
    const decorate = () => {
      const container = document.querySelector<HTMLElement>(".receipt-client-link-groups-v17");
      if (!container) return;
      container.querySelectorAll<HTMLElement>("article").forEach((article) => {
        const canonical = article.querySelector<HTMLElement>(":scope > div strong")?.textContent?.trim() || "";
        const aliasTexts = [...article.querySelectorAll<HTMLElement>("ul li")].map((li) => li.childNodes[0]?.textContent?.trim() || li.textContent?.trim() || "");
        const group = groups.find((item) => receiptAliasKey(item.canonical) === receiptAliasKey(canonical)
          && aliasTexts.some((alias) => item.aliases.some((saved) => receiptAliasKey(saved) === receiptAliasKey(alias))));
        if (!group) return;

        article.querySelectorAll<HTMLElement>("ul li").forEach((li) => {
          const alias = li.childNodes[0]?.textContent?.trim() || li.textContent?.trim() || "";
          if (!alias || receiptAliasKey(alias) === receiptAliasKey(group.canonical) || li.querySelector(".receipt-link-remove-one-v23")) return;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "receipt-link-remove-one-v23";
          button.title = `Remover somente ${alias} deste vínculo`;
          button.setAttribute("aria-label", `Remover ${alias} deste vínculo`);
          button.textContent = "×";
          button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!window.confirm(`Remover somente “${alias}” deste vínculo? Os demais nomes continuarão vinculados.`)) return;
            try {
              if (group.aliases.length <= 2) await deleteReceiptClientGroup(group.id);
              else await deleteReceiptClientAlias(receiptAliasKey(alias));
              await reload();
            } catch {
              window.alert("Não foi possível remover este nome do vínculo.");
            }
          });
          li.appendChild(button);
        });

        if (!article.querySelector(".receipt-link-add-one-v23")) {
          const destructive = article.querySelector<HTMLButtonElement>(":scope > button");
          if (destructive) {
            const add = document.createElement("button");
            add.type = "button";
            add.className = "receipt-link-add-one-v23";
            add.innerHTML = '<span aria-hidden="true">＋</span> Adicionar vínculo';
            add.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              setTarget(group);
              setSelected([]);
              setQuery("");
              setError("");
            });
            destructive.before(add);
          }
        }
      });
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [groups]);

  const normalizedQuery = normalizeClientText(query);
  const visible = unlinked.filter((name) => !normalizedQuery || normalizeClientText(name).includes(normalizedQuery));

  const save = async () => {
    if (!target || !selected.length) return;
    setBusy(true);
    setError("");
    try {
      await addReceiptClientAliases(target.id, target.canonical, selected);
      await reload();
      setTarget(null);
      setSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar os vínculos.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {target ? createPortal(
        <div className="receipt-link-add-backdrop-v23" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setTarget(null); }}>
          <section className="receipt-link-add-modal-v23">
            <header>
              <div><span>ADICIONAR AO VÍNCULO</span><h3>{target.canonical}</h3><p>Escolha um ou mais nomes ainda não vinculados para adicionar a este cliente.</p></div>
              <button type="button" onClick={() => setTarget(null)} disabled={busy}><X size={17} /></button>
            </header>
            <label className="receipt-link-add-search-v23"><Link2 size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome para vincular" /></label>
            {error ? <div className="receipt-link-add-error-v23">{error}</div> : null}
            <div className="receipt-link-add-list-v23">
              {visible.map((name) => (
                <label key={receiptAliasKey(name)} className={selected.includes(name) ? "selected" : ""}>
                  <input type="checkbox" checked={selected.includes(name)} onChange={() => setSelected((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])} />
                  <span>{name}</span>
                </label>
              ))}
              {!visible.length ? <div className="receipt-link-add-empty-v23">Nenhum nome disponível para vincular.</div> : null}
            </div>
            <footer><span>{selected.length} selecionado{selected.length === 1 ? "" : "s"}</span><button type="button" className="secondary" onClick={() => setTarget(null)} disabled={busy}>Cancelar</button><button type="button" onClick={() => void save()} disabled={busy || !selected.length}><Plus size={14} /> {busy ? "Adicionando..." : "Adicionar ao vínculo"}</button></footer>
          </section>
        </div>,
        document.body,
      ) : null}
      <style jsx global>{`
        .receipt-client-link-groups-v17 li{display:inline-flex;align-items:center;gap:5px}.receipt-link-remove-one-v23{display:grid;width:16px;height:16px;place-items:center;padding:0;border:0;border-radius:50%;background:transparent;color:#a66767;font-size:13px;line-height:1;cursor:pointer}.receipt-link-remove-one-v23:hover{background:#ffecec;color:#c33}.receipt-client-link-groups-v17 article>.receipt-link-add-one-v23{border-color:#cfd6ff;background:#f7f8ff;color:#5367df}.receipt-client-link-groups-v17 article>.receipt-link-add-one-v23:hover{background:#eef1ff}.receipt-link-add-backdrop-v23{position:fixed;inset:0;z-index:100010;display:grid;place-items:center;padding:20px;background:rgba(21,26,39,.42);backdrop-filter:blur(3px)}.receipt-link-add-modal-v23{width:min(680px,94vw);max-height:78vh;display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;border:1px solid #e1e5ee;border-radius:16px;background:#fff;box-shadow:0 24px 70px rgba(22,29,50,.22);overflow:hidden;color:#252c40}.receipt-link-add-modal-v23 header{display:flex;justify-content:space-between;gap:18px;padding:18px 20px 14px;border-bottom:1px solid #edf0f5}.receipt-link-add-modal-v23 header span{color:#5d72f6;font-size:8px;font-weight:900;letter-spacing:.08em}.receipt-link-add-modal-v23 header h3{margin:4px 0;font-size:17px}.receipt-link-add-modal-v23 header p{margin:0;color:#858ea1;font-size:10px}.receipt-link-add-modal-v23 header button{display:grid;width:32px;height:32px;place-items:center;border:1px solid #e1e5ed;border-radius:9px;background:#fff;color:#727c90;cursor:pointer}.receipt-link-add-search-v23{display:flex;align-items:center;gap:8px;margin:12px 14px 6px;padding:0 10px;height:38px;border:1px solid #dfe4ed;border-radius:9px;color:#8b94a7}.receipt-link-add-search-v23 input{width:100%;border:0;outline:0;background:transparent;font-size:10.5px}.receipt-link-add-error-v23{margin:4px 14px 6px;padding:8px 10px;border:1px solid #efcaca;border-radius:8px;background:#fff6f6;color:#9f3d3d;font-size:10px}.receipt-link-add-list-v23{min-height:160px;max-height:46vh;overflow:auto;padding:6px 14px 14px}.receipt-link-add-list-v23>label{display:flex;align-items:flex-start;gap:9px;padding:10px;border-bottom:1px solid #eef1f5;color:#414b61;font-size:10.5px;cursor:pointer}.receipt-link-add-list-v23>label:hover,.receipt-link-add-list-v23>label.selected{background:#f4f6ff}.receipt-link-add-list-v23>label input{margin-top:1px}.receipt-link-add-empty-v23{padding:28px;text-align:center;color:#8d96a8;font-size:10.5px}.receipt-link-add-modal-v23 footer{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid #edf0f5;background:#fafbfe}.receipt-link-add-modal-v23 footer>span{margin-right:auto;color:#7e8799;font-size:10px}.receipt-link-add-modal-v23 footer button{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border:1px solid #5d72f6;border-radius:9px;background:#5d72f6;color:#fff;font-size:9.5px;font-weight:800;cursor:pointer}.receipt-link-add-modal-v23 footer button.secondary{border-color:#dfe4ed;background:#fff;color:#687286}.receipt-link-add-modal-v23 footer button:disabled{opacity:.45;cursor:not-allowed}
      `}</style>
    </>
  );
}
