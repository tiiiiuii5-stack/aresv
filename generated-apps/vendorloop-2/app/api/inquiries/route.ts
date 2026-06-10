let records = [
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
const statusFlow = ["Top rated","Fast reply","Verified","In Progress","Done"];

export async function GET() {
  return Response.json({ records, endpoint: "inquiries" });
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
  const record = { id: crypto.randomUUID(), label: body.label || "Buyer inquiry", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "send inquiry", parentId: records[0]?.id };
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
