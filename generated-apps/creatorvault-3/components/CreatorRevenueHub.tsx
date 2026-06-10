"use client";

import { useMemo, useState } from "react";

const initialRecords = [
  {
    "id": "creator-1",
    "label": "Pro community",
    "value": "$8.4k MRR",
    "status": "Growing",
    "meta": "Offer builder"
  },
  {
    "id": "creator-2",
    "label": "Template bundle",
    "value": "$1.9k",
    "status": "Launching",
    "meta": "Subscriber CRM",
    "parentId": "creator-1"
  },
  {
    "id": "creator-3",
    "label": "VIP coaching",
    "value": "12 seats",
    "status": "Limited",
    "meta": "Revenue ledger",
    "parentId": "creator-1"
  }
];
const views = ["Revenue","Offers","Subscribers","Launches"];
const transitions = ["Growing","Launching","Limited","In Progress","Done"];

export function CreatorRevenueHub({ initialView = views[0] }: { initialView?: string }) {
  const [view, setView] = useState(initialView);
  const [records, setRecords] = useState(initialRecords);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<string[]>(["CreatorVault ready"]);
  const visible = useMemo(() => records.filter((record) => view === views[0] || record.status.toLowerCase().includes(view.toLowerCase()) || record.meta.toLowerCase().includes(view.toLowerCase())), [records, view]);
  async function mutate(payload: { action: "create" | "transition" | "delete"; id?: string; label?: string; value?: string; status?: string }) {
    const response = await fetch("/api/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setEvents((current) => ["Backend mutation failed", ...current]);
      return;
    }
    const data = await response.json() as { records: typeof initialRecords; record?: (typeof initialRecords)[number] };
    setRecords(data.records);
    setEvents((current) => [payload.action + " persisted through /api/offers", ...current]);
    if (payload.action === "create") setInput("");
  }
  return (
    <main className="app">
      <header className="top"><div className="wrap" style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><strong>CreatorVault</strong><nav style={{display:"flex",gap:8,overflowX:"auto"}}>{views.map((item) => <a key={item} href={"#"+item} onClick={(event) => { event.preventDefault(); setView(item); }} className="primary" style={{background:item===view?"var(--primary)":"#e2e8f0",color:item===view?"white":"#0f172a",textDecoration:"none"}}>{item}</a>)}</nav></div></header>
      <section className="wrap hero">
        <div className="panel">
          <p style={{fontWeight:900,textTransform:"uppercase",letterSpacing:".16em",fontSize:12,color:"var(--primary)"}}>creator</p>
          <h1 style={{fontSize:48,lineHeight:1,margin:"10px 0"}}>CreatorVault</h1>
          <p style={{lineHeight:1.7,color:"#475569"}}>Build a video streaming platform for creators, editors, and viewers. Real users: creator, video editor, subscriber. Real actions: upload video multipart, queue FFmpeg transcoding, generate HLS playlist, publish CDN playback URL, track processing status, and manage video library. Real data: users, videos, transcode jobs, renditions, playlists, subscriptions. Real state changes: upload creates asset, transcode updates status, publish exposes CDN URL, refresh keeps saved state.</p>
          <div className="revenue-grid" style={{marginTop:18}}>{visible.map((record) => <article key={record.id || record.label} className="card"><strong>{record.label}</strong><p style={{fontSize:28,fontWeight:850,margin:"8px 0"}}>{record.value}</p><span>{record.status}</span><div style={{display:"flex",gap:8,marginTop:12}}><button data-action="transition" data-api="/api/offers" data-db-change="update-status" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "transition", id: record.id })} className="primary" style={{padding:"8px 10px"}}>Convert subscriber</button><button data-action="delete" data-api="/api/offers" data-db-change="delete-record" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "delete", id: record.id })} className="primary" style={{padding:"8px 10px",background:"#fee2e2",color:"#991b1b"}}>Cancel subscriber</button></div></article>)}</div>
        </div>
        <aside className="panel">
          <h2>New offer</h2>
          <p>Adds a paid offer to the launch board</p>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Offer name, Price, Tier, Launch date" style={{width:"100%",minHeight:110,border:"1px solid #cbd5e1",borderRadius:12,padding:12}} />
          <button data-action="create" data-api="/api/offers" data-db-change="insert-record" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "create", label: input || "New offer", value: "New", status: transitions[0] || "Created" })} className="primary" style={{width:"100%",marginTop:10}}>launch offer</button>
          <div style={{display:"grid",gap:8,marginTop:16}}>{events.map((event) => <div key={event} className="card">{event}</div>)}</div>
        </aside>
      </section>
    </main>
  );
}
