"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthBoundary } from "@/lib/client-auth";
import { AppShell, LoadingView } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { LivingStories } from "@/components/living-stories/LivingStories";
import { useFamilyData } from "@/lib/family-data";
import "./stories.css";
function StoriesPage() {
  const { data, loading, error, refresh } = useFamilyData();
  const params = useSearchParams();
  return <AppShell data={data} className="living-stories-page">
    {loading ? <LoadingView /> : data ? <>
      {error && <p className="notice notice-error" role="alert">{error} <button onClick={refresh}>Try again</button></p>}
      <LivingStories data={data} topicId={params.get("topic")} refresh={refresh} />
    </> : <div className="empty-state"><h1>Living Stories</h1><p role="alert">{error ?? "Your family could not be loaded."}</p><Button onClick={refresh}>Try again</Button></div>}
  </AppShell>;
}
export default function Page() {
  return <AuthBoundary><Suspense fallback={<p role="status">Loading stories…</p>}><StoriesPage /></Suspense></AuthBoundary>;
}
