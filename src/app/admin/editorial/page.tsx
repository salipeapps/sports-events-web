import Link from "next/link";
import { requireAdminAccess } from "@/integrations/auth/adminAuth";

export default async function EditorialEntry({ searchParams }: { searchParams: Promise<{ candidate?: string }> }) {
  const session = await requireAdminAccess("catalog.review");
  const { candidate } = await searchParams;
  const valid =
    typeof candidate === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(candidate);
  return (
    <section>
      <h1>Revisión editorial B1</h1>
      <p>
        Consulta los datos y la convocatoria oficial antes de decidir. Aprobar una actividad no la publica; publicación
        y suspensión requieren un administrador.
      </p>
      <form method="get" action="/admin/editorial">
        <label htmlFor="candidate">Identificador del candidato</label>
        <input id="candidate" name="candidate" required maxLength={36} defaultValue={candidate ?? ""} />
        <button type="submit">Buscar candidato</button>
      </form>
      {valid ? (
        <p>
          <Link href={"/admin/editorial/" + candidate}>Inspeccionar candidato</Link>
        </p>
      ) : candidate ? (
        <p role="alert">El identificador debe ser un UUID válido.</p>
      ) : null}
      {session.role === "admin" ? (
        <p>
          <Link href="/admin/editorial/trust">
            Confianza editorial: alias, canales oficiales y autoridad de ubicación
          </Link>
        </p>
      ) : null}
    </section>
  );
}
