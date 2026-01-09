# RadAssist v0.9.7

A production-quality AI-powered web application for radiology reporting with server-side speech recognition and LLM-powered report generation, built with Next.js and TypeScript.

## What's New in v0.9.7

- **Rebranding**: Application renamed from "BefundTool" to "RadAssist"
- **Firebase Integration**: Optional Firebase backend for persistent storage of templates and system prompts
- **KI-Konfiguration (Admin Panel)**: Password-protected admin interface for editing system prompts
- **Template Persistence**: Templates now saved to Firebase (with localStorage fallback)
- **Environment Variables**: Firebase configuration via environment variables for easy deployment
- **Fallback Architecture**: Graceful degradation when Firebase is not configured

## What's New in v0.5

- **Server-Side ASR**: Google Cloud Speech-to-Text API for high-quality transcription
- **LLM Report Generation**: OpenAI-powered final report generation with structured output
- **Dual ASR Mode**: Switch between browser (Web Speech API) and server (Google Cloud) ASR
- **Debug Page**: Environment variable status checker at `/debug`
- **Robust Error Handling**: All API responses are JSON with proper error structures
- **Cursor Insertion**: ASR results insert at cursor position, not appended
- **Spoken Punctuation**: German spoken words converted to punctuation marks
- **Highlight Editing**: Click on highlighted text to edit, auto-unwraps mark tags

## Features

### Core Functionality
- **Server-Side Speech-to-Text**: Google Cloud Speech-to-Text with phrase biasing
- **Browser Speech-to-Text**: Fallback using Web Speech API (de-CH)
- **LLM Report Generation**: OpenAI GPT-4o-mini for structured radiology reports
- **Auto-Template Suggestion**: Automatically suggests best template based on content
- **Template Lock/Unlock**: Manual template selection with lock mechanism
- **Pathology Highlights**: Transcript-derived findings wrapped in `<mark class="hl">`

### User Interface
- **Report Tab**: Dictation, template selection, and final report editor
- **Template Editor Tab**: Edit templates with overlays and chooser keywords
- **Debug Page**: `/debug` shows environment variable status (dev only)
- **Warning Banner**: Clear warning that this is demo-only, no PHI/patient data

## Technology Stack

- **Next.js 13** (App Router)
- **TypeScript**
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **@google-cloud/speech** for server-side ASR
- **OpenAI SDK** for LLM report generation
- **Web Speech API** for browser-based fallback ASR
- **localStorage** for template and settings persistence

## Deployment to Vercel

### Quick Deploy

1. Push your code to GitHub
2. Import project in Vercel
3. Add Environment Variables in Vercel Project Settings:
   - `OPENAI_API_KEY` (required for LLM features)
   - `GOOGLE_CLOUD_PROJECT_ID` (optional, for server ASR)
   - `GOOGLE_SERVICE_ACCOUNT_JSON` (optional, for server ASR)
4. Deploy

**Important**:
- Set environment variables in **both Production and Preview** environments
- Do NOT paste API keys into the UI or commit them to the repository
- The app works in fallback mode without `OPENAI_API_KEY` (deterministic report generation)

### Check Deployment

Visit `/api/version` to verify deployment version and commit SHA.

## Environment Variables

### Required for LLM Report Generation

```bash
OPENAI_API_KEY=sk-...
```

### Optional for Server ASR

```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

### Setting GOOGLE_SERVICE_ACCOUNT_JSON

The service account JSON must be a single-line JSON string. Private key newlines should be escaped as `\n`.

**Option 1**: Copy from Google Cloud Console
1. Go to IAM & Admin > Service Accounts
2. Create or select a service account with Cloud Speech-to-Text API access
3. Create a JSON key
4. Minify the JSON (remove newlines) or escape them

**Option 2**: Using jq to minify
```bash
cat service-account.json | jq -c . > service-account-minified.json
```

**Option 3**: Base64 encode (alternative)
```bash
cat service-account.json | base64 | tr -d '\n'
```

**Newline Issue**: If your private_key contains `\\n` (double-escaped), the API route normalizes this to `\n` automatically.

### Local Development

Create a `.env.local` file:

```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
OPENAI_API_KEY=sk-...
```

## Browser Requirements

### For Server ASR (Recommended)
- Any modern browser with MediaRecorder support
- Google Chrome (recommended)
- Firefox, Safari, Edge

### For Browser ASR (Fallback)
- Google Chrome (recommended)
- Microsoft Edge
- Safari

**Note**: Firefox does not support the Web Speech API for browser-based ASR.

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Google Cloud account with Speech-to-Text API enabled
- OpenAI API key (optional, falls back to deterministic generation)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd befundtool-mvp
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

6. Check environment status at [http://localhost:3000/debug](http://localhost:3000/debug)

### Build for Production

```bash
npm run build
npm start
```

## API Routes

### GET /api/version

Returns application version and deployment information.

**Response**: JSON
```json
{
  "ok": true,
  "version": "0.7.2",
  "commit": "abc123..."
}
```

### POST /api/asr

Transcribes audio using Google Cloud Speech-to-Text.

**Request**: `multipart/form-data`
- `audio`: Audio file (webm/opus preferred)
- `hints`: JSON array of phrase hints (optional)
- `language`: Language code (default: `de-CH`)

**Response**: JSON
```json
{ "ok": true, "transcript": "transcribed text" }
// or
{ "ok": false, "error": { "message": "...", "name": "..." }, "transcript": "" }
```

### POST /api/process-report

Generates final report using OpenAI.

**Request**: JSON
```json
{
  "studyName": "CT Abdomen",
  "templateName": "CT Abdomen Standard",
  "normalBefundText": "Normal findings...",
  "clinicalData": { "indication": "...", "technik": "..." },
  "transcriptText": "Dictated findings..."
}
```

**Response**: JSON
```json
{ "ok": true, "finalReportHtml": "<div>...</div>" }
// or with fallback
{ "ok": true, "finalReportHtml": "...", "usedFallback": true, "note": "..." }
// or error
{ "ok": false, "error": { "message": "...", "name": "..." }, "finalReportHtml": "" }
```

## Testing the API Routes Locally

### Test /api/asr

```bash
# Create a test audio file first, then:
curl -X POST http://localhost:3000/api/asr \
  -F "audio=@test.webm" \
  -F "language=de-CH"
```

### Test /api/process-report

```bash
curl -X POST http://localhost:3000/api/process-report \
  -H "Content-Type: application/json" \
  -d '{
    "studyName": "CT Abdomen",
    "templateName": "Test",
    "normalBefundText": "Normalbefund.",
    "clinicalData": { "indication": "Test" },
    "transcriptText": "Leber unauffällig."
  }'
```

## Usage Guide

### Dictation Panel
1. Select **Server** (S) or **Browser** (B) ASR mode using the toggle
2. Click **Server** or **Diktat** to begin recording
3. Speak clearly in German-Swiss
4. Click **Stop** to end recording
5. Server ASR: Shows "Transkribiere..." while processing
6. Result inserts at cursor position in transcript editor
7. Edit the transcript as needed

### ASR Mode Toggle
- **S** (Server): Uses Google Cloud Speech-to-Text (recommended)
- **B** (Browser): Uses Web Speech API (fallback)

### Template Selection
- **Auto-Suggest** (default ON): Automatically selects best matching template
- **Top-3 Suggestions**: Shows top 3 templates with confidence scores
- **Manual Selection**: Choose template from dropdown (locks selection)
- **Lock/Unlock**: Click lock icon to unlock auto-suggestion

### Process Report
1. Select a **Study** and **Template**
2. Enter or dictate transcript text
3. Click **Verarbeiten** to generate the final report
4. Report appears with highlighted sections from transcript

### Final Report
- Editable with formatting toolbar (Bold, Italic, Underline)
- Click highlighted text to position cursor there
- Editing highlighted text unwraps the highlight
- Click **Kopieren** to copy plain text version

### Worterbuch (Dictionary)
- Add correction entries: wrong -> correct
- Entries are used as ASR phrase hints
- Apply corrections with "Normalisieren" button
- Server ASR applies corrections automatically

## Project Structure

```
befundtool-mvp/
├── app/
│   ├── page.tsx              # Main application component
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles
│   ├── debug/
│   │   └── page.tsx          # Debug page for env status
│   └── api/
│       ├── asr/
│       │   └── route.ts      # Google Cloud Speech API
│       ├── process-report/
│       │   └── route.ts      # OpenAI report generation
│       └── debug/
│           └── route.ts      # Env status API
├── components/
│   ├── ContentEditableEditor.tsx  # Rich text editor
│   └── ui/                   # shadcn/ui components
├── hooks/
│   ├── useSpeechRecognition.ts  # Browser ASR hook
│   └── useRecording.ts       # Server ASR hook
├── lib/
│   ├── types.ts              # TypeScript type definitions
│   ├── storage.ts            # localStorage utilities
│   ├── safeFetch.ts          # Safe JSON fetch utility
│   ├── reportProcessor.ts    # Local report processing
│   └── textProcessing.ts     # Text correction utilities
├── package.json
├── tsconfig.json
└── README.md
```

## Security & Privacy

**IMPORTANT**: This is a demo application for development/testing purposes only.

- **DO NOT use with real patient data (PHI)**
- **DO NOT use in production medical environments**
- Reports and templates stored in browser localStorage only
- Audio is sent to Google Cloud for transcription
- Transcript is sent to OpenAI for report generation
- API keys are server-side only, never exposed to client

## Troubleshooting

### ASR Not Working (Server Mode)
- Check `/debug` page for environment variable status
- Ensure `GOOGLE_CLOUD_PROJECT_ID` is set
- Ensure `GOOGLE_SERVICE_ACCOUNT_JSON` is valid JSON
- Check that the service account has Speech-to-Text API access

### ASR Not Working (Browser Mode)
- Ensure you're using Chrome, Edge, or Safari
- Check browser permissions for microphone access
- Firefox is not supported

### Report Generation Shows Fallback
- Check `/debug` page for `OPENAI_API_KEY` status
- If missing, deterministic fallback is used
- Check API key is valid and has credits

### "Unexpected end of JSON input" Error
- This has been fixed in v0.5+
- All API routes always return valid JSON
- Client uses safe fetch with proper error handling

### Build Errors
- Ensure Node.js version is 18 or higher
- Delete `node_modules` and `.next` folders
- Run `npm install` again
- Run `npm run build`

## License

This is a demonstration/educational project.

## Support

For issues or questions, please open an issue in the GitHub repository.
