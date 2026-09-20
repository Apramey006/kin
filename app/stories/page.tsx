"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthBoundary, SignOutButton, useKinAuth } from "@/lib/client-auth";
import { LivingStories } from "@/components/living-stories/LivingStories";
import { useFamilyData } from "@/lib/family-data";
import "./stories.css";
function StoriesPage() {
  const { data, loading, error, refresh } = useFamilyData();
  const { role } = useKinAuth();
  const params = useSearchParams();
  return <main className="living-stories-page min-h-screen bg-paper p-4 md:p-8">
    <nav aria-label="Story navigation" className="mx-auto flex max-w-7xl justify-between gap-4 pb-4">
      <Link href={role === "wearer" ? "/wearer" : "/family"}>Back to Kin</Link><SignOutButton />
    </nav>
    {loading ? <p role="status">Loading family stories…</p> : data ? <>
      {error && <p role="alert">{error} <button onClick={refresh}>Try again</button></p>}
      <LivingStories data={data} topicId={params.get("topic")} refresh={refresh} />
    </> : <div><h1>Living Stories</h1><p role="alert">{error ?? "Your family could not be loaded."}</p><button onClick={refresh}>Try again</button></div>}
  </main>;
}
export default function Page() {
  return <AuthBoundary><Suspense fallback={<p role="status">Loading stories…</p>}><StoriesPage /></Suspense></AuthBoundary>;
}
