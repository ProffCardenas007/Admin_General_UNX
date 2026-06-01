"use client";

import { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const DEFAULT_LOGIN_EMAIL =
  process.env.NEXT_PUBLIC_DEFAULT_LOGIN_EMAIL ?? "gerente@empresa.com";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState(DEFAULT_LOGIN_EMAIL);
  const [password, setPassword] = useState("123456");
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
      const nextRoute = role === "worker" ? "/tasks" : "/dashboard";
      window.localStorage.setItem("sistema_mvp_token", accessToken);
      window.localStorage.setItem("sistema_mvp_email", email);
      if (role) {
        window.localStorage.setItem("sistema_mvp_role", role);
      }
      if (specialty) {
        window.localStorage.setItem("sistema_mvp_specialty", specialty);
      } else {
        window.localStorage.removeItem("sistema_mvp_specialty");
      }
      router.replace(nextRoute);
    } catch {
      setError("No se pudo iniciar sesión. Verifica usuario, contraseña y backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Sistema de proyectos
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Control ejecutivo tipo monday
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              Inicia sesion y observa avance global, carga por persona y tendencia
              semanal de horas en un solo panel.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 font-mono text-xs">
            API: {API_URL}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[1.2fr_1.2fr_auto]">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
              placeholder="Correo"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
              placeholder="Contraseña"
          />
          <button
            onClick={onLogin}
            disabled={loading}
            className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Entrando..." : "Conectar"}
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
