// Shared startup behavior for every page.
(function () {
    if (FretLogData && FretLogData.loadFromCache) {
        FretLogData.loadFromCache();
    }

    updateUserDisplay();

    const confirmBtn = document.getElementById('confirm-instrument');
    const instrumentSelect = document.getElementById('select-instrument');

    if (confirmBtn && instrumentSelect) {
        const instruments = FretLogData.getInstruments().sort((a, b) => a.name.localeCompare(b.name));
        instrumentSelect.innerHTML = instruments.map(i =>
            `<option value="${escapeHtml(i.id)}">${escapeHtml(i.icon)} ${escapeHtml(i.name)}</option>`
        ).join('');

        const currentInst = FretLogData.getCurrentInstrument();
        if (currentInst) instrumentSelect.value = currentInst.id;

    }
})();
