"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp, Focus, Image as ImageIcon, Leaf, MapPin, Maximize2, Mic, Minus, Network, Pause, Play, Plus, RotateCcw, Search, Sparkles, Sprout, Users, X } from "lucide-react";
import ReactFlow, { Background, BackgroundVariant, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlowProvider, useReactFlow, useStore, type Edge, type EdgeProps, type Node, type NodeProps } from "reactflow";
import "reactflow/dist/style.css";
import { chronologicalMemories, ENTITY_STYLE, graphAtMoment, layoutMemoryGraph, memoriesForEntity, memoryConnections, relationshipLabel, routeMemoryConnection, type GraphObstacle, type MemoryGraphData } from "@/lib/memory-graph";
import { DEMO_MEMORY_GRAPH } from "@/lib/memory-graph-demo";
import type { MemoryRow, NodeType } from "@/lib/types";
import { useMemoryGraph } from "./useMemoryGraph";
import styles from "./memory-atlas.module.css";

const TYPE_ICONS = { person: Users, tradition: Sprout, object: BookOpen, place: MapPin, event: Sparkles };
const KIND_LABELS = { story: "Voice story", photo: "Photograph", answer: "Weaver answer" };
type Selection = { type: "node" | "edge" | "memory"; id: string } | null;
type AtlasNodeData = {
  label: string; type: NodeType | "memory"; color: string; sources: number;
  root: boolean; active: boolean; dim: boolean; kind?: MemoryRow["kind"];
};

function SourceIcon({ kind, size = 16 }: { kind: MemoryRow["kind"]; size?: number }) {
  const Icon = kind === "photo" ? ImageIcon : kind === "answer" ? Sparkles : Mic;
  return <Icon size={size} aria-hidden="true" />;
}

function AtlasNode({ data }: NodeProps<AtlasNodeData>) {
  const Icon = data.type === "memory" ? Mic : TYPE_ICONS[data.type];
  return (
    <div className={`${styles.entity} ${data.type === "person" ? styles.person : styles.cardNode} ${data.type === "memory" ? styles.memoryNode : ""} ${data.root ? styles.rootNode : ""} ${data.active ? styles.activeNode : ""} ${data.dim ? styles.dimNode : ""}`} style={{ "--entity-color": data.color } as CSSProperties}>
      {([Position.Top, Position.Right, Position.Bottom, Position.Left]).map((position) => (
        <span key={position}>
          <Handle type="source" position={position} id={`s-${position}`} className={styles.handle} />
          <Handle type="target" position={position} id={`t-${position}`} className={styles.handle} />
        </span>
      ))}
      {data.type === "person" ? (
        <>
          <div className={styles.personHalo}><div className={styles.personAvatar}>{data.label.slice(0, 1)}{data.root && <span className={styles.rootStar}><Sparkles size={11} /></span>}</div></div>
          <strong>{data.label}</strong>
          <span className={styles.nodeCaption}>{data.root ? "AT THE HEART" : `${data.sources} ${data.sources === 1 ? "memory" : "memories"}`}</span>
        </>
      ) : (
        <>
          <div className={styles.cardNodeTop}><Icon size={15} /><span>{data.type === "memory" ? KIND_LABELS[data.kind ?? "story"] : ENTITY_STYLE[data.type].singular}</span></div>
          <strong>{data.label}</strong>
          {data.type !== "memory" && <span className={styles.nodeCaption}>{data.sources} {data.sources === 1 ? "memory" : "memories"}</span>}
          {data.type === "memory" && <div className={styles.waveform} aria-hidden="true">{[7, 14, 10, 22, 15, 27, 11, 19, 25, 12, 18, 8, 15, 23, 9].map((height, index) => <i key={index} style={{ height }} />)}</div>}
        </>
      )}
    </div>
  );
}

function AtlasEdge(props: EdgeProps<{ active: boolean; dim: boolean; trail: boolean; onSelect: () => void; label: string; obstacles: GraphObstacle[] }>) {
  const { sourceX, sourceY, targetX, targetY, data } = props;
  const { path, labelX, labelY } = routeMemoryConnection({ x: sourceX, y: sourceY }, { x: targetX, y: targetY },
    data?.obstacles ?? [], props.source, props.target, (data?.label.length ?? 0) * 6 + 16);
  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={props.style} interactionWidth={24} />
      {data?.active && <circle r="2.5" fill={data.trail ? "#b9c7ef" : "#b2edcd"} className={styles.particle}><animateMotion dur="3.5s" repeatCount="indefinite" path={path} /></circle>}
      {!data?.trail && <EdgeLabelRenderer><button className={`${styles.edgeLabel} ${data?.active ? styles.activeEdgeLabel : ""} ${data?.dim ? styles.dimEdgeLabel : ""} nodrag nopan`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }} onClick={data?.onSelect} aria-label={`Explore relationship: ${data?.label}`}>{data?.label}</button></EdgeLabelRenderer>}
    </>
  );
}

const nodeTypes = { entity: AtlasNode };
const edgeTypes = { relationship: AtlasEdge };

function GraphCanvas({ data, count, selection, onSelect, trails, search, entityType, playing }: {
  data: MemoryGraphData; count: number; selection: Selection; onSelect: (value: Selection) => void;
  trails: boolean; search: string; entityType: NodeType | null; playing: boolean;
}) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const portrait = useStore((state) => state.width < 500);
  const positions = useMemo(() => layoutMemoryGraph(data, portrait ? "portrait" : "landscape"), [data, portrait]);
  const visible = useMemo(() => graphAtMoment(data, count), [data, count]);
  const focused = useMemo(() => {
    if (selection?.type === "memory") return memoryConnections(data, [selection.id]);
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    for (const edge of data.edges) {
      if ((selection?.type === "node" && [edge.from_node, edge.to_node].includes(selection.id)) || (selection?.type === "edge" && edge.id === selection.id)) {
        edgeIds.add(edge.id); nodeIds.add(edge.from_node); nodeIds.add(edge.to_node);
      }
    }
    if (selection?.type === "node") nodeIds.add(selection.id);
    return { nodeIds, edgeIds };
  }, [data, selection]);
  const relevantMemories = useMemo(() => new Set(selection?.type === "memory" ? [selection.id]
    : data.provenance.filter((record) => (selection?.type === "node" && record.node_id === selection.id) || (selection?.type === "edge" && record.edge_id === selection.id)).map((record) => record.memory_id)), [data, selection]);
  const dimNode = (id: string, label: string, type: NodeType | "memory") =>
    Boolean((selection && !focused.nodeIds.has(id)) || (search && !label.toLowerCase().includes(search.toLowerCase())) || (entityType && type !== entityType));
  const flowNodes: Node<AtlasNodeData>[] = visible.nodes.map((node) => {
    const root = node.relation_to_wearer === "self";
    const point = positions.get(node.id)!;
    return { id: node.id, type: "entity", position: { x: point.x - (node.type === "person" ? 58 : 85), y: point.y - 52 },
      ariaLabel: `Explore ${node.label}`, data: { label: node.label, type: node.type, color: ENTITY_STYLE[node.type].color,
        sources: memoriesForEntity({ ...data, ...visible }, node.id).length, root,
        active: focused.nodeIds.has(node.id), dim: dimNode(node.id, node.label, node.type) } };
  });
  if (trails) {
    for (const memory of visible.memories) {
      const point = positions.get(`memory:${memory.id}`)!;
      const owner = data.relatives.find((relative) => relative.id === memory.contributor_id);
      const label = `${owner?.name ?? "Family"}’s ${memory.kind === "photo" ? "photo" : memory.kind === "answer" ? "answer" : "story"}`;
      flowNodes.push({ id: `memory:${memory.id}`, type: "entity", position: { x: point.x - 85, y: point.y - 52 },
        ariaLabel: `Explore ${label}`, data: { label, type: "memory", color: owner?.color ?? "#9fb3e4", sources: 0,
          kind: memory.kind, root: false, active: relevantMemories.has(memory.id), dim: Boolean(selection && !relevantMemories.has(memory.id)) } });
    }
  }
  const handles = (source: string, target: string) => {
    const from = positions.get(source)!;
    const to = positions.get(target)!;
    const horizontal = Math.abs(to.x - from.x) > Math.abs(to.y - from.y);
    return horizontal ? { sourceHandle: to.x > from.x ? "s-right" : "s-left", targetHandle: to.x > from.x ? "t-left" : "t-right" }
      : { sourceHandle: to.y > from.y ? "s-bottom" : "s-top", targetHandle: to.y > from.y ? "t-top" : "t-bottom" };
  };
  const obstacles = flowNodes.map((node) => ({ id: node.id, ...node.position, width: node.data.type === "person" ? 116 : 170, height: node.data.root ? 153 : node.data.type === "person" ? 126 : 112 }));
  const flowEdges: Edge[] = visible.edges.map((edge) => {
    const active = focused.edgeIds.has(edge.id);
    const dim = Boolean(selection && !active);
    return { id: edge.id, source: edge.from_node, target: edge.to_node, type: "relationship", ...handles(edge.from_node, edge.to_node),
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: active ? "#a9dfc2" : "#537264" },
      style: { stroke: active ? "#a9dfc2" : "#4c7162", strokeWidth: active ? 1.8 : 1.2, opacity: dim ? 0.15 : 0.8 },
      data: { active, dim, trail: false, obstacles, label: relationshipLabel(edge.rel), onSelect: () => onSelect({ type: "edge", id: edge.id }) } };
  });
  if (trails) {
    for (const memory of visible.memories) {
      for (const nodeId of memoryConnections(data, [memory.id]).nodeIds) {
        if (!visible.nodes.some((node) => node.id === nodeId)) continue;
        const source = `memory:${memory.id}`;
        const active = relevantMemories.has(memory.id);
        flowEdges.push({ id: `trail:${memory.id}:${nodeId}`, source, target: nodeId, type: "relationship", ...handles(source, nodeId),
          style: { stroke: "#9dacd6", strokeWidth: 1, strokeDasharray: "3 7", opacity: selection ? active ? 0.75 : 0.07 : 0.35 },
          data: { trail: true, active, dim: !active, obstacles, label: "remembered in", onSelect: () => onSelect({ type: "memory", id: memory.id }) } });
      }
    }
  }
  const initiallyFitted = useRef(false);
  useEffect(() => {
    if (!visible.nodes.length) return;
    const timer = setTimeout(() => {
      if (!initiallyFitted.current || !playing) {
        fitView({ padding: trails ? 0.2 : 0.24, duration: initiallyFitted.current ? 600 : 0, maxZoom: 1.15 });
        initiallyFitted.current = true;
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [visible.nodes.length, trails, fitView, playing, portrait]);

  return (
    <>
      <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} minZoom={0.15} maxZoom={2.2}
        nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} zoomOnDoubleClick={false}
        deleteKeyCode={null}
        onKeyDownCapture={(event) => {
          const nodeId = (event.target as HTMLElement).closest(".react-flow__node")?.getAttribute("data-id");
          if (event.key === "Escape") onSelect(null);
          if (nodeId && ["Enter", " "].includes(event.key)) {
            event.preventDefault();
            onSelect(nodeId.startsWith("memory:") ? { type: "memory", id: nodeId.slice(7) } : { type: "node", id: nodeId });
          }
        }}
        onNodeClick={(_, node) => onSelect(node.id.startsWith("memory:") ? { type: "memory", id: node.id.slice(7) } : { type: "node", id: node.id })}
        onEdgeClick={(_, edge) => edge.id.startsWith("trail:") ? undefined : onSelect({ type: "edge", id: edge.id })}
        onPaneClick={() => onSelect(null)} proOptions={{ hideAttribution: true }} fitView>
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#294037" />
      </ReactFlow>
      {!visible.nodes.length && <div className={styles.canvasEmpty}><Sprout size={32} /><h3>{data.memories.length ? "It begins with a memory." : "A little story goes a long way."}</h3><p>{data.memories.length ? "Press play to see the connections unfold." : "Add a photo or a story to start your family’s graph."}</p></div>}
      <div className={styles.graphControls}>
        <button onClick={() => zoomIn({ duration: 250 })} aria-label="Zoom in"><Plus size={17} /></button>
        <button onClick={() => zoomOut({ duration: 250 })} aria-label="Zoom out"><Minus size={17} /></button>
        <span />
        <button onClick={() => fitView({ padding: 0.25, duration: 600 })} aria-label="Fit graph to view"><Maximize2 size={16} /></button>
      </div>
    </>
  );
}

function Inspector({ data, selection, onSelect }: { data: MemoryGraphData; selection: Selection; onSelect: (value: Selection) => void }) {
  const node = selection?.type === "node" ? data.nodes.find((candidate) => candidate.id === selection.id) : null;
  const edge = selection?.type === "edge" ? data.edges.find((candidate) => candidate.id === selection.id) : null;
  const memory = selection?.type === "memory" ? data.memories.find((candidate) => candidate.id === selection.id) : null;
  const sources = node ? memoriesForEntity(data, node.id) : edge ? data.memories.filter((candidate) => data.provenance.some((record) => record.edge_id === edge.id && record.memory_id === candidate.id)) : memory ? [memory] : [];
  const connections = node ? data.edges.filter((candidate) => candidate.from_node === node.id || candidate.to_node === node.id) : [];
  const owner = memory ? data.relatives.find((relative) => relative.id === memory.contributor_id) : null;
  const edgeFrom = edge ? data.nodes.find((candidate) => candidate.id === edge.from_node) : null;
  const edgeTo = edge ? data.nodes.find((candidate) => candidate.id === edge.to_node) : null;
  return (
    <aside className={styles.inspector} aria-label="Connection details">
      <div className={styles.sectionHeading}><span>{selection ? "A CLOSER LOOK" : "THE BIGGER PICTURE"}</span>{selection && <button onClick={() => onSelect(null)} aria-label="Clear selection"><X size={15} /></button>}</div>
      {!selection ? <>
        <div className={styles.inspectorIllustration}><div /><div /><div /><Network size={34} strokeWidth={1.2} /></div>
        <h2>More than a memory.<br /><em>A world of connections.</em></h2>
        <p className={styles.inspectorIntro}>A person, a place, a well-loved recipe. Every little story adds another thread to your family’s shared memory.</p>
        <div className={styles.hint}><Focus size={17} /><p>Choose anything in the graph to discover its relationships and the memories behind them.</p></div>
        <div className={styles.inspectorDivider} />
        <span className={styles.eyebrow}>HOW TO READ THE GRAPH</span>
        <div className={styles.keyRow}><span className={styles.solidKey} /><div><strong>A relationship</strong><small>What your family has shared</small></div></div>
        <div className={styles.keyRow}><span className={styles.dashedKey} /><div><strong>A memory trail</strong><small>The story behind a connection</small></div></div>
        <div className={styles.grounded}><Check size={14} /><span>Follow each connection back to its source.</span></div>
      </> : <>
        <span className={styles.detailType}>{node ? ENTITY_STYLE[node.type].singular : edge ? "Relationship" : KIND_LABELS[memory?.kind ?? "story"]}</span>
        <h2>{node?.label ?? (edge ? `${edgeFrom?.label} → ${edgeTo?.label}` : `${owner?.name ?? "A relative"} remembers`)}</h2>
        {node?.relation_to_wearer && <p className={styles.detailSubtitle}>{node.relation_to_wearer === "self" ? "At the heart of your family’s memory" : `Relationship to wearer: ${node.relation_to_wearer}`}</p>}
        {edge && <p className={styles.relationshipSentence}>{edgeFrom?.label} <em>{relationshipLabel(edge.rel)}</em> {edgeTo?.label}.</p>}
        {memory && (memory.transcript ? <blockquote className={styles.quote}>“{memory.transcript}”<cite>Shared by {owner?.name ?? "a family member"}</cite></blockquote> : <div className={styles.quote}><p>{memory.summary}</p><span className={styles.sourceNote}>Memory summary · contributed by {owner?.name ?? "a family member"}</span></div>)}
        {!memory && <><div className={styles.detailMetric}><strong>{sources.length}</strong><span>{sources.length === 1 ? "memory keeps this" : "memories keep this"}<br />connection alive</span></div><span className={styles.eyebrow}>REMEMBERED BY YOUR FAMILY</span></>}
        {!memory && sources.map((source) => {
          const relative = data.relatives.find((candidate) => candidate.id === source.contributor_id);
          return <button key={source.id} className={styles.evidenceCard} onClick={() => onSelect({ type: "memory", id: source.id })}><span><i style={{ background: relative?.color }} />{relative?.name ?? "Family"}<SourceIcon kind={source.kind} /></span><p>{source.summary}</p><small>Follow this memory <ArrowUpRight size={12} /></small></button>;
        })}
        {!memory && !sources.length && <p className={styles.inspectorIntro}>No source memory is linked yet. This connection is not supported by recorded evidence.</p>}
        {connections.length > 0 && <><div className={styles.inspectorDivider} /><span className={styles.eyebrow}>CONNECTED TO</span>{connections.map((connection) => {
          const outgoing = connection.from_node === node!.id;
          const other = data.nodes.find((candidate) => candidate.id === (outgoing ? connection.to_node : connection.from_node));
          return <button key={connection.id} className={styles.connectionRow} onClick={() => onSelect({ type: "edge", id: connection.id })}><div><strong>{other?.label}</strong><small>{outgoing ? relationshipLabel(connection.rel) : `${other?.label} ${relationshipLabel(connection.rel)} ${node?.label}`}</small></div><ChevronRight size={14} /></button>;
        })}</>}
        {memory && <><span className={styles.eyebrow}>THREADS IN THIS MEMORY</span><div className={styles.entityChips}>{[...memoryConnections(data, [memory.id]).nodeIds].map((nodeId) => {
          const entity = data.nodes.find((candidate) => candidate.id === nodeId)!;
          return <button key={nodeId} onClick={() => onSelect({ type: "node", id: nodeId })}><i style={{ background: ENTITY_STYLE[entity.type].color }} />{entity.label}</button>;
        })}</div></>}
      </>}
    </aside>
  );
}

function AtlasView({ data, demo, onDemoChange, status, refresh }: { data: MemoryGraphData; demo: boolean; onDemoChange: (value: boolean) => void; status: string; refresh: () => void }) {
  const [selection, setSelection] = useState<Selection>(null);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<NodeType | null>(null);
  const [trails, setTrails] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [moment, setMoment] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const memories = useMemo(() => chronologicalMemories(data.memories), [data.memories]);
  const count = Math.min(moment ?? memories.length, memories.length);
  const visible = graphAtMoment(data, count);
  const latest = moment !== null && count > 0 ? memories[count - 1] : null;
  const sourceName = latest ? data.relatives.find((relative) => relative.id === latest.contributor_id)?.name : null;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (count >= memories.length) { setPlaying(false); return; }
      const next = count + 1;
      setMoment(next);
      setSelection({ type: "memory", id: memories[next - 1].id });
    }, count === 0 ? 500 : 2600);
    return () => clearTimeout(timer);
  }, [playing, count, memories]);

  const select = (value: Selection) => { setSelection(value); setPlaying(false); };
  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (count >= memories.length) { setMoment(0); setSelection(null); }
    setSearch(""); setEntityType(null); setPlaying(true);
  };
  const reset = () => { setPlaying(false); setMoment(null); setSelection(null); };

  return (
    <div className={styles.atlas} ref={container}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Kin home"><span><Leaf size={24} strokeWidth={1.5} /></span>kin<span className={styles.brandSeparator} /> <small>MEMORY ATLAS</small></Link>
        <div className={styles.headerRight}><span className={styles.privateBadge}><span />{demo ? "Illustrative family" : status === "ready" ? "Connected to your family" : status === "loading" ? "Connecting…" : "Connection unavailable"}</span><Link href="/stage" className={styles.stageLink}>Open stage <ArrowUpRight size={14} /></Link></div>
      </header>
      <main className={styles.main}>
        <section className={styles.introduction}>
          <div><div className={styles.eyebrow}><span className={styles.tinyStar}>✳</span> LITTLE STORIES. LASTING CONNECTIONS.</div><h1>Every memory <em>connects us.</em></h1><p>Explore the people, places, and little things that make a family.</p></div>
          <div className={styles.familySummary}><div className={styles.avatarStack}>{data.relatives.slice(0, 4).map((relative) => <span key={relative.id} style={{ "--avatar-color": relative.color } as CSSProperties} title={relative.name}>{relative.name.slice(0, 1)}</span>)}<div><strong>{data.relatives.length} voices, one family.</strong><small>{data.memories.length} memories woven together</small></div></div><div className={styles.modeSwitch} aria-label="Graph data source"><button aria-pressed={!demo} onClick={() => onDemoChange(false)}>Your family</button><button aria-pressed={demo} onClick={() => onDemoChange(true)}>Sample story <ArrowUpRight size={12} /></button></div></div>
        </section>
        {!demo && status === "error" && <div className={styles.notice} role="status"><CircleHelp size={17} /><span>We couldn’t connect to your family’s memories. Any previously loaded graph is still visible.</span><button onClick={refresh}>Try again</button><button onClick={() => onDemoChange(true)}>Explore the sample</button></div>}
        {demo && <div className={styles.demoNote}><Sparkles size={12} /> An illustrative family story. This preview does not change your family’s memories.</div>}
        <div className={styles.workspace}>
          <aside className={styles.memorySidebar} aria-label="Family memories">
            <div className={styles.sectionHeading}><span>THE MEMORY THREAD</span><span className={styles.countBadge}>{memories.length.toString().padStart(2, "0")}</span></div>
            <h2>One story at a time.</h2><p className={styles.sidebarIntro}>A growing collection of moments,<br />remembered together.</p>
            <div className={styles.memoryList}>{memories.map((memory, index) => {
              const owner = data.relatives.find((relative) => relative.id === memory.contributor_id);
              const active = selection?.type === "memory" && selection.id === memory.id;
              return <button key={memory.id} className={`${styles.memoryCard} ${active ? styles.selectedMemory : ""} ${index >= count ? styles.futureMemory : ""}`} aria-pressed={active} aria-label={`Explore memory ${index + 1} from ${owner?.name ?? "family"}`} onClick={() => { if (index >= count) setMoment(index + 1); select({ type: "memory", id: memory.id }); }} style={{ "--memory-color": owner?.color ?? "#a9dfc2" } as CSSProperties}>
                <span className={styles.threadDot} /><span className={styles.memoryMeta}><span>{String(index + 1).padStart(2, "0")} <span>·</span> {KIND_LABELS[memory.kind]}</span><SourceIcon kind={memory.kind} size={14} /></span>
                <p>{memory.summary}</p><span className={styles.memoryOwner}><span>{owner?.name.slice(0, 1) ?? "?"}</span>{owner?.name ?? "A family member"}<ArrowUpRight size={12} /></span>
              </button>;
            })}</div>
            {!memories.length && <div className={styles.noMemories}><BookOpen size={24} /><p>{status === "loading" && !demo ? "Gathering your family’s stories…" : "Your first memory belongs here."}</p><Link href="/family">Add a memory <ArrowUpRight size={13} /></Link></div>}
            <div className={styles.sidebarFooter}><Leaf size={14} /><span>Remembered by people.<br />Connected by Kin.</span></div>
          </aside>
          <section className={styles.graphPanel} aria-label="Interactive family graph">
            <div className={styles.graphToolbar}><div className={styles.viewSwitch}><button aria-pressed={!trails} onClick={() => setTrails(false)}><Network size={14} />Relationships</button><button aria-pressed={trails} onClick={() => setTrails(true)}><Sparkles size={14} />Memory trails</button></div><button className={styles.iconButton} aria-label="Toggle fullscreen graph" onClick={() => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else container.current?.requestFullscreen?.().catch(() => {}); }}><Maximize2 size={15} /></button></div>
            <div className={styles.searchRow}><label className={styles.search}><Search size={14} /><input aria-label="Find an entity" placeholder="Find a person, place, or thing…" value={search} onChange={(event) => { setSearch(event.target.value); setSelection(null); }} />{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={13} /></button>}</label><span className={styles.graphStats}>{visible.nodes.length} entities <span>·</span> {visible.edges.length} connections</span></div>
            <div className={styles.canvas} data-testid="memory-graph-canvas"><div className={styles.canvasGlow} /><ReactFlowProvider><GraphCanvas data={data} count={count} selection={selection} onSelect={select} trails={trails} search={search} entityType={entityType} playing={playing} /></ReactFlowProvider><div className={styles.canvasWatermark}><Leaf size={13} /> THE THINGS WE REMEMBER</div></div>
            <div className={styles.legend}>{(Object.keys(ENTITY_STYLE) as NodeType[]).map((type) => <button key={type} aria-pressed={entityType === type} onClick={() => { setEntityType(entityType === type ? null : type); setSelection(null); }}><i style={{ background: ENTITY_STYLE[type].color }} />{ENTITY_STYLE[type].label}</button>)}{entityType && <button onClick={() => setEntityType(null)} aria-label="Show all entity types"><X size={12} /></button>}</div>
            <div className={styles.playback}><div className={styles.playbackTop}><span><span className={styles.liveDot} />{moment === null ? "A FAMILY’S MEMORY, WOVEN TOGETHER" : count === 0 ? "EVERY STORY HAS A BEGINNING" : `${sourceName ?? "FAMILY"} ADDED A ${latest?.kind === "photo" ? "PHOTO" : latest?.kind === "answer" ? "MISSING PIECE" : "STORY"}`}</span><span>{count.toString().padStart(2, "0")} / {memories.length.toString().padStart(2, "0")}</span></div><div className={styles.playbackControls}><button className={styles.playButton} onClick={play} disabled={!memories.length} aria-label={playing ? "Pause memory playback" : "Play memory formation"}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}<span>{playing ? "Pause" : moment === null ? "Watch it grow" : "Play"}</span></button><div className={styles.scrubber}><input type="range" min={0} max={Math.max(1, memories.length)} value={count} disabled={!memories.length} aria-label="Memory timeline" onChange={(event) => { const next = Number(event.target.value); setPlaying(false); setMoment(next); setSelection(next > 0 ? { type: "memory", id: memories[next - 1].id } : null); }} /><div><span>First memory</span><span>Present day</span></div></div><button className={styles.resetButton} onClick={reset} aria-label="Return to present"><RotateCcw size={15} /></button></div></div>
          </section>
          <Inspector data={{ ...data, ...visible }} selection={selection} onSelect={select} />
        </div>
        <footer className={styles.footer}><Link href="/family"><ArrowLeft size={13} /> Back to your family</Link><span><span />{demo ? "SAMPLE STORY" : status === "ready" ? "UPDATES AS YOUR FAMILY REMEMBERS" : "YOUR STORIES STAY YOURS"}</span><span>Every thread begins with someone who remembers.</span></footer>
      </main>
    </div>
  );
}

export function MemoryAtlas({ initialDemo = false }: { initialDemo?: boolean }) {
  const [demo, setDemo] = useState(initialDemo);
  const live = useMemoryGraph(!demo);
  return <AtlasView key={demo ? "demo" : "live"} data={demo ? DEMO_MEMORY_GRAPH : live.data} demo={demo} onDemoChange={setDemo} status={live.status} refresh={live.refresh} />;
}
