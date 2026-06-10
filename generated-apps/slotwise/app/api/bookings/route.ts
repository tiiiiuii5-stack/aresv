let records = [
  {
    "id": "booking-1",
    "label": "Monday 9:00",
    "value": "3 seats",
    "status": "Open",
    "meta": "Availability grid"
  },
  {
    "id": "booking-2",
    "label": "Tuesday 14:00",
    "value": "1 seat",
    "status": "Almost full",
    "meta": "Booking form",
    "parentId": "booking-1"
  },
  {
    "id": "booking-3",
    "label": "Friday 11:30",
    "value": "5 seats",
    "status": "Open",
    "meta": "Request approvals",
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
  const record = { id: crypto.randomUUID(), label: body.label || "Booking request", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "book slot", parentId: records[0]?.id };
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
