let trendsChart = null;
let categoryChart = null;
let heatmapYear = new Date().getFullYear();

function updateSummaryCards() {
    const sessions = FretLogData.getSessions();
    const totalTime = sessions.reduce((sum, s) => sum + (s.totalTime || 0), 0);
    document.getElementById('total-time').textContent = formatTimeHuman(totalTime);
    document.getElementById('total-sessions').textContent = sessions.length;
    if (sessions.length > 0) {
        document.getElementById('avg-session').textContent = formatTimeHuman(totalTime / sessions.length);
    }
    const dailyTotals = FretLogData.getDailyTotals();
    let streak = 0; const today = new Date();
    for (let i = 0; i < 365; i++) {
        const check = new Date(today); check.setDate(today.getDate() - i);
        const key = FretLogData.formatDateKey(check);
        if (dailyTotals[key] > 0) streak++; else if (i > 0) break;
    }
    document.getElementById('streak-days').textContent = `${streak} days`;
}

function renderTrendsChart(period = 'week') {
    const ctx = document.getElementById('trends-chart').getContext('2d');
    const now = new Date(); let labels = [], data = [];
    const dailyTotals = FretLogData.getDailyTotals();

    if (period === 'week') {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
        weekStart.setHours(0, 0, 0, 0);
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
            labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
            data.push((dailyTotals[FretLogData.formatDateKey(d)] || 0) / 60000);
        }
    } else if (period === 'month') {
        const baseDate = new Date(now);
        baseDate.setHours(12, 0, 0, 0); // Mid-day for safe date math
        for (let i = 29; i >= 0; i--) {
            const d = new Date(baseDate);
            d.setDate(baseDate.getDate() - i);
            const dayNum = d.getDate();
            const monthName = d.toLocaleDateString('en-US', { month: 'short' });
            // Label with month name on the 1st day or the first day of the window
            labels.push(dayNum === 1 || i === 29 ? `${monthName} ${dayNum}` : dayNum.toString());
            data.push((dailyTotals[FretLogData.formatDateKey(d)] || 0) / 60000);
        }
    } else if (period === 'year') {
        // Last 12 months
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = d.toLocaleDateString('en-US', { month: 'short' });
            labels.push(monthKey);

            let monthTotal = 0;
            const m = d.getMonth();
            const y = d.getFullYear();
            const lastDay = new Date(y, m + 1, 0).getDate();
            for (let day = 1; day <= lastDay; day++) {
                const check = new Date(y, m, day);
                monthTotal += dailyTotals[FretLogData.formatDateKey(check)] || 0;
            }
            data.push(monthTotal / 60000);
        }
    }

    if (trendsChart) trendsChart.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const line = ctx.createLinearGradient(0, 0, 0, 300); line.addColorStop(0, '#8b5cf6'); line.addColorStop(1, '#2E3A8C');
    const fill = ctx.createLinearGradient(0, 0, 0, 300); fill.addColorStop(0, 'rgba(139, 92, 246, 0.4)'); fill.addColorStop(1, 'transparent');

    trendsChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Minutes', data, borderColor: line, borderWidth: 3, backgroundColor: fill, fill: true, tension: 0.4, pointRadius: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${Math.round(c.raw)}m` } } },
            scales: {
                y: { beginAtZero: true, grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { color: isDark ? '#9CA3AF' : '#4A4A4A' } },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: isDark ? '#9CA3AF' : '#4A4A4A',
                        autoSkip: true,
                        maxTicksLimit: period === 'month' ? 15 : 12,
                        align: 'center',
                        maxRotation: 0,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

function renderHeatmap(year = heatmapYear) {
    heatmapYear = year;
    const container = document.getElementById('heatmap');
    const monthsContainer = document.getElementById('heatmap-months');
    const labelsContainer = document.getElementById('heatmap-labels');
    document.getElementById('heatmap-year').textContent = year;
    document.getElementById('next-year').disabled = year >= new Date().getFullYear();

    const dailyTotals = FretLogData.getDailyTotals();
    const yearData = Object.entries(dailyTotals).filter(([d]) => d.startsWith(year.toString())).map(([, v]) => v);
    const maxVal = Math.max(...yearData, 1);

    const first = new Date(year, 0, 1); const last = new Date(year, 11, 31);
    const start = new Date(first); start.setDate(first.getDate() - (first.getDay() === 0 ? 6 : first.getDay() - 1));
    const end = new Date(last); if (last.getDay() !== 0) end.setDate(last.getDate() + (7 - last.getDay()));

    const weeks = []; const monthPos = [];
    let current = new Date(start); let wIdx = 0; let lastM = -1;

    while (current <= end) {
        const w = [];
        for (let d = 0; d < 7; d++) {
            const key = FretLogData.formatDateKey(current);
            const val = dailyTotals[key] || 0;
            const isCur = current.getFullYear() === year;
            if (d === 0 && isCur && current.getMonth() !== lastM) {
                monthPos.push({ name: current.toLocaleDateString('en-US', { month: 'short' }), idx: wIdx });
                lastM = current.getMonth();
            }
            w.push({ key, val, level: isCur ? (val === 0 ? 0 : Math.ceil((val / maxVal) * 10)) : 0, display: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), isCur });
            current.setDate(current.getDate() + 1);
        }
        weeks.push(w); wIdx++;
    }

    labelsContainer.innerHTML = '<span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>';
    let monthsH = '<div class="heatmap-months-inner">';
    monthPos.forEach((p, i) => {
        const span = monthPos[i + 1] ? monthPos[i + 1].idx - p.idx : weeks.length - p.idx;
        // Use flex proportional to the number of week columns this month spans,
        // matching the fluid flex:1 layout of .heatmap-week columns.
        monthsH += `<span style="flex: ${span}; min-width: 0; overflow: hidden; text-align: left;">${p.name}</span>`;
    });
    monthsContainer.innerHTML = monthsH + '</div>';

    container.innerHTML = weeks.map(w => `<div class="heatmap-week">
        ${w.map(d => `<div class="heatmap-day level-${d.level}${!d.isCur ? ' faded' : ''}" title="${d.display}: ${formatTimeHuman(d.val)}"></div>`).join('')}
    </div>`).join('');
}

function renderCategoryChart(period = 'month') {
    const ctx = document.getElementById('category-chart').getContext('2d');
    const breakdown = FretLogData.getCategoryBreakdown(period);
    const total = breakdown.reduce((sum, c) => sum + c.totalTime, 0);
    if (categoryChart) categoryChart.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: breakdown.map(c => c.name),
            datasets: [{
                data: breakdown.map(c => c.totalTime / 60000),
                backgroundColor: breakdown.map(c => c.color || '#2E3A8C'),
                borderWidth: 2, borderColor: isDark ? '#1E2231' : '#FFFFFF'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => {
                            const m = Math.round(c.raw); const p = total > 0 ? Math.round((c.raw * 60000 / total) * 100) : 0;
                            return `${m}m (${p}%)`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });

    document.getElementById('category-list').innerHTML = breakdown.length ? breakdown.map(c => {
        const p = total > 0 ? Math.round((c.totalTime / total) * 100) : 0;
        return `<li class="practice-item"><div class="practice-item-info"><span class="practice-item-name">
            <span style="display:inline-block; width:12px; height:12px; background:${c.color}; border-radius:2px; margin-right:8px;"></span>
            ${escapeHtml(c.icon)} ${escapeHtml(c.name)}</span></div><span class="practice-item-time">${formatTimeHuman(c.totalTime)} (${p}%)</span></li>`;
    }).join('') : '<p class="text-center text-secondary">No data</p>';
}

function renderTopItems(period = 'month') {
    const items = FretLogData.getMostPracticedItems(period, 10);
    const list = document.getElementById('top-items-list');
    const empty = document.getElementById('no-top-items');

    if (!items.length) { list.classList.add('hidden'); empty.classList.remove('hidden'); return; }
    list.classList.remove('hidden'); empty.classList.add('hidden');
    const cats = FretLogData.getCategories();
    const libs = FretLogData.getLibraryItems();

    list.innerHTML = items.map((it, i) => {
        const li = libs.find(x => x.id === it.id);
        const c = cats.find(x => x.id === (li?.categoryId || li?.category_id));
        const badge = c ? `<span class="badge" style="background:${escapeHtml(c.color)}1a; color:${escapeHtml(c.color)}; border:1px solid ${escapeHtml(c.color)}33; margin-left:8px;">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</span>` : '';
        return `<li class="practice-item"><div class="practice-item-info"><span class="practice-item-name">
            <span class="text-secondary" style="margin-right:8px;">#${i + 1}</span>${escapeHtml(it.name)}${badge}</span></div>
            <span class="practice-item-time">${formatTimeHuman(it.totalTime)}</span></li>`;
    }).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    const init = FretLogData.init();
    const render = () => { updateSummaryCards(); renderTrendsChart('week'); renderHeatmap(); renderCategoryChart('month'); renderTopItems('month'); };
    await render(); await init; await render();

    document.querySelectorAll('#trends-period .period-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#trends-period .period-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
        renderTrendsChart(b.dataset.period);
    }));
    document.querySelectorAll('#category-period .period-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#category-period .period-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
        renderCategoryChart(b.dataset.period);
    }));
    document.querySelectorAll('#top-items-period .period-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#top-items-period .period-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
        renderTopItems(b.dataset.period);
    }));
    document.getElementById('prev-year').addEventListener('click', () => renderHeatmap(heatmapYear - 1));
    document.getElementById('next-year').addEventListener('click', () => { if (heatmapYear < new Date().getFullYear()) renderHeatmap(heatmapYear + 1); });

    document.getElementById('theme-toggle').addEventListener('click', () => {
        setTimeout(() => {
            renderTrendsChart(document.querySelector('#trends-period .period-btn.active')?.dataset.period || 'week');
            renderCategoryChart(document.querySelector('#category-period .period-btn.active')?.dataset.period || 'month');
        }, 100);
    });
    window.onInstrumentChange = render;
});
