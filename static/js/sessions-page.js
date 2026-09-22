    // ==========================================
    // Sessions Page Logic
    // ==========================================

    window.currentPage = 1;
    const itemsPerPage = 10;
    window.filteredSessions = [];
    let tempSessionItems = [];
    let viewingSessionId = null;
    let deletingSessionId = null;

    // Table Date/Time Formatters
    function formatTableDate(dateStr) {
        if (!dateStr) return 'N/A';
        const d = (typeof dateStr === 'string' && !isNaN(dateStr)) ? new Date(parseInt(dateStr)) : new Date(dateStr);
        if (isNaN(d.getTime())) return 'Invalid Date';
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function formatTableTime(dateStr) {
        if (!dateStr) return '--:--';
        const d = (typeof dateStr === 'string' && !isNaN(dateStr)) ? new Date(parseInt(dateStr)) : new Date(dateStr);
        if (isNaN(d.getTime())) return 'NaN:NaN';
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        const d = (typeof dateStr === 'string' && !isNaN(dateStr)) ? new Date(parseInt(dateStr)) : new Date(dateStr);
        if (isNaN(d.getTime())) return 'Invalid Date';
        return d.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function toggleItemMenu(e, btn) {
        e.stopPropagation();
        const menu = btn.parentElement; // The .dropdown div
        const currentActive = menu.classList.contains('active');

        // Close all other dropdowns
        document.querySelectorAll('.dropdown.active').forEach(d => {
            d.classList.remove('active');
            const item = d.closest('.library-list-item');
            if (item) item.classList.remove('active-dropdown');
        });

        // Toggle current
        if (!currentActive) {
            menu.classList.add('active');
            const item = menu.closest('.library-list-item');
            if (item) item.classList.add('active-dropdown');
        }
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        // Don't close if clicking user profile dropdown
        if (e.target.closest('#user-dropdown')) return;

        document.querySelectorAll('.dropdown.active').forEach(d => {
            d.classList.remove('active');
            const item = d.closest('.library-list-item');
            if (item) item.classList.remove('active-dropdown');
        });
    });

    // Instrument hook for base.html
    window.onInstrumentChange = () => {
        filterSessions();
    };

    // Populate filter dropdowns
    function populateFilters() {
        const instruments = FretLogData.getInstruments();
        const instrumentSelect = document.getElementById('filter-instrument');
        if (instrumentSelect) {
            instrumentSelect.innerHTML = '<option value="">All Instruments</option>' +
                instruments.map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.icon)} ${escapeHtml(i.name)}</option>`).join('');
        }
    }

    // Filter and sort sessions
    function filterSessions() {
        window.currentPage = 1;
        let sessions = [...FretLogData.getSessions()];

        // Add current session if valid
        const currentSession = FretLogData.getCurrentSession();
        if (currentSession) {
            const activeItem = localStorage.getItem('fretlog_active_item');
            const startTimeString = localStorage.getItem('fretlog_start_time');
            const status = activeItem && startTimeString ? 'Running' : 'Paused';

            // Calculate current live total time to avoid 0s flicker
            let liveTotalTime = 0;
            if (currentSession.items) {
                currentSession.items.forEach(item => {
                    if (activeItem === item.id && startTimeString) {
                        const startTime = parseInt(startTimeString);
                        liveTotalTime += (Date.now() - startTime);
                    } else {
                        liveTotalTime += (item.timeSpent || item.time_spent || 0);
                    }
                });
            }

            const displaySession = {
                ...currentSession,
                status: status,
                isCurrent: true,
                totalTime: liveTotalTime,
                totalTimeElementId: 'active-session-total-time'
            };
            sessions.unshift(displaySession);
        }

        // Filters logic
        const startDate = document.getElementById('filter-date-start').value;
        const endDate = document.getElementById('filter-date-end').value;
        if (startDate) sessions = sessions.filter(s => new Date(s.date) >= new Date(startDate));
        if (endDate) sessions = sessions.filter(s => new Date(s.date) <= new Date(endDate + 'T23:59:59'));

        const instrumentId = document.getElementById('filter-instrument').value;
        if (instrumentId) sessions = sessions.filter(s => s.instrumentId === instrumentId);

        sessions.sort((a, b) => new Date(b.endTime || b.date) - new Date(a.endTime || a.date));

        window.filteredSessions = sessions;
        renderSessions();
    }

    // Render sessions list
    function renderSessions() {
        const container = document.getElementById('sessions-container');
        const emptyState = document.getElementById('no-sessions');
        const pagination = document.getElementById('pagination');

        if (window.filteredSessions.length === 0) {
            container.classList.add('hidden');
            emptyState.classList.remove('hidden');
            pagination.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        emptyState.classList.add('hidden');

        const totalPages = Math.ceil(window.filteredSessions.length / itemsPerPage);
        const start = (window.currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginated = window.filteredSessions.slice(start, end);

        const instruments = FretLogData.getInstruments();

        container.innerHTML = paginated.map(session => {
            const instrumentId = session.instrumentId || session.instrument_id;
            const instrument = instruments.find(i => i.id === instrumentId);
            const itemCount = (session.items || []).length;
            const statusLabel = session.status || 'completed';
            const statusClass = statusLabel === 'completed' ? 'success' :
                statusLabel === 'Running' ? 'primary' :
                    statusLabel === 'Paused' ? 'warning' : 'secondary';

            return `
            <div class="library-list-item" style="cursor: pointer; padding-left: var(--spacing-md); padding-top: 10px; padding-bottom: 10px;" data-action="view-session" data-id="${escapeHtml(session.id)}">
                <div class="item-info">
                    <div class="flex items-center gap-md flex-wrap">
                        <div class="flex items-center gap-sm">
                            <span class="font-bold text-primary">${formatTableDate(session.endTime || session.date)}</span>
                            <span class="text-secondary" style="font-size: 0.85rem;">at ${formatTableTime(session.endTime || session.date)}</span>
                        </div>
                        <div class="flex items-center gap-sm">
                            <span style="font-size: 0.9rem;">${escapeHtml(instrument?.icon || '🎸')} ${escapeHtml(instrument?.name || 'Unknown')}</span>
                            <span class="badge badge-secondary" style="font-size: 0.7rem; padding: 1px 6px;">${itemCount} items</span>
                            <span class="badge badge-${statusClass}" style="font-size: 0.7rem; padding: 1px 6px;">${statusLabel}</span>
                            ${session.notes ? `
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5;">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                </svg>
                            ` : ''}
                        </div>
                    </div>
                </div>
                <div class="time-column text-right">
                    <div class="item-time" ${session.totalTimeElementId ? `id="${session.totalTimeElementId}"` : ''}>
                        ${FretLogTimer.formatDuration(session.totalTime || 0)}
                    </div>
                </div>
                ${session.isCurrent ? `
                    <a href="/" class="btn btn-primary btn-sm dashboard-link-btn" style="margin-left: var(--spacing-sm); white-space: nowrap;">Go to Dashboard</a>
                ` : `
                <div class="dropdown" style="margin-left: var(--spacing-sm);" data-action="stop-propagation">
                    <button class="btn btn-ghost btn-icon btn-sm" aria-label="Session actions" title="Session actions" style="width: 28px; height: 28px; padding: 0;" data-action="toggle-item-menu">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1" />
                            <circle cx="12" cy="5" r="1" />
                            <circle cx="12" cy="19" r="1" />
                        </svg>
                    </button>
                    <div class="dropdown-menu">
                        <div class="dropdown-item" data-action="view-session" data-id="${escapeHtml(session.id)}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            View
                        </div>
                        <div class="dropdown-item" data-action="edit-session" data-id="${escapeHtml(session.id)}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Edit
                        </div>
                        <div class="dropdown-item text-danger" data-action="delete-session" data-id="${escapeHtml(session.id)}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                            Delete
                        </div>
                    </div>
                </div>`}
            </div>`;
        }).join('');

        if (window.filteredSessions.length > itemsPerPage) {
            pagination.classList.remove('hidden');
            document.getElementById('pagination-info').textContent = `Showing ${start + 1}-${Math.min(end, window.filteredSessions.length)} of ${window.filteredSessions.length}`;
            document.getElementById('prev-page').disabled = window.currentPage === 1;
            document.getElementById('next-page').disabled = window.currentPage === totalPages;
        } else {
            pagination.classList.add('hidden');
        }
    }

    // Modals & Actions
    function viewSession(sessionId) {
        const session = FretLogData.getSessions().find(s => s.id === sessionId);
        if (!session) return;

        document.querySelector('#view-session-modal .modal-title').textContent = 'Session Details';
        viewingSessionId = sessionId;

        const instrumentId = session.instrumentId || session.instrument_id;
        const instrument = FretLogData.getInstruments().find(i => i.id === instrumentId);
        const categories = FretLogData.getCategories();

        document.getElementById('view-session-content').innerHTML = `
        <div class="mb-lg"><p class="text-secondary">Date</p><p>${formatDate(session.date)}</p></div>
        <div class="mb-lg"><p class="text-secondary">Instrument</p><p>${escapeHtml(instrument?.icon || '🎸')} ${escapeHtml(instrument?.name || 'Unknown')}</p></div>
        <div class="mb-lg"><p class="text-secondary">Total Time</p><p>${formatTimeHuman(session.totalTime || 0)}</p></div>
        <div class="mb-lg"><p class="text-secondary mb-sm">Items Practiced</p>
          ${session.items?.length ? `
            <ul class="practice-list">${session.items.map(item => {
            const catId = item.categoryId || item.category_id;
            const cat = categories.find(c => c.id === catId);
            return `<li class="practice-item">
                    <span class="badge" style="background:${cat?.color}1a; color:${cat?.color}; border:1px solid ${cat?.color}33;">${cat?.icon || '🎵'} ${cat?.name || 'Unknown Category'}</span>
                    <div class="practice-item-info"><span class="practice-item-name">${escapeHtml(item.name)}</span></div>
                    <span class="practice-item-time">${formatTimeHuman(item.timeSpent || 0)}</span>
                </li>`;
        }).join('')}</ul>` : '<p class="text-secondary">No items recorded</p>'}
        </div>
        ${session.notes ? `<div><p class="text-secondary mb-sm">Notes</p><p>${escapeHtml(session.notes)}</p></div>` : ''}`;
        openModal('view-session-modal');
    }

    function viewSessionNote(sessionId) {
        const session = FretLogData.getSessions().find(s => s.id === sessionId);
        if (!session) return;
        viewingSessionId = sessionId;
        document.querySelector('#view-session-modal .modal-title').textContent = 'Session Note';
        document.getElementById('view-session-content').innerHTML = `
            <div class="mb-lg">
                <p class="text-secondary mb-sm">Date: ${formatTableDate(session.endTime || session.date)}</p>
                <div style="padding:var(--spacing-lg); background:rgba(255,255,255,0.03); border-radius:var(--radius-md); border-left:4px solid var(--color-primary);">
                    <p style="white-space:pre-wrap; margin:0;">${escapeHtml(session.notes || 'No notes.')}</p>
                </div>
            </div>`;
        openModal('view-session-modal');
    }

    function openSessionModal(session = null) {
        const isEdit = !!session;
        document.getElementById('session-modal-title').textContent = isEdit ? 'Edit Session' : 'Add Session';
        document.getElementById('edit-session-id').value = session?.id || '';
        document.getElementById('session-error').classList.add('hidden');

        const dateObj = session ? new Date(session.endTime || session.date) : new Date();
        const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

        if (document.getElementById('session-date')._flatpickr) {
            document.getElementById('session-date')._flatpickr.setDate(dateObj);
        }
        if (document.getElementById('session-time')._flatpickr) {
            document.getElementById('session-time')._flatpickr.setDate(timeStr, true);
        }

        const instruments = FretLogData.getInstruments();
        const user = FretLogData.getUser();
        const preselectedId = session?.instrumentId || session?.instrument_id || document.getElementById('filter-instrument')?.value || user?.defaultInstrumentId;

        document.getElementById('session-instrument').innerHTML = instruments.map(i =>
            `<option value="${escapeHtml(i.id)}" ${preselectedId === i.id ? 'selected' : ''}>${escapeHtml(i.icon)} ${escapeHtml(i.name)}</option>`
        ).join('');

        tempSessionItems = session?.items ? [...session.items] : [];
        renderTempSessionItems();

        const notesInput = document.getElementById('session-notes-input');
        notesInput.value = session?.notes || '';
        autoResizeTextarea(notesInput);
        openModal('session-modal');
    }

    function closeSessionModal() {
        closeModal('session-modal');
        tempSessionItems = [];
    }

    function renderTempSessionItems() {
        const container = document.getElementById('session-items-container');
        const emptyState = document.getElementById('no-session-items');
        if (tempSessionItems.length === 0) {
            container.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }
        emptyState.classList.add('hidden');
        const categories = FretLogData.getCategories();
        container.innerHTML = tempSessionItems.map((item, index) => {
            const cat = categories.find(c => c.id === item.categoryId);
            const hVal = Math.floor((item.timeSpent || 0) / 3600000);
            const mVal = Math.floor(((item.timeSpent || 0) % 3600000) / 60000);
            return `
          <div class="practice-item" style="background:var(--bg-secondary); border-radius:var(--radius-md); margin-bottom:var(--spacing-sm);">
            <div class="practice-item-info"><span class="practice-item-name">${escapeHtml(cat?.icon || '🎵')} ${escapeHtml(item.name)}</span></div>
            <div class="flex items-center gap-sm">
              <input type="number" class="form-input custom-time-no-spin" id="tmp-h-${index}"
                     style="width:52px; text-align:center;" value="${hVal}" min="0" max="23"
                      data-action="update-temp-time" data-index="${index}">
              <span class="text-secondary" style="font-size:0.8rem;">h</span>
              <input type="number" class="form-input custom-time-no-spin" id="tmp-m-${index}"
                     style="width:52px; text-align:center;" value="${mVal}" min="0" max="59"
                      data-action="update-temp-time" data-index="${index}">
              <span class="text-secondary" style="font-size:0.8rem;">m</span>
              <button class="btn btn-ghost btn-sm text-danger" data-action="remove-temp-item" data-index="${index}">×</button>
            </div>
          </div>`;
        }).join('');
    }

    function updateTempSessionItemTime(index) {
        const item = tempSessionItems[Number(index)];
        if (!item) return;
        const hours = parseInt(document.getElementById(`tmp-h-${index}`).value) || 0;
        const minutes = parseInt(document.getElementById(`tmp-m-${index}`).value) || 0;
        item.timeSpent = hours * 3600000 + minutes * 60000;
    }

    function removeTempSessionItem(index) {
        tempSessionItems.splice(Number(index), 1);
        renderTempSessionItems();
    }

    function openSessionAddItemModal() {
        const categories = FretLogData.getCategories();
        document.getElementById('item-category-select').innerHTML = categories.map(c =>
            `<option value="${escapeHtml(c.id)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('');
        updateSessionItemOptions();
        document.getElementById('item-time-h').value = '0';
        document.getElementById('item-time-m').value = '0';
        openModal('session-item-modal');
    }

    function updateSessionItemOptions() {
        const categoryId = document.getElementById('item-category-select').value;
        let items = FretLogData.getLibraryItemsByCategory(categoryId);
        const existingIds = new Set(tempSessionItems.map(i => i.libraryItemId || i.library_item_id));
        items = items.filter(i => !existingIds.has(i.id));

        // Sort items alphabetically
        items.sort((a, b) => a.name.localeCompare(b.name));

        document.getElementById('item-select').innerHTML = items.length ?
            '<option value="">Select...</option>' + items.map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.name)}</option>`).join('') :
            '<option value="">No items</option>';
    }

    async function saveSession() {
        const sessionId = document.getElementById('edit-session-id').value;
        const date = document.getElementById('session-date').value;
        const time = document.getElementById('session-time').value;
        if (!date || !time) return;
        if (tempSessionItems.length === 0) return;

        const sessionDate = new Date(date).toISOString();
        const endTime = new Date(`${date}T${time}:00`).toISOString();
        const totalTime = tempSessionItems.reduce((sum, item) => sum + (item.timeSpent || 0), 0);

        const data = {
            date: sessionDate, endTime, instrumentId: document.getElementById('session-instrument').value,
            items: tempSessionItems, notes: document.getElementById('session-notes-input').value,
            totalTime, status: 'completed'
        };

        if (sessionId) await FretLogData.updateSession(sessionId, data);
        else await FretLogData.addSession(data);

        closeSessionModal();
        filterSessions();
    }

    function editSession(sessionId) {
        const session = FretLogData.getSessions().find(s => s.id === sessionId);
        if (session) openSessionModal(session);
    }

    function confirmDeleteSession(sessionId) {
        deletingSessionId = sessionId;
        openModal('delete-session-modal');
    }

    async function deleteSession() {
        if (deletingSessionId) {
            await FretLogData.deleteSession(deletingSessionId);
            deletingSessionId = null;
            closeModal('delete-session-modal');
            filterSessions();
        }
    }

    function autoResizeTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    // Lifecycle
    document.addEventListener('DOMContentLoaded', async () => {
        const initPromise = FretLogData.init();
        const render = () => { populateFilters(); filterSessions(); };

        await render();
        await initPromise;
        await render();

        // Pagination listeners
        document.getElementById('prev-page').addEventListener('click', () => {
            if (window.currentPage > 1) {
                window.currentPage--;
                renderSessions();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        document.getElementById('next-page').addEventListener('click', () => {
            const totalPages = Math.ceil(window.filteredSessions.length / itemsPerPage);
            if (window.currentPage < totalPages) {
                window.currentPage++;
                renderSessions();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        flatpickr('#filter-date-start', { altInput: true, altFormat: 'M j, Y', onChange: filterSessions });
        flatpickr('#filter-date-end', { altInput: true, altFormat: 'M j, Y', onChange: filterSessions });
        flatpickr('#session-date', { altInput: true, altFormat: 'M j, Y' });
        flatpickr('#session-time', { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true });

        document.getElementById('filter-instrument').addEventListener('change', filterSessions);
        document.getElementById('clear-filters').addEventListener('click', () => {
            document.getElementById('filter-date-start')._flatpickr?.clear();
            document.getElementById('filter-date-end')._flatpickr?.clear();
            document.getElementById('filter-instrument').value = '';
            filterSessions();
        });

        document.getElementById('add-session-btn').addEventListener('click', () => openSessionModal());
        document.getElementById('add-session-item-btn').addEventListener('click', openSessionAddItemModal);
        document.getElementById('item-category-select').addEventListener('change', updateSessionItemOptions);
        document.getElementById('confirm-add-session-item').addEventListener('click', () => {
            const itemId = document.getElementById('item-select').value;
            const hours = parseInt(document.getElementById('item-time-h').value) || 0;
            const mins = parseInt(document.getElementById('item-time-m').value) || 0;
            const timeMs = (hours * 60 + mins) * 60000;
            const libItem = FretLogData.getLibraryItems().find(i => i.id === itemId);
            if (libItem) {
                tempSessionItems.push({ id: FretLogData.generateId(), libraryItemId: itemId, name: libItem.name, categoryId: libItem.categoryId, timeSpent: timeMs });
                renderTempSessionItems();
                closeModal('session-item-modal');
            }
        });
        document.getElementById('save-session-btn').addEventListener('click', saveSession);
        document.getElementById('confirm-delete-session').addEventListener('click', deleteSession);
        document.getElementById('edit-viewed-session').addEventListener('click', () => {
            closeModal('view-session-modal');
            editSession(viewingSessionId);
        });

        document.getElementById('session-notes-input').addEventListener('input', (e) => autoResizeTextarea(e.target));

        window.addEventListener('fretlog-session-updated', filterSessions);

        // Auto-collapse mobile filters on load
        if (window.innerWidth <= 768) {
            document.getElementById('filters-content').classList.add('hidden-mobile');
        }
    });

    function toggleMobileFilters() {
        const content = document.getElementById('filters-content');
        const chevron = document.getElementById('filter-chevron');
        if (content.classList.contains('hidden-mobile')) {
            content.classList.remove('hidden-mobile');
            chevron.style.transform = 'rotate(180deg)';
        } else {
            content.classList.add('hidden-mobile');
            chevron.style.transform = 'rotate(0deg)';
        }
    }
