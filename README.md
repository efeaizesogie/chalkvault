# Chalkvault

**Report-card comments written by AI on the teacher's own laptop. Student names never leave the device.**

Teachers write hundreds of report comments a term, and many already paste student notes into chatbots to cope. Many school districts ban this, because FERPA and student-privacy rules forbid sending identifiable student information to outside AI tools. Chalkvault gives teachers the same help without the privacy risk:

- **Real names and blunt notes go in. A warm, specific comment comes out**, written by **Gemini Nano inside Chrome** through Firebase AI Logic's hybrid inference. It works with Wi-Fi off.
- **Photographed gradebook notes** are read on-device (text + image input).
- **Structured output:** strength, growth area and next step as JSON, put together into an editable comment in the chosen tone and reading level.
- **Batch the whole class** on-device at $0 per comment.
- **Cloud only for non-identifying work.** Parent translations (Yoruba, Hausa, Igbo, Spanish, …) and alignment to curriculum standards go to cloud Gemini, but only after every name on the roster is replaced locally. The teacher sees exactly what will leave the device before it's sent, and the name is put back in locally afterwards.
- **A ledger** of every AI request shows where it ran and how many characters, if any, were sent.
- Export to the clipboard, CSV or PDF. All data lives in IndexedDB in the teacher's browser, with no account and no sync.

## How the hybrid inference works

`src/lib/ai.ts`

| Task | Firebase AI Logic mode | What it sees |
|---|---|---|
| Write a comment (single or batch) | `PREFER_ON_DEVICE`, with `responseConstraint` JSON schema on-device and `responseSchema` in the cloud | **On-device:** real name, raw notes, photo. **Cloud fallback** (no Nano, teacher allowed it): the de-identified notes only; photos are refused. |
| Parent translation | `ONLY_IN_CLOUD` | The finished comment with `[STUDENT]` / `[CLASSMATE A]` placeholders |
| Align to standards | `ONLY_IN_CLOUD` (JSON output) | Same de-identified comment |

**Privacy router:** before each comment, Chalkvault checks `LanguageModel.availability()` with the same options the SDK uses.
- If Gemini Nano is available, the SDK runs the request on-device, and the real name is used.
- Otherwise Chalkvault de-identifies the notes locally (`src/lib/redact.ts`) before the request is built. Whichever way the SDK routes it, no name can leave the device.
- The teacher can switch the cloud fallback off completely.

Every result carries a visible **On this device** or **Cloud · names removed** stamp, taken from the SDK's `inferenceSource`.

Prompts are capped at 2,400 characters of notes plus a 1024px JPEG, well within Gemini Nano's 9,216-token limit.

## Run it

```bash
npm install
npm run dev     # http://localhost:5178
```

1. Create a Firebase project. Enable **Firebase AI Logic** with the Gemini Developer API and register a web app.
2. Copy `.env.example` to `.env.local` and fill in the web config and your App Check (reCAPTCHA Enterprise) site key. For GitHub Pages, add the same `VITE_*` values as repository secrets; the deploy workflow passes them to the build.
3. On localhost, App Check uses a debug token. Copy the token printed in the console into Firebase console → App Check → Manage debug tokens.

To get on-device inference, use desktop Chrome with Gemini Nano:
- Chrome 139+ with these flags enabled:
  - `chrome://flags/#prompt-api-for-gemini-nano`
  - `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
  - `chrome://flags/#optimization-guide-on-device-model`
- Hardware: 22 GB free disk, and 16 GB RAM or a GPU with more than 4 GB VRAM.
- Click the status chip in the app to download the model.

Without Nano, Chalkvault still works through the names-removed cloud path.

## Stack

Vite + TypeScript + React, Firebase JS SDK v13 (`firebase/ai`, `firebase/app-check`), `idb`. Design notes are in [DESIGN.md](DESIGN.md).

## License

Apache-2.0
