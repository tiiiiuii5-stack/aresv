let records = [
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
const statusFlow = ["Queued","Active","Healthy","In Progress","Done"];

export async function GET() {
  return Response.json({ records, endpoint: "/api/marketplace-24-events" });
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
  const record = { id: crypto.randomUUID(), label: body.label || "Create marketplace event", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "send inquiry", parentId: records[0]?.id };
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
