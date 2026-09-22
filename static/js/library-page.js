let currentPage = 1;
const itemsPerPage = 12;
let filteredItems = [];
let selectedRating = 0;
let deletingItemId = null;
let currentView = 'list';
let currentSelectedCategory = "";

function populateFilters() {
    const categories = FretLogData.getCategories();
    const artists = FretLogData.getArtists().sort((a, b) => a.name.localeCompare(b.name));
    const categoryContainer = document.getElementById('category-filter-buttons');
    const allActive = currentSelectedCategory === "";

    categoryContainer.innerHTML = `
        <button class="category-filter-btn ${allActive ? 'active' : ''}" data-action="category-filter" data-id=""
                style="${allActive ? 'background:var(--color-primary); color:white;' : ''}">All</button>
    ` + categories.map(c => {
        const color = c.color || 'var(--color-primary)';
        const isActive = currentSelectedCategory === c.id;
        return `
            <button class="category-filter-btn ${isActive ? 'active' : ''}" 
                    data-action="category-filter" data-id="${escapeHtml(c.id)}"
                    style="${isActive ? `border-color:${color}; color:${color}; background:${color}10;` : `border-color:${color}40; color:${color}a0;`}">
                <span>${escapeHtml(c.icon)}</span> <span>${escapeHtml(c.name)}</span>
            </button>`;
    }).join('');

    document.getElementById('filter-artist').innerHTML = '<option value="">All Artists</option>' +
        artists.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
}

function handleCategoryClick(id) {
    currentSelectedCategory = id;
    document.getElementById('filter-category').value = id;
    populateFilters();
    filterItems();
}

function filterItems(keepPage = false) {
    let items = FretLogData.getLibraryItems();
    const catId = document.getElementById('filter-category').value;
    if (catId) items = items.filter(i => (i.categoryId || i.category_id) === catId);

    const artId = document.getElementById('filter-artist').value;
    if (artId) items = items.filter(i => (i.artistId || i.artist_id) === artId);

    const ratingVal = document.getElementById('filter-rating').value;
    if (ratingVal !== "") {
        const r = parseInt(ratingVal);
        items = r === 0 ? items.filter(i => !i.starRating) : items.filter(i => (i.starRating || 0) >= r);
    }

    const sortBy = document.getElementById('sort-by').value;
    items.sort((a, b) => {
        if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
        if (sortBy === 'rating-desc') return (b.starRating || 0) - (a.starRating || 0);
        if (sortBy === 'rating-asc') return (a.starRating || 0) - (b.starRating || 0);
        return 0;
    });

    filteredItems = items;
    if (!keepPage) currentPage = 1;
    document.getElementById('results-count').textContent = `${items.length} item${items.length !== 1 ? 's' : ''} found`;
    renderItems();
}

function renderItems() {
    const grid = document.getElementById('library-grid');
    const list = document.getElementById('library-list');
    const empty = document.getElementById('no-items');
    const pag = document.getElementById('pagination');

    if (filteredItems.length === 0) {
        grid.classList.add('hidden'); list.classList.add('hidden');
        empty.classList.remove('hidden'); pag.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    if (currentView === 'card') { grid.classList.remove('hidden'); list.classList.add('hidden'); }
    else { grid.classList.add('hidden'); list.classList.remove('hidden'); }

    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginated = filteredItems.slice(start, end);

    const categories = FretLogData.getCategories();
    const artists = FretLogData.getArtists();
    const times = getItemTotalTimes();

    const renderStars = (r) => {
        let s = ''; for (let i = 1; i <= 5; i++) s += `<span class="star ${i <= r ? 'filled' : ''}" data-rating="${i}">★</span>`;
        return s;
    };

    const listHtml = paginated.map(item => {
        const cat = categories.find(c => c.id === (item.categoryId || item.category_id));
        const art = artists.find(a => a.id === (item.artistId || item.artist_id));
        const s = renderStars(item.starRating || 0);
        const t = times[item.id] || 0;

        if (currentView === 'card') {
            return `
            <div class="card" style="padding: var(--spacing-md); position: relative; padding-left: calc(var(--spacing-md) + 4px);">
                <div class="card-category-strip" style="position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: ${cat?.color || 'var(--color-primary)'}; border-radius: var(--radius-lg) 0 0 var(--radius-lg);"></div>
                <div class="flex justify-between items-start" style="margin-bottom: 4px;">
                <h4 style="font-size: 1rem; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px; margin-bottom: 0;">${escapeHtml(item.name)}</h4>
                    <div class="dropdown" style="flex-shrink: 0;">
                        <button class="btn btn-ghost btn-icon btn-sm" aria-label="Item actions" title="Item actions" style="width: 24px; height: 24px; padding: 0;" data-action="toggle-item-menu">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                        </button>
                        <div class="dropdown-menu">
                            <div class="dropdown-item" data-action="edit-item" data-id="${escapeHtml(item.id)}">Edit</div>
                            <div class="dropdown-item text-danger" data-action="delete-item" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">Delete</div>
                        </div>
                    </div>
                </div>
                <p class="text-secondary" style="margin-bottom: 8px; font-size: 0.85rem; height: 1.2em;">${art ? escapeHtml(art.name) : '&nbsp;'}</p>
                <div class="star-rating" data-action="update-rating" data-id="${escapeHtml(item.id)}" style="margin-bottom: 0;">${s}</div>
                ${t > 0 ? `<div class="card-time-badge" style="top: auto; bottom: var(--spacing-md); transform: none; right: var(--spacing-md);">⏱ ${formatTimeHuman(t)}</div>` : ''}
            </div>`;
        } else {
            return `
            <div class="library-list-item">
                <div class="item-category" style="color: ${cat?.color || 'var(--color-primary)'};">
                    <span class="badge" style="background:${cat?.color}1a; color:${cat?.color}; border:1px solid ${cat?.color}33;">${cat?.icon} ${cat?.name}</span>
                </div>
                <div class="item-info">
                    <div class="flex items-center" style="gap: 8px; margin-bottom: 2px; min-width: 0;">
                        <div class="item-name" style="margin-bottom: 0;">${escapeHtml(item.name)}</div>
                        ${art ? `<div class="item-artist text-secondary" style="margin-top: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%;">${escapeHtml(art.name)}</div>` : ''}
                    </div>
                    <div class="flex items-center gap-sm">
                        <div class="star-rating rating-inline" data-action="update-rating" data-id="${escapeHtml(item.id)}" style="font-size: 0.85em;">${s}</div>
                        ${t > 0 ? `<div class="item-time time-inline">⏱ ${formatTimeHuman(t)}</div>` : ''}
                    </div>
                </div>
                ${t > 0 ? `<div class="item-time time-column">⏱ ${formatTimeHuman(t)}</div>` : ''}
    <div class="item-actions">
         <button class="btn btn-ghost btn-icon btn-sm" aria-label="Edit item" title="Edit item" data-action="edit-item" data-id="${escapeHtml(item.id)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
        </button>
         <button class="btn btn-ghost btn-icon btn-sm text-danger" aria-label="Delete item" title="Delete item" data-action="delete-item" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
    </div>
            </div > `;
        }
    }).join('');

    if (currentView === 'card') grid.innerHTML = listHtml; else list.innerHTML = listHtml;

    if (filteredItems.length > itemsPerPage) {
        pag.classList.remove('hidden');
        document.getElementById('pagination-info').textContent = `Showing ${start + 1} -${Math.min(end, filteredItems.length)} of ${filteredItems.length} `;
        document.getElementById('prev-page').disabled = currentPage === 1;
        document.getElementById('next-page').disabled = currentPage === totalPages;
    } else pag.classList.add('hidden');
}

function getItemTotalTimes() {
    const sess = FretLogData.getSessions();
    const t = {};
    sess.forEach(s => (s.items || []).forEach(i => { if (i.libraryItemId) t[i.libraryItemId] = (t[i.libraryItemId] || 0) + (i.timeSpent || 0); }));
    return t;
}

function toggleItemMenu(e, btn) {
    e.stopPropagation();
    const menu = btn.nextElementSibling;
    document.querySelectorAll('.dropdown-menu.active').forEach(m => { if (m !== menu) m.classList.remove('active'); });
    menu.parentElement.classList.toggle('active');
}

async function updateRating(id, e) {
    const star = e.target.closest('.star'); if (!star) return;
    let r = parseInt(star.dataset.rating);
    const item = FretLogData.getLibraryItems().find(i => i.id === id);
    // Toggle off if clicking the same rating
    if (r === (item.starRating || 0)) r = 0;
    await FretLogData.updateLibraryItem(id, { starRating: r });
    filterItems(true);
}

function openItemModal(item = null) {
    document.getElementById('item-modal-title').textContent = item ? 'Edit Item' : 'Add Item';
    document.getElementById('edit-item-id').value = item?.id || '';
    document.getElementById('item-category').innerHTML = FretLogData.getCategories().map(c => `<option value="${escapeHtml(c.id)}" ${item?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('');
    populateArtistSelect(item?.artistId);
    document.getElementById('item-name').value = item?.name || '';
    selectedRating = item?.starRating || 0;
    updateModalStars();
    updateCategoryFields();
    openModal('item-modal');
}

function populateArtistSelect(id = null) {
    document.getElementById('item-artist').innerHTML = '<option value="">Select artist...</option>' +
        FretLogData.getArtists().sort((a, b) => a.name.localeCompare(b.name)).map(a => `<option value="${escapeHtml(a.id)}" ${id === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
}

function updateCategoryFields() {
    const cat = FretLogData.getCategories().find(c => c.id === document.getElementById('item-category').value);
    const isSong = cat?.type === 'Song';
    document.getElementById('artist-group').classList.toggle('hidden', !isSong);
    document.getElementById('name-label').textContent = isSong ? 'Song Title *' : 'Name *';
}

function updateModalStars() {
    document.querySelectorAll('#item-rating .star').forEach((s, i) => s.classList.toggle('filled', i < selectedRating));
}

async function saveItem() {
    const id = document.getElementById('edit-item-id').value;
    const nameInput = document.getElementById('item-name');
    const name = nameInput.value.trim();
    const nameError = document.getElementById('name-error');
    const dupError = document.getElementById('duplicate-error');

    // Reset errors
    nameError.classList.add('hidden');
    dupError.classList.add('hidden');

    if (!name) {
        nameError.classList.remove('hidden');
        return;
    }

    const data = {
        categoryId: document.getElementById('item-category').value,
        artistId: document.getElementById('item-artist').value || null,
        name,
        starRating: selectedRating
    };

    try {
        if (id) {
            await FretLogData.updateLibraryItem(id, data);
        } else {
            await FretLogData.addLibraryItem(data);
        }
        closeModal('item-modal');
        filterItems(!!id);
    } catch (error) {
        if (error.message.includes('409')) {
            dupError.classList.remove('hidden');
        } else {
            console.error('Failed to save library item:', error);
            alert('An error occurred while saving. Please try again.');
        }
    }
}

function editItem(id) { const item = FretLogData.getLibraryItems().find(i => i.id === id); if (item) openItemModal(item); }
function confirmDelete(id, name) { deletingItemId = id; document.getElementById('delete-item-name').textContent = name; openModal('delete-modal'); }
async function deleteItem() { if (deletingItemId) { await FretLogData.deleteLibraryItem(deletingItemId); closeModal('delete-modal'); filterItems(); } }

function openArtistModal() { document.getElementById('new-artist-name').value = ''; openModal('artist-modal'); }
async function saveArtist() {
    const name = document.getElementById('new-artist-name').value.trim(); if (!name) return;
    const art = await FretLogData.addArtist(name); closeModal('artist-modal'); populateArtistSelect(art.id); document.getElementById('item-artist').value = art.id;
}

function renderManageArtistsList() {
    const list = document.getElementById('manage-artists-list');
    const counts = {}; FretLogData.getLibraryItems().forEach(i => { const aid = i.artistId || i.artist_id; if (aid) counts[aid] = (counts[aid] || 0) + 1; });
    list.innerHTML = FretLogData.getArtists().sort((a, b) => a.name.localeCompare(b.name)).map(a => {
        const c = counts[a.id] || 0;
        return `<div class="flex justify-between p-sm bg-card border rounded"><div><strong>${escapeHtml(a.name)}</strong><br><small>${c} item${c !== 1 ? 's' : ''}</small></div>
            <div class="flex gap-xs"><button class="btn btn-ghost btn-sm" data-action="edit-artist" data-id="${escapeHtml(a.id)}">Ren</button><button class="btn btn-ghost btn-sm text-danger" data-action="delete-artist" data-id="${escapeHtml(a.id)}">Del</button></div></div>`;
    }).join('');
}

let editArtId = null, delArtId = null;
window.editArtistClick = (id) => { editArtId = id; document.getElementById('edit-artist-input').value = FretLogData.getArtists().find(a => a.id == id).name; openModal('edit-artist-modal'); };
window.deleteArtistClick = (id) => {
    if (FretLogData.getLibraryItems().some(i => (i.artistId || i.artist_id) == id)) { alert("Artist in use!"); return; }
    delArtId = id; document.getElementById('delete-artist-name').textContent = FretLogData.getArtists().find(a => a.id == id).name; openModal('delete-artist-confirmation-modal');
};
window.confirmDeleteArtist = async () => { if (delArtId) { await FretLogData.deleteArtist(delArtId); closeModal('delete-artist-confirmation-modal'); renderManageArtistsList(); populateFilters(); } };

document.addEventListener('DOMContentLoaded', async () => {
    const init = FretLogData.init();
    const render = () => { populateFilters(); filterItems(); };
    await render(); await init; await render();

    document.getElementById('filter-artist').addEventListener('change', filterItems);
    document.getElementById('filter-rating').addEventListener('change', filterItems);
    document.getElementById('sort-by').addEventListener('change', filterItems);
    document.getElementById('clear-filters').addEventListener('click', () => {
        currentSelectedCategory = ""; document.getElementById('filter-category').value = "";
        document.getElementById('filter-artist').value = ""; document.getElementById('filter-rating').value = "";
        document.getElementById('sort-by').value = "name-asc"; populateFilters(); filterItems();
    });

    document.querySelectorAll('#view-toggle .view-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#view-toggle .view-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
        currentView = b.dataset.view; renderItems();
    }));

    document.getElementById('prev-page').addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderItems(); } });
    document.getElementById('next-page').addEventListener('click', () => { if (currentPage < Math.ceil(filteredItems.length / itemsPerPage)) { currentPage++; renderItems(); } });

    document.getElementById('add-item-btn').addEventListener('click', () => openItemModal());
    document.getElementById('save-item-btn').addEventListener('click', saveItem);
    document.getElementById('save-artist-btn').addEventListener('click', saveArtist);
    document.getElementById('confirm-delete-btn').addEventListener('click', deleteItem);
    document.getElementById('manage-artists-btn').addEventListener('click', () => { renderManageArtistsList(); openModal('manage-artists-modal'); });
    document.getElementById('manage-artist-add-btn').addEventListener('click', async () => {
        const n = document.getElementById('manage-artist-input').value.trim();
        if (n) { await FretLogData.addArtist(n); document.getElementById('manage-artist-input').value = ''; renderManageArtistsList(); populateFilters(); }
    });
    document.getElementById('save-artist-rename-btn').addEventListener('click', async () => {
        const n = document.getElementById('edit-artist-input').value.trim();
        if (n && editArtId) { await FretLogData.updateArtist(editArtId, n); closeModal('edit-artist-modal'); renderManageArtistsList(); populateFilters(); filterItems(); }
    });

    document.querySelectorAll('#item-rating .star').forEach(s => s.addEventListener('click', () => {
        const r = parseInt(s.dataset.rating); selectedRating = (r === 1 && selectedRating === 1) ? 0 : r; updateModalStars();
    }));

    window.addEventListener('fretlog-session-updated', filterItems);
    window.onInstrumentChange = filterItems;

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
