# 🚀 AssessAI Deployment Guide (Render & GitHub)

This guide walks you through deploying **AssessAI** (AI-Powered Smart Proctoring and Adaptive Assessment System) to **Render** using Blueprint infrastructure as code.

---

## 🏗️ Architecture Overview

The system is deployed as 4 separate services connected together:

1. **Backend Web Service (`assessai-backend`)**:
   - Python FastAPI application running on Uvicorn.
   - Handles real-time WebSocket proctoring, AI question generation, role-isolated auth, auto-sweeps, and analytics.
2. **Student Portal (`assessai-student`)**:
   - React + Vite SPA static site.
   - Includes real-time camera object & face detection, audio monitoring, auto-fullscreen proctoring, and adaptive exam runner.
3. **Teacher Portal (`assessai-teacher`)**:
   - React + Vite SPA static site.
   - Includes assessment creator, PDF syllabus extractor, live candidate monitoring, and revoke/unban proctoring controls.
4. **Admin Portal (`assessai-admin`)**:
   - React + Vite SPA static site.
   - System audits, user role management, system health overview.

---

## 📦 1-Click Render Deployment with Blueprint

1. **Push your repository** to GitHub: `https://github.com/Bhargavprasad-data/AssessAI.git`
2. Go to your [Render Dashboard](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Connect your GitHub account and select the **`Bhargavprasad-data/AssessAI`** repository.
5. Render will automatically read `render.yaml` and configure:
   - `assessai-backend` (Python web service)
   - `assessai-student` (Static site with SPA rewrite `/* -> /index.html`)
   - `assessai-teacher` (Static site with SPA rewrite `/* -> /index.html`)
   - `assessai-admin` (Static site with SPA rewrite `/* -> /index.html`)
6. In the environment variable setup step, set your secret keys or AI keys (e.g., `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
7. Click **Apply**. Render will automatically build and deploy all services!

---

## ⚙️ Manual Deployment on Render (Alternative)

If not using Blueprints:

### 1. Backend Web Service
- **Root Directory**: `backend`
- **Environment**: `Python 3`
- **Build Command**: `pip install --upgrade pip && pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `ENVIRONMENT=production`
  - `SECRET_KEY=<32+ character random string>`
  - `CSRF_SECRET_KEY=<random string>`
  - `COOKIE_SECURE=true`
  - `COOKIE_SAMESITE=none`
  - `MOCK_AI_ENABLED=true`
  - `GEMINI_API_KEY=<your-key>` (Optional)

### 2. Student / Teacher / Admin Static Sites
- **Root Directory**: `student` (or `teacher` / `admin`)
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_URL=https://<your-backend-render-url>.onrender.com`
- **Redirects / Rewrites**:
  - Source: `/*`
  - Destination: `/index.html`
  - Action: `Rewrite`
