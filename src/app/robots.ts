import type { MetadataRoute } from "next";
import { indexableOrigin, privatePaths } from "@/config/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = indexableOrigin();
  // Outside an authorized production origin nothing is crawlable (STAGING, previews, local).
  if (!origin) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: privatePaths },
    sitemap: `${origin}/sitemap.xml`,
  };
}
