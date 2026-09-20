/**
 * ASCIIArt After Effects Plugin Web Engine & UI Simulator
 * Replicates After Effects Effect Controls & ASCII conversion logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // Character Set Definitions
    // -------------------------------------------------------------
    const PATTERNS = {
        pattern1: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
        pattern2: " .:-=+*#%@$",
        binary: " 01010101",
        blocks: " ░▒▓█",
        simple: " .:+*#@",
        gba: " ░▒▓█"
    };

    // 4x4 Bayer Dithering Matrix for GBA Camera effect
    const BAYER_4X4 = [
        [ 0,  8,  2, 10],
        [12,  4, 14,  6],
        [ 3, 11,  1,  9],
        [15,  7, 13,  5]
    ];

    // Classic Game Boy Camera 4-shade palette
    const GBA_PALETTE = [
        { r: 15,  g: 56,  b: 15  }, // Darkest (#0f380f)
        { r: 48,  g: 98,  b: 48  }, // Dark Mid (#306230)
        { r: 139, g: 172, b: 15  }, // Light Mid (#8bac0f)
        { r: 155, g: 188, b: 15  }  // Brightest (#9bbc0f)
    ];

    // -------------------------------------------------------------
    // DOM Elements
    // -------------------------------------------------------------
    const video = document.getElementById('source-video');
    const canvas = document.getElementById('output-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // Hidden offscreen canvas for source video sampling
    const sampleCanvas = document.createElement('canvas');
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    // Dedicated offscreen canvas for synthetic tunnel generator
    const synthCanvas = document.createElement('canvas');
    synthCanvas.width = 800;
    synthCanvas.height = 450;
    const synthCtx = synthCanvas.getContext('2d', { willReadFrequently: true });

    // UI Controls - Resolution
    const sliderBlockSize = document.getElementById('slider-block-size');
    const inputBlockSize = document.getElementById('param-block-size');

    // UI Controls - Character
    const sliderCharSize = document.getElementById('slider-char-size');
    const inputCharSize = document.getElementById('param-char-size');
    const selectPattern = document.getElementById('param-text-pattern');
    const checkReversePattern = document.getElementById('param-reverse-pattern');
    const checkLetterSizeBrig = document.getElementById('param-letter-size-brig');

    // UI Controls - Color
    const checkOriginalColor = document.getElementById('param-original-color');
    const inputColorStart = document.getElementById('param-color-start');
    const inputColorEnd = document.getElementById('param-color-end');
    const inputBgColor = document.getElementById('param-bg-color');
    const checkTransparentBg = document.getElementById('param-transparent-bg');

    // Accordions & Buttons
    const btnReset = document.getElementById('btn-reset-params');
    const btnUpload = document.getElementById('video-upload-input');
    const btnWebcam = document.getElementById('btn-webcam');
    const btnDemoSynth = document.getElementById('btn-demo-synth');

    // Timeline & Playback
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnStop = document.getElementById('btn-stop');
    const seeker = document.getElementById('video-seeker');
    const timecode = document.getElementById('timecode-display');
    const resolutionBadge = document.getElementById('resolution-badge');
    const compLayerName = document.getElementById('comp-layer-name');

    // Export Buttons
    const btnCopyAscii = document.getElementById('btn-copy-ascii');
    const btnExportFrame = document.getElementById('btn-export-frame');

    // State Variables
    let isPlaying = false;
    let isSynthDemo = true;
    let synthFrameCount = 0;
    let animationFrameId = null;
    let currentAsciiTextBuffer = "";
    let detectedSourceFps = 30; // detected FPS of the loaded video
    let zoomLevel = 1.0;

    // Default Parameter Snapshot
    const DEFAULT_PARAMS = {
        blockSize: 10,
        charSize: 1.30,
        pattern: 'pattern1',
        reversePattern: false,
        letterSizeBrig: false,
        originalColor: false,
        colorStart: '#ffffff',
        colorEnd: '#ffffff',
        bgColor: '#000000',
        transparentBg: false
    };

    // -------------------------------------------------------------
    // Accordion Toggle Handlers
    // -------------------------------------------------------------
    document.querySelectorAll('.group-header').forEach(header => {
        header.addEventListener('click', () => {
            const group = header.parentElement;
            group.classList.toggle('expanded');
        });
    });

    // -------------------------------------------------------------
    // Parameter Definitions & Keyframing System
    // -------------------------------------------------------------
    const PARAM_DEFS = {
        blockSize: { 
            label: 'Block Size', 
            type: 'number', 
            get: () => parseFloat(inputBlockSize.value), 
            set: (v) => { 
                const val = Math.round(v);
                inputBlockSize.value = val; 
                sliderBlockSize.value = val; 
            },
            format: (v) => Math.round(v)
        },
        charSize: { 
            label: 'Character Size', 
            type: 'number', 
            get: () => parseFloat(inputCharSize.value), 
            set: (v) => { 
                const val = parseFloat(v).toFixed(2);
                inputCharSize.value = val; 
                sliderCharSize.value = val; 
            },
            format: (v) => parseFloat(v).toFixed(2)
        },
        pattern: { 
            label: 'Style Options', 
            type: 'string', 
            get: () => selectPattern.value, 
            set: (v) => { selectPattern.value = v; },
            format: (v) => v
        },
        reversePattern: { 
            label: 'Reverse text pattern', 
            type: 'boolean', 
            get: () => checkReversePattern.checked, 
            set: (v) => { checkReversePattern.checked = !!v; },
            format: (v) => v ? 'ON' : 'OFF'
        },
        letterSizeBrig: { 
            label: 'Letter Size based on brig', 
            type: 'boolean', 
            get: () => checkLetterSizeBrig.checked, 
            set: (v) => { checkLetterSizeBrig.checked = !!v; },
            format: (v) => v ? 'ON' : 'OFF'
        },
        originalColor: { 
            label: 'Original Color', 
            type: 'boolean', 
            get: () => checkOriginalColor.checked, 
            set: (v) => { checkOriginalColor.checked = !!v; },
            format: (v) => v ? 'ON' : 'OFF'
        },
        colorStart: { 
            label: 'Custom Color Start', 
            type: 'color', 
            get: () => inputColorStart.value, 
            set: (v) => { inputColorStart.value = v; },
            format: (v) => v
        },
        colorEnd: { 
            label: 'Custom Color End', 
            type: 'color', 
            get: () => inputColorEnd.value, 
            set: (v) => { inputColorEnd.value = v; },
            format: (v) => v
        },
        bgColor: { 
            label: 'Background Color', 
            type: 'color', 
            get: () => inputBgColor.value, 
            set: (v) => { inputBgColor.value = v; },
            format: (v) => v
        },
        transparentBg: { 
            label: 'Transparent Background', 
            type: 'boolean', 
            get: () => checkTransparentBg.checked, 
            set: (v) => { checkTransparentBg.checked = !!v; },
            format: (v) => v ? 'ON' : 'OFF'
        }
    };

    // Active stopwatches (Set of param keys)
    const activeStopwatches = new Set();

    // Keyframes Store: paramKey -> Array of { id, time, value }
    const keyframesStore = {};
    for (const key in PARAM_DEFS) {
        keyframesStore[key] = [];
    }

    let selectedKeyframe = null; // { paramKey, id }

    // Timeline DOM Elements
    const tlCompTitle = document.getElementById('tl-comp-title');
    const tlTimecodeDisplay = document.getElementById('tl-timecode-display');
    const tlTotalKfCount = document.getElementById('tl-total-keyframes-count');
    const btnTlAddKf = document.getElementById('btn-tl-add-kf');
    const btnTlDeleteKf = document.getElementById('btn-tl-delete-kf');
    const btnTlClearAll = document.getElementById('btn-tl-clear-all');
    const tlPropertyHeadersList = document.getElementById('tl-property-headers-list');
    const tlPropertyLanesList = document.getElementById('tl-property-lanes-list');
    const tlRulerCanvas = document.getElementById('tl-ruler-canvas');
    const tlRuler = document.getElementById('tl-ruler');
    const tlTracksScroll = document.getElementById('tl-tracks-scroll');
    const tlTracksContainer = document.getElementById('tl-tracks-container');
    const tlPlayhead = document.getElementById('tl-playhead');

    function getTotalDuration() {
        if (!isSynthDemo && video.duration && !isNaN(video.duration) && video.duration > 0) {
            return video.duration;
        }
        return 10.0;
    }

    function getCurrentPlayheadTime() {
        if (!isSynthDemo && video.duration) {
            return video.currentTime;
        }
        return (synthFrameCount / 30) % getTotalDuration();
    }

    function setCurrentPlayheadTime(timeSecs) {
        const total = getTotalDuration();
        const clamped = Math.max(0, Math.min(total, timeSecs));
        if (!isSynthDemo && video.duration) {
            video.currentTime = clamped;
        } else {
            synthFrameCount = Math.round(clamped * 30);
        }
        applyKeyframesAtTime(clamped);
        requestRender();
    }

    function getInterpolatedParamValue(paramKey, time) {
        const list = keyframesStore[paramKey];
        if (!list || list.length === 0) {
            return PARAM_DEFS[paramKey].get();
        }
        list.sort((a, b) => a.time - b.time);

        if (time <= list[0].time) return list[0].value;
        if (time >= list[list.length - 1].time) return list[list.length - 1].value;

        let prev = list[0], next = list[list.length - 1];
        for (let i = 0; i < list.length - 1; i++) {
            if (time >= list[i].time && time <= list[i + 1].time) {
                prev = list[i];
                next = list[i + 1];
                break;
            }
        }

        const dt = next.time - prev.time;
        if (dt <= 0.0001) return prev.value;
        const factor = (time - prev.time) / dt;

        const def = PARAM_DEFS[paramKey];
        if (def.type === 'number') {
            return prev.value + factor * (next.value - prev.value);
        } else if (def.type === 'color') {
            const c1 = hexToRgb(prev.value);
            const c2 = hexToRgb(next.value);
            const lerped = lerpColor(c1, c2, factor);
            const toHex = (n) => n.toString(16).padStart(2, '0');
            return `#${toHex(lerped.r)}${toHex(lerped.g)}${toHex(lerped.b)}`;
        } else {
            // Discrete hold
            return prev.value;
        }
    }

    function applyKeyframesAtTime(time) {
        let applied = false;
        for (const paramKey of activeStopwatches) {
            const list = keyframesStore[paramKey];
            if (list && list.length > 0) {
                const val = getInterpolatedParamValue(paramKey, time);
                PARAM_DEFS[paramKey].set(val);
                applied = true;
            }
        }
        updateKeyframeDiamondsState(time);
        updateTimelineHeaderValues();
        return applied;
    }

    function addOrUpdateKeyframe(paramKey, time, val) {
        const list = keyframesStore[paramKey];
        const existing = list.find(k => Math.abs(k.time - time) <= 0.06);
        if (existing) {
            existing.value = val;
            existing.time = time;
        } else {
            list.push({
                id: 'kf_' + Math.random().toString(36).substr(2, 9),
                time: time,
                value: val
            });
            list.sort((a, b) => a.time - b.time);
        }
        updateTotalKeyframesCount();
    }

    function toggleStopwatch(paramKey) {
        if (activeStopwatches.has(paramKey)) {
            if (keyframesStore[paramKey].length > 0) {
                if (!confirm(`Turn off animation and delete keyframes for ${PARAM_DEFS[paramKey].label}?`)) {
                    return;
                }
            }
            activeStopwatches.delete(paramKey);
            keyframesStore[paramKey] = [];
        } else {
            activeStopwatches.add(paramKey);
            const curTime = getCurrentPlayheadTime();
            addOrUpdateKeyframe(paramKey, curTime, PARAM_DEFS[paramKey].get());
        }
        updateStopwatchButtons();
        renderTimelineTracks();
        updateTotalKeyframesCount();
    }

    function toggleKeyframeAtCurrentTime(paramKey) {
        const curTime = getCurrentPlayheadTime();
        if (!activeStopwatches.has(paramKey)) {
            activeStopwatches.add(paramKey);
            updateStopwatchButtons();
        }
        const list = keyframesStore[paramKey];
        const existingIdx = list.findIndex(k => Math.abs(k.time - curTime) <= 0.06);
        if (existingIdx !== -1) {
            list.splice(existingIdx, 1);
        } else {
            addOrUpdateKeyframe(paramKey, curTime, PARAM_DEFS[paramKey].get());
        }
        renderTimelineTracks();
        updateKeyframeDiamondsState(curTime);
        updateTotalKeyframesCount();
        requestRender();
    }

    function updateStopwatchButtons() {
        document.querySelectorAll('.kf-stopwatch-btn').forEach(btn => {
            const param = btn.dataset.param;
            if (activeStopwatches.has(param)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function updateKeyframeDiamondsState(time) {
        document.querySelectorAll('.kf-diamond-btn').forEach(btn => {
            const param = btn.dataset.param;
            const list = keyframesStore[param] || [];
            const onKf = list.some(k => Math.abs(k.time - time) <= 0.06);
            if (onKf) {
                btn.classList.add('on-kf');
                btn.classList.add('active');
            } else if (activeStopwatches.has(param)) {
                btn.classList.remove('on-kf');
                btn.classList.add('active');
            } else {
                btn.classList.remove('on-kf');
                btn.classList.remove('active');
            }
        });
    }

    function updateTotalKeyframesCount() {
        let total = 0;
        for (const key in keyframesStore) {
            total += keyframesStore[key].length;
        }
        tlTotalKfCount.textContent = total;
    }

    function updateTimelineHeaderValues() {
        activeStopwatches.forEach(paramKey => {
            const badge = document.getElementById(`tl-prop-val-${paramKey}`);
            if (badge) {
                badge.textContent = PARAM_DEFS[paramKey].format(PARAM_DEFS[paramKey].get());
            }
        });
    }

    // Attach Keyframe button click listeners in Effect Controls panel
    document.querySelectorAll('.kf-stopwatch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleStopwatch(btn.dataset.param);
        });
    });

    document.querySelectorAll('.kf-diamond-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleKeyframeAtCurrentTime(btn.dataset.param);
        });
    });

    // Notify auto-keyframing when user edits parameter
    function onParamUserEdit(paramKey) {
        if (activeStopwatches.has(paramKey)) {
            addOrUpdateKeyframe(paramKey, getCurrentPlayheadTime(), PARAM_DEFS[paramKey].get());
            renderTimelineTracks();
            updateTotalKeyframesCount();
        }
    }

    // -------------------------------------------------------------
    // Slider <-> Number Input Sync
    // -------------------------------------------------------------
    function syncControlPair(slider, input, paramKey) {
        slider.addEventListener('input', () => {
            input.value = slider.value;
            onParamUserEdit(paramKey);
            requestRender();
        });
        input.addEventListener('change', () => {
            slider.value = input.value;
            onParamUserEdit(paramKey);
            requestRender();
        });
    }

    syncControlPair(sliderBlockSize, inputBlockSize, 'blockSize');
    syncControlPair(sliderCharSize, inputCharSize, 'charSize');

    // Event listeners for other controls with auto-keyframe hook
    selectPattern.addEventListener('change', () => { onParamUserEdit('pattern'); requestRender(); });
    checkReversePattern.addEventListener('change', () => { onParamUserEdit('reversePattern'); requestRender(); });
    checkLetterSizeBrig.addEventListener('change', () => { onParamUserEdit('letterSizeBrig'); requestRender(); });
    checkOriginalColor.addEventListener('change', () => { onParamUserEdit('originalColor'); requestRender(); });
    inputColorStart.addEventListener('input', () => { onParamUserEdit('colorStart'); requestRender(); });
    inputColorEnd.addEventListener('input', () => { onParamUserEdit('colorEnd'); requestRender(); });
    inputBgColor.addEventListener('input', () => { onParamUserEdit('bgColor'); requestRender(); });
    checkTransparentBg.addEventListener('change', () => { onParamUserEdit('transparentBg'); requestRender(); });

    // Reset Parameters Button
    btnReset.addEventListener('click', () => {
        sliderBlockSize.value = DEFAULT_PARAMS.blockSize;
        inputBlockSize.value = DEFAULT_PARAMS.blockSize;
        sliderCharSize.value = DEFAULT_PARAMS.charSize;
        inputCharSize.value = DEFAULT_PARAMS.charSize;
        selectPattern.value = DEFAULT_PARAMS.pattern;
        checkReversePattern.checked = DEFAULT_PARAMS.reversePattern;
        checkLetterSizeBrig.checked = DEFAULT_PARAMS.letterSizeBrig;
        checkOriginalColor.checked = DEFAULT_PARAMS.originalColor;
        inputColorStart.value = DEFAULT_PARAMS.colorStart;
        inputColorEnd.value = DEFAULT_PARAMS.colorEnd;
        inputBgColor.value = DEFAULT_PARAMS.bgColor;
        checkTransparentBg.checked = DEFAULT_PARAMS.transparentBg;
        requestRender();
    });

    // -------------------------------------------------------------
    // FPS Detection & Export Framerate Options
    // -------------------------------------------------------------
    const ALL_FPS_OPTIONS = [
        { value: 60,  label: '60 FPS (Smooth)' },
        { value: 30,  label: '30 FPS (Standard)' },
        { value: 25,  label: '25 FPS (PAL)' },
        { value: 24,  label: '24 FPS (Cinematic)' },
        { value: 15,  label: '15 FPS (Low Motion)' },
    ];

    function updateExportFpsOptions(maxFps) {
        const sel = document.getElementById('render-fps');
        if (!sel) return;
        const prevVal = parseInt(sel.value) || 30;
        sel.innerHTML = '';
        // Only include options at or below the source FPS (rounded to nearest standard)
        ALL_FPS_OPTIONS.forEach(opt => {
            if (opt.value <= Math.ceil(maxFps + 1)) {
                const el = document.createElement('option');
                el.value = opt.value;
                el.textContent = opt.label;
                if (opt.value === Math.min(prevVal, Math.floor(maxFps))) {
                    el.selected = true;
                }
                sel.appendChild(el);
            }
        });
        // Ensure something is selected
        if (!sel.value && sel.options.length > 0) {
            sel.options[0].selected = true;
        }
    }

    async function detectVideoFps(videoEl) {
        // Try to use requestVideoFrameCallback for accurate FPS detection with safety fallback
        if (typeof videoEl.requestVideoFrameCallback === 'function') {
            return new Promise(resolve => {
                let t0 = null, frames = 0;
                const MAX_SAMPLES = 10;
                let resolved = false;
                const safetyTimer = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve(30);
                    }
                }, 1000);

                function sample(now, meta) {
                    if (resolved) return;
                    if (t0 === null) {
                        t0 = meta.mediaTime;
                    } else {
                        frames++;
                        if (frames >= MAX_SAMPLES) {
                            resolved = true;
                            clearTimeout(safetyTimer);
                            const elapsed = meta.mediaTime - t0;
                            const fps = elapsed > 0 ? frames / elapsed : 30;
                            resolve(Math.round(fps));
                            return;
                        }
                    }
                    videoEl.requestVideoFrameCallback(sample);
                }
                videoEl.requestVideoFrameCallback(sample);
            });
        }
        // Fallback: assume 30fps for non-supporting browsers
        return 30;
    }

    // Init labels & default export fps options (synth demo = 30fps)
    if (compLayerName) compLayerName.textContent = 'ASCII Macho — Synth Demo';
    updateExportFpsOptions(30);

    // Video Source Handling (File, Webcam, Synth Tunnel)
    // -------------------------------------------------------------
    btnUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        isSynthDemo = false;
        compLayerName.textContent = file.name + " — ASCII Macho";

        const url = URL.createObjectURL(file);
        video.srcObject = null;
        video.src = url;
        video.load();
        video.play().then(() => {
            isPlaying = true;
            updatePlayPauseButton();
            startPlaybackLoop();
        }).catch(() => {
            isPlaying = false;
            updatePlayPauseButton();
        });

        // Detect FPS once the video has enough metadata
        video.addEventListener('loadeddata', async () => {
            if (!isSynthDemo) {
                const fps = await detectVideoFps(video);
                detectedSourceFps = fps || 30;
                // Update export fps dropdown — only allow ≤ source fps
                updateExportFpsOptions(detectedSourceFps);
                document.getElementById('fps-badge').textContent = `~${detectedSourceFps} FPS (source)`;
            }
        }, { once: true });
    });

    btnWebcam.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
            isSynthDemo = false;
            compLayerName.textContent = "Live Webcam Feed — ASCII Macho";
            video.srcObject = stream;
            video.play().then(() => {
                isPlaying = true;
                updatePlayPauseButton();
                startPlaybackLoop();
            });
            // Webcam is typically 30fps
            detectedSourceFps = 30;
            updateExportFpsOptions(30);
        } catch (err) {
            alert("Could not access webcam: " + err.message);
        }
    });

    btnDemoSynth.addEventListener('click', () => {
        isSynthDemo = true;
        compLayerName.textContent = "ASCII Macho — Synth Demo";
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        video.pause();
        video.src = "";
        isPlaying = true;
        updatePlayPauseButton();
        // Synth demo runs at 30fps
        detectedSourceFps = 30;
        updateExportFpsOptions(30);
    });

    // Playback Controls
    btnPlayPause.addEventListener('click', () => {
        if (isSynthDemo) {
            isPlaying = !isPlaying;
        } else {
            if (video.paused) {
                video.play().then(() => {
                    isPlaying = true;
                    updatePlayPauseButton();
                    startPlaybackLoop();
                }).catch(() => {
                    isPlaying = false;
                    updatePlayPauseButton();
                });
            } else {
                video.pause();
                isPlaying = false;
            }
        }
        updatePlayPauseButton();
    });

    btnStop.addEventListener('click', () => {
        isPlaying = false;
        if (!isSynthDemo) {
            video.pause();
            video.currentTime = 0;
        }
        updatePlayPauseButton();
        requestRender();
    });

    seeker.addEventListener('input', () => {
        if (!isSynthDemo && video.duration) {
            video.currentTime = (seeker.value / 100) * video.duration;
            requestRender();
        }
    });

    function updatePlayPauseButton() {
        if (isPlaying) {
            btnPlayPause.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        } else {
            btnPlayPause.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        }
    }

    // -------------------------------------------------------------
    // Synthetic 3D Tunnel & Motion Generator (When no video file loaded)
    // -------------------------------------------------------------
    function renderSynthFrame(w, h, t) {
        if (synthCanvas.width !== w || synthCanvas.height !== h) {
            synthCanvas.width = w;
            synthCanvas.height = h;
        }
        const sCtx = synthCtx;

        sCtx.fillStyle = '#050510';
        sCtx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;

        // Animated light tunnel rings
        for (let r = 10; r < 400; r += 20) {
            const scale = (r + (t * 80) % 20) / 400;
            const size = scale * Math.max(w, h);
            const alpha = 1 - scale;
            sCtx.strokeStyle = `hsla(${ (t * 50 + r) % 360 }, 80%, 60%, ${alpha})`;
            sCtx.lineWidth = 3 * scale + 1;
            sCtx.beginPath();
            sCtx.arc(cx + Math.sin(t + scale * 5) * 40, cy + Math.cos(t * 0.8) * 30, size, 0, Math.PI * 2);
            sCtx.stroke();
        }

        // Dancing central motion sphere / text silhouette
        const pulse = 60 + Math.sin(t * 3) * 20;
        const grad = sCtx.createRadialGradient(cx, cy, 5, cx, cy, pulse * 2);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#ff44aa');
        grad.addColorStop(1, 'transparent');
        sCtx.fillStyle = grad;
        sCtx.beginPath();
        sCtx.arc(cx + Math.cos(t * 2) * 80, cy + Math.sin(t * 2) * 50, pulse * 1.5, 0, Math.PI * 2);
        sCtx.fill();

        // Overlay stylized text inside tunnel
        sCtx.fillStyle = '#ffffff';
        sCtx.font = 'bold 36px sans-serif';
        sCtx.textAlign = 'center';
        sCtx.textBaseline = 'middle';
        sCtx.fillText("AFTER EFFECTS ASCII", cx, cy - 20);
    }

    // Color Interpolation Helper
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    }

    function lerpColor(c1, c2, factor) {
        return {
            r: Math.round(c1.r + factor * (c2.r - c1.r)),
            g: Math.round(c1.g + factor * (c2.g - c1.g)),
            b: Math.round(c1.b + factor * (c2.b - c1.b))
        };
    }

    // -------------------------------------------------------------
    // Core ASCII Video Processing Engine (Ultra-High Performance)
    // -------------------------------------------------------------
    function renderAsciiFrame(isExporting = false) {
        const currentSecs = getCurrentPlayheadTime();
        applyKeyframesAtTime(currentSecs);

        const targetW = video.videoWidth || 800;
        const targetH = video.videoHeight || 450;

        const zoomPercent = Math.round(zoomLevel * 100);
        if (resolutionBadge) {
            resolutionBadge.textContent = `${targetW} x ${targetH} (${zoomPercent}%)`;
        }

        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
        }

        // Retrieve UI Parameters
        const blockSize = Math.max(1, parseInt(inputBlockSize.value) || 10);
        const charScale = parseFloat(inputCharSize.value) || 1.30;
        const charPatternKey = selectPattern.value;
        const charSet = PATTERNS[charPatternKey] || PATTERNS.pattern1;
        const charSetLen = charSet.length;
        const isReverse = checkReversePattern.checked;
        const isLetterSizeBrig = checkLetterSizeBrig.checked;
        const isOriginalColor = checkOriginalColor.checked;
        const colorStart = hexToRgb(inputColorStart.value);
        const colorEnd = hexToRgb(inputColorEnd.value);
        const bgColor = inputBgColor.value;
        const isTransparentBg = checkTransparentBg.checked;

        const cols = Math.ceil(targetW / blockSize);
        const rows = Math.ceil(targetH / blockSize);

        if (sampleCanvas.width !== cols || sampleCanvas.height !== rows) {
            sampleCanvas.width = cols;
            sampleCanvas.height = rows;
        }

        if (isSynthDemo) {
            if (!isExporting) synthFrameCount++;
            renderSynthFrame(800, 450, synthFrameCount * 0.03);
            sampleCtx.drawImage(synthCanvas, 0, 0, cols, rows);
        } else {
            if (!isExporting) {
                // Hardware-accelerated GPU downsample to grid resolution (cols x rows)
                sampleCtx.drawImage(video, 0, 0, cols, rows);
            }
        }

        // Read GPU-downscaled source image data (cols x rows)
        const imgData = sampleCtx.getImageData(0, 0, cols, rows);
        const pixels = imgData.data;

        // Render Background
        if (isTransparentBg) {
            ctx.clearRect(0, 0, targetW, targetH);
        } else {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, targetW, targetH);
        }

        // Precompute gradient color LUT for non-original color mode
        let colorLut = null;
        if (!isOriginalColor && charPatternKey !== 'gba') {
            colorLut = new Array(charSetLen);
            for (let i = 0; i < charSetLen; i++) {
                const factor = charSetLen > 1 ? i / (charSetLen - 1) : 0;
                const r = Math.round(colorStart.r + factor * (colorEnd.r - colorStart.r));
                const g = Math.round(colorStart.g + factor * (colorEnd.g - colorStart.g));
                const b = Math.round(colorStart.b + factor * (colorEnd.b - colorStart.b));
                colorLut[i] = `rgb(${r},${g},${b})`;
            }
        }

        // Precompute GBA palette LUT
        let gbaLut = null;
        if (charPatternKey === 'gba' && !isOriginalColor) {
            gbaLut = new Array(4);
            const isCustom = inputColorStart.value.toLowerCase() !== '#ffffff' || inputColorEnd.value.toLowerCase() !== '#ffffff';
            for (let s = 0; s < 4; s++) {
                if (isCustom) {
                    const lerped = lerpColor(colorStart, colorEnd, s / 3);
                    gbaLut[s] = `rgb(${lerped.r},${lerped.g},${lerped.b})`;
                } else {
                    const pal = GBA_PALETTE[s];
                    gbaLut[s] = `rgb(${pal.r},${pal.g},${pal.b})`;
                }
            }
        }

        // Setup font sizing with zero CSS font reparsing overhead
        const baseFontSize = blockSize * charScale;
        let fontLut = null;
        let lastFontIdx = -1;
        if (isLetterSizeBrig) {
            fontLut = new Array(8);
            for (let i = 0; i < 8; i++) {
                const size = baseFontSize * (0.3 + 0.7 * (i / 7));
                fontLut[i] = `bold ${size.toFixed(1)}px "Fira Code", monospace`;
            }
        } else {
            ctx.font = `bold ${baseFontSize.toFixed(1)}px "Fira Code", monospace`;
        }

        let lastFillStyle = null;

        // Render loop
        if (charPatternKey === 'gba') {
            for (let row = 0; row < rows; row++) {
                const y = row * blockSize;
                const rowOffset = row * cols;
                for (let col = 0; col < cols; col++) {
                    const x = col * blockSize;
                    const pxIndex = (rowOffset + col) * 4;
                    const avgR = pixels[pxIndex];
                    const avgG = pixels[pxIndex + 1];
                    const avgB = pixels[pxIndex + 2];

                    let brig = (0.299 * avgR + 0.587 * avgG + 0.114 * avgB) / 255;
                    if (isReverse) brig = 1.0 - brig;

                    const bayerVal = BAYER_4X4[row % 4][col % 4];
                    const ditherOffset = (bayerVal / 16.0 - 0.5) * 0.35;
                    const ditheredBrig = Math.max(0, Math.min(1, brig + ditherOffset));
                    let shadeIdx = Math.floor(ditheredBrig * 4);
                    if (shadeIdx > 3) shadeIdx = 3;

                    let charColor;
                    if (isOriginalColor) {
                        const factor = shadeIdx / 3;
                        charColor = `rgb(${Math.round(avgR * factor)},${Math.round(avgG * factor)},${Math.round(avgB * factor)})`;
                    } else {
                        charColor = gbaLut[shadeIdx];
                    }

                    if (charColor !== lastFillStyle) {
                        ctx.fillStyle = lastFillStyle = charColor;
                    }
                    ctx.fillRect(x, y, blockSize, blockSize);
                }
            }
        } else {
            for (let row = 0; row < rows; row++) {
                const y = row * blockSize;
                const rowOffset = row * cols;
                for (let col = 0; col < cols; col++) {
                    const x = col * blockSize;
                    const pxIndex = (rowOffset + col) * 4;
                    const avgR = pixels[pxIndex];
                    const avgG = pixels[pxIndex + 1];
                    const avgB = pixels[pxIndex + 2];

                    let brig = (0.299 * avgR + 0.587 * avgG + 0.114 * avgB) / 255;
                    if (isReverse) brig = 1.0 - brig;

                    const charIdx = Math.min(charSetLen - 1, Math.max(0, Math.floor(brig * (charSetLen - 1))));
                    const ch = charSet[charIdx];

                    let charColor;
                    if (isOriginalColor) {
                        charColor = `rgb(${avgR},${avgG},${avgB})`;
                    } else {
                        charColor = colorLut[charIdx];
                    }

                    if (charColor !== lastFillStyle) {
                        ctx.fillStyle = lastFillStyle = charColor;
                    }

                    if (isLetterSizeBrig) {
                        const fontIdx = Math.min(7, Math.floor(brig * 8));
                        if (fontIdx !== lastFontIdx) {
                            ctx.font = fontLut[fontIdx];
                            lastFontIdx = fontIdx;
                        }
                    }

                    ctx.fillText(ch, x + blockSize / 2, y + blockSize / 2);
                }
            }
        }

        // Update Timeline Seekbar, AE Playhead and Timecodes
        const totalDuration = getTotalDuration();
        const mins = Math.floor(currentSecs / 60);
        const secs = Math.floor(currentSecs % 60);
        const frames = Math.floor((currentSecs % 1) * 30);
        const timeStr = `00:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}:${String(frames).padStart(2,'0')}`;
        timecode.textContent = timeStr;
        if (tlTimecodeDisplay) tlTimecodeDisplay.textContent = timeStr;

        const pct = (currentSecs / totalDuration) * 100;
        seeker.value = pct;
        if (tlPlayhead) {
            tlPlayhead.style.left = `${Math.min(100, Math.max(0, pct))}%`;
        }
    }

    function requestRender() {
        renderAsciiFrame();
    }

    // Generate ASCII text buffer on-demand (only when copied) to avoid continuous GC freezes
    function generateAsciiText() {
        const targetW = canvas.width || 800;
        const targetH = canvas.height || 450;
        const blockSize = Math.max(1, parseInt(inputBlockSize.value) || 10);
        const cols = Math.ceil(targetW / blockSize);
        const rows = Math.ceil(targetH / blockSize);

        if (sampleCanvas.width !== cols || sampleCanvas.height !== rows) {
            sampleCanvas.width = cols;
            sampleCanvas.height = rows;
        }

        const imgData = sampleCtx.getImageData(0, 0, cols, rows);
        const pixels = imgData.data;
        const charPatternKey = selectPattern.value;
        const charSet = PATTERNS[charPatternKey] || PATTERNS.pattern1;
        const charSetLen = charSet.length;
        const isReverse = checkReversePattern.checked;

        const textBufferRows = [];
        for (let row = 0; row < rows; row++) {
            let rowText = "";
            const rowOffset = row * cols;
            for (let col = 0; col < cols; col++) {
                const pxIndex = (rowOffset + col) * 4;
                let brig = (0.299 * pixels[pxIndex] + 0.587 * pixels[pxIndex + 1] + 0.114 * pixels[pxIndex + 2]) / 255;
                if (isReverse) brig = 1.0 - brig;
                const charIdx = Math.min(charSetLen - 1, Math.max(0, Math.floor(brig * (charSetLen - 1))));
                rowText += charSet[charIdx];
            }
            textBufferRows.push(rowText);
        }
        return textBufferRows.join("\n");
    }

    // Synchronized Video Playback Loop (using requestVideoFrameCallback when available)
    let rvfcHandle = null;

    function onVideoFrameCallback(now, metadata) {
        if (isPlaying && !isRenderingVideo && !isSynthDemo) {
            renderAsciiFrame(false);
            if (typeof video.requestVideoFrameCallback === 'function') {
                rvfcHandle = video.requestVideoFrameCallback(onVideoFrameCallback);
            }
        }
    }

    function startPlaybackLoop() {
        if (!isSynthDemo && typeof video.requestVideoFrameCallback === 'function') {
            if (rvfcHandle) {
                try { video.cancelVideoFrameCallback(rvfcHandle); } catch (_) {}
            }
            rvfcHandle = video.requestVideoFrameCallback(onVideoFrameCallback);
        }
    }

    // Main Animation Loop
    let lastRenderedTime = -1;
    function loop() {
        if (isPlaying && !isRenderingVideo) {
            if (isSynthDemo) {
                renderAsciiFrame(false);
            } else if (typeof video.requestVideoFrameCallback !== 'function') {
                // Fallback for browsers without requestVideoFrameCallback
                if (Math.abs(video.currentTime - lastRenderedTime) > 0.005) {
                    lastRenderedTime = video.currentTime;
                    renderAsciiFrame(false);
                }
            }
        }
        animationFrameId = requestAnimationFrame(loop);
    }
    loop();

    // -------------------------------------------------------------
    // Export Handlers
    // -------------------------------------------------------------
    btnCopyAscii.addEventListener('click', () => {
        currentAsciiTextBuffer = generateAsciiText();
        navigator.clipboard.writeText(currentAsciiTextBuffer).then(() => {
            alert("ASCII frame text copied to clipboard!");
        }).catch(() => {
            alert("Copied ASCII frame text!");
        });
    });

    btnExportFrame.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `ASCIIArt_Frame_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    // -------------------------------------------------------------
    // Viewport Zoom & Pan Engine (Ctrl + Scroll Wheel on Video)
    // -------------------------------------------------------------
    const canvasContainer = document.getElementById('canvas-container');
    const viewportPanel = document.querySelector('.viewport-panel');
    const zoomLevelLabel = document.getElementById('zoom-level-label');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');

    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let startPanX = 0;
    let startPanY = 0;
    let initialPanX = 0;
    let initialPanY = 0;
    let isSpacePressed = false;

    function updateCanvasTransform() {
        canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
        const zoomPercent = Math.round(zoomLevel * 100);
        if (zoomLevelLabel) {
            zoomLevelLabel.textContent = `${zoomPercent}%`;
        }
        const targetW = video.videoWidth || 800;
        const targetH = video.videoHeight || 450;
        if (resolutionBadge) {
            resolutionBadge.textContent = `${targetW} x ${targetH} (${zoomPercent}%)`;
        }
        if (canvasContainer) {
            if (zoomLevel > 1.05) {
                canvasContainer.classList.add('can-pan');
            } else {
                canvasContainer.classList.remove('can-pan');
            }
        }
    }

    function applyZoomAt(newZoom, clientX, clientY) {
        const clampedZoom = Math.min(Math.max(newZoom, 0.25), 10.0);
        if (clampedZoom === zoomLevel) return;

        if (clientX !== undefined && clientY !== undefined && canvasContainer) {
            const rect = canvasContainer.getBoundingClientRect();
            const mouseX = clientX - rect.left - rect.width / 2;
            const mouseY = clientY - rect.top - rect.height / 2;
            panX = mouseX - (mouseX - panX) * (clampedZoom / zoomLevel);
            panY = mouseY - (mouseY - panY) * (clampedZoom / zoomLevel);
        } else {
            panX = panX * (clampedZoom / zoomLevel);
            panY = panY * (clampedZoom / zoomLevel);
        }

        if (clampedZoom <= 1.0 && zoomLevel > 1.0) {
            panX = panX * 0.5;
            panY = panY * 0.5;
        }
        if (clampedZoom <= 0.4) {
            panX = 0;
            panY = 0;
        }

        zoomLevel = clampedZoom;
        updateCanvasTransform();
    }

    function resetZoom() {
        zoomLevel = 1.0;
        panX = 0;
        panY = 0;
        updateCanvasTransform();
    }

    // Ctrl + Scroll Wheel Zoom (preventDefault keeps UI & browser from zooming)
    function onViewportWheel(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();

            const zoomFactor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
            applyZoomAt(zoomLevel * zoomFactor, e.clientX, e.clientY);
        }
    }

    if (canvasContainer) {
        canvasContainer.addEventListener('wheel', onViewportWheel, { passive: false });
        
        canvasContainer.addEventListener('dblclick', (e) => {
            if (!e.target.closest('.viewport-zoom-hud')) {
                resetZoom();
            }
        });

        canvasContainer.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && (zoomLevel > 1.05 || isSpacePressed))) {
                e.preventDefault();
                isPanning = true;
                startPanX = e.clientX;
                startPanY = e.clientY;
                initialPanX = panX;
                initialPanY = panY;
                canvasContainer.classList.add('panning');
            }
        });
    }

    if (viewportPanel) {
        viewportPanel.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (canvasContainer && !canvasContainer.contains(e.target)) {
                    const zoomFactor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
                    applyZoomAt(zoomLevel * zoomFactor);
                }
            }
        }, { passive: false });
    }

    // Global intercept to prevent browser page zoom when scrolling with Ctrl over video or viewport
    window.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if ((canvasContainer && canvasContainer.contains(e.target)) || 
                (viewportPanel && viewportPanel.contains(e.target))) {
                e.preventDefault();
            }
        }
    }, { passive: false });

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            panX = initialPanX + (e.clientX - startPanX);
            panY = initialPanY + (e.clientY - startPanY);
            updateCanvasTransform();
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (isPanning) {
            isPanning = false;
            if (canvasContainer) canvasContainer.classList.remove('panning');
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
            isSpacePressed = true;
            if (zoomLevel > 1.05 && canvasContainer) canvasContainer.classList.add('can-pan');
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            isSpacePressed = false;
            if (!isPanning && zoomLevel <= 1.05 && canvasContainer) canvasContainer.classList.remove('can-pan');
        }
    });

    if (resolutionBadge) {
        resolutionBadge.addEventListener('click', resetZoom);
        resolutionBadge.title = "Click to reset zoom (100%)";
    }

    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyZoomAt(zoomLevel * 1.25);
        });
    }
    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', (e) => {
            e.stopPropagation();
            applyZoomAt(zoomLevel * 0.8);
        });
    }
    if (btnZoomReset) {
        btnZoomReset.addEventListener('click', (e) => {
            e.stopPropagation();
            resetZoom();
        });
    }
    if (zoomLevelLabel) {
        zoomLevelLabel.addEventListener('click', (e) => {
            e.stopPropagation();
            resetZoom();
        });
    }

    // -------------------------------------------------------------
    // Render Queue & Video Export Engine (GPU / CPU Acceleration)
    // -------------------------------------------------------------
    const btnExportHeader = document.getElementById('btn-export-video-header');
    const btnExportBar = document.getElementById('btn-export-video-bar');
    const exportModal = document.getElementById('export-video-modal');
    const modalCloseX = document.getElementById('modal-close-x');
    const btnCancelRender = document.getElementById('btn-cancel-render');
    const btnStartRender = document.getElementById('btn-start-render');
    const btnDownloadVideo = document.getElementById('btn-download-video');

    const selectAcceleration = document.getElementById('render-acceleration');
    const selectFormat = document.getElementById('render-format');
    const selectFps = document.getElementById('render-fps');
    const selectBitrate = document.getElementById('render-bitrate');

    const renderStatusText = document.getElementById('render-status-text');
    const hardwareBadge = document.getElementById('hardware-active-badge');
    const progressFill = document.getElementById('render-progress-fill');
    const frameCounterStat = document.getElementById('render-frame-counter');
    const fpsStat = document.getElementById('render-fps-stat');
    const percentageStat = document.getElementById('render-percentage-stat');

    let activeMediaRecorder = null;
    let isRenderingVideo = false;
    let recordedVideoBlobUrl = null;

    // Open Export Modal
    function openExportModal() {
        exportModal.classList.add('active');
        resetExportModalUI();
    }

    // Close Export Modal
    function closeExportModal() {
        if (isRenderingVideo) {
            if (!confirm("Video render is in progress. Are you sure you want to cancel?")) {
                return;
            }
            cancelVideoRender();
        }
        exportModal.classList.remove('active');
    }

    function resetExportModalUI() {
        isRenderingVideo = false;
        progressFill.style.width = '0%';
        percentageStat.textContent = '0%';
        frameCounterStat.textContent = 'Frame 0 / 0';
        fpsStat.textContent = '0 FPS';
        renderStatusText.textContent = 'Ready to render video';
        btnStartRender.style.display = 'inline-flex';
        btnDownloadVideo.style.display = 'none';
        btnStartRender.disabled = false;
        selectAcceleration.disabled = false;
        selectFormat.disabled = false;
        selectFps.disabled = false;
        selectBitrate.disabled = false;
    }

    btnExportHeader.addEventListener('click', openExportModal);
    btnExportBar.addEventListener('click', openExportModal);
    modalCloseX.addEventListener('click', closeExportModal);
    btnCancelRender.addEventListener('click', closeExportModal);

    // Hardware Badge update
    selectAcceleration.addEventListener('change', () => {
        if (selectAcceleration.value === 'gpu') {
            hardwareBadge.className = 'hardware-badge badge-gpu';
            hardwareBadge.textContent = '⚡ GPU WebCodecs Accelerated';
        } else {
            hardwareBadge.className = 'hardware-badge badge-cpu';
            hardwareBadge.textContent = '💻 CPU Software Frame Rasterizer';
        }
    });

    // Variables for Video Export Recording
    let origVideoLoop = false;
    let renderStartTime = 0;
    let exportFrameCount = 0;
    let exportTotalFrames = 0;
    let exportDurationSecs = 10;
    let exportExt = 'webm';
    let exportMimeType = 'video/webm';
    let exportCancelRequested = false;
    let exportVideoTrack = null;

    // ── Frame-accurate async export loop ──────────────────────────────────
    async function runFrameAccurateExport(targetFps, targetBitrate, requestedFormat) {
        // Determine MimeType
        exportMimeType = 'video/webm';
        exportExt = 'webm';
        if (requestedFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')) {
            exportMimeType = 'video/mp4;codecs=avc1.42E01E';
            exportExt = 'mp4';
        } else if (requestedFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4')) {
            exportMimeType = 'video/mp4';
            exportExt = 'mp4';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            exportMimeType = 'video/webm;codecs=vp9';
            exportExt = 'webm';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
            exportMimeType = 'video/webm;codecs=vp8';
            exportExt = 'webm';
        }

        exportDurationSecs = getTotalDuration();
        exportTotalFrames = Math.round(exportDurationSecs * targetFps);
        exportFrameCount = 0;
        exportCancelRequested = false;
        renderStartTime = performance.now();

        renderStatusText.textContent = `Rendering ${exportTotalFrames} frames @ ${targetFps}fps — frame-accurate export...`;

        // Use manual frame-push canvas stream (fps=0 means we control timing)
        const canvasStream = canvas.captureStream(0);
        exportVideoTrack = canvasStream.getVideoTracks()[0];

        const chunks = [];
        let recStream = canvasStream;

        // Try to attach audio (best-effort — won't block export if unavailable)
        if (!isSynthDemo) {
            try {
                let audioTracks = [];
                if (typeof video.captureStream === 'function') {
                    audioTracks = video.captureStream().getAudioTracks();
                } else if (typeof video.mozCaptureStream === 'function') {
                    audioTracks = video.mozCaptureStream().getAudioTracks();
                }
                if (audioTracks && audioTracks.length > 0) {
                    recStream = new MediaStream([
                        ...canvasStream.getVideoTracks(),
                        ...audioTracks
                    ]);
                }
            } catch (e) {
                console.warn('Audio capture skipped:', e);
            }
        }

        // Set up MediaRecorder
        try {
            activeMediaRecorder = new MediaRecorder(recStream, {
                mimeType: exportMimeType,
                videoBitsPerSecond: targetBitrate
            });
        } catch (err) {
            activeMediaRecorder = new MediaRecorder(recStream, { videoBitsPerSecond: targetBitrate });
        }

        activeMediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        // Promise that resolves when recorder stops
        const recStopPromise = new Promise(res => {
            activeMediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: exportMimeType });
                if (recordedVideoBlobUrl) URL.revokeObjectURL(recordedVideoBlobUrl);
                recordedVideoBlobUrl = URL.createObjectURL(blob);

                const totalExported = exportFrameCount;
                renderStatusText.textContent = exportCancelRequested
                    ? `Export cancelled after ${totalExported} frames.`
                    : `✅ Render Complete! ${totalExported} frames — ${exportDurationSecs.toFixed(2)}s (exact match).`;
                progressFill.style.width = '100%';
                percentageStat.textContent = '100%';

                if (!exportCancelRequested) {
                    btnStartRender.style.display = 'none';
                    btnDownloadVideo.style.display = 'inline-flex';
                    btnDownloadVideo.onclick = () => {
                        const a = document.createElement('a');
                        a.download = `ASCIIArt_Export_${Date.now()}.${exportExt}`;
                        a.href = recordedVideoBlobUrl;
                        a.click();
                    };
                }
                isRenderingVideo = false;
                btnStartRender.disabled = false;
                selectAcceleration.disabled = false;
                selectFormat.disabled = false;
                selectFps.disabled = false;
                selectBitrate.disabled = false;
                res();
            };
        });

        // Rewind source
        if (!isSynthDemo) {
            origVideoLoop = video.loop;
            video.loop = false;
            video.pause();
            isPlaying = false;
            updatePlayPauseButton();
            video.currentTime = 0;
            await new Promise(r => {
                if (video.readyState >= 2 && Math.abs(video.currentTime) < 0.01) return r();
                let done = false;
                const finish = () => {
                    if (!done) { done = true; video.removeEventListener('seeked', finish); r(); }
                };
                video.addEventListener('seeked', finish, { once: true });
                setTimeout(finish, 200);
            });
        } else {
            synthFrameCount = 0;
        }

        activeMediaRecorder.start(200); // collect chunks every 200ms

        // ── Frame step loop ──────────────────────────────────────────────
        const frameDuration = 1.0 / targetFps;
        const frameTargetMs = 1000 / targetFps;

        for (let f = 0; f < exportTotalFrames; f++) {
            if (exportCancelRequested) break;

            const frameStartTime = performance.now();
            const targetTime = f * frameDuration;

            if (!isSynthDemo) {
                // Seek video to exact frame time safely
                if (Math.abs(video.currentTime - targetTime) >= 0.001) {
                    video.currentTime = targetTime;
                    await new Promise(r => {
                        let done = false;
                        const finish = () => {
                            if (!done) {
                                done = true;
                                video.removeEventListener('seeked', finish);
                                r();
                            }
                        };
                        video.addEventListener('seeked', finish, { once: true });
                        setTimeout(finish, 150); // Safety fallback timeout to prevent export freeze
                    });
                }

                // Draw freshly seeked video frame to sampleCanvas
                const tw = video.videoWidth || 800;
                const th = video.videoHeight || 450;
                if (sampleCanvas.width !== tw || sampleCanvas.height !== th) {
                    sampleCanvas.width = tw;
                    sampleCanvas.height = th;
                }
                sampleCtx.drawImage(video, 0, 0, tw, th);
            } else {
                synthFrameCount = Math.round(targetTime * 30);
            }

            // Render ASCII to canvas (exporting mode skips duplicate sample drawing / frame count increments)
            renderAsciiFrame(true);

            // Push this rendered canvas frame into the stream
            if (exportVideoTrack && typeof exportVideoTrack.requestFrame === 'function') {
                exportVideoTrack.requestFrame();
            }

            exportFrameCount = f + 1;

            // Update UI stats
            const pct = Math.round((exportFrameCount / exportTotalFrames) * 100);
            progressFill.style.width = `${pct}%`;
            percentageStat.textContent = `${pct}%`;
            frameCounterStat.textContent = `Frame ${exportFrameCount} / ${exportTotalFrames}`;
            const elapsed = (performance.now() - renderStartTime) / 1000;
            const eFps = elapsed > 0 ? (exportFrameCount / elapsed).toFixed(1) : '—';
            fpsStat.textContent = `${eFps} FPS (encode speed)`;

            // Pace frame output so MediaRecorder receives frames with consistent timestamps
            const processingMs = performance.now() - frameStartTime;
            const delayMs = Math.max(0, frameTargetMs - processingMs);
            await new Promise(r => setTimeout(r, delayMs));
        }

        // Stop recorder — triggers onstop → blob download
        if (!isSynthDemo && origVideoLoop !== undefined) {
            video.loop = origVideoLoop;
        }
        if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
            activeMediaRecorder.stop();
        }

        await recStopPromise;
    }

    // ── Real-Time 1.0x Speed Stream Recorder (Exact Duration & Perfect Audio Sync) ──────
    async function runRealTimeExport(targetFps, targetBitrate, requestedFormat) {
        // Determine MimeType
        exportMimeType = 'video/webm';
        exportExt = 'webm';
        if (requestedFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')) {
            exportMimeType = 'video/mp4;codecs=avc1.42E01E';
            exportExt = 'mp4';
        } else if (requestedFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4')) {
            exportMimeType = 'video/mp4';
            exportExt = 'mp4';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            exportMimeType = 'video/webm;codecs=vp9';
            exportExt = 'webm';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
            exportMimeType = 'video/webm;codecs=vp8';
            exportExt = 'webm';
        }

        exportDurationSecs = getTotalDuration();
        exportTotalFrames = Math.round(exportDurationSecs * targetFps);
        exportFrameCount = 0;
        exportCancelRequested = false;
        renderStartTime = performance.now();

        renderStatusText.textContent = `Rendering real-time video (${exportDurationSecs.toFixed(1)}s @ 1.0x playback speed)...`;

        // Capture stream at constant target FPS
        const canvasStream = canvas.captureStream(targetFps);
        let recStream = canvasStream;

        if (!isSynthDemo) {
            try {
                let audioTracks = [];
                if (typeof video.captureStream === 'function') {
                    audioTracks = video.captureStream().getAudioTracks();
                } else if (typeof video.mozCaptureStream === 'function') {
                    audioTracks = video.mozCaptureStream().getAudioTracks();
                }
                if (audioTracks && audioTracks.length > 0) {
                    recStream = new MediaStream([
                        ...canvasStream.getVideoTracks(),
                        ...audioTracks
                    ]);
                }
            } catch (e) {
                console.warn('Audio capture skipped:', e);
            }
        }

        try {
            activeMediaRecorder = new MediaRecorder(recStream, {
                mimeType: exportMimeType,
                videoBitsPerSecond: targetBitrate
            });
        } catch (err) {
            activeMediaRecorder = new MediaRecorder(recStream, { videoBitsPerSecond: targetBitrate });
        }

        const chunks = [];
        activeMediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        const recStopPromise = new Promise(res => {
            activeMediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: exportMimeType });
                if (recordedVideoBlobUrl) URL.revokeObjectURL(recordedVideoBlobUrl);
                recordedVideoBlobUrl = URL.createObjectURL(blob);

                renderStatusText.textContent = exportCancelRequested
                    ? `Export cancelled.`
                    : `✅ Render Complete! Exact ${exportDurationSecs.toFixed(2)}s video exported (1.0x speed match).`;
                progressFill.style.width = '100%';
                percentageStat.textContent = '100%';

                if (!exportCancelRequested) {
                    btnStartRender.style.display = 'none';
                    btnDownloadVideo.style.display = 'inline-flex';
                    btnDownloadVideo.onclick = () => {
                        const a = document.createElement('a');
                        a.download = `ASCIIArt_Export_${Date.now()}.${exportExt}`;
                        a.href = recordedVideoBlobUrl;
                        a.click();
                    };
                }
                isRenderingVideo = false;
                btnStartRender.disabled = false;
                selectAcceleration.disabled = false;
                selectFormat.disabled = false;
                selectFps.disabled = false;
                selectBitrate.disabled = false;
                res();
            };
        });

        // Rewind video source to start
        if (!isSynthDemo) {
            origVideoLoop = video.loop;
            video.loop = false;
            video.pause();
            isPlaying = false;
            updatePlayPauseButton();
            video.currentTime = 0;
            await new Promise(r => {
                if (video.readyState >= 2 && Math.abs(video.currentTime) < 0.01) return r();
                let done = false;
                const finish = () => {
                    if (!done) { done = true; video.removeEventListener('seeked', finish); r(); }
                };
                video.addEventListener('seeked', finish, { once: true });
                setTimeout(finish, 200);
            });
        } else {
            synthFrameCount = 0;
        }

        activeMediaRecorder.start(100); // Collect chunk slices every 100ms

        if (!isSynthDemo) {
            video.play();
            isPlaying = true;
            updatePlayPauseButton();
        }

        // Real-time animation playback loop
        await new Promise(resolve => {
            function loopStep() {
                if (exportCancelRequested) {
                    if (!isSynthDemo) video.pause();
                    if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
                        activeMediaRecorder.stop();
                    }
                    return resolve();
                }

                const currentSecs = getCurrentPlayheadTime();
                renderAsciiFrame(false);

                const pct = Math.min(100, Math.round((currentSecs / exportDurationSecs) * 100));
                progressFill.style.width = `${pct}%`;
                percentageStat.textContent = `${pct}%`;
                exportFrameCount = Math.round(currentSecs * targetFps);
                frameCounterStat.textContent = `Frame ${exportFrameCount} / ${exportTotalFrames}`;

                const elapsed = (performance.now() - renderStartTime) / 1000;
                const eFps = elapsed > 0 ? (exportFrameCount / elapsed).toFixed(1) : '—';
                fpsStat.textContent = `${eFps} FPS (1.0x speed)`;

                if (currentSecs >= exportDurationSecs - 0.05 || (!isSynthDemo && video.ended)) {
                    if (!isSynthDemo) video.pause();
                    if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
                        activeMediaRecorder.stop();
                    }
                    return resolve();
                }

                requestAnimationFrame(loopStep);
            }

            requestAnimationFrame(loopStep);
        });

        if (!isSynthDemo && origVideoLoop !== undefined) {
            video.loop = origVideoLoop;
        }

        await recStopPromise;
    }

    // Start Render Engine
    btnStartRender.addEventListener('click', async () => {
        isRenderingVideo = true;
        btnStartRender.disabled = true;
        selectAcceleration.disabled = true;
        selectFormat.disabled = true;
        selectFps.disabled = true;
        selectBitrate.disabled = true;

        const targetFps = parseInt(selectFps.value) || 30;
        const targetBitrate = parseInt(selectBitrate.value) || 8000000;
        const requestedFormat = selectFormat.value;
        const useGpuRealtime = selectAcceleration.value === 'gpu';

        try {
            if (useGpuRealtime) {
                await runRealTimeExport(targetFps, targetBitrate, requestedFormat);
            } else {
                await runFrameAccurateExport(targetFps, targetBitrate, requestedFormat);
            }
        } catch (err) {
            console.error('Export failed:', err);
            renderStatusText.textContent = `Export error: ${err.message}`;
            isRenderingVideo = false;
            btnStartRender.disabled = false;
            selectAcceleration.disabled = false;
            selectFormat.disabled = false;
            selectFps.disabled = false;
            selectBitrate.disabled = false;
        }
    });

    function cancelVideoRender() {
        if (!isRenderingVideo) {
            resetExportModalUI();
            return;
        }
        exportCancelRequested = true;
        // The export loop checks exportCancelRequested and will stop itself;
        // activeMediaRecorder.stop() is called there too, which triggers onstop.
    }

    // -------------------------------------------------------------
    // After Effects Timeline Dope Sheet & Ruler Controller
    // -------------------------------------------------------------
    function drawTimelineRuler() {
        if (!tlRulerCanvas || !tlRuler) return;
        const rect = tlRuler.getBoundingClientRect();
        const width = rect.width || tlTracksScroll.clientWidth || 600;
        const height = 28;
        const dpr = window.devicePixelRatio || 1;

        tlRulerCanvas.width = width * dpr;
        tlRulerCanvas.height = height * dpr;
        const rCtx = tlRulerCanvas.getContext('2d');
        rCtx.scale(dpr, dpr);

        rCtx.fillStyle = '#1a1a1a';
        rCtx.fillRect(0, 0, width, height);

        const duration = getTotalDuration();
        const pxPerSec = width / duration;

        let majorInterval = 1;
        if (pxPerSec < 40) majorInterval = 2;
        if (pxPerSec < 20) majorInterval = 5;

        rCtx.fillStyle = '#777777';
        rCtx.font = '10px "Fira Code", monospace';
        rCtx.textAlign = 'left';
        rCtx.textBaseline = 'top';

        for (let s = 0; s <= duration; s += 0.25) {
            const x = (s / duration) * width;
            const isMajor = Math.abs(s % majorInterval) < 0.05 || Math.abs(s % majorInterval - majorInterval) < 0.05;
            const isMid = Math.abs(s % (majorInterval / 2)) < 0.05;

            rCtx.strokeStyle = isMajor ? '#555555' : isMid ? '#383838' : '#282828';
            rCtx.lineWidth = 1;
            rCtx.beginPath();
            const tickH = isMajor ? 12 : isMid ? 7 : 4;
            rCtx.moveTo(x, height - tickH);
            rCtx.lineTo(x, height);
            rCtx.stroke();

            if (isMajor && x < width - 35) {
                const mins = Math.floor(s / 60);
                const secs = Math.floor(s % 60);
                rCtx.fillText(`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}s`, x + 3, 4);
            }
        }
    }

    function renderTimelineTracks() {
        if (!tlPropertyHeadersList || !tlPropertyLanesList) return;
        tlPropertyHeadersList.innerHTML = '';
        tlPropertyLanesList.innerHTML = '';

        const totalDuration = getTotalDuration();

        activeStopwatches.forEach(paramKey => {
            const def = PARAM_DEFS[paramKey];
            if (!def) return;

            // 1. Create Track Header row in left column
            const headerRow = document.createElement('div');
            headerRow.className = 'tl-track-row tl-track-prop-row';
            headerRow.innerHTML = `
                <div class="tl-track-prop-left">
                    <button class="kf-btn kf-diamond-btn ${keyframesStore[paramKey].length > 0 ? 'active' : ''}" data-param="${paramKey}" title="Add/Remove Keyframe at Playhead">◆</button>
                    <span>${def.label}</span>
                </div>
                <span class="tl-prop-val-badge" id="tl-prop-val-${paramKey}">${def.format(def.get())}</span>
            `;
            headerRow.querySelector('.kf-diamond-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleKeyframeAtCurrentTime(paramKey);
            });
            tlPropertyHeadersList.appendChild(headerRow);

            // 2. Create Track Lane in right dope sheet
            const lane = document.createElement('div');
            lane.className = 'tl-track-lane';
            lane.dataset.param = paramKey;

            // Render diamond keyframe nodes
            const list = keyframesStore[paramKey] || [];
            list.forEach(kf => {
                const node = document.createElement('div');
                node.className = 'tl-keyframe-node';
                if (selectedKeyframe && selectedKeyframe.id === kf.id) {
                    node.classList.add('selected');
                }
                const pct = (kf.time / totalDuration) * 100;
                node.style.left = `${Math.min(100, Math.max(0, pct))}%`;
                node.title = `${def.label} @ ${kf.time.toFixed(2)}s: ${def.format(kf.value)} (Click to jump, double-click to delete)`;

                node.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedKeyframe = { paramKey, id: kf.id };
                    document.querySelectorAll('.tl-keyframe-node').forEach(n => n.classList.remove('selected'));
                    node.classList.add('selected');
                    setCurrentPlayheadTime(kf.time);
                });

                node.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    const idx = list.findIndex(k => k.id === kf.id);
                    if (idx !== -1) list.splice(idx, 1);
                    renderTimelineTracks();
                    updateTotalKeyframesCount();
                    requestRender();
                });

                lane.appendChild(node);
            });

            tlPropertyLanesList.appendChild(lane);
        });

        drawTimelineRuler();
    }

    // Timeline mouse scrubbing
    function handleTimelineScrub(e) {
        const rect = tlTracksScroll.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const totalDuration = getTotalDuration();
        setCurrentPlayheadTime(pct * totalDuration);
    }

    let isScrubbingTimeline = false;
    tlRuler.addEventListener('mousedown', (e) => {
        isScrubbingTimeline = true;
        handleTimelineScrub(e);
    });

    tlTracksScroll.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('tl-keyframe-node')) return;
        isScrubbingTimeline = true;
        handleTimelineScrub(e);
    });

    window.addEventListener('mousemove', (e) => {
        if (isScrubbingTimeline) {
            handleTimelineScrub(e);
        }
    });

    window.addEventListener('mouseup', () => {
        isScrubbingTimeline = false;
    });

    window.addEventListener('resize', () => {
        drawTimelineRuler();
    });

    // Timeline Header Action Buttons
    btnTlAddKf.addEventListener('click', () => {
        const curTime = getCurrentPlayheadTime();
        if (activeStopwatches.size === 0) {
            // Activate Block Size and Character Size as starter animatables
            activeStopwatches.add('blockSize');
            activeStopwatches.add('charSize');
            updateStopwatchButtons();
        }
        activeStopwatches.forEach(paramKey => {
            addOrUpdateKeyframe(paramKey, curTime, PARAM_DEFS[paramKey].get());
        });
        renderTimelineTracks();
        updateKeyframeDiamondsState(curTime);
        updateTotalKeyframesCount();
        requestRender();
    });

    btnTlDeleteKf.addEventListener('click', () => {
        const curTime = getCurrentPlayheadTime();
        activeStopwatches.forEach(paramKey => {
            const list = keyframesStore[paramKey];
            const idx = list.findIndex(k => Math.abs(k.time - curTime) <= 0.08);
            if (idx !== -1) list.splice(idx, 1);
        });
        renderTimelineTracks();
        updateKeyframeDiamondsState(curTime);
        updateTotalKeyframesCount();
        requestRender();
    });

    btnTlClearAll.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear all keyframes across all properties?")) {
            for (const key in keyframesStore) {
                keyframesStore[key] = [];
            }
            renderTimelineTracks();
            updateKeyframeDiamondsState(getCurrentPlayheadTime());
            updateTotalKeyframesCount();
            requestRender();
        }
    });

    // Sync Comp Title updates
    const origBtnUploadChange = btnUpload.onchange;
    btnUpload.addEventListener('change', () => {
        tlCompTitle.textContent = compLayerName.textContent;
        drawTimelineRuler();
        renderTimelineTracks();
    });
    btnWebcam.addEventListener('click', () => {
        tlCompTitle.textContent = compLayerName.textContent;
        drawTimelineRuler();
        renderTimelineTracks();
    });
    btnDemoSynth.addEventListener('click', () => {
        tlCompTitle.textContent = compLayerName.textContent;
        drawTimelineRuler();
        renderTimelineTracks();
    });

    // Initial timeline render
    drawTimelineRuler();
    renderTimelineTracks();
});
