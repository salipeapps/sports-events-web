import { handleEditorialB1 } from "@/integrations/editorial/boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Leaves room for the 45 s upstream read budget during an Engine cold start (Hobby allows 60 s).
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleEditorialB1(request, "inspect", id);
}
