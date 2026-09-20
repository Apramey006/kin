import type { Metadata } from "next";
import { MemoryAtlas } from "@/components/memory-graph/MemoryAtlas";

export const metadata: Metadata = {
  title: "Memory Atlas · Kin",
  description: "Explore the people, places, and stories that connect your family.",
};

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const params = await searchParams;
  return <MemoryAtlas initialDemo={params.demo === "1"} />;
}
