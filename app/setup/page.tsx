import { Setup } from "./Setup";
export const dynamic = "force-dynamic";
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  const { event } = await searchParams;
  const eventId = typeof event === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(event) ? event : undefined;
  return <Setup eventId={eventId} />;
}
