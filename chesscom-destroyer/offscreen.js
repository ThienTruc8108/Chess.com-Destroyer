let stockfish = null;
let uciokReceived = false;
let readyWatchdog = null;

function reportError(reason) {
    chrome.runtime.sendMessage({ type: 'stockfishError', reason }).catch(() => { });
}

function initStockfish() {
    if (stockfish) return;

    const stockfishUrl = chrome.runtime.getURL('stockfish.js');

    try {
        stockfish = new Worker(stockfishUrl);
    } catch (err) {
        console.error('[Offscreen] Failed to create worker:', err);
        reportError('worker-create-failed');
        return;
    }

    stockfish.addEventListener('message', (e) => {
        const line = e.data;

        if (line.includes('uciok')) {
            uciokReceived = true;
            if (readyWatchdog) { clearTimeout(readyWatchdog); readyWatchdog = null; }
            stockfish.postMessage('setoption name Hash value 128');
            stockfish.postMessage('isready');
        }

        chrome.runtime.sendMessage({
            type: 'stockfishOutput',
            line: line
        }).catch(() => { });
    });

    stockfish.onerror = (e) => {
        console.error('[Stockfish] Worker error:', e.message || e);
        reportError('worker-error');
    };
    readyWatchdog = setTimeout(() => {
        if (!uciokReceived) reportError('engine-timeout');
    }, 10000);


    stockfish.postMessage('uci');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'stockfishCommand') {
        if (!stockfish) initStockfish();
        if (!stockfish) {
            sendResponse({ status: 'error' });
            return true;
        }
        stockfish.postMessage(message.command);
        sendResponse({ status: 'sent' });
    }

    if (message.type === 'initStockfish') {
        initStockfish();
        sendResponse({ status: 'initializing' });
    }

    return true;
});
initStockfish();
