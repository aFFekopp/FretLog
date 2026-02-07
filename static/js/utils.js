/**
 * FretLog Common Utilities
 */

// Modal Management
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Auto-focus first input if exists
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Time Formatting
function formatTimeHuman(ms) {
    if (!ms && ms !== 0) return '0m';
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatHours(ms) {
    if (!ms) return '0.0';
    const hours = ms / (1000 * 60 * 60);
    return hours.toFixed(1);
}

// User Display
function updateUserDisplay() {
    try {
        const user = FretLogData.getUser();
        const instrument = FretLogData.getCurrentInstrument();

        const nameElems = document.querySelectorAll('.user-name');
        const instElems = document.querySelectorAll('.user-instrument');
        const avatarElems = document.querySelectorAll('.user-avatar');

        nameElems.forEach(el => el.textContent = user?.name || 'Musician');
        instElems.forEach(el => el.textContent = instrument?.name || 'Guitar');
        avatarElems.forEach(el => {
            el.textContent = (user?.name || 'M').charAt(0).toUpperCase();
        });
    } catch (e) {
        console.warn('Update user display error', e);
    }
}

// Notifications (if shared)
function showNotification(message, type = 'success') {
    // Check if a notification container exists, else create one
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `notification toast-${type}`;
    toast.style.cssText = `
        padding: 12px 20px;
        background: var(--bg-card);
        border-left: 4px solid ${type === 'success' ? 'var(--color-primary)' : 'var(--color-danger)'};
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-lg);
        color: var(--text-primary);
        font-weight: var(--font-weight-semibold);
        animation: slideIn 0.3s ease-out forwards;
    `;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Close modals on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        closeModal(e.target.id);
    }
});

// Navigation Highlight (Run on load)
document.addEventListener('DOMContentLoaded', () => {
    const currentPage = document.body.dataset.page;
    if (currentPage) {
        const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');
        navLinks.forEach(link => {
            if (link.dataset.page === currentPage) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }
});
