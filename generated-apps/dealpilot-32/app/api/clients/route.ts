let records = [
  {
    "id": "crm-1",
    "label": "DealPilot 32 queue item",
    "value": "96 open",
    "status": "Queued",
    "meta": "Variant 32 command queue"
  },
  {
    "id": "crm-2",
    "label": "DealPilot 32 rule set",
    "value": "36 rules",
    "status": "Active",
    "meta": "Variant 32 rule builder",
    "parentId": "crm-1"
  },
  {
    "id": "crm-3",
    "label": "DealPilot 32 insight",
    "value": "122%",
    "status": "Healthy",
    "meta": "Variant 32 event timeline",
    "parentId": "crm-1"
  }
];
const statusFlow = ["Lead","In Progress","Review","Done"];

export async function GET() {
  return Response.json({ records, endpoint: "clients" });
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
  const record = { id: crypto.randomUUID(), label: body.label || "Create crm event", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "move deal", parentId: records[0]?.id };
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
