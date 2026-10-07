import Link from "next/link";
import type { ReactNode } from "react";

import { canAdmin, type AdminSession } from "@/domain/adminAccess";

type AdminSection = "summary";

interface AdminShellProps {
  session: AdminSession;
  children: ReactNode;
  activeSection?: AdminSection;
}

const navigation = [
  { id: "summary", label: "Resumen", href: "/admin" },
  { id: "activities", label: "Actividades" },
  { id: "candidates", label: "Candidatos" },
  { id: "sources", label: "Fuentes", capability: "sources.manage" as const },
  { id: "runs", label: "Ejecuciones", capability: "runs.execute" as const },
  { id: "organizers", label: "Organizadores" },
  { id: "settings", label: "Configuración", capability: "settings.manage" as const },
];

export function AdminShell({ session, children, activeSection = "summary" }: AdminShellProps) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand" aria-label="Valencia Admin">
          <span className="admin-brand-mark" aria-hidden="true" />
          <span className="admin-brand-copy">
            <strong>Valencia</strong>
            <small>Admin</small>
          </span>
        </div>

        <nav className="admin-navigation" aria-label="Administración">
          {navigation.map((item) => {
            const active = item.id === activeSection;
            const allowed = item.capability ? canAdmin(session.role, item.capability) : true;
            const unavailable = !("href" in item);

            if ("href" in item && item.href) {
              return (
                <Link
                  className={`admin-nav-item${active ? " admin-nav-item-active" : ""}`}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  key={item.id}
                >
                  {item.label}
                </Link>
              );
            }

            return (
              <span
                className="admin-nav-item admin-nav-item-disabled"
                aria-disabled="true"
                title={allowed && unavailable ? "Disponible en una próxima iteración" : "Requiere rol admin"}
                key={item.id}
              >
                <span>{item.label}</span>
                {!allowed ? <small>Solo admin</small> : null}
              </span>
            );
          })}
        </nav>

        <Link className="admin-public-link" href="/">
          <span aria-hidden="true">↗</span> Ver sitio público
        </Link>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <strong className="admin-context">Valencia</strong>
          <div className="admin-topbar-actions">
            <div className="admin-language" aria-label="Idioma de interfaz">
              <span className="admin-language-active">ES</span>
              <span>EN</span>
            </div>
            <span className="admin-identity" title={session.displayName}>
              <span aria-hidden="true">◉</span> {session.role === "admin" ? "Admin" : "Reviewer"}
            </span>
          </div>
        </header>

        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
