"use client";

import { Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { InstitutionalMetricCard, InstitutionalPageHero, InstitutionalPageShell } from "@/components/institutional/institutional-shell";

type Role = "Owner" | "Instructor" | "Member";
type SlotStatus = "unpublished" | "published";
type BookingStatus = "confirmed" | "cancelled" | "attended";
type AttendanceStatus = "pending" | "present" | "absent" | "late";

type Studio = { id: string; name: string; location: string; owner: string };
type Instructor = { id: string; name: string; specialty: string; studioId: string };
type StudioClass = { id: string; name: string; description: string; instructorId: string; capacity: number; duration: number };
type TimeSlot = { id: string; classId: string; startTime: string; endTime: string; capacityRemaining: number; isPublished: boolean; status: SlotStatus };
type Booking = { id: string; timeSlotId: string; memberName: string; status: BookingStatus; createdAt: string };
type Attendance = { id: string; bookingId: string; status: AttendanceStatus; markedAt?: string };

type BookingState = {
  studios: Studio[];
  instructors: Instructor[];
  classes: StudioClass[];
  timeSlots: TimeSlot[];
  bookings: Booking[];
  attendance: Attendance[];
};

const storageKey = "ventureos:studio-booking-platform:v1";
const memberStorageKey = "ventureos:studio-booking-platform:member";

export function StudioBookingPlatform() {
  const [state, setState] = useState<BookingState>(() => seedBookingState());
  const [role, setRole] = useState<Role>("Member");
  const [selectedInstructor, setSelectedInstructor] = useState("all");
  const [fromDate, setFromDate] = useState(todayInputValue());
  const [toDate, setToDate] = useState(offsetDateInputValue(14));
  const [memberName, setMemberName] = useState("Maya Chen");
  const [message, setMessage] = useState("Demo workspace ready. Booking changes are saved in this browser only.");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) queueMicrotask(() => setState(JSON.parse(stored) as BookingState));
    const storedMember = window.localStorage.getItem(memberStorageKey);
    if (storedMember) queueMicrotask(() => setMemberName(storedMember));
  }, []);

  function commit(nextState: BookingState, nextMessage: string) {
    window.localStorage.setItem(storageKey, JSON.stringify(nextState));
    setState(nextState);
    setMessage(nextMessage);
  }

  function resetSeedData() {
    const fresh = seedBookingState();
    commit(fresh, "Seed data restored: 2 studios, 3 instructors, 5 classes, 10 slots, and 8 bookings.");
  }

  function updateMemberName(nextMemberName: string) {
    window.localStorage.setItem(memberStorageKey, nextMemberName);
    setMemberName(nextMemberName);
  }

  function publishTimeSlot(timeSlotId: string) {
    const slot = state.timeSlots.find((item) => item.id === timeSlotId);
    if (!slot) return;
    const nextState = {
      ...state,
      timeSlots: state.timeSlots.map((item) => (item.id === timeSlotId ? { ...item, isPublished: true, status: "published" as SlotStatus } : item)),
    };
    commit(nextState, "Time slot published for members.");
  }

  function bookSession(timeSlotId: string) {
    const slot = state.timeSlots.find((item) => item.id === timeSlotId);
    if (!slot) return;
    if (!slot.isPublished) {
      setMessage("This class is not published yet.");
      return;
    }
    if (slot.capacityRemaining <= 0) {
      setMessage("Class is full");
      return;
    }
    if (state.bookings.some((booking) => booking.timeSlotId === timeSlotId && booking.memberName === memberName && booking.status === "confirmed")) {
      setMessage(`${memberName} already booked this class.`);
      return;
    }
    const booking: Booking = {
      id: `booking-${crypto.randomUUID()}`,
      timeSlotId,
      memberName,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };
    const nextState = {
      ...state,
      timeSlots: state.timeSlots.map((item) => (item.id === timeSlotId ? { ...item, capacityRemaining: item.capacityRemaining - 1 } : item)),
      bookings: [booking, ...state.bookings],
      attendance: [{ id: `attendance-${crypto.randomUUID()}`, bookingId: booking.id, status: "pending" as AttendanceStatus }, ...state.attendance],
    };
    commit(nextState, `${memberName} booked ${classForSlot(state, slot).name}. Capacity decreased.`);
  }

  function cancelBooking(bookingId: string) {
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking || booking.status !== "confirmed") return;
    const slot = state.timeSlots.find((item) => item.id === booking.timeSlotId);
    if (!slot) return;
    if (new Date(slot.startTime).getTime() <= Date.now()) {
      setMessage("Cannot cancel past classes");
      return;
    }
    const relatedClass = state.classes.find((item) => item.id === slot.classId);
    const nextState = {
      ...state,
      bookings: state.bookings.map((item) => (item.id === bookingId ? { ...item, status: "cancelled" as BookingStatus } : item)),
      timeSlots: state.timeSlots.map((item) =>
        item.id === slot.id ? { ...item, capacityRemaining: Math.min(relatedClass?.capacity ?? item.capacityRemaining + 1, item.capacityRemaining + 1) } : item,
      ),
    };
    commit(nextState, `${booking.memberName} cancelled before start time. Capacity restored.`);
  }

  function markAttendance(bookingId: string, status: Exclude<AttendanceStatus, "pending">) {
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking || booking.status !== "confirmed") {
      setMessage("Attendance can only be marked for confirmed bookings.");
      return;
    }
    const nextState = {
      ...state,
      bookings: state.bookings.map((item) => (item.id === bookingId ? { ...item, status: status === "present" ? "attended" : item.status } : item)),
      attendance: state.attendance.map((item) =>
        item.bookingId === bookingId ? { ...item, status, markedAt: new Date().toISOString() } : item,
      ),
    };
    commit(nextState, status === "present" ? `${booking.memberName} marked present. Booking status changed to attended.` : `${booking.memberName} marked ${status}.`);
  }

  const publishedSlots = useMemo(() => state.timeSlots.filter((slot) => slot.isPublished), [state.timeSlots]);
  const instructorSchedule = useMemo(
    () =>
      state.timeSlots
        .filter((slot) => {
          const studioClass = state.classes.find((item) => item.id === slot.classId);
          if (!studioClass) return false;
          const inInstructor = selectedInstructor === "all" || studioClass.instructorId === selectedInstructor;
          const slotDay = slot.startTime.slice(0, 10);
          return inInstructor && slotDay >= fromDate && slotDay <= toDate;
        })
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [fromDate, selectedInstructor, state.classes, state.timeSlots, toDate],
  );

  return (
    <InstitutionalPageShell purposeLabel="Studio Booking Demo" actions={[{ label: "Home", href: "/" }, { label: "Build", href: "/build", variant: "default" }]}>
      <div className="grid gap-5">
        <InstitutionalPageHero
          eyebrow="Studio Booking Platform"
          title="Classes, capacity, bookings, and attendance."
          description="Demo-only workflow: actions persist to localStorage for this browser and are not connected to production booking APIs."
          aside={
            <div className="flex flex-wrap gap-2">
            {(["Member", "Instructor", "Owner"] as Role[]).map((item) => (
              <button key={item} type="button" onClick={() => setRole(item)} className={item === role ? "action primary" : "action"} aria-pressed={item === role}>
                {item}
              </button>
            ))}
            <button type="button" onClick={resetSeedData} className="action">
              <RefreshCw className="h-4 w-4" /> Restore seed data
            </button>
            </div>
          }
        />

        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="Studios" value={state.studios.length} />
          <Metric label="Instructors" value={state.instructors.length} />
          <Metric label="Published slots" value={publishedSlots.length} />
          <Metric label="Confirmed bookings" value={state.bookings.filter((booking) => booking.status === "confirmed").length} />
        </section>

        <section>
        <div className="vos-cell px-4 py-3 text-sm font-semibold text-[rgb(var(--vos-primary))]" role="status">
          {message}
        </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {role === "Member" ? <MemberDashboard state={state} memberName={memberName} onMemberName={updateMemberName} onBook={bookSession} onCancel={cancelBooking} /> : null}
          {role === "Instructor" ? (
            <InstructorDashboard
              state={state}
              schedule={instructorSchedule}
              selectedInstructor={selectedInstructor}
              fromDate={fromDate}
              toDate={toDate}
              onInstructor={setSelectedInstructor}
              onFromDate={setFromDate}
              onToDate={setToDate}
              onAttendance={markAttendance}
            />
          ) : null}
          {role === "Owner" ? <OwnerDashboard state={state} onPublish={publishTimeSlot} /> : null}
        </div>

        <aside className="space-y-5">
          <Panel title="Business rules">
            <Rule text='Booking decreases capacityRemaining by 1.' />
            <Rule text='Cancellation before startTime restores capacityRemaining by 1.' />
            <Rule text='Full classes show "Class is full".' />
            <Rule text='Past classes show "Cannot cancel past classes".' />
            <Rule text='Instructor attendance changes present bookings to attended.' />
          </Panel>
          <Panel title="State machines">
            <StateFlow label="Booking" flow="confirmed -> cancelled | attended" />
            <StateFlow label="TimeSlot" flow="unpublished -> published" />
          </Panel>
        </aside>
        </section>
      </div>
    </InstitutionalPageShell>
  );
}

function MemberDashboard({
  state,
  memberName,
  onMemberName,
  onBook,
  onCancel,
}: {
  state: BookingState;
  memberName: string;
  onMemberName: (value: string) => void;
  onBook: (timeSlotId: string) => void;
  onCancel: (bookingId: string) => void;
}) {
  const slots = state.timeSlots.filter((slot) => slot.isPublished).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const myBookings = state.bookings.filter((booking) => booking.memberName.toLowerCase() === memberName.toLowerCase());
  return (
    <>
      <Panel title="Member class catalog" action={<NameInput value={memberName} onChange={onMemberName} />}>
        <div className="grid gap-3 lg:grid-cols-2">
          {slots.map((slot) => {
            const studioClass = classForSlot(state, slot);
            const instructor = instructorForClass(state, studioClass);
            const studio = studioForInstructor(state, instructor);
            return (
              <article key={slot.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{studioClass.name}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{studioClass.description}</p>
                  </div>
                  <CapacityBadge remaining={slot.capacityRemaining} capacity={studioClass.capacity} />
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-300">
                  <span>{studio.name} - {studio.location}</span>
                  <span>{instructor.name} - {instructor.specialty}</span>
                  <span>{formatSlot(slot)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onBook(slot.id)}
                  disabled={slot.capacityRemaining <= 0}
                  title={slot.capacityRemaining <= 0 ? "This class is full." : "Book this published class."}
                  className="action primary mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Book class
                </button>
              </article>
            );
          })}
        </div>
      </Panel>

      <Panel title="My bookings">
        <div className="grid gap-3">
          {myBookings.map((booking) => (
            <BookingRow key={booking.id} state={state} booking={booking} actionLabel="Cancel booking" onAction={() => onCancel(booking.id)} />
          ))}
        </div>
      </Panel>
    </>
  );
}

function InstructorDashboard({
  state,
  schedule,
  selectedInstructor,
  fromDate,
  toDate,
  onInstructor,
  onFromDate,
  onToDate,
  onAttendance,
}: {
  state: BookingState;
  schedule: TimeSlot[];
  selectedInstructor: string;
  fromDate: string;
  toDate: string;
  onInstructor: (value: string) => void;
  onFromDate: (value: string) => void;
  onToDate: (value: string) => void;
  onAttendance: (bookingId: string, status: Exclude<AttendanceStatus, "pending">) => void;
}) {
  const scheduleBookingIds = new Set(schedule.flatMap((slot) => state.bookings.filter((booking) => booking.timeSlotId === slot.id).map((booking) => booking.id)));
  const roster = state.bookings.filter((booking) => scheduleBookingIds.has(booking.id));
  return (
    <>
      <Panel
        title="Instructor schedule"
        action={
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={selectedInstructor} onChange={(event) => onInstructor(event.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
              <option value="all">All instructors</option>
              {state.instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}
            </select>
            <input type="date" value={fromDate} onChange={(event) => onFromDate(event.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
            <input type="date" value={toDate} onChange={(event) => onToDate(event.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          </div>
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {schedule.map((slot) => {
            const studioClass = classForSlot(state, slot);
            const instructor = instructorForClass(state, studioClass);
            return (
              <article key={slot.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <h3 className="font-semibold text-white">{studioClass.name}</h3>
                <p className="mt-2 text-sm text-slate-400">{instructor.name} - {formatSlot(slot)}</p>
                <CapacityBadge remaining={slot.capacityRemaining} capacity={studioClass.capacity} />
              </article>
            );
          })}
        </div>
      </Panel>

      <Panel title="Attendance roster">
        <div className="grid gap-3">
          {roster.map((booking) => (
            <BookingRow key={booking.id} state={state} booking={booking} actionLabel="Mark present" onAction={() => onAttendance(booking.id, "present")} />
          ))}
        </div>
      </Panel>
    </>
  );
}

function OwnerDashboard({ state, onPublish }: { state: BookingState; onPublish: (timeSlotId: string) => void }) {
  return (
    <>
      <Panel title="Owner studio operations">
        <div className="grid gap-3 lg:grid-cols-2">
          {state.studios.map((studio) => (
            <article key={studio.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <h3 className="font-semibold text-white">{studio.name}</h3>
              <p className="mt-2 text-sm text-slate-400">{studio.location}</p>
              <p className="mt-3 text-sm font-semibold text-[rgb(var(--vos-text))]">Owner: {studio.owner}</p>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Time slot publishing">
        <div className="grid gap-3">
          {state.timeSlots.map((slot) => {
            const studioClass = classForSlot(state, slot);
            return (
              <article key={slot.id} className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-semibold text-white">{studioClass.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{formatSlot(slot)} - {slot.status}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onPublish(slot.id)}
                  disabled={slot.isPublished}
                  title={slot.isPublished ? "This time slot is already published." : "Publish this time slot for members."}
                  className="action primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Publish time slot
                </button>
              </article>
            );
          })}
        </div>
      </Panel>

      <Panel title="All bookings">
        <div className="grid gap-3">
          {state.bookings.map((booking) => <BookingRow key={booking.id} state={state} booking={booking} />)}
        </div>
      </Panel>
    </>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="vos-panel p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="vos-h2">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <InstitutionalMetricCard label={label} value={value} />;
}

function BookingRow({ state, booking, actionLabel, onAction }: { state: BookingState; booking: Booking; actionLabel?: string; onAction?: () => void }) {
  const slot = state.timeSlots.find((item) => item.id === booking.timeSlotId);
  const studioClass = slot ? classForSlot(state, slot) : undefined;
  const attendance = state.attendance.find((item) => item.bookingId === booking.id);
  return (
    <article className="flex flex-col gap-3 vos-cell p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h3 className="font-semibold text-[rgb(var(--vos-text))]">{booking.memberName}</h3>
        <p className="mt-1 vos-body">{studioClass?.name ?? "Class"} - {slot ? formatSlot(slot) : "No slot"}</p>
        <p className="mt-2 vos-label">Booking: {booking.status} / Attendance: {attendance?.status ?? "pending"}</p>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          disabled={booking.status !== "confirmed"}
          title={booking.status !== "confirmed" ? "Only confirmed bookings can use this action." : actionLabel}
          className="action primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

function CapacityBadge({ remaining, capacity }: { remaining: number; capacity: number }) {
  const full = remaining <= 0;
  return (
    <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${full ? "bg-red-500/15 text-red-200" : "bg-emerald-500/15 text-emerald-200"}`}>
      {remaining} of {capacity} seats left
    </span>
  );
}

function NameInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative block min-w-64">
      <span className="pointer-events-none absolute left-3 top-2.5 text-xs font-bold text-[rgb(var(--vos-text-subtle))]">MEMBER</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full py-2 pl-20 pr-3 text-sm" aria-label="Member name" />
    </label>
  );
}

function Rule({ text }: { text: string }) {
  return <p className="mb-2 flex items-start gap-2 text-sm leading-6 text-slate-300"><Check className="mt-1 h-4 w-4 flex-none text-emerald-300" />{text}</p>;
}

function StateFlow({ label, flow }: { label: string; flow: string }) {
  return <p className="mb-2 vos-cell p-3 text-sm text-[rgb(var(--vos-text-muted))]"><strong className="text-[rgb(var(--vos-text))]">{label}:</strong> {flow}</p>;
}

function classForSlot(state: BookingState, slot: TimeSlot) {
  return state.classes.find((item) => item.id === slot.classId) ?? state.classes[0];
}

function instructorForClass(state: BookingState, studioClass: StudioClass) {
  return state.instructors.find((item) => item.id === studioClass.instructorId) ?? state.instructors[0];
}

function studioForInstructor(state: BookingState, instructor: Instructor) {
  return state.studios.find((item) => item.id === instructor.studioId) ?? state.studios[0];
}

function formatSlot(slot: TimeSlot) {
  return `${new Date(slot.startTime).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} - ${new Date(slot.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function seedBookingState(): BookingState {
  const base = new Date();
  base.setHours(9, 0, 0, 0);
  const studios: Studio[] = [
    { id: "studio-flow-state", name: "Flow State Yoga", location: "Austin, TX", owner: "Nora Patel" },
    { id: "studio-north-loop", name: "North Loop Movement", location: "Minneapolis, MN", owner: "Evan Brooks" },
  ];
  const instructors: Instructor[] = [
    { id: "instructor-lina", name: "Lina Torres", specialty: "Vinyasa Yoga", studioId: "studio-flow-state" },
    { id: "instructor-marcus", name: "Marcus Reed", specialty: "Boxing Fundamentals", studioId: "studio-north-loop" },
    { id: "instructor-ava", name: "Ava Kim", specialty: "Pilates Reformer", studioId: "studio-north-loop" },
  ];
  const classes: StudioClass[] = [
    { id: "class-vinyasa", name: "Morning Vinyasa", description: "Breath-led flow for strength and mobility.", instructorId: "instructor-lina", capacity: 8, duration: 60 },
    { id: "class-yin", name: "Evening Yin", description: "Slow restorative class for recovery.", instructorId: "instructor-lina", capacity: 10, duration: 50 },
    { id: "class-boxing", name: "Boxing Fundamentals", description: "Technique, footwork, and conditioning.", instructorId: "instructor-marcus", capacity: 12, duration: 45 },
    { id: "class-reformer", name: "Reformer Basics", description: "Small-group reformer sequence for beginners.", instructorId: "instructor-ava", capacity: 6, duration: 55 },
    { id: "class-barre", name: "Lunch Barre Express", description: "Fast low-impact strength session.", instructorId: "instructor-ava", capacity: 9, duration: 40 },
  ];
  const timeSlots: TimeSlot[] = Array.from({ length: 10 }, (_, index) => {
    const studioClass = classes[index % classes.length];
    const start = new Date(base.getTime() + (index + 1) * 24 * 60 * 60 * 1000 + (index % 3) * 2 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + studioClass.duration * 60 * 1000);
    const booked = index < 8 ? 1 : 0;
    return {
      id: `slot-${index + 1}`,
      classId: studioClass.id,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      capacityRemaining: Math.max(0, studioClass.capacity - booked),
      isPublished: index !== 9,
      status: index === 9 ? "unpublished" : "published",
    };
  });
  const names = ["Maya Chen", "Alice Nguyen", "Bob Smith", "Charlie Davis", "Priya Shah", "Jordan Lee", "Sam Rivera", "Taylor Morgan"];
  const bookings: Booking[] = names.map((memberName, index) => ({
    id: `booking-${index + 1}`,
    timeSlotId: timeSlots[index].id,
    memberName,
    status: "confirmed",
    createdAt: new Date(base.getTime() - (index + 1) * 60 * 60 * 1000).toISOString(),
  }));
  const attendance: Attendance[] = bookings.map((booking, index) => ({ id: `attendance-${index + 1}`, bookingId: booking.id, status: index === 0 ? "present" : "pending", markedAt: index === 0 ? new Date().toISOString() : undefined }));
  bookings[0] = { ...bookings[0], status: "attended" };
  return { studios, instructors, classes, timeSlots, bookings, attendance };
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDateInputValue(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
