let records = [
  {
    "id": "ai-content-1",
    "label": "PromptDesk 427 queue item",
    "value": "1281 open",
    "status": "Queued",
    "meta": "Variant 427 command queue"
  },
  {
    "id": "ai-content-2",
    "label": "PromptDesk 427 rule set",
    "value": "431 rules",
    "status": "Active",
    "meta": "Variant 427 rule builder",
    "parentId": "ai-content-1"
  },
  {
    "id": "ai-content-3",
    "label": "PromptDesk 427 insight",
    "value": "517%",
    "status": "Healthy",
    "meta": "Variant 427 event timeline",
    "parentId": "ai-content-1"
  }
];
const statusFlow = ["Queued","Active","Healthy","In Progress","Done"];

export async function GET() {
  return Response.json({ records, endpoint: "drafts" });
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
  const record = { id: crypto.randomUUID(), label: body.label || "Create ai-content event", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "create brief", parentId: records[0]?.id };
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
