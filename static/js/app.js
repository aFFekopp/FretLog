/**
 * FretLog - Dashboard Application Logic
 * Handles the main dashboard functionality including sessions
 */

// ==========================================
// Global State
// ==========================================
let sessionTimer = null;
let itemTimers = {};
let activeItemId = null;

// Motivational quotes for when no practice today
const MOTIVATIONAL_QUOTES = [
    "The only way to do great work is to love what you do. Pick up your instrument!",
    "Music is the soundtrack of your life. Make today's chapter count.",
    "Every expert was once a beginner. Start your practice now!",
    "Practice doesn't make perfect. Practice makes progress.",
    "Your future self will thank you for practicing today.",
    "The best time to practice was yesterday. The next best time is now.",
    "Music expresses that which cannot be said. Say something today!",
    "Small daily improvements lead to stunning results over time.",
    "Don't practice until you get it right. Practice until you can't get it wrong.",
    "A journey of a thousand songs begins with a single note.",
    "Your instrument misses you. Give it some attention today!",
    "The more you practice, the luckier you get.",
    "Music is what feelings sound like. Feel something today!",
    "Today's practice is tomorrow's performance.",
    "Even 10 minutes of practice is better than zero.",
    "You don't have to be great to start, but you have to start to be great.",
    "The secret to getting ahead is getting started.",
    "Make music, not excuses!",
    "Your skills are waiting to grow. Water them with practice.",
    "The stage is set, the spotlight awaits. Are you ready?"
];

function updateMotivationCard() {
    const card = document.getElementById('motivation-card');
    const quoteEl = document.getElementById('motivation-quote');
    if (!card || !quoteEl) return;

    // Check if user has practiced today
    const summary = FretLogData.getPracticeSummary();
    const practicedToday = (summary?.today || 0) > 0;

    if (practicedToday) {
        card.classList.add('hidden');
    } else {
        // Show card with random quote
        const randomQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
        quoteEl.textContent = `"${randomQuote}"`;
        card.classList.remove('hidden');
    }
}

// ==========================================
// Utility Functions
// ==========================================
// Utility Functions
function formatTime(ms) {
    return FretLogTimer.formatTime(ms);
}

function formatTimeHuman(ms) {
    return FretLogTimer.formatTimeHuman(ms);
}

// ==========================================
// User Info
// ==========================================
function updateUserInfo() {
    let user = FretLogData.getUser();

    // Fallback to localStorage cache if API data isn't ready yet
    if (!user) {
        try {
            const cached = localStorage.getItem('fretlog_user_cache');
            if (cached) user = JSON.parse(cached);
        } catch (e) {
            console.warn('Failed to parse cached user data', e);
        }
    }

    let instrument = FretLogData.getCurrentInstrument();
    // Fallback instrument lookup from cache
    if (!instrument && user && user.defaultInstrumentId) {
        try {
            const cachedInst = localStorage.getItem('fretlog_instruments_cache');
            if (cachedInst) {
                const instruments = JSON.parse(cachedInst);
                instrument = instruments.find(i => i.id === user.defaultInstrumentId);
            }
        } catch (e) { console.warn('Failed to parse cached instruments', e); }
    }

    const userName = document.getElementById('user-name');
    const userInstrument = document.getElementById('user-instrument');
    const userAvatar = document.getElementById('user-avatar');

    if (userName) userName.textContent = user?.name || 'Musician';
    if (userInstrument) userInstrument.textContent = instrument?.name || 'Guitar';
    if (userAvatar) userAvatar.textContent = (user?.name || 'M').charAt(0).toUpperCase();
}

// ==========================================
// Dashboard Stats
// ==========================================
function updateDashboardStats() {
    const summary = FretLogData.getPracticeSummary();
    const sessions = FretLogData.getSessions();
    const library = FretLogData.getLibraryItems();

    // Practice summary table
    document.getElementById('summary-today').textContent = formatTimeHuman(summary.today);
    document.getElementById('summary-week').textContent = formatTimeHuman(summary.week);
    document.getElementById('summary-month').textContent = formatTimeHuman(summary.month);
    document.getElementById('summary-year').textContent = formatTimeHuman(summary.year);
    document.getElementById('summary-alltime').textContent = formatTimeHuman(summary.allTime);

    // Quick stats
    document.getElementById('total-sessions').textContent = sessions.length;
    document.getElementById('library-items').textContent = library.length;

    // Average session time
    if (sessions.length > 0) {
        const avgTime = summary.allTime / sessions.length;
        document.getElementById('avg-session').textContent = formatTimeHuman(avgTime);
    }

    // Calculate streak
    const streak = calculateStreak();
    document.getElementById('streak-days').textContent = streak;
}

function calculateStreak() {
    const dailyTotals = FretLogData.getDailyTotals();
    const dates = Object.keys(dailyTotals).sort().reverse();

    if (dates.length === 0) return 0;

    let streak = 0;
    const today = FretLogData.formatDateKey(new Date());
    const yesterday = FretLogData.formatDateKey(new Date(Date.now() - 86400000));

    // Check if practiced today or yesterday
    if (dailyTotals[today] || dailyTotals[yesterday]) {
        let checkDate = dailyTotals[today] ? new Date() : new Date(Date.now() - 86400000);

        while (true) {
            const dateStr = FretLogData.formatDateKey(checkDate);
            if (dailyTotals[dateStr]) {
                streak++;
                checkDate = new Date(checkDate.getTime() - 86400000);
            } else {
                break;
            }
        }
    }

    return streak;
}

// ==========================================
// Recent Practice
// ==========================================
function updateRecentPractice() {
    const recentItems = FretLogData.getRecentPracticeItems(5);
    const list = document.getElementById('recent-practice-list');
    const emptyState = document.getElementById('no-recent-practice');

    if (recentItems.length === 0) {
        list.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    list.classList.remove('hidden');
    emptyState.classList.add('hidden');

    const categories = FretLogData.getCategories();

    list.innerHTML = recentItems.map(item => {
        const category = categories.find(c => c.id === (item.categoryId || item.category_id));
        const timeSpent = item.timeSpent || item.time_spent || 0;
        const categoryBadge = category ?
            `<span class="badge" style="background-color: ${category.color}1a; color: ${category.color}; border: 1px solid ${category.color}33; margin-left: var(--spacing-sm);">${category.icon} ${category.name}</span>` :
            '<span class="badge badge-secondary">Unknown Category</span>';

        // Format date: "Feb 6, 2026"
        const dateStr = new Date(item.sessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        return `
            <li class="practice-item">
                <div class="practice-item-info">
                    <span class="practice-item-name">
                        ${item.name}
                        ${categoryBadge}
                    </span>
                    <span class="practice-item-meta hidden-sm">${dateStr}</span>
                </div>
                <span class="practice-item-time">${formatTimeHuman(timeSpent)}</span>
            </li>
        `;
    }).join('');
}

// ==========================================
// Most Practiced
// ==========================================
function updateMostPracticed(period = 'month') {
    const items = FretLogData.getMostPracticedItems(period, 5);
    const list = document.getElementById('most-practiced-list');
    const emptyState = document.getElementById('no-most-practiced');

    if (items.length === 0) {
        list.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    list.classList.remove('hidden');
    emptyState.classList.add('hidden');

    const categories = FretLogData.getCategories();
    const libraryItems = FretLogData.getLibraryItems();

    list.innerHTML = items.map((item, index) => {
        const libraryItem = libraryItems.find(li => li.id === item.id);
        const category = categories.find(c => c.id === (libraryItem?.categoryId || libraryItem?.category_id));
        const categoryBadge = category ?
            `<span class="badge" style="background-color: ${category.color}1a; color: ${category.color}; border: 1px solid ${category.color}33; margin-left: var(--spacing-sm);">${category.icon} ${category.name}</span>` :
            '';

        return `
            <li class="practice-item">
                <div class="practice-item-info">
                    <span class="practice-item-name">
                        <span class="text-secondary" style="margin-right: 8px;">#${index + 1}</span>
                        ${item.name}
                        ${categoryBadge}
                    </span>
                </div>
                <span class="practice-item-time">${formatTimeHuman(item.totalTime)}</span>
            </li>
        `;
    }).join('');
}

// ==========================================
// Session Management
// ==========================================
async function startSession() {
    const user = FretLogData.getUser();
    const session = await FretLogData.startNewSession(user?.defaultInstrumentId);

    if (session) {
        showSessionPanel();
        startSessionTimer();
        updateSessionItemsList();
    }
}

function showSessionPanel() {
    const panel = document.getElementById('current-session-panel');
    const startBtn = document.getElementById('start-session-btn');
    const timeDisplay = document.getElementById('session-time-display');

    panel?.classList.remove('hidden');
    if (startBtn) startBtn.textContent = 'Session Active';
    startBtn?.setAttribute('disabled', 'true');
    // timeDisplay?.classList.remove('hidden');

    // Update instrument badge
    const instrument = FretLogData.getCurrentInstrument();
    const badge = document.getElementById('session-instrument-badge');
    if (badge) badge.textContent = instrument?.name || 'Guitar';
}

function hideSessionPanel() {
    const panel = document.getElementById('current-session-panel');
    const startBtn = document.getElementById('start-session-btn');
    const timeDisplay = document.getElementById('session-time-display');

    panel?.classList.add('hidden');
    if (startBtn) {
        startBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Start Practice
        `;
        startBtn.removeAttribute('disabled');
    }
    // timeDisplay?.classList.add('hidden');
}

function startSessionTimer() {
    const session = FretLogData.getCurrentSession();
    if (!session) return;

    // Use a unique ID for the session timer interval, but don't base it on start time
    // We just want a periodic update for the UI
    FretLogTimer.start('session-ui-update', () => {
        const session = FretLogData.getCurrentSession();
        if (!session || !session.items) return;

        // Calculate total time from all items
        let totalMs = 0;

        session.items.forEach(item => {
            // If this is the active item, use the live timer which includes stored time
            if (activeItemId === item.id) {
                const elapsed = FretLogTimer.getElapsed(`item-${item.id}`);
                // console.log(`Active item ${item.name}: elapsed ${elapsed}`);
                totalMs += elapsed;
            } else {
                // Otherwise use the stored time
                totalMs += (item.timeSpent || item.time_spent || 0);
            }
        });

        const timerDisplay = document.getElementById('session-timer');
        const activeSessionRowTime = document.getElementById('active-session-total-time');
        // const combinedDisplay = document.getElementById('combined-session-time');

        if (timerDisplay) timerDisplay.textContent = formatTime(totalMs);

        // Also update the active session row in sessions table if present
        if (activeSessionRowTime) {
            // Use formatTimeHuman style (e.g. "1h 5m" or just minutes/seconds)
            // Use FretLogTimer.formatDuration for HH:MM:SS format
            activeSessionRowTime.textContent = FretLogTimer.formatDuration(totalMs);
        }

        // if (combinedDisplay) combinedDisplay.textContent = FretLogTimer.formatSessionTime(totalMs);
    });
}

function updateSessionItemsList() {
    const session = FretLogData.getCurrentSession();
    const list = document.getElementById('session-items-list');
    const emptyState = document.getElementById('session-no-items');

    if (!list) return;

    if (!session || !session.items || session.items.length === 0) {
        list.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }

    emptyState?.classList.add('hidden');

    const categories = FretLogData.getCategories();

    list.innerHTML = session.items.map(item => {
        const category = categories.find(c => c.id === (item.categoryId || item.category_id));
        const isActive = activeItemId === item.id;
        const timeSpent = item.timeSpent || item.time_spent || 0;

        return `
            <li class="practice-list-item practice-item ${isActive ? 'active' : ''}" data-item-id="${item.id}">
                <div class="practice-item-actions" style="margin-right: var(--spacing-sm); width: 70px; flex-shrink: 0; justify-content: center;">
                    ${isActive ?
                `<button class="btn btn-secondary btn-sm" onclick="pauseItem('${item.id}')" style="width: 100%;">Pause</button>` :
                `<button class="btn btn-primary btn-sm" onclick="playItem('${item.id}')" style="width: 100%;">Play</button>`
            }
                </div>
                <span class="badge" style="background-color: ${category?.color}1a; color: ${category?.color}; border: 1px solid ${category?.color}33; margin-right: var(--spacing-sm);">${category?.icon || '🎵'} ${category?.name || 'Unknown'}</span>
                <div class="practice-item-info">
                    <span class="practice-item-name">${item.name}</span>
                </div>
                <span class="practice-item-time" id="item-time-${item.id}" style="margin-left: auto; margin-right: var(--spacing-md);">${FretLogTimer.formatDuration(timeSpent)}</span>
                <div class="practice-item-actions">
                    <button class="btn btn-ghost btn-sm" onclick="removeSessionItem('${item.id}')">×</button>
                </div>
            </li>
        `;
    }).join('');
}

// Helper to toggle global pause button visibility and state
function updateGlobalHeaderUI(visible, isPlaying = true, itemName = '', timeText = '') {
    const btn = document.getElementById('global-pause-btn');
    const infoEl = document.getElementById('global-active-item-info');
    const nameEl = document.getElementById('global-active-item-name');
    const timerEl = document.getElementById('global-active-item-timer');

    if (btn) {
        if (visible) {
            btn.classList.remove('hidden');
            // Update icon
            if (isPlaying) {
                btn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="4" width="4" height="16"></rect>
                        <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>`;
                btn.title = "Pause Item";
            } else {
                btn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>`;
                btn.title = "Resume Item";
            }
        } else {
            btn.classList.add('hidden');
        }
    }

    if (infoEl) {
        if (visible && itemName) {
            nameEl.textContent = itemName;
            if (timerEl && timeText) timerEl.textContent = timeText;
            infoEl.classList.remove('hidden');
        } else {
            infoEl.classList.add('hidden');
        }
    }
}

// Global variable to track the last active item for resuming
let lastActiveItemId = null;

// Toggle timer from global header button
async function toggleGlobalTimer() {
    if (activeItemId) {
        // Something is running, so pause it
        await pauseItem(activeItemId);
    } else if (lastActiveItemId) {
        // Nothing running, but we have a memory of what was running, so resume it
        const session = FretLogData.getCurrentSession();
        if (session && session.items && session.items.find(i => i.id === lastActiveItemId)) {
            await playItem(lastActiveItemId);
        } else {
            // cleanup if item is gone
            lastActiveItemId = null;
            updateGlobalHeaderUI(false);
        }
    }
}

async function playItem(itemId, restoredStartTime = null) {
    // Pause any currently active item
    if (activeItemId && activeItemId !== itemId) {
        await pauseItem(activeItemId);
    }

    activeItemId = itemId;
    lastActiveItemId = null; // Clear "last active" since we are now active

    const session = FretLogData.getCurrentSession();
    const item = session?.items?.find(i => i.id === itemId);

    if (item) {
        // Show initial state with time (if exists) or 0
        const currentTimeSpent = item.timeSpent || item.time_spent || 0;
        updateGlobalHeaderUI(true, true, item.name, FretLogTimer.formatDuration(currentTimeSpent));

        // Use restored start time if available, otherwise calculate from current time
        const startTime = restoredStartTime || (Date.now() - currentTimeSpent);

        // Persist state for restoration
        localStorage.setItem('fretlog_active_item', itemId);
        localStorage.setItem('fretlog_start_time', startTime.toString());

        // Only update display every second, NOT the database (to avoid locking)
        FretLogTimer.start(`item-${itemId}`, (elapsed) => {
            const formattedTime = FretLogTimer.formatDuration(elapsed);

            // Update item card timer
            const timeDisplay = document.getElementById(`item-time-${itemId}`);
            if (timeDisplay) timeDisplay.textContent = formattedTime;

            // Update global header timer
            const globalTimerEl = document.getElementById('global-active-item-timer');
            if (globalTimerEl) globalTimerEl.textContent = formattedTime;

            // Track elapsed in memory for later save
            itemTimers[itemId] = elapsed;
        }, startTime);
    }

    updateSessionItemsList();

    // Dispatch event for other pages to update (e.g., sessions table)
    window.dispatchEvent(new CustomEvent('fretlog-session-updated'));
}

async function pauseItem(itemId) {
    FretLogTimer.stop(`item-${itemId}`);

    // Remember this item so we can resume it
    lastActiveItemId = itemId;

    const session = FretLogData.getCurrentSession();
    const item = session?.items?.find(i => i.id === itemId);

    // Get elapsed time
    const elapsed = itemTimers[itemId] || 0;
    const formattedTime = FretLogTimer.formatDuration(elapsed);

    // Update UI to show "Resume" state
    if (item) {
        updateGlobalHeaderUI(true, false, item.name, formattedTime);
    } else {
        updateGlobalHeaderUI(false);
    }

    // Clear timer persistence, but KEEP active item persistence so it restores as paused
    // localStorage.removeItem('fretlog_active_item'); 
    localStorage.removeItem('fretlog_start_time');

    // Now save to database (only happens on pause, not every second)
    await FretLogData.updateSessionItemTime(itemId, elapsed);

    if (activeItemId === itemId) {
        activeItemId = null;
    }

    updateSessionItemsList();

    // Dispatch event for other pages to update (e.g., sessions table)
    window.dispatchEvent(new CustomEvent('fretlog-session-updated'));
}



// Restore session state including active timers
async function restoreActiveSessionState() {
    const currentSession = FretLogData.getCurrentSession();
    if (currentSession) {
        // Always try to show panel and start timer loop if a session exists
        showSessionPanel();
        startSessionTimer();
        updateSessionItemsList();

        // Check persistence
        const savedItemId = localStorage.getItem('fretlog_active_item');
        const savedStartTime = localStorage.getItem('fretlog_start_time');

        if (savedItemId) {
            // Verify item still exists in session
            const item = currentSession.items.find(i => i.id === savedItemId);
            if (item) {
                if (savedStartTime) {
                    // It was running -> Resume
                    await playItem(savedItemId, parseInt(savedStartTime));
                } else {
                    // It was paused -> Show in paused state
                    const currentTimeSpent = item.timeSpent || item.time_spent || 0;
                    updateGlobalHeaderUI(true, false, item.name, FretLogTimer.formatDuration(currentTimeSpent));
                    lastActiveItemId = savedItemId;
                }
            } else {
                // Clean up stale data if item not found
                localStorage.removeItem('fretlog_active_item');
                localStorage.removeItem('fretlog_start_time');
                updateGlobalHeaderUI(false);
            }
        }
    }
}

// Initialize when data is ready
window.addEventListener('fretlog-data-ready', () => {
    initDashboard();
});

// Make functions globally available
window.startSession = startSession;
function dummyRestOfFile() { } // Just to match range if needed but let's be precise
window.playItem = playItem;
window.pauseItem = pauseItem;
window.removeSessionItem = removeSessionItem;
window.endSession = endSession;
window.toggleGlobalTimer = toggleGlobalTimer;

async function removeSessionItem(itemId) {
    if (activeItemId === itemId) {
        FretLogTimer.stop(`item-${itemId}`);
        activeItemId = null;
        updateGlobalHeaderUI(false);
    }

    if (lastActiveItemId === itemId) {
        lastActiveItemId = null;
        updateGlobalHeaderUI(false);
    }

    const session = FretLogData.getCurrentSession();
    if (session) {
        session.items = session.items.filter(i => i.id !== itemId);
        await FretLogData.saveCurrentSession(session);
        updateSessionItemsList();
    }
}

async function endSession() {
    // Pause any active item first to save its time
    if (activeItemId) {
        await pauseItem(activeItemId);
    }

    const session = FretLogData.getCurrentSession();
    const cancelModalBody = document.querySelector('#cancel-session-modal .modal-body');

    // Calculate total time from items first
    let totalMs = 0;
    if (session && session.items) {
        session.items.forEach(item => {
            if (activeItemId === item.id) {
                totalMs += FretLogTimer.getElapsed(`item-${item.id}`);
            } else {
                totalMs += (item.timeSpent || item.time_spent || 0);
            }
        });
    }

    if (!session || !session.items || session.items.length === 0) {
        if (cancelModalBody) {
            cancelModalBody.innerHTML = `
                <p>This session has no practice items.</p>
                <p class="text-secondary mt-sm">Do you want to cancel this session without saving?</p>`;
        }
        openModal('cancel-session-modal');
        return;
    }

    if (totalMs <= 0) {
        if (cancelModalBody) {
            cancelModalBody.innerHTML = `
                <p>Total practice time is 0 minutes.</p>
                <p class="text-secondary mt-sm">Do you want to cancel this session without saving?</p>`;
        }
        openModal('cancel-session-modal');
        return;
    }

    // Update end session modal info
    document.getElementById('end-session-time').textContent = formatTime(totalMs);
    document.getElementById('end-session-items').textContent = session.items.length;

    // Sync notes from dashboard to modal
    const dashboardNotes = document.getElementById('session-notes')?.value || '';
    const modalNotes = document.getElementById('end-session-notes');
    if (modalNotes) modalNotes.value = dashboardNotes;

    openModal('end-session-modal');
}

async function confirmEndSession() {
    // Stop all timers
    if (activeItemId) {
        await pauseItem(activeItemId);
    }
    FretLogTimer.stop('session');

    // Capture final notes and update current session
    const finalNotes = document.getElementById('end-session-notes')?.value || '';
    // End and save the session
    await FretLogData.endCurrentSession(finalNotes);

    // Clear notes field on dashboard 
    const dashboardNotes = document.getElementById('session-notes');
    if (dashboardNotes) dashboardNotes.value = '';

    closeModal('end-session-modal');
    closeModal('end-session-modal');
    hideSessionPanel();

    lastActiveItemId = null;

    // Clear persistence
    localStorage.removeItem('fretlog_active_item');
    localStorage.removeItem('fretlog_start_time');

    updateGlobalHeaderUI(false);

    // Refresh dashboard
    updateDashboardStats();
    updateRecentPractice();
    updateMostPracticed();
}

async function cancelSession() {
    FretLogTimer.stopAll();
    activeItemId = null;

    // Clear persistence
    localStorage.removeItem('fretlog_active_item');
    localStorage.removeItem('fretlog_start_time');

    await FretLogData.cancelCurrentSession();

    // Clear notes field on dashboard 
    const dashboardNotes = document.getElementById('session-notes');
    if (dashboardNotes) dashboardNotes.value = '';

    closeModal('cancel-session-modal');
    hideSessionPanel();
}

// ==========================================
// Add Item Modal
// ==========================================
function openAddItemModal() {
    const categories = FretLogData.getCategories();
    const categorySelect = document.getElementById('add-item-category');

    categorySelect.innerHTML = categories.map(c =>
        `<option value="${c.id}">${c.icon} ${c.name}</option>`
    ).join('');

    updateAddItemCategory();
    openModal('add-item-modal');
}

function updateAddItemCategory() {
    const categoryId = document.getElementById('add-item-category').value;
    const category = FretLogData.getCategories().find(c => c.id === categoryId);
    const artistGroup = document.getElementById('add-item-artist-group');

    // Show artist filter for songs
    if (category?.type === 'Song') {
        artistGroup?.classList.remove('hidden');
        populateArtistFilter();
    } else {
        artistGroup?.classList.add('hidden');
    }

    populateItemSelect();
}

function populateArtistFilter() {
    const artists = FretLogData.getArtists().sort((a, b) => a.name.localeCompare(b.name));
    const select = document.getElementById('add-item-artist');

    select.innerHTML = '<option value="">All Artists</option>' +
        artists.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

function populateItemSelect() {
    const categoryId = document.getElementById('add-item-category').value;
    const artistId = document.getElementById('add-item-artist')?.value || '';

    let items = FretLogData.getLibraryItemsByCategory(categoryId);

    // Filter by artist if selected
    if (artistId) {
        items = items.filter(i => (i.artistId || i.artist_id) === artistId);
    }

    // Filter out items already in current session
    const currentSession = FretLogData.getCurrentSession();
    if (currentSession && currentSession.items) {
        const existingItemIds = new Set(currentSession.items.map(i => i.libraryItemId || i.library_item_id));
        items = items.filter(i => !existingItemIds.has(i.id));
    }

    // Get all sessions and find the latest date for each unique library item
    const sessions = FretLogData.getSessions();
    const itemLastUsed = {};

    sessions.forEach(session => {
        const sessionDate = new Date(session.endTime || session.date).getTime();
        (session.items || []).forEach(item => {
            const libId = item.libraryItemId || item.library_item_id;
            if (!itemLastUsed[libId] || sessionDate > itemLastUsed[libId]) {
                itemLastUsed[libId] = sessionDate;
            }
        });
    });

    // Identify the global top 10 most recently used items
    const topRecentIds = new Set(
        Object.entries(itemLastUsed)
            .sort((a, b) => b[1] - a[1]) // Sort by date descending
            .slice(0, 10)
            .map(entry => entry[0])
    );

    items.sort((a, b) => {
        const isATop = topRecentIds.has(a.id);
        const isBTop = topRecentIds.has(b.id);

        if (isATop && isBTop) {
            return itemLastUsed[b.id] - itemLastUsed[a.id]; // Both top 10, newest first
        }
        if (isATop) return -1; // Only A is top 10, A first
        if (isBTop) return 1;  // Only B is top 10, B first

        // Fallback to alphabetical for everything else
        return a.name.localeCompare(b.name);
    });

    const select = document.getElementById('add-item-select');
    const newItemGroup = document.getElementById('add-new-item-group');

    if (items.length === 0) {
        select.innerHTML = '<option value="">No items in this category</option>';
        newItemGroup?.classList.remove('hidden');
    } else {
        select.innerHTML = '<option value="">Select an item...</option>' +
            items.map(i => `<option value="${i.id}">${i.name}${topRecentIds.has(i.id) ? ' (Recent)' : ''}</option>`).join('');
        newItemGroup?.classList.add('hidden');
    }
}

async function confirmAddItem() {
    const itemId = document.getElementById('add-item-select').value;

    if (!itemId) {
        return;
    }

    await FretLogData.addItemToCurrentSession(itemId, 0);
    closeModal('add-item-modal');
    updateSessionItemsList();
}

// ==========================================
// Instrument Modal
// ==========================================// Instrument Modal
function openChangeInstrumentModal() {
    const instruments = FretLogData.getInstruments();
    const user = FretLogData.getUser();
    const select = document.getElementById('select-instrument');

    if (!select) return;

    select.innerHTML = instruments.map(i =>
        `<option value="${i.id}" ${i.id === user?.defaultInstrumentId ? 'selected' : ''}>${i.icon} ${i.name}</option>`
    ).join('');

    openModal('change-instrument-modal');
}

async function confirmInstrument() {
    const instrumentId = document.getElementById('select-instrument').value;
    const user = FretLogData.getUser();

    if (user) {
        user.defaultInstrumentId = instrumentId;
        await FretLogData.saveUser(user);
        updateUserInfo();

        // If a session is active, update its instrument too
        const currentSession = FretLogData.getCurrentSession();
        if (currentSession) {
            currentSession.instrumentId = instrumentId;
            await FretLogData.saveCurrentSession(currentSession);

            // Update session panel badge
            const instruments = FretLogData.getInstruments();
            const selected = instruments.find(i => i.id === instrumentId);
            const badge = document.getElementById('session-instrument-badge');
            if (badge) badge.textContent = selected?.name || 'Guitar';
        }
    }

    closeModal('change-instrument-modal');
}

// ==========================================
// Event Listeners & Initialization
// ==========================================
function setupEventListeners() {
    // Start session button
    document.getElementById('start-session-btn')?.addEventListener('click', startSession);

    // Add item button (in session)
    document.getElementById('add-item-btn')?.addEventListener('click', openAddItemModal);

    // End session button
    document.getElementById('end-session-btn')?.addEventListener('click', endSession);

    // Confirm end session
    document.getElementById('confirm-end-session')?.addEventListener('click', confirmEndSession);

    // Confirm cancel session
    document.getElementById('confirm-cancel-session')?.addEventListener('click', cancelSession);

    // Add item modal - category change
    document.getElementById('add-item-category')?.addEventListener('change', updateAddItemCategory);

    // Add item modal - artist change
    document.getElementById('add-item-artist')?.addEventListener('change', populateItemSelect);

    // Confirm add item
    document.getElementById('confirm-add-item')?.addEventListener('click', confirmAddItem);

    // Change instrument
    document.getElementById('change-instrument-btn')?.addEventListener('click', openChangeInstrumentModal);

    // Confirm instrument
    document.getElementById('confirm-instrument')?.addEventListener('click', confirmInstrument);

    // Auto-resize textareas
    initAutoResizeTextareas();

    // Most practiced period selector
    document.getElementById('most-practiced-period')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.period-btn');
        if (btn) {
            document.querySelectorAll('#most-practiced-period .period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateMostPracticed(btn.dataset.period);
        }
    });

    // User dropdown
    document.getElementById('user-dropdown')?.addEventListener('click', function (e) {
        if (!e.target.closest('.dropdown-menu')) {
            this.classList.toggle('active');
        }
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
        }
    });

    // Auto-resize textareas
    initAutoResizeTextareas();
}

async function initAutoResizeTextareas() {
    const textareas = document.querySelectorAll('.form-textarea');
    textareas.forEach(textarea => {
        // Initial resize
        autoResizeTextarea(textarea);

        // Resize on input
        textarea.addEventListener('input', () => autoResizeTextarea(textarea));
    });
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

async function renderDashboard() {
    updateUserInfo();

    // Safety checks for dashboard-specific elements
    if (document.getElementById('summary-today')) {
        updateDashboardStats();
    }

    if (document.getElementById('recent-practice-list')) {
        updateRecentPractice();
    }

    if (document.getElementById('most-practiced-list')) {
        updateMostPracticed();
    }

    updateMotivationCard();

    // Check for existing session and restore state
    await restoreActiveSessionState();
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup listeners immediately
    setupEventListeners();

    // 2. Start init (loads cache synchronously, starts network fetch)
    const initPromise = FretLogData.init();

    // 3. Render cached data immediately
    await renderDashboard();

    // 4. Wait for fresh data
    await initPromise;

    // 5. Render fresh data
    await renderDashboard();
});

// Make functions globally available
window.startSession = startSession;
window.openModal = openModal;
window.closeModal = closeModal;
window.playItem = playItem;
window.pauseItem = pauseItem;
window.removeSessionItem = removeSessionItem;
window.endSession = endSession;
window.confirmEndSession = confirmEndSession;
window.cancelSession = cancelSession;
window.confirmAddItem = confirmAddItem;
window.openChangeInstrumentModal = openChangeInstrumentModal;
window.openAddItemModal = openAddItemModal;
