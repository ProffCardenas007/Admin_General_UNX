"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getStoredEmail, getStoredRole, getStoredToken } from "../lib/api";

const roleLabels: Record<string, string> = {
  manager: "Gerencia",
  lead: "Líder",
  worker: "Colaborador",
};

/* ── Iconos SVG inline — sin dependencias ── */
const IconDashboard = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <rect x="1" y="1" width="6" height="6" rx="1.5" />
    <rect x="9" y="1" width="6" height="6" rx="1.5" />
    <rect x="1" y="9" width="6" height="6" rx="1.5" />
    <rect x="9" y="9" width="6" height="6" rx="1.5" />
  </svg>
);

const IconTasks = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="2" y="2" width="12" height="12" rx="2.5" />
    <path d="M5.5 8.5l2 2L11 5.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconProjects = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M1.5 5.5h13M1.5 5.5V13A1.5 1.5 0 003 14.5h10a1.5 1.5 0 001.5-1.5V5.5M1.5 5.5l1.5-3h5.5l1.5 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconCalendar = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="1.5" y="3" width="13" height="11.5" rx="2" />
    <path d="M5 1.5V4M11 1.5V4M1.5 7h13" strokeLinecap="round" />
  </svg>
);

const IconClassSchedule = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
    <path d="M1.5 6h13M5.8 2.5v11M9.2 2.5v11M12.6 2.5v11" strokeLinecap="round" />
  </svg>
);

const IconClassAvailability = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
    <path d="M1.5 6h13M5.5 9h1.5m2.2 0h1.5m2.2 0h1.5" strokeLinecap="round" />
  </svg>
);

const IconBell = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 1.5a.75.75 0 01.75.75v.38A5.25 5.25 0 0113.25 7.5v2.44l.94 1.76a.75.75 0 01-.66 1.05H2.47a.75.75 0 01-.66-1.05L2.75 9.94V7.5A5.25 5.25 0 017.25 2.63v-.38A.75.75 0 018 1.5zM6.25 13.5a1.75 1.75 0 003.5 0h-3.5z" />
  </svg>
);

const IconCapture = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 5v6M5 8h6" strokeLinecap="round" />
  </svg>
);

const IconUsers = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M7 7a3 3 0 100-6 3 3 0 000 6zM1 13.5a6 6 0 0112 0H1zM13.5 5.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5zM10.5 13.5c0-1.63-.56-3.13-1.5-4.3A5.5 5.5 0 0115 13.5h-4.5z" />
  </svg>
);

const IconHistory = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 4.5v4l2.5 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconQuincena = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="1.5" y="2" width="13" height="12.5" rx="2" />
    <path d="M5 1.5V4M11 1.5V4M1.5 6.5h13M4.5 9h2M9.5 9h2M4.5 12h2" strokeLinecap="round" />
  </svg>
);

const IconGrid = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" />
    <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" />
    <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" />
    <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" />
  </svg>
);

const IconLogout = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M10.5 5l3 3-3 3M13.5 8H5.5M7.5 2.5H3.5A1.5 1.5 0 002 4v8a1.5 1.5 0 001.5 1.5h4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  workerHidden?: boolean;
};

const MAIN_NAV: NavItem[] = [
  { label: "Dashboard",       href: "/dashboard",      icon: <IconDashboard />,  workerHidden: true },
  { label: "Tareas",          href: "/tasks",           icon: <IconTasks /> },
  { label: "Proyectos",       href: "/projects",        icon: <IconProjects />,   workerHidden: true },
  { label: "Calendario",      href: "/calendar",        icon: <IconCalendar /> },
  { label: "Clases", href: "/class-schedule", icon: <IconClassSchedule /> },
  { label: "Notificaciones",  href: "/notifications",   icon: <IconBell /> },
];

const MANAGER_NAV: NavItem[] = [
  { label: "Usuarios",  href: "/users",   icon: <IconUsers /> },
  { label: "Reporte por Usuario", href: "/user-reports", icon: <IconQuincena /> },
  { label: "Programación de clases", href: "/class-availability", icon: <IconClassAvailability /> },
  { label: "Cursos y sesiones", href: "/class-planning", icon: <IconClassSchedule /> },
  { label: "Grilla de sesiones", href: "/class-grid",     icon: <IconGrid /> },
  { label: "Reporte", href: "/quincenas", icon: <IconQuincena /> },
  { label: "Historial", href: "/history", icon: <IconHistory /> },
];

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      setRole(getStoredRole());
      setEmail(getStoredEmail());
    }
    setReady(true);
  }, [pathname]);

  /* Sin token o en login → sin sidebar */
  if (!ready || pathname === "/" || !getStoredToken()) {
    return null;
  }

  const isWorker = role === "worker";
  const isManager = role === "manager";

  const onLogout = () => {
    window.localStorage.removeItem("sistema_mvp_token");
    window.localStorage.removeItem("sistema_mvp_email");
    window.localStorage.removeItem("sistema_mvp_role");
    window.localStorage.removeItem("sistema_mvp_specialty");
    window.localStorage.removeItem("sistema_mvp_specialties");
    router.replace("/");
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  const visibleMain = MAIN_NAV.filter((item) => !(isWorker && item.workerHidden));

  return (
    <aside className={`app-sidebar${collapsed ? " app-sidebar--collapsed" : ""}`} aria-label="Navegación principal">
      {/* ── Marca ── */}
      <div className="app-sidebar-brand">
        <div className="app-sidebar-brand-mark" aria-hidden="true">U</div>
        <div className="app-sidebar-brand-text">
          <p className="app-sidebar-brand-name">UNX</p>
          <p className="app-sidebar-brand-sub">Sistema de Proyectos</p>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="app-sidebar-collapse-btn"
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      {/* ── Navegación principal ── */}
      <nav className="app-sidebar-nav" aria-label="Secciones">
        {visibleMain.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`app-sidebar-item${isActive(item.href) ? " app-sidebar-item--active" : ""}`}
            title={collapsed ? item.label : undefined}
          >
            <span className="app-sidebar-icon">{item.icon}</span>
            <span className="app-sidebar-label">{item.label}</span>
          </Link>
        ))}

        <div className="app-sidebar-divider" />

        {/* Cargar datos — oculto para colaboradores */}
        {!isWorker && (
          <Link
            href="/capture"
            className={`app-sidebar-item app-sidebar-item--cta${isActive("/capture") ? " app-sidebar-item--active" : ""}`}
            title={collapsed ? "Cargar datos" : undefined}
          >
            <span className="app-sidebar-icon"><IconCapture /></span>
            <span className="app-sidebar-label">Cargar datos</span>
          </Link>
        )}

        {/* Sección gerencia */}
        {isManager && (
          <>
            <div className="app-sidebar-divider" />
            {MANAGER_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`app-sidebar-item${isActive(item.href) ? " app-sidebar-item--active" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <span className="app-sidebar-icon">{item.icon}</span>
                <span className="app-sidebar-label">{item.label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* ── Footer usuario ── */}
      <div className="app-sidebar-footer">
        <div className="app-sidebar-user">
          <p className="app-sidebar-user-email" title={email}>{email}</p>
          <p className="app-sidebar-user-role">{roleLabels[role] ?? role}</p>
        </div>
        <button
          onClick={onLogout}
          className="app-sidebar-logout"
          title="Cerrar sesión"
        >
          <span className="app-sidebar-icon"><IconLogout /></span>
          <span className="app-sidebar-label">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
