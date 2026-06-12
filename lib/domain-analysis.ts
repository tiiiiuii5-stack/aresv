import type { AppCategory, AppPlan } from "@/lib/app-planning-engine";

export type DomainAnalysis = {
  entities: Array<{ name: string; fields: string[] }>;
  relationships: Array<{ from: string; to: string; type: "one-to-many" | "one-to-one"; via: string }>;
  roles: Array<{ name: string; permissions: string[]; route: string }>;
  actions: Array<{ role: string; name: string; target: string; api: string; result: string }>;
  businessRules: Array<{ rule: string; error?: string }>;
  stateMachines: Array<{ entity: string; states: string[]; transitions: Array<{ from: string; to: string; action: string }> }>;
  persistence: "localStorage" | "SQLite" | "database";
  errorCases: string[];
  validationChecks: string[];
};

export function analyzeDomain(prompt: string, category: AppCategory): DomainAnalysis | null {
  const source = `${prompt} ${category}`.toLowerCase();
  if (category === "booking" || /\b(studios?|classes|instructors?|members?|booking platform|attendance|time ?slots?)\b/.test(source)) {
    return studioBookingDomain();
  }
  return null;
}

export function applyDomainAnalysis<T extends Omit<AppPlan, "truthSpec">>(plan: T, analysis: DomainAnalysis | null): T {
  if (!analysis) return plan;

  const isStudioBooking = analysis.entities.some((entity) => entity.name === "Studio") && analysis.entities.some((entity) => entity.name === "Booking");
  if (!isStudioBooking) return { ...plan, domainAnalysis: analysis };

  return {
    ...plan,
    category: "booking",
    appType: "SaaS dashboard",
    audience: "studio owners, instructors, and members",
    monetization: "studio SaaS subscription with paid member booking and instructor scheduling upgrades",
    visualDirection: "role-based studio booking workspace with owner operations, instructor roster tools, and member class discovery",
    layout: "calendar",
    routes: [
      { path: "/", label: "Member Classes", purpose: "Members browse published classes, book seats, cancel eligible bookings, and view their schedule" },
      { path: "/owner", label: "Owner Studio", purpose: "Owners manage studios, classes, time slots, capacity, publishing, bookings, and reports" },
      { path: "/instructor", label: "Instructor Schedule", purpose: "Instructors filter their schedule and mark attendance after class" },
      { path: "/member", label: "My Bookings", purpose: "Members review confirmed bookings, cancellations, and attendance outcomes" },
      { path: "/schedule", label: "Schedule", purpose: "Role-aware class calendar filtered by instructor and date range" },
    ],
    navigation: ["Member Classes", "Owner Studio", "Instructor Schedule", "My Bookings", "Schedule"],
    dataModels: analysis.entities.map((entity) => ({ name: entity.name, fields: entity.fields })),
    relationships: analysis.relationships.map((relationship) => ({
      from: relationship.from,
      to: relationship.to,
      type: relationship.type === "one-to-one" ? "one-to-many" : relationship.type,
      via: relationship.via,
    })),
    apiEndpoints: [
      { method: "POST", path: "/api/book", purpose: "Validate capacity, decrement remaining seats, and confirm a member booking" },
      { method: "POST", path: "/api/cancel", purpose: "Validate cancel timing, restore capacity, and cancel a booking" },
      { method: "POST", path: "/api/attendance", purpose: "Validate instructor permissions and mark present, absent, or late attendance" },
      { method: "POST", path: "/api/publish-slot", purpose: "Allow owners to publish a time slot only when class and capacity rules pass" },
      { method: "GET", path: "/api/schedule", purpose: "Filter schedule by instructor, role, published state, and date range" },
    ],
    features: [
      "Member class catalog",
      "Owner time slot publishing",
      "Capacity-aware booking",
      "Late-cancel protection",
      "Instructor attendance roster",
      "Date-filtered instructor schedule",
      "Persistent studio booking state",
    ],
    interactions: [
      { label: "bookSession", type: "create", target: "Booking", result: "Booking.create decrements TimeSlot.capacityRemaining and moves Booking draft -> confirmed" },
      { label: "cancelBooking", type: "delete", target: "Booking", result: "Booking.cancel restores TimeSlot.capacityRemaining if status is confirmed and startTime is in the future" },
      { label: "markAttendance", type: "transition", target: "Attendance", result: "Attendance.mark moves pending -> present, absent, or late and sets Booking.status = attended when present" },
      { label: "publishTimeSlot", type: "update", target: "TimeSlot", result: "TimeSlot.publish moves unpublished -> published when Owner has permission and capacity > 0" },
    ],
    forms: [
      { name: "Book studio class", fields: ["Member name", "Class", "Time slot"], action: "Books a class seat and decreases remaining capacity" },
      { name: "Mark attendance", fields: ["Booking", "Attendance status"], action: "Marks present, absent, or late for a confirmed booking" },
    ],
    seedData: [
      { label: "Flow State Yoga - Morning Vinyasa", value: "3 seats left", status: "published" },
      { label: "North Loop Pilates - Reformer Basics", value: "1 seat left", status: "confirmed" },
      { label: "Forge Boxing - Fundamentals", value: "0 seats left", status: "full" },
      { label: "Ember Barre - Lunch Express", value: "6 seats left", status: "unpublished" },
    ],
    domainAnalysis: analysis,
  };
}

function studioBookingDomain(): DomainAnalysis {
  return {
    entities: [
      { name: "Studio", fields: ["name", "address", "timezone", "ownerName", "createdAt", "updatedBy"] },
      { name: "Instructor", fields: ["studioId", "name", "specialty", "email", "isActive"] },
      { name: "Class", fields: ["studioId", "instructorId", "title", "level", "durationMinutes", "categoryTag"] },
      { name: "TimeSlot", fields: ["classId", "startTime", "capacityTotal", "capacityRemaining", "isPublished", "status", "version"] },
      { name: "Booking", fields: ["timeSlotId", "memberName", "memberEmail", "status", "bookedAt", "cancelledAt", "externalRefId"] },
      { name: "Attendance", fields: ["bookingId", "status", "markedByInstructorId", "markedAt", "auditLog"] },
      { name: "SecurityLog", fields: ["actorId", "action", "resource", "timestamp", "ipAddress", "outcome"] },
    ],
    relationships: [
      { from: "Studio", to: "Instructor", type: "one-to-many", via: "studioId" },
      { from: "Studio", to: "Class", type: "one-to-many", via: "studioId" },
      { from: "Instructor", to: "Class", type: "one-to-many", via: "instructorId" },
      { from: "Class", to: "TimeSlot", type: "one-to-many", via: "classId" },
      { from: "TimeSlot", to: "Booking", type: "one-to-many", via: "timeSlotId" },
      { from: "Booking", to: "Attendance", type: "one-to-one", via: "bookingId" },
    ],
    roles: [
      { name: "Owner", route: "/owner", permissions: ["manage studios", "manage classes", "publish time slots", "view all bookings", "view analytics"] },
      { name: "Instructor", route: "/instructor", permissions: ["view my schedule", "filter by date", "view roster", "mark attendance"] },
      { name: "Member", route: "/member", permissions: ["browse published classes", "book classes", "cancel future bookings", "view my bookings"] },
    ],
    actions: [
      { role: "Member", name: "bookSession", target: "Booking", api: "POST /api/book", result: "TimeSlot.capacityRemaining -= 1 and Booking.status = confirmed" },
      { role: "Member", name: "cancelBooking", target: "Booking", api: "POST /api/cancel", result: "TimeSlot.capacityRemaining += 1 and Booking.status = cancelled" },
      { role: "Instructor", name: "markAttendance", target: "Attendance", api: "POST /api/attendance", result: "Attendance.status changes and Booking.status = attended when present" },
      { role: "Owner", name: "publishTimeSlot", target: "TimeSlot", api: "POST /api/publish-slot", result: "TimeSlot.status = published and isPublished = true" },
    ],
    businessRules: [
      { rule: "Booking.create requires capacityRemaining > 0", error: "Class is full" },
      { rule: "Booking.create prevents a member from booking the same TimeSlot twice", error: "You already booked this class" },
      { rule: "Booking.create decrements TimeSlot.capacityRemaining by 1" },
      { rule: "Booking.cancel restores capacity only when status is confirmed and startTime > now", error: "Cannot cancel past classes" },
      { rule: "Attendance.mark requires Instructor role and Booking.status = confirmed", error: "Attendance can only be marked for confirmed bookings" },
      { rule: "All mutating actions must record a SecurityLog entry with the outcome and actor ID" },
      { rule: "TimeSlot.publish requires verification of Class ownership by the Studio" },
      { rule: "TimeSlot.publish requires Owner role, capacityTotal > 0, and classId", error: "Only owners can publish valid class time slots" },
    ],
    stateMachines: [
      {
        entity: "Booking",
        states: ["draft", "confirmed", "cancelled", "attended"],
        transitions: [
          { from: "draft", to: "confirmed", action: "bookSession" },
          { from: "confirmed", to: "cancelled", action: "cancelBooking" },
          { from: "confirmed", to: "attended", action: "markAttendance" },
        ],
      },
      {
        entity: "TimeSlot",
        states: ["unpublished", "published", "cancelled"],
        transitions: [
          { from: "unpublished", to: "published", action: "publishTimeSlot" },
          { from: "published", to: "cancelled", action: "cancelTimeSlot" },
        ],
      },
      {
        entity: "Attendance",
        states: ["pending", "present", "absent", "late"],
        transitions: [
          { from: "pending", to: "present", action: "markAttendance" },
          { from: "pending", to: "absent", action: "markAttendance" },
          { from: "pending", to: "late", action: "markAttendance" },
        ],
      },
    ],
    persistence: "localStorage",
    errorCases: ["Class is full", "Cannot cancel past classes", "You already booked this class", "Only owners can publish valid class time slots"],
    validationChecks: [
      "Can book a class and see capacity decrease",
      "Can cancel and see capacity restore",
      "Can mark attendance",
      "Can filter instructor schedules",
      "Data survives refresh",
      "There are three distinct role views",
      "All business rules are enforced",
      "Error messages use real booking language",
    ],
  };
}
