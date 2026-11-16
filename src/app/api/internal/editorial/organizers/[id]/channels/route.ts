import { handleEditorialTrust } from "@/integrations/editorial/boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Readiness probe (38 s) + command (12 s) + margin within the Hobby 60 s limit.
export const maxDuration = 60;

// V026 official channel (exact origin) of an existing organizer. Admin only; the Engine decides and returns the receipt.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleEditorialTrust(request, "channel", id);
}
