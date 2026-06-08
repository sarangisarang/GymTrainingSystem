"""
Seed script — creates 20 professional exercises via the FastAPI backend.
Run from the backend/ directory:
    python seed_exercises.py
"""

import urllib.request
import urllib.error
import json

API = "http://localhost:8000"

# ── auth ──────────────────────────────────────────────────────────────────────

def login(email: str, password: str) -> str:
    data = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(
        f"{API}/auth/login",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["access_token"]


def register_and_login(email: str, password: str, name: str) -> str:
    data = json.dumps({"email": email, "password": password, "name": name}).encode()
    req = urllib.request.Request(
        f"{API}/auth/register",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req):
            pass
    except urllib.error.HTTPError:
        pass
    return login(email, password)


# ── helpers ───────────────────────────────────────────────────────────────────

def create_exercise(token: str, name: str, muscle_group: str, description: str) -> str:
    data = json.dumps({
        "name": name,
        "muscle_group": muscle_group,
        "description": description,
    }).encode()
    req = urllib.request.Request(
        f"{API}/exercises/",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["id"]


def upload_image(token: str, exercise_id: str, image_bytes: bytes, filename: str) -> None:
    boundary = "----FormBoundary7MA4YWxkTrZu0gW"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode() + image_bytes + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"{API}/exercises/{exercise_id}/image",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req):
            pass
    except urllib.error.HTTPError as e:
        print(f"    ⚠ image upload failed ({e.code}): {e.read().decode()[:200]}")


def fetch_image(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.read()
    except Exception as e:
        print(f"    ⚠ image fetch failed: {e}")
        return None


# ── exercise catalogue ────────────────────────────────────────────────────────
# Each entry: (name, muscle_group, description, image_url_from_unsplash_or_wikimedia)

EXERCISES = [
    (
        "Barbell Back Squat",
        "Legs",
        (
            "The king of lower-body exercises. Place the barbell across your upper traps, "
            "feet shoulder-width apart and toes slightly turned out. Brace your core, push "
            "your hips back and bend your knees to lower until thighs are at least parallel "
            "to the floor, then drive through your heels to stand.\n\n"
            "Primary muscles: Quadriceps, Glutes\n"
            "Secondary muscles: Hamstrings, Adductors, Erector Spinae, Core\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 4-5 × 3-5 reps @ 80-90 % 1RM\n"
            "  Hypertrophy: 3-4 × 8-12 reps @ 65-75 % 1RM\n"
            "  Endurance: 3 × 15-20 reps @ 50-60 % 1RM\n\n"
            "Tips: Keep chest up, knees tracking toes, heels flat on floor."
        ),
        "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Barbell Bench Press",
        "Chest",
        (
            "The premier upper-body pressing movement. Lie flat on the bench, grip the bar "
            "slightly wider than shoulder-width, unrack and lower to mid-chest with elbows "
            "at ~75° from the torso, then press explosively back to full extension.\n\n"
            "Primary muscles: Pectoralis Major\n"
            "Secondary muscles: Anterior Deltoid, Triceps\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 5 × 3-5 reps @ 80-90 % 1RM\n"
            "  Hypertrophy: 4 × 8-12 reps @ 65-75 % 1RM\n"
            "  Endurance: 3 × 15-20 reps @ 50 % 1RM\n\n"
            "Tips: Keep shoulder blades retracted and depressed; feet flat on floor."
        ),
        "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Deadlift",
        "Back",
        (
            "The ultimate posterior-chain developer. Stand with feet hip-width, bar over "
            "mid-foot. Hinge at the hips, grip just outside your legs, engage lats, and "
            "drive through the floor while keeping the bar close to your body. Lock out "
            "hips and shoulders simultaneously at the top.\n\n"
            "Primary muscles: Erector Spinae, Glutes, Hamstrings\n"
            "Secondary muscles: Trapezius, Lats, Quadriceps, Forearms\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 4-5 × 1-5 reps @ 85-95 % 1RM\n"
            "  Hypertrophy: 3-4 × 6-10 reps @ 70-80 % 1RM\n"
            "  Endurance: 3 × 12-15 reps @ 55-65 % 1RM\n\n"
            "Tips: Neutral spine is mandatory. Never round the lower back under load."
        ),
        "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Romanian Deadlift",
        "Legs",
        (
            "A hip-hinge movement that targets the hamstrings through a full stretch. Hold "
            "a barbell at hip level, push your hips back while keeping a slight knee bend "
            "and a neutral spine. Lower until you feel a deep hamstring stretch (usually "
            "just below the knee), then drive hips forward to return.\n\n"
            "Primary muscles: Hamstrings, Glutes\n"
            "Secondary muscles: Erector Spinae, Adductors\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 4 × 5-8 reps\n"
            "  Hypertrophy: 3-4 × 8-12 reps\n"
            "  Endurance: 3 × 15 reps\n\n"
            "Tips: Bar stays close to legs; control the eccentric phase for max stretch."
        ),
        "https://images.unsplash.com/photo-1590556409324-aa1d726e5c3c?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Lat Pulldown",
        "Back",
        (
            "A vertical-pull machine exercise that builds width in the lats. Sit with thighs "
            "under the pad, grip the bar wider than shoulder-width, lean back slightly and "
            "pull the bar to the upper chest by driving elbows down and back. Squeeze at the "
            "bottom and control the return.\n\n"
            "Primary muscles: Latissimus Dorsi\n"
            "Secondary muscles: Biceps, Rear Deltoid, Rhomboids, Teres Major\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 4 × 6-8 reps (close to BW)\n"
            "  Hypertrophy: 3-4 × 10-15 reps\n"
            "  Endurance: 3 × 15-20 reps\n\n"
            "Tips: Initiate with the elbows, not the hands. Full range of motion."
        ),
        "https://images.unsplash.com/photo-1576678927484-cc907957088c?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Seated Cable Row",
        "Back",
        (
            "A horizontal pulling movement that builds back thickness. Sit upright on the "
            "cable row machine, feet on the platform, knees slightly bent. Pull the handle "
            "to your lower abdomen by retracting the scapulae and driving elbows back, then "
            "slowly extend arms back to full stretch.\n\n"
            "Primary muscles: Rhomboids, Middle Trapezius, Latissimus Dorsi\n"
            "Secondary muscles: Biceps, Rear Deltoid, Erector Spinae\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 4 × 6-8 reps\n"
            "  Hypertrophy: 3-4 × 10-15 reps\n"
            "  Endurance: 3 × 15-20 reps\n\n"
            "Tips: Don't lean back excessively; torso should stay nearly vertical."
        ),
        "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Pull-Up",
        "Back",
        (
            "A fundamental bodyweight exercise for upper-body pulling strength. Hang from "
            "a bar with an overhand grip slightly wider than shoulder-width. Depress and "
            "retract your scapulae, then pull until your chin clears the bar. Lower "
            "with control to a full hang.\n\n"
            "Primary muscles: Latissimus Dorsi\n"
            "Secondary muscles: Biceps, Rhomboids, Teres Major, Core\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 5 × 3-6 reps (add weight)\n"
            "  Hypertrophy: 3-4 × 8-12 reps\n"
            "  Endurance: 3 × max reps (bodyweight)\n\n"
            "Tips: Dead hang at the bottom each rep. Avoid kipping unless training for it."
        ),
        "https://images.unsplash.com/photo-1599058917212-d750089bc07e?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Incline Dumbbell Press",
        "Chest",
        (
            "Targets the upper portion of the pectoralis major. Set bench to 30-45°, hold "
            "dumbbells at shoulder level with palms facing forward, press upward and slightly "
            "inward until arms are fully extended, then lower under control to the starting "
            "position.\n\n"
            "Primary muscles: Pectoralis Major (clavicular head), Anterior Deltoid\n"
            "Secondary muscles: Triceps\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 4 × 6-8 reps\n"
            "  Hypertrophy: 3-4 × 10-12 reps\n"
            "  Endurance: 3 × 15 reps\n\n"
            "Tips: Don't lock elbows out fully at the top; maintain constant tension."
        ),
        "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Dumbbell Chest Fly",
        "Chest",
        (
            "An isolation exercise that stretches and contracts the chest through a wide arc. "
            "Lie flat, hold dumbbells directly above your chest with a slight elbow bend. "
            "Open your arms in a controlled arc until you feel a deep chest stretch, then "
            "squeeze your pecs to bring the dumbbells back together.\n\n"
            "Primary muscles: Pectoralis Major\n"
            "Secondary muscles: Anterior Deltoid, Biceps (stabiliser)\n\n"
            "Recommended sets/reps:\n"
            "  Hypertrophy: 3-4 × 12-15 reps\n"
            "  Endurance / pump: 3 × 15-20 reps\n\n"
            "Tips: Keep a constant elbow angle; the movement should come from the shoulder joint."
        ),
        "https://images.unsplash.com/photo-1571019613576-2b22c76fd955?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Decline Push-Up",
        "Chest",
        (
            "A bodyweight variant that shifts emphasis to the upper chest and shoulders. "
            "Place feet on a raised surface (bench or box) and hands on the floor, shoulder-"
            "width apart. Lower your chest to the floor, then push back up explosively.\n\n"
            "Primary muscles: Upper Pectoralis Major, Anterior Deltoid\n"
            "Secondary muscles: Triceps, Core\n\n"
            "Recommended sets/reps:\n"
            "  Hypertrophy: 3-4 × 10-20 reps\n"
            "  Endurance: 3 × max reps\n\n"
            "Tips: Keep body in a straight line from head to feet. No hip sagging."
        ),
        "https://images.unsplash.com/photo-1598971639058-fab3c3109a19?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Seated Dumbbell Shoulder Press",
        "Shoulders",
        (
            "A compound overhead press that builds shoulder size and strength. Sit upright on "
            "a bench with back support, hold dumbbells at ear height with palms facing forward "
            "and elbows at 90°. Press overhead until arms are fully extended, then lower "
            "with control.\n\n"
            "Primary muscles: Anterior and Lateral Deltoid\n"
            "Secondary muscles: Triceps, Upper Trapezius, Serratus Anterior\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 4 × 5-8 reps\n"
            "  Hypertrophy: 3-4 × 10-12 reps\n"
            "  Endurance: 3 × 15 reps\n\n"
            "Tips: Avoid excessive arch in the lower back. Press in a slight forward angle."
        ),
        "https://images.unsplash.com/photo-1576678927484-cc907957088c?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Lateral Raise",
        "Shoulders",
        (
            "The best isolation exercise for developing wide, capped shoulders. Stand with "
            "a slight forward lean, dumbbells at sides, palms facing inward. Raise both arms "
            "out to the side until they reach shoulder height, thumbs slightly lower than "
            "pinkies. Lower slowly and repeat.\n\n"
            "Primary muscles: Lateral Deltoid\n"
            "Secondary muscles: Anterior Deltoid, Supraspinatus (rotator cuff)\n\n"
            "Recommended sets/reps:\n"
            "  Hypertrophy: 3-5 × 12-20 reps (lighter weight, strict form)\n"
            "  Endurance / pump: 3-4 × 20-25 reps\n\n"
            "Tips: Use lighter weight than you think; momentum cheats the lateral head."
        ),
        "https://images.unsplash.com/photo-1616279969965-df4b2630a8af?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Dumbbell Bicep Curl",
        "Arms",
        (
            "The classic biceps exercise for building arm peak and size. Stand with dumbbells "
            "at your sides, palms facing forward. Curl both dumbbells up toward your shoulders "
            "by flexing the elbows, keeping upper arms stationary. Squeeze at the top and "
            "lower slowly.\n\n"
            "Primary muscles: Biceps Brachii\n"
            "Secondary muscles: Brachialis, Brachioradialis\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 4 × 6-8 reps\n"
            "  Hypertrophy: 3-4 × 10-15 reps\n"
            "  Endurance: 3 × 15-20 reps\n\n"
            "Tips: Supinate the wrist at the top of each rep for peak bicep contraction."
        ),
        "https://images.unsplash.com/photo-1583454155184-870a1f63aebc?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Hammer Curl",
        "Arms",
        (
            "A bicep curl variation performed with a neutral (hammer) grip that emphasises "
            "the brachialis and brachioradialis for overall arm thickness. Hold dumbbells "
            "with palms facing each other throughout the entire movement, curl up and lower "
            "with control.\n\n"
            "Primary muscles: Brachialis, Brachioradialis\n"
            "Secondary muscles: Biceps Brachii\n\n"
            "Recommended sets/reps:\n"
            "  Hypertrophy: 3-4 × 10-15 reps\n"
            "  Endurance: 3 × 15-20 reps\n\n"
            "Tips: Neutral grip is maintained throughout — no supination at the top."
        ),
        "https://images.unsplash.com/photo-1530822847156-5df684ec5933?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Tricep Rope Pushdown",
        "Arms",
        (
            "A cable isolation exercise that separates and develops the three heads of the "
            "triceps. Attach a rope to a high cable pulley, grip both ends with an overhand "
            "grip, elbows tucked at sides. Push down and flare the rope handles outward at "
            "the bottom for a complete contraction, then return with control.\n\n"
            "Primary muscles: Triceps Brachii (all three heads)\n"
            "Secondary muscles: Anconeus\n\n"
            "Recommended sets/reps:\n"
            "  Hypertrophy: 3-4 × 12-15 reps\n"
            "  Endurance / pump: 3-4 × 15-20 reps\n\n"
            "Tips: Keep elbows glued to your sides; do not lean forward excessively."
        ),
        "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Bench Dip",
        "Arms",
        (
            "A bodyweight exercise that targets the triceps using a flat bench. Place hands "
            "on the edge of the bench behind you, feet on the floor (or elevated for more "
            "resistance). Lower your body by bending your elbows to roughly 90°, then press "
            "back up to full elbow extension.\n\n"
            "Primary muscles: Triceps Brachii\n"
            "Secondary muscles: Anterior Deltoid, Pectoralis Major (lower)\n\n"
            "Recommended sets/reps:\n"
            "  Hypertrophy: 3 × 12-20 reps (add weight plate on lap for progression)\n"
            "  Endurance: 3 × max reps\n\n"
            "Tips: Keep hips close to the bench; don't let shoulders roll forward."
        ),
        "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Plank",
        "Core",
        (
            "An isometric core stability exercise that builds endurance in the entire "
            "anterior and posterior chain. Place forearms on the floor, elbows under "
            "shoulders, body in a straight line from head to heels. Brace the abs, glutes "
            "and quads and hold the position.\n\n"
            "Primary muscles: Rectus Abdominis, Transverse Abdominis\n"
            "Secondary muscles: Erector Spinae, Glutes, Shoulders\n\n"
            "Recommended duration:\n"
            "  Beginner: 3 × 20-30 s\n"
            "  Intermediate: 3 × 45-60 s\n"
            "  Advanced: 3 × 60-120 s or add load (weight plate on back)\n\n"
            "Tips: Don't let the hips sag or pike; keep breathing normally."
        ),
        "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Leg Press",
        "Legs",
        (
            "A machine compound exercise for building quad and glute mass with less spinal "
            "loading than the squat. Sit in the leg press machine, place feet shoulder-width "
            "apart in the middle of the sled. Lower the sled until knees reach ~90°, then "
            "press through your heels to full extension.\n\n"
            "Primary muscles: Quadriceps\n"
            "Secondary muscles: Glutes, Hamstrings, Adductors\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 4 × 6-8 reps (heavy)\n"
            "  Hypertrophy: 3-4 × 10-15 reps\n"
            "  Endurance / pump: 3 × 20-30 reps (lighter)\n\n"
            "Tips: Never lock out the knees completely; keep lower back pressed into the seat."
        ),
        "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Leg Extension",
        "Legs",
        (
            "An isolation machine exercise that directly targets the quadriceps. Sit in the "
            "leg extension machine with your back flush against the pad and shins behind the "
            "roller. Extend your legs fully, holding the peak contraction briefly, then lower "
            "slowly and repeat.\n\n"
            "Primary muscles: Quadriceps (all four heads)\n\n"
            "Recommended sets/reps:\n"
            "  Hypertrophy: 3-4 × 12-15 reps\n"
            "  Endurance / pump: 3-4 × 15-20 reps\n\n"
            "Tips: Pause at the top for peak quad contraction. Use strict form — no momentum."
        ),
        "https://images.unsplash.com/photo-1590556409324-aa1d726e5c3c?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Seated Leg Curl",
        "Legs",
        (
            "A machine isolation exercise for the hamstrings that emphasises the short head "
            "of the biceps femoris. Adjust the seat so the knee joint aligns with the machine "
            "pivot. Place lower legs on top of the roller and curl it towards your glutes "
            "through a full range of motion, then control the return.\n\n"
            "Primary muscles: Hamstrings (Biceps Femoris, Semitendinosus, Semimembranosus)\n"
            "Secondary muscles: Gastrocnemius (stabiliser)\n\n"
            "Recommended sets/reps:\n"
            "  Hypertrophy: 3-4 × 10-15 reps\n"
            "  Endurance: 3-4 × 15-20 reps\n\n"
            "Tips: Full range of motion; avoid partial reps that keep the hamstrings shortened."
        ),
        "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=70",
    ),
    (
        "Standing Calf Raise",
        "Legs",
        (
            "The primary exercise for developing the gastrocnemius and soleus. Stand on the "
            "edge of a step or calf-raise platform with the balls of your feet on the edge. "
            "Lower your heels as far below platform level as possible (deep stretch), then "
            "rise up on your toes to maximum height and pause.\n\n"
            "Primary muscles: Gastrocnemius, Soleus\n"
            "Secondary muscles: Tibialis Posterior, Peroneals\n\n"
            "Recommended sets/reps:\n"
            "  Strength: 4 × 6-8 reps (heavy, slow)\n"
            "  Hypertrophy: 3-4 × 12-20 reps\n"
            "  Endurance: 3 × 20-30 reps (bodyweight or light load)\n\n"
            "Tips: Full range of motion is critical — calves respond best to deep stretch + peak contraction."
        ),
        "https://images.unsplash.com/photo-1605296867304-46d5465a13f1?auto=format&fit=crop&w=900&q=70",
    ),
]


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    email = "seed@gym.com"
    password = "SeedPass123!"

    print("🔑  Logging in …")
    token = login(email, password)
    print("✅  Token acquired")

    for i, (name, muscle_group, description, image_url) in enumerate(EXERCISES, 1):
        print(f"\n[{i}/{len(EXERCISES)}] {name} ({muscle_group})")

        # create exercise
        try:
            ex_id = create_exercise(token, name, muscle_group, description)
            print(f"    ✅  Created  id={ex_id}")
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if "already exists" in body.lower() or e.code == 409:
                print("    ⏭   Already exists — skipping")
            else:
                print(f"    ❌  Create failed ({e.code}): {body[:200]}")
            continue

        # fetch + upload image
        print("    🌐  Fetching image …")
        img_bytes = fetch_image(image_url)
        if img_bytes:
            upload_image(token, ex_id, img_bytes, f"{name.lower().replace(' ', '_')}.jpg")
            print(f"    🖼   Image uploaded ({len(img_bytes)//1024} KB)")
        else:
            print("    ⚠   No image — exercise saved without photo")

    print("\n\n🎉  Done! All exercises seeded.")


if __name__ == "__main__":
    main()
