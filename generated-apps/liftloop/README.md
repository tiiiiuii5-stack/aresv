# LiftLoop

Build a fitness tracker with workouts, habits, check-ins, streaks, and coach review.

This is an isolated fitness application. It does not depend on a shared app shell.

## Runtime behavior
- Component: TrainingTracker
- State engine: lib/training-engine.ts
- Primary API: /api/checkins
- Interaction: log workout

## Routes
- /: Daily workout and habit targets
- /workouts: Exercise log and plan builder
- /progress: Measurements and streaks
- /coach: Feedback and weekly review

## Schema
- Workout: title, sets, duration, intensity, completedAt
- Habit: name, streak, target, status
- CheckIn: workoutId, habitId, effort, notes, createdAt

## Relationships
- Workout one-to-many CheckIn via workoutId
- Habit one-to-many CheckIn via habitId

## Functional interactions
- Log workout: Adds workout check-in and updates streak
- Complete habit: Moves Planned -> Complete and increases streak
- Remove check-in: Removes mistaken entry
