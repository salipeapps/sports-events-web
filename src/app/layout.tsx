import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { indexableOrigin } from "@/config/seo";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

/** Evaluated per request so STAGING/preview never inherit production indexability. */
export async function generateMetadata(): Promise<Metadata> {
  const origin = indexableOrigin();
  return {
    title: {
      default: "Sports Events",
      template: "%s | Sports Events",
    },
    description: "Actividades deportivas para participar en Valencia y alrededores, verificadas con su organizador.",
    ...(origin ? { metadataBase: new URL(origin) } : { robots: { index: false, follow: false } }),
  };
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={manrope.variable} lang="es">
      <body>{children}</body>
    </html>
  );
}
