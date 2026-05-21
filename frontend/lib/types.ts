export type UUID = string;

export type User = {
  id: UUID;
  email: string;
  name: string;
  created_at: string;
};

export type Exercise = {
  id: UUID;
  name: string;
  muscle_group: string;
  description?: string | null;
  image_url?: string | null;
};

export type WorkoutExercise = {
  id: UUID;
  workout_id: UUID;
  exercise_id: UUID;
  sets: number;
  reps: number;
  weight?: string | number | null;
  rest_seconds: number;
  rest_limit_seconds: number;
  order_index: number;
};

export type Workout = {
  id: UUID;
  user_id: UUID;
  date: string;
  notes?: string | null;
  created_at: string;
  workout_exercises: WorkoutExercise[];
};

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
};

export type CreateExerciseInput = {
  name: string;
  muscle_group: string;
  description?: string;
};

export type CreateWorkoutExerciseInput = {
  exercise_id: UUID;
  sets: number;
  reps: number;
  weight?: string | null;
  rest_seconds?: number;
  rest_limit_seconds?: number;
  order_index?: number;
};

export type CreateWorkoutInput = {
  user_id: UUID;
  workout_date: string;
  notes?: string;
  exercises: CreateWorkoutExerciseInput[];
};
