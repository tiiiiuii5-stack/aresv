"use client";

import { useMemo, useState } from "react";

const initialRecords = [
  {
    "id": "marketplace-1",
    "label": "VendorLoop 24 queue item",
    "value": "72 open",
    "status": "Queued",
    "meta": "Variant 24 command queue"
  },
  {
    "id": "marketplace-2",
    "label": "VendorLoop 24 rule set",
    "value": "28 rules",
    "status": "Active",
    "meta": "Variant 24 rule builder",
    "parentId": "marketplace-1"
  },
  {
    "id": "marketplace-3",
    "label": "VendorLoop 24 insight",
    "value": "114%",
    "status": "Healthy",
    "meta": "Variant 24 event timeline",
    "parentId": "marketplace-1"
  }
];
const views = ["Command","Queue","Rules","Insights"];
const transitions = ["Queued","Active","Healthy","In Progress","Done"];

export function MarketplaceDesk({ initialView = views[0] }: { initialView?: string }) {
  const [view, setView] = useState(initialView);
  const [records, setRecords] = useState(initialRecords);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<string[]>(["VendorLoop 24 ready"]);
  const visible = useMemo(() => records.filter((record) => view === views[0] || record.status.toLowerCase().includes(view.toLowerCase()) || record.meta.toLowerCase().includes(view.toLowerCase())), [records, view]);
  async function mutate(payload: { action: "create" | "transition" | "delete"; id?: string; label?: string; value?: string; status?: string }) {
    const response = await fetch("/api/inquiries", {
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
    setEvents((current) => [payload.action + " persisted through /api/inquiries", ...current]);
    if (payload.action === "create") setInput("");
  }
  return (
    <main className="app">
      <header className="top"><div className="wrap" style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><strong>VendorLoop 24</strong><nav style={{display:"flex",gap:8,overflowX:"auto"}}>{views.map((item) => <a key={item} href={"#"+item} onClick={(event) => { event.preventDefault(); setView(item); }} className="primary" style={{background:item===view?"var(--primary)":"#e2e8f0",color:item===view?"white":"#0f172a",textDecoration:"none"}}>{item}</a>)}</nav></div></header>
      <section className="wrap hero">
        <div className="panel">
          <p style={{fontWeight:900,textTransform:"uppercase",letterSpacing:".16em",fontSize:12,color:"var(--primary)"}}>marketplace</p>
          <h1 style={{fontSize:48,lineHeight:1,margin:"10px 0"}}>VendorLoop 24</h1>
          <p style={{lineHeight:1.7,color:"#475569"}}>Build a marketplace for buyers and sellers to create listings, send inquiries, manage orders, track records, and delete stale items 1780203617203. unique architecture variant 24</p>
          <div className="market-grid" style={{marginTop:18}}>{visible.map((record) => <article key={record.id || record.label} className="card"><strong>{record.label}</strong><p style={{fontSize:28,fontWeight:850,margin:"8px 0"}}>{record.value}</p><span>{record.status}</span><div style={{display:"flex",gap:8,marginTop:12}}><button data-action="transition" data-api="/api/inquiries" data-db-change="update-status" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "transition", id: record.id })} className="primary" style={{padding:"8px 10px"}}>Advance variant 24 state</button><button data-action="delete" data-api="/api/inquiries" data-db-change="delete-record" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "delete", id: record.id })} className="primary" style={{padding:"8px 10px",background:"#fee2e2",color:"#991b1b"}}>Remove variant 24 audit</button></div></article>)}</div>
        </div>
        <aside className="panel">
          <h2>Create marketplace event</h2>
          <p>Adds variant 24 event to isolated runtime</p>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Name, Owner, State, Score" style={{width:"100%",minHeight:110,border:"1px solid #cbd5e1",borderRadius:12,padding:12}} />
          <button data-action="create" data-api="/api/inquiries" data-db-change="insert-record" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "create", label: input || "Create marketplace event", value: "New", status: transitions[0] || "Created" })} className="primary" style={{width:"100%",marginTop:10}}>send inquiry</button>
          <div style={{display:"grid",gap:8,marginTop:16}}>{events.map((event) => <div key={event} className="card">{event}</div>)}</div>
        </aside>
      </section>
    </main>
  );
}
