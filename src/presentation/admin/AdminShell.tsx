import Link from "next/link";
import type { ReactNode } from "react";

import type { AdminSession } from "@/domain/adminAccess";
import { AdminNavigation } from "./AdminNavigation";

interface AdminShellProps {
  session: AdminSession;
  children: ReactNode;
}

export function AdminShell({ session, children }: AdminShellProps) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand" aria-label="Sports Events Admin">
          <span className="admin-brand-mark" aria-hidden="true" />
          <span className="admin-brand-copy">
            <strong>Sports Events</strong>
            <small>Admin</small>
          </span>
        </div>

        <AdminNavigation session={session} />

        <Link className="admin-public-link" href="/">
          <span aria-hidden="true">↗</span> Ver sitio público
        </Link>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <strong className="admin-context">Panel de administración</strong>
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
