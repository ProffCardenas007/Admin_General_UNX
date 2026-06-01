"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStoredRole } from "../lib/api";

export default function AppBrandLink() {
  const [href, setHref] = useState("/dashboard");

  useEffect(() => {
    const role = getStoredRole();
    setHref(role === "worker" ? "/tasks" : "/dashboard");
  }, []);

  return (
    <Link href={href} className="app-brand" aria-label="Ir al panel principal">
      <img src="/Logo%20UNX%20PIENSE.png" alt="Logo de la empresa" className="app-brand-logo" />
      <div>
        <p className="app-brand-name">UNX</p>
        <p className="app-brand-subtitle">Sistema de Proyectos</p>
      </div>
    </Link>
  );
}