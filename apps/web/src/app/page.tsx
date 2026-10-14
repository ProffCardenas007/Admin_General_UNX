"use client";

import { Suspense, useState } from "react";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL, storeSession } from "../lib/api";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const sessionExpired = useSearchParams().get("session") === "expired";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const loginResponse = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
      });

      const accessToken = loginResponse.data.accessToken as string;
      const role = (loginResponse.data.user?.role as string | undefined) ?? "";
      const specialty = (loginResponse.data.user?.specialty as string | undefined) ?? "";
      const specialties = Array.isArray(loginResponse.data.user?.specialties)
        ? (loginResponse.data.user.specialties as string[])
        : specialty
          ? [specialty]
          : [];
      const nextRoute = role === "worker" ? "/tasks" : "/dashboard";
      storeSession({ token: accessToken, email, role, specialty, specialties });
      router.replace(nextRoute);
    } catch {
      setError("No se pudo iniciar sesión. Verifica usuario, contraseña y backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-12 md:px-6">
      <section className="glass-panel fade-up p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Sistema de proyectos
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          Control Académico UNX
        </h1>
        <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
          Inicia sesión para acceder al panel.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="ui-control w-full"
            placeholder="Correo electrónico"
            type="email"
            autoComplete="email"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            className="ui-control w-full"
            placeholder="Contraseña"
            autoComplete="current-password"
            onKeyDown={(event) => { if (event.key === "Enter") void onLogin(); }}
          />
          <button
            onClick={onLogin}
            disabled={loading}
            className="ui-btn ui-btn-primary w-full justify-center"
          >
            {loading ? "Entrando..." : "Conectar"}
          </button>
        </div>

        {sessionExpired && !error ? (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Tu sesión expiró. Inicia sesión de nuevo para continuar.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
