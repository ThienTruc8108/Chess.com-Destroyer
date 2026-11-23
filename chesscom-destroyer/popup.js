// Popup Script - Extension Settings & Analysis Display

document.addEventListener('DOMContentLoaded', () => {
    const enabledCheckbox = document.getElementById('enabledCheckbox');
    const depthSlider = document.getElementById('depthSlider');
    const depthValue = document.getElementById('depthValue');
    const movesList = document.getElementById('movesList');
    const currentDepthText = document.getElementById('currentDepth');

    let isEnabled = true;
    let currentTabId = null;

    chrome.storage.local.get(['enabled', 'depth'], (result) => {
        isEnabled = result.enabled !== false;
        enabledCheckbox.checked = isEnabled;

        const depth = Math.min(20, Math.max(10, result.depth || 15));
        depthSlider.value = depth;
        depthValue.textContent = depth;

        updateUIState();
    });


    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url?.includes('chess.com')) {
            currentTabId = tabs[0].id;
            chrome.runtime.sendMessage({ type: 'getLatestAnalysis' }, (response) => {
                if (response && response.analysis) {
                    displayAnalysis(response.analysis);
                }
            });
        }
    });


    enabledCheckbox.addEventListener('change', () => {
        isEnabled = enabledCheckbox.checked;
        chrome.storage.local.set({ enabled: isEnabled });
        updateUIState();
        notifyContentScript();
    });

    function updateUIState() {
        if (!isEnabled) {
            movesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⏸</div>
                    <p class="empty-text">Analysis disabled</p>
                </div>
            `;
            currentDepthText.textContent = 'Depth: 0';
        }
    }

    // Depth slider
    function setupSlider(slider, valueEl, storageKey) {
        slider.addEventListener('input', () => {
            valueEl.textContent = slider.value;
        });
        slider.addEventListener('change', () => {
            chrome.storage.local.set({ [storageKey]: parseInt(slider.value) });
            notifyContentScript();
        });
    }

    setupSlider(depthSlider, depthValue, 'depth');

    function notifyContentScript() {
        if (!currentTabId) return;

        chrome.tabs.sendMessage(currentTabId, {
            type: 'settingsUpdate',
            settings: {
                enabled: isEnabled,
                depth: parseInt(depthSlider.value),
                multipv: 1
            }
        });
    }

    // Display analysis results
    function displayAnalysis(data) {
        if (!isEnabled) return;

        if (!data || !data.moves || data.moves.length === 0) {
            movesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p class="empty-text">Analyzing...</p>
                </div>
            `;
            currentDepthText.textContent = 'Depth: 0';
            return;
        }

        currentDepthText.textContent = `Depth: ${data.depth}`;

        const classes = ['best', 'second', 'third'];
        let html = '';

        data.moves.forEach((move, index) => {
            if (!move) return;

            // Normalize score for the bar (cap at +/- 400 cp)
            const scoreCp = move.isMate ? 400 : Math.abs(move.score);
            const barWidth = Math.min(100, (scoreCp / 400) * 100);

            const scoreText = move.isMate
                ? `M${move.score > 0 ? '+' : ''}${move.score}`
                : `${move.score > 0 ? '+' : ''}${(move.score / 100).toFixed(1)}`;

            html += `
                <div class="move-item ${classes[index] || ''}">
                    <div class="move-rank">${index + 1}</div>
                    <span class="move-name">${move.move}</span>
                    <div class="move-bar-container">
                        <div class="move-bar" style="width: ${barWidth}%"></div>
                    </div>
                    <span class="move-score">${scoreText}</span>
                </div>
            `;
        });

        movesList.innerHTML = html;
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'analysisUpdate' && isEnabled) {
            displayAnalysis(message.data);
        }
    });
});
