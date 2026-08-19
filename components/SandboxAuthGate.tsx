"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { CheckCircle2, KeyRound, LogIn, LogOut, ShieldCheck } from "lucide-react";
import {
  getValidSandboxSession,
  loadCurrentSandboxSnapshot,
  loadSandboxProfile,
  saveSandboxSnapshot,
  signInSandbox,
  signOutSandbox,
  signUpSandbox,
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

const FIRST_ADMIN_EMAIL = "lcsprado4@gmail.com";

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
  const [mode, setMode] = useState<"login" | "first-access">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [baseInfo, setBaseInfo] = useState<string>("Nenhuma base compartilhada publicada ainda.");
  const lastSyncedFingerprint = useRef<string | null>(null);

  async function bootstrap(nextSession: SandboxSession) {
    const nextProfile = await loadSandboxProfile(nextSession);
    if (!nextProfile) throw new Error("Seu usuário ainda não foi autorizado neste dashboard de teste.");

    const snapshot = await loadCurrentSandboxSnapshot(nextSession);
    if (snapshot) {
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
        saveChannelPayload({ entries: snapshot.receipt_channels }),
      ]);
      const when = new Date(snapshot.created_at).toLocaleString("pt-BR");
      setBaseInfo(`Base compartilhada: ${when}${snapshot.uploaded_by_name ? ` • ${snapshot.uploaded_by_name}` : ""}`);
    }
    setSession(nextSession);
    setProfile(nextProfile);
    document.documentElement.dataset.sandboxRole = nextProfile.role;
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

  useEffect(() => {
    if (!session || !profile || profile.role === "viewer") return;

    const handleAnalysisUpdate = (event: Event) => {
      const data = (event as CustomEvent<ImportState>).detail;
      if (!data || (!data.invoices.length && !data.receipts.length)) return;
      if (data.invoiceFileName?.includes("demonstração") || data.receiptFileName?.includes("demonstração")) return;

      const fingerprint = dataFingerprint(data);
      if (fingerprint === lastSyncedFingerprint.current) return;
      lastSyncedFingerprint.current = fingerprint;

      void (async () => {
        try {
          const channels = await loadChannelPayload<{ entries?: unknown[] }>();
          await saveSandboxSnapshot({
            session,
            profile,
            data,
            receiptChannels: channels?.entries ?? [],
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
    setMessage(null);
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

  async function handleFirstAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== FIRST_ADMIN_EMAIL) {
      setError(`Neste primeiro teste, o acesso inicial autorizado é ${FIRST_ADMIN_EMAIL}.`);
      return;
    }
    if (password.length < 8) {
      setError("Escolha uma senha com pelo menos 8 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("As duas senhas precisam ser iguais.");
      return;
    }

    setLoading(true);
    try {
      const result = await signUpSandbox(cleanEmail, password);
      if (result.session) {
        await bootstrap(result.session);
      } else {
        setMode("login");
        setPasswordConfirm("");
        setMessage("Acesso criado. Confira o e-mail para confirmar o cadastro e depois entre com a senha que você acabou de escolher.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o acesso.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode: "login" | "first-access") {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    setPassword("");
    setPasswordConfirm("");
    if (nextMode === "first-access") setEmail(FIRST_ADMIN_EMAIL);
  }

  if (loading && !session) {
    return <main className="sandbox-login-shell"><div className="sandbox-login-card"><ShieldCheck size={34} /><h1>Abrindo ambiente de teste...</h1></div><SandboxStyles /></main>;
  }

  if (!session || !profile) {
    const isFirstAccess = mode === "first-access";
    return (
      <main className="sandbox-login-shell">
        <form className="sandbox-login-card" onSubmit={isFirstAccess ? handleFirstAccess : handleLogin}>
          <span className="sandbox-badge"><ShieldCheck size={15} /> AMBIENTE DE TESTE</span>
          <h1>{isFirstAccess ? "Criar acesso" : "Financial Analytics"}</h1>
          <p>
            {isFirstAccess
              ? "Crie uma senha exclusiva para o Dashboard. Ela não é a senha da sua conta do Supabase."
              : "Entre para acessar a base compartilhada de testes. O dashboard de produção não é afetado por este ambiente."}
          </p>
          <label><span>E-mail</span><input type="email" autoComplete="username" value={email} readOnly={isFirstAccess} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label><span>{isFirstAccess ? "Criar senha" : "Senha"}</span><input type="password" minLength={isFirstAccess ? 8 : undefined} autoComplete={isFirstAccess ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {isFirstAccess && (
            <label><span>Confirmar senha</span><input type="password" minLength={8} autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} required /></label>
          )}
          {message && <div className="sandbox-success">{message}</div>}
          {error && <div className="sandbox-error">{error}</div>}
          <button type="submit" disabled={loading}>
            {isFirstAccess ? <KeyRound size={17} /> : <LogIn size={17} />}
            {loading ? "Aguarde..." : isFirstAccess ? "Criar meu acesso" : "Entrar"}
          </button>
          <button className="sandbox-link-button" type="button" onClick={() => switchMode(isFirstAccess ? "login" : "first-access")}>
            {isFirstAccess ? "Já tenho acesso" : "Primeiro acesso"}
          </button>
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
    .sandbox-login-card input[readonly] { background:#f7f8fc; color:#59627a; }
    .sandbox-login-card button { min-height:44px; border:0; border-radius:11px; background:#5269e8; color:#fff; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; }
    .sandbox-login-card .sandbox-link-button { min-height:auto; background:transparent; color:#5269e8; padding:4px; font-weight:750; }
    .sandbox-badge { width:max-content; display:flex; align-items:center; gap:6px; font-size:11px; font-weight:900; letter-spacing:.08em; color:#5269e8; background:#eef1ff; border-radius:999px; padding:7px 10px; }
    .sandbox-error { padding:10px 12px; border-radius:10px; background:#fff0f1; color:#b42332; font-size:13px; }
    .sandbox-success { padding:10px 12px; border-radius:10px; background:#eefaf4; color:#18794e; font-size:13px; }
    .sandbox-test-banner { position:relative; z-index:1000; min-height:40px; padding:7px 18px; background:#171d2d; color:#fff; display:flex; align-items:center; justify-content:space-between; gap:14px; font-size:12px; }
    .sandbox-test-banner > div { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .sandbox-test-banner button { border:1px solid rgba(255,255,255,.22); background:transparent; color:#fff; border-radius:8px; padding:6px 9px; display:flex; gap:6px; align-items:center; cursor:pointer; }
    .sandbox-banner-error { color:#ffd1d5; font-weight:700; }
    @media(max-width:640px){ .sandbox-test-banner { align-items:flex-start; } .sandbox-test-banner span:not(.sandbox-banner-error) { display:none; } }
  `}</style>;
}
