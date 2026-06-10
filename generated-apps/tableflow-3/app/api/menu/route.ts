let records = [
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
const statusFlow = ["Hot station","Ready fast","Popular","In Progress","Done"];

export async function GET() {
  return Response.json({ records, endpoint: "/api/menu" });
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
  const record = { id: crypto.randomUUID(), label: body.label || "Order item", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "send order", parentId: records[0]?.id };
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
