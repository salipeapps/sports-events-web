"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { canAdmin, type AdminSession } from "@/domain/adminAccess";

interface AdminNavigationProps {
  session: AdminSession;
}

const navigation = [
  { id: "summary", label: "Resumen", href: "/admin" },
  { id: "activities", label: "Actividades", href: "/admin/activities" },
  { id: "candidates", label: "Candidatos", href: "/admin/candidates" },
  { id: "sources", label: "Fuentes", capability: "sources.manage" as const },
  { id: "runs", label: "Ejecuciones", capability: "runs.execute" as const },
  { id: "organizers", label: "Organizadores" },
  { id: "settings", label: "Configuración", capability: "settings.manage" as const },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavigation({ session }: AdminNavigationProps) {
  const pathname = usePathname();

  return (
    <nav className="admin-navigation" aria-label="Administración">
      {navigation.map((item) => {
        const allowed = item.capability ? canAdmin(session.role, item.capability) : true;

        if ("href" in item && item.href) {
          const active = isActive(pathname, item.href);
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
            title={allowed ? "Disponible en una próxima iteración" : "Requiere rol admin"}
            key={item.id}
          >
            <span>{item.label}</span>
            {!allowed ? <small>Solo admin</small> : null}
          </span>
        );
      })}
    </nav>
  );
}
