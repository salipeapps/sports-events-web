import { notFound } from "next/navigation";
import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { EditorialInspector } from "@/presentation/admin/EditorialInspector";

export default async function EditorialCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAccess("catalog.review");
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) notFound();
  return <EditorialInspector candidateId={id} role={session.role} />;
}
