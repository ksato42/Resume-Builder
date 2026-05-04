ResumeForge Studio
ResumeForge Studio is a locally runnable resume builder. The application helps students store their experience once, create tailored resume versions for different roles, receive AI-assisted writing suggestions, and export a print-ready resume as a PDF.

Project Structure

resume-builder/
├── server.js
├── index.html
├── package.json
├── public/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── app.js
└── artifacts/
    ├── lighthouse-desktop-final.report.html
    ├── lighthouse-desktop-final.report.json
    └── LIGHTHOUSE_SUMMARY.md


How To Run

1. Install dependencies:

npm install

2. Create a `.env` file in the project root:

GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
PORT=3000

3. Start the server:

npm start

4. Open the app in your browser:

http://localhost:3000