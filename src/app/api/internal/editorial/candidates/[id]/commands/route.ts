import { revalidatePath } from "next/cache";
import { handleEditorialB1 } from "@/integrations/editorial/boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const response = await handleEditorialB1(request, "command", id);
  if (response.status === 200 || response.status === 409) {
    revalidatePath("/admin/activities");
    revalidatePath("/admin/candidates");
    revalidatePath("/admin/editorial/" + id);
  }
  return response;
}
