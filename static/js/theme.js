/**
 * FretLog - Theme Manager
 * Handles theme toggling and persistence
 */

const FretLogTheme = {
    init() {
        // Apply saved theme on load
        const savedTheme = FretLogData.getTheme();
        this.apply(savedTheme);

        // Setup toggle button
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
        }
    },

    apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.updateIcon(theme);
    },

    toggle() {
        const newTheme = FretLogData.toggleTheme();
        this.updateIcon(newTheme);
        return newTheme;
    },

    updateIcon(theme) {
        const icon = document.querySelector('.theme-icon');
        if (icon) {
            icon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    },

    get() {
        return FretLogData.getTheme();
    }
};

// Initialize when DOM is ready and data is loaded
window.addEventListener('fretlog-data-ready', () => {
    FretLogTheme.init();
});

// Fallback for pages that might not wait for the event
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for FretLogData to potentially initialize
    setTimeout(() => {
        if (typeof FretLogData !== 'undefined' && !document.documentElement.hasAttribute('data-theme')) {
            FretLogTheme.init();
        }
    }, 100);
});

window.FretLogTheme = FretLogTheme;
