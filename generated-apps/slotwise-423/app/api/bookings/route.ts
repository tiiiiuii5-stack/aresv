let records = [
  {
    "id": "booking-1",
    "label": "SlotWise 423 queue item",
    "value": "1269 open",
    "status": "Queued",
    "meta": "Variant 423 command queue"
  },
  {
    "id": "booking-2",
    "label": "SlotWise 423 rule set",
    "value": "427 rules",
    "status": "Active",
    "meta": "Variant 423 rule builder",
    "parentId": "booking-1"
  },
  {
    "id": "booking-3",
    "label": "SlotWise 423 insight",
    "value": "513%",
    "status": "Healthy",
    "meta": "Variant 423 event timeline",
    "parentId": "booking-1"
  }
];
const statusFlow = ["Requested","Confirmed","Completed"];

export async function GET() {
  return Response.json({ records, endpoint: "bookings" });
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
  const record = { id: crypto.randomUUID(), label: body.label || "Create booking event", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "book slot", parentId: records[0]?.id };
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
