"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { catalogReturnHref } from "./catalogQuery";

const fallback = "/#activities";

/** Returns to the exact catalogue search the visitor came from; the plain link remains the no-JS fallback. */
export function BackToCatalog() {
  const router = useRouter();
  function back(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = catalogReturnHref(document.referrer, window.location.origin);
    if (!href || href === fallback) return;
    event.preventDefault();
    router.push(href);
  }
  return (
    <Link className="public-back" href={fallback} prefetch={false} onClick={back}>
      <span aria-hidden="true">←</span> Volver a la agenda
    </Link>
  );
}
