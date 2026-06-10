CREATE TABLE IF NOT EXISTS "studios" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "studios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "instructors" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bio" TEXT NOT NULL,
  "specialty" TEXT NOT NULL,
  "studioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "instructors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "classes" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "instructorId" TEXT NOT NULL,
  "studioId" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "time_slots" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "capacityRemaining" INTEGER NOT NULL,
  "totalCapacity" INTEGER NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" TEXT NOT NULL,
  "timeSlotId" TEXT NOT NULL,
  "memberName" TEXT NOT NULL,
  "memberEmail" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),

  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "attendance" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "markedBy" TEXT NOT NULL,

  CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "studios_ownerId_idx" ON "studios"("ownerId");
CREATE INDEX IF NOT EXISTS "instructors_studioId_idx" ON "instructors"("studioId");
CREATE INDEX IF NOT EXISTS "classes_instructorId_idx" ON "classes"("instructorId");
CREATE INDEX IF NOT EXISTS "classes_studioId_idx" ON "classes"("studioId");
CREATE INDEX IF NOT EXISTS "time_slots_classId_idx" ON "time_slots"("classId");
CREATE INDEX IF NOT EXISTS "time_slots_startTime_idx" ON "time_slots"("startTime");
CREATE INDEX IF NOT EXISTS "time_slots_isPublished_idx" ON "time_slots"("isPublished");
CREATE INDEX IF NOT EXISTS "bookings_timeSlotId_idx" ON "bookings"("timeSlotId");
CREATE INDEX IF NOT EXISTS "bookings_memberEmail_idx" ON "bookings"("memberEmail");
CREATE INDEX IF NOT EXISTS "bookings_status_idx" ON "bookings"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_bookingId_key" ON "attendance"("bookingId");
CREATE INDEX IF NOT EXISTS "attendance_status_idx" ON "attendance"("status");
CREATE INDEX IF NOT EXISTS "attendance_markedBy_idx" ON "attendance"("markedBy");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructors_studioId_fkey') THEN
    ALTER TABLE "instructors" ADD CONSTRAINT "instructors_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_instructorId_fkey') THEN
    ALTER TABLE "classes" ADD CONSTRAINT "classes_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_studioId_fkey') THEN
    ALTER TABLE "classes" ADD CONSTRAINT "classes_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_slots_classId_fkey') THEN
    ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_timeSlotId_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "time_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_bookingId_fkey') THEN
    ALTER TABLE "attendance" ADD CONSTRAINT "attendance_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
