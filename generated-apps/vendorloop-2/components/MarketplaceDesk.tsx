"use client";

import { useMemo, useState } from "react";
import { applyInquiriesMutation, removeInquiriesRecord, transitionInquiriesRecord } from "@/lib/market-engine";

const initialRecords = [
  {
    "id": "marketplace-1",
    "label": "Verified design partner",
    "value": "$2.4k",
    "status": "Top rated",
    "meta": "Listing search"
  },
  {
    "id": "marketplace-2",
    "label": "Ops automation pack",
    "value": "$899",
    "status": "Fast reply",
    "meta": "Seller cards",
    "parentId": "marketplace-1"
  },
  {
    "id": "marketplace-3",
    "label": "Launch advisor",
    "value": "$150/hr",
    "status": "Verified",
    "meta": "Trust scoring",
    "parentId": "marketplace-1"
  }
];
const views = ["Marketplace","Listings","Seller","Checkout"];
const transitions = ["Top rated","Fast reply","Verified","In Progress","Done"];

export function MarketplaceDesk({ initialView = views[0] }: { initialView?: string }) {
  const [view, setView] = useState(initialView);
  const [records, setRecords] = useState(initialRecords);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<string[]>(["VendorLoop ready"]);
  const visible = useMemo(() => records.filter((record) => view === views[0] || record.status.toLowerCase().includes(view.toLowerCase()) || record.meta.toLowerCase().includes(view.toLowerCase())), [records, view]);
  function submit() {
    const next = applyInquiriesMutation(records, { label: input || "Buyer inquiry", value: "New", status: "Created" });
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
    setInput("");
  }
  function advance(id: string) {
    const next = transitionInquiriesRecord(records, id, transitions);
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
  }
  function remove(id: string) {
    const next = removeInquiriesRecord(records, id);
    setRecords(next.records);
    setEvents((current) => [next.event, ...current]);
  }
  return (
    <main className="app">
      <header className="top"><div className="wrap" style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><strong>VendorLoop</strong><nav style={{display:"flex",gap:8,overflowX:"auto"}}>{views.map((item) => <button key={item} onClick={() => setView(item)} className="primary" style={{background:item===view?"var(--primary)":"#e2e8f0",color:item===view?"white":"#0f172a"}}>{item}</button>)}</nav></div></header>
      <section className="wrap hero">
        <div className="panel">
          <p style={{fontWeight:900,textTransform:"uppercase",letterSpacing:".16em",fontSize:12,color:"var(--primary)"}}>marketplace</p>
          <h1 style={{fontSize:48,lineHeight:1,margin:"10px 0"}}>VendorLoop</h1>
          <p style={{lineHeight:1.7,color:"#475569"}}>Build a marketplace where buyers send inquiries to sellers, sellers manage listings, and admins resolve transactions 1780202394200.</p>
          <div className="market-grid" style={{marginTop:18}}>{visible.map((record) => <article key={record.id || record.label} className="card"><strong>{record.label}</strong><p style={{fontSize:28,fontWeight:850,margin:"8px 0"}}>{record.value}</p><span>{record.status}</span><div style={{display:"flex",gap:8,marginTop:12}}><button data-action="transition" onClick={() => advance(record.id)} className="primary" style={{padding:"8px 10px"}}>Qualify inquiry</button><button data-action="delete" onClick={() => remove(record.id)} className="primary" style={{padding:"8px 10px",background:"#fee2e2",color:"#991b1b"}}>Remove listing</button></div></article>)}</div>
        </div>
        <aside className="panel">
          <h2>Buyer inquiry</h2>
          <p>Creates qualified lead</p>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Need, Budget, Timeline" style={{width:"100%",minHeight:110,border:"1px solid #cbd5e1",borderRadius:12,padding:12}} />
          <button onClick={submit} className="primary" style={{width:"100%",marginTop:10}}>send inquiry</button>
          <div style={{display:"grid",gap:8,marginTop:16}}>{events.map((event) => <div key={event} className="card">{event}</div>)}</div>
        </aside>
      </section>
    </main>
  );
}
