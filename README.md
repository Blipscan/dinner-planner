# Dinner Party Planner - Beta

Professional dinner party planning app that generates complete cookbooks.

## Features

- **AI Menu Generation** — 5 personalized menu options based on preferences
- **Complete DOCX Cookbook** — 15+ pages with everything you need:
  - Elegant take-away menu for guests
  - Wine & spirits with prices
  - Shopping list scaled to guest count
  - Day-before prep with full instructions
  - Day-of timeline
  - Table setting guide
  - Plating guide with portions
  - Tips & emergency fixes
  - Final checklist
  - AI image prompts

## Beta Controls

- Access codes required for entry
- Automatic expiration date
- Per-tester usage limits
- Usage tracking for admin

## Quick Start

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:
```
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
BETA_END_DATE=2025-01-21
ACCESS_CODES=TESTER-ALPHA,TESTER-BRAVO,TESTER-CHARLIE
```

### 3. Run Locally

```bash
npm start
```

Open http://localhost:3000

## Deployment

### Railway (Recommended)

1. Push to GitHub
2. Connect repo to Railway
3. Add environment variables in Railway dashboard
4. Deploy

### Render

1. Push to GitHub
2. Create new Web Service on Render
3. Add environment variables
4. Deploy

## Giving Access to Testers

1. Add their code to `ACCESS_CODES` in `.env`
2. Send them:
   - The URL
   - Their access code (e.g., `TESTER-ALPHA`)

## Monitoring Usage

Visit `/api/admin/stats` with the admin code header to see:
- Active testers
- Generation counts per code
- Last usage timestamps

## Project Structure

```
dinner-planner-beta/
├── server/
│   ├── server.js        # Express API server
│   ├── package.json     # Dependencies
│   ├── .env.example     # Environment template
│   └── .env             # Your config (gitignored)
├── client/
│   └── index.html       # Front-end app
└── README.md
```

## Cost Estimates

| Usage | API Cost |
|-------|----------|
| 1 menu generation | ~$0.03-0.05 |
| 10 testers × 20 generations | ~$7 |
| Full 3-week beta | ~$20-25 |

## Support

Created for beta testing. For issues, contact the developer.
