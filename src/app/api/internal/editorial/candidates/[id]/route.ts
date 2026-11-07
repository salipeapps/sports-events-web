import { handleEditorialB1 } from "@/integrations/editorial/boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Leaves room for the 25 s upstream read budget during an Engine cold start.
export const maxDuration = 30;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleEditorialB1(request, "inspect", id);
}
