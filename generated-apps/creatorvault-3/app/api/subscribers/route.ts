let records = [
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
const statusFlow = ["Growing","Launching","Limited","In Progress","Done"];

export async function GET() {
  return Response.json({ records, endpoint: "/api/subscribers" });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.action === "transition" && body.id) {
    records = records.map((record) => record.id === body.id ? { ...record, status: statusFlow[Math.min(statusFlow.indexOf(record.status) + 1, statusFlow.length - 1)] || "Done" } : record);
    return Response.json({ ok: true, records });
  }
  if (body.action === "delete" && body.id) {
    records = records.filter((record) => record.id !== body.id && record.parentId !== body.id);
    return Response.json({ ok: true, records });
  }
  const record = { id: crypto.randomUUID(), label: body.label || "New offer", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "launch offer", parentId: records[0]?.id };
  records = [record, ...records];
  return Response.json({ ok: true, record, records }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  records = records.map((record) => record.id === body.id ? { ...record, status: body.status || "Done" } : record);
  return Response.json({ ok: true, records });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  records = records.filter((record) => record.id !== body.id && record.parentId !== body.id);
  return Response.json({ ok: true, records });
}
