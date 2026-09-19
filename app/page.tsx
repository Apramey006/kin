import Link from "next/link";
import { getServiceClient, FAMILY_ID, supabaseConfigured } from "@/lib/supabase";
import { Users, Heart, Monitor } from "lucide-react";

async function wearerName(): Promise<string> {
  if (!supabaseConfigured()) return "your loved one";
  try {
    const { data } = await getServiceClient()
      .from("wearer")
      .select("name")
      .eq("family_id", FAMILY_ID)
      .single();
    return data?.name ?? "your loved one";
  } catch {
    return "your loved one";
  }
}

export default async function Home() {
  const name = await wearerName();
  const cards = [
    {
      href: "/family",
      title: "I'm family",
      desc: "Add photos, record stories, answer Kin's questions.",
      icon: Users,
    },
    {
      href: "/wearer",
      title: `Kin for ${name}`,
      desc: "One button. Point, tap, listen.",
      icon: Heart,
    },
    {
      href: "/stage",
      title: "Stage",
      desc: "Watch the Keepers, the Gate, and the family graph live.",
      icon: Monitor,
    },
  ];
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-paper text-ink">
      <p className="text-sm tracking-[0.3em] uppercase text-primary mb-3">Kin</p>
      <h1 className="text-4xl md:text-5xl font-semibold text-center mb-2">
        The family remembers together.
      </h1>
      <p className="text-lg text-ink/60 mb-12 text-center max-w-xl">
        A shared memory for {name}. Every cue comes from something a relative
        actually said.
      </p>
      <div className="grid gap-5 w-full max-w-3xl">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="flex items-center gap-5 rounded-2xl border border-ink/10 bg-white px-8 py-7 shadow-sm hover:shadow-md hover:border-primary/40 transition"
          >
            <c.icon className="h-9 w-9 text-primary shrink-0" />
            <div>
              <div className="text-2xl font-semibold">{c.title}</div>
              <div className="text-ink/60">{c.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
