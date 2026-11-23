
(function () {
    'use strict';

    const ARROW_COLORS = ['#32CD32', '#FFA500', '#FFD700'];

    const PIECE_MAP = {
        'wp': 'P', 'wn': 'N', 'wb': 'B', 'wr': 'R', 'wq': 'Q', 'wk': 'K',
        'bp': 'p', 'bn': 'n', 'bb': 'b', 'br': 'r', 'bq': 'q', 'bk': 'k'
    };

    let settings = { enabled: true, depth: 15, multipv: 1 };
    let lastFen = '';
    let drawnFen = '';            
    let cachedOrientation = null;
    let arrowsSvg = null;
    let latestAnalysis = null;
    function loadSettings() {
        chrome.storage.local.get(['enabled', 'depth'], (result) => {
            settings.enabled = result.enabled !== false;
            settings.depth = Math.min(20, Math.max(10, result.depth || 15));
            settings.multipv = 1;
        });
    }

    function getBoardContext() {
        const board = document.querySelector('wc-chess-board');
        if (!board) return null;

        if (board.shadowRoot) {
            const pieces = board.shadowRoot.querySelectorAll('.piece');
            if (pieces.length > 0) return { root: board.shadowRoot, board, type: 'shadow' };
        }

        const pieces = board.querySelectorAll('.piece');
        if (pieces.length > 0) return { root: board, board, type: 'light' };

        const docPieces = document.querySelectorAll('.piece');
        if (docPieces.length > 0) return { root: document, board, type: 'document' };

        return null;
    }


    function createArrowsContainer() {
        if (arrowsSvg && arrowsSvg.isConnected) return;

        const context = getBoardContext();
        if (!context) return;

        let boardElement = context.board;
        if (context.type === 'shadow') {
            boardElement = context.root.querySelector('.board') || context.board;
        }

        arrowsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrowsSvg.id = 'stockfish-arrows';
        arrowsSvg.setAttribute('viewBox', '0 0 100 100');
        arrowsSvg.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: none; z-index: 100;
        `;

        boardElement.style.position = 'relative';
        boardElement.appendChild(arrowsSvg);
    }

    // Extract FEN
    function extractFEN() {
        const context = getBoardContext();
        if (!context) return null;

        const pieces = context.root.querySelectorAll('.piece');
        if (pieces.length === 0) return null;

        const boardArray = Array(8).fill(null).map(() => Array(8).fill(''));

        pieces.forEach(piece => {
            const match = piece.className.match(/square-(\d)(\d)/);
            if (!match) return;

            const file = parseInt(match[1]) - 1;
            const rank = parseInt(match[2]) - 1;

            for (const cls of piece.classList) {
                if (PIECE_MAP[cls]) {
                    boardArray[7 - rank][file] = PIECE_MAP[cls];
                    break;
                }
            }
        });

        let fen = '';
        for (let rank = 0; rank < 8; rank++) {
            let empty = 0;
            for (let file = 0; file < 8; file++) {
                const p = boardArray[rank][file];
                if (p === '') { empty++; }
                else {
                    if (empty > 0) { fen += empty; empty = 0; }
                    fen += p;
                }
            }
            if (empty > 0) fen += empty;
            if (rank < 7) fen += '/';
        }

        return `${fen} ${detectTurn()} KQkq - 0 1`;
    }


    function detectTurn() {
        const clocks = document.querySelectorAll('.clock-component');
        for (const clock of clocks) {
            if (clock.classList.contains('clock-player-turn') || clock.classList.contains('clock-running')) {
                const rect = clock.getBoundingClientRect();
                const boardRect = document.querySelector('wc-chess-board')?.getBoundingClientRect();
                if (boardRect) {
                    const isBottom = rect.top > boardRect.top + boardRect.height / 2;
                    const isFlipped = document.querySelector('wc-chess-board')?.classList.contains('flipped');
                    return isBottom ? (isFlipped ? 'b' : 'w') : (isFlipped ? 'w' : 'b');
                }
            }
        }
        const moves = document.querySelectorAll('.move-text-component, [data-ply]');
        return moves.length % 2 === 0 ? 'w' : 'b';
    }


    function getBoardOrientation() {
        const board = document.querySelector('wc-chess-board');
        if (!board) return 'white';
        const isFlipped = board.classList.contains('flipped') || board.getAttribute('flipped') === 'true';
        cachedOrientation = isFlipped ? 'black' : 'white';
        return cachedOrientation;
    }


    function squareToCoords(square) {
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;
        const orientation = cachedOrientation || getBoardOrientation();
        return orientation === 'white' ? { x: file, y: 7 - rank } : { x: 7 - file, y: rank };
    }


    function drawArrow(from, to, colorIndex) {
        if (!arrowsSvg || !arrowsSvg.isConnected) {
            createArrowsContainer();
            if (!arrowsSvg) return;
        }

        const fromCoords = squareToCoords(from);
        const toCoords = squareToCoords(to);
        const squareSize = 12.5;

        const fromX = (fromCoords.x + 0.5) * squareSize;
        const fromY = (fromCoords.y + 0.5) * squareSize;
        const targetX = (toCoords.x + 0.5) * squareSize;
        const targetY = (toCoords.y + 0.5) * squareSize;
        const dx = targetX - fromX;
        const dy = targetY - fromY;
        const distance = Math.hypot(dx, dy);
        if (distance === 0) return;

        const startPadding = Math.min(3.2, distance * 0.2);
        const endPadding = Math.min(3.2, distance * 0.2);
        const unitX = dx / distance;
        const unitY = dy / distance;
        const x1 = fromX + unitX * startPadding;
        const y1 = fromY + unitY * startPadding;
        const x2 = targetX - unitX * endPadding;
        const y2 = targetY - unitY * endPadding;

        const color = ARROW_COLORS[colorIndex];
        const opacity = 0.7 - colorIndex * 0.1;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '2.8');
        line.setAttribute('stroke-opacity', Math.min(opacity, 0.65));
        line.setAttribute('stroke-linecap', 'round');
        arrowsSvg.appendChild(line);
    }

    function clearArrows() {
        if (arrowsSvg) {
            arrowsSvg.innerHTML = '';
        }
    }


    function parseUCIMove(move) {
        if (!move || move.length < 4) return null;
        return { from: move.substring(0, 2), to: move.substring(2, 4) };
    }

    function displayAnalysis(data) {
        if (!settings.enabled || !data?.moves) return;

        if (data.fen) {
            const analysisFenPosition = data.fen.split(' ')[0];
            if (analysisFenPosition !== lastFen) return;
        }

        latestAnalysis = data;

        if (data.moves.length > 0) {
            clearArrows();
            getBoardOrientation();
        }

        data.moves.forEach((move, index) => {
            if (!move) return;
            const parsed = parseUCIMove(move.move);
            if (parsed) drawArrow(parsed.from, parsed.to, index);
        });

        drawnFen = lastFen;
        if (analysisWatchdog) { clearTimeout(analysisWatchdog); analysisWatchdog = null; }
    }

    // Analyze current position
    // The observer watches 'class' only (not animation 'style' frames), so this
    // fires roughly once per move rather than once per animation frame. We still
    // extract the FEN and bail out cheaply when the piece layout is unchanged,
    // then debounce so a burst of mutations for one move yields a single analysis.
    const DEBOUNCE_DELAY = 100;
    // Self-heal: if no arrows are drawn for the position we just requested (a dropped, late, or
    // engine-suppressed result would otherwise leave the board blank until the user toggles the
    // extension off/on — the only path that resets lastFen), re-request it. Bounded so a genuinely
    // dead engine can't spin. Paired with displayAnalysis, which records drawnFen on success.
    const ANALYSIS_WATCHDOG_DELAY = 1500;
    const ANALYSIS_WATCHDOG_MAX_RETRIES = 3;

    let debounceTimer = null;
    let pendingFen = null;
    let analysisWatchdog = null;
    let analysisWatchdogFen = null;
    let analysisWatchdogPlacement = null;
    let analysisWatchdogRetries = 0;

    function scheduleAnalysisWatchdog() {
        if (analysisWatchdog) clearTimeout(analysisWatchdog);
        analysisWatchdog = setTimeout(() => {
            analysisWatchdog = null;
            if (!settings.enabled || drawnFen === analysisWatchdogPlacement
                || analysisWatchdogRetries >= ANALYSIS_WATCHDOG_MAX_RETRIES) {
                return;
            }
            analysisWatchdogRetries++;
            sendAnalyze(analysisWatchdogFen);
            scheduleAnalysisWatchdog();
        }, ANALYSIS_WATCHDOG_DELAY);
    }

    function sendAnalyze(fen) {
        chrome.runtime.sendMessage({
            type: 'analyze',
            fen: fen,
            depth: settings.depth,
            multipv: settings.multipv
        }).catch(() => { });
    }

    function armAnalysisWatchdog(fen, placement) {
        analysisWatchdogFen = fen;
        analysisWatchdogPlacement = placement;
        analysisWatchdogRetries = 0;
        scheduleAnalysisWatchdog();
    }

    function flushAnalysis() {
        const fen = pendingFen;
        pendingFen = null;
        if (!fen || !settings.enabled) return;

        lastFen = fen.split(' ')[0];
        clearArrows();
        drawnFen = '';                // nothing rendered yet for this request
        sendAnalyze(fen);
        armAnalysisWatchdog(fen, lastFen);
    }

    function cancelPendingAnalysis() {
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        if (analysisWatchdog) { clearTimeout(analysisWatchdog); analysisWatchdog = null; }
        analysisWatchdogFen = null;
        analysisWatchdogPlacement = null;
        analysisWatchdogRetries = 0;
        pendingFen = null;
    }

    function analyzeCurrentPosition() {
        if (!settings.enabled) return;

        const fen = extractFEN();
        if (!fen) return;

        const fenPosition = fen.split(' ')[0];
        // Ignore mutations that don't change the piece layout.
        if (fenPosition === lastFen) return;

        pendingFen = fen;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            flushAnalysis();
        }, DEBOUNCE_DELAY);
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'analysis') {
            displayAnalysis(message.data);
        }
        if (message.type === 'analysisProgress'
            && message.fen?.split(' ')[0] === lastFen
            && analysisWatchdog) {
            scheduleAnalysisWatchdog();
        }
        if (message.type === 'settingsUpdate') {
            settings.enabled = message.settings.enabled;
            settings.depth = Math.min(20, Math.max(10, message.settings.depth));
            settings.multipv = 1;

            if (!settings.enabled) {
                cancelPendingAnalysis();
                clearArrows();
            } else {
                lastFen = '';
                analyzeCurrentPosition();
            }
            sendResponse({ status: 'updated' });
        }
        if (message.type === 'getAnalysis') {
            sendResponse({ analysis: latestAnalysis });
        }
        return true;
    });

    let boardObserver = null;
    let observedBoard = null;
    function attachBoardObserver() {
        const context = getBoardContext();
        if (!context) return false;

        if (boardObserver) boardObserver.disconnect();
        observedBoard = context.board;

        boardObserver = new MutationObserver(() => {
            cachedOrientation = null;
            analyzeCurrentPosition();
        });
        boardObserver.observe(context.root === document ? context.board : context.root, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['class']
        });
        return true;
    }

    function setupObserver() {
        if (!attachBoardObserver()) {
            setTimeout(setupObserver, 1000);
            return;
        }

        createArrowsContainer();
        loadSettings();
        const docObserver = new MutationObserver(() => {
            const board = document.querySelector('wc-chess-board');
            if (!board) {
                arrowsSvg = null;
                observedBoard = null;
                return;
            }
            if (board !== observedBoard) {
                if (!arrowsSvg || !arrowsSvg.isConnected) createArrowsContainer();
                if (attachBoardObserver()) analyzeCurrentPosition();
            }
        });
        docObserver.observe(document.body, { childList: true, subtree: true });

        setTimeout(analyzeCurrentPosition, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupObserver);
    } else {
        setupObserver();
    }

})();
