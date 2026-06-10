"use client";

import { useMemo, useState } from "react";
import { applyBookingsMutation, removeBookingsRecord, transitionBookingsRecord } from "@/lib/availability-engine";

const initialRecords = [
  {
    "id": "booking-1",
    "label": "Monday 9:00",
    "value": "3 seats",
    "status": "Open",
    "meta": "Availability grid"
  },
  {
    "id": "booking-2",
    "label": "Tuesday 14:00",
    "value": "1 seat",
    "status": "Almost full",
    "meta": "Booking form",
    "parentId": "booking-1"
  },
  {
    "id": "booking-3",
    "label": "Friday 11:30",
    "value": "5 seats",
    "status": "Open",
    "meta": "Request approvals",
    "parentId": "booking-1"
  }
];
const views = ["Calendar","Booking","Availability","Admin"];
const transitions = ["Requested","Confirmed","Completed"];

export function AvailabilityCalendar({ initialView = views[0] }: { initialView?: string }) {
  const [view, setView] = useState(initialView);
  const [records, setRecords] = useState(initialRecords);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<string[]>(["SlotWise ready"]);
  const visible = useMemo(() => records.filter((record) => view === views[0] || record.status.toLowerCase().includes(view.toLowerCase()) || record.meta.toLowerCase().includes(view.toLowerCase())), [records, view]);
  function submit() {
    const next = applyBookingsMutation(records, { label: input || "Booking request", value: "New", status: "Created" });
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
    setInput("");
  }
  function advance(id: string) {
    const next = transitionBookingsRecord(records, id, transitions);
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
  }
  function remove(id: string) {
    const next = removeBookingsRecord(records, id);
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
  }
  return (
    <main className="app">
      <header className="top"><div className="wrap" style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><strong>SlotWise</strong><nav style={{display:"flex",gap:8,overflowX:"auto"}}>{views.map((item) => <button key={item} onClick={() => setView(item)} className="primary" style={{background:item===view?"var(--primary)":"#e2e8f0",color:item===view?"white":"#0f172a"}}>{item}</button>)}</nav></div></header>
      <section className="wrap hero">
        <div className="panel">
          <p style={{fontWeight:900,textTransform:"uppercase",letterSpacing:".16em",fontSize:12,color:"var(--primary)"}}>booking</p>
          <h1 style={{fontSize:48,lineHeight:1,margin:"10px 0"}}>SlotWise</h1>
          <p style={{lineHeight:1.7,color:"#475569"}}>Build a booking platform with staff calendars, availability slots, customer bookings, and admin approvals.</p>
          <div className="calendar-grid" style={{marginTop:18}}>{visible.map((record) => <article key={record.id || record.label} className="card"><strong>{record.label}</strong><p style={{fontSize:28,fontWeight:850,margin:"8px 0"}}>{record.value}</p><span>{record.status}</span><div style={{display:"flex",gap:8,marginTop:12}}><button data-action="transition" onClick={() => advance(record.id)} className="primary" style={{padding:"8px 10px"}}>Confirm booking</button><button data-action="delete" onClick={() => remove(record.id)} className="primary" style={{padding:"8px 10px",background:"#fee2e2",color:"#991b1b"}}>Cancel booking</button></div></article>)}</div>
        </div>
        <aside className="panel">
          <h2>Booking request</h2>
          <p>Adds a request to admin queue</p>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Name, Email, Preferred slot, Notes" style={{width:"100%",minHeight:110,border:"1px solid #cbd5e1",borderRadius:12,padding:12}} />
          <button onClick={submit} className="primary" style={{width:"100%",marginTop:10}}>book slot</button>
          <div style={{display:"grid",gap:8,marginTop:16}}>{events.map((event) => <div key={event} className="card">{event}</div>)}</div>
        </aside>
      </section>
    </main>
  );
}
