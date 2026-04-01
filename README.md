# Vernlo — Understand any document

Upload any confusing document. Get plain English instantly.

## What it does
- Upload any PDF or text document (lease, employment contract, medical report, insurance policy, loan agreement)
- AI reads and analyzes it automatically
- Get: plain English summary, key points with severity flags, red flags, and a bottom line
- Ask follow-up questions about your specific document

## Tech Stack
- React (frontend)
- Claude API (claude-sonnet-4-20250514) — document analysis + chat
- No backend needed for Phase 1

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Claude API key
The API key is handled by the Claude.ai environment.
If running locally, you'll need to add your key to the fetch headers:
```js
headers: {
  "Content-Type": "application/json",
  "x-api-key": "YOUR_KEY_HERE",
  "anthropic-version": "2023-06-01"
}
```

### 3. Run locally
```bash
npm start
```

### 4. Deploy to Vercel
```bash
npm install -g vercel
vercel
```

## Phase 2 (coming soon)
- Supabase auth (Google login)
- Save document history
- Folder organization
- Share analysis with others

## Supported document types
- Lease agreements
- Employment contracts
- Medical reports / lab results
- Insurance policies
- Loan agreements
- Any legal document

## Hackathon notes
Built for [Hackathon Name] — [Date]
Problem: People sign documents they don't understand
Solution: AI reads it, you get plain English in seconds
