import { PublicHome } from "@/presentation/public/PublicHome";
import "./catalog.css";

export default function Loading() {
  return <PublicHome result={{ status: "loading" }} selection={null} />;
}
