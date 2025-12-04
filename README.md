
# FamilySync Dashboard

A Skylight-style family organizer web application featuring a shared family calendar, chore tracking with gamification for kids, meal planning, and a digital photo frame mode.

## Features

- **Family Wall Dashboard**: A kiosk-mode interface designed for a central tablet or monitor.
- **Calendar**: Shared family events view.
- **Chore Tracking**: Gamified chore lists for kids with point tracking.
- **Rewards Store**: Kids can redeem points for rewards defined by parents.
- **Meal Planner**: Weekly breakfast, lunch, and dinner menu board.
- **Photo Frame**: Digital screensaver mode syncing with family photos.
- **Parent Portal**: Admin interface to manage users, chores, and approvals.
- **Gemini AI Integration**: AI-powered chore suggestions and breakdown.

## Tech Stack

- **React 19**: UI Library
- **Tailwind CSS**: Styling
- **Lucide React**: Icons
- **Recharts**: Data visualization
- **Google GenAI SDK**: AI features

## How to Run Locally

### Option 1: Development Mode (Vite)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```

### Option 2: Static Server (No-Build)

If you haven't migrated to Vite and are using the standalone files:
1. Run a static server in the project root:
   ```bash
   npx serve .
   ```

## Configuration

To enable the AI features, you need a Google Gemini API Key.
To enable Google Calendar Sync, you need a Google Cloud Client ID.

## Deployment Guide (Ubuntu Server)

Follow these steps to deploy the application on a fresh Ubuntu server.

### 1. Update System & Install Prerequisites

Update package lists and install basic tools:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git unzip
```

### 2. Install Node.js (Version 20)

We will use NodeSource to install a recent version of Node.js.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify installation:
```bash
node -v
npm -v
```

### 3. Setup the Project

Clone your repository (or copy your files via SCP/FTP):

```bash
git clone https://github.com/rapafernando/FamilyCenter.git
cd FamilyCenter
```

### 4. Install Dependencies & Build

Install the project libraries and build the production version:

```bash
npm install
npm run build
```

> **Note**: If you are running the "No-Build" version (using index.html directly), skip `npm run build`.

### 5. Setup Process Manager (PM2)

Use PM2 to keep the application running in the background and restart automatically on reboot.

```bash
# Install PM2 and a static file server globally
sudo npm install -g pm2 serve

# Start the application
# If using Vite (Build version):
pm2 start "serve -s dist -l 3000" --name family-dashboard

# If using No-Build (Static version):
# pm2 start "serve -s . -l 3000" --name family-dashboard
```

### 6. Configure Startup Script

Ensure the app starts when the server reboots:

```bash
pm2 startup
# Follow the command output provided by the previous command (copy/paste it)
pm2 save
```

Your app is now running at `http://YOUR_SERVER_IP:3000`.

### 7. (Optional) Setup Nginx Reverse Proxy

To access the app via port 80 (standard HTTP) instead of 3000.

```bash
sudo apt install -y nginx
```

Create a config file:
```bash
sudo nano /etc/nginx/sites-available/family-dashboard
```

Paste the following configuration:
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/family-dashboard /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## License

MIT
