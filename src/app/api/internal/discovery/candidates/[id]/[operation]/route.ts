import { handleDiscoveryCommand } from "@/integrations/discovery/commandBoundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, context: { params: Promise<{ id: string; operation: string }> }) {
  const { id, operation } = await context.params;
  return handleDiscoveryCommand(request, id, operation);
}
