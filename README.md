
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

## How to Run

This project uses ES Modules and Import Maps, meaning it can run directly in modern browsers without a complex build step for development, or be served via a simple static server.

### Option 1: Static Server (Recommended)

1. Make sure you have Node.js installed.
2. Run a static server in the project root:

```bash
npx serve .
```

3. Open `http://localhost:3000` in your browser.

### Option 2: VS Code Live Server

1. Install the "Live Server" extension in VS Code.
2. Right-click `index.html` and select "Open with Live Server".

## Configuration

To enable the AI features, you need a Google Gemini API Key.
In a production environment, this should be injected via environment variables or a secure backend proxy.

## License

MIT
