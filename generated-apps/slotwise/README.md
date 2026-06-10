# SlotWise

Build a booking platform with staff calendars, availability slots, customer bookings, and admin approvals.

This is an isolated booking application. It does not depend on a shared app shell.

## Runtime behavior
- Component: AvailabilityCalendar
- State engine: lib/availability-engine.ts
- Primary API: /api/bookings
- Interaction: book slot

## Routes
- /: Weekly availability and booking load
- /booking: Public request flow
- /availability: Admin slot rules
- /admin: Review requests and confirmations

## Schema
- Slot: startsAt, endsAt, capacity, status
- Booking: slotId, customerName, email, status, notes
- StaffMember: name, role, timezone, active

## Relationships
- StaffMember one-to-many Slot via staffMemberId
- Slot one-to-many Booking via slotId

## Functional interactions
- Request booking: Adds booking request to admin queue
- Confirm booking: Moves Requested -> Confirmed -> Completed
- Cancel booking: Frees slot capacity
