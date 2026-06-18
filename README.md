# Creative Studio — Applyft

Internal AI-powered tool for generating, resizing, and localizing ad creatives across multiple formats.

---

## What it does

**Dashboard** — Generate ad creatives using AI. Provide a brief, upload a reference or competitor image, and the tool produces a polished creative in all required formats (4×5, 1×1, 9×16, 1.91×1). Supports iterative fixing via natural language instructions and saves results directly to Google Drive.

**Localization** — Automatically localize existing ad creatives into multiple languages. Detects text in source images, translates it using GPT-4o (context-aware, copywriter-style), and regenerates the images with Gemini. Supports 15+ languages including RTL (Arabic, Hebrew). Results are uploaded back to Google Drive.

---

## Stack

- **Next.js 14** (App Router)
- **NextAuth** — Google OAuth, restricted to `@applyft.co` accounts
- **GPT-4o** (OpenAI) — prompt generation, image analysis, translation, QA review
- **Gemini 3.1 Flash Image Preview** (Google AI) — image generation and localization
- **Sharp** — pixel-accurate resize to target dimensions
- **Google Drive API** — source folder reading and result upload
- **Vercel** — hosting

---

## Environment Variables

```env
NEXTAUTH_URL=
NEXTAUTH_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

OPENAI_API_KEY=
GOOGLE_AI_API_KEY=
```

---

## Running Locally

```bash
npm install
cp .env.example .env
# Fill in all variables in .env
npm run dev
```

Open http://localhost:3000

Google OAuth setup:
1. Go to console.cloud.google.com
2. APIs & Services → Credentials → Create OAuth 2.0 Client
3. Add `http://localhost:3000/api/auth/callback/google` to Authorized redirect URIs
4. Copy Client ID and Client Secret into `.env`

---

## Project Structure

```
src/
  app/
    api/
      generate/       # AI image generation endpoint
      resize/         # Sharp resize endpoint
      localization/   # Localization job endpoints (run, status, search, preview)
      drive/          # Google Drive helpers
      apps/           # App/language/marketer config
  components/
    main/             # Dashboard (GeneratePanel, GenerateModal)
    localization/     # Localization page
  lib/
    localizationRunner.ts   # Core localization job logic
    imagen.ts               # Gemini image generation
    openai.ts               # GPT prompt generation
    googleDrive.ts          # Drive client
```
