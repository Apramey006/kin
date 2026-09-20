"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell, LoadingView } from "@/components/AppShell";
import { LivingStories } from "@/components/living-stories/LivingStories";
import { useFamilyData } from "@/lib/family-data";

function StoriesPage() {
  const { data, loading, error, refresh } = useFamilyData();
  const params = useSearchParams();
  return <AppShell data={data}>
    {loading ? <LoadingView /> : data ? <>
      {error && <p className="notice notice-error" role="alert">{error} <button onClick={refresh}>Try again</button></p>}
      <LivingStories data={data} topicId={params.get("topic")} refresh={refresh} />
    </> : <div className="empty-state"><h1>Living Stories</h1><p role="alert">{error ?? "Your family could not be loaded."}</p><button className="button" onClick={refresh}>Try again</button></div>}
  </AppShell>;
}

export default function Page() {
  return <Suspense fallback={<LoadingView />}><StoriesPage /></Suspense>;
}
