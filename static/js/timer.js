/**
 * FretLog - Timer Utility
 * Provides timer functionality for practice sessions
 */

const FretLogTimer = {
    timers: {},

    // Format milliseconds to HH:MM:SS
    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    },

    // Format milliseconds to human readable (e.g., "1h 30m")
    formatTimeHuman(ms) {
        const totalMinutes = Math.floor(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m`;
        return '0m';
    },

    // Format for combined session time display
    formatSessionTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds}s`;
    },

    // Format duration with needed parts only (e.g. 1h 10m 5s)
    formatDuration(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    },

    // Start a timer with given id
    start(id, callback, startTime = null) {
        if (this.timers[id]) {
            this.stop(id);
        }

        const baseTime = startTime || Date.now();

        this.timers[id] = {
            startTime: baseTime,
            interval: setInterval(() => {
                const elapsed = Date.now() - baseTime;
                if (callback) callback(elapsed);
            }, 1000),
            callback
        };

        // Trigger initial callback
        if (callback) callback(Date.now() - baseTime);

        return this.timers[id];
    },

    // Stop a timer
    stop(id) {
        if (this.timers[id]) {
            clearInterval(this.timers[id].interval);
            const elapsed = Date.now() - this.timers[id].startTime;
            delete this.timers[id];
            return elapsed;
        }
        return 0;
    },

    // Pause a timer (stop but remember elapsed time)
    pause(id) {
        if (this.timers[id]) {
            clearInterval(this.timers[id].interval);
            this.timers[id].paused = true;
            this.timers[id].pausedAt = Date.now();
        }
    },

    // Resume a paused timer
    resume(id) {
        if (this.timers[id] && this.timers[id].paused) {
            const pauseDuration = Date.now() - this.timers[id].pausedAt;
            this.timers[id].startTime += pauseDuration;
            this.timers[id].paused = false;
            delete this.timers[id].pausedAt;

            this.timers[id].interval = setInterval(() => {
                const elapsed = Date.now() - this.timers[id].startTime;
                if (this.timers[id].callback) this.timers[id].callback(elapsed);
            }, 1000);
        }
    },

    // Get elapsed time for a timer
    getElapsed(id) {
        if (this.timers[id]) {
            return Date.now() - this.timers[id].startTime;
        }
        return 0;
    },

    // Check if timer is running
    isRunning(id) {
        return !!this.timers[id] && !this.timers[id].paused;
    },

    // Stop all timers
    stopAll() {
        Object.keys(this.timers).forEach(id => this.stop(id));
    }
};

// Export for use in other scripts
window.FretLogTimer = FretLogTimer;
