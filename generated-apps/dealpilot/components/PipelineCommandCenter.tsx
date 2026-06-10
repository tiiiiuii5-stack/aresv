"use client";

import { useMemo, useState } from "react";
import { applyClientsMutation, removeClientsRecord, transitionClientsRecord } from "@/lib/pipeline-engine";

const initialRecords = [
  {
    "id": "crm-1",
    "label": "Northstar Labs",
    "value": "$18.4k",
    "status": "Proposal",
    "meta": "Kanban pipeline"
  },
  {
    "id": "crm-2",
    "label": "Brightline Studio",
    "value": "$7.2k",
    "status": "Renewal risk",
    "meta": "Client search",
    "parentId": "crm-1"
  },
  {
    "id": "crm-3",
    "label": "Atlas Supply",
    "value": "$24.9k",
    "status": "Closing",
    "meta": "Renewal risk scoring",
    "parentId": "crm-1"
  }
];
const views = ["Dashboard","Clients","Pipeline","Analytics"];
const transitions = ["Lead","In Progress","Review","Done"];

export function PipelineCommandCenter({ initialView = views[0] }: { initialView?: string }) {
  const [view, setView] = useState(initialView);
  const [records, setRecords] = useState(initialRecords);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<string[]>(["DealPilot ready"]);
  const visible = useMemo(() => records.filter((record) => view === views[0] || record.status.toLowerCase().includes(view.toLowerCase()) || record.meta.toLowerCase().includes(view.toLowerCase())), [records, view]);
  function submit() {
    const next = applyClientsMutation(records, { label: input || "New deal", value: "New", status: "Created" });
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
    setInput("");
  }
  function advance(id: string) {
    const next = transitionClientsRecord(records, id, transitions);
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
  }
  function remove(id: string) {
    const next = removeClientsRecord(records, id);
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
  }
  return (
    <main className="app">
      <header className="top"><div className="wrap" style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><strong>DealPilot</strong><nav style={{display:"flex",gap:8,overflowX:"auto"}}>{views.map((item) => <button key={item} onClick={() => setView(item)} className="primary" style={{background:item===view?"var(--primary)":"#e2e8f0",color:item===view?"white":"#0f172a"}}>{item}</button>)}</nav></div></header>
      <section className="wrap hero">
        <div className="panel">
          <p style={{fontWeight:900,textTransform:"uppercase",letterSpacing:".16em",fontSize:12,color:"var(--primary)"}}>crm</p>
          <h1 style={{fontSize:48,lineHeight:1,margin:"10px 0"}}>DealPilot</h1>
          <p style={{lineHeight:1.7,color:"#475569"}}>Build a CRM system for client pipelines, projects, tasks, revenue stages, and account follow-up.</p>
          <div className="kanban-board" style={{marginTop:18}}>{visible.map((record) => <article key={record.id || record.label} className="card"><strong>{record.label}</strong><p style={{fontSize:28,fontWeight:850,margin:"8px 0"}}>{record.value}</p><span>{record.status}</span><div style={{display:"flex",gap:8,marginTop:12}}><button data-action="transition" onClick={() => advance(record.id)} className="primary" style={{padding:"8px 10px"}}>Advance stage</button><button data-action="delete" onClick={() => remove(record.id)} className="primary" style={{padding:"8px 10px",background:"#fee2e2",color:"#991b1b"}}>Delete task</button></div></article>)}</div>
        </div>
        <aside className="panel">
          <h2>New deal</h2>
          <p>Adds deal to active pipeline</p>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Client, Value, Stage, Next step" style={{width:"100%",minHeight:110,border:"1px solid #cbd5e1",borderRadius:12,padding:12}} />
          <button onClick={submit} className="primary" style={{width:"100%",marginTop:10}}>move deal</button>
          <div style={{display:"grid",gap:8,marginTop:16}}>{events.map((event) => <div key={event} className="card">{event}</div>)}</div>
        </aside>
      </section>
    </main>
  );
}
