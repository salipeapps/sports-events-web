import Link from "next/link";
import { requireAdminAccess } from "@/integrations/auth/adminAuth";

export default async function EditorialEntry({ searchParams }: {
  searchParams: Promise<{ candidate?: string }>;
}) {
  await requireAdminAccess("catalog.review");
  const { candidate } = await searchParams;
  const valid = typeof candidate === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(candidate);
  return (
    <section>
      <h1>Revisión editorial B1</h1>
      <p>Acceso controlado a candidatos de actividades. La escritura remota permanece desactivada hasta el GO de STAGING.</p>
      <form method="get" action="/admin/editorial">
        <label htmlFor="candidate">Identificador del candidato</label>
        <input id="candidate" name="candidate" required maxLength={36} defaultValue={candidate ?? ""} />
        <button type="submit">Buscar candidato</button>
      </form>
      {valid ? <p><Link href={"/admin/editorial/" + candidate}>Inspeccionar candidato</Link></p> :
        candidate ? <p role="alert">El identificador debe ser un UUID válido.</p> : null}
    </section>
  );
}
