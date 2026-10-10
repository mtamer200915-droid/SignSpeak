# SignSpeak Front-End — Dark AI

A responsive, multi-page-feeling frontend prototype for SignSpeak, built with plain HTML, CSS, and JavaScript. It does not require React, npm, or a backend to preview the UI.

## Pages
- **Home:** project overview and shortcuts
- **Translator:** camera preview, clearly labeled sample predictions, sentence builder
- **History:** words added during the current page session
- **About:** project overview and future integration plan

## Important demo limitations
- The sample predictions are simulated and are not AI results.
- The camera preview is local to the browser tab. This demo does not upload frames.
- No backend endpoint or model is assumed.
- History exists in memory only and resets when the page is reloaded.
- `getUserMedia` camera access usually requires `localhost` or HTTPS.

## Run in VS Code (recommended)
1. Extract this folder somewhere convenient, for example:
   `F:\sign language data\SignSpeak\frontend`
2. In VS Code choose **File → Open Folder...** and select that `frontend` folder.
3. Install the **Live Server** extension if you do not already have it.
4. Open `index.html`.
5. Right-click inside the editor and select **Open with Live Server**.
6. In the browser, open **Translator** and click **Start camera**. Allow permission when prompted.
7. Click **Try sample prediction**, then **Add word** to test sentence building and History.

If you do not want to install Live Server, you can start a local static server from the folder with Python:
```powershell
py -m http.server 5500
```
Then open `http://localhost:5500` in your browser.

## When your teammate's backend is ready
Ask them for:
1. Backend framework and local base URL (for example, a FastAPI or Flask server URL).
2. Prediction endpoint and HTTP method.
3. Request format: individual image/frame, a sequence of frames, or extracted landmarks/features.
4. Response JSON shape, including the predicted word and confidence if available.
5. CORS configuration and whether the endpoint accepts requests from the frontend's local origin.

Then replace the clearly marked sample-prediction flow in `app.js` with a `fetch()` call that follows the agreed API contract. Do not guess the endpoint or request/response schema before the backend team confirms them.
