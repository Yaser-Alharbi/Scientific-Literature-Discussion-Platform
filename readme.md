# Scientific Literature Discussion Platform

## What It Is

A web app that lets researchers search for academic papers, save key extracts, and discuss them over live video/audio streams. It combines paper discovery (via Google Scholar), a personal extract library, and real-time discussion rooms into one place. Built for academics and research students who want to collaboratively review literature without switching between tools.

## Key Features

- **Live discussion rooms** with real-time video, audio, and text chat powered by LiveKit WebRTC
- **Role-based room control** — hosts can promote viewers to guest speakers or demote them mid-session
- **Academic paper search** via Google Scholar, automatically enriched with DOIs and open-access PDF links
- **Paper extract library** — save passages from papers with metadata and share them as references during live discussions
- **Dual authentication** — sign in with email/password or Google OAuth, synced across Firebase and Django
- **Research interest filtering** — tag your profile and rooms with research interests to find relevant discussions

## Tech Stack

**Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand, Firebase Auth, LiveKit Components

**Backend:** Django 5.1, Django REST Framework, Firebase Admin SDK, LiveKit Server SDK, PostgreSQL, Gunicorn

## Architecture

The Next.js frontend talks to a Django REST API. In development, Next.js proxies all `/api/*` requests to Django to avoid CORS configuration. Authentication works in two layers: Firebase handles sign-in and token issuance on the client, and Django verifies those tokens server-side using a custom authentication class that maps each Firebase user to a Django User record. For live rooms, Django generates LiveKit access tokens and the frontend connects directly to LiveKit Cloud for video/audio transport. Paper searches hit SerpAPI through the backend, which enriches results with DOIs from CrossRef and open-access links from Unpaywall before returning them.

## How to Run It

### Prerequisites

Python 3.11+, Node.js 18+, a Firebase project (Email/Password + Google auth enabled), a LiveKit Cloud account, and a SerpAPI key.

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

See `.env.example` for required environment variables.
