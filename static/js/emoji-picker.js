/**
 * FretLog - Emoji Picker Component
 * Provides a premium emoji selection interface for icon fields
 */

const EMOJI_PICKER_GROUPS = {
    'Instruments': ['🎸', '🎹', '🥁', '🎻', '🎤', '🎷', '🎺', '🪗', '🪕', '🪘', '🪈', '🪇', '🪩', '🎵', '🎼', '🎶'],
    'Music': ['🎧', '📻', '🎙️', '💿', '📀', '🎹', '🎚️', '🎛️', '🎤', '🎵', '🎶', '📻', '🎸', '🎻', '🎺', '🎷'],
    'Activities': ['💪', '👂', '🎨', '🧠', '✍️', '📚', '🎓', '🎯', '🏆', '🌟', '✨', '⚡', '🔥', '🚀', '🌈'],
    'Objects': ['📝', '📅', '⏰', '📱', '💻', '💡', '🔑', '🏷️', '📦', '🎁', '🎈', '🎉', '🎊', '🎀'],
    'Emotions': ['😀', '😎', '🤩', '🥳', '🤔', '🧐', '😌', '🙌', '👏', '🤘', '❤️', '🔥', '✨']
};

class EmojiPicker {
    constructor() {
        this.picker = null;
        this.activeInput = null;
        this.currentGroup = 'Instruments';
        this.init();
    }

    init() {
        // Create picker element
        this.picker = document.createElement('div');
        this.picker.className = 'emoji-picker-container';
        this.picker.id = 'global-emoji-picker';
        this.picker.innerHTML = `
            <div class="emoji-picker-header">
                <div class="emoji-picker-tabs">
                    ${Object.keys(EMOJI_PICKER_GROUPS).map(group => `
                        <button class="emoji-picker-tab ${group === this.currentGroup ? 'active' : ''}" data-group="${group}">
                            ${group}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="emoji-picker-content"></div>
        `;

        document.body.appendChild(this.picker);

        // Add event listeners
        this.picker.querySelector('.emoji-picker-tabs').addEventListener('click', (e) => {
            const tab = e.target.closest('.emoji-picker-tab');
            if (tab) {
                this.setGroup(tab.dataset.group);
            }
        });

        this.picker.querySelector('.emoji-picker-content').addEventListener('click', (e) => {
            const item = e.target.closest('.emoji-item');
            if (item && this.activeInput) {
                this.activeInput.value = item.textContent;
                // Trigger input event for any listeners
                this.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
                this.hide();
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (this.picker.classList.contains('active') &&
                !this.picker.contains(e.target) &&
                !e.target.closest('.emoji-trigger')) {
                this.hide();
            }
        });

        this.renderEmojis();
    }

    setGroup(group) {
        this.currentGroup = group;
        this.picker.querySelectorAll('.emoji-picker-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.group === group);
        });
        this.renderEmojis();
    }

    renderEmojis() {
        const content = this.picker.querySelector('.emoji-picker-content');
        const emojis = EMOJI_PICKER_GROUPS[this.currentGroup];
        content.innerHTML = emojis.map(emoji => `
            <div class="emoji-item">${emoji}</div>
        `).join('');
    }

    show(input, trigger) {
        this.activeInput = input;
        const rect = trigger.getBoundingClientRect();

        this.picker.style.top = `${rect.bottom + window.scrollY + 8}px`;
        this.picker.style.left = `${rect.left + window.scrollX - 280}px`; // Align to right of trigger

        // Ensure it doesn't go off screen
        const pickerRect = this.picker.getBoundingClientRect();
        if (rect.left - 280 < 10) {
            this.picker.style.left = `10px`;
        }

        this.picker.classList.add('active');
    }

    hide() {
        this.picker.classList.remove('active');
        this.activeInput = null;
    }

    /**
     * Attaches the picker to an input field
     * @param {string} inputId The ID of the input field
     */
    attach(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        // Wrap input if not already wrapped
        let wrapper = input.closest('.emoji-input-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'emoji-input-wrapper';
            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);
        }

        // Add trigger button
        const trigger = document.createElement('button');
        trigger.className = 'emoji-trigger';
        trigger.type = 'button';
        trigger.innerHTML = '😀';
        trigger.title = 'Select Emoji';
        wrapper.appendChild(trigger);

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (input.disabled) return;
            if (this.picker.classList.contains('active') && this.activeInput === input) {
                this.hide();
            } else {
                this.show(input, trigger);
            }
        });
    }
}

// Global instance
window.FretLogEmojiPicker = new EmojiPicker();
