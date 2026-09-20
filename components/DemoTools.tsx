"use client";
import { useRef, useState } from "react";
import { authenticatedFetch, responseJSON } from "@/lib/client-auth";
import { Button } from "./ui/button";
import { Sheet } from "./Sheet";

/** Explicit organizer tools retained from main; never run as part of setup. */
export function DemoTools({ refresh }: { refresh: () => Promise<void> }) {
  const [busy,setBusy]=useState<"seed"|"reset"|null>(null);
  const active=useRef(false);
  const [confirm,setConfirm]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const run=async(action:"seed"|"reset")=>{
    if(active.current)return;
    active.current=true;setBusy(action);setError(null);setNotice(null);
    try { await responseJSON(await authenticatedFetch(`/api/admin/${action}`,{method:"POST"}));
      setConfirm(false);setNotice(action==="reset"?"Family memories cleared. Accounts are still connected.":"Sample memories added.");await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Please try again.")}
    finally{active.current=false;setBusy(null)}
  };
  return <details className="settings-section"><summary>Demo tools</summary>
    <p className="muted">Sample memories and reset controls for the family organizer.</p>
    <div className="row" style={{flexWrap:"wrap",marginTop:"1rem"}}>
      <Button variant="outline" disabled={!!busy} onClick={()=>run("seed")}>{busy==="seed"?"Adding…":"Add sample memories"}</Button>
      <Button variant="outline" disabled={!!busy} onClick={()=>{setError(null);setConfirm(true)}}>Reset family memories</Button>
    </div>
    {!confirm && error && <p role="alert" className="notice notice-error">{error}</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
    <Sheet busy={!!busy} open={confirm} onClose={()=>{if(!busy)setConfirm(false)}} title="Clear this family’s memories?">
      <p>This permanently removes every family member’s photos, recordings, face labels, and connections. Their accounts remain connected.</p>
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      <div className="stack" style={{marginTop:"1rem"}}>
        <Button variant="danger" disabled={!!busy} onClick={()=>run("reset")}>{busy==="reset"?"Clearing…":"Clear all family memories"}</Button>
        <Button variant="outline" disabled={!!busy} onClick={()=>setConfirm(false)}>Cancel</Button>
      </div>
    </Sheet>
  </details>;
}
