(() => {
  "use strict";

  // ==================== نظام الحماية والأمان (Security Layer) ====================
  document.addEventListener("keydown", (e) => {
    if (e.key === "F12") { e.preventDefault(); return false; }
    if (e.ctrlKey && e.shiftKey && ["I", "J", "C", "i", "j", "c"].includes(e.key)) { e.preventDefault(); return false; }
    if (e.ctrlKey && (e.key === "U" || e.key === "u")) { e.preventDefault(); return false; }
    if (e.ctrlKey && (e.key === "S" || e.key === "s")) { e.preventDefault(); return false; }
  });

  document.addEventListener("contextmenu", (e) => { e.preventDefault(); return false; });

  let devtoolsOpen = false;
  const threshold = 160;
  setInterval(() => {
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    if ((widthThreshold || heightThreshold) && !devtoolsOpen) {
      devtoolsOpen = true;
      document.body.innerHTML = "<div style='background:#090d18;color:#ff5c5c;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:20px;text-align:center;'>عذراً، تم اكتشاف محاولة فحص النظام. تم تأمين الصفحة لحماية الملكية الفكرية.</div>";
    }
  }, 1000);
  // ============================================================================

  const pages = ["home", "translator", "history", "about"];
  const pageLabels = { home: "Home", translator: "Translator", history: "History", about: "About Signova" };
  const API_BASE = (window.SIGNOVA_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const state = { currentPage: "home", stream: null, currentPrediction: null, sentence: [], history: [] };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    sidebar: $("#sidebar"), pageCrumb: $("#pageCrumb"), toast: $("#toast"),
    apiStatus: $("#apiStatus"),
    cameraVideo: $("#cameraVideo"), cameraStage: $("#cameraStage"), cameraStatus: $("#cameraStatus"),
    startCamera: $("#startCamera"), stopCamera: $("#stopCamera"), cameraHelp: $("#cameraHelp"),
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
      elements.cameraStatus.textContent = "Camera on (Ready to Record)";
      elements.cameraStatus.parentElement.classList.add("on");
      elements.startCamera.disabled = true;
      elements.stopCamera.disabled = false;
      elements.cameraHelp.textContent = "الكاميرا تعمل. ابدأ الحركة وعند الانتهاء اضغط Stop.";
      toast("Camera started successfully.");

      if (!setupMediaRecorder()) {
        const message = "Video recording isn't supported in this browser. Upload a short sign video instead.";
        stopCamera();
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
      const mimeType = supportedTypes.find(
        type => typeof MediaRecorder.isTypeSupported !== "function" || MediaRecorder.isTypeSupported(type)
      );
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
      if (recordedChunks.length === 0) {
        toast("لم يتم تسجيل بيانات كافية.");
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
    toast("بدء تسجيل الحركة...");
    return true;
  }

  function stopCamera() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      toast("تم إيقاف التسجيل وجاري معالجة الحركة...");
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
    elements.cameraHelp.textContent = "Camera stream stopped.";
  }

  elements.startCamera.addEventListener("click", startCamera);
  elements.stopCamera.addEventListener("click", stopCamera);
  $("#flipHint").addEventListener("click", () => toast("Tip: keep both hands visible and use steady lighting."));

  // ==================== ربط الباك إيند و Gemini ====================
  async function sendVideoFileToBackend(videoFile) {
    const formData = new FormData();
    formData.append("file", videoFile, videoFile.name || "signova-upload.webm");

    elements.sentenceFeedback.textContent = "جاري تحليل الإشارة بواسطة نموذج الذكاء الاصطناعي...";

    try {
      const response = await fetch(`${API_BASE}/api/predict`, {
        method: "POST",
        body: formData
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || "فشل الاتصال بالخادم المحلي.");

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
    }
  }

  function showRealPrediction(prediction) {
    state.currentPrediction = prediction;
    elements.predictedWord.textContent = prediction.word;
    elements.predictionDescription.textContent = prediction.description;
    elements.confidenceText.textContent = `${prediction.confidence}%`;
    elements.confidenceBar.style.width = `${prediction.confidence}%`;
    elements.addWord.disabled = false;
  }

  elements.demoPrediction.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
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
    elements.sentenceFeedback.textContent = `"${entry.word}" added to sentence.`;
    toast(`Added "${entry.word}".`);
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

  window.addEventListener("beforeunload", stopCamera);
  checkApiHealth();
  renderSentence();
  renderHistory();
})();
