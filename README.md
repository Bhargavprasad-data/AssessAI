# AI-Based Adaptive Online Assessment and Smart Proctoring System

An enterprise-grade, full-stack web application combining AI question generation from uploaded course materials, a real-time difficulty-adaptive assessment engine, smart client-side proctoring telemetry, and database-authoritative ranking.

---

## 1. System Overview & Core Capabilities

The platform operates under three strict role boundaries (**Admin**, **Teacher**, **Student**):

### 🧑‍💼 Administrator
- **Role Administration**: Manage platform users with role filters and active/banned status.
- **Global Platform Bans**: Enforce platform-wide bans that **immediately force-terminate** any active (`in_progress`) or `disconnected` attempts across all assessments with status `TERMINATED` and reason `banned`.
- **Admin Provisioning**: Administrative accounts can only be created by an authenticated administrator.
- **Cryptographic Audit Log Trail**: Filterable and immutable ledger recording administrative actions, bans, assessment lifecycle milestones, and question pool mutations.

### 👩‍🏫 Teacher
- **AI Question Generation**: Upload course material (text-based PDF up to 20MB) $\rightarrow$ AI pipeline extracts text chunks and generates MCQs classified into **Easy**, **Medium**, and **Hard**, each grounded with a `source_chunk_ref`.
- **Pipeline Reliability**: Multi-provider failover chain (Mock, Anthropic Claude, OpenAI, Ollama) with circuit-breaker cooldown, token-based Jaccard semantic duplicate detection, and a 3-round regeneration shortfall cap. Questions are never auto-published without teacher review.
- **Assessment Builder**: Configure examination durations, optional per-question time limits, fast-response thresholds, accessibility toggle (`enable_speed_adaptive`), promotion/demotion thresholds, and proctoring violation limits.
- **Pool Sufficiency Validation**: Interactive modal prevents publishing if the eligible question count is less than `max_question_count`, with explicit override capability and non-blocking difficulty advisories.
- **Real-Time Live Analytics**: Real-time DB-backed leaderboard via WebSocket (with a 5s polling fallback), live incoming proctoring violation feed with epistemic guardrails, score distribution histogram, accuracy by difficulty, and one-click CSV export.
- **Assessment-Specific Bans**: Issue or revoke assessment-specific bans preventing targeted students from starting attempts.

### 👨‍🎓 Student
- **Proctoring Consent**: Epistemic integrity onboarding detailing event monitoring, continuous background timers, and violation thresholds.
- **Adaptive Examination Session**: Served strictly one question at a time. Difficulty dynamically scales using the Section 6.1 performance matrix:
  - `CORRECT + FAST` $\rightarrow$ Promotes difficulty (Easy $\rightarrow$ Medium $\rightarrow$ Hard).
  - `CORRECT + SLOW` or `INCORRECT` $\rightarrow$ Demotes difficulty.
  - Accessibility mode: When `enable_speed_adaptive = false`, correct answers always promote regardless of response time.
- **Smart Proctoring Telemetry**: Detects tab switches (`visibilitychange`), window blur, clipboard operations (`copy`, `cut`, `paste`), and best-effort screenshot attempts (`PrintScreen`) with a 2-second client-side debounce. Signals are treated strictly as **environment indicators**, not definitive proof of cheating.
- **Results Breakdown**: Instant review showing weighted scores, peak difficulty reached, response accuracy, and full question-by-question breakdown.

---

## 2. Architectural Invariants & Guarantees

1. **Atomic 4-Step Question Serving Invariant**:
   Whenever a question is selected for an attempt:
   1. Insert record into `attempt_question_servings` with unique `(attempt_id, question_id)` and `(attempt_id, sequence_number)`.
   2. Update `attempts.current_question_id`.
   3. Update `attempts.current_question_started_at`.
   4. Commit all changes atomically.
   Candidate question selection excludes based on `attempt_question_servings`, guaranteeing that questions served-but-unanswered are never repeated.

2. **Atomic Max Question Count Enforcement**:
   Inside the `SELECT ... FOR UPDATE` answer submission transaction, answers are counted atomically. When `submitted_answer_count >= assessment.max_question_count`, the attempt moves immediately to `status = SUBMITTED`, `completion_reason = 'max_questions_reached'`, pointers are cleared, the final score is snapshot, and no subsequent question is served.

3. **Synchronous Violation Threshold & Atomic Assessment Ban**:
   Upon reaching `violation_count >= assessment.max_violations`, the attempt is synchronously terminated (`status = TERMINATED`, `completion_reason = 'violation_threshold'`) and an assessment-specific ban is atomically created with `banned_by = NULL` and `ban_source = 'system_violation_threshold'`.

4. **Background Sweep Invariant**:
   The background sweep task executes every 60 seconds. Attempts exceeding the assessment time limit or disconnected beyond the grace period are finalized strictly as `SUBMITTED` (`completion_reason = 'time_expired'` or `'disconnect_timeout'`), **NEVER** `TERMINATED`.

5. **Soft-Delete Integrity**:
   Questions referenced in historical assessments or attempts are soft-deleted via `retired_at` and never hard-deleted. Assessments with existing attempts cannot be deleted.

---

## 3. Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy 2.0 (asyncio), asyncpg (PostgreSQL) / aiosqlite, Alembic migrations, Pydantic v2, PyJWT, bcrypt.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS 3.4, `@tanstack/react-query`, `react-router-dom`, `lucide-react`.
- **Database**: PostgreSQL (Production) / SQLite (Local dev file `proctor_dev.db`).
- **Real-Time**: Native WebSockets with auto-reconnect and 5-second HTTP polling fallback.

---

## 4. Quickstart Guide

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- (Optional) Docker & Docker Compose for PostgreSQL production container

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Seed initial demo data (Admin, Teacher, 5 Students, Assessment & Attempts)
python seed_demo.py

# Start the FastAPI server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend Setup

```bash
# Open a new terminal in the frontend directory
cd frontend

# Install npm dependencies
npm install

# Start role-specific portals
npm run dev:student   # Student Portal on http://localhost:3000
npm run dev:teacher   # Teacher Portal on http://localhost:3001
npm run dev:admin     # Admin Portal on http://localhost:3002

# Or build for production
npm run build
```

### 3. Unified Startup (All Portals in One Command)

From the **root repository folder**, you can boot the entire stack concurrently:
```bash
npm run dev
```

| Portal / Service | Port / URL | Purpose |
| :--- | :--- | :--- |
| **👨‍🎓 Student Portal** | **`http://localhost:3000`** | Exam onboarding, full-screen adaptive exams, results |
| **👩‍🏫 Teacher Portal** | **`http://localhost:3001`** | Material uploads, AI generation, live proctoring telemetry |
| **🧑‍💼 Admin Portal** | **`http://localhost:3002`** | User management, global bans, audit logs |
| **🚀 Backend API** | **`http://127.0.0.1:8000`** | FastAPI endpoints & Interactive Swagger Docs (`/docs`) |

---

## 5. Pre-Configured Demo Credentials

The database seed script (`seed_demo.py`) creates the following accounts:

| Role | Email | Password | Description |
| :--- | :--- | :--- | :--- |
| **Primary Admin** | `bhargavvana80@gmail.com` | `Bhargav11@prasad` | Primary Administrator with full platform controls |
| **Admin** | `admin@proctor.ai` | `AdminPass123!` | System Administrator with user management and audit log access |
| **Teacher** | `teacher@proctor.ai` | `TeacherPass123!` | Teacher with uploaded materials, AI generation, and assessment analytics |
| **Student 1** | `student1@proctor.ai` | `StudentPass123!` | Completed attempt (Score: 16.0, Hard reached) |
| **Student 2** | `student2@proctor.ai` | `StudentPass123!` | Completed attempt (Score: 13.0, Medium reached) |
| **Student 3** | `student3@proctor.ai` | `StudentPass123!` | Completed attempt (Score: 9.0, Medium reached) |
| **Student 4** | `student4@proctor.ai` | `StudentPass123!` | Terminated attempt due to violation threshold (Assessment Banned) |
| **Student 5** | `student5@proctor.ai` | `StudentPass123!` | Ready to take the assessment |

---

## 6. Running the Automated Test Suite

The test suite covers the adaptive matrix, AI provider chain and regeneration cap, database constraints, serving invariant, atomic max question count enforcement, proctoring violation debounce/threshold bans, and background sweep:

```bash
cd backend
venv\Scripts\pytest -v
```

**Test Coverage Summary (18/18 Passing)**:
- `test_adaptive_engine.py`: Fast/slow computation, Section 6.1 difficulty transitions, boundary capping, and accessibility mode override.
- `test_ai_providers.py`: Mock provider validation, chain transient failover, permanent error fast-skip, all-down reporting, 3-round regeneration shortfall cap, and semantic duplicate detection.
- `test_auth_security.py`: Client-role registration protection and global ban force-termination.
- `test_database_constraints.py`: Duplicate assessment questions prevention (`PRIMARY KEY (assessment_id, question_id)`) and serving dual uniqueness.
- `test_max_question_enforcement.py`: Atomic `max_question_count` enforcement with `completion_reason = 'max_questions_reached'`.
- `test_proctoring_and_bans.py`: 2-second debounce and synchronous violation threshold termination with atomic assessment ban.
- `test_serving_invariant.py`: 4-step serving record creation and candidate exclusion via `attempt_question_servings`.
- `test_sweep.py`: Background sweep finalizes expired attempts as `SUBMITTED`, never `TERMINATED`.

---

## 7. WebSocket Scaling Architecture (Section 8.7)

The application implements an authoritative database broadcast pattern:
- **Current Node**: In-memory connection manager (`ConnectionManager`) tracks active WebSocket subscribers per assessment.
- **Authoritative Source**: Scores, rankings, and violations are always calculated server-side from PostgreSQL/SQLite and pushed to subscribers upon mutation.
- **Horizontal Scaling**: To scale across multiple uvicorn worker processes or cluster nodes, the manager supports a Redis Pub/Sub adapter (`REDIS_URL`) where leaderboard and violation events are broadcast across instances, while clients without WebSocket connectivity fall back automatically to 5-second polling.
