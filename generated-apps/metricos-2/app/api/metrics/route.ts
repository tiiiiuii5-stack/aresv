let records = [
  {
    "id": "analytics-1",
    "label": "Activation",
    "value": "64%",
    "status": "+8%",
    "meta": "KPI bands"
  },
  {
    "id": "analytics-2",
    "label": "Net retention",
    "value": "112%",
    "status": "Healthy",
    "meta": "Funnel analysis",
    "parentId": "analytics-1"
  },
  {
    "id": "analytics-3",
    "label": "Churn risk",
    "value": "17",
    "status": "Watch",
    "meta": "Retention cohorts",
    "parentId": "analytics-1"
  }
];
const statusFlow = ["Open","Investigating","Resolved"];

export async function GET() {
  return Response.json({ records, endpoint: "metrics" });
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
  const record = { id: crypto.randomUUID(), label: body.label || "Create alert", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "create alert", parentId: records[0]?.id };
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
