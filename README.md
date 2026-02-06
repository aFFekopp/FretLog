# FretLog 🎸

FretLog is a personal music practice dashboard designed to help musicians track their progress, manage their repertoire, and maintain a consistent practice routine.

## Project Status: Vibe Coded
> [!IMPORTANT]
> This project is **heavily vibe coded** and primarily intended for **personal use**. 
> It was built with a focus on immediate utility and specific workflow "vibes". While functional and feature-rich, it may not follow traditional professional software architecture patterns. It works for me, and it might work for you!

## Features
- **Dashboard**: Quick overview of your practice streak, total time, and recent sessions.
- **Active Timer**: Start a practice session and track time for specific items in your library.
- **Library Management**: Organize your songs, exercises, and techniques by category and artist.
- **Detailed Statistics**: Visualize your progress with GitHub-style activity heatmaps and trend charts.
- **Session History**: Review and manage past practice logs with detailed notes.
- **Customizable**: Add your own instruments and practice categories.
- **Dark Mode**: Sleek, modern interface that's easy on the eyes.

## Deployment with Docker
The easiest way to run FretLog is using Docker Compose.

1. **Clone the repo**:
   ```bash
   git clone https://github.com/aFFekopp/fretlog.git
   cd fretlog
   ```
2. **Start the app**:
   ```bash
   docker-compose up -d
   ```
3. **Access FretLog**:
   Open [http://localhost:5000](http://localhost:5000) in your browser.

## Tech Stack
- **Backend**: Python (Flask), SQLite
- **Frontend**: Vanilla JS, HTML5, CSS3 (Modern Flex/Grid)
- **Deployment**: Docker, GHCR, GitHub Actions

## License
Intended for personal use. Feel free to fork and adapt it to your own practice vibes.
