"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { KeyRound, LogIn, LogOut, ShieldCheck, Users } from "lucide-react";
import SandboxUserAdmin from "@/components/SandboxUserAdmin";
import {
  checkSandboxAccess,
  getValidSandboxSession,
  loadCurrentSandboxSnapshot,
  loadSandboxProfile,
  saveSandboxSnapshot,
  signInSandbox,
  signOutSandbox,
  updateSandboxPassword,
  type SandboxProfile,
  type SandboxSession,
} from "@/lib/dashboardSandbox";
import { ANALYSIS_DATA_EVENT, loadChannelPayload, saveAnalysisState, saveChannelPayload, setStorageConsent } from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";
import { dataFingerprint } from "@/lib/sandboxDataFingerprint";

export default function ProductionAuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SandboxSession | null>(null);
  const [profile, setProfile] = useState<SandboxProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseInfo, setBaseInfo] = useState("Base compartilhada não carregada.");
  const lastSyncedFingerprint = useRef<string | null>(null);
  const lastRefreshRequest = useRef<string | null>(null);

  async function hydrateSharedSnapshot(nextSession: SandboxSession) {
    const snapshot = await loadCurrentSandboxSnapshot(nextSession);
    if (!snapshot) { setBaseInfo("Nenhuma base compartilhada publicada ainda."); return; }
    const remoteData: ImportState = {
      invoices: snapshot.invoices,
      receipts: snapshot.receipts,
      invoiceFileName: snapshot.invoice_file_name ?? undefined,
      receiptFileName: snapshot.receipt_file_name ?? undefined,
    };
    lastSyncedFingerprint.current = dataFingerprint(remoteData);
    setStorageConsent(true);
    await Promise.all([
      saveAnalysisState(remoteData),
      saveChannelPayload({ fileName: snapshot.receipt_file_name ?? "Base compartilhada", entries: Array.isArray(snapshot.receipt_channels) ? snapshot.receipt_channels : [] }),
    ]);
    setBaseInfo(`Base compartilhada: ${new Date(snapshot.created_at).toLocaleString("pt-BR")}${snapshot.uploaded_by_name ? ` • ${snapshot.uploaded_by_name}` : ""}`);
  }

  async function bootstrap(nextSession: SandboxSession) {
    const nextProfile = await loadSandboxProfile(nextSession);
    if (!nextProfile) throw new Error("Seu usuário não está autorizado neste Dashboard.");
    lastRefreshRequest.current = nextProfile.refresh_requested_at ?? null;
    setSession(nextSession); setProfile(nextProfile);
    document.documentElement.dataset.dashboardRole = nextProfile.role;
    if (!nextProfile.must_change_password) {
      try {
        await hydrateSharedSnapshot(nextSession);
        setError(null);
      } catch {
        setBaseInfo("Base compartilhada indisponível no momento. A sessão foi mantida.");
      }
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await getValidSandboxSession();
        if (active && current) await bootstrap(current);
      } catch (caught) {
        if (active) {
          setSession(null);
          setProfile(null);
          setError(caught instanceof Error ? caught.message : "Não foi possível restaurar sua sessão agora. Tente atualizar a página.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session || !profile || profile.must_change_password) return;
    let active = true; let checking = false;
    const revalidate = async () => {
      if (!active || checking) return; checking = true;
      try {
        const latest = await checkSandboxAccess(session); if (!active) return;
        if (!latest) { signOutSandbox(); delete document.documentElement.dataset.dashboardRole; setUsersOpen(false); setSession(null); setProfile(null); setError("Seu acesso foi desativado pelo administrador."); return; }
        const latestRefresh = latest.refresh_requested_at ?? null;
        if (latestRefresh && latestRefresh !== lastRefreshRequest.current) { lastRefreshRequest.current = latestRefresh; window.location.reload(); return; }
        if (latest.role !== profile.role || latest.display_name !== profile.display_name || latest.must_change_password !== profile.must_change_password) { setProfile(latest); document.documentElement.dataset.dashboardRole = latest.role; }
      } catch { /* falha transitória não encerra a sessão */ }
      finally { checking = false; }
    };
    const interval = window.setInterval(() => { void revalidate(); }, 5000);
    const onFocus = () => { void revalidate(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void revalidate(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session, profile]);

  useEffect(() => {
    if (!session || !profile || profile.must_change_password || profile.role === "viewer") return;
    const handleAnalysisUpdate = (event: Event) => {
      const data = (event as CustomEvent<ImportState>).detail;
      if (!data || (!data.invoices.length && !data.receipts.length)) return;
      if (data.invoiceFileName?.includes("demonstração") || data.receiptFileName?.includes("demonstração")) return;
      const fingerprint = dataFingerprint(data); if (fingerprint === lastSyncedFingerprint.current) return; lastSyncedFingerprint.current = fingerprint;
      void (async () => {
        try {
          const channelPayload = await loadChannelPayload<{ fileName?: string; entries?: unknown[] }>();
          const receiptChannels = Array.isArray(channelPayload?.entries) ? channelPayload.entries : [];
          await saveSandboxSnapshot({ session, profile, data, receiptChannels, note: "Atualização publicada no Dashboard." });
          setBaseInfo(`Base compartilhada: ${new Date().toLocaleString("pt-BR")} • ${profile.display_name ?? session.user.email ?? "usuário"}`); setError(null);
        } catch (caught) { lastSyncedFingerprint.current = null; setError(caught instanceof Error ? caught.message : "Não foi possível publicar a base compartilhada."); }
      })();
    };
    window.addEventListener(ANALYSIS_DATA_EVENT, handleAnalysisUpdate);
    return () => window.removeEventListener(ANALYSIS_DATA_EVENT, handleAnalysisUpdate);
  }, [session, profile]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null);
    try { const nextSession = await signInSandbox(email.trim().toLowerCase(), password); await bootstrap(nextSession); setPassword(""); }
    catch (caught) { signOutSandbox(); setSession(null); setProfile(null); setError(caught instanceof Error ? caught.message : "Não foi possível entrar."); }
    finally { setLoading(false); }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session) return; setError(null);
    if (newPassword.length < 8) return setError("A nova senha precisa ter pelo menos 8 caracteres.");
    if (newPassword !== newPasswordConfirm) return setError("As duas senhas precisam ser iguais.");
    setChangingPassword(true);
    try { await updateSandboxPassword(session, newPassword); const nextProfile = await loadSandboxProfile(session); if (!nextProfile) throw new Error("Não foi possível revalidar seu acesso."); setProfile(nextProfile); document.documentElement.dataset.dashboardRole = nextProfile.role; setNewPassword(""); setNewPasswordConfirm(""); await hydrateSharedSnapshot(session); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível concluir a troca de senha."); }
    finally { setChangingPassword(false); }
  }

  function logout() { signOutSandbox(); delete document.documentElement.dataset.dashboardRole; window.location.reload(); }

  if (loading) return <main className="dashboard-auth-shell"><div className="dashboard-auth-card"><ShieldCheck size={34}/><h1>Abrindo Financial Analytics...</h1></div><AuthStyles/></main>;
  if (!session || !profile) return <main className="dashboard-auth-shell"><form className="dashboard-auth-card" onSubmit={handleLogin}><span className="dashboard-auth-badge"><ShieldCheck size={15}/> ACESSO RESTRITO</span><h1>Financial Analytics</h1><p>Entre com seu acesso ao Dashboard Financeiro.</p><label><span>E-mail</span><input type="email" autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} required/></label><label><span>Senha</span><input type="password" autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} required/></label>{error && <div className="dashboard-auth-error">{error}</div>}<button type="submit"><LogIn size={17}/>Entrar</button></form><AuthStyles/></main>;
  if (profile.must_change_password) return <main className="dashboard-auth-shell"><form className="dashboard-auth-card" onSubmit={handlePasswordChange}><span className="dashboard-auth-badge"><KeyRound size={15}/> PRIMEIRO ACESSO</span><h1>Crie sua senha</h1><p>A senha temporária deve ser substituída antes de acessar as informações financeiras.</p><div className="dashboard-account-chip"><strong>{profile.display_name ?? "Usuário"}</strong><span>{session.user.email}</span></div><label><span>Nova senha</span><input type="password" minLength={8} value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} required/></label><label><span>Confirmar nova senha</span><input type="password" minLength={8} value={newPasswordConfirm} onChange={(e)=>setNewPasswordConfirm(e.target.value)} required/></label>{error && <div className="dashboard-auth-error">{error}</div>}<button type="submit" disabled={changingPassword}><KeyRound size={17}/>{changingPassword ? "Salvando..." : "Salvar nova senha e entrar"}</button><button className="dashboard-auth-link" type="button" onClick={logout}>Sair e usar outro acesso</button></form><AuthStyles/></main>;

  return <><div className="dashboard-auth-banner"><div><ShieldCheck size={15}/><strong>Financial Analytics</strong><span>{baseInfo}</span><span>Perfil: {profile.role}</span>{error && <span className="dashboard-auth-banner-error">⚠ {error}</span>}</div><div>{profile.role === "admin" && <button type="button" onClick={()=>setUsersOpen(true)}><Users size={15}/> Usuários</button>}<button type="button" onClick={logout}><LogOut size={15}/> Sair</button></div></div>{children}{usersOpen && profile.role === "admin" && <SandboxUserAdmin session={session} onClose={()=>setUsersOpen(false)}/>}<AuthStyles/></>;
}

function AuthStyles() { return <style jsx global>{`
.dashboard-auth-shell{min-height:100vh;display:grid;place-items:center;background:#f4f6fb;padding:24px;color:#171d2d}.dashboard-auth-card{width:min(430px,100%);background:#fff;border:1px solid #e6eaf2;border-radius:20px;padding:30px;box-shadow:0 18px 60px rgba(27,38,77,.1);display:grid;gap:17px}.dashboard-auth-card h1{margin:0;font-size:28px}.dashboard-auth-card p{margin:0;color:#687089;line-height:1.55}.dashboard-auth-card label{display:grid;gap:7px;font-size:13px;font-weight:700}.dashboard-auth-card input{min-height:44px;border:1px solid #d8deeb;border-radius:11px;padding:0 13px;font:inherit}.dashboard-auth-card button{min-height:44px;border:0;border-radius:11px;background:#5269e8;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px}.dashboard-auth-card .dashboard-auth-link{min-height:auto;background:transparent;color:#5269e8}.dashboard-auth-badge{width:max-content;display:flex;align-items:center;gap:6px;font-size:11px;font-weight:900;letter-spacing:.08em;color:#5269e8;background:#eef1ff;border-radius:999px;padding:7px 10px}.dashboard-account-chip{display:grid;gap:2px;padding:11px 12px;border:1px solid #e5e8f0;border-radius:11px;background:#f8f9fc}.dashboard-account-chip span{color:#81899a;font-size:10px}.dashboard-auth-error{padding:10px 12px;border-radius:10px;background:#fff0f1;color:#b42332;font-size:13px}.dashboard-auth-banner{position:relative;z-index:1000;min-height:40px;padding:7px 18px;background:#171d2d;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:10px}.dashboard-auth-banner>div{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.dashboard-auth-banner button{height:28px;padding:0 10px;border:1px solid #394057;border-radius:8px;background:#242b3e;color:#fff;display:flex;align-items:center;gap:6px;font-size:10px;font-weight:750}.dashboard-auth-banner-error{color:#ffb9c1}@media(max-width:760px){.dashboard-auth-card{padding:22px}.dashboard-auth-banner{align-items:flex-start;flex-direction:column}.dashboard-auth-banner>div{width:100%}.dashboard-auth-banner>div:last-child{justify-content:flex-end}}
`}</style>; }
