"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { CheckCircle2, LogIn, LogOut, ShieldCheck } from "lucide-react";
import {
  getValidSandboxSession,
  loadCurrentSandboxSnapshot,
  loadSandboxProfile,
  signInSandbox,
  signOutSandbox,
  type SandboxProfile,
  type SandboxSession,
} from "@/lib/dashboardSandbox";
import {
  saveAnalysisState,
  saveChannelPayload,
  setStorageConsent,
} from "@/lib/offlineStorage";

export default function SandboxAuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SandboxSession | null>(null);
  const [profile, setProfile] = useState<SandboxProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [baseInfo, setBaseInfo] = useState<string>("Nenhuma base compartilhada publicada ainda.");

  async function bootstrap(nextSession: SandboxSession) {
    const nextProfile = await loadSandboxProfile(nextSession);
    if (!nextProfile) throw new Error("Seu usuário ainda não foi autorizado neste dashboard de teste.");

    const snapshot = await loadCurrentSandboxSnapshot(nextSession);
    if (snapshot) {
      setStorageConsent(true);
      await Promise.all([
        saveAnalysisState({
          invoices: snapshot.invoices,
          receipts: snapshot.receipts,
          invoiceFileName: snapshot.invoice_file_name ?? undefined,
          receiptFileName: snapshot.receipt_file_name ?? undefined,
        }),
        saveChannelPayload({ entries: snapshot.receipt_channels }),
      ]);
      const when = new Date(snapshot.created_at).toLocaleString("pt-BR");
      setBaseInfo(`Base compartilhada: ${when}${snapshot.uploaded_by_name ? ` • ${snapshot.uploaded_by_name}` : ""}`);
    }
    setSession(nextSession);
    setProfile(nextProfile);
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
          setError(caught instanceof Error ? caught.message : "Não foi possível abrir o sandbox.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

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

  if (loading && !session) {
    return <main className="sandbox-login-shell"><div className="sandbox-login-card"><ShieldCheck size={34} /><h1>Abrindo ambiente de teste...</h1></div></main>;
  }

  if (!session || !profile) {
    return (
      <main className="sandbox-login-shell">
        <form className="sandbox-login-card" onSubmit={handleLogin}>
          <span className="sandbox-badge"><ShieldCheck size={15} /> AMBIENTE DE TESTE</span>
          <h1>Financial Analytics</h1>
          <p>Entre para acessar a base compartilhada de testes. O dashboard de produção não é afetado por este ambiente.</p>
          <label><span>E-mail</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label><span>Senha</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <div className="sandbox-error">{error}</div>}
          <button type="submit" disabled={loading}><LogIn size={17} /> {loading ? "Entrando..." : "Entrar"}</button>
        </form>
        <SandboxStyles />
      </main>
    );
  }

  return (
    <>
      <div className="sandbox-test-banner">
        <div><CheckCircle2 size={16} /><strong>TESTE</strong><span>{baseInfo}</span><span>Perfil: {profile.role}</span></div>
        <button type="button" onClick={() => { signOutSandbox(); window.location.reload(); }}><LogOut size={15} /> Sair</button>
      </div>
      {children}
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
    .sandbox-badge { width:max-content; display:flex; align-items:center; gap:6px; font-size:11px; font-weight:900; letter-spacing:.08em; color:#5269e8; background:#eef1ff; border-radius:999px; padding:7px 10px; }
    .sandbox-error { padding:10px 12px; border-radius:10px; background:#fff0f1; color:#b42332; font-size:13px; }
    .sandbox-test-banner { position:relative; z-index:1000; min-height:40px; padding:7px 18px; background:#171d2d; color:#fff; display:flex; align-items:center; justify-content:space-between; gap:14px; font-size:12px; }
    .sandbox-test-banner > div { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .sandbox-test-banner button { border:1px solid rgba(255,255,255,.22); background:transparent; color:#fff; border-radius:8px; padding:6px 9px; display:flex; gap:6px; align-items:center; cursor:pointer; }
    @media(max-width:640px){ .sandbox-test-banner { align-items:flex-start; } .sandbox-test-banner span { display:none; } }
  `}</style>;
}
