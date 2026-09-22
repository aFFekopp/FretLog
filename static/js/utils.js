/**
 * FretLog Common Utilities
 */

// Modal Management
const modalTriggers = new Map();

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

function escapeJsArg(value) {
    return JSON.stringify(String(value ?? ''))
        .replace(/&/g, '\\u0026')
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/'/g, '\\u0027');
}

function dispatchDataAction(element, event) {
    const action = element.dataset.action;
    if (!action) return false;
    const value = element.dataset.value;
    const modalId = element.dataset.modal;
    if (action === 'open-modal') openModal(modalId);
    else if (action === 'close-modal') closeModal(modalId);
    else if (action === 'toggle-global-timer') toggleGlobalTimer();
    else if (action === 'start-session') startSession();
    else if (action === 'toggle-mobile-filters') toggleMobileFilters();
    else if (action === 'open-item-modal') openItemModal();
    else if (action === 'open-artist-modal') openArtistModal();
    else if (action === 'confirm-delete-artist') confirmDeleteArtist();
    else if (action === 'update-category-fields') updateCategoryFields();
    else if (action === 'category-filter') handleCategoryClick(element.dataset.id || '');
    else if (action === 'edit-item') editItem(element.dataset.id);
    else if (action === 'delete-item') confirmDelete(element.dataset.id, element.dataset.name || '');
    else if (action === 'set-default-instrument') setDefaultInst(element.dataset.id);
    else if (action === 'edit-instrument') { event.stopPropagation(); editInst(element.dataset.id); }
    else if (action === 'delete-instrument') { event.stopPropagation(); confirmDelInst(element.dataset.id, element.dataset.name || ''); }
    else if (action === 'edit-category') editCat(element.dataset.id);
    else if (action === 'delete-category') confirmDelCat(element.dataset.id, element.dataset.name || '');
    else if (action === 'confirm-custom-time') confirmCustomTime(element.dataset.id);
    else if (action === 'cancel-custom-time') cancelCustomTime();
    else if (action === 'set-custom-item-time') setCustomItemTime(element.dataset.id);
    else if (action === 'pause-item') pauseItem(element.dataset.id);
    else if (action === 'play-item') playItem(element.dataset.id);
    else if (action === 'update-dashboard-rating') updateDashboardRating(element.dataset.id, event);
    else if (action === 'remove-session-item') removeSessionItem(element.dataset.id);
    else if (action === 'toggle-item-menu') { event.stopPropagation(); toggleItemMenu(event, element); }
    else if (action === 'update-rating') updateRating(element.dataset.id, event);
    else if (action === 'view-session') viewSession(element.dataset.id);
    else if (action === 'edit-session') editSession(element.dataset.id);
    else if (action === 'delete-session') confirmDeleteSession(element.dataset.id);
    else if (action === 'stop-propagation') event.stopPropagation();
    else if (action === 'update-temp-time') updateTempSessionItemTime(element.dataset.index);
    else if (action === 'remove-temp-item') removeTempSessionItem(element.dataset.index);
    else if (action === 'edit-artist') editArtistClick(element.dataset.id);
    else if (action === 'delete-artist') deleteArtistClick(element.dataset.id);
    else if (action === 'close-session-modal') closeSessionModal();
    else if (action === 'close-alert') closeModal(modalId);
    else return false;
    return true;
}

document.addEventListener('click', event => {
    const actionElement = event.target.closest('[data-action]');
    if (actionElement && dispatchDataAction(actionElement, event)) event.stopImmediatePropagation();
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    if (event.key === 'Enter' && actionElement.dataset.enterAction === 'confirm-custom-time') {
        confirmCustomTime(actionElement.dataset.id);
        event.preventDefault();
        return;
    }
    if (dispatchDataAction(actionElement, event)) event.preventDefault();
});

document.addEventListener('change', event => {
    const actionElement = event.target.closest('[data-action]');
    if (actionElement) dispatchDataAction(actionElement, event);
});

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modalTriggers.set(modalId, document.activeElement);
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
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
        const trigger = modalTriggers.get(modalId);
        if (trigger && typeof trigger.focus === 'function') {
            trigger.focus();
            modalTriggers.delete(modalId);
        }
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
        const instrument = FretLogData.getCurrentInstrument();

        const instElems = document.querySelectorAll('.user-instrument');
        const avatarElems = document.querySelectorAll('.user-avatar');

        instElems.forEach(el => el.textContent = instrument?.name || 'Guitar');
        avatarElems.forEach(el => {
            el.textContent = instrument?.icon || '🎸';
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
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `notification toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
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

// Keep keyboard focus inside the active modal and support Escape to close it.
document.addEventListener('keydown', (e) => {
    const modal = document.querySelector('.modal-overlay.active');
    if (!modal) return;

    if (e.key === 'Escape') {
        closeModal(modal.id);
        return;
    }

    if (e.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )].filter(element => !element.disabled && element.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
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
