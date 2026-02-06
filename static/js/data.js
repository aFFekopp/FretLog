/**
 * FretLog - Data Store (API Version)
 * Manages all data persistence using REST API with SQLite backend
 */

const API_BASE = '/api';

const FretLogData = {
    // Local cache for sync operations (fallback)
    _cache: {
        user: null,
        categories: [],
        instruments: [],
        artists: [],
        library: [],
        sessions: [],
        currentSession: null,
        theme: 'dark',
        _initialized: false
    },

    // Generate unique ID (for client-side before server assigns)
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Helper for API calls
    async _fetch(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const config = {
            headers: { 'Content-Type': 'application/json' },
            ...options
        };
        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {


            const response = await fetch(url, config);
            if (response.status === 204) return null;
            if (!response.ok) {
                const text = await response.text();
                console.error(`API Error ${response.status}: ${text}`);
                throw new Error(`API error: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`API call failed: ${endpoint}`, error);
            throw error;
        }
    },

    // Normalization helpers
    _normalizeSession(s) {
        if (!s) return null;
        const norm = { ...s };
        if (s.instrument_id) norm.instrumentId = s.instrument_id;
        if (s.total_time !== undefined) norm.totalTime = s.total_time;
        if (s.start_time) norm.startTime = s.start_time;
        if (s.end_time) norm.endTime = s.end_time;
        if (s.items) {
            norm.items = s.items.map(i => {
                const item = { ...i };
                if (i.library_item_id) item.libraryItemId = i.library_item_id;
                if (i.category_id) item.categoryId = i.category_id;
                if (i.time_spent !== undefined) item.timeSpent = i.time_spent;
                if (i.started_at) item.startedAt = i.started_at;
                return item;
            });
        }
        return norm;
    },

    _normalizeLibraryItem(i) {
        if (!i) return null;
        const norm = { ...i };
        if (i.category_id) norm.categoryId = i.category_id;
        if (i.artist_id) norm.artistId = i.artist_id;
        if (i.star_rating !== undefined) norm.starRating = i.star_rating;
        return norm;
    },

    _normalizeUser(u) {
        if (!u) return null;
        const norm = { ...u };
        if (u.default_instrument_id) norm.defaultInstrumentId = u.default_instrument_id;
        return norm;
    },

    // Initialize - load initial data from API (single request)
    _initPromise: null,
    async init() {
        // Initial load from local cache for instant UI
        this._loadCache();

        // Return existing promise if init is already in progress or complete
        if (this._initPromise) {
            return this._initPromise;
        }

        // Create and store the init promise
        this._initPromise = this._doInit();
        return this._initPromise;
    },

    // Load data from localStorage synchronously
    _loadCache() {
        try {
            const keys = [
                'user', 'categories', 'instruments', 'artists',
                'library', 'sessions', 'currentSession', 'theme'
            ];

            keys.forEach(key => {
                const cached = localStorage.getItem(`fretlog_${key}_cache`);
                if (cached) {
                    this._cache[key] = JSON.parse(cached);
                }
            });

            // Apply theme immediately
            if (this._cache.theme) {
                document.documentElement.setAttribute('data-theme', this._cache.theme);
            }

            console.log('FretLogData loaded from local cache');
        } catch (e) {
            console.warn('Failed to load local cache', e);
        }
    },

    // Helper to update specific cache key
    _updateCache(key, data) {
        localStorage.setItem(`fretlog_${key}_cache`, JSON.stringify(data));
    },

    async _doInit() {
        try {
            // Single API call for all initialization data
            const data = await this._fetch('/init');

            // Extract data from response
            let { user, categories, instruments, artists, library, sessions, currentSession, theme } = data;

            // Seed defaults if missing
            if (!instruments || instruments.length === 0) {
                console.log('Seeding default instruments...');
                const defaults = [
                    { icon: '🎸', name: 'Guitar' },
                    { icon: '🎹', name: 'Piano' },
                    { icon: '🥁', name: 'Drums' },
                    { icon: '🎻', name: 'Violin' },
                    { icon: '🎤', name: 'Vocals' }
                ];
                instruments = [];
                for (const inst of defaults) {
                    const saved = await this.addInstrument(inst);
                    instruments.push(saved);
                }
            }

            if (!categories || categories.length === 0) {
                console.log('Seeding default categories...');
                const defaults = [
                    { icon: '🎵', name: 'Songs', type: 'Song', color: '#4f46e5' },
                    { icon: '🎼', name: 'Theory', type: 'Theory', color: '#0ea5e9' },
                    { icon: '💪', name: 'Technique', type: 'Technique', color: '#10b981' },
                    { icon: '👂', name: 'Ear Training', type: 'Ear Training', color: '#f59e0b' },
                    { icon: '🎨', name: 'Improvisation', type: 'Other', color: '#8b5cf6' }
                ];
                categories = [];
                for (const cat of defaults) {
                    const saved = await this.addCategory(cat);
                    categories.push(saved);
                }
            }

            // Update cache with normalized data
            this._cache.user = this._normalizeUser(user);
            this._cache.categories = (categories || []).map(c => ({
                ...c,
                color: c.color || this._getRandomColor()
            }));
            this._cache.instruments = instruments || [];
            this._cache.artists = artists || [];
            this._cache.library = (library || []).map(i => this._normalizeLibraryItem(i));
            this._cache.sessions = (sessions || []).map(s => this._normalizeSession(s));
            this._cache.theme = theme || 'dark';
            this._cache.currentSession = this._normalizeSession(currentSession);

            // Apply theme directly (no API call needed, value is from init)
            document.documentElement.setAttribute('data-theme', this._cache.theme);

            // Cache all data for instant load on next visit
            this._updateCache('user', this._cache.user);
            this._updateCache('instruments', this._cache.instruments);
            this._updateCache('categories', this._cache.categories);
            this._updateCache('artists', this._cache.artists);
            this._updateCache('library', this._cache.library);
            this._updateCache('sessions', this._cache.sessions);
            this._updateCache('currentSession', this._cache.currentSession);
            this._updateCache('theme', this._cache.theme);

            console.log('FretLogData initialized from API');
            this._cache._initialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize from API:', error);
            return false;
        }
    },

    // ==========================================
    // User Methods
    // ==========================================
    getUser() {
        return this._cache.user;
    },

    async saveUser(user) {
        const result = await this._fetch('/user', {
            method: 'POST',
            body: user
        });
        this._cache.user = this._normalizeUser(result);
        localStorage.setItem('fretlog_user_cache', JSON.stringify(this._cache.user));
        return this._cache.user;
    },

    getCurrentInstrument() {
        const user = this.getUser();
        if (!user || !user.defaultInstrumentId) return null;
        return this.getInstruments().find(i => i.id === user.defaultInstrumentId);
    },

    // ==========================================
    // Categories Methods
    // ==========================================
    getCategories() {
        return this._cache.categories || [];
    },

    async saveCategories(categories) {
        this._cache.categories = categories;
        return categories;
    },

    async addCategory(category) {
        if (!category.color) category.color = this._getRandomColor();
        const result = await this._fetch('/categories', {
            method: 'POST',
            body: category
        });
        const saved = result;
        this._cache.categories.push(saved);
        this._updateCache('categories', this._cache.categories);
        return saved;
    },

    _getRandomColor() {
        const colors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];
        return colors[Math.floor(Math.random() * colors.length)];
    },

    async updateCategory(id, updates) {
        const result = await this._fetch(`/categories/${id}`, {
            method: 'PUT',
            body: { ...updates, id }
        });
        const index = this._cache.categories.findIndex(c => c.id === id);
        if (index !== -1) {
            this._cache.categories[index] = result;
            this._updateCache('categories', this._cache.categories);
        }
        return result;
    },

    async deleteCategory(id) {
        await this._fetch(`/categories/${id}`, { method: 'DELETE' });
        this._cache.categories = this._cache.categories.filter(c => c.id !== id);
        this._updateCache('categories', this._cache.categories);
        return this._cache.categories;
    },

    // ==========================================
    // Instruments Methods
    // ==========================================
    getInstruments() {
        return this._cache.instruments || [];
    },

    async saveInstruments(instruments) {
        this._cache.instruments = instruments;
        return instruments;
    },

    async addInstrument(instrument) {
        const result = await this._fetch('/instruments', {
            method: 'POST',
            body: instrument
        });
        this._cache.instruments.push(result);
        this._updateCache('instruments', this._cache.instruments);
        return this._cache.instruments;
    },

    async updateInstrument(id, updates) {
        const result = await this._fetch(`/instruments/${id}`, {
            method: 'PUT',
            body: { ...updates, id }
        });
        const index = this._cache.instruments.findIndex(i => i.id === id);
        if (index !== -1) {
            this._cache.instruments[index] = result;
            this._updateCache('instruments', this._cache.instruments);
        }
        return result;
    },

    async deleteInstrument(id) {
        await this._fetch(`/instruments/${id}`, { method: 'DELETE' });
        this._cache.instruments = this._cache.instruments.filter(i => i.id !== id);
        this._updateCache('instruments', this._cache.instruments);
        return this._cache.instruments;
    },

    // ==========================================
    // Artists Methods
    // ==========================================
    getArtists() {
        return this._cache.artists || [];
    },

    async saveArtists(artists) {
        this._cache.artists = artists;
        return artists;
    },

    async addArtist(name) {
        const result = await this._fetch('/artists', {
            method: 'POST',
            body: { name }
        });
        // Only add if not already in cache
        if (!this._cache.artists.find(a => a.id === result.id)) {
            this._cache.artists.push(result);
            this._updateCache('artists', this._cache.artists);
        }
        return result;
    },

    async findOrCreateArtist(name) {
        const artists = this.getArtists();
        let artist = artists.find(a => a.name.toLowerCase() === name.toLowerCase());
        if (!artist) {
            artist = await this.addArtist(name);
        }
        return artist;
    },

    async deleteArtist(id) {
        await this._fetch(`/artists/${id}`, { method: 'DELETE' });
        this._cache.artists = this._cache.artists.filter(a => a.id != id);
        this._updateCache('artists', this._cache.artists);
        return this._cache.artists;
    },

    async updateArtist(id, name) {
        const result = await this._fetch(`/artists/${id}`, {
            method: 'PUT',
            body: { name }
        });
        const index = this._cache.artists.findIndex(a => a.id == id);
        if (index !== -1) {
            this._cache.artists[index] = result;
            this._updateCache('artists', this._cache.artists);
        }
        return result;
    },

    // ==========================================
    // Library Methods
    // ==========================================
    getLibraryItems() {
        return this._cache.library || [];
    },

    async saveLibraryItems(items) {
        this._cache.library = items;
        return items;
    },

    async addLibraryItem(item) {
        const result = await this._fetch('/library', {
            method: 'POST',
            body: item
        });
        const norm = this._normalizeLibraryItem(result);
        this._cache.library.unshift(norm);
        this._updateCache('library', this._cache.library);
        return norm;
    },

    async updateLibraryItem(id, updates) {
        const result = await this._fetch(`/library/${id}`, {
            method: 'PUT',
            body: { ...updates, id }
        });
        const norm = this._normalizeLibraryItem(result);
        const index = this._cache.library.findIndex(i => i.id === id);
        if (index !== -1) {
            this._cache.library[index] = norm;
            this._updateCache('library', this._cache.library);
        }
        return norm;
    },

    async deleteLibraryItem(id) {
        await this._fetch(`/library/${id}`, { method: 'DELETE' });
        this._cache.library = this._cache.library.filter(i => i.id !== id);
        this._updateCache('library', this._cache.library);
        return this._cache.library;
    },

    getLibraryItemsByCategory(categoryId) {
        return this.getLibraryItems().filter(i => i.category_id === categoryId || i.categoryId === categoryId);
    },

    // ==========================================
    // Sessions Methods
    // ==========================================
    getSessions() {
        return this._cache.sessions || [];
    },

    async saveSessions(sessions) {
        this._cache.sessions = sessions;
        return sessions;
    },

    async addSession(session) {
        const result = await this._fetch('/sessions', {
            method: 'POST',
            body: session
        });
        const norm = this._normalizeSession(result);
        this._cache.sessions.unshift(norm);
        this._updateCache('sessions', this._cache.sessions);
        return norm;
    },

    async updateSession(id, updates) {
        const result = await this._fetch(`/sessions/${id}`, {
            method: 'PUT',
            body: { ...updates, id }
        });
        const norm = this._normalizeSession(result);
        const index = this._cache.sessions.findIndex(s => s.id === id);
        if (index !== -1) {
            this._cache.sessions[index] = norm;
            this._updateCache('sessions', this._cache.sessions);
        }
        return norm;
    },

    async deleteSession(id) {
        await this._fetch(`/sessions/${id}`, { method: 'DELETE' });
        this._cache.sessions = this._cache.sessions.filter(s => s.id !== id);
        this._updateCache('sessions', this._cache.sessions);
        return this._cache.sessions;
    },

    // Current session management
    getCurrentSession() {
        return this._cache.currentSession;
    },

    async saveCurrentSession(session) {
        const result = await this._fetch('/sessions/current', {
            method: 'POST',
            body: session
        });
        const norm = this._normalizeSession(result);
        this._cache.currentSession = norm;
        this._updateCache('currentSession', this._cache.currentSession);
        return norm;
    },

    async clearCurrentSession() {
        await this._fetch('/sessions/current', { method: 'DELETE' });
        this._cache.currentSession = null;
        this._updateCache('currentSession', null);
    },

    async startNewSession(instrumentId) {
        const session = {
            id: this.generateId(),
            instrumentId: instrumentId || this.getUser()?.defaultInstrumentId,
            status: 'running',
            date: new Date().toISOString(),
            startTime: Date.now(),
            totalTime: 0,
            items: [],
            notes: '',
            createdAt: new Date().toISOString()
        };
        return await this.saveCurrentSession(session);
    },

    async endCurrentSession(notes) {
        const session = this.getCurrentSession();
        if (session) {
            session.status = 'completed';
            session.endTime = Date.now();
            if (notes !== undefined) session.notes = notes;
            session.totalTime = session.items.reduce((sum, item) => sum + (item.timeSpent || item.time_spent || 0), 0);

            // Save as completed session
            const result = await this._fetch('/sessions', {
                method: 'POST',
                body: session
            });

            // Clear current session
            await this.clearCurrentSession();

            // Add to cache
            const norm = this._normalizeSession(result);
            this._cache.sessions.unshift(norm);
            this._updateCache('sessions', this._cache.sessions);
            return norm;
        }
        return null;
    },

    async cancelCurrentSession() {
        await this.clearCurrentSession();
    },

    async addItemToCurrentSession(libraryItemId, timeSpent = 0) {
        const session = this.getCurrentSession();
        if (session) {
            const libraryItem = this.getLibraryItems().find(i => i.id === libraryItemId);
            if (libraryItem) {
                session.items.push({
                    id: this.generateId(),
                    libraryItemId,
                    name: libraryItem.name,
                    categoryId: libraryItem.category_id || libraryItem.categoryId,
                    timeSpent,
                    startedAt: Date.now()
                });
                return await this.saveCurrentSession(session);
            }
        }
        return session;
    },

    async updateSessionItemTime(itemId, timeSpent) {
        const session = this.getCurrentSession();
        if (session) {
            const item = session.items.find(i => i.id === itemId);
            if (item) {
                item.timeSpent = timeSpent;
                return await this.saveCurrentSession(session);
            }
        }
        return session;
    },

    // ==========================================
    // Statistics Methods
    // ==========================================
    getSessionsInRange(startDate, endDate) {
        const sessions = this.getSessions();
        return sessions.filter(s => {
            const sessionDate = new Date(s.date);
            return sessionDate >= startDate && sessionDate <= endDate;
        });
    },

    getTotalTimeInRange(startDate, endDate) {
        const sessions = this.getSessionsInRange(startDate, endDate);
        return sessions.reduce((sum, s) => sum + (s.totalTime || s.total_time || 0), 0);
    },

    getThisWeekTime() {
        const now = new Date();
        const startOfWeek = new Date(now);
        const day = now.getDay();
        const diff = (day === 0 ? 6 : day - 1);
        startOfWeek.setDate(now.getDate() - diff);
        startOfWeek.setHours(0, 0, 0, 0);
        return this.getTotalTimeInRange(startOfWeek, now);
    },

    getLastWeekTime() {
        const now = new Date();
        const day = now.getDay();
        const diff = (day === 0 ? 6 : day - 1);

        const startOfThisWeek = new Date(now);
        startOfThisWeek.setDate(now.getDate() - diff);
        startOfThisWeek.setHours(0, 0, 0, 0);

        const startOfLastWeek = new Date(startOfThisWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

        return this.getTotalTimeInRange(startOfLastWeek, startOfThisWeek);
    },

    getRecentPracticeItems(limit = 5) {
        const sessions = this.getSessions()
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        const recentItems = [];
        for (const session of sessions) {
            for (const item of session.items || []) {
                if (recentItems.length >= limit) break;
                recentItems.push({
                    ...item,
                    sessionDate: session.date
                });
            }
            if (recentItems.length >= limit) break;
        }
        return recentItems;
    },

    getMostPracticedItems(period = 'month', limit = 5) {
        const now = new Date();
        let startDate = new Date();

        switch (period) {
            case 'day':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                // Start of current week (Monday)
                const day = now.getDay();
                const diff = (day === 0 ? 6 : day - 1);
                startDate.setDate(now.getDate() - diff);
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'month':
                // Start of current calendar month
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                // Start of current calendar year
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            case 'alltime':
                startDate = new Date(0);
                break;
        }

        const sessions = this.getSessionsInRange(startDate, now);
        const itemTimes = {};

        sessions.forEach(session => {
            (session.items || []).forEach(item => {
                const itemId = item.libraryItemId || item.library_item_id;
                if (!itemTimes[itemId]) {
                    itemTimes[itemId] = {
                        id: itemId,
                        name: item.name,
                        totalTime: 0
                    };
                }
                itemTimes[itemId].totalTime += item.timeSpent || item.time_spent || 0;
            });
        });

        return Object.values(itemTimes)
            .sort((a, b) => b.totalTime - a.totalTime)
            .slice(0, limit);
    },

    getPracticeSummary() {
        const now = new Date();

        // Today
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        // This week (Monday)
        const weekStart = new Date(now);
        const day = now.getDay();
        const diff = (day === 0 ? 6 : day - 1);
        weekStart.setDate(now.getDate() - diff);
        weekStart.setHours(0, 0, 0, 0);

        // This month
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // This year
        const yearStart = new Date(now.getFullYear(), 0, 1);

        return {
            today: this.getTotalTimeInRange(todayStart, now),
            week: this.getTotalTimeInRange(weekStart, now),
            month: this.getTotalTimeInRange(monthStart, now),
            year: this.getTotalTimeInRange(yearStart, now),
            allTime: this.getSessions().reduce((sum, s) => sum + (s.totalTime || s.total_time || 0), 0)
        };
    },

    getDailyTotals(days = 365) {
        const dailyTotals = {};
        const sessions = this.getSessions();

        sessions.forEach(session => {
            const dateKey = new Date(session.date).toISOString().split('T')[0];
            if (!dailyTotals[dateKey]) {
                dailyTotals[dateKey] = 0;
            }
            dailyTotals[dateKey] += session.totalTime || session.total_time || 0;
        });

        return dailyTotals;
    },

    getCategoryBreakdown(period = 'month') {
        const now = new Date();
        let startDate = new Date();

        switch (period) {
            case 'week':
                // Start of current week (Monday)
                const day = now.getDay();
                const diff = (day === 0 ? 6 : day - 1);
                startDate.setDate(now.getDate() - diff);
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'month':
                // Start of current calendar month
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                // Start of current calendar year
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            case 'alltime':
                startDate = new Date(0);
                break;
        }

        const sessions = this.getSessionsInRange(startDate, now);
        const categories = this.getCategories();
        const breakdown = {};

        categories.forEach(cat => {
            breakdown[cat.id] = { name: cat.name, icon: cat.icon, color: cat.color, totalTime: 0 };
        });

        sessions.forEach(session => {
            (session.items || []).forEach(item => {
                const catId = item.categoryId || item.category_id;
                if (breakdown[catId]) {
                    breakdown[catId].totalTime += item.timeSpent || item.time_spent || 0;
                }
            });
        });

        return Object.values(breakdown).filter(c => c.totalTime > 0);
    },

    // ==========================================
    // Theme Methods
    // ==========================================
    getTheme() {
        return localStorage.getItem('fretlog-theme') || this._cache.theme || 'dark';
    },

    setTheme(theme) {
        this._cache.theme = theme;
        localStorage.setItem('fretlog-theme', theme);
        document.documentElement.setAttribute('data-theme', theme);

        // Fire and forget - don't await
        this._fetch('/theme', {
            method: 'POST',
            body: { theme }
        }).catch(err => console.error('Failed to save theme:', err));
        return theme;
    },

    async toggleTheme() {
        const current = this.getTheme();
        const newTheme = current === 'light' ? 'dark' : 'light';
        return this.setTheme(newTheme);
    },

    // ==========================================
    // Data Management
    // ==========================================
    async exportAllData() {
        return await this._fetch('/export');
    },

    async importAllData(data) {
        return await this._fetch('/import', {
            method: 'POST',
            body: data
        });
    },

    async resetAllData() {
        await this._fetch('/clear', { method: 'POST' });
        // Clear local storage cache
        const keys = [
            'user', 'categories', 'instruments', 'artists',
            'library', 'sessions', 'currentSession'
        ];
        keys.forEach(k => localStorage.removeItem(`fretlog_${k}_cache`));
        return true;
    }
};

// Initialize on load - make it async-aware
document.addEventListener('DOMContentLoaded', async () => {
    await FretLogData.init();
    // Dispatch event so other scripts know data is ready
    window.dispatchEvent(new CustomEvent('fretlog-data-ready'));
});
