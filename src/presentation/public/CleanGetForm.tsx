"use client";

import { useEffect, useRef, type ComponentProps } from "react";

/**
 * GET form whose shareable URL leaves out empty optional fields (`idioma=&precio=`). It only
 * trims the submitted entry list; without JavaScript the form still works because the server
 * treats an empty field as "no filter".
 */
export function CleanGetForm(props: Omit<ComponentProps<"form">, "method" | "ref">) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const clean = (event: FormDataEvent) => {
      for (const [name, value] of [...event.formData.entries()])
        if (typeof value === "string" && value.trim() === "") event.formData.delete(name);
    };
    form.addEventListener("formdata", clean);
    return () => form.removeEventListener("formdata", clean);
  }, []);
  return <form {...props} ref={ref} method="get" />;
}
