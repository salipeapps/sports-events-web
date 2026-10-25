import { revalidatePath } from "next/cache";
import { handleEditorialB1 } from "@/integrations/editorial/boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const response = await handleEditorialB1(request, "import", null);
  if (response.status === 200 || response.status === 409) {
    revalidatePath("/admin/candidates");
    revalidatePath("/admin/activities");
  }
  return response;
}
