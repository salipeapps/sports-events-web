import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { EditorialTrustPanel } from "@/presentation/admin/EditorialTrustPanel";

// V026 trust commands are admin-only in the Engine; `sources.manage` is an admin-only capability.
export default async function EditorialTrustPage() {
  await requireAdminAccess("sources.manage");
  return <EditorialTrustPanel />;
}
