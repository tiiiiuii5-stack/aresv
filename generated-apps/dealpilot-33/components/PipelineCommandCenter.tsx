"use client";

import { useMemo, useState } from "react";

const initialRecords = [
  {
    "id": "crm-1",
    "label": "DealPilot 33 queue item",
    "value": "99 open",
    "status": "Queued",
    "meta": "Variant 33 command queue"
  },
  {
    "id": "crm-2",
    "label": "DealPilot 33 rule set",
    "value": "37 rules",
    "status": "Active",
    "meta": "Variant 33 rule builder",
    "parentId": "crm-1"
  },
  {
    "id": "crm-3",
    "label": "DealPilot 33 insight",
    "value": "123%",
    "status": "Healthy",
    "meta": "Variant 33 event timeline",
    "parentId": "crm-1"
  }
];
const views = ["Command","Queue","Rules","Insights"];
const transitions = ["Lead","In Progress","Review","Done"];

export function PipelineCommandCenter({ initialView = views[0] }: { initialView?: string }) {
  const [view, setView] = useState(initialView);
  const [records, setRecords] = useState(initialRecords);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<string[]>(["DealPilot 33 ready"]);
  const visible = useMemo(() => records.filter((record) => view === views[0] || record.status.toLowerCase().includes(view.toLowerCase()) || record.meta.toLowerCase().includes(view.toLowerCase())), [records, view]);
  async function mutate(payload: { action: "create" | "transition" | "delete"; id?: string; label?: string; value?: string; status?: string }) {
    const response = await fetch("/api/clients", {
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
    setEvents((current) => [payload.action + " persisted through /api/clients", ...current]);
    if (payload.action === "create") setInput("");
  }
  return (
    <main className="app">
      <header className="top"><div className="wrap" style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><strong>DealPilot 33</strong><nav style={{display:"flex",gap:8,overflowX:"auto"}}>{views.map((item) => <a key={item} href={"#"+item} onClick={(event) => { event.preventDefault(); setView(item); }} className="primary" style={{background:item===view?"var(--primary)":"#e2e8f0",color:item===view?"white":"#0f172a",textDecoration:"none"}}>{item}</a>)}</nav></div></header>
      <section className="wrap hero">
        <div className="panel">
          <p style={{fontWeight:900,textTransform:"uppercase",letterSpacing:".16em",fontSize:12,color:"var(--primary)"}}>crm</p>
          <h1 style={{fontSize:48,lineHeight:1,margin:"10px 0"}}>DealPilot 33</h1>
          <p style={{lineHeight:1.7,color:"#475569"}}>Build foreground worker CRM for sales managers where users create clients, move deals, assign tasks, and save activity history. unique architecture variant 33</p>
          <div className="kanban-board" style={{marginTop:18}}>{visible.map((record) => <article key={record.id || record.label} className="card"><strong>{record.label}</strong><p style={{fontSize:28,fontWeight:850,margin:"8px 0"}}>{record.value}</p><span>{record.status}</span><div style={{display:"flex",gap:8,marginTop:12}}><button data-action="transition" data-api="/api/clients" data-db-change="update-status" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "transition", id: record.id })} className="primary" style={{padding:"8px 10px"}}>Advance variant 33 state</button><button data-action="delete" data-api="/api/clients" data-db-change="delete-record" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "delete", id: record.id })} className="primary" style={{padding:"8px 10px",background:"#fee2e2",color:"#991b1b"}}>Remove variant 33 audit</button></div></article>)}</div>
        </div>
        <aside className="panel">
          <h2>Create crm event</h2>
          <p>Adds variant 33 event to isolated runtime</p>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Name, Owner, State, Score" style={{width:"100%",minHeight:110,border:"1px solid #cbd5e1",borderRadius:12,padding:12}} />
          <button data-action="create" data-api="/api/clients" data-db-change="insert-record" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "create", label: input || "Create crm event", value: "New", status: transitions[0] || "Created" })} className="primary" style={{width:"100%",marginTop:10}}>move deal</button>
          <div style={{display:"grid",gap:8,marginTop:16}}>{events.map((event) => <div key={event} className="card">{event}</div>)}</div>
        </aside>
      </section>
    </main>
  );
}
