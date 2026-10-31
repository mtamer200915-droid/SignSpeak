(() => {
  "use strict";

  const pages = ["home", "translator", "history", "about"];
  const pageLabels = { home: "Home", translator: "Translator", history: "History", about: "About Signova" };
  const requestedApi = new URLSearchParams(window.location.search).get("api");
  function resolveApiBase() {
    const configuredApi = window.SIGNOVA_API_BASE || requestedApi;
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
  const API_BASE = resolveApiBase().replace(/\/+$/, "");
  const state = {
    currentPage: "home", stream: null, currentPrediction: null, sentence: [], history: [],
    cameraFacingMode: "user", poseLandmarker: null, poseTaskPromise: null, poseLoopActive: false,
    isFramingReady: false, readyFrames: 0, manualPoseFallback: false, isAnalyzing: false, lastPoseFrame: 0
  };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    sidebar: $("#sidebar"), pageCrumb: $("#pageCrumb"), toast: $("#toast"),
    apiStatus: $("#apiStatus"),
    cameraVideo: $("#cameraVideo"), cameraStage: $("#cameraStage"), cameraStatus: $("#cameraStatus"),
    startCamera: $("#startCamera"), startSign: $("#startSign"), stopCamera: $("#stopCamera"),
    flipCamera: $("#flipCamera"), cameraOff: $("#cameraOff"), cameraHelp: $("#cameraHelp"),
    framingGuide: $("#framingGuide"), framingTitle: $("#framingTitle"), framingMessage: $("#framingMessage"),
    predictedWord: $("#predictedWord"), predictionDescription: $("#predictionDescription"),
    confidenceText: $("#confidenceText"), confidenceBar: $("#confidenceBar"), demoPrediction: $("#demoPrediction"),
    addWord: $("#addWord"), sentenceBox: $("#sentenceBox"), wordCount: $("#wordCount"),
    sentenceFeedback: $("#sentenceFeedback"), historyRows: $("#historyRows"),
    historyWordTotal: $("#historyWordTotal"), historySentenceTotal: $("#historySentenceTotal")
  };

  let toastTimer;
  function toast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
  }

  async function checkApiHealth() {
    if (!elements.apiStatus) return;
    if (!API_BASE) {
      elements.apiStatus.textContent = "API offline · start the free team demo from GitHub Actions";
      elements.apiStatus.classList.remove("ready");
      elements.apiStatus.classList.add("error");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      if (!response.ok) throw new Error("API health check failed");
      const health = await response.json();
      if (health.status !== "ok" || !health.model_loaded || health.classes !== 166) {
        throw new Error("Model is not ready");
      }
      const testAccuracy = Number(health.test_accuracy);
      if (Number.isFinite(testAccuracy) && testAccuracy < 0.20) {
        elements.apiStatus.textContent = `API running · low test accuracy (${(testAccuracy * 100).toFixed(1)}%)`;
        elements.apiStatus.classList.remove("ready");
        elements.apiStatus.classList.add("error");
        return;
      }
      elements.apiStatus.textContent = health.gemini_enabled
        ? "API running · Gemini second opinion enabled"
        : "API running · local 166-class model";
      elements.apiStatus.classList.remove("error");
      elements.apiStatus.classList.add("ready");
    } catch (error) {
      elements.apiStatus.textContent = requestedApi
        ? "Temporary API offline · start a fresh free team demo"
        : "API offline · start the free team demo from GitHub Actions";
      elements.apiStatus.classList.remove("ready");
      elements.apiStatus.classList.add("error");
    } finally {
      clearTimeout(timeout);
    }
  }

  function navigate(page) {
    if (!pages.includes(page)) return;
    state.currentPage = page;
    $$(".page").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
    $$(".nav-link").forEach(button => button.dataset.page === page ? button.classList.add("active") : button.classList.remove("active"));
    elements.pageCrumb.textContent = pageLabels[page];
    elements.sidebar.classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $$("[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  $$("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
  $("#mobileMenu").addEventListener("click", () => elements.sidebar.classList.toggle("open"));

  let mediaRecorder = null;

  async function getCameraStream(facingMode) {
    return navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: facingMode } },
      audio: false
    });
  }

  function setFramingState(stateName, title, message, ready = false) {
    elements.framingGuide.dataset.state = stateName;
    elements.cameraStage.dataset.framing = stateName;
    elements.framingTitle.textContent = title;
    elements.framingMessage.textContent = message;
    state.isFramingReady = ready;
    const isRecording = mediaRecorder && mediaRecorder.state === "recording";
    elements.startSign.disabled = !state.stream || !ready || isRecording || state.isAnalyzing || Boolean(state.currentPrediction) || typeof MediaRecorder === "undefined";
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
      elements.cameraStatus.textContent = "Ready to sign";
      elements.cameraHelp.textContent = "Keep both hands visible when you sign. Stop the recording when the word is complete.";
    } else {
      setFramingState("checking", "Checking your position…", "Hold still for a moment while the camera checks the frame.");
    }
  }

  function runPoseGuideFrame() {
    if (!state.poseLoopActive || !state.stream) return;
    const video = elements.cameraVideo;
    const now = performance.now();
    if (state.poseLandmarker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - state.lastPoseFrame >= 300) {
      state.lastPoseFrame = now;
      try {
        const result = state.poseLandmarker.detectForVideo(video, now);
        evaluateFraming(result.landmarks?.[0]);
      } catch (error) {
        console.warn("Camera framing check failed:", error);
        state.poseLoopActive = false;
        state.manualPoseFallback = true;
        setFramingState("manual", "Position check unavailable", "Keep your face and shoulders centered and visible. You can still record.", true);
      }
    }
    if (state.poseLoopActive) requestAnimationFrame(runPoseGuideFrame);
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
      state.poseLoopActive = false;
      state.manualPoseFallback = true;
      setFramingState("manual", "Position check unavailable", "Keep your face and shoulders centered and visible. You can still record.", true);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Camera access isn't available here.");
      elements.cameraHelp.textContent = "Camera access requires localhost/HTTPS.";
      return;
    }
    try {
      state.cameraFacingMode = "user";
      state.stream = await getCameraStream(state.cameraFacingMode);
      elements.cameraVideo.srcObject = state.stream;
      await elements.cameraVideo.play();
      elements.cameraStage.classList.add("camera-on");
      elements.cameraStage.dataset.facing = state.cameraFacingMode;
      elements.cameraStatus.parentElement.classList.add("on");
      elements.startCamera.disabled = true;
      elements.cameraOff.disabled = false;
      elements.flipCamera.disabled = false;
      elements.flipCamera.title = "Switch to the rear camera";
      elements.cameraStatus.textContent = "Checking your position…";
      elements.cameraHelp.textContent = typeof MediaRecorder === "undefined"
        ? "Camera preview is ready, but this browser cannot record. Upload a short sign video instead."
        : "Center your face and shoulders. Recording starts only when you press Start sign.";
      startPoseGuide();

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
      elements.cameraHelp.textContent = message;
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
      elements.cameraHelp.textContent = "The camera recording stopped unexpectedly. Try again or upload a video.";
      toast("Camera recording failed.");
    };

    recorder.onstop = async () => {
      if (mediaRecorder === recorder) mediaRecorder = null;
      if (recordedChunks.length === 0) {
        toast("لم يتم تسجيل بيانات كافية.");
        state.isAnalyzing = false;
        elements.flipCamera.disabled = !state.stream;
        const ready = state.isFramingReady || state.manualPoseFallback;
        setFramingState(ready ? "ready" : "adjust", ready ? "You’re ready to sign" : "Adjust your position", "No video was captured. Press Start sign to try again.", ready);
        return;
      }

      const mimeType = recorder.mimeType || recordedChunks[0].type || "video/webm";
      const blob = new Blob(recordedChunks, { type: mimeType });

      if (blob.size > 100) {
        const extension = mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `signova_gesture.${extension}`, { type: mimeType });
        await sendVideoFileToBackend(file);
      } else {
        toast("لم يتم تسجيل بيانات كافية. جرّب تسجيل الإشارة مرة أخرى.");
        state.isAnalyzing = false;
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
    elements.cameraStatus.textContent = "Recording gesture...";
    elements.cameraHelp.textContent = "جاري تسجيل إشارتك... اضغط Stop عند الانتهاء.";
    elements.startSign.disabled = true;
    elements.stopCamera.disabled = false;
    elements.flipCamera.disabled = true;
    elements.cameraStage.dataset.framing = "recording";
    elements.framingGuide.dataset.state = "recording";
    elements.framingTitle.textContent = "Recording your sign";
    elements.framingMessage.textContent = "Keep the sign fully in view, then press Stop & predict.";
    toast("بدء تسجيل الحركة...");
    return true;
  }

  function startSignRecording() {
    if (!state.stream || (!state.isFramingReady && !state.manualPoseFallback) || state.isAnalyzing || state.currentPrediction) return;
    if (!setupMediaRecorder()) {
      toast("This browser cannot record video. Upload a short sign video instead.");
      elements.cameraHelp.textContent = "Recording is not supported by this browser. Use Upload sign video instead.";
      return;
    }
    elements.cameraStatus.textContent = "Recording gesture...";
  }

  async function flipCamera() {
    if (!state.stream || state.isAnalyzing || state.currentPrediction || (mediaRecorder && mediaRecorder.state === "recording")) return;
    const previousFacing = state.cameraFacingMode;
    const nextFacing = previousFacing === "user" ? "environment" : "user";
    elements.flipCamera.disabled = true;
    elements.startSign.disabled = true;
    state.poseLoopActive = false;
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
      state.cameraFacingMode = nextFacing;
      elements.cameraVideo.srcObject = state.stream;
      await elements.cameraVideo.play();
      elements.cameraStage.dataset.facing = nextFacing;
      elements.cameraStatus.textContent = "Checking your position…";
      elements.flipCamera.title = nextFacing === "user" ? "Switch to the rear camera" : "Switch to the front camera";
      startPoseGuide();
    } catch (error) {
      console.warn("Could not switch camera:", error);
      if (state.stream) state.stream.getTracks().forEach(track => track.stop());
      state.stream = null;
      elements.cameraVideo.srcObject = null;
      try {
        state.stream = await getCameraStream(previousFacing);
        state.cameraFacingMode = previousFacing;
        elements.cameraVideo.srcObject = state.stream;
        await elements.cameraVideo.play();
        elements.cameraStage.dataset.facing = previousFacing;
        startPoseGuide();
        toast("Could not switch cameras. Kept the current camera.");
      } catch {
        turnCameraOff();
        toast("The camera stopped while switching. Start it again and check camera permissions.");
      }
    } finally {
      elements.flipCamera.disabled = !state.stream;
    }
  }

  function finishSign() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      state.isAnalyzing = true;
      elements.stopCamera.disabled = true;
      elements.flipCamera.disabled = true;
      elements.startSign.disabled = true;
      elements.cameraStatus.textContent = "Analyzing sign...";
      elements.cameraHelp.textContent = "جاري تحليل الكلمة. راجع التوقع ثم اضغط Done لإضافتها وبدء الكلمة التالية.";
      elements.addWord.disabled = true;
      toast("تم إيقاف التسجيل وجاري تحليل الكلمة...");
    }
  }

  function turnCameraOff() {
    state.poseLoopActive = false;
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

    elements.cameraVideo.srcObject = null;
    elements.cameraStage.classList.remove("camera-on");
    elements.cameraStatus.textContent = "Camera off";
    elements.cameraStatus.parentElement.classList.remove("on");
    elements.startCamera.disabled = false;
    elements.startSign.disabled = true;
    elements.stopCamera.disabled = true;
    elements.flipCamera.disabled = true;
    elements.cameraOff.disabled = true;
    elements.cameraHelp.textContent = "Camera stream stopped.";
    elements.framingGuide.dataset.state = "waiting";
    elements.cameraStage.dataset.framing = "waiting";
    elements.framingTitle.textContent = "Camera guidance is off";
    elements.framingMessage.textContent = "Start the camera to check your position.";
  }

  elements.startCamera.addEventListener("click", startCamera);
  elements.startSign.addEventListener("click", startSignRecording);
  elements.stopCamera.addEventListener("click", finishSign);
  elements.flipCamera.addEventListener("click", flipCamera);
  elements.cameraOff.addEventListener("click", turnCameraOff);
  $("#flipHint").addEventListener("click", () => toast("Tip: keep both hands visible and use steady lighting."));

  // ==================== ربط الباك إيند و Gemini ====================
  async function sendVideoFileToBackend(videoFile) {
    if (!API_BASE) {
      state.isAnalyzing = false;
      elements.addWord.disabled = true;
      elements.flipCamera.disabled = !state.stream;
      elements.sentenceFeedback.textContent = "The prediction API is offline. Start the free team demo in GitHub Actions, then open the website link from its run summary.";
      elements.startSign.disabled = !state.stream || (!state.isFramingReady && !state.manualPoseFallback);
      if (state.stream) {
        elements.cameraStatus.textContent = "Prediction API offline";
        elements.cameraHelp.textContent = "The recording is ready, but this page has no live prediction API. Start a free demo and open its linked website.";
        elements.framingGuide.dataset.state = "manual";
        elements.cameraStage.dataset.framing = "manual";
        elements.framingTitle.textContent = "Prediction API offline";
        elements.framingMessage.textContent = "Your recording could not be sent. Start the free API demo, then open its website link.";
      }
      toast("The free prediction API is offline.");
      return;
    }
    const formData = new FormData();
    formData.append("file", videoFile, videoFile.name || "signova-upload.webm");

    elements.sentenceFeedback.textContent = "جاري تحليل الإشارة بواسطة نموذج الذكاء الاصطناعي...";
    elements.addWord.disabled = true;
    state.isAnalyzing = true;
    elements.startSign.disabled = true;

    try {
      const response = await fetch(`${API_BASE}/api/predict`, {
        method: "POST",
        body: formData
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || "فشل الاتصال بالخادم.");

      if (result && result.word) {
        showRealPrediction({
          word: result.word,
          confidence: Number.isFinite(result.confidence) ? result.confidence : 0,
          description: "نتيجة من نموذج Signova التجريبي (166 فئة)"
        });

        toast(`تم التعرف: ${result.word}`);
      } else {
        throw new Error("لم يرجع الخادم كلمة متوقعة. جرّب تسجيل الإشارة مرة أخرى.");
      }

    } catch (error) {
      console.error("Backend connection error:", error);
      elements.sentenceFeedback.textContent = `${error.message} تأكد من تشغيل backend وإتاحة عنوانه للمتصفح.`;
      toast("تعذر تحليل الفيديو.");
      state.isAnalyzing = false;
      elements.flipCamera.disabled = !state.stream;
      elements.startSign.disabled = !state.stream || (!state.isFramingReady && !state.manualPoseFallback);
      if (state.stream) {
        elements.cameraStatus.textContent = "Ready to try again";
        elements.cameraHelp.textContent = "The video could not be analyzed. Check the API connection, then press Start sign to retry.";
        elements.framingGuide.dataset.state = state.isFramingReady ? "ready" : "adjust";
        elements.cameraStage.dataset.framing = state.isFramingReady ? "ready" : "adjust";
        elements.framingTitle.textContent = "Prediction unavailable";
        elements.framingMessage.textContent = "Check the API connection, then try recording the sign again.";
      }
    }
  }

  function showRealPrediction(prediction) {
    state.currentPrediction = prediction;
    elements.predictedWord.textContent = prediction.word;
    elements.predictionDescription.textContent = prediction.description;
    const confidence = Math.max(0, Math.min(100, Number(prediction.confidence) || 0));
    elements.confidenceText.textContent = `${confidence}%`;
    elements.confidenceBar.style.width = `${confidence}%`;
    elements.addWord.disabled = false;
    state.isAnalyzing = false;
    elements.startSign.disabled = true;
    elements.flipCamera.disabled = true;
    if (state.stream) {
      elements.cameraStatus.textContent = "Prediction ready · Press Done";
      elements.cameraHelp.textContent = "راجع الكلمة. اضغط Done لإضافتها للجملة وبدء تسجيل الكلمة التالية.";
      elements.framingGuide.dataset.state = "ready";
      elements.cameraStage.dataset.framing = "ready";
      elements.framingTitle.textContent = "Prediction ready";
      elements.framingMessage.textContent = "Review the word, then press Done to continue.";
    }
  }

  elements.demoPrediction.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.onstop = null;
          mediaRecorder.stop();
          mediaRecorder = null;
        }
        state.currentPrediction = null;
        sendVideoFileToBackend(file);
      }
    };
    input.click();
  });

  function renderSentence() {
    elements.sentenceBox.replaceChildren();
    if (!state.sentence.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "sentence-placeholder";
      placeholder.textContent = "Your recognized words will appear here…";
      elements.sentenceBox.append(placeholder);
    } else {
      state.sentence.forEach((entry, index) => {
        const chip = document.createElement("span");
        chip.className = "word-chip";
        chip.textContent = entry.word;
        chip.title = `Word ${index + 1}`;
        elements.sentenceBox.append(chip);
      });
    }
    const count = state.sentence.length;
    elements.wordCount.textContent = `${count} ${count === 1 ? "word" : "words"}`;
    elements.historySentenceTotal.textContent = String(count);
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
      const title = document.createElement("b"); title.textContent = "No words yet";
      const hint = document.createElement("small"); hint.textContent = "Try a prediction in the Translator.";
      cell.append(icon, title, hint); row.append(cell); elements.historyRows.append(row);
      return;
    }
    [...state.history].reverse().forEach(entry => {
      const row = document.createElement("tr");
      const word = document.createElement("td"); word.className = "history-word"; word.textContent = entry.word;
      const time = document.createElement("td"); time.textContent = entry.time;
      const source = document.createElement("td");
      const sourceTag = document.createElement("span"); sourceTag.className = "source-label"; sourceTag.textContent = "AI";
      source.append(sourceTag);
      const actions = document.createElement("td");
      const remove = document.createElement("button"); remove.className = "row-delete"; remove.type = "button"; remove.textContent = "×";
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
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      word: state.currentPrediction.word,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      source: "model"
    };
    state.sentence.push(entry);
    state.history.push(entry);
    renderSentence();
    renderHistory();
    state.currentPrediction = null;
    elements.addWord.disabled = true;
    elements.predictedWord.textContent = "Ready for next sign";
    elements.predictionDescription.textContent = "The previous word was added. Record or upload the next sign.";
    elements.confidenceText.textContent = "—";
    elements.confidenceBar.style.width = "0%";
    elements.sentenceFeedback.textContent = `"${entry.word}" added. Your next word is ready.`;
    toast(`Added "${entry.word}".`);
    if (state.stream && !mediaRecorder) {
      elements.flipCamera.disabled = false;
      if (state.isFramingReady || state.manualPoseFallback) {
        startSignRecording();
      } else {
        elements.cameraStatus.textContent = "Center yourself for the next sign";
        elements.cameraHelp.textContent = "Adjust until the frame guide turns green; recording will start for the next word.";
      }
    }
  });

  $("#clearSentence").addEventListener("click", () => {
    state.sentence = [];
    renderSentence();
    elements.sentenceFeedback.textContent = "Sentence cleared.";
    toast("Sentence cleared.");
  });

  $("#copySentence").addEventListener("click", async () => {
    const sentence = state.sentence.map(entry => entry.word).join(" ");
    if (!sentence) { toast("Add a word before copying."); return; }
    try {
      await navigator.clipboard.writeText(sentence);
      toast("Sentence copied to clipboard.");
    } catch {
      toast(`Sentence: ${sentence}`);
    }
  });

  $("#clearHistory").addEventListener("click", () => {
    if (!state.history.length) { toast("History is already empty."); return; }
    state.history = [];
    renderHistory();
    toast("History cleared.");
  });

  window.addEventListener("beforeunload", turnCameraOff);
  checkApiHealth();
  renderSentence();
  renderHistory();
})();
