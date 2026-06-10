import { applyCartMutation, removeCartRecord, transitionCartRecord } from "@/lib/cart-engine";

export const statusFlow = [
  "Cart",
  "Review",
  "Paid",
  "Fulfilled"
] as const;

export function handleCartAction(records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>, body: { action?: string; id?: string; label?: string; value?: string; status?: string }) {
  if (body.action === "transition" && body.id) return transitionCartRecord(records, body.id, [...statusFlow]);
  if (body.action === "delete" && body.id) return removeCartRecord(records, body.id);
  return applyCartMutation(records, { label: body.label || "Checkout", value: body.value || "New", status: body.status || statusFlow[0] || "Created" });
}
