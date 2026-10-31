(() => {
  "use strict";

  const pages = ["home", "translator", "history", "about"];
  const pageLabels = { home: "Home", translator: "Translator", history: "History", about: "About Signova" };
  const arabicUi = {
    "WORKSPACE": "مساحة العمل", "Main navigation": "التنقل الرئيسي", "Home": "الرئيسية", "Translator": "المترجم",
    "Sign": "إشارة", "Translation": "الترجمة", "About": "عن", "feel more": "أكثر",
    "CAMERA": "الكاميرا", "History": "السجل", "About Signova": "عن Signova", "BUILT FOR ACCESSIBILITY": "مصمم لسهولة الوصول",
    "Checking API connection…": "جارٍ التحقق من اتصال الواجهة…", "API connection required": "يلزم اتصال واجهة التنبؤ",
    "Toggle navigation": "فتح أو إغلاق القائمة", "COMMUNICATION WITHOUT BARRIERS": "تواصل بلا حواجز", "Every gesture": "كل إشارة",
    "has a": "لها", "voice.": "صوت.",
    "Signova explores a more connected world by turning selected American Sign Language gestures into text. Record a sign or upload a video; a connected API returns an experimental prediction.": "يحوّل Signova بعض إشارات لغة الإشارة الأمريكية إلى نص. سجّل إشارة أو ارفع فيديو للحصول على نتيجة تجريبية من واجهة التنبؤ.",
    "Signova API": "واجهة Signova", "Signova — an AI-assisted sign language translation interface.": "Signova — واجهة لترجمة لغة الإشارة بمساعدة الذكاء الاصطناعي.",
    "GitHub Pages hosts the website. For automatic wake-up and a stable address, deploy the API once to Cloud Run using the repository workflow; it starts when a request arrives and scales down after inactivity. The temporary": "يستضيف GitHub Pages الموقع. للحصول على عنوان ثابت وتشغيل تلقائي، انشر API مرة واحدة على Cloud Run من سير العمل في المستودع؛ سيعمل عند وصول طلب ويتوقف عند عدم الاستخدام. تجربة",
    "remains available for short tests. The camera framing guide runs in your browser; recorded clips are sent to the prediction API only after you stop recording.": "تظل متاحة للاختبارات القصيرة. يعمل دليل وضعية الكاميرا في المتصفح؛ ولا يُرسل المقطع إلى API إلا بعد إيقاف التسجيل.",
    "Open translator": "افتح المترجم", "Explore the project": "استكشف المشروع", "Language focus": "اللغة المستهدفة",
    "Video-based": "معالجة الفيديو", "Translation mode": "طريقة الترجمة", "Modular": "تصميم مرن", "Integration-ready UI": "واجهة قابلة للربط",
    "Gesture recognition": "التعرّف على الإشارات", "CAMERA PREVIEW": "معاينة الكاميرا", "SAMPLE GESTURE": "إشارة تجريبية",
    "Ready to translate": "جاهز للترجمة", "Text output": "النص الناتج", "Designed for clarity": "مصمم للوضوح",
    "Accessible. Simple. Human.": "سهل الوصول. بسيط. إنساني.", "YOUR WORKSPACE": "مساحة العمل", "What would you like to do?": "ماذا تريد أن تفعل؟",
    "Capture or upload a sign for translation.": "سجّل إشارة أو ارفع فيديو لترجمته.", "Translate signs": "ترجمة الإشارات",
    "Open the camera, preview the stream, and test the translation interface.": "افتح الكاميرا وشاهد المعاينة وجرّب واجهة الترجمة.", "Review history": "مراجعة السجل",
    "See words you've added to this session and clear them any time.": "راجع الكلمات التي أضفتها إلى الجلسة وامسحها في أي وقت.", "View history": "عرض السجل",
    "About the project": "عن المشروع", "See how video capture, recognition, and sentence history fit together.": "تعرّف على تسجيل الفيديو والتعرّف على الإشارات وسجل الجمل.",
    "Meet Signova": "تعرّف على Signova", "For a prediction, connect a Signova API.": "للحصول على تنبؤ، اتصل بواجهة Signova.",
    "GitHub Pages serves this interface; model predictions need a running API configured for this site.": "تعرض GitHub Pages الموقع فقط؛ ويحتاج التنبؤ إلى واجهة API تعمل ومهيأة لهذا الموقع.",
    "CAMERA TRANSLATION": "الترجمة بالكاميرا", "Sign ": "إشارة ", "Record one sign, check its prediction, then press Done to add it and continue with the next word.": "سجّل إشارة واحدة، وراجع نتيجتها، ثم اضغط «تم» لإضافتها ومتابعة الكلمة التالية.",
    "SIGNOVA API": "واجهة Signova", "01 / INPUT": "01 / الإدخال", "Camera feed": "عرض الكاميرا", "Camera off": "الكاميرا متوقفة",
    "Your camera, your hands": "الكاميرا ويداك", "Keep your hands and upper body visible, then record one sign at a time.": "أبقِ يديك وجزءك العلوي ظاهرين. نفّذ إشارة واحدة في كل مرة أمام الكاميرا.",
    "Camera access requires localhost or HTTPS permission": "يتطلب الوصول إلى الكاميرا إذنًا وموقعًا آمنًا (HTTPS).",
    "LIVE PREVIEW": "معاينة مباشرة", "Camera guidance is off": "إرشاد وضعية الجسم متوقف", "Start the camera to check your position.": "شغّل الكاميرا للتحقق من وضعيتك.",
    "Start camera": "تشغيل الكاميرا", "Start sign": "بدء الإشارة", "Stop & predict": "إيقاف والتنبؤ", "Flip camera": "قلب الكاميرا",
    "Switch between the front and rear cameras": "التبديل بين الكاميرا الأمامية والخلفية", "Camera off": "إيقاف الكاميرا", "Camera tips": "إرشادات الكاميرا",
    "Start the camera first. The local framing guide checks that your face and shoulders are visible before you record.": "شغّل الكاميرا أولًا. سيتأكد دليل الإطار من ظهور وجهك وكتفيك قبل التسجيل.",
    "The GitHub Actions API demo is temporary. Use the connected website link from the run summary while the demo is running.": "تجربة API عبر GitHub Actions مؤقتة. استخدم رابط الموقع المتصل من ملخص التشغيل أثناء عمل التجربة.",
    "Perform the sign yourself in front of the camera; showing a video on another screen may not be recognized.": "نفّذ الإشارة بنفسك أمام الكاميرا؛ عرض فيديو على شاشة أخرى قد لا يُتعرّف عليه.",
    "Predictions need a separate API that runs temporarily for team testing.": "يتطلب التنبؤ واجهة API منفصلة تعمل مؤقتًا لتجربة الفريق.", "Open the free API demo controls": "افتح إعدادات تجربة API المجانية",
    "; share the website link from the run summary.": "؛ ثم شارك رابط الموقع الموجود في ملخص التشغيل.", "02 / MODEL OUTPUT": "02 / نتيجة النموذج",
    "Prediction": "التنبؤ", "MODEL RESULT": "نتيجة النموذج", "RECOGNIZED WORD": "الكلمة المتعرّف عليها", "Waiting": "بانتظار الإشارة",
    "Record a sign or upload a video to get a prediction.": "سجّل إشارة أو ارفع فيديو للحصول على تنبؤ.", "Local model score": "درجة النموذج المحلي",
    "Model options · choose the word you performed": "خيارات النموذج · اختر الكلمة التي أدّيتها",
    "Upload sign video": "رفع فيديو للإشارة", "Experimental model score, not a guarantee. Verify each word before adding it.": "نتيجة النموذج تجريبية وليست مضمونة. تحقّق من كل كلمة قبل إضافتها.",
    "03 / OUTPUT": "03 / الناتج", "Your sentence": "جملتك", "0 words": "٠ كلمات", "Your recognized words will appear here…": "ستظهر الكلمات التي تم التعرف عليها هنا…",
    "Done · Next word": "تم · الكلمة التالية", "Play audio": "تشغيل الصوت", "Clear": "مسح", "Read the sentence aloud": "قراءة الجملة بصوت مرتفع",
    "Play sentence audio": "تشغيل صوت الجملة", "Copy sentence": "نسخ الجملة",
    "Check each prediction, then press Done to build your sentence one word at a time.": "تحقّق من كل تنبؤ، ثم اضغط «تم» لبناء جملتك كلمةً كلمة.",
    "YOUR ACTIVITY": "نشاطك", "Translation ": "ترجمة ", "Words added during this browser session appear here.": "ستظهر هنا الكلمات التي أُضيفت خلال جلسة المتصفح.",
    "Clear history": "مسح السجل", "WORDS ADDED": "كلمات مضافة", "WORDS IN SENTENCE": "كلمات في الجملة", "SESSION": "الجلسة", "Current tab": "علامة التبويب الحالية",
    "RECENT ACTIVITY": "النشاط الأخير", "Recognized words": "الكلمات المتعرّف عليها", "SESSION HISTORY": "سجل الجلسة", "WORD": "الكلمة", "TIME": "الوقت", "SOURCE": "المصدر",
    "No words yet": "لا توجد كلمات بعد", "Run a prediction in the Translator.": "نفّذ تنبؤًا من صفحة المترجم.",
    "History is kept only in the current page session. It is not sent to a server or saved to a database.": "يُحفظ السجل في جلسة الصفحة الحالية فقط، ولا يُرسل إلى خادم أو قاعدة بيانات.",
    "THE IDEA BEHIND THE INTERFACE": "فكرة الواجهة", "About ": "عن ",
    "Technology should bring people closer. Signova is a student project exploring sign-language recognition.": "تقرّب التقنية الناس من بعضهم. Signova مشروع طلابي يستكشف التعرّف على لغة الإشارة.",
    "OUR MISSION": "مهمتنا", "Making communication": "لنجعل التواصل", "feel more ": "أكثر ", "connected.": "ترابطًا.",
    "Signova's goal is to recognize selected American Sign Language (ASL) signs and present them as readable text. The frontend sends short clips to the Signova API; Gemini's optional second opinion is limited to the project's 166 labels.": "يهدف Signova إلى التعرّف على مجموعة مختارة من إشارات لغة الإشارة الأمريكية (ASL) وعرضها كنص مقروء. ترسل الواجهة مقاطع قصيرة إلى API؛ ورأي Gemini الاختياري يقتصر على فئات المشروع الـ166.",
    "GESTURE": "إشارة", "MEANING": "معنى", "CONNECTION": "تواصل", "HOW IT WORKS": "كيف يعمل", "Three parts. One experience.": "ثلاثة أجزاء. تجربة واحدة.",
    "Capture": "التقاط", "The browser asks for camera permission and shows the live video preview.": "يطلب المتصفح إذن الكاميرا ويعرض معاينة الفيديو المباشرة.", "FRONTEND": "الواجهة الأمامية",
    "Recognize": "تعرّف", "The backend extracts pose landmarks and runs the trained 166-class model; Gemini's optional second opinion can choose only from those labels.": "يستخرج الخادم معالم وضعية الجسم ويشغّل نموذجًا مدربًا على 166 فئة؛ ويمكن لرأي Gemini الاختياري الاختيار من هذه الفئات فقط.",
    "BACKEND + MODEL": "الخادم + النموذج", "Communicate": "تواصل", "The interface displays the returned word and confidence and keeps a session-only sentence history.": "تعرض الواجهة الكلمة ودرجة الثقة وتحتفظ بسجل جمل خلال الجلسة فقط.",
    "INTEGRATION STATUS": "حالة الربط", "Signova API connection": "اتصال واجهة Signova", "GitHub Pages hosts the website. For automatic wake-up and a stable address, deploy the API once to Cloud Run using the repository workflow; it starts when a request arrives and scales down after inactivity. The temporary ": "يستضيف GitHub Pages الموقع. للحصول على عنوان ثابت وتشغيل تلقائي، انشر API مرة واحدة على Cloud Run من سير العمل في المستودع؛ سيعمل عند وصول طلب ويتوقف عند عدم الاستخدام. تظل تجربة ",
    "GitHub Actions demo": "GitHub Actions المؤقتة", " remains available for short tests. The camera framing guide runs in your browser; recorded clips are sent to the prediction API only after you stop recording.": " متاحة للاختبارات القصيرة. يعمل دليل وضعية الكاميرا في المتصفح؛ ولا يُرسل المقطع إلى API إلا بعد إيقاف التسجيل.",
    "Checking model connection…": "جارٍ التحقق من اتصال النموذج…", "HTML": "HTML", "CSS": "CSS", "JavaScript": "JavaScript", "HTTPS API": "واجهة API آمنة", "166-class model": "نموذج من 166 فئة",
    "Built with accessibility in mind": "مصمم مع مراعاة سهولة الوصول", "Experimental · Connected API required": "تجريبي · يتطلب API متصلًا",
    "This page has no API address. Open the connected Signova link from the latest deployment summary.": "لا يحتوي هذا الرابط على عنوان API. افتح رابط Signova المتصل من أحدث ملخص تشغيل.",
    "The shared API is unavailable or waking up. Signova retries automatically during a prediction request.": "واجهة API المشتركة غير متاحة أو قيد التشغيل. سيعيد Signova المحاولة تلقائيًا عند طلب تنبؤ.",
    "Warning: the shared temporary API session ends in {time}. Finish any recording in progress.": "تنبيه: تنتهي جلسة API المؤقتة بعد {time}. أكمل التسجيل الجاري.",
    "The temporary API session has ended. Its Quick Tunnel address cannot be restarted or discovered by this page; the stable auto-waking API link is needed for automatic recovery.": "انتهت جلسة API المؤقتة. لا يمكن إعادة تشغيل رابط Quick Tunnel من هذه الصفحة؛ يلزم رابط API ثابت للتشغيل التلقائي.",
    "API address missing · open the connected Signova link": "عنوان API غير موجود · افتح رابط Signova المتصل", "Waking API · reconnecting automatically…": "جارٍ تشغيل API وإعادة الاتصال تلقائيًا…",
    "API running · low test accuracy ({accuracy}%)": "واجهة API تعمل · دقة الاختبار منخفضة ({accuracy}٪)",
    "API running · Gemini second opinion enabled": "واجهة API تعمل · رأي Gemini الثاني مفعّل", "API running · local 166-class model": "واجهة API تعمل · النموذج المحلي من 166 فئة",
    "API unavailable · automatic retry is ready": "واجهة API غير متاحة · إعادة المحاولة جاهزة", "API not configured · open the connected Signova link": "لم يتم إعداد API · افتح رابط Signova المتصل",
    "API waking or recovering · retry {attempt}/4": "جارٍ تشغيل API أو استعادتها · المحاولة {attempt}/4",
    "API running · prediction received": "واجهة API تعمل · وصل التنبؤ", "Camera access isn't available here.": "لا يمكن الوصول إلى الكاميرا من هذا المتصفح.",
    "Camera access requires localhost/HTTPS.": "يتطلب الوصول إلى الكاميرا موقعًا آمنًا (HTTPS) أو localhost.", "Loading camera guidance…": "جارٍ تحميل إرشاد الكاميرا…",
    "The position check runs on this device in your browser.": "يعمل فحص الوضعية على هذا الجهاز وفي المتصفح.", "Position check unavailable": "فحص الوضعية غير متاح",
    "Keep your face and shoulders centered and visible. You can still record.": "أبقِ وجهك وكتفيك في منتصف الصورة وواضحين. يمكنك التسجيل رغم ذلك.",
    "Camera preview is ready, but this browser cannot record. Upload a short sign video instead.": "معاينة الكاميرا جاهزة، لكن هذا المتصفح لا يدعم التسجيل. ارفع فيديو قصيرًا للإشارة بدلًا من ذلك.",
    "Center your face and shoulders. Recording starts only when you press Start sign.": "ضع وجهك وكتفيك في منتصف الصورة. لن يبدأ التسجيل إلا عند الضغط على «بدء الإشارة».",
    "Could not start the camera. Check browser permissions.": "تعذر تشغيل الكاميرا. تحقق من أذونات المتصفح.", "The camera recording stopped unexpectedly. Try again or upload a video.": "توقف تسجيل الكاميرا فجأة. أعد المحاولة أو ارفع فيديو.",
    "Camera recording failed.": "فشل تسجيل الكاميرا.", "No video was captured. Press Start sign to try again.": "لم يُلتقط فيديو. اضغط «بدء الإشارة» لإعادة المحاولة.",
    "The clip was too short. Press Start sign and try again.": "المقطع قصير جدًا. اضغط «بدء الإشارة» وأعد المحاولة.", "Recording gesture...": "جارٍ تسجيل الإشارة…",
    "Recording your sign": "جارٍ تسجيل الإشارة", "Keep the sign fully in view, then press Stop & predict.": "أبقِ الإشارة ظاهرة بالكامل، ثم اضغط «إيقاف والتنبؤ».",
    "Recording your sign... Press Stop when you are done.": "جارٍ تسجيل الإشارة… اضغط «إيقاف» عند الانتهاء.", "Sign recording started.": "بدأ تسجيل الإشارة.",
    "This browser cannot record video. Upload a short sign video instead.": "هذا المتصفح لا يدعم تسجيل الفيديو. ارفع فيديو قصيرًا للإشارة بدلًا من ذلك.",
    "Recording is not supported by this browser. Use Upload sign video instead.": "هذا المتصفح لا يدعم التسجيل. استخدم «رفع فيديو للإشارة» بدلًا من ذلك.",
    "Could not switch cameras. Kept the current camera.": "تعذر تبديل الكاميرا. أبقينا الكاميرا الحالية.", "The camera stopped while switching. Start it again and check camera permissions.": "توقفت الكاميرا أثناء التبديل. شغّلها مجددًا وتحقق من الأذونات.",
    "Checking your position…": "جارٍ التحقق من وضعيتك…", "Switch to the rear camera": "التبديل إلى الكاميرا الخلفية", "Switch to the front camera": "التبديل إلى الكاميرا الأمامية",
    "Analyzing sign...": "جارٍ تحليل الإشارة…", "Analyzing the sign. Review the prediction, then press Done to add it and continue.": "جارٍ تحليل الإشارة. راجع التنبؤ، ثم اضغط «تم» لإضافته والمتابعة.",
    "Recording stopped. Analyzing the sign…": "توقف التسجيل. جارٍ تحليل الإشارة…", "Camera stream stopped.": "توقف بث الكاميرا.", "Camera guidance is off": "إرشاد الكاميرا متوقف",
    "Start the camera to check your position.": "شغّل الكاميرا للتحقق من وضعيتك.", "Keep both hands visible and use steady lighting.": "أبقِ يديك ظاهرتين واستخدم إضاءة ثابتة.",
    "Start the camera first. The local framing guide checks that your face and shoulders are visible before you record. Perform the sign yourself in front of the camera; showing a video on another screen may not be recognized.": "شغّل الكاميرا أولًا ليتحقق دليل الإطار من ظهور وجهك وكتفيك. نفّذ الإشارة بنفسك أمام الكاميرا؛ عرض فيديو على شاشة أخرى قد لا يُتعرّف عليه.",
    "Keep both hands visible as you perform the sign yourself. Do not point the camera at a screen playing a clip.": "أبقِ يديك ظاهرتين أثناء تنفيذ الإشارة بنفسك. لا توجّه الكاميرا إلى شاشة تعرض مقطعًا.",
    "This page has no connected API address. Open the connected Signova link from the latest deployment summary.": "لا يحتوي هذا الرابط على عنوان API متصل. افتح رابط Signova المتصل من أحدث ملخص تشغيل.",
    "The recording is ready, but this page has no API address. Open the connected Signova link from the deployment summary.": "التسجيل جاهز، لكن هذا الرابط لا يحتوي على عنوان API. افتح رابط Signova المتصل من ملخص التشغيل.",
    "Your recording could not be sent. Open the connected Signova link from the deployment summary.": "تعذر إرسال التسجيل. افتح رابط Signova المتصل من ملخص التشغيل.", "Prediction API offline": "واجهة التنبؤ غير متاحة",
    "No connected prediction API address.": "لا يوجد عنوان API متصل للتنبؤ.", "Analyzing the sign with the AI model…": "جارٍ تحليل الإشارة باستخدام نموذج الذكاء الاصطناعي…",
    "The API is waking up or restarting. Retrying this prediction automatically…": "يجري تشغيل API أو إعادة تشغيلها. سنعيد محاولة التنبؤ تلقائيًا…",
    "The API took too long to analyze this clip. Try a shorter recording.": "استغرق تحليل المقطع وقتًا طويلًا. جرّب تسجيلًا أقصر.",
    "The prediction service could not be reached. Check the API session and your internet connection.": "تعذر الوصول إلى خدمة التنبؤ. تحقق من جلسة API واتصال الإنترنت.",
    "The API could not process this video. Keep the signer and both arms visible, then try again.": "تعذر على API معالجة الفيديو. أبقِ الشخص وذراعيه ظاهرين ثم أعد المحاولة.",
    "Prediction failed: {detail}": "فشل التنبؤ: {detail}", "Prediction failed. Try a short video with the signer centered in frame.": "فشل التنبؤ. جرّب فيديو قصيرًا يظهر فيه الشخص في منتصف الإطار.",
    "Adjust the framing and try again.": "عدّل وضعية التصوير ثم أعد المحاولة.", "The clip was not analyzed. Correct the camera framing if needed, then record again; temporary API failures are retried automatically.": "لم يتم تحليل المقطع. عدّل إطار الكاميرا عند الحاجة ثم أعد التسجيل؛ سنعيد المحاولة تلقائيًا عند تعطل API مؤقتًا.",
    "Try recording the sign again; Signova retries automatically when the API is waking or restarting.": "أعد تسجيل الإشارة؛ سيعيد Signova المحاولة تلقائيًا أثناء تشغيل API أو استعادتها.",
    "Prediction unavailable": "التنبؤ غير متاح", "Prediction ready · Press Done": "التنبؤ جاهز · اضغط «تم»", "Review the word, then press Done to continue.": "راجع الكلمة ثم اضغط «تم» للمتابعة.",
    "Keep the sign fully in view, then press Stop & predict.": "أبقِ الإشارة ظاهرة بالكامل، ثم اضغط «إيقاف والتنبؤ».",
    "Gemini suggested an alternative. The score below belongs to the local model's original guess.": "اقترح Gemini كلمة بديلة. الدرجة أدناه تخص تخمين النموذج المحلي الأصلي.",
    "Gemini returned the same word; the score below is from the local model.": "أعاد Gemini الكلمة نفسها؛ والدرجة أدناه من النموذج المحلي.",
    "Experimental Signova model output. Review the suggestions if the word looks wrong.": "نتيجة تجريبية من نموذج Signova. راجع الاقتراحات إذا بدت الكلمة غير صحيحة.",
    "Person visible in {coverage}% of sampled frames.": "ظهر الشخص في {coverage}٪ من الإطارات التي تم فحصها.",
    "You selected this word from the model's three suggestions. Check it before adding.": "اخترت هذه الكلمة من اقتراحات النموذج الثلاثة. تحقق منها قبل إضافتها.",
    "{source} Review the suggestions if the word looks wrong.": "{source} راجع الاقتراحات إذا بدت الكلمة غير صحيحة.",
    "{source} Person visible in {coverage}% of sampled frames. Review the suggestions if the word looks wrong.": "{source} ظهر المؤدي في {coverage}٪ من الإطارات التي تم فحصها. راجع الاقتراحات إذا بدت الكلمة غير صحيحة.",
    "Model options": "خيارات النموذج",
    "Local score for original guess": "درجة التخمين الأصلي للنموذج المحلي", "Ready for next sign": "جاهز للإشارة التالية",
    "The previous word was added. Record or upload the next sign.": "أُضيفت الكلمة السابقة. سجّل الإشارة التالية أو ارفع فيديوها.",
    "Your recognized words will appear here…": "ستظهر الكلمات التي تم التعرف عليها هنا…", "Word {number}": "الكلمة {number}",
    "{count} word": "كلمة واحدة", "{count} words": "{count} كلمات", "No words yet": "لا توجد كلمات بعد", "Try a prediction in the Translator.": "جرّب التنبؤ من صفحة المترجم.",
    "History entry removed.": "تم حذف العنصر من السجل.", "Added \"{word}\". Your next word is ready.": "أُضيفت «{word}». الكلمة التالية جاهزة.",
    "Added \"{word}\".": "أُضيفت «{word}». ", "Center yourself for the next sign": "ضع نفسك في منتصف الإطار للإشارة التالية",
    "Adjust until the frame guide turns green; recording will start for the next word.": "عدّل وضعيتك حتى يصبح دليل الإطار أخضر؛ سيبدأ تسجيل الكلمة التالية.",
    "Sentence cleared.": "تم مسح الجملة.", "Add a word before copying.": "أضف كلمة قبل النسخ.", "Sentence copied to clipboard.": "تم نسخ الجملة.",
    "Sentence: {sentence}": "الجملة: {sentence}", "Audio playback isn't supported by this browser.": "هذا المتصفح لا يدعم تشغيل الصوت.",
    "Could not play the sentence audio.": "تعذر تشغيل صوت الجملة.", "History is already empty.": "السجل فارغ بالفعل.", "History cleared.": "تم مسح السجل.",
    "Switch to Arabic": "التبديل إلى العربية", "Switch to English": "التبديل إلى الإنجليزية", "English": "English", "Arabic": "العربية", "العربية": "العربية",
    "Signova — Sign Language Translator": "Signova — مترجم لغة الإشارة",
    "Ready to sign": "جاهز للإشارة", "Keep both hands visible when you sign. Stop the recording when the word is complete.": "أبقِ يديك ظاهرتين أثناء الإشارة. أوقف التسجيل بعد اكتمال الكلمة.",
    "No video was captured. Press Start sign to try again.": "لم يتم التقاط فيديو. اضغط «بدء الإشارة» لإعادة المحاولة.",
    "The clip was too short. Press Start sign and try again.": "المقطع قصير جدًا. اضغط «بدء الإشارة» وأعد المحاولة.",
    "No readable video frames were found. Try another clip.": "لم يتم العثور على إطارات فيديو قابلة للقراءة. جرّب مقطعًا آخر.",
    "The video could not be decoded. Upload an MP4 or WebM clip and try again.": "تعذر فك ترميز الفيديو. ارفع مقطع MP4 أو WebM ثم أعد المحاولة.",
    "No signer was clearly visible in enough frames. Keep the person's face, shoulders, and both arms in frame, then try again. Do not point the camera at a screen playing a video.": "لم يظهر المؤدي بوضوح في عدد كافٍ من الإطارات. أبقِ وجهه وكتفيه وذراعيه داخل الإطار، ثم أعد المحاولة. لا توجّه الكاميرا إلى شاشة تعرض فيديو.",
    "Unsupported video format. Upload an MP4, WebM, MOV, AVI, or MKV clip.": "تنسيق الفيديو غير مدعوم. ارفع مقطع MP4 أو WebM أو MOV أو AVI أو MKV.",
    "The uploaded video is empty.": "ملف الفيديو المرفوع فارغ.", "The video exceeds the {limit} MB upload limit.": "يتجاوز الفيديو حد الرفع البالغ {limit} ميجابايت.",
    "The video exceeds the 50 MB upload limit.": "يتجاوز الفيديو حد الرفع البالغ 50 ميجابايت.",
    "No person pose was detected in enough frames. Keep the signer and both arms visible; do not film a video playing on a screen.": "لم تُكتشف وضعية المؤدي في عدد كافٍ من الإطارات. أبقِ المؤدي وذراعيه ظاهرين، ولا تصوّر فيديو معروضًا على شاشة.",
    "The API returned no prediction. Try a clear, short recording.": "لم تُرجع API أي تنبؤ. جرّب تسجيلًا قصيرًا وواضحًا.",
    "Prediction received: {word}": "وصل التنبؤ: {word}", "Prediction failed: {detail}": "فشل التنبؤ: {detail}",
    "Automatic recovery will retry the next prediction.": "ستعيد الاستعادة التلقائية المحاولة عند التنبؤ التالي.",
    "The API request timed out. Try a shorter recording.": "انتهت مهلة طلب API. جرّب تسجيلًا أقصر.",
    "The prediction service could not be reached. Check the API session and your internet connection.": "تعذر الوصول إلى خدمة التنبؤ. تحقق من جلسة API واتصال الإنترنت.",
    "The API could not process this video. Keep the signer and both arms visible, then try again.": "تعذر على API معالجة الفيديو. أبقِ المؤدي وذراعيه ظاهرين ثم أعد المحاولة.",
    "API running · low test accuracy ({accuracy}%)": "واجهة API تعمل · دقة الاختبار منخفضة ({accuracy}٪)",
    "API not configured · open the connected Signova link": "لم يتم إعداد API · افتح رابط Signova المتصل",
    "The API is waking up or restarting. Retrying this prediction automatically…": "يجري تشغيل API أو إعادة تشغيلها. سنعيد محاولة هذا التنبؤ تلقائيًا…",
    "API running · prediction received": "واجهة API تعمل · وصل التنبؤ",
    "Choose {word}; model score {score}%": "اختر {word}؛ درجة النموذج {score}٪",
    "Gemini's second opinion changed the local guess to \"{word}\". The score below belongs to the local guess \"{original}\".": "غيّر رأي Gemini الثاني تخمين النموذج المحلي إلى «{word}». الدرجة أدناه تخص التخمين المحلي «{original}».",
    "Gemini's second opinion returned the same word; the score below is still from the local model.": "أعاد رأي Gemini الثاني الكلمة نفسها؛ والدرجة أدناه ما زالت من النموذج المحلي.",
    "Local score for original guess": "درجة التخمين المحلي الأصلي", "Experimental Signova model output (166 classes)": "نتيجة تجريبية من نموذج Signova (166 فئة)",
    "Prediction ready · Press Done": "التنبؤ جاهز · اضغط «تم»", "Review the word, then press Done to continue.": "راجع الكلمة، ثم اضغط «تم» للمتابعة.",
    "{count} word": "كلمة واحدة", "{count} words": "{count} كلمات", "Word {number}": "الكلمة {number}",
    "History entry removed.": "تم حذف العنصر من السجل.", "Added \"{word}\". Your next word is ready.": "أُضيفت «{word}». الكلمة التالية جاهزة.",
    "Center yourself for the next sign": "ضع نفسك في منتصف الإطار للإشارة التالية",
    "Adjust until the frame guide turns green; recording will start for the next word.": "عدّل وضعيتك حتى يصبح دليل الإطار أخضر؛ سيبدأ تسجيل الكلمة التالية.",
    "Sentence cleared.": "تم مسح الجملة.", "Add a word before copying.": "أضف كلمة قبل النسخ.", "Sentence copied to clipboard.": "تم نسخ الجملة.",
    "Sentence: {sentence}": "الجملة: {sentence}", "Audio playback isn't supported by this browser.": "هذا المتصفح لا يدعم تشغيل الصوت.",
    "Could not play the sentence audio.": "تعذر تشغيل صوت الجملة.", "History is already empty.": "السجل فارغ بالفعل.", "History cleared.": "تم مسح السجل.",
    "API running · local 166-class model": "واجهة API تعمل · النموذج المحلي من 166 فئة", "API running · Gemini second opinion enabled": "واجهة API تعمل · رأي Gemini الثاني مفعّل"
    ,"Person not in frame": "المؤدي غير ظاهر في الإطار", "Move into view so your face and both shoulders can be seen.": "تحرك إلى مجال الرؤية حتى يظهر وجهك وكتفاك.",
    "Show your face and shoulders": "أظهر وجهك وكتفيك", "Sit or stand comfortably, facing the camera, with both shoulders in view.": "اجلس أو قف بشكل مريح أمام الكاميرا مع إظهار الكتفين.",
    "Move a little toward the middle of the frame.": "تحرك قليلًا نحو منتصف الإطار.", "Step back a little so both shoulders fit in the frame.": "ابتعد قليلًا حتى يظهر الكتفان داخل الإطار.",
    "Step back a little from the camera.": "ابتعد قليلًا عن الكاميرا.", "Move a little closer to the camera.": "اقترب قليلًا من الكاميرا.",
    "Adjust the camera so your face and shoulders fit comfortably in the frame.": "عدّل الكاميرا حتى يظهر وجهك وكتفاك بوضوح داخل الإطار.",
    "Adjust your position": "عدّل وضعيتك", "You’re ready to sign": "أنت جاهز للإشارة",
    "Your face and shoulders are in view. Press Start sign when you’re ready.": "وجهك وكتفاك ظاهران. اضغط «بدء الإشارة» عندما تكون جاهزًا.",
    "Hold still for a moment while the camera checks the frame.": "اثبت لحظة بينما تتحقق الكاميرا من الإطار.",
    "The camera is not available in this browser.": "الكاميرا غير متاحة في هذا المتصفح.",
    "Remove history entry": "حذف العنصر من السجل", "Signova — an AI-assisted sign language translation interface.": "Signova — واجهة لترجمة لغة الإشارة بمساعدة الذكاء الاصطناعي."
  };
  let currentLanguage = (() => {
    try { return localStorage.getItem("signova-language") === "ar" ? "ar" : "en"; }
    catch { return "en"; }
  })();
  const originalTextNodes = new WeakMap();
  const originalAttributes = new WeakMap();
  function t(source, values = {}) {
    let output = currentLanguage === "ar" ? (arabicUi[source] || source) : source;
    for (const [key, value] of Object.entries(values)) {
      const localizedValue = typeof value === "string" && currentLanguage === "ar" ? (arabicUi[value] || value) : value;
      output = output.replaceAll(`{${key}}`, String(localizedValue));
    }
    return output;
  }
  function setText(element, source, values = {}) {
    if (!element) return;
    element.dataset.i18nSource = source;
    element.dataset.i18nValues = JSON.stringify(values);
    element.textContent = t(source, values);
  }
  function setEnglishText(element, source, values = {}) {
    if (!element) return;
    element.dataset.noTranslate = "true";
    delete element.dataset.i18nSource;
    delete element.dataset.i18nValues;
    let output = String(source);
    for (const [key, value] of Object.entries(values)) {
      output = output.replaceAll(`{${key}}`, String(value));
    }
    element.textContent = output;
  }
  function applyLanguage(language) {
    currentLanguage = language === "ar" ? "ar" : "en";
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest("[data-no-translate]")) continue;
      if (!originalTextNodes.has(node)) originalTextNodes.set(node, node.nodeValue);
      const source = originalTextNodes.get(node);
      const leading = source.match(/^\s*/)?.[0] || "";
      const trailing = source.match(/\s*$/)?.[0] || "";
      const content = source.trim();
      node.nodeValue = content ? `${leading}${t(content)}${trailing}` : source;
    }
    document.querySelectorAll("[data-i18n-source]").forEach(element => {
      let values = {};
      try { values = JSON.parse(element.dataset.i18nValues || "{}"); } catch { /* Ignore invalid interpolation data. */ }
      element.textContent = t(element.dataset.i18nSource, values);
    });
    document.querySelectorAll("[title], [aria-label], [placeholder]").forEach(element => {
      let sources = originalAttributes.get(element);
      if (!sources) { sources = {}; originalAttributes.set(element, sources); }
      for (const attribute of ["title", "aria-label", "placeholder"]) {
        const sourceKey = attribute === "aria-label" ? "i18nAriaSource" : attribute === "title" ? "i18nTitleSource" : "i18nPlaceholderSource";
        if (element.dataset[sourceKey] !== undefined) sources[attribute] = element.dataset[sourceKey];
        const value = element.getAttribute(attribute);
        if (value && sources[attribute] === undefined) sources[attribute] = value;
        if (sources[attribute] !== undefined) {
          let values = {};
          if (attribute === "aria-label" && element.dataset.i18nAriaValues) {
            try { values = JSON.parse(element.dataset.i18nAriaValues); } catch { /* Ignore invalid interpolation data. */ }
          }
          element.setAttribute(attribute, t(sources[attribute], values));
        }
      }
    });
    const languageToggle = document.querySelector("#languageToggle");
    if (languageToggle) {
      languageToggle.textContent = currentLanguage === "en" ? "Arabic" : "English";
      languageToggle.setAttribute("aria-label", t(currentLanguage === "en" ? "Switch to Arabic" : "Switch to English"));
      languageToggle.title = t(currentLanguage === "en" ? "Switch to Arabic" : "Switch to English");
    }
    document.title = t("Signova — Sign Language Translator");
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = t("Signova — an AI-assisted sign language translation interface.");
  }
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
    languageToggle: $("#languageToggle"), sidebarApiStatus: $("#sidebarApiStatus"),
    apiStatus: $("#apiStatus"), apiExpiryNotice: $("#apiExpiryNotice"), apiExpiryMessage: $("#apiExpiryMessage"),
    cameraVideo: $("#cameraVideo"), cameraStage: $("#cameraStage"), cameraStatus: $("#cameraStatus"),
    startCamera: $("#startCamera"), startSign: $("#startSign"), stopCamera: $("#stopCamera"),
    flipCamera: $("#flipCamera"), cameraOff: $("#cameraOff"), cameraHelp: $("#cameraHelp"),
    framingGuide: $("#framingGuide"), framingTitle: $("#framingTitle"), framingMessage: $("#framingMessage"),
    predictedWord: $("#predictedWord"), predictionDescription: $("#predictionDescription"),
    confidenceLabel: $("#confidenceLabel"), confidenceText: $("#confidenceText"), confidenceBar: $("#confidenceBar"), demoPrediction: $("#demoPrediction"),
    predictionSuggestions: $("#predictionSuggestions"),
    addWord: $("#addWord"), playSentence: $("#playSentence"), sentenceBox: $("#sentenceBox"), wordCount: $("#wordCount"),
    sentenceFeedback: $("#sentenceFeedback"), historyRows: $("#historyRows"),
    historyWordTotal: $("#historyWordTotal"), historySentenceTotal: $("#historySentenceTotal")
  };

  applyLanguage(currentLanguage);

  let toastTimer;
  let demoExpiresAt = null;
  let lastHealthError = false;
  let apiAddressMissing = false;
  let healthCheckPromise = null;

  const reconnectDelays = [2000, 5000, 10000, 20000];

  function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  function setApiStatus(source, values = {}) {
    setEnglishText(elements.apiStatus, source, values);
    setEnglishText(elements.sidebarApiStatus, source, values);
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
    if (demoExpiresAt === null && !lastHealthError) {
      elements.apiExpiryNotice.hidden = true;
      return;
    }
    if (apiAddressMissing) {
      elements.apiExpiryNotice.hidden = false;
      elements.apiExpiryNotice.classList.remove("expired");
      setText(elements.apiExpiryMessage, "This page has no API address. Open the connected Signova link from the latest deployment summary.");
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
      setText(elements.apiExpiryMessage, "The shared API is unavailable or waking up. Signova retries automatically during a prediction request.");
    } else if (secondsLeft > 0) {
      elements.apiExpiryNotice.classList.remove("expired");
      setText(elements.apiExpiryMessage, "Warning: the shared temporary API session ends in {time}. Finish any recording in progress.", { time: formatClock(secondsLeft) });
    } else {
      elements.apiExpiryNotice.classList.add("expired");
      setText(elements.apiExpiryMessage, "The temporary API session has ended. Its Quick Tunnel address cannot be restarted or discovered by this page; the stable auto-waking API link is needed for automatic recovery.");
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
      setApiStatus("API address missing · open the connected Signova link");
      elements.apiStatus.classList.remove("ready", "warning");
      elements.apiStatus.classList.add("error");
      return;
    }
    apiAddressMissing = false;
    if (healthCheckPromise) return healthCheckPromise;
    healthCheckPromise = (async () => {
      try {
        const response = await fetchWithReconnect(`${API_BASE}/health`, {}, () => {
          setApiStatus("Waking API · reconnecting automatically…");
          elements.apiStatus.classList.remove("ready", "error");
          elements.apiStatus.classList.add("warning");
        });
        if (!response.ok) throw new Error("API health check failed");
        const health = await response.json();
        if (health.status !== "ok" || !health.model_loaded || health.classes !== 166) {
          throw new Error("Model is not ready");
        }
        updateDemoExpiryFromHealth(health);
        const testAccuracy = health.test_accuracy == null ? NaN : Number(health.test_accuracy);
        if (Number.isFinite(testAccuracy) && testAccuracy < 0.20) {
          setApiStatus("API running · low test accuracy ({accuracy}%)", { accuracy: (testAccuracy * 100).toFixed(1) });
          elements.apiStatus.classList.remove("ready", "error");
          elements.apiStatus.classList.add("warning");
          return;
        }
        setApiStatus(health.gemini_enabled
          ? "API running · Gemini second opinion enabled"
          : "API running · local 166-class model");
        elements.apiStatus.classList.remove("error", "warning");
        elements.apiStatus.classList.add("ready");
      } catch (error) {
        lastHealthError = true;
        updateApiExpiryNotice();
        setApiStatus(requestedApi
          ? "API unavailable · automatic retry is ready"
          : "API not configured · open the connected Signova link");
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
  elements.languageToggle.addEventListener("click", () => {
    const nextLanguage = currentLanguage === "en" ? "ar" : "en";
    try { localStorage.setItem("signova-language", nextLanguage); } catch { /* Keep the language for this page only. */ }
    applyLanguage(nextLanguage);
    renderSentence();
    renderHistory();
    checkApiHealth();
  });

  let mediaRecorder = null;
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
      elements.cameraOff.disabled = false;
      elements.flipCamera.disabled = false;
      elements.flipCamera.title = t("Switch to the rear camera");
      setEnglishText(elements.cameraStatus, "Checking your position…");
      setEnglishText(elements.cameraHelp, typeof MediaRecorder === "undefined"
        ? "Camera preview is ready, but this browser cannot record. Upload a short sign video instead."
        : "Center your face and shoulders. Recording starts only when you press Start sign.");
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
        toast("The clip was too short. Press Start sign and try again.");
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
    setEnglishText(elements.cameraStatus, "Recording gesture...");
    setEnglishText(elements.cameraHelp, "Recording your sign... Press Stop when you are done.");
    elements.startSign.disabled = true;
    elements.stopCamera.disabled = false;
    elements.flipCamera.disabled = true;
    elements.cameraStage.dataset.framing = "recording";
    elements.framingGuide.dataset.state = "recording";
    setEnglishText(elements.framingTitle, "Recording your sign");
    setEnglishText(elements.framingMessage, "Keep the sign fully in view, then press Stop & predict.");
    toast("Sign recording started.");
    return true;
  }

  function startSignRecording() {
    if (!state.stream || (!state.isFramingReady && !state.manualPoseFallback) || state.isAnalyzing || state.currentPrediction) return;
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
      setEnglishText(elements.cameraStatus, "Checking your position…");
      elements.flipCamera.title = t(nextFacing === "user" ? "Switch to the rear camera" : "Switch to the front camera");
      startPoseGuide();
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

    elements.cameraVideo.srcObject = null;
    elements.cameraStage.classList.remove("camera-on");
    setEnglishText(elements.cameraStatus, "Camera off");
    elements.cameraStatus.parentElement.classList.remove("on");
    elements.startCamera.disabled = false;
    elements.startSign.disabled = true;
    elements.stopCamera.disabled = true;
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
  elements.stopCamera.addEventListener("click", finishSign);
  elements.flipCamera.addEventListener("click", flipCamera);
  elements.cameraOff.addEventListener("click", turnCameraOff);
  $("#flipHint").addEventListener("click", () => toast("Keep both hands visible and use steady lighting."));

  // ==================== ربط الباك إيند و Gemini ====================
  async function sendVideoFileToBackend(videoFile) {
    if (!API_BASE) {
      state.isAnalyzing = false;
      elements.addWord.disabled = true;
      elements.flipCamera.disabled = !state.stream;
      setEnglishText(elements.sentenceFeedback, "This page has no connected API address. Open the connected Signova link from the latest demo summary.");
      elements.startSign.disabled = !state.stream || (!state.isFramingReady && !state.manualPoseFallback);
      if (state.stream) {
        setEnglishText(elements.cameraStatus, "Prediction API offline");
        setEnglishText(elements.cameraHelp, "The recording is ready, but this page has no API address. Open the connected Signova link from the demo summary.");
        elements.framingGuide.dataset.state = "manual";
        elements.cameraStage.dataset.framing = "manual";
        setEnglishText(elements.framingTitle, "Prediction API offline");
        setEnglishText(elements.framingMessage, "Your recording could not be sent. Open the connected Signova link from the demo summary.");
      }
      toast("No connected prediction API address.");
      return;
    }
    const formData = new FormData();
    formData.append("file", videoFile, videoFile.name || "signova-upload.webm");

    setEnglishText(elements.sentenceFeedback, "Analyzing the sign with the AI model…");
    elements.addWord.disabled = true;
    state.isAnalyzing = true;
    elements.startSign.disabled = true;

    try {
      const response = await fetchWithReconnect(`${API_BASE}/api/predict`, {
        method: "POST",
        body: formData
      }, attempt => {
        setApiStatus("API waking or recovering · retry {attempt}/4", { attempt });
        elements.apiStatus.classList.remove("ready", "error");
        elements.apiStatus.classList.add("warning");
        setEnglishText(elements.sentenceFeedback, "The API is waking up or restarting. Retrying this prediction automatically…");
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(result.detail || "Prediction failed. Try a short video with the signer centered in frame.");
        error.status = response.status;
        throw error;
      }

      if (result && result.word) {
        lastHealthError = false;
        updateApiExpiryNotice();
        setApiStatus("API running · prediction received");
        elements.apiStatus.classList.remove("error", "warning");
        elements.apiStatus.classList.add("ready");
        showRealPrediction({
          word: result.word,
          confidence: Number.isFinite(result.confidence) ? result.confidence : 0,
          predictionSource: result.prediction_source || "local",
          originalLocalWord: result.original_local_word || result.word,
          poseCoverage: Number.isFinite(result.pose_coverage) ? result.pose_coverage : null,
          suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
          description: "Experimental Signova model output (166 classes)"
        });

        toast("Prediction received: {word}", { word: result.word });
      } else {
        throw new Error("The API returned no prediction. Try a clear, short recording.");
      }

    } catch (error) {
      console.error("Backend connection error:", error);
      const canRetryAutomatically = error.status == null || isTransientStatus(error.status);
      const backendDetail = String(error?.message || "");
      const signerMissing = error.status === 422
        || /no signer was clearly visible|no person pose was detected/i.test(backendDetail);
      if (canRetryAutomatically) {
        lastHealthError = true;
        updateApiExpiryNotice();
        setApiStatus("API unavailable · automatic recovery will retry on the next request");
        elements.apiStatus.classList.remove("ready", "warning");
        elements.apiStatus.classList.add("error");
      }
      let failureMessage = error.message;
      let toastMessage = failureMessage;
      if (signerMissing) {
        failureMessage = "No signer was clearly visible in enough frames. Face the camera and keep your shoulders and both arms in frame. For a saved clip, upload the original video instead of filming a screen.";
        toastMessage = "No signer detected. Show the sign directly to the camera or upload the original video.";
      } else if (error.name === "AbortError") {
        failureMessage = "The API request timed out. Try a shorter recording.";
        toastMessage = failureMessage;
      } else if (error.status == null) {
        failureMessage = "The prediction service could not be reached. Check the API session and your internet connection.";
        toastMessage = "The prediction API could not be reached. Check the API link and your internet connection.";
      } else if (error.status >= 500) {
        failureMessage = backendDetail || "The API could not process this video. Try a short MP4 or WebM clip with the signer clearly visible.";
        toastMessage = "The API could not analyze this clip. Try a short MP4 or WebM video.";
      }
      setEnglishText(elements.sentenceFeedback, "Prediction failed: {detail}", { detail: failureMessage });
      toast(toastMessage);
      state.isAnalyzing = false;
      elements.flipCamera.disabled = !state.stream;
      elements.startSign.disabled = !state.stream || (!state.isFramingReady && !state.manualPoseFallback);
      if (state.stream) {
        setEnglishText(elements.cameraStatus, "Ready to try again");
        setEnglishText(elements.cameraHelp, signerMissing
          ? "No signer was detected. Face the camera and perform the sign yourself, or upload the original video file. Filming a screen is not supported."
          : "The clip was not analyzed. Correct the camera framing if needed, then record again; temporary API failures are retried automatically.");
        elements.framingGuide.dataset.state = state.isFramingReady ? "ready" : "adjust";
        elements.cameraStage.dataset.framing = state.isFramingReady ? "ready" : "adjust";
        setEnglishText(elements.framingTitle, "Prediction unavailable");
        setEnglishText(elements.framingMessage, signerMissing
          ? "Show the signer in the camera, or upload the original video file."
          : canRetryAutomatically
          ? "Try recording the sign again; Signova retries automatically when the API is waking or restarting."
          : "Prediction failed. Try a short video with the signer centered in frame.");
      }
    }
  }

  function renderPredictionSuggestions(suggestions, selectedWord) {
    if (!elements.predictionSuggestions) return;
    const list = elements.predictionSuggestions.querySelector(".suggestion-list");
    if (!list) return;
    list.replaceChildren();
    const candidates = suggestions.filter(item => item && typeof item.word === "string").slice(0, 3);
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
        setEnglishText(elements.predictionDescription, "You selected this word from the model's three suggestions. Check it before adding.");
        list.querySelectorAll(".suggestion-option").forEach(option => {
          option.setAttribute("aria-pressed", String(option === button));
        });
      });
      list.append(button);
    });
  }

  function showRealPrediction(prediction) {
    state.currentPrediction = prediction;
    elements.predictedWord.textContent = prediction.word;
    const secondOpinionChangedWord = prediction.predictionSource === "gemini_second_opinion"
      && prediction.originalLocalWord && prediction.originalLocalWord.toLowerCase() !== prediction.word.toLowerCase();
    const sourceNote = secondOpinionChangedWord
      ? "Gemini suggested an alternative. The score below belongs to the local model's original guess."
      : prediction.predictionSource === "gemini_second_opinion"
        ? "Gemini returned the same word; the score below is from the local model."
        : "Experimental Signova model output (166 classes)";
    const descriptionSource = prediction.poseCoverage === null
      ? "{source} Review the suggestions if the word looks wrong."
      : "{source} Person visible in {coverage}% of sampled frames. Review the suggestions if the word looks wrong.";
    setEnglishText(elements.predictionDescription, descriptionSource, { source: sourceNote, coverage: prediction.poseCoverage });
    setEnglishText(elements.confidenceLabel, secondOpinionChangedWord ? "Local score for original guess" : "Local model score");
    setEnglishText(elements.sentenceFeedback, "Prediction received: {word}. Review it, then press Done to add it.", { word: prediction.word });
    renderPredictionSuggestions(prediction.suggestions || [], prediction.word);
    const confidence = Math.max(0, Math.min(100, Number(prediction.confidence) || 0));
    elements.confidenceText.textContent = `${confidence}%`;
    elements.confidenceBar.style.width = `${confidence}%`;
    elements.addWord.disabled = false;
    state.isAnalyzing = false;
    elements.startSign.disabled = true;
    elements.flipCamera.disabled = true;
    if (state.stream) {
      setEnglishText(elements.cameraStatus, "Prediction ready · Press Done");
      setEnglishText(elements.cameraHelp, "Review the word, then press Done to continue.");
      elements.framingGuide.dataset.state = "ready";
      elements.cameraStage.dataset.framing = "ready";
      setEnglishText(elements.framingTitle, "Prediction ready");
      setEnglishText(elements.framingMessage, "Review the word, then press Done to continue.");
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
    setText(elements.wordCount, count === 1 ? "{count} word" : "{count} words", { count });
    elements.playSentence.disabled = count === 0 || !("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function";
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
      if (state.isFramingReady || state.manualPoseFallback) {
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
    const sentence = state.sentence.map(entry => entry.word).join(" ");
    if (!sentence) { toast("Add a word before copying."); return; }
    try {
      await navigator.clipboard.writeText(sentence);
      toast("Sentence copied to clipboard.");
    } catch {
      toast(`Sentence: ${sentence}`);
    }
  });

  elements.playSentence.addEventListener("click", () => {
    const sentence = state.sentence.map(entry => entry.word).join(" ");
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
