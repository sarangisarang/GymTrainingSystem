export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

type ApiOptions = RequestInit & { auth?: boolean };

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path}`;

  const headers = new Headers(options.headers || {});
  const bodyIsForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!headers.has("Content-Type") && options.body && !bodyIsForm) {
    headers.set("Content-Type", "application/json");
  }

  if (options.auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const json = JSON.parse(text);
      detail = json.detail || json.message || text;
    } catch {}
    throw new Error(detail || `Request failed: ${res.status}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null as T;
  return (await res.json()) as T;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type UserRead = {
  id: string;
  email: string;
  name?: string | null;
  created_at?: string;
};

export type ExerciseRead = {
  id: string;
  name: string;
  muscle_group: string;
  description?: string | null;
  image_url?: string | null;
};

export type WorkoutExerciseRead = {
  id: string;
  workout_id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  weight?: number | string | null;
  rest_seconds: number;
  rest_limit_seconds: number;
  order_index: number;
};

export type WorkoutRead = {
  id: string;
  user_id: string;
  date: string;
  notes?: string | null;
  created_at?: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | string;
  duration_seconds?: number | null;
  completed_at?: string | null;
  workout_exercises: WorkoutExerciseRead[];
};

export type WorkoutAnalysisRead = {
  goal: string;
  body_weight_kg?: number | string | null;
  total_exercises: number;
  total_sets: number;
  total_reps: number;
  total_volume_kg: number | string;
  average_weight_per_rep_kg: number | string;
  recommended_rest_seconds: number;
  concentric_seconds: number;
  pause_seconds: number;
  eccentric_seconds: number;
  estimated_active_seconds: number;
  estimated_rest_seconds: number;
  estimated_transition_seconds: number;
  estimated_total_seconds: number;
  met_value?: number | string | null;
  estimated_calories_kcal?: number | string | null;
  fat_energy_share?: number | string | null;
  estimated_fat_burned_grams?: number | string | null;
};

export type StrengthMaxRead = {
  id: string;
  user_id: string;
  exercise_id: string;
  one_rep_max: number | string;
  training_max: number | string;
  increment_step: number | string;
  load_mode: "TOTAL" | "PER_HAND" | string;
  created_at: string;
  updated_at: string;
};

export type ProgramItemRead = {
  id: string;
  program_id: string;
  exercise_id: string;
  week_number: number;
  day_number: number;
  sets: number;
  reps: number;
  percentage: number | string;
  calculated_weight: number | string;
  weight_per_hand?: number | string | null;
  total_weight?: number | string | null;
  rest_seconds: number;
  concentric_seconds: number;
  pause_seconds: number;
  eccentric_seconds: number;
  estimated_set_duration_seconds: number;
  estimated_total_duration_seconds: number;
  notes?: string | null;
};

export type ProgramRead = {
  id: string;
  user_id: string;
  goal: string;
  training_days_per_week: number;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  items: ProgramItemRead[];
};

export type ExerciseHistoryEntry = {
  date: string;
  sets: number;
  reps: number;
  weight?: string | null;
  volume_kg: string;
};

export type PredictionReason = "steady_progress" | "plateau" | "regression";

export type ExercisePrediction = {
  sessions: number;
  current_weight: number;
  target_weight: number;
  slope_kg_per_week: number;
  weeks_to_target: number | null;
  predicted_date: string | null; // ISO "YYYY-MM-DD"
  reason: PredictionReason;
  already_achieved: boolean;
};

export type UserStats = {
  total_workouts: number;
  current_streak: number;
  best_streak: number;
  workouts_this_week: number;
  total_volume_kg: string;
  favorite_muscle_group?: string | null;
};

export type WeeklyVolumeEntry = {
  week: string;
  volume_kg: number;
};

export type TopExerciseEntry = {
  exercise_id: string;
  name: string;
  volume_kg: number;
};

export type DashboardAnalytics = {
  completed_count: number;
  weekly_volume_kg: number;
  avg_duration_min: number | null;
  top_exercises: TopExerciseEntry[];
  weekly_trend: WeeklyVolumeEntry[];
};

export type CreateWorkoutPayload = {
  workout_date: string;
  notes?: string | null;
  exercises: Array<{
    exercise_id: string;
    sets: number;
    reps: number;
    weight?: string | number | null;
    rest_seconds?: number;
    rest_limit_seconds?: number;
    order_index?: number;
  }>;
};

export type UpdateWorkoutPayload = {
  workout_date: string;
  notes?: string | null;
  exercises: Array<{
    exercise_id: string;
    sets: number;
    reps: number;
  }>;
};

// ── Auth ──────────────────────────────────────────────────────────────────

export async function login(payload: { email: string; password: string }) {
  return apiFetch<{ access_token: string; token_type?: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function register(payload: { name: string; email: string; password: string }) {
  return apiFetch<UserRead>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function me() {
  return apiFetch<UserRead>("/auth/me", { auth: true });
}

// ── Users ─────────────────────────────────────────────────────────────────

export async function getUsers() {
  return apiFetch<UserRead[]>("/users/", { auth: true });
}

export async function createUser(data: { email: string; password: string; name?: string | null }) {
  return apiFetch<UserRead>("/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProfile(data: { name?: string | null }) {
  return apiFetch<UserRead>("/users/me", {
    method: "PUT",
    auth: true,
    body: JSON.stringify(data),
  });
}

export async function changePassword(data: { old_password: string; new_password: string }) {
  return apiFetch<{ message: string }>("/users/me/change-password", {
    method: "POST",
    auth: true,
    body: JSON.stringify(data),
  });
}

// ── Exercises ─────────────────────────────────────────────────────────────

export async function getExercises(opts?: { muscle_group?: string; search?: string }) {
  const params = new URLSearchParams();
  if (opts?.muscle_group) params.set("muscle_group", opts.muscle_group);
  if (opts?.search) params.set("search", opts.search);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<ExerciseRead[]>(`/exercises/${suffix}`, { auth: true });
}

export async function getExercise(id: string) {
  return apiFetch<ExerciseRead>(`/exercises/${id}`, { auth: true });
}

export async function createExercise(payload: { name: string; muscle_group: string; description?: string }) {
  return apiFetch<ExerciseRead>("/exercises/", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
  });
}

export async function uploadExerciseImage(exerciseId: string, file: File) {
  const base = getApiBase();
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${base}/exercises/${exerciseId}/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Upload failed: ${res.status}`);
  }
  return (await res.json()) as ExerciseRead;
}

// ── Workouts ──────────────────────────────────────────────────────────────

export async function getWorkouts(opts?: {
  skip?: number;
  limit?: number;
  start_date?: string;
  end_date?: string;
}) {
  const params = new URLSearchParams();
  if (opts?.skip != null) params.set("skip", String(opts.skip));
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.start_date) params.set("start_date", opts.start_date);
  if (opts?.end_date) params.set("end_date", opts.end_date);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<WorkoutRead[]>(`/workouts/${suffix}`, { auth: true });
}

export async function getWorkout(id: string) {
  return apiFetch<WorkoutRead>(`/workouts/${id}`, { auth: true });
}

export async function getWorkoutAnalysis(id: string, bodyWeightKg?: number | null) {
  const params = new URLSearchParams();
  if (bodyWeightKg != null && Number.isFinite(bodyWeightKg) && bodyWeightKg > 0) {
    params.set("body_weight_kg", String(bodyWeightKg));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<WorkoutAnalysisRead>(`/workouts/${id}/analysis${suffix}`, { auth: true });
}

export async function createWorkout(payload: CreateWorkoutPayload) {
  return apiFetch<WorkoutRead>("/workouts/", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
  });
}

export async function updateWorkout(id: string, payload: UpdateWorkoutPayload) {
  return apiFetch<WorkoutRead>(`/workouts/${id}`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify(payload),
  });
}

export async function deleteWorkout(id: string) {
  return apiFetch<{ message?: string }>(`/workouts/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function updateWorkoutStatus(
  id: string,
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  duration_seconds?: number | null,
) {
  return apiFetch<WorkoutRead>(`/workouts/${id}/status`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify({ status, duration_seconds: duration_seconds ?? null }),
  });
}

export async function getUserStats() {
  return apiFetch<UserStats>("/workouts/stats/summary", { auth: true });
}

export async function getDashboardAnalytics() {
  return apiFetch<DashboardAnalytics>("/workouts/analytics/dashboard", { auth: true });
}

export async function getExerciseHistory(exerciseId: string) {
  return apiFetch<ExerciseHistoryEntry[]>(`/workouts/history/exercise/${exerciseId}`, { auth: true });
}

export async function getExercisePrediction(exerciseId: string, targetWeightKg: number) {
  const qs = new URLSearchParams({ target_weight: String(targetWeightKg) });
  return apiFetch<ExercisePrediction>(
    `/workouts/predict/${exerciseId}?${qs.toString()}`,
    { auth: true },
  );
}

// ── Programs ──────────────────────────────────────────────────────────────

export async function saveStrengthMax(payload: {
  exercise_id: string;
  one_rep_max: number;
  increment_step?: number;
  load_mode?: "TOTAL" | "PER_HAND";
}) {
  return apiFetch<StrengthMaxRead>("/programs/maxes", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
  });
}

export async function getStrengthMaxes() {
  return apiFetch<StrengthMaxRead[]>("/programs/maxes", { auth: true });
}

export async function generateProgram(payload: {
  goal: "strength" | "hypertrophy" | "endurance";
  start_date: string;
  training_days_per_week: number;
  exercise_ids?: string[];
}) {
  return apiFetch<ProgramRead>("/programs/generate", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
  });
}

export async function getMyPrograms() {
  return apiFetch<ProgramRead[]>("/programs/mine", { auth: true });
}

export async function generateNextCycle(
  programId: string,
  payload: {
    start_date: string;
    goal?: "strength" | "hypertrophy" | "endurance";
    training_days_per_week: number;
    adjustments: Array<{ exercise_id: string; result: "SUCCESS" | "REPEAT" | "FAIL" }>;
  }
) {
  return apiFetch<ProgramRead>(`/programs/${programId}/next-cycle`, {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
  });
}
