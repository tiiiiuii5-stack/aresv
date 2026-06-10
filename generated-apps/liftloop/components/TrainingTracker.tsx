"use client";

import { useMemo, useState } from "react";
import { applyCheckinsMutation, removeCheckinsRecord, transitionCheckinsRecord } from "@/lib/training-engine";

const initialRecords = [
  {
    "id": "fitness-1",
    "label": "Strength session",
    "value": "42 min",
    "status": "Planned",
    "meta": "Workout log"
  },
  {
    "id": "fitness-2",
    "label": "Hydration",
    "value": "6/8",
    "status": "On pace",
    "meta": "Habit streaks",
    "parentId": "fitness-1"
  },
  {
    "id": "fitness-3",
    "label": "Mobility",
    "value": "12 min",
    "status": "Complete",
    "meta": "Progress charts",
    "parentId": "fitness-1"
  }
];
const views = ["Today","Workouts","Progress","Coach"];
const transitions = ["Planned","Complete","Reviewed"];

export function TrainingTracker({ initialView = views[0] }: { initialView?: string }) {
  const [view, setView] = useState(initialView);
  const [records, setRecords] = useState(initialRecords);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<string[]>(["LiftLoop ready"]);
  const visible = useMemo(() => records.filter((record) => view === views[0] || record.status.toLowerCase().includes(view.toLowerCase()) || record.meta.toLowerCase().includes(view.toLowerCase())), [records, view]);
  function submit() {
    const next = applyCheckinsMutation(records, { label: input || "Workout check-in", value: "New", status: "Created" });
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
    setInput("");
  }
  function advance(id: string) {
    const next = transitionCheckinsRecord(records, id, transitions);
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
  }
  function remove(id: string) {
    const next = removeCheckinsRecord(records, id);
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
  }
  return (
    <main className="app">
      <header className="top"><div className="wrap" style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><strong>LiftLoop</strong><nav style={{display:"flex",gap:8,overflowX:"auto"}}>{views.map((item) => <button key={item} onClick={() => setView(item)} className="primary" style={{background:item===view?"var(--primary)":"#e2e8f0",color:item===view?"white":"#0f172a"}}>{item}</button>)}</nav></div></header>
      <section className="wrap hero">
        <div className="panel">
          <p style={{fontWeight:900,textTransform:"uppercase",letterSpacing:".16em",fontSize:12,color:"var(--primary)"}}>fitness</p>
          <h1 style={{fontSize:48,lineHeight:1,margin:"10px 0"}}>LiftLoop</h1>
          <p style={{lineHeight:1.7,color:"#475569"}}>Build a fitness tracker with workouts, habits, check-ins, streaks, and coach review.</p>
          <div className="tracker-stack" style={{marginTop:18}}>{visible.map((record) => <article key={record.id || record.label} className="card"><strong>{record.label}</strong><p style={{fontSize:28,fontWeight:850,margin:"8px 0"}}>{record.value}</p><span>{record.status}</span><div style={{display:"flex",gap:8,marginTop:12}}><button data-action="transition" onClick={() => advance(record.id)} className="primary" style={{padding:"8px 10px"}}>Complete habit</button><button data-action="delete" onClick={() => remove(record.id)} className="primary" style={{padding:"8px 10px",background:"#fee2e2",color:"#991b1b"}}>Remove check-in</button></div></article>)}</div>
        </div>
        <aside className="panel">
          <h2>Workout check-in</h2>
          <p>Updates daily score</p>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Workout, Duration, Effort, Notes" style={{width:"100%",minHeight:110,border:"1px solid #cbd5e1",borderRadius:12,padding:12}} />
          <button onClick={submit} className="primary" style={{width:"100%",marginTop:10}}>log workout</button>
          <div style={{display:"grid",gap:8,marginTop:16}}>{events.map((event) => <div key={event} className="card">{event}</div>)}</div>
        </aside>
      </section>
    </main>
  );
}
