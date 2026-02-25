let offscreenCreating;

async function ensureOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL('offscreen.html');
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) return;
    if (offscreenCreating) {
        await offscreenCreating;
        return;
    }

    offscreenCreating = chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Ears EQ Audio processing'
    });
    
    await offscreenCreating;
    offscreenCreating = null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ПРОКСИ ДЛЯ ХРАНИЛИЩА
    if (request.type === 'STORAGE_GET') {
        chrome.storage.local.get(request.key).then(sendResponse);
        return true;
    }
    if (request.type === 'STORAGE_SET') {
        chrome.storage.local.set(request.data).then(() => sendResponse({success: true}));
        return true;
    }

    if (request.forwarded) return false;

    // Быстрый канал для визуализатора
    if (request.type === 'getFFT') {
        chrome.runtime.sendMessage({ ...request, forwarded: true }, (response) => {
            if (chrome.runtime.lastError || !response) {
                sendResponse({ type: "fft", fft: [] });
            } else {
                sendResponse(response);
            }
        });
        return true; 
    }

    // Включение/выключение эквалайзера
    if (request.type === 'eqTab') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs || tabs.length === 0) return;
            const tab = tabs[0];
            
            // Не пытаемся захватить служебные страницы Chrome (вызовет ошибку)
            if (tab.url && tab.url.startsWith("chrome")) return;

            await ensureOffscreenDocument();

            if (request.on) {
                chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
                    // ИСПРАВЛЕНИЕ: Перехватываем и игнорируем ошибку, если вкладка уже захвачена
                    if (chrome.runtime.lastError) {
                        return; 
                    }
                    if (!streamId) return;
                    
                    chrome.runtime.sendMessage({
                        type: 'OFFSCREEN_START_EQ',
                        tab: tab,
                        streamId: streamId,
                        forwarded: true
                    }, () => { let err = chrome.runtime.lastError; });
                });
            } else {
                chrome.runtime.sendMessage({
                    type: 'OFFSCREEN_STOP_EQ',
                    tab: tab,
                    forwarded: true
                }, () => { let err = chrome.runtime.lastError; });
            }
        });
        return false; 
    }

    // Все остальные команды
    const requiresOffscreen = [
        'onPopupOpen', 'getFullRefresh', 'getWorkspaceStatus',
        'modifyFilter', 'modifyGain', 'resetFilters', 'resetFilter',
        'preset', 'savePreset', 'importPresets', 'deletePreset', 'exportPresets',
        'disconnectTab'
    ];

    if (requiresOffscreen.includes(request.type)) {
        ensureOffscreenDocument().then(() => {
            chrome.runtime.sendMessage({ ...request, forwarded: true }, () => {
                let err = chrome.runtime.lastError; // Гасим предупреждение
            });
        });
        return false;
    }
});

// Отключаем эквалайзер при закрытии вкладки
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.runtime.sendMessage({
        type: 'OFFSCREEN_STOP_EQ',
        tab: { id: tabId },
        forwarded: true
    }, () => { let err = chrome.runtime.lastError; });
});