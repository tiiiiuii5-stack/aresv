let records = [
  {
    "id": "ecommerce-1",
    "label": "Launch Kit",
    "value": "$79",
    "status": "In stock",
    "meta": "Product filters"
  },
  {
    "id": "ecommerce-2",
    "label": "Founder Bundle",
    "value": "$149",
    "status": "Best seller",
    "meta": "Cart drawer",
    "parentId": "ecommerce-1"
  },
  {
    "id": "ecommerce-3",
    "label": "Ops Template",
    "value": "$39",
    "status": "Low stock",
    "meta": "Checkout form",
    "parentId": "ecommerce-1"
  }
];
const statusFlow = ["Cart","Review","Paid","Fulfilled"];

export async function GET() {
  return Response.json({ records, endpoint: "/api/checkout" });
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
  const record = { id: crypto.randomUUID(), label: body.label || "Checkout", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "add to cart", parentId: records[0]?.id };
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
