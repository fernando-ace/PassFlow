# PassFlow

PassFlow is a privacy-first visual access-control system for small businesses. It is being built for the Ring track of the Amazon App Dev Challenge.

This repository covers a focused visual-credential flow: connect to a Ring live-view session, create a signed temporary pass, recognize its QR value in sampled video frames, and verify the credential on the server.

PassFlow began from Amazon's official [Ring API Hello World](https://github.com/AmazonAppDev/ring-api-helloworld) sample. The Ring integration remains the authoritative foundation; the product UI and client state are kept separate from the server-side Ring routes.

## Current milestone

```text
Ring Developer Playground token
        ↓
server-side Ring authentication
        ↓
Ring device discovery
        ↓
WHEP/WebRTC session
        ↓
PassFlow live camera
        ↓
browser-side QR recognition
        ↓
server-side signature and validity verification
```

The QR contains only a signed PassFlow token. The signing secret and all trust decisions remain server-side. Person detection, identity recognition, entrants, tailgating analysis, and lock control are intentionally outside this milestone.

## Architecture

- **Next.js 15 App Router + TypeScript** provides the application and API routes.
- **`lib/auth.ts`** reads Ring credentials only on the server and supports direct Playground access tokens plus optional refresh-token OAuth.
- **`app/api/ring/devices`** discovers devices and normalizes the Ring response for the UI.
- **`app/api/ring/stream`** creates and closes Ring WHEP sessions. The access token never enters client code.
- **`app/hooks/useRingDevice.ts`** manages browser-side discovery state without handling credentials.
- **`app/hooks/useWebRTCStream.ts`** manages the peer connection, SDP exchange, video attachment, errors, and cleanup.
- **`lib/credentials/`** creates and verifies versioned HMAC-SHA256 credentials with explicit validity windows.
- **`app/api/credentials`** creates signed credentials; **`app/api/credentials/verify`** returns one of five explicit verification statuses.
- **`lib/video-processors/qrDecoder.mjs`** is the shared local QR decoder used by both Ring frames and the development harness.
- **`lib/video-processors/qrCredentialProcessor.ts`** turns decoded values into processor results and applies an 8-second, per-value duplicate cooldown before verification.
- **`lib/credentials/verifyQrCredential.ts`** classifies non-PassFlow QR values locally and sends signed PassFlow values to the server verification route. Both the Ring path and development harness use it.

## Requirements

- Node.js 18 or newer
- npm
- A Ring account with an eligible device available to the Ring Developer Playground
- A current Ring Developer Playground access token
- A modern browser with WebRTC support

## Install

From PowerShell:

```powershell
git clone <your-passflow-repository-url> PassFlow
Set-Location PassFlow
npm install
Copy-Item .env.example .env.local
```

If you already have this project directory, run only:

```powershell
npm install
Copy-Item .env.example .env.local
```

On macOS or Linux, replace the last command with `cp .env.example .env.local`.

## Obtain a Ring Developer Playground token

1. Sign in to the [Ring Developer Playground](https://developer.amazon.com/ring/console/playground).
2. Generate an access token.
3. Copy the token immediately; Playground tokens are short-lived.
4. Open `.env.local` and set:

```dotenv
RING_ACCESS_TOKEN=replace_with_your_real_playground_token
PASSFLOW_SIGNING_SECRET=replace_with_a_random_secret_of_at_least_32_characters
```

Do not prefix either variable with `NEXT_PUBLIC_`. PassFlow reads both values only from server-side code. You can generate a signing secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The tracked `.env.example` contains placeholders only. `.env.local`, `.env`, and `.env.*.local` are ignored by Git.

## Start PassFlow

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify device discovery

After the page loads:

1. The Ring device area initially displays **Discovering device**.
2. PassFlow calls its server-side `/api/ring/devices` route.
3. The first device associated with the token should appear by name.
4. Its Ring-reported state should display as **Online** or **Offline**.

If no device appears, check the message beside the camera and in the Ring device area. Confirm that the token belongs to the expected Ring account and that the device is available in the Playground.

For a direct local API check while the development server is running:

```powershell
Invoke-RestMethod http://localhost:3000/api/ring/devices
```

The response should contain a non-empty `devices` array. It must never contain the access token.

## Start Ring live video

1. Wait for device discovery to finish.
2. Confirm the selected device is online.
3. Select **Start Live View**.
4. PassFlow creates a browser WebRTC offer, sends the SDP to its server-side stream route, and exchanges it with Ring's WHEP endpoint.
5. When the session is established, the Ring stream appears in the Live camera frame.
6. Select **Stop Live View** to close the peer connection and Ring session.

Browser autoplay rules are handled by using a muted inline video element. Ring live verification still requires a real token, account, device, and network path.

## Token expiration

Playground tokens expire. When Ring responds with an authorization error, PassFlow reports that the token was rejected instead of silently retrying with invalid credentials.

To recover:

1. Generate a fresh token in the Ring Developer Playground.
2. Replace `RING_ACCESS_TOKEN` in `.env.local`.
3. Stop and restart `npm run dev`.
4. Reload PassFlow and verify discovery again.

Do not configure `RING_ACCESS_TOKEN` and `RING_REFRESH_TOKEN` at the same time.

## Optional refresh-token support

The sample's server-side OAuth refresh flow is preserved for future use:

```dotenv
# Remove or comment out RING_ACCESS_TOKEN first.
RING_REFRESH_TOKEN=replace_with_refresh_token
RING_CLIENT_ID=replace_with_client_id
RING_CLIENT_SECRET=replace_with_client_secret

# Optional in refresh-token mode:
# RING_DEVICE_ID=replace_with_device_id
# RING_DEVICE_NAME=Front Door
```

Production OAuth and account linking are outside the current milestone.

## Validation

```powershell
npm test
npx tsc --noEmit
npm run build
```

`npm test` is self-contained and uses a test-only signing secret. It covers credential generation and verification for valid, expired, not-yet-valid, modified-payload, invalid-signature, malformed-token, and missing-field cases. It also exercises the shared QR decoder with PassFlow and non-PassFlow values plus per-credential duplicate suppression and processor reset behavior.

The older `npm run check:credentials` integration check remains available when a development server is running with `PASSFLOW_SIGNING_SECRET` configured. `npm run check:qr` remains as a small standalone debounce smoke check.

## Development-only QR harness

Run `npm run dev`, then open [http://localhost:3000/dev/qr-harness](http://localhost:3000/dev/qr-harness).

The harness is available only while `NODE_ENV=development`; production builds return a 404 for this route. It is deliberately separate from `LiveCamera` and never substitutes a webcam, image, mock, or prerecorded file for Ring streaming.

The harness supports:

- server-generated signed PassFlow QR codes with valid, expired, and not-yet-valid windows;
- local static PNG, JPEG, and WebP QR images;
- local prerecorded videos containing stationary or moving QR codes, sampled at 2 FPS;
- generated non-PassFlow QR codes; and
- an immediate repeated scan that records the first decision and confirms the duplicate is suppressed.

Static images and video files remain local to the browser. Every source passes through the same `QrCredentialProcessor` decoder and duplicate guard as Ring video. Every new PassFlow value then passes through the same server verification request used by `LiveCamera`.

## Verification status

### Verified without Ring hardware

- Signed credential generation keeps `PASSFLOW_SIGNING_SECRET` on the server.
- HMAC signature checking rejects modified payloads and invalid signatures.
- Required credential fields and validity windows are validated.
- Verification returns distinct `valid`, `expired`, `not-yet-valid`, `malformed`, and `invalid-signature` states.
- Generated PassFlow QR values and ordinary non-PassFlow QR values decode through the shared decoder.
- Frame processing runs at 2 FPS, suppresses repeat decisions for the same value for 8 seconds, and resets processor state when processing stops.
- The development harness exercises generated QR codes, static QR images, local prerecorded QR video, non-PassFlow values, and repeated detections without changing the Ring stream architecture.
- Ring access tokens and signing secrets remain server-only; no `NEXT_PUBLIC_` secret variables are used.

### Verified through the development harness

- A generated active PassFlow QR decodes and produces **Access granted** after server verification.
- Generated expired and not-yet-valid passes produce their explicit denied states.
- A non-PassFlow QR produces **Invalid credential** without being sent to the credential API.
- Scanning the same generated credential twice immediately emits one decision and suppresses the duplicate.
- Local static QR images use the shared decoder and verification flow.
- Local prerecorded video is sampled by the same 2 FPS processor used for Ring video, including moving QR frames and duplicate suppression.

These harness checks validate the QR and credential pipeline only. They are not evidence that a physical Ring camera can resolve a phone-displayed QR through its real optics, compression, lighting, motion, WebRTC transport, and stream resolution.

### Still unverified: physical Ring camera in the loop

The following acceptance path remains explicitly unverified until a physical Ring device is available:

```text
phone QR → Ring camera → Ring WebRTC stream → QR decode → credential verification → GRANTED / DENIED
```

The Playground's prerecorded video cannot satisfy this acceptance test, and the development harness must not be used as a substitute.

## Future physical-device verification steps

1. Configure a current `RING_ACCESS_TOKEN` and a server-only `PASSFLOW_SIGNING_SECRET`, then restart `npm run dev`.
2. Load PassFlow on a computer, confirm that the intended physical Ring device is discovered, and start its real live view.
3. On a phone, open PassFlow and generate a currently valid signed pass for the selected door.
4. Set the phone brightness high enough for the QR to be clear, hold the full QR inside the physical Ring camera view, and vary distance/angle only as needed for focus.
5. Confirm the QR bounding box appears on the actual Ring WebRTC video and that the UI changes once to **Access granted** with the correct visitor and location.
6. Keep the same QR in view and confirm the 8-second duplicate cooldown prevents a decision on every sampled frame; after the cooldown, confirm a deliberate rescan can be processed again.
7. Repeat with generated expired and not-yet-valid passes and confirm the explicit **Expired** and **Not yet valid** denied states.
8. Present a non-PassFlow QR and a visibly modified/invalid PassFlow QR and confirm both are denied gracefully without exposing tokens or secrets.
9. Stop live view and confirm the Ring session, animation loop, frame canvas, pending verification request, and processor debounce state are cleaned up.
10. Record the physical device model, lighting, phone, distance, orientation, time-to-decision, and any decode failures. Only after these checks pass should the camera-in-the-loop milestone be marked verified.

## Current limitations

- A live physical Ring account and device are still required for camera-in-the-loop QR acceptance. This is not yet verified.
- Playground tokens are short-lived and must be replaced manually.
- PassFlow currently selects the first discovered device.
- There is no device picker.
- Playground video is prerecorded, so the generated QR cannot be physically presented to that synthetic feed. Final camera-in-the-loop acceptance requires a real Ring camera pointed at the displayed pass.
- There is no person detection, tailgating detection, database, account system, smart-lock control, payment flow, or production deployment.

## Video-processing extension point

The frame processor contracts and registry are intentionally retained for future work. See [docs/video-processors.md](docs/video-processors.md).

## Exact next milestone

**Camera-in-the-loop credential acceptance with a physical Ring device.**

Display a generated PassFlow QR on a phone to a real Ring camera and confirm the complete create → Ring WebRTC → recognize → securely verify → granted/denied path. Do not begin person detection or anti-tailgating work until that acceptance test passes.

## License

[MIT](LICENSE)
