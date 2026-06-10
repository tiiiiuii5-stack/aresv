import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type TimeSlot = {
  id: string;
  capacityTotal: number;
  capacityRemaining: number;
  startTime: string;
  status: "unpublished" | "published" | "cancelled";
};

export type Booking = {
  id: string;
  timeSlotId: string;
  memberName: string;
  status: "draft" | "confirmed" | "cancelled" | "attended";
};

type BookingStore = {
  timeSlots: TimeSlot[];
  bookings: Booking[];
};

const defaultStorePath = path.join(process.cwd(), ".next", "booking-domain-validation.json");

export class BookingDomainRuntime {
  constructor(private readonly storePath = defaultStorePath) {}

  async reset() {
    await this.write({ timeSlots: [], bookings: [] });
  }

  async createTimeSlot(input: { capacity: number; startTime?: string }) {
    if (input.capacity <= 0) throw new Error("Capacity must be greater than zero");
    const store = await this.read();
    const slot: TimeSlot = {
      id: randomUUID(),
      capacityTotal: input.capacity,
      capacityRemaining: input.capacity,
      startTime: input.startTime || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: "published",
    };
    store.timeSlots.push(slot);
    await this.write(store);
    return slot;
  }

  async bookSession(timeSlotId: string, memberName: string) {
    const store = await this.read();
    const slot = store.timeSlots.find((item) => item.id === timeSlotId);
    if (!slot) throw new Error("Time slot not found");
    if (slot.capacityRemaining <= 0) throw new Error("Class is full");
    if (store.bookings.some((booking) => booking.timeSlotId === timeSlotId && booking.memberName === memberName && booking.status === "confirmed")) {
      throw new Error("You already booked this class");
    }
    slot.capacityRemaining -= 1;
    const booking: Booking = {
      id: randomUUID(),
      timeSlotId,
      memberName,
      status: "confirmed",
    };
    store.bookings.push(booking);
    await this.write(store);
    return booking;
  }

  async cancelBooking(bookingId: string) {
    const store = await this.read();
    const booking = store.bookings.find((item) => item.id === bookingId);
    if (!booking) throw new Error("Booking not found");
    const slot = store.timeSlots.find((item) => item.id === booking.timeSlotId);
    if (!slot) throw new Error("Time slot not found");
    if (new Date(slot.startTime).getTime() <= Date.now()) throw new Error("Cannot cancel past classes");
    if (booking.status === "confirmed") {
      booking.status = "cancelled";
      slot.capacityRemaining = Math.min(slot.capacityTotal, slot.capacityRemaining + 1);
    }
    await this.write(store);
    return booking;
  }

  async markAttendance(bookingId: string) {
    const store = await this.read();
    const booking = store.bookings.find((item) => item.id === bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.status !== "confirmed") throw new Error("Attendance can only be marked for confirmed bookings");
    booking.status = "attended";
    await this.write(store);
    return booking;
  }

  async getTimeSlot(timeSlotId: string) {
    const store = await this.read();
    return store.timeSlots.find((item) => item.id === timeSlotId);
  }

  async getBooking(bookingId: string) {
    const store = await this.read();
    return store.bookings.find((item) => item.id === bookingId);
  }

  private async read(): Promise<BookingStore> {
    try {
      return JSON.parse(await fs.readFile(this.storePath, "utf8")) as BookingStore;
    } catch {
      return { timeSlots: [], bookings: [] };
    }
  }

  private async write(store: BookingStore) {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    await fs.writeFile(this.storePath, JSON.stringify(store, null, 2));
  }
}
