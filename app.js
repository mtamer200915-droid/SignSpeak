(() => {
  "use strict";

  const pages = ["home", "translator", "history", "about"];
  const pageLabels = { home: "Home", translator: "Translator", history: "History", about: "About SignSpeak" };
  const state = { currentPage: "home", stream: null, currentPrediction: null, sentence: [], history: [] };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    sidebar: $("#sidebar"), pageCrumb: $("#pageCrumb"), toast: $("#toast"),
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

  function navigate(page) {
    if (!pages.includes(page)) return;
    state.currentPage = page;
    $$(".page").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
    $$(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.page === page));
    elements.pageCrumb.textContent = pageLabels[page];
    elements.sidebar.classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $$("[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  $$("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
  $("#mobileMenu").addEventListener("click", () => elements.sidebar.classList.toggle("open"));

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Camera access isn't available here. Open this site on localhost or HTTPS in a supported browser.");
      elements.cameraHelp.textContent = "Camera access requires localhost/HTTPS and browser permission.";
      return;
    }
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" }, audio: false
      });
      elements.cameraVideo.srcObject = state.stream;
      await elements.cameraVideo.play();
      elements.cameraStage.classList.add("camera-on");
      elements.cameraStatus.textContent = "Camera on";
      elements.cameraStatus.parentElement.classList.add("on");
      elements.startCamera.disabled = true;
      elements.stopCamera.disabled = false;
      elements.cameraHelp.textContent = "Camera preview is local to this browser tab. This demo does not upload video.";
      toast("Camera started. Try a sample prediction to test the interface.");
    } catch (error) {
      const message = error && error.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in your browser settings and try again."
        : error && error.name === "NotFoundError"
          ? "No camera was found on this device."
          : "Could not start the camera. Check browser permissions and make sure no other app is blocking it.";
      elements.cameraHelp.textContent = message;
      toast(message);
    }
  }

  function stopCamera() {
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
    elements.cameraHelp.textContent = "Your camera stream stays in this browser tab. No video is uploaded by this demo.";
  }

  elements.startCamera.addEventListener("click", startCamera);
  elements.stopCamera.addEventListener("click", stopCamera);
  $("#flipHint").addEventListener("click", () => toast("Tip: keep both hands visible, use steady lighting, and leave space around your hands."));

  // Deliberately simulated until the team provides a real backend/model contract.
  const samplePredictions = [
    { word: "HELLO", confidence: 96, description: "Sample greeting — simulated output." },
    { word: "THANK YOU", confidence: 93, description: "Sample phrase — simulated output." },
    { word: "HELP", confidence: 89, description: "Sample word — simulated output." },
    { word: "YES", confidence: 97, description: "Sample response — simulated output." },
    { word: "FRIEND", confidence: 91, description: "Sample word — simulated output." }
  ];
  let predictionIndex = -1;

  function showPrediction(prediction) {
    state.currentPrediction = prediction;
    elements.predictedWord.textContent = prediction.word;
    elements.predictionDescription.textContent = prediction.description;
    elements.confidenceText.textContent = `${prediction.confidence}%`;
    elements.confidenceBar.style.width = `${prediction.confidence}%`;
    elements.addWord.disabled = false;
    elements.sentenceFeedback.textContent = "Sample prediction ready. Add it to your sentence if you want.";
  }

  elements.demoPrediction.addEventListener("click", () => {
    predictionIndex = (predictionIndex + 1) % samplePredictions.length;
    showPrediction(samplePredictions[predictionIndex]);
    toast("Sample prediction displayed — this is not model output.");
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
      const hint = document.createElement("small"); hint.textContent = "Try a sample prediction in the Translator.";
      cell.append(icon, title, hint); row.append(cell); elements.historyRows.append(row);
      return;
    }
    [...state.history].reverse().forEach(entry => {
      const row = document.createElement("tr");
      const word = document.createElement("td"); word.className = "history-word"; word.textContent = entry.word;
      const time = document.createElement("td"); time.textContent = entry.time;
      const source = document.createElement("td");
      const sourceTag = document.createElement("span"); sourceTag.className = "source-label"; sourceTag.textContent = "SAMPLE";
      source.append(sourceTag);
      const actions = document.createElement("td");
      const remove = document.createElement("button"); remove.className = "row-delete"; remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `Remove ${entry.word} from history`);
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
      source: "sample"
    };
    state.sentence.push(entry);
    state.history.push(entry);
    renderSentence();
    renderHistory();
    elements.sentenceFeedback.textContent = `"${entry.word}" added. You can try another sample or copy the sentence.`;
    toast(`Added "${entry.word}" to your sentence.`);
  });

  $("#clearSentence").addEventListener("click", () => {
    state.sentence = [];
    renderSentence();
    elements.sentenceFeedback.textContent = "Sentence cleared. Your history remains until you clear it.";
    toast("Sentence cleared.");
  });

  $("#copySentence").addEventListener("click", async () => {
    const sentence = state.sentence.map(entry => entry.word).join(" ");
    if (!sentence) { toast("Add a word before copying the sentence."); return; }
    try {
      await navigator.clipboard.writeText(sentence);
      toast("Sentence copied to clipboard.");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = sentence; textarea.style.position = "fixed"; textarea.style.opacity = "0";
      document.body.append(textarea); textarea.select();
      const copied = document.execCommand("copy"); textarea.remove();
      toast(copied ? "Sentence copied to clipboard." : `Sentence: ${sentence}`);
    }
  });

  $("#clearHistory").addEventListener("click", () => {
    if (!state.history.length) { toast("History is already empty."); return; }
    state.history = [];
    renderHistory();
    toast("History cleared.");
  });

  window.addEventListener("beforeunload", stopCamera);
  renderSentence();
  renderHistory();
})();
