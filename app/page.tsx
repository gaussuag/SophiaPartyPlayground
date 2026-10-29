import { env } from "cloudflare:workers";
import { Playground } from "./Playground";
export const dynamic = "force-dynamic";
export default function Home() {
  return <Playground localDevelopment={import.meta.env.DEV} defaultEventId={env.EVENT_ID ?? (import.meta.env.DEV ? "local-sophia" : "sophia-party")} />;
}
