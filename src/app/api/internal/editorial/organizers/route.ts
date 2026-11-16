import { handleEditorialOrganizerCreation } from "@/integrations/editorial/boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// V022 registration of ONE organizer and its official channel. Admin only; the Engine decides and returns the receipt.
export async function POST(request: Request) {
  return handleEditorialOrganizerCreation(request);
}
