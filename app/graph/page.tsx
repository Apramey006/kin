import type { Metadata } from "next";
import { MemoryAtlas } from "@/components/memory-graph/MemoryAtlas";

export const metadata: Metadata = {
  title: "Memory Atlas · Kin",
  description: "Explore the people, places, and stories that connect your family.",
};

export default function GraphPage({ searchParams }: { searchParams: { demo?: string } }) {
  return <MemoryAtlas initialDemo={searchParams.demo === "1"} />;
}
