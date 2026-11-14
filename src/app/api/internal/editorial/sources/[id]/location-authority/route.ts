import { handleEditorialTrust } from "@/integrations/editorial/boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// V026 declare or withdraw a source's location authority. Admin only; the Engine decides and returns the receipt.
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleEditorialTrust(request, "locationAuthority", id);
}
