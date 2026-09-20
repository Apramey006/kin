"use client";
/* Private, signed URLs are rendered directly rather than cached by an image proxy. */
/* eslint-disable @next/next/no-img-element */

import { authenticatedFetch, contributionKey } from "@/lib/client-auth";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Headphones, Mic, Plus, Sparkles, Users } from "lucide-react";
import { FamilyGraph } from "@/components/FamilyGraph";
import { Recorder } from "@/components/Recorder";
import { Sheet } from "@/components/Sheet";
import { WeaverInbox } from "@/components/WeaverInbox";
import { initials, type FamilyData } from "@/lib/family-data";
import { planStory, storyEvidence, storyTopics } from "@/lib/living-stories";
import type { GraphNodeRow } from "@/lib/types";
import { StoryPlayer } from "./StoryPlayer";
import styles from "./stories.module.css";

export function LivingStories({ data, topicId, refresh }: { data: FamilyData; topicId: string | null; refresh: () => Promise<void> }) {
  const topics = useMemo(() => storyTopics(data), [data]);
  const topic = data.nodes.find((n) => n.id === topicId);
  if (topic) return <StoryRoom key={topic.id} data={data} topic={topic} refresh={refresh} />;
  return <div className={styles.stories}>
    <header className="page-header">
      <div>
        <h1>Living Stories</h1>
        <p className="muted">Your family’s memories, told in their own voices.</p>
      </div>
    </header>
    {topicId && <p className="notice" role="status">That story is no longer available. Explore another family story below.</p>}
    {topics.length ? <>
      <div className={styles.collectionHeading}><h2>Stories to spend time with</h2><span>{topics.length} {topics.length === 1 ? "story" : "stories"}</span></div>
      <div className={styles.collection}>
        {topics.map(({ node, chapters, photos, voices }, index) => <Link className={`${styles.storyCard} ${index === 0 ? styles.featured : ""}`} key={node.id} href={`/stories?topic=${encodeURIComponent(node.id)}`}>
          <div className={styles.cardArt}>
            {photos[0]?.mediaUrl ? <img src={photos[0].mediaUrl} alt={photos[0].caption || `A family photo connected to ${node.label}`} /> : <div className={styles.orbits} aria-hidden="true"><i /><i /><i /><BookOpen /></div>}
            <span className={styles.type}>{node.type}</span>
            <span className={styles.cardPlay}><Headphones aria-hidden="true" /></span>
          </div>
          <div className={styles.cardBody}><span className={styles.eyebrow}>{voices > 1 ? "REMEMBERED TOGETHER" : "THE START OF A STORY"}</span><h3>{node.label}</h3><p>{voices} {voices === 1 ? "voice" : "voices"} · {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}</p><span className={styles.cardAction}>Hear the story <ArrowRight size={17} aria-hidden="true" /></span></div>
        </Link>)}
      </div>
    </> : <div className={styles.empty}><BookOpen size={36} aria-hidden="true" /><h2>Every story starts with a voice.</h2><p>Record a memory about a person, place, or tradition. Its connections will become a story you can listen to together.</p>{data.role !== "loved_one" && <Link className="button" href="/family">Add your first memory <Plus size={17} aria-hidden="true" /></Link>}</div>}
    <p className={styles.footer}><Users size={15} aria-hidden="true" /> Told by your family. Each chapter keeps its original source.</p>
  </div>;
}

function StoryRoom({ data, topic, refresh }: { data: FamilyData; topic: GraphNodeRow; refresh: () => Promise<void> }) {
  const plan = useMemo(() => planStory(data, topic.id), [data, topic.id]);
  const [queue, setQueue] = useState(() => plan.chapters.map((m) => m.id));
  const [selected, setSelected] = useState<string | null>(queue[0] ?? null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [compose, setCompose] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [asking, setAsking] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [calm, setCalm] = useState(data.role === "loved_one");
  const [photoSource, setPhotoSource] = useState<string | null>(null);
  const chapters = queue.flatMap((id) => { const memory = plan.chapters.find((m) => m.id === id); return memory ? [memory] : []; });
  const pending = plan.chapters.filter((m) => !queue.includes(m.id));
  const active = chapters.find((m) => m.id === selected) ?? chapters[0];
  const index = chapters.findIndex((m) => m.id === active?.id);
  const owner = data.relatives.find((r) => r.id === active?.contributor_id);
  const me = data.relatives.find((r) => r.id === data.relativeId);
  const evidence = useMemo(() => storyEvidence(data, active?.id ?? ""), [data, active?.id]);
  const photo = plan.photos.find((p) => p.contributor_id === active?.contributor_id) ?? plan.photos[0];
  const openedPhoto = plan.photos.find((p) => p.id === photoSource);
  const voices = new Set(plan.chapters.map((m) => m.contributor_id)).size;
  const select = (id: string, play = false) => { if (id === active?.id) return; setSelected(id); setAutoPlay(play); setFinished(false); setPlaying(false); };
  const ask = async () => {
    setAsking(true); setQuestionError(null);
    try {
      const response = await authenticatedFetch(`/api/weaver/run?topic=${encodeURIComponent(topic.id)}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "A question could not be created.");
      const recipient = data.relatives.find((r) => r.id === result.question?.target_relative_id);
      setNotice(result.question ? `A question about this story is ready for ${recipient?.name ?? "your family"} in Memories.` : "There are no new questions for this story right now. You can still add your part.");
      await refresh();
    } catch (error) { setQuestionError(error instanceof Error ? error.message : "Please try again."); }
    finally { setAsking(false); }
  };
  const save = async (blob: Blob, mime: string) => {
    if (!me) return false;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", new File([blob], mime.includes("mp4") ? "story.m4a" : "story.webm", { type: mime }));
      body.append("contributor_id", me.id);
      body.append("topic_id", topic.id);
      const response = await authenticatedFetch("/api/memories/story", { method: "POST", body, headers: { "Idempotency-Key": await contributionKey(blob, [me.id, topic.id, mime]) } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your memory could not be saved.");
      setCompose(false);
      setNotice("Your part is saved. A new chapter is joining this story.");
      await refresh();
      return true;
    } catch (error) { setQuestionError(error instanceof Error ? error.message : "Your memory could not be saved."); return false; } finally { setBusy(false); }
  };
  return <div className={`${styles.stories} ${calm ? styles.calm : ""}`}>
    <div className={styles.roomTop}><Link href="/stories"><ArrowLeft size={16} aria-hidden="true" /> All stories</Link><button aria-pressed={calm} onClick={() => setCalm(!calm)}><Headphones size={16} aria-hidden="true" /> Quiet view</button></div>
    <header className={styles.roomHeading}><span className={styles.eyebrow}>A LIVING STORY</span><h1>{topic.label}</h1><p>{voices} {voices === 1 ? "voice" : "voices"}, one thread. There’s always room for another memory.</p></header>
    {notice && <p className="notice notice-success" role="status">{notice}</p>}
    {pending.length > 0 && <div className={styles.newChapter} role="status"><Sparkles size={20} aria-hidden="true" /><span><strong>{data.relatives.find((r) => r.id === pending[0].contributor_id)?.name ?? "Your family"} added to the story.</strong> {pending.length} new {pending.length === 1 ? "chapter is" : "chapters are"} ready.</span><button onClick={() => { setQueue([...queue, ...pending.map((m) => m.id)]); select(pending[0].id); setNotice(null); }}>Hear what’s new <ArrowRight size={16} aria-hidden="true" /></button></div>}
    <div className={styles.roomLayout}>
      <section className={styles.listening} aria-label="Story player">
        <div className={`${styles.scene} ${playing ? styles.isPlaying : ""}`}>
          {photo?.mediaUrl ? <button className={styles.photoButton} onClick={() => setPhotoSource(photo.id)} aria-label="Open related photo"><img src={photo.mediaUrl} alt={photo.caption || `Family photo connected to ${topic.label}`} /><span>Related family photo · View source</span></button> : <div className={styles.voiceScene} aria-hidden="true"><div className={styles.voiceOrbit} /><div className={styles.voiceOrbit} /><div className={styles.voiceAvatar}>{initials(owner?.name ?? "Your family")}</div><div className={styles.wave}>{[12, 25, 18, 36, 50, 32, 20, 42, 28, 15, 32, 45, 24, 12, 22].map((height, i) => <i key={i} style={{ height, animationDelay: `${i * 0.09}s` }} />)}</div></div>}
          <span className={styles.sceneLabel}><span /> {playing ? "A FAMILIAR VOICE" : "TAKE A MOMENT TOGETHER"}</span>
        </div>
        {active ? <div className={styles.chapterContent}>
          <div className={styles.chapterMeta}><span className={styles.eyebrow}>CHAPTER {String(index + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}</span><span className={styles.speaker}><span>{initials(owner?.name ?? "Family")}</span>{owner?.name ?? "A family member"}</span></div>
          <StoryPlayer key={active.id} memory={active} topic={topic} name={owner?.name ?? "A family member"} autoPlay={autoPlay && selected === active.id} paused={compose || answering || !!photoSource} onPlaying={setPlaying} onComplete={() => {
            if (index + 1 < chapters.length) select(chapters[index + 1].id, true);
            else { setFinished(true); setAutoPlay(false); }
          }} />
          <div className={styles.chapterNavigation}><button disabled={index === 0} onClick={() => select(chapters[index - 1].id)}><ArrowLeft size={17} aria-hidden="true" /> Previous</button><span>{finished ? "You’ve heard every chapter" : "Listen at your own pace"}</span><button disabled={index + 1 >= chapters.length} onClick={() => select(chapters[index + 1].id)}>Next <ArrowRight size={17} aria-hidden="true" /></button></div>
        </div> : <div className={styles.empty}><BookOpen size={30} aria-hidden="true" /><h2>This story is waiting for a voice.</h2><p>Add a recording to start the first chapter.</p></div>}
        {finished && <div className={styles.endNote} role="status"><Check size={20} aria-hidden="true" /><div><strong>The story continues with you.</strong><p>Another detail, another voice, another piece to remember.</p></div></div>}
      </section>
      {!calm && <aside className={styles.chapterSidebar} aria-label="Story chapters"><div className={styles.collectionHeading}><h2>The voices in this story</h2><Mic size={18} aria-hidden="true" /></div><p className={styles.hint}>Each chapter is one person’s recollection.</p><ol className={styles.chapterList}>{chapters.map((memory, i) => {
        const relative = data.relatives.find((r) => r.id === memory.contributor_id);
        return <li key={memory.id}><button aria-current={active?.id === memory.id ? "step" : undefined} onClick={() => select(memory.id)}><span className={styles.chapterNumber}>{String(i + 1).padStart(2, "0")}</span><span><strong>{relative?.name ?? "A family member"}</strong><span>{memory.summary}</span><small>Memory summary · {memory.kind === "answer" ? "A missing piece" : "Voice memory"}</small></span>{active?.id === memory.id && <Headphones size={17} aria-hidden="true" />}</button></li>;
      })}</ol>
      {active && <div className={styles.connections}><span className={styles.eyebrow}>THREADS IN THIS RECORDING</span><div><FamilyGraph key={active.id} nodes={data.nodes.filter((n) => evidence.nodes.has(n.id))} edges={data.edges.filter((e) => evidence.edges.has(e.id))} provenance={data.provenance.filter((p) => p.memory_id === active.id)} relatives={data.relatives} wearerNodeId={topic.id} /></div><div className="flex flex-wrap gap-2">{data.nodes.filter(n => evidence.nodes.has(n.id)).map(n => <Link className="underline text-sm" key={n.id} href={`/stories?topic=${encodeURIComponent(n.id)}`}>Hear {n.label}</Link>)}</div></div>}
      </aside>}
    </div>
    {me && data.role !== "loved_one" && <>
      <section className={styles.contribute}><div><span className={styles.eyebrow}>THERE’S MORE TO REMEMBER</span><h2>What’s your part of the story?</h2><p>A small detail can bring the whole memory closer.</p></div><button className="button" onClick={() => setCompose(true)}><Plus size={18} aria-hidden="true" /> Add your part</button></section>
      <button className={styles.sourceLink} disabled={asking} onClick={ask}><Sparkles size={16} aria-hidden="true" /> {asking ? "Looking for a question…" : "Find a missing piece"}</button>
      {questionError && <p className="notice notice-error" role="alert">{questionError}</p>}
      {data.questions.filter((q) => q.gap_node_id === topic.id && q.status === "open" && q.target_relative_id !== me.id).map((q) => <p className="notice" key={q.id}>A question is waiting for {data.relatives.find((r) => r.id === q.target_relative_id)?.name ?? "a relative"}: {q.question_text}</p>)}
      <WeaverInbox me={me} relatives={data.relatives} topicId={topic.id} providedQuestions={data.questions} onAnswered={refresh} onOpenChange={setAnswering} />
    </>}
    <Sheet open={compose} onClose={() => setCompose(false)} busy={busy} title="Add your part">
      <p className="sheet-intro">What would you like to share about <strong>{topic.label}</strong>? Your recording will become a chapter in this story.</p>
      {compose && <Recorder onRecorded={save} disabled={busy} label="Record your part" />}
    </Sheet>
    <Sheet open={!!openedPhoto} onClose={() => setPhotoSource(null)} title="A photo from your family">
      {openedPhoto && <><img className={styles.sourcePhoto} src={openedPhoto.mediaUrl!} alt={openedPhoto.caption || "Related family photo"} /><p className={styles.sourceTranscript}>{openedPhoto.caption || openedPhoto.summary}</p><p className="small muted">Shared by {data.relatives.find((r) => r.id === openedPhoto.contributor_id)?.name ?? "your family"}. This photo is linked to {topic.label}.</p></>}
    </Sheet>
  </div>;
}
