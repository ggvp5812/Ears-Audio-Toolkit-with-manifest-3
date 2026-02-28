// popup.js (Финальная версия для Manifest V3)

function scope() {
    var e = chrome.runtime.getManifest().version;
    
    document.addEventListener("DOMContentLoaded", function(e) {
        _();
        n();
        
        // Автоматически включаем эквалайзер на активной вкладке при открытии popup
        chrome.runtime.sendMessage({ type: "eqTab", on: true });
    });

    document.addEventListener("DOMContentLoaded", function() {
        var n = document.getElementById("presetNameInput");
        var e = document.getElementById("resetFiltersButton");
        
        e.onclick = function() {
            n.value = "";
            chrome.runtime.sendMessage({ type: "resetFilters" });
        };
        
        var t = document.getElementById("bassBoostButton");
        t.onclick = function() {
            n.value = "";
            chrome.runtime.sendMessage({ type: "preset", preset: "bassBoost" });
        };
        
        var r = document.getElementById("requiresProDiv");
        function showWarning(text) {
            r.textContent = text;
            r.classList.add("show");
            setTimeout(function() {
                r.classList.remove("show");
            }, 5000);
        }
        
        var i = document.getElementById("savePresetButton");
        i.onclick = function() {
            var e = n.value.trim();
            if (e != "") {
                chrome.runtime.sendMessage({ type: "savePreset", preset: e });
            } else {
                showWarning("Type a name in the Preset Name box, then click Save Preset or press Enter.");
                n.focus();
            }
        };
        
        var o = document.getElementById("deletePresetButton");
        o.onclick = function() {
            var e = n.value.trim();
            if (e != "") {
                chrome.runtime.sendMessage({ type: "deletePreset", preset: e });
                n.value = "";
            }
        };
        
        n.onkeypress = function(e) {
            if (!e) e = window.event;
            var t = e.keyCode || e.which;
            if (t == "13" && document.activeElement == n) {
                i.click();
                return false;
            }
        };
        
        // ЭКСПОРТ ПРЕСЕТОВ
        var s = document.getElementById("exportPresetsButton");
        s.onclick = function() {
            chrome.storage.local.get("PRESETS", function(data) {
                var presets = data.PRESETS || {};
                var blob = new Blob([JSON.stringify(presets, null, 2)], {type: "text/plain;charset=UTF-8"});
                var url = window.URL.createObjectURL(blob);
                var a = document.createElement("a");
                a.href = url;
                a.download = "EarsAudioToolkitPresets.json";
                a.style.display = "none";
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            });
        };
        
        // ИМПОРТ ПРЕСЕТОВ
        var c = document.getElementById("importPresetsButton");
        var u = document.getElementById("importPresetsFile");
        c.onclick = function() {
            u.click();
        };
        u.onchange = function() {
            var e = u.files;
            for (var t = 0; t < e.length; t++) {
                var reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        let parsed = JSON.parse(e.target.result);
                        chrome.runtime.sendMessage({ type: "importPresets", presets: parsed });
                        showWarning("Presets imported successfully!");
                    } catch (err) {
                        showWarning("Invalid preset file!");
                    }
                };
                reader.readAsText(e[t]);
            }
            u.value = ""; 
        };
        
        var l = document.getElementById("vizButton");
        function updateVizButtonState() {
            if (isVisualizerOn()) {
                l.classList.add("on");
            } else {
                l.classList.remove("on");
            }
        }
        
        updateVizButtonState();
        l.onclick = function() {
            toggleVisualizer();
            updateVizButtonState();
        };
        
        var v = ["tab-1", "tab-2", "tab-3"];
        for (var d = 0; d < v.length; d++) {
            var h = v[d];
            document.getElementById(h).addEventListener("change", function(e) {
                return function() {
                    if (this.checked) {
                        localStorage["last-tab"] = e;
                    }
                };
            }(h));
        }
        
        var m = localStorage["last-tab"];
        if (m) {
            var g = document.getElementById(m);
            if (g) g.click();
        }
        
        if (window.innerWidth && window.innerWidth > 1000) {
            document.getElementById("fullscreen-link").style.display = "none";
        }
    });

    function n() {
        chrome.runtime.sendMessage({ type: "getFullRefresh" });
    }

    function _() {
        chrome.runtime.sendMessage({ type: "onPopupOpen" });
    }

    var E = 44100;
    var i = true;
    
    var autoRefresh = function() {
        if (i) {
            n();
            setTimeout(autoRefresh, 1000);
        }
    };
    setTimeout(autoRefresh, 1000);

    chrome.runtime.onMessage.addListener(function(e, t, n) {
        if (e.type == "sendWorkspaceStatus") {
            i = false; 
            renderWorkspace(e);
        }
        if (e.type == "sendSampleRate") {
            E = e.Fs;
        }
        if (e.type == "sendPresets") {
            renderPresets(e);
        }
    });

    // Отрисовка визуализатора спектра (FFT)
    function drawVisualizer(e) {
        if (S) {
            var t = 1000 / 30 - (performance.now() - S);
            if (t > 0) {
                setTimeout(requestFFT, t);
                return;
            }
        }
        S = performance.now();
        if (C) C.remove();
        if (!isVisualizerOn()) return;
        
        var n = e.fft;
        if (I && n && n.length > 0) {
            var strokeGradient = I.gradient("l(.5, 0, .5, 1)" + m + "-" + q);
            var r =[];
            
            function a(e) { return B - 1 - e; }
            
            for (var i in n) {
                var o = i * E / (n.length * 2);
                if (o < 10) continue;
                var s = P(o);
                if (s > T) break;
                var c = (n[i] + 100) / 100 * B;
                r.push([s, c]);
            }
            
            var u =[];
            for (var i in r) {
                var l = r[i];
                if (u.length == 0) {
                    u.push(l);
                    continue;
                }
                var f = u[u.length - 1];
                if (l[0] - f[0] < 2) {
                    if (l[1] > f[1]) f[1] = l[1];
                } else {
                    u.push(l);
                }
            }
            
            var d = [];
            for (var i in u) {
                d = d.concat([u[i][0], a(u[i][1])]);
            }
            
            C = I.polyline(d).attr({ "fill-opacity": "0", stroke: strokeGradient, "pointer-events": "none" });
        }
        requestFFT();
    }

    function requestFFT() {
        chrome.runtime.sendMessage({ type: "getFFT" }, drawVisualizer);
    }

    function renderPresets(e) {
        var t = e.presets || {};
        var n = document.getElementById("userPresetSpan");
        while (n.firstChild) {
            n.removeChild(n.firstChild);
        }
        var r = Object.keys(t);
        for (var a = 0; a < r.length; a++) {
            (function(e) {
                var btn = document.createElement("button");
                btn.textContent = e;
                n.appendChild(btn);
                btn.onclick = function() {
                    chrome.runtime.sendMessage({ type: "preset", preset: e });
                    document.getElementById("presetNameInput").value = e;
                };
            })(r[a]);
        }
    }

    function setupTabButtonStart() {
        var e = document.getElementById("eqTabButton");
        e.onclick = function() {
            chrome.runtime.sendMessage({ type: "eqTab", on: true });
            setupTabButtonStop(); 
        };
        e.textContent = "EQ This Tab";
    }

    function setupTabButtonStop() {
        var e = document.getElementById("eqTabButton");
        e.onclick = function() {
            chrome.runtime.sendMessage({ type: "eqTab", on: false });
            setupTabButtonStart();
        };
        e.textContent = "Stop EQing This Tab";
    }

    var visualizerKey = "SHOW_VISUALIZER";
    function isVisualizerOn() {
        return localStorage[visualizerKey] == "true" || localStorage[visualizerKey] == true;
    }

    function toggleVisualizer() {
        localStorage[visualizerKey] = !isVisualizerOn();
        if (isVisualizerOn()) {
            requestFFT();
        }
    }

    var m = "wheat", q = "#2C3E50", b = "#9573A8", w = "#CDF7E1";
    var T = 600, B = 300, g = 30, c = 22050, u = 30, M = 10, k = -30;
    var I = null, C = null, S = null, x = null;

    function renderWorkspace(e) {
        var s =[];
        for (var t = 0; t < e.eqFilters.length; t++) {
            var n = e.eqFilters[t];
            var r = {};
            r.x = P(n.frequency);
            r.y = F(n.gain);
            r.w = n.frequency / n.q;
            r.t = n.type;
            r.gain = n.gain;
            r.q = n.q;
            r.frequency = n.frequency;
            s.push(r);
        }
        var i = { gain: e.gain, y: F(fe(e.gain)) };
        initSVG(s, i);
        renderActiveTabs(e.streams);
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if(tabs && tabs[0] && e.streams && e.streams.find(tab => tab.id === tabs[0].id)) {
                setupTabButtonStop();
            } else {
                setupTabButtonStart();
            }
        });
    }

    function renderActiveTabs(e) {
        var t = document.getElementById("eqTabList");
        t.innerHTML = "";
        if (!e || e.length == 0) {
            t.textContent = "No tabs active. Click 'EQ This Tab' below to activate this tab.";
            return;
        }
        var n = document.createElement("table");
        for (var r = 0; r < e.length; r++) {
            if (e[r]) n.appendChild(createTabRow(e[r]));
        }
        t.appendChild(n);
    }

    function createTabRow(e) {
        var t = document.createElement("tr");
        var n = document.createElement("button");
        n.textContent = "Stop EQing";
        n.onclick = function() {
            chrome.runtime.sendMessage({ type: "disconnectTab", tab: e });
        };
        var r = document.createElement("img");
        r.className = "tabFavIcon";
        r.src = e.favIconUrl || "";
        r.alt = "";
        n.appendChild(r);
        
        var a = document.createElement("td");
        a.appendChild(n);
        t.appendChild(a);
        
        var i = document.createElement("td");
        var o = e.title || "Unknown Tab";
        if (o.length > 45) o = o.substring(0, 45);
        i.textContent = o;
        t.appendChild(i);
        return t;
    }

    function initSVG(e, t) {
        if (I) I.clear();
        if (x) x.clear();
        
        I = Snap("#eqSvg");
        I.attr({ fill: q, height: B, width: T });
        x = Snap("#gainSvg");
        x.attr({ fill: q, height: B, width: g });
        
        var n = { fill: m, stroke: m };
        I.rect(0, 0, T, B).attr({ stroke: m });
        
        drawResponseCurves(I, e);
        drawGrid(I);
        
        x.line(g / 2, F(k), g / 2, F(M)).attr({ stroke: "wheat", opacity: .5 });
        x.text(g / 2, F(M) - 10, "volume").attr({ fill: "wheat", "text-anchor": "middle", "font-size": 8 });
        x.line(g / 2 - 5, F(0), g / 2 + 5, F(0)).attr({ stroke: "wheat" });
        
        var s = x.line(0, t.y, g, t.y).attr({ stroke: "wheat" }).addClass("gainLine");
        s.drag(onGainDrag(s), onDragStart, onGainDragEnd(s));
        
        for (var c = 0; c < e.length; c++) {
            var u = e[c];
            var l = u.x;
            var f = u.y;
            var v = n;
            if (u.t == "peaking") v = { fill: w, stroke: w };
            if (u.t == "highshelf" || u.t == "lowshelf") v = { fill: b, stroke: b };
            
            var d = I.circle(l, f, 4).attr(v).addClass("filterDot");
            d.drag(onFilterDrag(u, c, I), onDragStart, onFilterDragEnd(u, c));
            d.dblclick(onFilterDoubleClick(u, c));
        }
    }

    function onFilterDoubleClick(e, t) {
        return function() {
            e.gain = 0;
            e.y = F(0);
            chrome.runtime.sendMessage({ type: "resetFilter", index: t });
            n();
        };
    }

    function l(e) { return Math.pow(e / T, 4) * c; }
    function P(e) { return Math.pow(e / c, 1 / 4) * T; }
    function F(e) { return B * (1 - (e - k) / (u - k)); }
    function f(e) { return (1 - e / B) * (u - k) + k; }
    function getOffset(e) {
        var t = e.node.getClientRects()[0];
        return [t.left, t.top];
    }

    var R = {};

    function drawBiquadResponse(e, t, n) {
        var r = t.frequency;
        var a = t.q;
        var i = t.gain;
        var o = Math.tan(Math.PI * r / E);
        var s = 1 / (1 + 1 / a * o + o * o);
        var C = Math.pow(10, Math.abs(i) / 20);
        var u1 = 0, l1 = 0, f1 = 0, v1 = 0, d1 = 0;
        var h = "wheat";
        
        if (t.t == "peaking") {
            h = w;
            if (i >= 0) {
                s = 1 / (1 + 1 / a * o + o * o);
                u1 = (1 + C / a * o + o * o) * s;
                l1 = 2 * (o * o - 1) * s;
                f1 = (1 - C / a * o + o * o) * s;
                v1 = l1;
                d1 = (1 - 1 / a * o + o * o) * s;
            } else {
                s = 1 / (1 + C / a * o + o * o);
                u1 = (1 + 1 / a * o + o * o) * s;
                l1 = 2 * (o * o - 1) * s;
                f1 = (1 - 1 / a * o + o * o) * s;
                v1 = l1;
                d1 = (1 - C / a * o + o * o) * s;
            }
        } else if (t.t == "highshelf") {
            h = b;
            if (i >= 0) {
                s = 1 / (1 + Math.SQRT2 * o + o * o);
                u1 = (C + Math.sqrt(2 * C) * o + o * o) * s;
                l1 = 2 * (o * o - C) * s;
                f1 = (C - Math.sqrt(2 * C) * o + o * o) * s;
                v1 = 2 * (o * o - 1) * s;
                d1 = (1 - Math.SQRT2 * o + o * o) * s;
            } else {
                s = 1 / (C + Math.sqrt(2 * C) * o + o * o);
                u1 = (1 + Math.SQRT2 * o + o * o) * s;
                l1 = 2 * (o * o - 1) * s;
                f1 = (1 - Math.SQRT2 * o + o * o) * s;
                v1 = 2 * (o * o - C) * s;
                d1 = (C - Math.sqrt(2 * C) * o + o * o) * s;
            }
        } else if (t.t == "lowshelf") {
            h = b;
            if (i >= 0) {
                s = 1 / (1 + Math.SQRT2 * o + o * o);
                u1 = (1 + Math.sqrt(2 * C) * o + C * o * o) * s;
                l1 = 2 * (C * o * o - 1) * s;
                f1 = (1 - Math.sqrt(2 * C) * o + C * o * o) * s;
                v1 = 2 * (o * o - 1) * s;
                d1 = (1 - Math.SQRT2 * o + o * o) * s;
            } else {
                s = 1 / (1 + Math.sqrt(2 * C) * o + C * o * o);
                u1 = (1 + Math.SQRT2 * o + o * o) * s;
                l1 = 2 * (o * o - 1) * s;
                f1 = (1 - Math.SQRT2 * o + o * o) * s;
                v1 = 2 * (C * o * o - 1) * s;
                d1 = (1 - Math.sqrt(2 * C) * o + C * o * o) * s;
            }
        }
        
        var mArr =[];
        for (var g1 = 0; g1 < T; g1 += 2) {
            var p1 = Math.pow(g1 / T, 4) * Math.PI;
            var y1 = Math.pow(Math.sin(p1 / 2), 2);
            var M1 = Math.log((Math.pow(u1 + l1 + f1, 2) - 4 * (u1 * l1 + 4 * u1 * f1 + l1 * f1) * y1 + 16 * u1 * f1 * y1 * y1) / (Math.pow(1 + v1 + d1, 2) - 4 * (v1 + 4 * d1 + v1 * d1) * y1 + 16 * d1 * y1 * y1));
            M1 = M1 * 10 / Math.LN10;
            M1 = F(M1);
            if (M1 == -Infinity) M1 = B - 1;
            if (isNaN(M1) || M1 === Infinity || M1 === -Infinity) M1 = B / 2;
            if (Math.abs(M1 - B / 2) > 1) {
                mArr = mArr.concat([g1, M1]);
            }
        }
        
        var k1 = null;
        if (i >= 0) k1 = e.gradient("l(.5, 0, .5, 1)" + h + "-" + q);
        else k1 = e.gradient("l(.5, 1, .5, 0)" + h + "-" + q);
        
        if (R[n]) R[n].remove();
        R[n] = e.polyline(mArr).attr({ stroke: k1, "fill-opacity": "0", "pointer-events": "none" });
    }

    function drawResponseCurves(e, t) {
        for (var r = 0; r < t.length; r++) {
            drawBiquadResponse(e, t[r], r);
        }
    }

    function drawGrid(e) {
        for (var t = 5; t < c; t *= 2) {
            var n = P(t);
            e.line(n, B / 2 + 10, n, B / 2 - 10).attr({ stroke: "wheat", "stroke-opacity": .25 });
            e.line(n, B, n, B - 15).attr({ stroke: "wheat" });
            e.text(n, B - 18, "" + Math.round(Math.pow(n / T, 4) * c)).attr({ fill: "wheat", "text-anchor": "middle", "font-size": 10 });
            e.line(n, 0, n, 15).attr({ stroke: "wheat" });
        }
        var r = 5;
        for (var a = k; a < u; a += r) {
            var i = F(a);
            if (Math.abs(u) - Math.abs(a) > r / 2) {
                e.line(0, i, 5, i).attr({ stroke: "wheat" });
                e.text(7, i, "" + a).attr({ fill: "wheat", "font-size": 10, "dominant-baseline": "middle" });
            }
        }
    }

    function onGainDrag(o) {
        return function(e, t, n, r, a) {
            var i = getOffset(x);
            r = r - i[1];
            if (r < 0 || r >= B) return;
            if (f(r) > M) {
                t -= r - F(M);
                r = F(M);
            }
            o.y = r;
            o.gain = Math.pow(10, f(r) / 10);
            this.attr({ transform: this.data("origTransform") + (this.data("origTransform") ? "T" : "t") +[0, t] });
            chrome.runtime.sendMessage({ type: "modifyGain", gain: o.gain });
        };
    }

    function onGainDragEnd(e) {
        return function() {
            this.attr({ fill: q });
            n();
        };
    }

    function onFilterDrag(o, s, cSvg) {
        return function(e, t, n, r, a) {
            if (a.shiftKey) {
                o.q = o.q + a.movementY / 10;
                if (o.q < .2) o.q = .2;
                if (o.q > 11) o.q = 11;
            } else {
                var i = getOffset(I);
                n = n - i[0];
                r = r - i[1];
                
                if (n < 5) n = 5;
                if (n >= T) n = T - 1;
                
                if (r < 0 || r >= B) return;
                o.x = n;
                o.y = r;
                o.gain = f(r);
                o.frequency = l(n);
                this.attr({ transform: this.data("origTransform") + (this.data("origTransform") ? "T" : "t") + [e, t] });
            }
            drawBiquadResponse(cSvg, o, s);
            chrome.runtime.sendMessage({ type: "modifyFilter", index: s, frequency: l(o.x), gain: f(o.y), q: o.q });
        };
    }

    function fe(e) { return 10 * Math.log10(e); }

    var onDragStart = function() {
        this.data("origTransform", this.transform().local);
        this.attr({ fill: "black" });
    };

    function onFilterDragEnd(e, t) {
        return function() {
            this.attr({ fill: q });
            n();
        };
    }

    if (isVisualizerOn()) {
        requestFFT();
    }
}

scope();
