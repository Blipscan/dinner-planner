# Thames Club Duckpin Manager

A cloud-synced bowling league management application for the Thames Club.

## Features

- Dashboard with recent results and team rosters
- Schedule and results management
- Teams and averages tracking
- Monday Packet preview
- Standings calculation
- Awards and leaderboard
- Full season schedule
- Cloud sync with Supabase
- Local backup and restore

## Deployment on Render

### Step 1: Create Static Site on Render

1. Go to https://dashboard.render.com
2. Click "New +"
3. Select "Static Site"
4. Connect your GitHub account if not already connected
5. Select repository: `Blipscan/thames-bowling`
6. Configure the service:
   - Name: `thames-bowling` (or your preferred name)
   - Branch: `main`
   - Build Command: leave empty
   - Publish Directory: `.` (root directory)
7. Click "Create Static Site"

### Step 2: Verify Deployment

- Render will automatically detect the `render.yaml` configuration
- The site will be available at `https://thames-bowling.onrender.com` (or your custom domain)
- Any push to the `main` branch will trigger an automatic redeploy

## Local Development

Simply open `index.html` in a web browser, or use a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js (http-server)
npx http-server

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000`

## Configuration

The app uses Supabase for cloud storage. Configuration is in `index.html`:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key

## Repository

GitHub: https://github.com/Blipscan/thames-bowling

## License

Private - Thames Club use only
