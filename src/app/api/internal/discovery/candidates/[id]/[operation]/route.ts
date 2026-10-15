import { handleDiscoveryCommand } from "@/integrations/discovery/commandBoundary";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, context: { params: Promise<{ id: string; operation: string }> }) {
  const { id, operation } = await context.params;
  const response = await handleDiscoveryCommand(request, id, operation);
  if (response.status === 200 || response.status === 409) {
    revalidatePath("/admin/discovery");
    revalidatePath(`/admin/discovery/results/${id}`);
  }
  return response;
}
