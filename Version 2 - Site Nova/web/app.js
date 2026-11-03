(() => {
  "use strict";

  const pages = ["home", "translator", "vocabulary", "history", "about"];
  const pageLabels = { home: "Home", translator: "Translator", vocabulary: "Supported signs", history: "History", about: "About Signova" };
  const supportedWords = ["book", "deaf", "eat", "drink", "family", "go", "happy", "help", "home", "like", "mother", "need", "no", "not", "please", "school", "water", "want", "yes", "you"];
  const currentLanguage = "en";
  function t(source, values = {}) {
    let output = String(source);
    for (const [key, value] of Object.entries(values)) {
      output = output.replaceAll(`{${key}}`, String(value));
    }
    return output;
  }
  function setText(element, source, values = {}) {
    if (!element) return;
    element.textContent = t(source, values);
  }
  function setEnglishText(element, source, values = {}) {
    if (!element) return;
    element.dataset.noTranslate = "true";
    setText(element, source, values);
  }
  function applyLanguage() {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    document.title = "Signova V2 — Sign Language Translator";
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = "Signova — an AI-assisted sign language translation interface.";
  }
  const requestedApi = new URLSearchParams(window.location.search).get("api");
  const requestedBuild = new URLSearchParams(window.location.search).get("build");
  const configuredApiBuild = window.SIGNOVA_API_BUILD || "";
  const runningScript = document.currentScript || [...document.scripts].find(script => script.src.includes("app.js"));
  const currentBuild = runningScript?.src ? new URL(runningScript.src, document.baseURI).searchParams.get("build") : null;
  const websiteBuildMismatch = Boolean(requestedApi && requestedBuild && currentBuild && requestedBuild !== currentBuild);
  function resolveApiBase() {
    const configuredApi = requestedApi || window.SIGNOVA_API_BASE;
    if (configuredApi) {
      try {
        const candidate = new URL(configuredApi, window.location.href);
        const localHttp = candidate.protocol === "http:" && ["localhost", "127.0.0.1"].includes(candidate.hostname);
        if (candidate.protocol !== "https:" && !localHttp) throw new Error("API URLs must use HTTPS outside localhost.");
        if (candidate.username || candidate.password || candidate.search || candidate.hash || candidate.pathname !== "/") {
          throw new Error("API URL must be an origin, such as https://api.example.com.");
        }
        return candidate.origin;
      } catch {
        // Invalid API links fall back to the local development server.
      }
    }
    return ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "http://127.0.0.1:8000"
      : "";
  }
  const API_BASE = (websiteBuildMismatch ? "" : resolveApiBase()).replace(/\/+$/, "");
  let mediaRecorder = null;
  const state = {
    currentPage: "home", stream: null, currentPrediction: null, recognitionMode: "words", sentence: [], history: [],
    cameraFacingMode: "user", poseLandmarker: null, poseTaskPromise: null, handLandmarker: null, handTaskPromise: null, poseLoopActive: false,
    isFramingReady: false, readyFrames: 0, manualPoseFallback: false, isAnalyzing: false, lastPoseFrame: 0,
    captureRequestId: 0, capturePreviewUrl: null, characterModelAvailable: false
  };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    sidebar: $("#sidebar"), pageCrumb: $("#pageCrumb"), toast: $("#toast"),
    recognizedTypeLabel: $("#recognizedTypeLabel"),
    apiStatus: $("#sidebarApiStatus"), apiExpiryNotice: $("#apiExpiryNotice"), apiExpiryMessage: $("#apiExpiryMessage"),
    cameraVideo: $("#cameraVideo"), cameraStage: $("#cameraStage"), cameraStatus: $("#cameraStatus"),
    startCamera: $("#startCamera"), startSign: $("#startSign"), stopCamera: $("#stopCamera"), takePicture: $("#takePicture"),
    restartCapture: $("#restartCapture"), captureImage: $("#captureImage"), captureVideo: $("#captureVideo"),
    flipCamera: $("#flipCamera"), cameraOff: $("#cameraOff"), cameraHelp: $("#cameraHelp"),
    framingGuide: $("#framingGuide"), framingTitle: $("#framingTitle"), framingMessage: $("#framingMessage"),
    predictedWord: $("#predictedWord"), predictionDescription: $("#predictionDescription"),
    confidenceLabel: $("#confidenceLabel"), confidenceText: $("#confidenceText"), confidenceBar: $("#confidenceBar"), demoPrediction: $("#demoPrediction"),
    predictionSuggestions: $("#predictionSuggestions"), suggestionHeading: $("#suggestionHeading"),
    recognitionModeHelp: $("#recognitionModeHelp"), recognitionModeInputs: $$("input[name='recognitionMode']"),
    addWord: $("#addWord"), playSentence: $("#playSentence"), sentenceBox: $("#sentenceBox"), wordCount: $("#wordCount"),
    sentenceFeedback: $("#sentenceFeedback"), historyRows: $("#historyRows"),
    historyWordTotal: $("#historyWordTotal"), historySentenceTotal: $("#historySentenceTotal")
  };

  applyLanguage(currentLanguage);

  function fillVocabulary(selector, labels) {
    const container = $(selector);
    if (!container) return;
    container.replaceChildren(...labels.map(label => {
      const chip = document.createElement("span");
      chip.className = "vocabulary-chip";
      chip.dataset.noTranslate = "true";
      chip.textContent = label;
      return chip;
    }));
  }
  fillVocabulary("#supportedWordList", supportedWords);
  fillVocabulary("#supportedLetterList", [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]);
  fillVocabulary("#supportedNumberList", [..."0123456789"]);

  function setRecognitionMode(mode) {
    state.recognitionMode = ["letters", "numbers"].includes(mode) ? mode : "words";
    const isCharacters = state.recognitionMode !== "words";
    const kindLabel = state.recognitionMode === "numbers" ? "NUMBER" : "LETTER";
    setEnglishText(elements.recognizedTypeLabel, isCharacters ? `RECOGNIZED ${kindLabel}` : "RECOGNIZED WORD");
    elements.startSign.hidden = isCharacters;
    elements.stopCamera.hidden = isCharacters;
    elements.takePicture.hidden = !isCharacters;
    const captureBusy = state.isAnalyzing || Boolean(state.currentPrediction) || Boolean(mediaRecorder && mediaRecorder.state === "recording");
    elements.startSign.disabled = isCharacters || !state.stream || captureBusy || typeof MediaRecorder === "undefined";
    elements.takePicture.disabled = !isCharacters || !state.stream || captureBusy;
    const recognitionModeBusy = state.isAnalyzing || Boolean(mediaRecorder && mediaRecorder.state === "recording");
    elements.recognitionModeInputs.forEach(input => {
      const selected = input.value === state.recognitionMode;
      const option = input.closest(".recognition-mode");
      input.checked = selected;
      input.disabled = recognitionModeBusy;
      option?.classList.toggle("active", selected);
      option?.classList.toggle("disabled", recognitionModeBusy);
    });
    const inputDescription = state.recognitionMode === "words"
      ? "Words use a short video. Letters and numbers use one clear photo."
      : state.recognitionMode === "numbers"
        ? "Numbers mode only ranks digits 0–9. Center one handshape and take a photo."
        : "Letters mode only ranks A–Z. Center one handshape and take a photo.";
    setEnglishText(elements.recognitionModeHelp, inputDescription);
    if (elements.demoPrediction?.firstChild?.nodeType === Node.TEXT_NODE) {
      elements.demoPrediction.firstChild.nodeValue = state.recognitionMode === "words"
        ? "Upload video "
        : "Upload photo ";
    }
    elements.demoPrediction?.setAttribute("aria-label", state.recognitionMode === "words"
      ? "Upload a sign video"
      : "Upload a letter or number photo");
    if (isCharacters && state.stream) {
      stopPoseGuideLoop();
      state.manualPoseFallback = true;
      setFramingState("manual", "Ready to capture", "Show one clear handshape in the center of the frame, then take a picture.", true);
    } else if (!isCharacters && state.stream && !state.poseLoopActive) {
      state.manualPoseFallback = false;
      startPoseGuide();
    }
    if (elements.addWord && !state.currentPrediction) {
      const label = state.recognitionMode === "numbers" ? "Done · Next number "
        : state.recognitionMode === "letters" ? "Done · Next letter " : "Done · Next word ";
      if (elements.addWord.firstChild?.nodeType === Node.TEXT_NODE) elements.addWord.firstChild.nodeValue = label;
    }
    if (elements.sentenceFeedback && !state.currentPrediction) {
      setEnglishText(elements.sentenceFeedback, isCharacters
        ? `Check the ${state.recognitionMode === "numbers" ? "number" : "letter"} result, then add it to your text.`
        : "Check each prediction, then press Done to build your sentence one word at a time.");
    }
  }
  setRecognitionMode("words");
  elements.recognitionModeInputs.forEach(input => input.addEventListener("change", () => {
    if (!input.checked) return;
    if (state.isAnalyzing || (mediaRecorder && mediaRecorder.state === "recording")) {
      setRecognitionMode(state.recognitionMode);
      return;
    }
    if (state.capturePreviewUrl || state.currentPrediction) restartCapture();
    setRecognitionMode(input.value);
  }));

  function clearCapturePreview() {
    if (state.capturePreviewUrl) URL.revokeObjectURL(state.capturePreviewUrl);
    state.capturePreviewUrl = null;
    elements.captureImage.removeAttribute("src");
    elements.captureVideo.removeAttribute("src");
    elements.captureImage.hidden = true;
    elements.captureVideo.hidden = true;
    elements.captureVideo.pause();
    elements.restartCapture.hidden = true;
    elements.restartCapture.disabled = true;
  }

  function showCapturePreview(blob, type) {
    clearCapturePreview();
    state.capturePreviewUrl = URL.createObjectURL(blob);
    if (type === "photo") {
      elements.captureImage.src = state.capturePreviewUrl;
      elements.captureImage.hidden = false;
    } else {
      elements.captureVideo.src = state.capturePreviewUrl;
      elements.captureVideo.hidden = false;
    }
    elements.restartCapture.hidden = false;
    elements.restartCapture.disabled = false;
  }

  async function loadModelReport() {
    const target = $("#modelTestSummary");
    if (!target) return;
    try {
      const response = await fetch("./model-report.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Report unavailable");
      const report = await response.json();
      const test = report.test || {};
      const top1 = Number(test.top1_accuracy);
      const top3 = Number(test.top3_accuracy);
      const clips = Number(test.clip_count);
      if (![top1, top3, clips].every(Number.isFinite)) throw new Error("Report fields are missing");
      setEnglishText(target, "Top-1 {top1}% and top-3 {top3}% across {clips} held-out videos. Results describe this test set only.", {
        top1: (top1 * 100).toFixed(1), top3: (top3 * 100).toFixed(1), clips
      });
    } catch {
      setEnglishText(target, "Test results are unavailable until the model has been trained.");
    }
  }
  void loadModelReport();

  async function loadSiteVersion() {
    const versionLabel = $("#siteVersion");
    const buildLabel = $("#siteBuild");
    if (!versionLabel || !buildLabel) return;
    try {
      const response = await fetch(`./version.json?site=${encodeURIComponent(currentBuild || "current")}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Version information unavailable");
      const release = await response.json();
      setText(versionLabel, `Signova V${release.version}`);
      setText(buildLabel, String(release.build || currentBuild || "local").slice(0, 7));
    } catch {
      setText(versionLabel, "Signova V2.3.7");
      setText(buildLabel, String(currentBuild || "local").slice(0, 7));
    }
  }
  void loadSiteVersion();

  let toastTimer;
  let demoExpiresAt = null;
  let lastHealthError = false;
  let apiAddressMissing = false;
  let apiBuildMismatch = websiteBuildMismatch;
  let healthCheckPromise = null;

  const reconnectDelays = [2000, 5000, 10000, 20000];

  function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  function setApiStatus(source, values = {}) {
    setEnglishText(elements.apiStatus, source, values);
  }

  function isTransientStatus(status) {
    return [408, 425, 429, 502, 503, 504].includes(status);
  }

  async function fetchWithReconnect(url, options = {}, onRetry = () => {}) {
    let lastError;
    for (let attempt = 0; attempt <= reconnectDelays.length; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!isTransientStatus(response.status) || attempt === reconnectDelays.length) return response;
        lastError = new Error(`Temporary API response (${response.status})`);
      } catch (error) {
        lastError = error;
        if (attempt === reconnectDelays.length) break;
      } finally {
        clearTimeout(timeout);
      }
      onRetry(attempt + 1);
      await sleep(reconnectDelays[attempt]);
    }
    throw lastError || new Error("API reconnect attempts were exhausted.");
  }

  function formatClock(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    return [hours, minutes, remainder].map(value => String(value).padStart(2, "0")).join(":");
  }

  function updateApiExpiryNotice() {
    if (!elements.apiExpiryNotice || !elements.apiExpiryMessage) return;
    if (apiBuildMismatch) {
      elements.apiExpiryNotice.hidden = false;
      elements.apiExpiryNotice.classList.remove("expired");
      setText(elements.apiExpiryMessage, "The recognition service is updating. Please reload the page and try again.");
      return;
    }
    if (demoExpiresAt === null && !lastHealthError) {
      elements.apiExpiryNotice.hidden = true;
      return;
    }
    if (apiAddressMissing) {
      elements.apiExpiryNotice.hidden = false;
      elements.apiExpiryNotice.classList.remove("expired");
      setText(elements.apiExpiryMessage, apiBuildMismatch
        ? "This website link is outdated. Open the stable Signova V2 website address."
        : "The recognition service is unavailable. Please try again later.");
      return;
    }
    const secondsLeft = demoExpiresAt === null ? null : Math.ceil((demoExpiresAt - Date.now()) / 1000);
    if (secondsLeft !== null && secondsLeft > 15 && !lastHealthError) {
      elements.apiExpiryNotice.hidden = true;
      elements.apiExpiryNotice.classList.remove("expired");
      return;
    }
    elements.apiExpiryNotice.hidden = false;
    if (lastHealthError && (secondsLeft === null || secondsLeft > 0)) {
      elements.apiExpiryNotice.classList.remove("expired");
      setText(elements.apiExpiryMessage, "The recognition service is unavailable or starting. Signova retries automatically during a prediction request.");
    } else if (secondsLeft > 0) {
      elements.apiExpiryNotice.classList.remove("expired");
      setText(elements.apiExpiryMessage, "The recognition session ends in {time}. Finish any recording in progress.", { time: formatClock(secondsLeft) });
    } else {
      elements.apiExpiryNotice.classList.add("expired");
      setText(elements.apiExpiryMessage, "The recognition session has ended. Please try again later.");
    }
  }

  function updateDemoExpiryFromHealth(health) {
    const expiresAt = health.demo_expires_at == null ? NaN : Number(health.demo_expires_at);
    const secondsRemaining = health.seconds_remaining == null ? NaN : Number(health.seconds_remaining);
    if (Number.isFinite(expiresAt) && expiresAt > 0) {
      demoExpiresAt = expiresAt * 1000;
    } else if (Number.isFinite(secondsRemaining) && secondsRemaining >= 0) {
      demoExpiresAt = Date.now() + secondsRemaining * 1000;
    } else {
      demoExpiresAt = null;
    }
    lastHealthError = false;
    updateApiExpiryNotice();
  }
  function toast(message, values = {}) {
    setEnglishText(elements.toast, message, values);
    elements.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
  }

  async function checkApiHealth() {
    if (!elements.apiStatus) return;
    if (!API_BASE) {
      apiAddressMissing = true;
      lastHealthError = true;
      updateApiExpiryNotice();
      setApiStatus("Recognition service unavailable");
      elements.apiStatus.classList.remove("ready", "warning");
      elements.apiStatus.classList.add("error");
      return;
    }
    apiAddressMissing = false;
    if (healthCheckPromise) return healthCheckPromise;
    healthCheckPromise = (async () => {
      try {
        const response = await fetchWithReconnect(`${API_BASE}/health`, {}, () => {
          setApiStatus("Connecting to recognition service…");
          elements.apiStatus.classList.remove("ready", "error");
          elements.apiStatus.classList.add("warning");
        });
        if (!response.ok) throw new Error("API health check failed");
        const health = await response.json();
        if (health.status !== "ok" || !health.model_loaded
          || health.model_version !== "v2"
          || !Array.isArray(health.classes) || health.classes.length !== 20) {
          throw new Error("Model is not ready");
        }
        const expectedApiBuild = requestedApi ? requestedBuild : configuredApiBuild;
        if (expectedApiBuild && health.build_sha !== expectedApiBuild) {
          apiBuildMismatch = true;
          throw new Error("Website and API build do not match");
        }
        const characterMode = health.available_modes?.characters;
        state.characterModelAvailable = Boolean(characterMode?.model_loaded);
        const characterSummary = $("#characterModelAccuracy");
        if (characterSummary) {
          if (characterMode?.model_loaded && Number.isFinite(Number(characterMode.test_accuracy))) {
            const percent = (Number(characterMode.test_accuracy) * 100).toFixed(1);
            const samples = Number(characterMode.test_clip_count);
            setEnglishText(characterSummary, Number.isFinite(samples)
              ? "Image test accuracy: {percent}% across {samples} held-out photos. Camera results can differ."
              : "Image test accuracy: {percent}%. Camera results can differ.", { percent, samples });
          } else {
            setEnglishText(characterSummary, "Letters and numbers model is not trained or connected yet.");
          }
        }
        updateDemoExpiryFromHealth(health);
        const testAccuracy = health.test_accuracy == null ? NaN : Number(health.test_accuracy);
        if (Number.isFinite(testAccuracy) && testAccuracy < 0.30) {
          setApiStatus("Word model running · low held-out accuracy ({accuracy}%)", { accuracy: (testAccuracy * 100).toFixed(1) });
          elements.apiStatus.classList.remove("ready", "error");
          elements.apiStatus.classList.add("warning");
          return;
        }
        setApiStatus(characterMode?.model_loaded ? "Recognition service connected" : "Word recognition connected");
        elements.apiStatus.classList.remove("error", "warning");
        elements.apiStatus.classList.add("ready");
      } catch (error) {
        lastHealthError = true;
        updateApiExpiryNotice();
        setApiStatus(apiBuildMismatch
          ? "Recognition service updating · reload the page"
          : requestedApi
          ? "Recognition service unavailable · retry available"
          : "Recognition service unavailable");
        elements.apiStatus.classList.remove("ready", "warning");
        elements.apiStatus.classList.add("error");
      }
    })();
    try {
      await healthCheckPromise;
    } finally {
      healthCheckPromise = null;
    }
  }

  function navigate(page) {
    if (!pages.includes(page)) return;
    state.currentPage = page;
    $$(".page").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
    $$(".nav-link").forEach(button => button.dataset.page === page ? button.classList.add("active") : button.classList.remove("active"));
    setText(elements.pageCrumb, pageLabels[page]);
    elements.sidebar.classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $$("[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  $$("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
  $("#mobileMenu").addEventListener("click", () => elements.sidebar.classList.toggle("open"));

  let poseGuideTimer = null;
  const POSE_GUIDE_INTERVAL_MS = 700;

  function stopPoseGuideLoop() {
    state.poseLoopActive = false;
    if (poseGuideTimer !== null) {
      clearTimeout(poseGuideTimer);
      poseGuideTimer = null;
    }
  }

  function schedulePoseGuideFrame(delay = POSE_GUIDE_INTERVAL_MS) {
    if (!state.poseLoopActive || !state.stream) return;
    if (poseGuideTimer !== null) clearTimeout(poseGuideTimer);
    poseGuideTimer = setTimeout(runPoseGuideFrame, delay);
  }

  function watchCameraTrack(stream) {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.addEventListener("ended", () => {
      if (state.stream !== stream) return;
      stopPoseGuideLoop();
      state.stream = null;
      elements.cameraVideo.srcObject = null;
      elements.cameraStage.classList.remove("camera-on");
      elements.cameraStatus.parentElement.classList.remove("on");
      elements.startCamera.disabled = false;
      elements.startSign.disabled = true;
      elements.stopCamera.disabled = true;
      elements.flipCamera.disabled = true;
      elements.cameraOff.disabled = true;
      setEnglishText(elements.cameraStatus, "Camera stopped");
      setEnglishText(elements.cameraHelp, "The camera feed stopped. Start the camera again and check that no other app is using it.");
      toast("The camera feed stopped. Start it again to continue.");
    }, { once: true });
  }

  async function getCameraStream(facingMode) {
    return navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640, max: 640 },
        height: { ideal: 480, max: 480 },
        frameRate: { ideal: 24, max: 30 },
        facingMode: { ideal: facingMode }
      },
      audio: false
    });
  }

  function setFramingState(stateName, title, message, ready = false) {
    elements.framingGuide.dataset.state = stateName;
    elements.cameraStage.dataset.framing = stateName;
    setEnglishText(elements.framingTitle, title);
    setEnglishText(elements.framingMessage, message);
    state.isFramingReady = ready;
    const isRecording = mediaRecorder && mediaRecorder.state === "recording";
    const isCharacters = state.recognitionMode !== "words";
    elements.startSign.disabled = isCharacters || !state.stream || isRecording || state.isAnalyzing || Boolean(state.currentPrediction) || typeof MediaRecorder === "undefined";
    elements.takePicture.disabled = !isCharacters || !state.stream || isRecording || state.isAnalyzing || Boolean(state.currentPrediction);
  }

  async function loadPoseLandmarker() {
    if (state.poseLandmarker) return state.poseLandmarker;
    if (!state.poseTaskPromise) {
      state.poseTaskPromise = (async () => {
        const visionModule = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs");
        const vision = await visionModule.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
        );
        state.poseLandmarker = await visionModule.PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.55,
          minPosePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55
        });
        return state.poseLandmarker;
      })();
    }
    return state.poseTaskPromise;
  }

  async function loadHandLandmarker() {
    if (state.handLandmarker) return state.handLandmarker;
    if (!state.handTaskPromise) {
      state.handTaskPromise = (async () => {
        const visionModule = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs");
        const vision = await visionModule.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
        );
        state.handLandmarker = await visionModule.HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.45,
          minHandPresenceConfidence: 0.45,
          minTrackingConfidence: 0.45
        });
        return state.handLandmarker;
      })();
    }
    return state.handTaskPromise;
  }

  function handCropFromLandmarks(video, landmarks) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    const boxes = (landmarks || []).map(hand => {
      const points = (hand || []).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
      if (!points.length) return null;
      const xs = points.map(point => point.x * width);
      const ys = points.map(point => point.y * height);
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      return { left, right, top, bottom, area: (right - left) * (bottom - top) };
    }).filter(box => box && box.area > 0);
    if (!boxes.length) return null;
    boxes.sort((a, b) => b.area - a.area);
    const hand = boxes[0];
    const centerX = (hand.left + hand.right) / 2;
    const centerY = (hand.top + hand.bottom) / 2;
    const margin = Math.max(hand.right - hand.left, hand.bottom - hand.top) * 1.55;
    const size = Math.max(80, Math.min(Math.min(width, height), margin));
    const x = Math.max(0, Math.min(width - size, centerX - size / 2));
    const y = Math.max(0, Math.min(height - size, centerY - size / 2));
    return { x, y, size };
  }

  function evaluateFraming(landmarks) {
    if ((mediaRecorder && mediaRecorder.state === "recording") || state.isAnalyzing || state.currentPrediction) return;
    if (!landmarks || landmarks.length < 25) {
      state.readyFrames = 0;
      setFramingState("adjust", "Person not in frame", "Move into view so your face and both shoulders can be seen.");
      return;
    }

    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const visible = (point) => point && (point.visibility ?? point.presence ?? 0) >= 0.45;
    if (![nose, leftShoulder, rightShoulder].every(visible)) {
      state.readyFrames = 0;
      setFramingState("adjust", "Show your face and shoulders", "Sit or stand comfortably, facing the camera, with both shoulders in view.");
      return;
    }

    const centerX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    let instruction = "";
    if (centerX < 0.36 || centerX > 0.64) instruction = "Move a little toward the middle of the frame.";
    else if (Math.min(leftShoulder.x, rightShoulder.x) < 0.035 || Math.max(leftShoulder.x, rightShoulder.x) > 0.965) instruction = "Step back a little so both shoulders fit in the frame.";
    else if (shoulderWidth > 0.72) instruction = "Step back a little from the camera.";
    else if (shoulderWidth < 0.12) instruction = "Move a little closer to the camera.";
    else if (nose.y < 0.04 || nose.y > 0.64 || Math.min(leftShoulder.y, rightShoulder.y) > 0.88) instruction = "Adjust the camera so your face and shoulders fit comfortably in the frame.";

    if (instruction) {
      state.readyFrames = 0;
      setFramingState("adjust", "Adjust your position", instruction);
      return;
    }

    state.readyFrames += 1;
    if (state.readyFrames >= 3) {
      setFramingState("ready", "You’re ready to sign", "Your face and shoulders are in view. Press Start sign when you’re ready.", true);
      setEnglishText(elements.cameraStatus, "Ready to sign");
      setEnglishText(elements.cameraHelp, "Keep both hands visible as you perform the sign yourself. Do not point the camera at a screen playing a clip.");
    } else {
      setFramingState("checking", "Checking your position…", "Hold still for a moment while the camera checks the frame.");
    }
  }

  function runPoseGuideFrame() {
    if (!state.poseLoopActive || !state.stream) return;
    poseGuideTimer = null;
    const video = elements.cameraVideo;
    const recording = mediaRecorder && mediaRecorder.state === "recording";
    if (!recording && !state.isAnalyzing && !state.currentPrediction && !document.hidden
      && state.poseLandmarker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const now = performance.now();
      state.lastPoseFrame = now;
      try {
        const result = state.poseLandmarker.detectForVideo(video, now);
        evaluateFraming(result.landmarks?.[0]);
      } catch (error) {
        console.warn("Camera framing check failed:", error);
        stopPoseGuideLoop();
        state.manualPoseFallback = true;
        setFramingState("manual", "Position check unavailable", "Keep your face and shoulders centered and visible. You can still record.", true);
      }
    }
    schedulePoseGuideFrame();
  }

  async function startPoseGuide() {
    state.poseLoopActive = true;
    state.manualPoseFallback = false;
    state.readyFrames = 0;
    setFramingState("checking", "Loading camera guidance…", "The position check runs on this device in your browser.");
    try {
      await loadPoseLandmarker();
      if (!state.stream || !state.poseLoopActive) return;
      runPoseGuideFrame();
    } catch (error) {
      console.warn("Camera framing model could not load:", error);
      if (!state.stream) return;
      stopPoseGuideLoop();
      state.manualPoseFallback = true;
      setFramingState("manual", "Position check unavailable", "Keep your face and shoulders centered and visible. You can still record.", true);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Camera access isn't available here.");
      setEnglishText(elements.cameraHelp, "Camera access requires localhost/HTTPS.");
      return;
    }
    try {
      state.cameraFacingMode = "user";
      state.stream = await getCameraStream(state.cameraFacingMode);
      watchCameraTrack(state.stream);
      elements.cameraVideo.srcObject = state.stream;
      await elements.cameraVideo.play();
      elements.cameraStage.classList.add("camera-on");
      elements.cameraStage.dataset.facing = state.cameraFacingMode;
      elements.cameraStatus.parentElement.classList.add("on");
      elements.startCamera.disabled = true;
      elements.startSign.disabled = state.recognitionMode !== "words" || typeof MediaRecorder === "undefined";
      elements.takePicture.disabled = state.recognitionMode === "words";
      elements.cameraOff.disabled = false;
      elements.flipCamera.disabled = false;
      elements.flipCamera.title = t("Switch to the rear camera");
      setEnglishText(elements.cameraStatus, "Checking your position…");
      setEnglishText(elements.cameraHelp, typeof MediaRecorder === "undefined"
        ? state.recognitionMode !== "words"
          ? "Center one clear handshape and press Take a picture."
          : "Camera preview is ready, but this browser cannot record. Upload a short sign video instead."
        : state.recognitionMode !== "words"
          ? "Center one clear handshape and press Take a picture."
          : "Center your face and shoulders. Recording starts only when you press Start sign.");
      if (state.recognitionMode !== "words") {
        state.manualPoseFallback = true;
        setFramingState("manual", "Ready to capture", "Show one clear handshape in the center of the frame, then take a picture.", true);
      } else {
        startPoseGuide();
      }

    } catch (error) {
      console.error(error);
      const message = "Could not start the camera. Check browser permissions.";
      if (state.stream) state.stream.getTracks().forEach(track => track.stop());
      state.stream = null;
      elements.cameraVideo.srcObject = null;
      elements.cameraStage.classList.remove("camera-on");
      elements.startCamera.disabled = false;
      elements.cameraOff.disabled = true;
      elements.flipCamera.disabled = true;
      setEnglishText(elements.cameraHelp, message);
      toast(message);
    }
  }

  function setupMediaRecorder() {
    if (!state.stream || typeof MediaRecorder === "undefined") return false;

    try {
      const supportedTypes = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4"
      ];
      const mimeType = typeof MediaRecorder.isTypeSupported === "function"
        ? supportedTypes.find(type => MediaRecorder.isTypeSupported(type))
        : "";
      mediaRecorder = new MediaRecorder(state.stream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      console.error("MediaRecorder error:", e);
      return false;
    }

    const recorder = mediaRecorder;
    const recordedChunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    recorder.onerror = (event) => {
      console.error("Recording error:", event.error || event);
      setEnglishText(elements.cameraHelp, "The camera recording stopped unexpectedly. Try again or upload a video.");
      toast("Camera recording failed.");
    };

    recorder.onstop = async () => {
      if (mediaRecorder === recorder) mediaRecorder = null;
      if (recordedChunks.length === 0) {
        toast("No video was captured. Press Start sign to try again.");
        state.isAnalyzing = false;
        setRecognitionMode(state.recognitionMode);
        elements.flipCamera.disabled = !state.stream;
        const ready = state.isFramingReady || state.manualPoseFallback;
        setFramingState(ready ? "ready" : "adjust", ready ? "You’re ready to sign" : "Adjust your position", "No video was captured. Press Start sign to try again.", ready);
        return;
      }

      const mimeType = recorder.mimeType || recordedChunks[0].type || "video/webm";
      const blob = new Blob(recordedChunks, { type: mimeType });

      if (blob.size > 100) {
        showCapturePreview(blob, "video");
        const extension = mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `signova_gesture.${extension}`, { type: mimeType });
        await sendFileToBackend(file, "words");
      } else {
        toast("The clip was too short. Press Start sign and try again.");
        state.isAnalyzing = false;
        setRecognitionMode(state.recognitionMode);
        elements.flipCamera.disabled = !state.stream;
        const ready = state.isFramingReady || state.manualPoseFallback;
        setFramingState(ready ? "ready" : "adjust", ready ? "You’re ready to sign" : "Adjust your position", "The clip was too short. Press Start sign and try again.", ready);
      }
    };

    try {
      mediaRecorder.start(250);
    } catch (e) {
      console.error("Could not start recording:", e);
      mediaRecorder = null;
      return false;
    }
    setEnglishText(elements.cameraStatus, "Recording gesture...");
    setEnglishText(elements.cameraHelp, "Recording your sign... Press Stop when you are done.");
    elements.startSign.disabled = true;
    elements.takePicture.disabled = true;
    elements.stopCamera.disabled = false;
    elements.restartCapture.hidden = false;
    elements.restartCapture.disabled = false;
    elements.flipCamera.disabled = true;
    elements.cameraStage.dataset.framing = "recording";
    elements.framingGuide.dataset.state = "recording";
    setEnglishText(elements.framingTitle, "Recording your sign");
    setEnglishText(elements.framingMessage, "Keep the sign fully in view, then press Stop & predict.");
    setRecognitionMode(state.recognitionMode);
    toast("Sign recording started.");
    return true;
  }

  function startSignRecording() {
    if (state.recognitionMode !== "words") return;
    if (!state.stream || state.isAnalyzing || state.currentPrediction) return;
    clearCapturePreview();
    if (!setupMediaRecorder()) {
      toast("This browser cannot record video. Upload a short sign video instead.");
      setEnglishText(elements.cameraHelp, "Recording is not supported by this browser. Use Upload sign video instead.");
      return;
    }
    setEnglishText(elements.cameraStatus, "Recording gesture...");
  }

  async function flipCamera() {
    if (!state.stream || state.isAnalyzing || state.currentPrediction || (mediaRecorder && mediaRecorder.state === "recording")) return;
    const previousFacing = state.cameraFacingMode;
    const nextFacing = previousFacing === "user" ? "environment" : "user";
    elements.flipCamera.disabled = true;
    elements.startSign.disabled = true;
    stopPoseGuideLoop();
    state.isFramingReady = false;
    state.readyFrames = 0;
    state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
    elements.cameraVideo.srcObject = null;
    try {
      const nextStream = await getCameraStream(nextFacing);
      const actualFacing = nextStream.getVideoTracks()[0]?.getSettings().facingMode;
      if (actualFacing && actualFacing !== nextFacing) {
        nextStream.getTracks().forEach(track => track.stop());
        throw new Error("The requested camera is not available on this device.");
      }
      state.stream = nextStream;
      watchCameraTrack(state.stream);
      state.cameraFacingMode = nextFacing;
      elements.cameraVideo.srcObject = state.stream;
      await elements.cameraVideo.play();
      elements.cameraStage.dataset.facing = nextFacing;
      elements.flipCamera.title = t(nextFacing === "user" ? "Switch to the rear camera" : "Switch to the front camera");
      if (state.recognitionMode === "words") {
        setEnglishText(elements.cameraStatus, "Checking your position…");
        startPoseGuide();
      } else {
        state.manualPoseFallback = true;
        setFramingState("manual", "Ready to capture", "Show one clear handshape in the center of the frame, then take a picture.", true);
      }
    } catch (error) {
      console.warn("Could not switch camera:", error);
      if (state.stream) state.stream.getTracks().forEach(track => track.stop());
      state.stream = null;
      elements.cameraVideo.srcObject = null;
      try {
        state.stream = await getCameraStream(previousFacing);
        watchCameraTrack(state.stream);
        state.cameraFacingMode = previousFacing;
        elements.cameraVideo.srcObject = state.stream;
        await elements.cameraVideo.play();
        elements.cameraStage.dataset.facing = previousFacing;
        if (state.recognitionMode === "words") startPoseGuide();
        else {
          state.manualPoseFallback = true;
          setFramingState("manual", "Ready to capture", "Show one clear handshape in the center of the frame, then take a picture.", true);
        }
        toast("Could not switch cameras. Kept the current camera.");
      } catch {
        turnCameraOff();
        toast("The camera stopped while switching. Start it again and check camera permissions.");
      }
    } finally {
      elements.flipCamera.disabled = !state.stream;
      setRecognitionMode(state.recognitionMode);
    }
  }

  function finishSign() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      state.isAnalyzing = true;
      setRecognitionMode(state.recognitionMode);
      elements.stopCamera.disabled = true;
      elements.flipCamera.disabled = true;
      elements.startSign.disabled = true;
      setEnglishText(elements.cameraStatus, "Analyzing sign...");
      setEnglishText(elements.cameraHelp, "Analyzing the sign. Review the prediction, then press Done to add it and continue.");
      elements.addWord.disabled = true;
      toast("Recording stopped. Analyzing the sign…");
    }
  }

  function turnCameraOff() {
    stopPoseGuideLoop();
    state.isFramingReady = false;
    state.readyFrames = 0;
    state.manualPoseFallback = false;
    state.isAnalyzing = false;
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
      mediaRecorder = null;
    }
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
      state.stream = null;
    }
    state.captureRequestId += 1;
    clearCapturePreview();

    elements.cameraVideo.srcObject = null;
    elements.cameraStage.classList.remove("camera-on");
    setEnglishText(elements.cameraStatus, "Camera off");
    elements.cameraStatus.parentElement.classList.remove("on");
    elements.startCamera.disabled = false;
    elements.startSign.disabled = true;
    elements.stopCamera.disabled = true;
    elements.takePicture.disabled = true;
    elements.flipCamera.disabled = true;
    elements.cameraOff.disabled = true;
    setEnglishText(elements.cameraHelp, "Camera stream stopped.");
    elements.framingGuide.dataset.state = "waiting";
    elements.cameraStage.dataset.framing = "waiting";
    setEnglishText(elements.framingTitle, "Camera guidance is off");
    setEnglishText(elements.framingMessage, "Start the camera to check your position.");
  }

  elements.startCamera.addEventListener("click", startCamera);
  elements.startSign.addEventListener("click", startSignRecording);
  elements.takePicture.addEventListener("click", takeCharacterPicture);
  elements.stopCamera.addEventListener("click", finishSign);
  elements.restartCapture.addEventListener("click", restartCapture);
  elements.flipCamera.addEventListener("click", flipCamera);
  elements.cameraOff.addEventListener("click", turnCameraOff);
  $("#flipHint").addEventListener("click", () => toast("Keep both hands visible and use steady lighting."));

  function restartCapture() {
    state.captureRequestId += 1;
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
      mediaRecorder = null;
    }
    clearCapturePreview();
    state.isAnalyzing = false;
    state.currentPrediction = null;
    elements.addWord.disabled = true;
    if (elements.predictionSuggestions) elements.predictionSuggestions.hidden = true;
    setText(elements.predictedWord, "Waiting");
    setEnglishText(elements.predictionDescription, "Record a sign or upload a video to get a prediction.");
    elements.confidenceText.textContent = "—";
    elements.confidenceBar.style.width = "0%";
    elements.stopCamera.disabled = true;
    elements.flipCamera.disabled = !state.stream;
    elements.startSign.disabled = !state.stream || typeof MediaRecorder === "undefined";
    elements.takePicture.disabled = !state.stream;
    setRecognitionMode(state.recognitionMode);
    if (state.stream) {
      setEnglishText(elements.cameraStatus, "Ready to try again");
      setEnglishText(elements.cameraHelp, "Capture a sign video or take a photo. Press Restart capture to discard the current sample.");
      setEnglishText(elements.framingTitle, "Ready for a new capture");
      setEnglishText(elements.framingMessage, "Choose Start sign or Take photo.");
      elements.framingGuide.dataset.state = "ready";
      elements.cameraStage.dataset.framing = "ready";
    }
    toast("Capture cleared. Ready to try again.");
  }

  async function takeCharacterPicture() {
    if (state.recognitionMode === "words" || !state.stream || state.isAnalyzing || state.currentPrediction || (mediaRecorder && mediaRecorder.state === "recording")) return;
    const video = elements.cameraVideo;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      toast("The camera image is not ready yet. Wait a moment and try again.");
      return;
    }
    state.isAnalyzing = true;
    setRecognitionMode(state.recognitionMode);
    const canvas = document.createElement("canvas");
    let crop = null;
    let handDetectionUnavailable = false;
    setEnglishText(elements.cameraStatus, "Locating hand…");
    try {
      const landmarker = await loadHandLandmarker();
      const result = landmarker.detectForVideo(video, performance.now());
      crop = handCropFromLandmarks(video, result.landmarks);
      handDetectionUnavailable = !crop;
    } catch (error) {
      console.warn("Hand crop could not be prepared:", error);
      handDetectionUnavailable = true;
    }
    const cropSize = crop?.size || Math.min(video.videoWidth, video.videoHeight) * 0.78;
    const cropX = crop?.x ?? (video.videoWidth - cropSize) / 2;
    const cropY = crop?.y ?? (video.videoHeight - cropSize) / 2;
    canvas.width = 224;
    canvas.height = 224;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      state.isAnalyzing = false;
      setRecognitionMode(state.recognitionMode);
      toast("Could not capture the camera image. Try another browser.");
      return;
    }
    context.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
    const photo = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!photo) {
      state.isAnalyzing = false;
      setRecognitionMode(state.recognitionMode);
      toast("Could not create the camera photo. Try again.");
      return;
    }
    const selectedMode = state.recognitionMode;
    const imageFile = new File([photo], `signova-${selectedMode}.jpg`, { type: "image/jpeg" });
    showCapturePreview(photo, "photo");
    if (handDetectionUnavailable) toast("Hand framing was unavailable. Center one clear handshape in the camera view for best results.");
    setEnglishText(elements.cameraStatus, "Analyzing photo…");
    elements.takePicture.disabled = true;
    await sendFileToBackend(imageFile, selectedMode);
  }

  // Send the selected prediction input to the shared Signova API.
  async function sendFileToBackend(inputFile, mode = state.recognitionMode) {
    const selectedMode = ["letters", "numbers"].includes(mode) ? mode : "words";
    const isCharacters = selectedMode !== "words";
    const apiMode = isCharacters ? "characters" : "words";
    const fileType = String(inputFile?.type || "").toLowerCase();
    const fileName = String(inputFile?.name || "").toLowerCase();
    const isImage = fileType.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif|heic|heif|avif)$/.test(fileName);
    setRecognitionMode(selectedMode);
    const requestId = state.captureRequestId;
    if (isCharacters !== isImage) {
      toast(isCharacters ? "Choose a photo for letters or numbers." : "Choose a short video for word recognition.");
      if (state.stream) {
        elements.takePicture.disabled = !isCharacters;
        elements.startSign.disabled = isCharacters || typeof MediaRecorder === "undefined";
      }
      return;
    }
    if (!API_BASE) {
      state.isAnalyzing = false;
      setRecognitionMode(selectedMode);
      elements.addWord.disabled = true;
      elements.flipCamera.disabled = !state.stream;
      setEnglishText(elements.sentenceFeedback, apiBuildMismatch
        ? "The recognition service is updating. Reload this page and try again."
        : "The recognition service is unavailable. Please try again later.");
      elements.startSign.disabled = !state.stream || (!state.isFramingReady && !state.manualPoseFallback);
      if (state.stream) {
        setEnglishText(elements.cameraStatus, "Recognition service unavailable");
        setEnglishText(elements.cameraHelp, "The recording is ready, but the recognition service is unavailable. Please try again later.");
        elements.framingGuide.dataset.state = "manual";
        elements.cameraStage.dataset.framing = "manual";
        setEnglishText(elements.framingTitle, "Recognition service unavailable");
        setEnglishText(elements.framingMessage, "Your recording could not be sent. Please try again later.");
      }
      toast("Recognition service unavailable. Please try again later.");
      elements.takePicture.disabled = !state.stream;
      return;
    }
    const formData = new FormData();
    formData.append("file", inputFile, inputFile.name || "signova-upload.webm");
    formData.append("mode", apiMode);
    if (isCharacters) formData.append("character_kind", selectedMode);

    setEnglishText(elements.sentenceFeedback, "Analyzing the sign with the AI model…");
    elements.addWord.disabled = true;
    state.isAnalyzing = true;
    setRecognitionMode(selectedMode);
    elements.startSign.disabled = true;
    elements.takePicture.disabled = true;
    elements.restartCapture.hidden = false;
    elements.restartCapture.disabled = false;

    try {
      const response = await fetchWithReconnect(`${API_BASE}/api/predict`, {
        method: "POST",
        body: formData
      }, attempt => {
        setApiStatus("Reconnecting · retry {attempt}/4", { attempt });
        elements.apiStatus.classList.remove("ready", "error");
        elements.apiStatus.classList.add("warning");
        setEnglishText(elements.sentenceFeedback, "The recognition service is reconnecting. Retrying this prediction automatically…");
      });

      if (requestId !== state.captureRequestId) return;

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(result.detail || (isCharacters
          ? "Prediction failed. Try a clear photo of one centered handshape."
          : "Prediction failed. Try a short video with the signer centered in frame."));
        error.status = response.status;
        throw error;
      }

      if (result && result.word) {
        let suggestions = Array.isArray(result.suggestions)
          ? result.suggestions.filter(item => item && typeof item.word === "string")
          : [];
        if (isCharacters) {
          const allowedClass = selectedMode === "numbers" ? /^\d$/ : /^[A-Za-z]$/;
          suggestions = suggestions.filter(item => allowedClass.test(item.word));
          if (!allowedClass.test(String(result.word))) {
            if (!suggestions.length) {
              const error = new Error(`The API returned no ${selectedMode} candidates. Confirm that this model is available on the connected API.`);
              error.status = response.status;
              throw error;
            }
            result.word = suggestions[0].word;
            result.confidence = suggestions[0].score;
          }
        }
        if (!suggestions.some(item => item.word === result.word)) {
          suggestions.unshift({ word: result.word, score: Number(result.confidence) || 0 });
        }
        lastHealthError = false;
        updateApiExpiryNotice();
        setApiStatus("Connected · prediction received");
        elements.apiStatus.classList.remove("error", "warning");
        elements.apiStatus.classList.add("ready");
        showRealPrediction({
          word: result.word,
          confidence: Number.isFinite(result.confidence) ? result.confidence : 0,
          predictionSource: result.prediction_source || "local",
          originalLocalWord: result.original_local_word || result.word,
          poseCoverage: Number.isFinite(result.pose_coverage) ? result.pose_coverage : null,
          suggestions,
          mode: result.prediction_mode || apiMode,
          characterKind: isCharacters ? selectedMode : null,
          description: apiMode === "characters"
            ? "Experimental ASL handshape model output. Check the result before adding it."
            : "Experimental Signova V2 model output (20 signs)"
        });

        toast("Prediction received: {word}", { word: result.word });
      } else {
        throw new Error("The API returned no prediction. Try a clear, short recording.");
      }

    } catch (error) {
      if (requestId !== state.captureRequestId) return;
      console.error("Backend connection error:", error);
      const canRetryAutomatically = error.status == null || isTransientStatus(error.status);
      const backendDetail = String(error?.message || "");
      const characterModelMissing = isCharacters && error.status === 503
        && /letters and numbers model is not trained or installed|selected character classes are missing/i.test(backendDetail);
      const signerMissing = (error.status === 422 && !isCharacters)
        || /no signer was clearly visible|no person pose was detected/i.test(backendDetail);
      if (canRetryAutomatically) {
        lastHealthError = true;
        updateApiExpiryNotice();
        setApiStatus("Recognition service unavailable · try again later");
        elements.apiStatus.classList.remove("ready", "warning");
        elements.apiStatus.classList.add("error");
      }
      let failureMessage = error.message;
      let toastMessage = failureMessage;
      if (characterModelMissing) {
        failureMessage = "Letter and number recognition is currently unavailable. Please try again later.";
        toastMessage = failureMessage;
      } else if (signerMissing) {
        failureMessage = isCharacters
          ? "The photo could not be decoded. Use a clear JPG or PNG image."
          : "No signer was clearly visible in enough frames. Face the camera and keep your shoulders and both arms in frame. For a saved clip, upload the original video instead of filming a screen.";
        toastMessage = "No signer detected. Show the sign directly to the camera or upload the original video.";
      } else if (error.name === "AbortError") {
        failureMessage = "The API request timed out. Try a shorter recording.";
        toastMessage = failureMessage;
      } else if (error.status == null) {
        failureMessage = "The recognition service could not be reached. Check your internet connection and try again later.";
        toastMessage = failureMessage;
      } else if (error.status >= 500) {
        failureMessage = backendDetail || (isCharacters
          ? "The API could not process this photo. Try a clear picture of one centered handshape."
          : "The API could not process this video. Try a short MP4 or WebM clip with the signer clearly visible.");
        toastMessage = isCharacters
          ? "The letters-and-numbers model is not ready to analyze this photo."
          : "The API could not analyze this clip. Try a short MP4 or WebM video.";
      }
      setEnglishText(elements.sentenceFeedback, "Prediction failed: {detail}", { detail: failureMessage });
      toast(toastMessage);
      state.isAnalyzing = false;
      setRecognitionMode(selectedMode);
      elements.flipCamera.disabled = !state.stream;
      elements.takePicture.disabled = !state.stream;
      elements.startSign.disabled = !state.stream || typeof MediaRecorder === "undefined";
      if (state.stream) {
        setEnglishText(elements.cameraStatus, characterModelMissing ? "Character model unavailable" : "Ready to try again");
        setEnglishText(elements.cameraHelp, characterModelMissing
          ? "Letter and number recognition is currently unavailable. Please try again later."
          : signerMissing
          ? "No signer was detected. Face the camera and perform the sign yourself, or upload the original video file. Filming a screen is not supported."
          : "The clip was not analyzed. Correct the camera framing if needed, then record again; temporary API failures are retried automatically.");
        elements.framingGuide.dataset.state = state.isFramingReady ? "ready" : "adjust";
        elements.cameraStage.dataset.framing = state.isFramingReady ? "ready" : "adjust";
        setEnglishText(elements.framingTitle, characterModelMissing ? "Character model unavailable" : "Prediction unavailable");
        setEnglishText(elements.framingMessage, characterModelMissing
          ? "Letter and number recognition is currently unavailable. Please try again later."
          : signerMissing
          ? "Show the signer in the camera, or upload the original video file."
          : canRetryAutomatically
          ? "Try recording the sign again; Signova retries automatically when the API is waking or restarting."
          : "Prediction failed. Try a short video with the signer centered in frame.");
      }
    }
  }

  function renderPredictionSuggestions(suggestions, selectedWord, predictionMode, characterKind) {
    if (!elements.predictionSuggestions) return;
    const list = elements.predictionSuggestions.querySelector(".suggestion-list");
    if (!list) return;
    const heading = predictionMode === "characters"
      ? `Top ${characterKind === "numbers" ? "number" : "letter"} options · choose the sign you performed`
      : "Top word options · choose the sign you performed";
    setEnglishText(elements.suggestionHeading, heading);
    list.replaceChildren();
    const candidates = suggestions.filter(item => {
      if (!item || typeof item.word !== "string") return false;
      if (predictionMode !== "characters") return true;
      return characterKind === "numbers" ? /^\d$/.test(item.word) : /^[A-Za-z]$/.test(item.word);
    }).slice(0, 3);
    elements.predictionSuggestions.hidden = candidates.length === 0;
    candidates.forEach(candidate => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion-option";
      button.setAttribute("aria-pressed", String(candidate.word === selectedWord));
      button.dataset.i18nAriaSource = "Choose {word}; model score {score}%";
      button.dataset.i18nAriaValues = JSON.stringify({ word: candidate.word, score: Number(candidate.score) || 0 });
      button.setAttribute("aria-label", t(button.dataset.i18nAriaSource, JSON.parse(button.dataset.i18nAriaValues)));
      const word = document.createElement("span");
      word.dataset.noTranslate = "true";
      word.textContent = candidate.word;
      const score = document.createElement("small");
      score.textContent = `${Number(candidate.score) || 0}%`;
      button.append(word, score);
      button.addEventListener("click", () => {
        if (!state.currentPrediction) return;
        state.currentPrediction.word = candidate.word;
        state.currentPrediction.confidence = Number(candidate.score) || 0;
        setEnglishText(elements.confidenceLabel, "Local model score");
        elements.predictedWord.textContent = candidate.word;
        elements.confidenceText.textContent = `${state.currentPrediction.confidence}%`;
        elements.confidenceBar.style.width = `${Math.max(0, Math.min(100, state.currentPrediction.confidence))}%`;
        const selectedDescription = predictionMode === "characters"
          ? "You selected this character from the model's three suggestions. Check it before adding."
          : "You selected this word from the model's three suggestions. Check it before adding.";
        setEnglishText(elements.predictionDescription, state.currentPrediction.confidence < 10
          ? `${selectedDescription} Low model score. Try a clearer sign; do not rely on this prediction.`
          : selectedDescription);
        list.querySelectorAll(".suggestion-option").forEach(option => {
          option.setAttribute("aria-pressed", String(option === button));
        });
      });
      list.append(button);
    });
  }

  function showRealPrediction(prediction) {
    state.currentPrediction = prediction;
    setRecognitionMode(state.recognitionMode);
    const isCharacters = prediction.mode === "characters";
    const characterKind = prediction.characterKind || (/^\d+$/.test(prediction.word) ? "numbers" : "letters");
    const kindName = characterKind === "numbers" ? "NUMBER" : "LETTER";
    setEnglishText(elements.recognizedTypeLabel, isCharacters ? `RECOGNIZED ${kindName}` : "RECOGNIZED WORD");
    elements.predictedWord.textContent = prediction.word;
    const sourceNote = isCharacters
      ? `Experimental Signova ${characterKind} model output. Results are restricted to ${characterKind}.`
      : "Experimental Signova V2 model output (20 signs).";
    let descriptionSource = prediction.poseCoverage === null
      ? "{source} Review the suggestions if the word looks wrong."
      : "{source} Person visible in {coverage}% of sampled frames. Review the suggestions if the word looks wrong.";
    if ((Number(prediction.confidence) || 0) < 10) {
      descriptionSource += " Low model score. Try a clearer sign; do not rely on this prediction.";
    }
    setEnglishText(elements.predictionDescription, descriptionSource, { source: sourceNote, coverage: prediction.poseCoverage });
    setEnglishText(elements.confidenceLabel, "Local model score");
    setEnglishText(elements.sentenceFeedback, "Prediction received: {word}. Review it, then press Done to add it.", { word: prediction.word });
    if (elements.addWord.firstChild?.nodeType === Node.TEXT_NODE) {
      const nextLabel = prediction.mode !== "characters"
        ? "Done · Next word "
        : characterKind === "numbers" ? "Done · Next number " : "Done · Next letter ";
      elements.addWord.firstChild.nodeValue = nextLabel;
    }
    renderPredictionSuggestions(prediction.suggestions || [], prediction.word, prediction.mode, characterKind);
    const confidence = Math.max(0, Math.min(100, Number(prediction.confidence) || 0));
    elements.confidenceText.textContent = `${confidence}%`;
    elements.confidenceBar.style.width = `${confidence}%`;
    elements.addWord.disabled = false;
    state.isAnalyzing = false;
    setRecognitionMode(state.recognitionMode);
    elements.startSign.disabled = true;
    elements.takePicture.disabled = true;
    elements.flipCamera.disabled = true;
    if (state.stream) {
      setEnglishText(elements.cameraStatus, "Prediction ready · Press Done");
      setEnglishText(elements.cameraHelp, isCharacters
        ? `Review the ${characterKind === "numbers" ? "number" : "letter"}, then press Done to continue.`
        : "Review the word, then press Done to continue.");
      elements.framingGuide.dataset.state = "ready";
      elements.cameraStage.dataset.framing = "ready";
      setEnglishText(elements.framingTitle, "Prediction ready");
      setEnglishText(elements.framingMessage, "Review the word, then press Done to continue.");
    }
  }

  elements.demoPrediction.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = state.recognitionMode === "words" ? "video/*,.mp4,.mov,.webm,.m4v,.mkv,.avi" : "image/*,.jpg,.jpeg,.png";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.onstop = null;
          mediaRecorder.stop();
          mediaRecorder = null;
        }
        state.currentPrediction = null;
        const mode = state.recognitionMode;
        setRecognitionMode(mode);
        sendFileToBackend(file, mode);
      }
    };
    input.click();
  });

  function renderSentence() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    elements.sentenceBox.replaceChildren();
    if (!state.sentence.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "sentence-placeholder";
      setText(placeholder, "Your recognized words will appear here…");
      elements.sentenceBox.append(placeholder);
    } else {
      state.sentence.forEach((entry, index) => {
        const chip = document.createElement("span");
        chip.className = "word-chip";
        chip.dataset.noTranslate = "true";
        chip.textContent = entry.word;
        chip.title = t("Word {number}", { number: index + 1 });
        elements.sentenceBox.append(chip);
      });
    }
    const count = state.sentence.length;
    const onlyCharacters = count > 0 && state.sentence.every(entry => entry.mode === "characters");
    setText(elements.wordCount, onlyCharacters
      ? (count === 1 ? "{count} character" : "{count} characters")
      : (count === 1 ? "{count} word" : "{count} words"), { count });
    elements.playSentence.disabled = count === 0 || !("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function";
    elements.historySentenceTotal.textContent = String(count);
  }

  function sentenceText() {
    let output = "";
    let previousMode = "";
    for (const entry of state.sentence) {
      const mode = entry.mode || "words";
      if (mode === "characters") {
        if (previousMode && previousMode !== "characters" && output && !output.endsWith(" ")) output += " ";
        if (entry.word === "SPACE") output += " ";
        else if (entry.word !== "DELETE" && entry.word !== "NOTHING" && entry.word !== "UNKNOWN") output += entry.word;
      } else {
        if (output && !output.endsWith(" ")) output += " ";
        output += entry.word;
      }
      previousMode = mode;
    }
    return output.trim();
  }

  function renderHistory() {
    elements.historyRows.replaceChildren();
    elements.historyWordTotal.textContent = String(state.history.length);
    elements.historySentenceTotal.textContent = String(state.sentence.length);
    if (!state.history.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.className = "empty-row";
      const icon = document.createElement("span"); icon.textContent = "◷";
      const title = document.createElement("b"); setText(title, "No words yet");
      const hint = document.createElement("small"); setText(hint, "Try a prediction in the Translator.");
      cell.append(icon, title, hint); row.append(cell); elements.historyRows.append(row);
      return;
    }
    [...state.history].reverse().forEach(entry => {
      const row = document.createElement("tr");
      const word = document.createElement("td"); word.className = "history-word"; word.dataset.noTranslate = "true"; word.textContent = entry.word;
      const time = document.createElement("td"); time.textContent = entry.time;
      const source = document.createElement("td");
      const sourceTag = document.createElement("span"); sourceTag.className = "source-label"; sourceTag.textContent = "AI";
      source.append(sourceTag);
      const actions = document.createElement("td");
      const remove = document.createElement("button"); remove.className = "row-delete"; remove.type = "button"; remove.textContent = "×";
      remove.dataset.i18nAriaSource = "Remove history entry";
      remove.setAttribute("aria-label", t("Remove history entry"));
      remove.addEventListener("click", () => {
        state.history = state.history.filter(item => item.id !== entry.id);
        renderHistory();
        toast("History entry removed.");
      });
      actions.append(remove); row.append(word, time, source, actions); elements.historyRows.append(row);
    });
  }

  elements.addWord.addEventListener("click", () => {
    if (!state.currentPrediction) return;
    if (state.currentPrediction.mode === "characters" && ["NOTHING", "UNKNOWN"].includes(state.currentPrediction.word)) {
      toast(state.currentPrediction.word === "NOTHING" ? "No sign was added." : "The character was unclear. Try again.");
      state.currentPrediction = null;
      clearCapturePreview();
      elements.addWord.disabled = true;
      elements.startSign.disabled = !state.stream || typeof MediaRecorder === "undefined";
      elements.takePicture.disabled = !state.stream;
      elements.stopCamera.disabled = true;
      setRecognitionMode(state.recognitionMode);
      if (elements.predictionSuggestions) elements.predictionSuggestions.hidden = true;
      return;
    }
    if (state.currentPrediction.mode === "characters" && state.currentPrediction.word === "DELETE") {
      const lastCharacter = state.sentence.findLastIndex(entry => entry.mode === "characters" && entry.word !== "SPACE");
      if (lastCharacter >= 0) state.sentence.splice(lastCharacter, 1);
      renderSentence();
      state.currentPrediction = null;
      clearCapturePreview();
      elements.addWord.disabled = true;
      elements.startSign.disabled = !state.stream || typeof MediaRecorder === "undefined";
      elements.takePicture.disabled = !state.stream;
      elements.stopCamera.disabled = true;
      setRecognitionMode(state.recognitionMode);
      if (elements.predictionSuggestions) elements.predictionSuggestions.hidden = true;
      toast("Removed the last character.");
      return;
    }
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      word: state.currentPrediction.word,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      source: "model",
      mode: state.currentPrediction.mode || "words"
    };
    state.sentence.push(entry);
    state.history.push(entry);
    renderSentence();
    renderHistory();
    state.currentPrediction = null;
    clearCapturePreview();
    elements.addWord.disabled = true;
    elements.startSign.disabled = !state.stream || typeof MediaRecorder === "undefined";
    elements.takePicture.disabled = !state.stream;
    elements.stopCamera.disabled = true;
    setRecognitionMode(state.recognitionMode);
    setText(elements.predictedWord, "Ready for next sign");
    setEnglishText(elements.predictionDescription, "The previous word was added. Record or upload the next sign.");
    elements.confidenceText.textContent = "—";
    elements.confidenceBar.style.width = "0%";
    setEnglishText(elements.confidenceLabel, "Local model score");
    if (elements.predictionSuggestions) elements.predictionSuggestions.hidden = true;
    setEnglishText(elements.sentenceFeedback, "Added \"{word}\". Your next word is ready.", { word: entry.word });
    toast("Added \"{word}\".", { word: entry.word });
    if (state.stream && !mediaRecorder) {
      elements.flipCamera.disabled = false;
      if (state.recognitionMode !== "words") {
        setEnglishText(elements.cameraStatus, "Ready for next character");
        setEnglishText(elements.cameraHelp, "Change to the next letter or number, then press Take photo.");
      } else if (state.isFramingReady || state.manualPoseFallback) {
        startSignRecording();
      } else {
        setEnglishText(elements.cameraStatus, "Center yourself for the next sign");
        setEnglishText(elements.cameraHelp, "Adjust until the frame guide turns green; recording will start for the next word.");
      }
    }
  });

  $("#clearSentence").addEventListener("click", () => {
    state.sentence = [];
    renderSentence();
    setEnglishText(elements.sentenceFeedback, "Sentence cleared.");
    toast("Sentence cleared.");
  });

  $("#copySentence").addEventListener("click", async () => {
    const sentence = sentenceText();
    if (!sentence) { toast("Add a word before copying."); return; }
    try {
      await navigator.clipboard.writeText(sentence);
      toast("Sentence copied to clipboard.");
    } catch {
      toast(`Sentence: ${sentence}`);
    }
  });

  elements.playSentence.addEventListener("click", () => {
    const sentence = sentenceText();
    if (!sentence) return;
    if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
      toast("Audio playback isn't supported by this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(sentence);
    utterance.lang = currentLanguage === "ar" ? "ar" : "en-US";
    utterance.rate = 0.95;
    utterance.onerror = () => toast("Could not play the sentence audio.");
    window.speechSynthesis.speak(utterance);
  });

  $("#clearHistory").addEventListener("click", () => {
    if (!state.history.length) { toast("History is already empty."); return; }
    state.history = [];
    renderHistory();
    toast("History cleared.");
  });

  window.addEventListener("beforeunload", turnCameraOff);
  checkApiHealth();
  window.setInterval(updateApiExpiryNotice, 1000);
  renderSentence();
  renderHistory();
})();
