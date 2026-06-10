let records = [
  {
    "id": "fitness-1",
    "label": "Strength session",
    "value": "42 min",
    "status": "Planned",
    "meta": "Workout log"
  },
  {
    "id": "fitness-2",
    "label": "Hydration",
    "value": "6/8",
    "status": "On pace",
    "meta": "Habit streaks",
    "parentId": "fitness-1"
  },
  {
    "id": "fitness-3",
    "label": "Mobility",
    "value": "12 min",
    "status": "Complete",
    "meta": "Progress charts",
    "parentId": "fitness-1"
  }
];
const statusFlow = ["Planned","Complete","Reviewed"];

export async function GET() {
  return Response.json({ records, endpoint: "checkins" });
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
  const record = { id: crypto.randomUUID(), label: body.label || "Workout check-in", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "log workout", parentId: records[0]?.id };
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
