# 🧠 AssessAI — AI-Powered Adaptive Online Assessment & Smart Proctoring System

<div align="center">

![AssessAI Logo](logo.png)

**An enterprise-grade, full-stack adaptive assessment platform with AI question generation, edge-biometric proctoring telemetry, real-time WebSocket monitoring, and database-authoritative ranking.**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110.0-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB.svg?style=flat&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5.0-3178C6.svg?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg?style=flat&logo=tailwind-css)](https://tailwindcss.com)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-4.17.0-FF6F00.svg?style=flat&logo=tensorflow)](https://www.tensorflow.org/js)
[![Render](https://img.shields.io/badge/Render-Deployed-46E3B7.svg?style=flat&logo=render)](https://render.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## 📑 Table of Contents
1. [Key Features & Capabilities](#-key-features--capabilities)
2. [Role Portals & Dashboards](#-role-portals--dashboards)
3. [Core Algorithms & Mathematical Formulations](#-core-algorithms--mathematical-formulations)
4. [Architecture & System Invariants](#-architecture--system-invariants)
5. [Technology Stack](#-technology-stack)
6. [Project Directory Structure](#-project-directory-structure)
7. [Local Quickstart & Installation](#-local-quickstart--installation)
8. [Cloud Deployment on Render (3 Distinct Portals)](#-cloud-deployment-on-render-3-distinct-portals)
9. [Demo Credentials](#-demo-credentials)
10. [Automated Test Suite](#-automated-test-suite)
11. [License](#-license)

---

## 🌟 Key Features & Capabilities

### 🤖 Multi-Provider AI Question Generator
- **PDF Syllabus Ingestion**: Upload course material PDFs (up to 20MB); the backend extracts text chunks, computes semantic context, and creates context-grounded MCQs.
- **Dynamic 3-Tier Difficulty**: Questions are classified into **Easy**, **Medium**, and **Hard** with explanatory rationales and `source_chunk_ref` traceability.
- **Multi-Cloud AI Provider Chain**:
  - `Google Gemini` (`gemini-1.5-flash` / `gemini-1.5-pro`)
  - `Anthropic Claude` (`claude-3-5-sonnet`)
  - `OpenAI` (`gpt-4o-mini` / `gpt-4o`)
  - `Ollama` (Local self-hosted models like `llama3`)
  - `Smart NLP Local Extractor` (Offline zero-dependency fallback)
- **Circuit Breaker & Deduplication**: Token-based Jaccard similarity prevents duplicate questions, and circuit breakers handle rate limits with automatic failover.

### 🎯 Real-Time Difficulty-Adaptive Engine
- Dynamically scales difficulty question-by-question based on the candidate's live performance:
  - **`CORRECT + FAST`**: Increments promotion counter $\rightarrow$ elevates difficulty (`Easy` $\rightarrow$ `Medium` $\rightarrow$ `Hard`).
  - **`CORRECT + SLOW` / `INCORRECT` / `TIMEOUT`**: Increments demotion counter $\rightarrow$ adjusts to lower difficulty.
- **Accessibility Mode (`enable_speed_adaptive = false`)**: Disables speed pressure, promoting candidates based solely on accuracy.

### 🛡️ Edge-Biometric Smart Proctoring
- **Client-Side AI Object Detection**: Powered by TensorFlow.js and COCO-SSD running directly on WebGL (120ms inference loop):
  - 📱 **Mobile Phone & Unauthorized Device Detection** (Instant detection with zero false positives for laptop keyboards/mice).
  - 📚 **Study Materials & Books Detection**.
  - 👥 **Multiple Faces Detection** (Flags when extra persons enter the frame).
  - 👤 **No Face Detection** (Flags when candidate leaves the camera view).
  - 👀 **Gaze & Head Pose Deviation** (Flags when candidate looks away from the screen).
- **Audio Telemetry & Noise Analysis**: Real-time microphone audio VU level analyzer detecting suspicious background chatter.
- **Browser Lock & Environment Monitoring**:
  - Fullscreen enforcement with auto-exit warnings.
  - Tab switch (`visibilitychange`) & window blur monitoring.
  - Clipboard guard blocking copy, cut, and paste events.
- **Voice Warnings**: Spoken synthesized voice audio alerts prompting candidate compliance.
- **Discrete Incident State-Machine**: Physical appearances count as exactly 1 strike per incident rather than firing repeatedly while in frame.

### 👨‍🏫 Instructor Control & Live Telemetry
- **Live Leaderboard & Violation Stream**: Real-time DB-backed leaderboard and violation telemetry via WebSockets with a 5-second polling fallback.
- **Instant Revoke / Reinstatement**: Teachers can unban or revoke a violation-terminated candidate with one click; the student's exam screen **automatically resumes immediately**.
- **Assessment Analytics & CSV Export**: Detailed score distribution histogram, difficulty accuracy matrix, and 1-click authenticated CSV download.

---

## 👥 Role Portals & Dashboards

The system provides 3 completely isolated, dedicated frontend applications tailored to each role:

| Portal | Local Port | Production Environment | Capabilities |
| :--- | :--- | :--- | :--- |
| **🎓 Student Portal** | `http://localhost:3000` | `https://assessai-student.onrender.com` | Hardware setup check, proctoring consent, adaptive question runner, live proctoring HUD, and full attempt review. |
| **👩‍🏫 Teacher Portal** | `http://localhost:3001` | `https://assessai-teacher.onrender.com` | PDF material uploader, AI MCQ generator, assessment configurator, live candidate monitoring, and revoke/unban controls. |
| **🧑‍💼 Admin Portal** | `http://localhost:3002` | `https://assessai-admin.onrender.com` | User role management, platform-wide global suspension, system health monitoring, and cryptographic audit log trails. |
| **⚡ Backend API** | `http://127.0.0.1:8000` | `https://assessai-backend.onrender.com` | FastAPI application, async database engine, Swagger documentation (`/docs`), and WebSocket live hub. |

---

## 🔬 Core Algorithms & Mathematical Formulations

### 📊 Algorithmic Complexity & Architecture Matrix

| Subsystem | Algorithm / Technique | Complexity | Primary Purpose |
| :--- | :--- | :--- | :--- |
| **Adaptive Engine** | Speed-Accuracy State Machine | $\mathcal{O}(1)$ | Dynamically adjusts exam difficulty |
| **Adaptive Engine** | Historical Exclusion Reservoir | $\mathcal{O}(K)$ | Guarantees non-repeating dynamic questions |
| **Computer Vision** | MobileNetV2 Single Shot Detector | $\mathcal{O}(N \times W \times H)$ | Real-time object & person detection in browser |
| **Proctoring** | Gaze Pose Centroid Estimation | $\mathcal{O}(1)$ | Flags screen look-aways |
| **Proctoring** | Temporal Edge Incident Filter | $\mathcal{O}(1)$ | 1 strike per continuous physical appearance |
| **Audio** | Discrete RMS Energy Computation | $\mathcal{O}(N)$ | Real-time microphone noise detection |
| **NLP** | Token-Level Jaccard Similarity | $\mathcal{O}(\|T_A\| + \|T_B\|)$ | Prevents semantic duplicate questions |
| **NLP** | Exponential Backoff Circuit Breaker | $\mathcal{O}(P)$ | Multi-cloud LLM failover & resilience |
| **Security** | bcrypt Key Expansion | $\mathcal{O}(2^{\text{cost}})$ | Secure password storage |
| **Security** | HMAC-SHA256 Digital Signature | $\mathcal{O}(M)$ | Tamper-proof stateless JWT tokens |

### 1. Real-Time Adaptive Difficulty Algorithm
The engine evaluates each question submission dynamically to select the candidate's next question difficulty tier:

$$\text{Time Threshold } T_{\text{fast}} = \frac{T_{\text{allocated}}}{2}$$

```
                ┌───────────────────────────────────┐
                │          Answer Received          │
                └─────────────────┬─────────────────┘
                                  │
                  Is Answer Correct && Time <= T_fast?
                     /                         \
                   YES                          NO
                   /                             \
     ┌────────────────────────────┐    ┌────────────────────────────┐
     │  promotion_counter += 1    │    │   demotion_counter += 1    │
     │  demotion_counter = 0      │    │   promotion_counter = 0    │
     └─────────────┬──────────────┘    └─────────────┬──────────────┘
                   │                                 │
     promotion_counter >= 2?           demotion_counter >= 2 (or incorrect)?
           /              \                          /              \
         YES               NO                      YES               NO
         /                  \                      /                  \
Elevate Difficulty    Maintain Tier        Lower Difficulty     Maintain Tier
(Easy->Med->Hard)                          (Hard->Med->Easy)
```

### 2. Edge-Biometric Computer Vision Pipeline (TF.js + COCO-SSD)
- **Inference Interval**: $\Delta t = 120\text{ ms}$ on client GPU via WebGL.
- **Incident State-Machine**: Debounced using a continuous-frame threshold buffer ($N=3$ consecutive detections) to transition from `CLEAR` $\rightarrow$ `VIOLATION_TRIGGERED` $\rightarrow$ `RESTORED`.
- **Gaze Deviation**: Calculated via eye center offset vector relative to the facial bounding box centroid:

$$\theta_{\text{yaw}} = \arctan\left(\frac{x_{\text{nose}} - x_{\text{face\_center}}}{w_{\text{face}}}\right)$$

### 3. Jaccard Semantic Deduplication for AI Question Generation
To prevent repetitive questions generated from multiple chunks:

$$J(Q_A, Q_B) = \frac{|T(Q_A) \cap T(Q_B)|}{|T(Q_A) \cup T(Q_B)|}$$

Where $T(Q)$ is the tokenized and lemmatized set of terms in Question $Q$. If $J(Q_A, Q_B) \ge 0.70$, the candidate question is rejected and regenerated.

### 4. Database-Authoritative Ranking Algorithm
Candidate rankings are computed using standard competitive ranking with deterministic tie-breaking:

$$\text{Rank}(u) = 1 + \left| \{ v \in U \mid \text{Score}(v) > \text{Score}(u) \lor (\text{Score}(v) = \text{Score}(u) \land \text{Duration}(v) < \text{Duration}(u)) \} \right|$$

---

## 🏛️ Architecture & System Invariants

```
               ┌─────────────────────────────────────────┐
               │         FastAPI Backend (Port 8000)     │
               │  • Auth & Role Isolation (JWT + CSRF)   │
               │  • Adaptive Progression Engine          │
               │  • AI Provider Chain (Gemini/Claude)    │
               │  • Background Sweep & Auto-Finalizer    │
               └────▲─────────────────▲────────────────▲─┘
                    │                 │                │
            WebSocket / REST   WebSocket / REST  WebSocket / REST
                    │                 │                │
      ┌─────────────┴───┐     ┌───────┴───────┐   ┌────┴────────────┐
      │  Student Portal │     │Teacher Portal │   │  Admin Portal   │
      │   (Port 3000)   │     │  (Port 3001)  │   │   (Port 3002)   │
      │ • TF.js Object  │     │ • AI Generator│   │ • User Roles    │
      │   Detection     │     │ • Live Monitor│   │ • Global Bans   │
      │ • Audio VU Meter│     │ • CSV Export  │   │ • Audit Logs    │
      └─────────────────┘     └───────────────┘   └─────────────────┘
```

### Critical Invariants
1. **Atomic 4-Step Question Serving**: Questions are selected and recorded in `attempt_question_servings` with unique `(attempt_id, question_id)` in a single transaction. Served-but-unanswered questions are never repeated.
2. **Atomic Max Question Enforcement**: Answers are counted under `SELECT ... FOR UPDATE`. When `answers_count >= max_question_count`, the attempt is finalized as `submitted` without serving extra questions.
3. **Background Sweep Finalization**: Disconnected or expired exams are finalized as `submitted` (`completion_reason = 'time_expired'`), never deleted or left orphaned.
4. **Student Review Screen Security**: When all questions are answered, the candidate reviews their submission on the attempt review screen with the exam timer running. The exam submits only when the candidate clicks **"Finalize & Submit Exam"** or when the total exam timer reaches `00:00`.
5. **Strict Cookie & Role Isolation**: Role sessions are separated into isolated cookies with backend validation ensuring tokens issued for student cannot access teacher or admin endpoints.

---

## 💻 Technology Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0 (asyncio), asyncpg (PostgreSQL) / aiosqlite (SQLite), Alembic, Pydantic v2, PyJWT, bcrypt, Uvicorn.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS 3.4, `@tanstack/react-query`, `react-router-dom`, `lucide-react`.
- **AI & Computer Vision**: TensorFlow.js (`@tensorflow/tfjs`), COCO-SSD (`@tensorflow-models/coco-ssd`), Google Gemini API, Anthropic Claude API, OpenAI API, Ollama.
- **Database**: PostgreSQL (Production) / SQLite (Local development file `proctor_dev.db`).
- **DevOps**: Docker, Docker Compose, Render Blueprint (`render.yaml`).

---

## 📂 Project Directory Structure

```
Smart-Proctoring-System/
├── backend/                  # FastAPI Python Application
│   ├── app/
│   │   ├── ai/               # AI Generator, Providers (Gemini, Claude, OpenAI, Mock)
│   │   ├── api/              # Role Routers (Auth, Student, Teacher, Admin, Proctoring, WebSockets)
│   │   ├── core/             # Security, JWT, Rate Limiting, CSRF Protection
│   │   ├── models/           # SQLAlchemy Declarative Models
│   │   ├── schemas/          # Pydantic Request/Response Schemas
│   │   ├── services/         # Adaptive Engine, PDF Extractor, Proctoring Service, Sweeps
│   │   └── main.py           # Application Entrypoint & CORS Configuration
│   ├── alembic/              # Database Schema Migrations
│   ├── seed_demo.py          # Demo Database Seeder Script
│   └── requirements.txt      # Python Dependencies
├── student/                  # Student Portal (React + Vite + TypeScript)
│   ├── src/
│   │   ├── components/       # ProctoringMediaWidget, Badge, Modal, ThemeToggle
│   │   ├── hooks/            # useCameraDetection, useExamTimer, useProctoring
│   │   └── pages/            # ExamSession, ExamResults, StudentDashboard, Login
├── teacher/                  # Teacher Portal (React + Vite + TypeScript)
│   ├── src/
│   │   ├── hooks/            # useLeaderboard (WebSocket + Polling)
│   │   └── pages/            # AssessmentBuilder, AssessmentAnalytics, TeacherDashboard
├── admin/                    # Admin Portal (React + Vite + TypeScript)
│   ├── src/
│   │   └── pages/            # AdminDashboard, AuditLogViewer, Login
├── docker-compose.yml        # Multi-container Docker Configuration
├── render.yaml               # Render Infrastructure-as-Code Blueprint
├── DEPLOYMENT.md             # Complete Deployment Guide
├── build-static.js           # Multi-portal Static Site Builder
└── package.json              # Root Orchestration Scripts
```

---

## ⚡ Local Quickstart & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: v3.11 or higher
- **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/Bhargavprasad-data/AssessAI.git
cd AssessAI
```

### 2. Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```
*(Optional)* Add your `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY` in `.env`. If left blank, the system automatically uses the intelligent local NLP fallback.

### 3. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations & seed demo data
alembic upgrade head
python seed_demo.py

cd ..
```

### 4. Install Frontend Dependencies
```bash
# Install root, student, teacher, and admin dependencies
npm install
npm --prefix student install
npm --prefix teacher install
npm --prefix admin install
```

### 5. Launch All Services (One Command)
From the root directory:
```bash
npm run dev
```

Open your browser to:
- 🎓 **Student Portal**: [http://localhost:3000](http://localhost:3000)
- 👨‍🏫 **Teacher Portal**: [http://localhost:3001](http://localhost:3001)
- 🛡️ **Admin Portal**: [http://localhost:3002](http://localhost:3002)
- ⚡ **Backend Swagger API**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 🚀 Cloud Deployment on Render (3 Distinct Portals)

AssessAI is 100% cloud-ready with a native Render Blueprint ([render.yaml](render.yaml)) supporting 3 distinct client portals and a centralized backend:

### 1-Click Blueprint Deployment
1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** $\rightarrow$ **Blueprint**.
3. Connect your GitHub repository: `https://github.com/Bhargavprasad-data/AssessAI.git`.
4. Render will automatically provision:
   - 🗄️ **`assessai-postgres`** (Managed PostgreSQL Database)
   - ⚡ **`assessai-backend`** (Python FastAPI Web Service)
   - 🎓 **`assessai-student`** (Static Site with SPA rewrite rules)
   - 👨‍🏫 **`assessai-teacher`** (Static Site with SPA rewrite rules)
   - 🛡️ **`assessai-admin`** (Static Site with SPA rewrite rules)
5. Enter any optional AI API keys when prompted and click **Apply**!

For detailed manual instructions and custom domain setup, see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 🔑 Demo Credentials

The database seeder (`seed_demo.py`) initializes the following test accounts:

| Role | Email | Password | Description |
| :--- | :--- | :--- | :--- |
| **Administrator** | `bhavv` | `Bha` | Platform Admin (Full control, Audit Logs, Global Bans) |
| **Teacher** | `ter@proctor.ai` | `TeacherPass!` | Instructor (Assessment Builder, AI MCQ Generator, Analytics) |
| **Student 1** | `sde1@proctor.ai` | `StudentPass3!` | Completed attempt (Score: 16.0, Hard reached) |
| **Student 2** | `sden\t2@proctor.ai` | `StudentPass1!` | Ready to take the assessment |

---

## 🧪 Automated Test Suite

Run the full backend test suite to verify adaptive engine logic, proctoring debouncing, AI provider failover chains, and serving invariants:

```bash
cd backend
pytest -v
```

### Test Suite Highlights:
- `test_adaptive_engine.py`: Fast/slow computation, Section 6.1 difficulty transitions, boundary capping.
- `test_ai_providers.py`: Multi-provider failover chain, circuit breaker cooldown, Jaccard semantic deduplication.
- `test_auth_security.py`: Role isolation across portals, CSRF tokens, and global platform ban force-termination.
- `test_database_constraints.py`: Unique constraints on serving sequence numbers and assessment question mappings.
- `test_max_question_enforcement.py`: Atomic `max_question_count` enforcement.
- `test_proctoring_and_bans.py`: 2.0-second debounce and synchronous violation threshold termination with atomic assessment ban.
- `test_sweep.py`: Background sweep finalizes expired attempts cleanly as `submitted`.

---

## 📄 License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
