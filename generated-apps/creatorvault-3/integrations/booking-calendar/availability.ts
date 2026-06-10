// Integration module: Booking-Calendar
export type Slot = { id: string; startsAt: string; capacity: number; booked: number };

export function availableSlots(slots: Slot[]) {
  return slots.filter((slot) => slot.booked < slot.capacity);
}

export function reserveSlot(slot: Slot) {
  if (slot.booked >= slot.capacity) throw new Error("Slot is full");
  return { ...slot, booked: slot.booked + 1 };
}
