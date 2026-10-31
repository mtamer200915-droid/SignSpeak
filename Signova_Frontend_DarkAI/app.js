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
    return "http://127.0.0.1:8000";
  }
  const API_BASE = resolveApiBase().replace(/\/+$/, "");
  const state = { currentPage: "home", stream: null, currentPrediction: null, sentence: [], history: [] };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    sidebar: $("#sidebar"), pageCrumb: $("#pageCrumb"), toast: $("#toast"),
    apiStatus: $("#apiStatus"),
    cameraVideo: $("#cameraVideo"), cameraStage: $("#cameraStage"), cameraStatus: $("#cameraStatus"),
    startCamera: $("#startCamera"), stopCamera: $("#stopCamera"), cameraOff: $("#cameraOff"),
    cameraHelp: $("#cameraHelp"),
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      if (!response.ok) throw new Error("API health check failed");
      const health = await response.json();
      if (health.status !== "ok" || !health.model_loaded || health.classes !== 166) {
        throw new Error("Model is not ready");
      }
      elements.apiStatus.textContent = "API and 166-class model ready";
      elements.apiStatus.classList.remove("error");
      elements.apiStatus.classList.add("ready");
    } catch (error) {
      elements.apiStatus.textContent = "API unavailable — check backend and model files";
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

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Camera access isn't available here.");
      elements.cameraHelp.textContent = "Camera access requires localhost/HTTPS.";
      return;
    }
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false
      });
      elements.cameraVideo.srcObject = state.stream;
      await elements.cameraVideo.play();
      elements.cameraStage.classList.add("camera-on");
      elements.cameraStatus.parentElement.classList.add("on");
      elements.startCamera.disabled = true;
      elements.cameraOff.disabled = false;

      if (!setupMediaRecorder()) {
        const message = "Video recording isn't supported in this browser. Upload a short sign video instead.";
        turnCameraOff();
        elements.cameraHelp.textContent = message;
        toast(message);
      }

    } catch (error) {
      console.error(error);
      const message = "Could not start the camera. Check browser permissions.";
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
        if (state.stream) setupMediaRecorder();
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
        if (state.stream) setupMediaRecorder();
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
    elements.stopCamera.disabled = false;
    toast("بدء تسجيل الحركة...");
    return true;
  }

  function finishSign() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      elements.stopCamera.disabled = true;
      elements.cameraStatus.textContent = "Analyzing sign...";
      elements.cameraHelp.textContent = "جاري تحليل الكلمة. راجع التوقع ثم اضغط Done لإضافتها وبدء الكلمة التالية.";
      elements.addWord.disabled = true;
      toast("تم إيقاف التسجيل وجاري تحليل الكلمة...");
    }
  }

  function turnCameraOff() {
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
    elements.stopCamera.disabled = true;
    elements.cameraOff.disabled = true;
    elements.cameraHelp.textContent = "Camera stream stopped.";
  }

  elements.startCamera.addEventListener("click", startCamera);
  elements.stopCamera.addEventListener("click", finishSign);
  elements.cameraOff.addEventListener("click", turnCameraOff);
  $("#flipHint").addEventListener("click", () => toast("Tip: keep both hands visible and use steady lighting."));

  // ==================== ربط الباك إيند و Gemini ====================
  async function sendVideoFileToBackend(videoFile) {
    const formData = new FormData();
    formData.append("file", videoFile, videoFile.name || "signova-upload.webm");

    elements.sentenceFeedback.textContent = "جاري تحليل الإشارة بواسطة نموذج الذكاء الاصطناعي...";
    elements.addWord.disabled = true;

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
      if (state.stream && !mediaRecorder) setupMediaRecorder();
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
    if (state.stream) {
      elements.cameraStatus.textContent = "Prediction ready · Press Done";
      elements.cameraHelp.textContent = "راجع الكلمة. اضغط Done لإضافتها للجملة وبدء تسجيل الكلمة التالية.";
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
    if (state.stream && !mediaRecorder && !setupMediaRecorder()) {
      turnCameraOff();
      elements.cameraHelp.textContent = "Could not restart recording. Start the camera again or upload a video.";
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
