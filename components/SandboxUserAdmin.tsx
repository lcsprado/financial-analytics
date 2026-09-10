"use client";

import { Check, Copy, KeyRound, Power, RefreshCw, Trash2, UserPlus, Users, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  createSandboxUser,
  deleteSandboxManagedUser,
  listSandboxUsers,
  requestSandboxDashboardRefresh,
  resetSandboxTemporaryPassword,
  updateSandboxManagedUser,
  type SandboxManagedUser,
  type SandboxRole,
  type SandboxSession,
} from "@/lib/dashboardSandbox";

const PROTECTED_OWNER_EMAIL = "lcsprado4@gmail.com";
const ROLE_LABELS: Record<SandboxRole, string> = { admin: "Administrador", updater: "Atualizador", viewer: "Visualizador" };

export default function SandboxUserAdmin({ session, onClose }: { session: SandboxSession; onClose: () => void }) {
  const [users, setUsers] = useState<SandboxManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingEmail, setResettingEmail] = useState<string | null>(null);
  const [refreshingEmail, setRefreshingEmail] = useState<string | null>(null);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SandboxRole>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setLoading(true); setError(null);
    try { setUsers(await listSandboxUsers(session)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar os usuários."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setTemporaryPassword(null);
    try {
      const result = await createSandboxUser(session, { displayName: displayName.trim(), email: email.trim().toLowerCase(), role });
      setUsers((current) => [...current.filter((item) => item.email !== result.user.email), result.user].sort((a,b) => a.display_name.localeCompare(b.display_name,"pt-BR")));
      setTemporaryPassword(result.temporaryPassword); setCreatedEmail(result.user.email); setDisplayName(""); setEmail(""); setRole("viewer"); setCopied(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível criar o usuário."); }
    finally { setSaving(false); }
  }

  async function changeUser(user: SandboxManagedUser, changes: { role?: SandboxRole; active?: boolean }) {
    setError(null);
    try {
      const result = await updateSandboxManagedUser(session, { email: user.email, ...changes });
      setUsers((current) => current.map((item) => item.email === result.user.email ? result.user : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o usuário."); }
  }

  async function refreshDashboard(user: SandboxManagedUser) {
    setError(null); setRefreshingEmail(user.email);
    try {
      const result = await requestSandboxDashboardRefresh(session, user.email);
      setUsers((current) => current.map((item) => item.email === result.user.email ? result.user : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível solicitar a atualização do Dashboard."); }
    finally { setRefreshingEmail(null); }
  }

  async function resetPassword(user: SandboxManagedUser) {
    setError(null); setTemporaryPassword(null); setResettingEmail(user.email);
    try {
      const result = await resetSandboxTemporaryPassword(session, user.email);
      setUsers((current) => current.map((item) => item.email === result.user.email ? result.user : item));
      setTemporaryPassword(result.temporaryPassword); setCreatedEmail(result.user.email); setCopied(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível gerar uma nova senha temporária."); }
    finally { setResettingEmail(null); }
  }

  async function deleteUser(user: SandboxManagedUser) {
    const confirmed = window.confirm(`Excluir ${user.display_name} do Dashboard?\n\nO acesso será removido imediatamente. A conta de autenticação será preservada e poderá ser reutilizada caso você cadastre este e-mail novamente.`);
    if (!confirmed) return;
    setError(null); setTemporaryPassword(null); setDeletingEmail(user.email);
    try {
      await deleteSandboxManagedUser(session, user.email);
      setUsers((current) => current.filter((item) => item.email !== user.email));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível excluir o usuário."); }
    finally { setDeletingEmail(null); }
  }

  async function copyCredentials() {
    if (!temporaryPassword) return;
    await navigator.clipboard.writeText(temporaryPassword); setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }

  return <div className="dashboard-users-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dashboard-users-panel" role="dialog" aria-modal="true" aria-label="Gerenciar usuários">
      <header><div><span><Users size={16}/> ADMINISTRAÇÃO</span><h2>Usuários do Dashboard</h2><p>Crie acessos e controle quem pode consultar ou atualizar a base oficial.</p></div><button type="button" className="dashboard-users-close" onClick={onClose} aria-label="Fechar"><X/></button></header>
      {error && <div className="dashboard-users-error">{error}</div>}
      {temporaryPassword && createdEmail && <div className="dashboard-temp-password"><div><strong>Senha temporária para {createdEmail}</strong><span>Senha inicial padrão. O usuário deverá substituí-la no primeiro acesso.</span></div><code>{temporaryPassword}</code><button type="button" onClick={copyCredentials}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Copiada" : "Copiar senha"}</button></div>}
      <form className="dashboard-user-create" onSubmit={handleCreate}>
        <div className="dashboard-user-create-title"><UserPlus size={17}/><div><strong>Novo usuário</strong><span>Senha inicial: 123456, com troca obrigatória no primeiro acesso.</span></div></div>
        <label><span>Nome</span><input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} required /></label>
        <label><span>E-mail</span><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></label>
        <label><span>Perfil</span><select value={role} onChange={(e)=>setRole(e.target.value as SandboxRole)}><option value="viewer">Visualizador</option><option value="updater">Atualizador</option><option value="admin">Administrador</option></select></label>
        <button type="submit" disabled={saving}><UserPlus size={16}/>{saving ? "Criando..." : "Criar usuário"}</button>
      </form>
      <div className="dashboard-users-list-head"><strong>Usuários cadastrados</strong><span>{users.length} acesso{users.length===1?"":"s"}</span></div>
      <div className="dashboard-users-list">
        {loading ? <div className="dashboard-users-empty">Carregando usuários...</div> : users.map((user) => {
          const protectedOwner = user.email.toLowerCase() === PROTECTED_OWNER_EMAIL;
          const isSelf = user.email.toLowerCase() === session.user.email?.toLowerCase();
          return <article key={user.email} className={!user.active ? "is-disabled" : ""}>
            <div className="dashboard-user-main"><div className="dashboard-user-avatar">{user.display_name.slice(0,1).toUpperCase()}</div><div><strong>{user.display_name}</strong><span>{user.email}</span></div></div>
            <div className="dashboard-user-meta"><span className={`dashboard-role-pill role-${user.role}`}>{ROLE_LABELS[user.role]}</span>{protectedOwner && <span className="dashboard-owner-pill">Acesso principal protegido</span>}{user.must_change_password && <span className="dashboard-first-login-pill">Primeiro acesso pendente</span>}<small>{user.last_access_at ? `Último acesso: ${new Date(user.last_access_at).toLocaleString("pt-BR")}` : "Ainda não acessou"}</small></div>
            <div className="dashboard-user-actions">
              <select value={user.role} disabled={!user.active || protectedOwner} onChange={(e)=>void changeUser(user,{role:e.target.value as SandboxRole})}><option value="viewer">Visualizador</option><option value="updater">Atualizador</option><option value="admin">Administrador</option></select>
              {!protectedOwner && user.active && <button type="button" className="refresh" disabled={refreshingEmail===user.email || deletingEmail===user.email} onClick={()=>void refreshDashboard(user)}><RefreshCw size={15}/>{refreshingEmail===user.email?"Enviando...":"Atualizar dashboard"}</button>}
              {!protectedOwner && user.active && <button type="button" className="password" disabled={resettingEmail===user.email || deletingEmail===user.email} onClick={()=>void resetPassword(user)}><KeyRound size={15}/>{resettingEmail===user.email?"Gerando...":"Nova senha 123456"}</button>}
              {!protectedOwner && <button type="button" className={user.active?"danger":"activate"} disabled={deletingEmail===user.email} onClick={()=>void changeUser(user,{active:!user.active})}><Power size={15}/>{user.active?"Desativar":"Ativar"}</button>}
              {!protectedOwner && !isSelf && <button type="button" className="delete" disabled={deletingEmail===user.email} onClick={()=>void deleteUser(user)}><Trash2 size={15}/>{deletingEmail===user.email?"Excluindo...":"Excluir"}</button>}
            </div>
          </article>;
        })}
        {!loading && !users.length && <div className="dashboard-users-empty">Nenhum usuário cadastrado.</div>}
      </div>
    </section>
    <style jsx global>{`
      .dashboard-users-backdrop{position:fixed;inset:0;z-index:5000;display:grid;place-items:center;padding:24px;background:rgba(17,23,39,.58);backdrop-filter:blur(5px)}
      .dashboard-users-panel{width:min(1080px,100%);max-height:min(860px,92vh);overflow:auto;padding:24px;border:1px solid #e3e7f0;border-radius:22px;background:#f8f9fc;color:#1c2333;box-shadow:0 28px 90px rgba(17,23,39,.3)}
      .dashboard-users-panel>header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px}.dashboard-users-panel>header span{display:flex;align-items:center;gap:6px;color:#5269e8;font-size:10px;font-weight:900;letter-spacing:.09em}.dashboard-users-panel>header h2{margin:6px 0 4px;font-size:25px}.dashboard-users-panel>header p{margin:0;color:#737c90;font-size:12px}.dashboard-users-close{width:38px;height:38px;display:grid;place-items:center;border:1px solid #e0e4ec;border-radius:10px;background:#fff;color:#596276}
      .dashboard-users-error{margin-bottom:14px;padding:11px 13px;border:1px solid #ffd5d9;border-radius:11px;background:#fff0f1;color:#aa2835;font-size:12px}.dashboard-temp-password{margin-bottom:16px;padding:14px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;border:1px solid #cfe9dc;border-radius:14px;background:#edf9f3}.dashboard-temp-password>div{display:grid;gap:3px}.dashboard-temp-password strong{font-size:12px;color:#186844}.dashboard-temp-password span{font-size:10px;color:#5b806d}.dashboard-temp-password code{padding:9px 11px;border:1px dashed #8bc7a9;border-radius:9px;background:#fff;font-size:13px;font-weight:800}.dashboard-temp-password button{height:38px;padding:0 12px;border:0;border-radius:9px;background:#18794e;color:#fff;font-size:11px;font-weight:800}
      .dashboard-user-create{display:grid;grid-template-columns:1.2fr 1.4fr .85fr auto;gap:10px;align-items:end;padding:15px;border:1px solid #e2e6ef;border-radius:15px;background:#fff}.dashboard-user-create-title{grid-column:1/-1;display:flex;align-items:center;gap:9px;color:#5269e8}.dashboard-user-create-title>div{display:grid;gap:2px}.dashboard-user-create-title strong{color:#343d52;font-size:12px}.dashboard-user-create-title span{color:#8991a2;font-size:9px}.dashboard-user-create label{display:grid;gap:5px}.dashboard-user-create label>span{color:#7e8799;font-size:8px;font-weight:900;text-transform:uppercase}.dashboard-user-create input,.dashboard-user-create select{width:100%;height:40px;padding:0 10px;border:1px solid #dfe3eb;border-radius:9px;background:#fafbfe}.dashboard-user-create>button{height:40px;padding:0 14px;border:0;border-radius:9px;background:#5269e8;color:#fff;font-size:11px;font-weight:850}
      .dashboard-users-list-head{margin:20px 2px 9px;display:flex;justify-content:space-between;color:#596276;font-size:11px}.dashboard-users-list{display:grid;gap:8px}.dashboard-users-list article{display:grid;grid-template-columns:minmax(210px,1.15fr) minmax(230px,1fr) auto;gap:14px;align-items:center;padding:12px 13px;border:1px solid #e4e7ee;border-radius:13px;background:#fff}.dashboard-users-list article.is-disabled{opacity:.58;background:#f4f5f8}.dashboard-user-main{display:flex;min-width:0;align-items:center;gap:10px}.dashboard-user-avatar{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#eef1ff;color:#5269e8;font-size:13px;font-weight:900}.dashboard-user-main>div:last-child{min-width:0;display:grid;gap:2px}.dashboard-user-main strong,.dashboard-user-main span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dashboard-user-main span{color:#8a92a3;font-size:9px}.dashboard-user-meta{display:flex;flex-wrap:wrap;align-items:center;gap:5px 7px}.dashboard-user-meta small{flex-basis:100%;color:#969dad;font-size:8px}.dashboard-role-pill,.dashboard-first-login-pill,.dashboard-owner-pill{padding:4px 7px;border-radius:999px;font-size:8px;font-weight:850}.dashboard-role-pill{background:#eef1ff;color:#5269e8}.dashboard-first-login-pill{background:#fff3d9;color:#98680c}.dashboard-owner-pill{background:#e9f8f1;color:#18794e}.dashboard-user-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}.dashboard-user-actions select,.dashboard-user-actions button{height:34px;border:1px solid #dde2eb;border-radius:8px;background:#fff;padding:0 9px;font-size:9px}.dashboard-user-actions button{display:flex;align-items:center;gap:5px}.dashboard-user-actions .danger{color:#b42332}.dashboard-user-actions .activate{color:#18794e}.dashboard-user-actions .delete{color:#9f1239;border-color:#fecdd3;background:#fff7f8}.dashboard-users-empty{padding:24px;text-align:center;color:#9299a8;font-size:11px}
      @media(max-width:760px){.dashboard-users-backdrop{padding:8px}.dashboard-users-panel{padding:16px;border-radius:16px}.dashboard-temp-password{grid-template-columns:1fr}.dashboard-user-create{grid-template-columns:1fr}.dashboard-user-create-title{grid-column:1}.dashboard-users-list article{grid-template-columns:1fr}.dashboard-user-actions{justify-content:flex-start}.dashboard-user-actions>*{flex:1 1 auto}}
    `}</style>
  </div>;
}
