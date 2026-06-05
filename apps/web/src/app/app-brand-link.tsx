"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStoredRole } from "../lib/api";

export default function AppBrandLink() {
  const router = useRouter();
  const [href, setHref] = useState("/dashboard");

  useEffect(() => {
    const role = getStoredRole();
    setHref(role === "worker" ? "/tasks" : "/dashboard");
  }, []);

  return (
    <Link
      href={href}
      className="app-brand"
      aria-label="Ir al panel principal"
      onClick={(event) => {
        event.preventDefault();
        const role = getStoredRole();
        router.push(role === "worker" ? "/tasks" : "/dashboard");
      }}
    >
      <div>
        <p className="app-brand-name">UNX</p>
        <p className="app-brand-subtitle">Sistema de Proyectos</p>
      </div>
    </Link>
  );
}