let delType = null, delId = null;
let pendingImport = null;

function renderInstruments() {
    const insts = FretLogData.getInstruments();
    const currentInst = FretLogData.getCurrentInstrument();
    document.getElementById('instruments-list').innerHTML = insts.sort((a, b) => a.name.localeCompare(b.name)).map(i => {
        const isDefault = currentInst?.id === i.id;
        return `
        <tr data-action="set-default-instrument" data-id="${escapeHtml(i.id)}" style="cursor: pointer; ${isDefault ? 'background-color: rgba(var(--color-primary-rgb), 0.1); border-left: 3px solid var(--color-primary);' : ''}">
            <td style="font-size: 1.25rem;">${escapeHtml(i.icon)}</td>
            <td class="font-medium">
                ${escapeHtml(i.name)}
                ${isDefault ? '<span class="text-primary" style="margin-left: 8px; font-size: 0.8em;">(Selected)</span>' : ''}
            </td>
            <td class="text-right">
                <div class="flex gap-xs justify-end">
                    <button class="btn btn-ghost btn-icon btn-sm" data-action="edit-instrument" data-id="${escapeHtml(i.id)}" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm text-danger" data-action="delete-instrument" data-id="${escapeHtml(i.id)}" data-name="${escapeHtml(i.name)}" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

function renderCategories() {
    document.getElementById('categories-list').innerHTML = FretLogData.getCategories().sort((a, b) => a.name.localeCompare(b.name)).map(c => `
        <tr>
            <td style="font-size: 1.25rem;">${escapeHtml(c.icon)}</td>
            <td class="font-medium">${escapeHtml(c.name)}</td>
            <td><span class="badge" style="background:${escapeHtml(c.color)}1a; color:${escapeHtml(c.color)}; border:1px solid ${escapeHtml(c.color)}33;">${escapeHtml(c.type)}</span></td>
            <td class="text-right">
                <div class="flex gap-xs justify-end">
                    <button class="btn btn-ghost btn-icon btn-sm" data-action="edit-category" data-id="${escapeHtml(c.id)}" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    ${(c.name === 'Song' || c.name === 'Songs') ? '<div style="width:28px"></div>' : `
                     <button class="btn btn-ghost btn-icon btn-sm text-danger" data-action="delete-category" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>`}
                </div>
            </td>
        </tr>
    `).join('');
}

async function setDefaultInst(id) { await FretLogData.saveDefaultInstrument(id); renderInstruments(); updateUserDisplay(); }
function editInst(id) { const i = FretLogData.getInstruments().find(x => x.id === id); if (i) { document.getElementById('instrument-modal-title').textContent = 'Edit Instrument'; document.getElementById('edit-instrument-id').value = id; document.getElementById('instrument-icon').value = i.icon; document.getElementById('instrument-name').value = i.name; openModal('instrument-modal'); } }
async function saveInst() { const id = document.getElementById('edit-instrument-id').value, icon = document.getElementById('instrument-icon').value.trim() || '🎸', name = document.getElementById('instrument-name').value.trim(); if (!name) return; if (id) await FretLogData.updateInstrument(id, { icon, name }); else await FretLogData.addInstrument({ icon, name }); closeModal('instrument-modal'); renderInstruments(); }
function confirmDelInst(id, name) { delType = 'inst'; delId = id; document.getElementById('delete-modal-title').textContent = 'Delete Instrument?'; document.getElementById('delete-modal-message').textContent = `Delete "${name}"?`; openModal('delete-modal'); }
function editCat(id) { const c = FretLogData.getCategories().find(x => x.id === id); if (!c) return; const isDef = c.name === 'Song' || c.name === 'Songs'; document.getElementById('category-modal-title').textContent = 'Edit Category'; document.getElementById('edit-category-id').value = id; document.getElementById('category-icon').value = c.icon; document.getElementById('category-icon').disabled = isDef; document.getElementById('category-name').value = c.name; document.getElementById('category-name').disabled = isDef; document.getElementById('category-color').value = c.color; openModal('category-modal'); }
async function saveCat() { const id = document.getElementById('edit-category-id').value, icon = document.getElementById('category-icon').value.trim() || '🎵', name = document.getElementById('category-name').value.trim(), color = document.getElementById('category-color').value; if (!name) return; if (id) await FretLogData.updateCategory(id, { icon, name, type: name, color }); else await FretLogData.addCategory({ icon, name, type: name, color }); closeModal('category-modal'); renderCategories(); }
function confirmDelCat(id, name) { delType = 'cat'; delId = id; document.getElementById('delete-modal-title').textContent = 'Delete Category?'; document.getElementById('delete-modal-message').textContent = `Delete "${name}"? Library items will remain but category will be unknown.`; openModal('delete-modal'); }
async function confirmDelete() { if (delType === 'inst') await FretLogData.deleteInstrument(delId); else if (delType === 'cat') await FretLogData.deleteCategory(delId); closeModal('delete-modal'); renderInstruments(); renderCategories(); }
async function exportData() { const data = await FretLogData.exportAllData(); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `fretlog-backup-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url); showNotification('Exported!'); }
function legacyHandleFile(e) {
    const file = e.target.files[0]; if (!file) return; e.target.value = '';
    if (!file.name.toLowerCase().endsWith('.json')) { showImportError('Invalid file type. Please select a JSON file.'); openModal('import-preview-modal'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { try { let data; try { data = JSON.parse(ev.target.result); } catch (jsonErr) { throw new Error('File contains invalid JSON data.'); } if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid data format.'); const validKeys = ['library_items', 'sessions', 'artists', 'instruments', 'categories']; if (!validKeys.some(key => key in data)) throw new Error('Invalid FretLog backup file.'); pendingImport = data; const list = document.getElementById('import-summary-list'); let html = '<div class="flex flex-col gap-sm">'; const userData = (pendingImport.users && pendingImport.users.length > 0) ? pendingImport.users[0] : null; if (userData && userData.name) html += `<div class="flex items-center gap-md"><span style="font-size: 1.25rem;">👤</span><span><strong>Profile:</strong> ${userData.name}</span></div>`; const sections = [{ key: ['library_items', 'library'], name: 'Library Items', icon: '📚', type: 'library' }, { key: ['sessions'], name: 'Sessions', icon: '⏱️', type: 'sessions' }, { key: ['artists'], name: 'Artists', icon: '🎤', type: 'artists' }, { key: ['instruments'], name: 'Instruments', icon: '🎸', type: 'instruments' }, { key: ['categories'], name: 'Categories', icon: '📋', type: 'categories' }]; const getExistingIds = (type) => new Set(FretLogData.getData(type).map(i => i.id)); sections.forEach(sec => { const keys = Array.isArray(sec.key) ? sec.key : [sec.key]; let items = []; for (const key of keys) { if (pendingImport[key] && Array.isArray(pendingImport[key])) { items = pendingImport[key]; break; } } if (items.length > 0) { const newCount = items.filter(i => !getExistingIds(sec.type).has(i.id)).length; if (newCount > 0) html += `<div class="flex items-center gap-md"><span style="font-size: 1.25rem;">${sec.icon}</span><span><strong>${sec.name}:</strong> ${newCount} new</span></div>`; } }); html += '</div><div class="text-secondary mt-lg pt-md" style="font-size: var(--font-size-small); border-top: 1px solid var(--border-color);"><strong>Note:</strong> Only new items will be added. Existing items with the same IDs will be skipped/merged.</div>'; list.innerHTML = html; document.getElementById('import-preview-content').classList.remove('hidden'); document.getElementById('import-error-content').classList.add('hidden'); document.getElementById('final-confirm-import-btn').textContent = 'Proceed with Import'; document.getElementById('final-confirm-import-btn').disabled = false; } catch (err) { showImportError(err.message); } openModal('import-preview-modal'); }; reader.readAsText(file);
}
function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    if (!file.name.toLowerCase().endsWith('.json')) {
        showImportError('Invalid file type. Please select a JSON file.');
        openModal('import-preview-modal');
        return;
    }

    const reader = new FileReader();
    reader.onload = event => {
        try {
            const data = JSON.parse(event.target.result);
            const validKeys = ['library_items', 'sessions', 'artists', 'instruments', 'categories'];
            if (!data || typeof data !== 'object' || Array.isArray(data) || !validKeys.some(key => key in data)) {
                throw new Error('Invalid FretLog backup file.');
            }

            pendingImport = data;
            const list = document.getElementById('import-summary-list');
            const fragment = document.createDocumentFragment();
            const wrapper = document.createElement('div');
            wrapper.className = 'flex flex-col gap-sm';
            const user = data.users?.[0];
            if (user?.name) {
                const row = document.createElement('div');
                row.className = 'flex items-center gap-md';
                row.textContent = `👤 Profile: ${user.name}`;
                wrapper.appendChild(row);
            }

            const sections = [
                { keys: ['library_items', 'library'], name: 'Library Items', icon: '📚', type: 'library' },
                { keys: ['sessions'], name: 'Sessions', icon: '⏱️', type: 'sessions' },
                { keys: ['artists'], name: 'Artists', icon: '🎤', type: 'artists' },
                { keys: ['instruments'], name: 'Instruments', icon: '🎸', type: 'instruments' },
                { keys: ['categories'], name: 'Categories', icon: '📋', type: 'categories' }
            ];
            sections.forEach(section => {
                const items = section.keys.map(key => data[key]).find(value => Array.isArray(value)) || [];
                const existing = new Set(FretLogData.getData(section.type).map(item => item.id));
                const newCount = items.filter(item => !existing.has(item.id)).length;
                if (!newCount) return;
                const row = document.createElement('div');
                row.className = 'flex items-center gap-md';
                row.textContent = `${section.icon} ${section.name}: ${newCount} new`;
                wrapper.appendChild(row);
            });

            fragment.appendChild(wrapper);
            const note = document.createElement('div');
            note.className = 'text-secondary mt-lg pt-md';
            note.style.cssText = 'font-size: var(--font-size-small); border-top: 1px solid var(--border-color);';
            note.textContent = 'Existing items will be preserved. Imported records will be added to your data.';
            fragment.appendChild(note);
            list.replaceChildren(fragment);
            document.getElementById('import-preview-content').classList.remove('hidden');
            document.getElementById('import-error-content').classList.add('hidden');
            document.getElementById('final-confirm-import-btn').disabled = false;
            openModal('import-preview-modal');
        } catch (error) {
            showImportError(error.message || 'File contains invalid JSON data.');
            openModal('import-preview-modal');
        }
    };
    reader.readAsText(file);
}

function showImportError(msg) { document.getElementById('import-preview-content').classList.add('hidden'); document.getElementById('import-error-content').classList.remove('hidden'); document.getElementById('import-error-message').textContent = msg; document.getElementById('final-confirm-import-btn').disabled = true; }

document.addEventListener('DOMContentLoaded', async () => {
    await FretLogData.init(); renderInstruments(); renderCategories();
    const th = FretLogData.getTheme(); document.getElementById('theme-light').checked = th === 'light'; document.getElementById('theme-dark').checked = th === 'dark';
    document.querySelectorAll('input[name="theme-radio"]').forEach(r => r.addEventListener('change', () => FretLogData.setTheme(r.value)));
    document.getElementById('add-instrument-btn').addEventListener('click', () => { document.getElementById('instrument-modal-title').textContent = 'Add Instrument'; document.getElementById('edit-instrument-id').value = ''; document.getElementById('instrument-icon').value = '🎸'; document.getElementById('instrument-name').value = ''; openModal('instrument-modal'); });
    document.getElementById('save-instrument-btn').addEventListener('click', saveInst); document.getElementById('add-category-btn').addEventListener('click', () => { document.getElementById('category-modal-title').textContent = 'Add Category'; document.getElementById('edit-category-id').value = ''; document.getElementById('category-icon').value = '🎵'; document.getElementById('category-name').value = ''; document.getElementById('category-color').value = '#4f46e5'; openModal('category-modal'); }); document.getElementById('save-category-btn').addEventListener('click', saveCat); document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete); document.getElementById('export-data-btn').addEventListener('click', exportData); document.getElementById('import-data-btn').addEventListener('click', () => document.getElementById('import-file').click()); document.getElementById('import-file').addEventListener('change', handleFile); document.getElementById('final-confirm-import-btn').addEventListener('click', async () => { if (pendingImport) { await FretLogData.importAllData(pendingImport); closeModal('import-preview-modal'); location.reload(); } }); document.getElementById('clear-data-btn').addEventListener('click', () => { document.getElementById('confirm-clear-text').value = ''; openModal('clear-data-modal'); }); document.getElementById('confirm-clear-data-btn').addEventListener('click', async () => { if (document.getElementById('confirm-clear-text').value === 'Confirm') { await FretLogData.resetAllData(); location.reload(); } else document.getElementById('clear-confirm-error').classList.remove('hidden'); });
});

document.addEventListener('DOMContentLoaded', () => {
    if (window.FretLogEmojiPicker) { FretLogEmojiPicker.attach('instrument-icon'); FretLogEmojiPicker.attach('category-icon'); }
});
