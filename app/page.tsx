import Link from "next/link";
import { getServiceClient, FAMILY_ID, supabaseConfigured } from "@/lib/supabase";
import { Users, Heart, Monitor, ArrowRight } from "lucide-react";

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
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-paper px-6 py-16 text-ink">
      {/* Soft warm wash behind the hero, purely decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(47,93,80,0.10),transparent_70%)]"
      />

      <div className="relative w-full max-w-3xl">
        <header className="mb-14 text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary-soft px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            Kin
          </p>
          <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
            The family remembers together.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-balance text-lg leading-relaxed text-ink/60">
            A shared memory for {name}. Every cue comes from something a relative
            actually said.
          </p>
        </header>

        <div className="grid gap-4">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex items-center gap-5 rounded-2xl border border-ink/[0.08] bg-paper-card px-6 py-6 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift sm:px-8"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                <c.icon className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xl font-semibold tracking-[-0.01em] sm:text-2xl">
                  {c.title}
                </div>
                <div className="mt-0.5 text-ink/55">{c.desc}</div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-ink/25 transition-all group-hover:translate-x-1 group-hover:text-primary" />
            </Link>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-ink/40">
          A prototype for family reminiscence. Not a medical device.
        </p>
      </div>
    </main>
  );
}
