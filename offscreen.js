const defaultFreqs = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20480];
const defaultQs = [0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071, 0.7071];

let audioCtx = null;
let inputGainNode = null;
let globalGainNode = null;
let analyser = null;
let filters = [];
let activeStreams = {}; 

function getStorage(key) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'STORAGE_GET', key: key }, resolve);
    });
}
function setStorage(data) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'STORAGE_SET', data: data }, resolve);
    });
}

async function initAudio() {
    if (audioCtx) return;

    audioCtx = new AudioContext({ latencyHint: "playback" });
    inputGainNode = audioCtx.createGain();
    globalGainNode = audioCtx.createGain();

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0.5;

    let prevNode = inputGainNode;

    for (let i = 0; i < 11; i++) {
        let f = audioCtx.createBiquadFilter();
        if (i === 0) f.type = 'lowshelf';
        else if (i === 10) f.type = 'highshelf';
        else f.type = 'peaking';

        f.frequency.value = defaultFreqs[i];
        f.Q.value = defaultQs[i];
        f.gain.value = 0;

        filters.push(f);
        prevNode.connect(f);
        prevNode = f;
    }

    prevNode.connect(globalGainNode);
    globalGainNode.connect(audioCtx.destination);
    globalGainNode.connect(analyser);

    const data = await getStorage(null);
    if (data && data.globalGain !== undefined) globalGainNode.gain.value = data.globalGain;
    
    for (let i = 0; i < 11; i++) {
        const fData = data ? data[`filter${i}`] : null;
        if (fData) {
            filters[i].frequency.value = fData.f;
            filters[i].gain.value = fData.g;
            filters[i].Q.value = fData.q;
        }
    }
}

function broadcastWorkspaceStatus() {
    const status = {
        type: "sendWorkspaceStatus",
        eqFilters: filters.map(f => ({
            frequency: f.frequency.value,
            gain: f.gain.value,
            type: f.type,
            q: f.Q.value
        })),
        streams: Object.values(activeStreams).map(s => s.tabInfo),
        gain: globalGainNode ? globalGainNode.gain.value : 1
    };
    chrome.runtime.sendMessage(status, () => { let err = chrome.runtime.lastError; });
}

async function broadcastPresets() {
    const data = await getStorage("PRESETS");
    chrome.runtime.sendMessage({
        type: "sendPresets",
        presets: (data && data.PRESETS) ? data.PRESETS : {}
    }, () => { let err = chrome.runtime.lastError; });
}

function fullRefresh() {
    broadcastWorkspaceStatus();
    broadcastPresets();
    if (audioCtx) {
        chrome.runtime.sendMessage({ type: "sendSampleRate", Fs: audioCtx.sampleRate }, () => { let err = chrome.runtime.lastError; });
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'OFFSCREEN_START_EQ') {
        (async () => {
            await initAudio();
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        mandatory: {
                            chromeMediaSource: 'tab',
                            chromeMediaSourceId: msg.streamId
                        }
                    }
                });

                if (activeStreams[msg.tab.id]) {
                    activeStreams[msg.tab.id].stream.getTracks().forEach(t => t.stop());
                }

                const sourceNode = audioCtx.createMediaStreamSource(stream);
                sourceNode.connect(inputGainNode);

                activeStreams[msg.tab.id] = {
                    stream: stream,
                    sourceNode: sourceNode,
                    tabInfo: msg.tab
                };

                if (audioCtx.state === 'suspended') audioCtx.resume();
                fullRefresh();

            } catch (err) {
                console.error("Ошибка захвата аудио в offscreen:", err);
            }
        })();
        return false;
    }

    if (msg.type === 'OFFSCREEN_STOP_EQ' || msg.type === 'disconnectTab') {
        const tabId = msg.tab ? msg.tab.id : msg.tabId;
        if (activeStreams[tabId]) {
            activeStreams[tabId].sourceNode.disconnect();
            activeStreams[tabId].stream.getTracks().forEach(t => t.stop());
            delete activeStreams[tabId];
            fullRefresh();
        }
        return false;
    }

    if (msg.type === 'modifyFilter') {
        const f = filters[msg.index];
        if (f) {
            f.frequency.value = msg.frequency;
            f.gain.value = msg.gain;
            f.Q.value = msg.q;
            setStorage({ [`filter${msg.index}`]: { f: msg.frequency, g: msg.gain, q: msg.q } });
            broadcastWorkspaceStatus();
        }
    }

    if (msg.type === 'modifyGain') {
        if (globalGainNode) {
            let val = msg.gain;
            if (val > 10) val = 10;
            if (val < 0.00316) val = 0.00316;
            globalGainNode.gain.value = val;
            setStorage({ globalGain: val });
        }
    }

    if (msg.type === 'resetFilters') {
        filters.forEach((f, i) => {
            f.frequency.value = defaultFreqs[i];
            f.gain.value = 0;
            f.Q.value = defaultQs[i];
            setStorage({ [`filter${i}`]: { f: defaultFreqs[i], g: 0, q: defaultQs[i] } });
        });
        if (globalGainNode) {
            globalGainNode.gain.value = 1;
            setStorage({ globalGain: 1 });
        }
        fullRefresh();
    }

    if (msg.type === 'resetFilter') {
        const i = msg.index;
        if (filters[i]) {
            filters[i].frequency.value = defaultFreqs[i];
            filters[i].gain.value = 0;
            filters[i].Q.value = defaultQs[i];
            setStorage({ [`filter${i}`]: { f: defaultFreqs[i], g: 0, q: defaultQs[i] } });
        }
    }

    // Единственный метод, который возвращает true, так как он синхронно отвечает
    if (msg.type === 'getFFT') {
        if (analyser) {
            const dataArray = new Float32Array(analyser.frequencyBinCount);
            analyser.getFloatFrequencyData(dataArray);
            sendResponse({ type: "fft", fft: Array.from(dataArray) });
        } else {
            sendResponse({ type: "fft", fft: [] });
        }
        return true; 
    }

    if (msg.type === 'getFullRefresh') {
        initAudio().then(() => fullRefresh());
    }

    if (msg.type === 'savePreset') {
        (async () => {
            const data = await getStorage("PRESETS");
            let presets = (data && data.PRESETS) ? data.PRESETS : {};
            presets[msg.preset] = {
                frequencies: filters.map(f => f.frequency.value),
                gains: filters.map(f => f.gain.value),
                qs: filters.map(f => f.Q.value)
            };
            await setStorage({ PRESETS: presets });
            fullRefresh();
        })();
    }

    if (msg.type === 'preset') {
        (async () => {
            let freqs = [], gains = [], qs = [];
            if (msg.preset === 'bassBoost') {
                freqs = [...defaultFreqs];
                gains = [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                qs = [...defaultQs];
                freqs[0] = 340;
            } else {
                const data = await getStorage("PRESETS");
                const presets = (data && data.PRESETS) ? data.PRESETS : {};
                if (presets[msg.preset]) {
                    freqs = presets[msg.preset].frequencies;
                    gains = presets[msg.preset].gains;
                    qs = presets[msg.preset].qs;
                } else return;
            }

            for (let i = 0; i < 11; i++) {
                filters[i].frequency.value = freqs[i];
                filters[i].gain.value = gains[i];
                filters[i].Q.value = qs[i];
                setStorage({ [`filter${i}`]: { f: freqs[i], g: gains[i], q: qs[i] } });
            }
            fullRefresh();
        })();
    }

    if (msg.type === 'deletePreset') {
        (async () => {
            const data = await getStorage("PRESETS");
            let presets = (data && data.PRESETS) ? data.PRESETS : {};
            delete presets[msg.preset];
            await setStorage({ PRESETS: presets });
            fullRefresh();
        })();
    }

    if (msg.type === 'importPresets') {
        (async () => {
            const data = await getStorage("PRESETS");
            let presets = (data && data.PRESETS) ? data.PRESETS : {};
            
            const newPresets = msg.presets || {};
            for (let key in newPresets) {
                presets[key] = newPresets[key];
            }
            
            await setStorage({ PRESETS: presets });
            fullRefresh();
        })();
    }
});