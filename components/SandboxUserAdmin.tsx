"use client";

import { Check, Copy, Power, UserPlus, Users, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  createSandboxUser,
  listSandboxUsers,
  updateSandboxManagedUser,
  type SandboxManagedUser,
  type SandboxRole,
  type SandboxSession,
} from "@/lib/dashboardSandbox";

const ROLE_LABELS: Record<SandboxRole, string> = {
  admin: "Administrador",
  updater: "Atualizador",
  viewer: "Visualizador",
};

export default function SandboxUserAdmin({ session, onClose }: {
  session: SandboxSession;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<SandboxManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SandboxRole>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listSandboxUsers(session));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setTemporaryPassword(null);
    try {
      const result = await createSandboxUser(session, {
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        role,
      });
      setUsers((current) => [...current.filter((item) => item.email !== result.user.email), result.user]
        .sort((a, b) => a.display_name.localeCompare(b.display_name, "pt-BR")));
      setTemporaryPassword(result.temporaryPassword);
      setCreatedEmail(result.user.email);
      setDisplayName("");
      setEmail("");
      setRole("viewer");
      setCopied(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function changeUser(user: SandboxManagedUser, changes: { role?: SandboxRole; active?: boolean }) {
    setError(null);
    try {
      const result = await updateSandboxManagedUser(session, { email: user.email, ...changes });
      setUsers((current) => current.map((item) => item.email === result.user.email ? result.user : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o usuário.");
    }
  }

  async function copyCredentials() {
    if (!temporaryPassword || !createdEmail) return;
    await navigator.clipboard.writeText(`E-mail: ${createdEmail}\nSenha temporária: ${temporaryPassword}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="sandbox-users-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="sandbox-users-panel" role="dialog" aria-modal="true" aria-label="Gerenciar usuários">
        <header>
          <div><span><Users size={16} /> ADMINISTRAÇÃO</span><h2>Usuários do Dashboard</h2><p>Crie acessos e controle quem pode consultar ou atualizar a base.</p></div>
          <button type="button" className="sandbox-users-close" onClick={onClose} aria-label="Fechar"><X /></button>
        </header>

        {error && <div className="sandbox-users-error">{error}</div>}

        {temporaryPassword && createdEmail && (
          <div className="sandbox-temp-password">
            <div><strong>Acesso criado para {createdEmail}</strong><span>Copie agora. A senha temporária não fica armazenada nesta tela.</span></div>
            <code>{temporaryPassword}</code>
            <button type="button" onClick={copyCredentials}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copiado" : "Copiar acesso"}</button>
          </div>
        )}

        <form className="sandbox-user-create" onSubmit={handleCreate}>
          <div className="sandbox-user-create-title"><UserPlus size={17} /><div><strong>Novo usuário</strong><span>O e-mail já nasce confirmado e a primeira senha será temporária.</span></div></div>
          <label><span>Nome</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Diretor Financeiro" required /></label>
          <label><span>E-mail</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@empresa.com.br" required /></label>
          <label><span>Perfil</span><select value={role} onChange={(event) => setRole(event.target.value as SandboxRole)}><option value="viewer">Visualizador</option><option value="updater">Atualizador</option><option value="admin">Administrador</option></select></label>
          <button type="submit" disabled={saving}><UserPlus size={16} />{saving ? "Criando..." : "Criar usuário"}</button>
        </form>

        <div className="sandbox-users-list-head"><strong>Usuários cadastrados</strong><span>{users.length} acesso{users.length === 1 ? "" : "s"}</span></div>
        <div className="sandbox-users-list">
          {loading ? <div className="sandbox-users-empty">Carregando usuários...</div> : users.map((user) => (
            <article key={user.email} className={!user.active ? "is-disabled" : ""}>
              <div className="sandbox-user-main">
                <div className="sandbox-user-avatar">{user.display_name.slice(0, 1).toUpperCase()}</div>
                <div><strong>{user.display_name}</strong><span>{user.email}</span></div>
              </div>
              <div className="sandbox-user-meta">
                <span className={`sandbox-role-pill role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
                {user.must_change_password && <span className="sandbox-first-login-pill">Primeiro acesso pendente</span>}
                <small>{user.last_access_at ? `Último acesso: ${new Date(user.last_access_at).toLocaleString("pt-BR")}` : "Ainda não acessou"}</small>
              </div>
              <div className="sandbox-user-actions">
                <select value={user.role} disabled={!user.active} onChange={(event) => void changeUser(user, { role: event.target.value as SandboxRole })} aria-label={`Perfil de ${user.display_name}`}>
                  <option value="viewer">Visualizador</option><option value="updater">Atualizador</option><option value="admin">Administrador</option>
                </select>
                <button type="button" className={user.active ? "danger" : "activate"} onClick={() => void changeUser(user, { active: !user.active })}><Power size={15} />{user.active ? "Desativar" : "Ativar"}</button>
              </div>
            </article>
          ))}
          {!loading && !users.length && <div className="sandbox-users-empty">Nenhum usuário cadastrado.</div>}
        </div>
      </section>

      <style jsx global>{`
        .sandbox-users-backdrop { position:fixed; inset:0; z-index:5000; display:grid; place-items:center; padding:24px; background:rgba(17,23,39,.58); backdrop-filter:blur(5px); }
        .sandbox-users-panel { width:min(980px,100%); max-height:min(860px,92vh); overflow:auto; padding:24px; border:1px solid #e3e7f0; border-radius:22px; background:#f8f9fc; color:#1c2333; box-shadow:0 28px 90px rgba(17,23,39,.3); }
        .sandbox-users-panel > header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:20px; }
        .sandbox-users-panel > header span { display:flex; align-items:center; gap:6px; color:#5269e8; font-size:10px; font-weight:900; letter-spacing:.09em; }
        .sandbox-users-panel > header h2 { margin:6px 0 4px; font-size:25px; }
        .sandbox-users-panel > header p { margin:0; color:#737c90; font-size:12px; }
        .sandbox-users-close { width:38px; height:38px; display:grid; place-items:center; flex:0 0 auto; border:1px solid #e0e4ec; border-radius:10px; background:#fff; color:#596276; cursor:pointer; }
        .sandbox-users-error { margin-bottom:14px; padding:11px 13px; border:1px solid #ffd5d9; border-radius:11px; background:#fff0f1; color:#aa2835; font-size:12px; font-weight:650; }
        .sandbox-temp-password { margin-bottom:16px; padding:14px; display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:12px; align-items:center; border:1px solid #cfe9dc; border-radius:14px; background:#edf9f3; }
        .sandbox-temp-password > div { display:grid; gap:3px; }
        .sandbox-temp-password strong { font-size:12px; color:#186844; }
        .sandbox-temp-password span { font-size:10px; color:#5b806d; }
        .sandbox-temp-password code { padding:9px 11px; border:1px dashed #8bc7a9; border-radius:9px; background:#fff; font-size:13px; font-weight:800; }
        .sandbox-temp-password button { height:38px; padding:0 12px; display:flex; align-items:center; gap:6px; border:0; border-radius:9px; background:#18794e; color:#fff; font-size:11px; font-weight:800; cursor:pointer; }
        .sandbox-user-create { display:grid; grid-template-columns:1.2fr 1.4fr .85fr auto; gap:10px; align-items:end; padding:15px; border:1px solid #e2e6ef; border-radius:15px; background:#fff; }
        .sandbox-user-create-title { grid-column:1/-1; display:flex; align-items:center; gap:9px; margin-bottom:3px; color:#5269e8; }
        .sandbox-user-create-title > div { display:grid; gap:2px; }
        .sandbox-user-create-title strong { color:#343d52; font-size:12px; }
        .sandbox-user-create-title span { color:#8991a2; font-size:9px; }
        .sandbox-user-create label { display:grid; gap:5px; }
        .sandbox-user-create label > span { color:#7e8799; font-size:8px; font-weight:900; letter-spacing:.06em; text-transform:uppercase; }
        .sandbox-user-create input,.sandbox-user-create select { width:100%; min-width:0; height:40px; padding:0 10px; border:1px solid #dfe3eb; border-radius:9px; background:#fafbfe; color:#394155; font:inherit; font-size:11px; }
        .sandbox-user-create > button { height:40px; padding:0 14px; display:flex; align-items:center; justify-content:center; gap:7px; border:0; border-radius:9px; background:#5269e8; color:#fff; font-size:11px; font-weight:850; white-space:nowrap; cursor:pointer; }
        .sandbox-user-create > button:disabled { opacity:.6; cursor:wait; }
        .sandbox-users-list-head { margin:20px 2px 9px; display:flex; justify-content:space-between; color:#596276; font-size:11px; }
        .sandbox-users-list-head > span { color:#9299a8; }
        .sandbox-users-list { display:grid; gap:8px; }
        .sandbox-users-list article { display:grid; grid-template-columns:minmax(230px,1.2fr) minmax(250px,1fr) auto; gap:14px; align-items:center; padding:12px 13px; border:1px solid #e4e7ee; border-radius:13px; background:#fff; }
        .sandbox-users-list article.is-disabled { opacity:.58; background:#f4f5f8; }
        .sandbox-user-main { display:flex; min-width:0; align-items:center; gap:10px; }
        .sandbox-user-avatar { width:34px; height:34px; display:grid; place-items:center; flex:0 0 auto; border-radius:10px; background:#eef1ff; color:#5269e8; font-size:13px; font-weight:900; }
        .sandbox-user-main > div:last-child { min-width:0; display:grid; gap:2px; }
        .sandbox-user-main strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }
        .sandbox-user-main span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#8a92a3; font-size:9px; }
        .sandbox-user-meta { display:flex; flex-wrap:wrap; align-items:center; gap:5px 7px; }
        .sandbox-user-meta small { flex-basis:100%; color:#969dad; font-size:8px; }
        .sandbox-role-pill,.sandbox-first-login-pill { padding:4px 7px; border-radius:999px; font-size:8px; font-weight:850; }
        .sandbox-role-pill { background:#eef1ff; color:#5269e8; }.sandbox-role-pill.role-updater{background:#eef9f4;color:#21835a}.sandbox-role-pill.role-viewer{background:#f1f3f6;color:#687286}
        .sandbox-first-login-pill { background:#fff5df; color:#996619; }
        .sandbox-user-actions { display:flex; align-items:center; gap:7px; }
        .sandbox-user-actions select { height:34px; padding:0 8px; border:1px solid #e0e4ec; border-radius:8px; background:#fff; color:#555f74; font-size:9px; font-weight:700; }
        .sandbox-user-actions button { height:34px; padding:0 9px; display:flex; align-items:center; gap:5px; border:1px solid #f0ccd0; border-radius:8px; background:#fff6f7; color:#a53d49; font-size:9px; font-weight:800; cursor:pointer; }
        .sandbox-user-actions button.activate { border-color:#cde8da; background:#f0faf5; color:#247b55; }
        .sandbox-users-empty { padding:25px; border:1px dashed #dfe3eb; border-radius:12px; color:#9299a8; background:#fff; font-size:11px; text-align:center; }
        @media(max-width:760px){
          .sandbox-users-backdrop { padding:0; place-items:end center; }
          .sandbox-users-panel { width:100%; max-height:92vh; padding:17px 12px calc(22px + env(safe-area-inset-bottom)); border-radius:22px 22px 0 0; }
          .sandbox-users-panel > header h2 { font-size:20px; }
          .sandbox-temp-password { grid-template-columns:1fr; }.sandbox-temp-password code{width:100%; text-align:center}.sandbox-temp-password button{justify-content:center}
          .sandbox-user-create { grid-template-columns:1fr 1fr; }.sandbox-user-create-title,.sandbox-user-create label:nth-of-type(1),.sandbox-user-create label:nth-of-type(2){grid-column:1/-1}.sandbox-user-create > button{grid-column:1/-1}
          .sandbox-users-list article { grid-template-columns:1fr; gap:9px; }.sandbox-user-actions{display:grid;grid-template-columns:1fr 1fr}.sandbox-user-actions select,.sandbox-user-actions button{width:100%;justify-content:center}
        }
      `}</style>
    </div>
  );
}
