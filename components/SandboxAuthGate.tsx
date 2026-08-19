"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { CheckCircle2, KeyRound, LogIn, LogOut, ShieldCheck, Users } from "lucide-react";
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
import {
  ANALYSIS_DATA_EVENT,
  loadChannelPayload,
  saveAnalysisState,
  saveChannelPayload,
  setStorageConsent,
} from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

function dataFingerprint(data: ImportState) {
  let hash = 2166136261;
  const add = (value: unknown) => {
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  add(data.invoiceFileName);
  add(data.receiptFileName);
  data.invoices.forEach((item) => {
    add(item.id); add(item.invoiceNumber); add(item.grossValue); add(item.netValue);
  });
  data.receipts.forEach((item) => {
    add(item.id); add(item.receiptDate); add(item.amount); add(item.bank);
  });
  return `${data.invoices.length}:${data.receipts.length}:${hash >>> 0}`;
}

export default function SandboxAuthGate({ children }: { children: ReactNode }) {
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
  const [baseInfo, setBaseInfo] = useState<string>("Nenhuma base compartilhada publicada ainda.");
  const lastSyncedFingerprint = useRef<string | null>(null);
  const lastRefreshRequest = useRef<string | null>(null);

  async function hydrateSharedSnapshot(nextSession: SandboxSession) {
    const snapshot = await loadCurrentSandboxSnapshot(nextSession);
    if (!snapshot) {
      setBaseInfo("Nenhuma base compartilhada publicada ainda.");
      return;
    }

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
      saveChannelPayload({
        fileName: snapshot.receipt_file_name ?? "Base compartilhada",
        entries: Array.isArray(snapshot.receipt_channels) ? snapshot.receipt_channels : [],
      }),
    ]);
    const when = new Date(snapshot.created_at).toLocaleString("pt-BR");
    setBaseInfo(`Base compartilhada: ${when}${snapshot.uploaded_by_name ? ` • ${snapshot.uploaded_by_name}` : ""}`);
  }

  async function bootstrap(nextSession: SandboxSession) {
    const nextProfile = await loadSandboxProfile(nextSession);
    if (!nextProfile) throw new Error("Seu usuário ainda não foi autorizado neste dashboard de teste.");

    lastRefreshRequest.current = nextProfile.refresh_requested_at ?? null;
    setSession(nextSession);
    setProfile(nextProfile);
    document.documentElement.dataset.sandboxRole = nextProfile.role;

    if (nextProfile.must_change_password) {
      setBaseInfo("Primeiro acesso pendente: altere a senha temporária.");
      return;
    }

    await hydrateSharedSnapshot(nextSession);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await getValidSandboxSession();
        if (!active || !current) return;
        await bootstrap(current);
      } catch (caught) {
        if (active) {
          signOutSandbox();
          setSession(null);
          setProfile(null);
          setError(caught instanceof Error ? caught.message : "Não foi possível abrir o sandbox.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session || !profile || profile.must_change_password) return;

    let active = true;
    let checking = false;

    const revalidateAccess = async () => {
      if (!active || checking) return;
      checking = true;
      try {
        const latest = await checkSandboxAccess(session);
        if (!active) return;

        if (!latest) {
          signOutSandbox();
          delete document.documentElement.dataset.sandboxRole;
          setUsersOpen(false);
          setSession(null);
          setProfile(null);
          setError("Seu acesso foi desativado pelo administrador.");
          return;
        }

        const latestRefresh = latest.refresh_requested_at ?? null;
        if (latestRefresh && latestRefresh !== lastRefreshRequest.current) {
          lastRefreshRequest.current = latestRefresh;
          window.location.reload();
          return;
        }

        if (
          latest.role !== profile.role
          || latest.display_name !== profile.display_name
          || latest.must_change_password !== profile.must_change_password
        ) {
          setProfile(latest);
          document.documentElement.dataset.sandboxRole = latest.role;
        }
      } catch {
        // Falha transitória de rede não deve derrubar um usuário autorizado.
      } finally {
        checking = false;
      }
    };

    const interval = window.setInterval(() => { void revalidateAccess(); }, 5000);
    const onFocus = () => { void revalidateAccess(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void revalidateAccess();
    };

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

      const fingerprint = dataFingerprint(data);
      if (fingerprint === lastSyncedFingerprint.current) return;
      lastSyncedFingerprint.current = fingerprint;

      void (async () => {
        try {
          const channelPayload = await loadChannelPayload<{ fileName?: string; entries?: unknown[] }>();
          let receiptChannels = Array.isArray(channelPayload?.entries) ? channelPayload.entries : [];

          if (!receiptChannels.length && data.receiptFileName) {
            const currentSnapshot = await loadCurrentSandboxSnapshot(session);
            if (
              currentSnapshot?.receipt_file_name === data.receiptFileName
              && Array.isArray(currentSnapshot.receipt_channels)
              && currentSnapshot.receipt_channels.length
            ) {
              receiptChannels = currentSnapshot.receipt_channels;
              await saveChannelPayload({
                fileName: currentSnapshot.receipt_file_name ?? "Base compartilhada",
                entries: receiptChannels,
              });
            }
          }

          await saveSandboxSnapshot({
            session,
            profile,
            data,
            receiptChannels,
            note: "Atualização publicada pelo ambiente de teste.",
          });
          const when = new Date().toLocaleString("pt-BR");
          setBaseInfo(`Base compartilhada: ${when} • ${profile.display_name ?? session.user.email ?? "usuário"}`);
          setError(null);
        } catch (caught) {
          lastSyncedFingerprint.current = null;
          setError(caught instanceof Error ? caught.message : "Não foi possível publicar a base compartilhada.");
        }
      })();
    };

    window.addEventListener(ANALYSIS_DATA_EVENT, handleAnalysisUpdate);
    return () => window.removeEventListener(ANALYSIS_DATA_EVENT, handleAnalysisUpdate);
  }, [session, profile]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const nextSession = await signInSandbox(email.trim(), password);
      await bootstrap(nextSession);
      setPassword("");
    } catch (caught) {
      signOutSandbox();
      setSession(null);
      setProfile(null);
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setError(null);
    if (newPassword.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError("As duas senhas precisam ser iguais.");
      return;
    }

    setChangingPassword(true);
    try {
      await updateSandboxPassword(session, newPassword);
      const nextProfile = await loadSandboxProfile(session);
      if (!nextProfile) throw new Error("Não foi possível revalidar seu acesso.");
      lastRefreshRequest.current = nextProfile.refresh_requested_at ?? null;
      setProfile(nextProfile);
      document.documentElement.dataset.sandboxRole = nextProfile.role;
      setNewPassword("");
      setNewPasswordConfirm("");
      await hydrateSharedSnapshot(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a troca de senha.");
    } finally {
      setChangingPassword(false);
    }
  }

  function logout() {
    signOutSandbox();
    delete document.documentElement.dataset.sandboxRole;
    window.location.reload();
  }

  if (loading) {
    return <main className="sandbox-login-shell"><div className="sandbox-login-card"><ShieldCheck size={34} /><h1>Abrindo ambiente de teste...</h1></div><SandboxStyles /></main>;
  }

  if (!session || !profile) {
    return (
      <main className="sandbox-login-shell">
        <form className="sandbox-login-card" onSubmit={handleLogin}>
          <span className="sandbox-badge"><ShieldCheck size={15} /> AMBIENTE DE TESTE</span>
          <h1>Financial Analytics</h1>
          <p>Entre com o acesso criado pelo administrador. O dashboard de produção não é afetado por este ambiente.</p>
          <label><span>E-mail</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label><span>Senha</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <div className="sandbox-error">{error}</div>}
          <button type="submit" disabled={loading}><LogIn size={17} />{loading ? "Aguarde..." : "Entrar"}</button>
        </form>
        <SandboxStyles />
      </main>
    );
  }

  if (profile.must_change_password) {
    return (
      <main className="sandbox-login-shell">
        <form className="sandbox-login-card sandbox-password-change" onSubmit={handlePasswordChange}>
          <span className="sandbox-badge"><KeyRound size={15} /> PRIMEIRO ACESSO</span>
          <h1>Crie sua senha</h1>
          <p>Você entrou com uma senha temporária. Defina sua senha definitiva antes de acessar qualquer informação financeira.</p>
          <div className="sandbox-account-chip"><strong>{profile.display_name ?? "Usuário"}</strong><span>{session.user.email}</span></div>
          <label><span>Nova senha</span><input type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
          <label><span>Confirmar nova senha</span><input type="password" minLength={8} autoComplete="new-password" value={newPasswordConfirm} onChange={(event) => setNewPasswordConfirm(event.target.value)} required /></label>
          {error && <div className="sandbox-error">{error}</div>}
          <button type="submit" disabled={changingPassword}><KeyRound size={17} />{changingPassword ? "Salvando..." : "Salvar nova senha e entrar"}</button>
          <button className="sandbox-link-button" type="button" onClick={logout}>Sair e usar outro acesso</button>
        </form>
        <SandboxStyles />
      </main>
    );
  }

  return (
    <>
      <div className="sandbox-test-banner">
        <div>
          <CheckCircle2 size={16} />
          <strong>TESTE</strong>
          <span>{baseInfo}</span>
          <span>Perfil: {profile.role}</span>
          {error && <span className="sandbox-banner-error">⚠ {error}</span>}
        </div>
        <div className="sandbox-banner-actions">
          {profile.role === "admin" && <button type="button" onClick={() => setUsersOpen(true)}><Users size={15} /> Usuários</button>}
          <button type="button" onClick={logout}><LogOut size={15} /> Sair</button>
        </div>
      </div>
      {children}
      {usersOpen && profile.role === "admin" && <SandboxUserAdmin session={session} onClose={() => setUsersOpen(false)} />}
      <SandboxStyles />
    </>
  );
}

function SandboxStyles() {
  return <style jsx global>{`
    .sandbox-login-shell { min-height:100vh; display:grid; place-items:center; background:#f4f6fb; padding:24px; color:#171d2d; }
    .sandbox-login-card { width:min(430px,100%); background:#fff; border:1px solid #e6eaf2; border-radius:20px; padding:30px; box-shadow:0 18px 60px rgba(27,38,77,.10); display:grid; gap:17px; }
    .sandbox-login-card h1 { margin:0; font-size:28px; }
    .sandbox-login-card p { margin:0; color:#687089; line-height:1.55; }
    .sandbox-login-card label { display:grid; gap:7px; font-size:13px; font-weight:700; }
    .sandbox-login-card input { min-height:44px; border:1px solid #d8deeb; border-radius:11px; padding:0 13px; font:inherit; }
    .sandbox-login-card button { min-height:44px; border:0; border-radius:11px; background:#5269e8; color:#fff; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; }
    .sandbox-login-card button:disabled { opacity:.62; cursor:wait; }
    .sandbox-login-card .sandbox-link-button { min-height:auto; background:transparent; color:#5269e8; padding:4px; font-weight:750; }
    .sandbox-badge { width:max-content; display:flex; align-items:center; gap:6px; font-size:11px; font-weight:900; letter-spacing:.08em; color:#5269e8; background:#eef1ff; border-radius:999px; padding:7px 10px; }
    .sandbox-account-chip { display:grid; gap:2px; padding:11px 12px; border:1px solid #e5e8f0; border-radius:11px; background:#f8f9fc; }
    .sandbox-account-chip strong { font-size:12px; }.sandbox-account-chip span { color:#81899a; font-size:10px; }
    .sandbox-error { padding:10px 12px; border-radius:10px; background:#fff0f1; color:#b42332; font-size:13px; }
    .sandbox-test-banner { position:relative; z-index:1000; min-height:40px; padding:7px 18px; background:#171d2d; color:#fff; display:flex; align-items:center; justify-content:space-between; gap:14px; font-size:12px; }
    .sandbox-test-banner > div:first-child { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .sandbox-banner-actions { display:flex; align-items:center; gap:7px; flex:0 0 auto; }
    .sandbox-test-banner button { border:1px solid rgba(255,255,255,.22); background:transparent; color:#fff; border-radius:8px; padding:6px 9px; display:flex; gap:6px; align-items:center; cursor:pointer; }
    .sandbox-banner-error { color:#ffd1d5; font-weight:700; }
    @media(max-width:640px){
      .sandbox-login-shell { padding:16px; }.sandbox-login-card { padding:24px 20px; border-radius:18px; }.sandbox-login-card h1 { font-size:25px; }
      .sandbox-test-banner { align-items:center; padding-left:10px; padding-right:10px; }.sandbox-test-banner span:not(.sandbox-banner-error) { display:none; }.sandbox-test-banner button { padding:6px 7px; font-size:10px; }
    }
  `}</style>;
}
