import type { ComponentProps } from "react";

export function useRouter() {
  return { refresh: () => window.dispatchEvent(new Event("fixture-refresh")) };
}
export default function Link(props: ComponentProps<"a">) {
  return <a {...props} />;
}
