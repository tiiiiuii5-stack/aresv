"use client";

import { useMemo, useState } from "react";

const initialRecords = [
  {
    "id": "restaurant-1",
    "label": "Spicy noodle bowl",
    "value": "$14",
    "status": "Hot station",
    "meta": "Menu browsing"
  },
  {
    "id": "restaurant-2",
    "label": "Citrus salad",
    "value": "$11",
    "status": "Ready fast",
    "meta": "Cart builder",
    "parentId": "restaurant-1"
  },
  {
    "id": "restaurant-3",
    "label": "Family dinner pack",
    "value": "$42",
    "status": "Popular",
    "meta": "Kitchen queue",
    "parentId": "restaurant-1"
  }
];
const views = ["Menu","Order","Kitchen","Admin"];
const transitions = ["Hot station","Ready fast","Popular","In Progress","Done"];

export function KitchenOrderBoard({ initialView = views[0] }: { initialView?: string }) {
  const [view, setView] = useState(initialView);
  const [records, setRecords] = useState(initialRecords);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<string[]>(["TableFlow ready"]);
  const visible = useMemo(() => records.filter((record) => view === views[0] || record.status.toLowerCase().includes(view.toLowerCase()) || record.meta.toLowerCase().includes(view.toLowerCase())), [records, view]);
  async function mutate(payload: { action: "create" | "transition" | "delete"; id?: string; label?: string; value?: string; status?: string }) {
    const response = await fetch("/api/orders", {
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
    setEvents((current) => [payload.action + " persisted through /api/orders", ...current]);
    if (payload.action === "create") setInput("");
  }
  return (
    <main className="app">
      <header className="top"><div className="wrap" style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><strong>TableFlow</strong><nav style={{display:"flex",gap:8,overflowX:"auto"}}>{views.map((item) => <a key={item} href={"#"+item} onClick={(event) => { event.preventDefault(); setView(item); }} className="primary" style={{background:item===view?"var(--primary)":"#e2e8f0",color:item===view?"white":"#0f172a",textDecoration:"none"}}>{item}</a>)}</nav></div></header>
      <section className="wrap hero">
        <div className="panel">
          <p style={{fontWeight:900,textTransform:"uppercase",letterSpacing:".16em",fontSize:12,color:"var(--primary)"}}>restaurant</p>
          <h1 style={{fontSize:48,lineHeight:1,margin:"10px 0"}}>TableFlow</h1>
          <p style={{lineHeight:1.7,color:"#475569"}}>Build an ecommerce store for boutique owners, inventory managers, and shoppers. Real users: store owner, inventory manager, shopper. Real actions: create products, add to cart, checkout with Stripe, receive webhook payment confirmation, reduce inventory, send order confirmation email. Real data: products, carts, orders, payments, inventory events. Real state changes: cart totals update, checkout creates order, payment webhook marks paid, stock decreases, refresh keeps saved state.</p>
          <div className="ordering-board" style={{marginTop:18}}>{visible.map((record) => <article key={record.id || record.label} className="card"><strong>{record.label}</strong><p style={{fontSize:28,fontWeight:850,margin:"8px 0"}}>{record.value}</p><span>{record.status}</span><div style={{display:"flex",gap:8,marginTop:12}}><button data-action="transition" data-api="/api/orders" data-db-change="update-status" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "transition", id: record.id })} className="primary" style={{padding:"8px 10px"}}>Advance prep</button><button data-action="delete" data-api="/api/orders" data-db-change="delete-record" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "delete", id: record.id })} className="primary" style={{padding:"8px 10px",background:"#fee2e2",color:"#991b1b"}}>Remove line</button></div></article>)}</div>
        </div>
        <aside className="panel">
          <h2>Order item</h2>
          <p>Adds ticket to kitchen queue</p>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Customer, Item, Pickup time, Notes" style={{width:"100%",minHeight:110,border:"1px solid #cbd5e1",borderRadius:12,padding:12}} />
          <button data-action="create" data-api="/api/orders" data-db-change="insert-record" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "create", label: input || "Order item", value: "New", status: transitions[0] || "Created" })} className="primary" style={{width:"100%",marginTop:10}}>send order</button>
          <div style={{display:"grid",gap:8,marginTop:16}}>{events.map((event) => <div key={event} className="card">{event}</div>)}</div>
        </aside>
      </section>
    </main>
  );
}
