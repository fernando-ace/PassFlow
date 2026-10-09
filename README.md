# PassFlow

PassFlow is a privacy-first visual access-control system for small businesses. It is being built for the Ring track of the Amazon App Dev Challenge.

This repository covers a focused visual-access flow: connect to a Ring live-view session, verify a signed QR credential, detect and track people locally in sampled video frames, infer entrance events using either a directional boundary or a sustained close approach followed by full door-side departure, and classify authorized, possible-tailgating, and unauthorized entry events.

PassFlow began from Amazon's official [Ring API Hello World](https://github.com/AmazonAppDev/ring-api-helloworld) sample. The Ring integration remains the authoritative foundation; the product UI and client state are kept separate from the server-side Ring routes.

## Current milestone

```text
Ring Developer Playground token (fallback)
        ↓
server-side Ring authentication and durable Private App credentials
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
        ↓
12-second authorized-entry window
        ↓
browser-side person detection and short-term tracking
        ↓
directional entrance-boundary crossing
        ↓
authorized / possible tailgating / unauthorized
```

The QR contains only a signed PassFlow token. The signing secret and credential trust decisions remain server-side. Person detection runs in the browser and returns only person boxes, confidence, anonymous short-lived track IDs, and crossing events. PassFlow does not perform facial recognition, biometric identification, or identity matching.

## Architecture

- **Next.js 15 App Router + TypeScript** provides the application and API routes.
- **`lib/auth.ts`** keeps Playground credentials separate and refreshes durable Ring Private App credentials for device calls.
- **`app/api/ring/token`** exchanges Ring's one-way account-link authorization code and persists encrypted, unclaimed credentials.
- **`app/ring/link`** authenticates the configured PassFlow owner, validates Ring's timestamped HMAC nonce, and completes Ring's integration handshake.
- **`app/api/webhook`** validates Ring's raw-body HMAC signature before processing events and broadcasting SSE updates.
- **`app/api/ring/devices`** discovers devices and normalizes the Ring response for the UI.
- **`app/api/ring/stream`** creates and closes Ring WHEP sessions. The access token never enters client code.
- **`app/hooks/useRingDevice.ts`** manages browser-side discovery state without handling credentials, prefers an online default camera, and supports selecting from the account's device list.
- **`app/hooks/useWebRTCStream.ts`** manages the peer connection, SDP exchange, video attachment, errors, and cleanup.
- **`lib/credentials/`** creates and verifies versioned HMAC-SHA256 credentials with explicit validity windows.
- **`app/api/credentials`** creates signed credentials; **`app/api/credentials/verify`** returns one of five explicit verification statuses.
- **`lib/video-processors/qrDecoder.mjs`** is the shared local QR decoder used by both Ring frames and the development harness.
- **`lib/video-processors/qrCredentialProcessor.ts`** turns decoded values into processor results and applies an 8-second, per-value duplicate cooldown before verification.
- **`lib/credentials/verifyQrCredential.ts`** classifies non-PassFlow QR values locally and sends signed PassFlow values to the server verification route. Both the Ring path and development harness use it.
- **`lib/video-processors/personDetectionProcessor.ts`** begins warming browser-side COCO-SSD when the app loads, keeps it warm across stream resets, reports loading/ready/failure state, and uses the more accurate MobileNet v2 variant at a target of 5 FPS and 40% confidence by default.
- **`lib/entrance/trackerCore.mjs`** assigns anonymous short-lived track IDs using IoU and bottom-center distance, then emits one entering event when a track crosses the configured boundary in the expected direction.
- **`lib/access/decisionCore.mjs`** combines verified credentials and entrance events in a configurable 12-second window. The first distinct entrant is authorized; additional entrants trigger possible tailgating; entrants without an active window are unauthorized.

## Requirements

- Node.js 18 or newer
- npm
- A Ring account and eligible device available through the Playground or Private App staging flow
- A current Playground token, or a deployed and configured Ring Private App integration
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
3. The selected device appears by name with its ID and Ring-reported **Online** or **Offline** state.
4. If the account has multiple devices, choose a camera from the **Camera** selector. The default selection prefers an online camera; you can change it at any time.
5. Live View can start only for a selected online camera. An empty device list or discovery error is shown in the camera panel.

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
5. When the session is established, the Ring stream appears in the Live camera frame and feeds the shared QR and person-detection processors.
6. Select **Stop Live View** to close the peer connection and Ring session.

While video is active, the camera panel reports received video dimensions, person-processing sample rate, latest inference time, detected people, and active tracks. Inference timing and model detections are browser/model measurements, not guarantees of physical-camera accuracy.

Browser autoplay rules are handled by using a muted inline video element. Ring live verification still requires a real token, account, device, and network path.

## Token expiration

Playground tokens expire. When Ring responds with an authorization error, PassFlow reports that the token was rejected instead of silently retrying with invalid credentials.

To recover:

1. Generate a fresh token in the Ring Developer Playground.
2. Replace `RING_ACCESS_TOKEN` in `.env.local`.
3. Stop and restart `npm run dev`.
4. Reload PassFlow and verify discovery again.

Do not configure `RING_ACCESS_TOKEN` and `RING_REFRESH_TOKEN` at the same time.

## Ring Private App staging account linking

PassFlow supports Ring's one-way Private App flow. It exchanges the authorization code at `https://oauth.ring.com/oauth/token`, retrieves the Ring account ID from `/v1/users/me`, and stores the access and refresh tokens encrypted in PostgreSQL. The browser never receives Ring credentials. Device API calls refresh credentials five minutes before expiration and persist both rotated tokens.

The Account Link page requires the configured PassFlow owner to sign in before nonce matching. Ring's flow uses `HMAC-SHA256(key, "time:account_id")`, Base64URL without padding, and a 10-minute timestamp window. Webhooks use the same HMAC key but require `sha256=` plus a hexadecimal digest over the exact raw request bytes.

### Configure deployment secrets

Set these server-side variables in Vercel and local `.env.local`. Never add a `NEXT_PUBLIC_` prefix:

```dotenv
RING_CLIENT_ID=
RING_CLIENT_SECRET=
RING_HMAC_KEY=
RING_TOKEN_ENCRYPTION_KEY=
RING_LINK_OWNER_EMAIL=
RING_LINK_OWNER_PASSWORD=
POSTGRES_URL=
```

`RING_TOKEN_ENCRYPTION_KEY` must be a base64url-encoded random 32-byte key. Generate one with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`POSTGRES_URL` is the server-only Vercel Postgres connection string. Apply the included schema once:

```powershell
psql "$env:POSTGRES_URL" -f db/migrations/001_ring_credentials.sql
```

The owner email is masked before it is sent to Ring as the partner `account_identifier`. The owner password is used only by the server-side sign-in route. The session cookie is HttpOnly, SameSite=Lax, signed with `RING_HMAC_KEY`, and expires after 30 minutes.

### Ring Developer Portal staging URLs

Replace `<YOUR_VERCEL_DOMAIN>` with the deployed HTTPS host, without angle brackets:

| Ring staging field | URL |
| --- | --- |
| Token Exchange URL | `https://<YOUR_VERCEL_DOMAIN>/api/ring/token` |
| Account Link URL | `https://<YOUR_VERCEL_DOMAIN>/ring/link` |
| Webhook URL | `https://<YOUR_VERCEL_DOMAIN>/api/webhook` |
| App Homepage URL | `https://<YOUR_VERCEL_DOMAIN>/` |

The token endpoint accepts a `code` field in a JSON or `application/x-www-form-urlencoded` POST. The Ring access and refresh tokens remain encrypted at rest, along with the expiration, Ring account ID, and link state. The nonce digest and timestamp are recorded after the signed-in owner completes the link. The owner authentication identity and database are single-deployment resources; this does not add general PassFlow user accounts.

Playground mode remains available: set `RING_ACCESS_TOKEN` to use it. With neither Playground variable set, PassFlow uses the most recently completed Private App account. Do not set `RING_ACCESS_TOKEN` and `RING_REFRESH_TOKEN` together. The older `RING_REFRESH_TOKEN` environment mode is also preserved separately from durable Private App storage:

```dotenv
RING_REFRESH_TOKEN=replace_with_refresh_token
RING_CLIENT_ID=replace_with_client_id
RING_CLIENT_SECRET=replace_with_client_secret

# Optional when using RING_REFRESH_TOKEN:
# RING_DEVICE_ID=replace_with_device_id
# RING_DEVICE_NAME=Front Door
```

Real staging account linking still requires deployment, setting these server-side values, applying the PostgreSQL migration, and manually connecting a Ring staging account from Ring's app. This implementation does not verify a real Ring account by itself.

## Validation

```powershell
npm test
npm run check:qr
npm run check:entrance
npx tsc --noEmit
npm run build
```

`npm test` is self-contained and uses a test-only signing secret. In addition to credential and QR coverage, it tests directional crossing, near-boundary motion, reverse motion, duplicate suppression, track expiry, entry-window timing, authorized first entry, possible tailgating on the second entry, and unauthorized entry.

`npm run check:entrance` is a deterministic end-to-end policy check that feeds representative detections through the same tracker, crossing logic, and decision engine used by video processing. The older `npm run check:credentials` integration check remains available when a development server is running with `PASSFLOW_SIGNING_SECRET` configured. `npm run check:qr` remains as a small standalone debounce smoke check.

## Development-only credential and entrance harness

Run `npm run dev`, then open [http://localhost:3000/dev/qr-harness](http://localhost:3000/dev/qr-harness).

The harness is available only while `NODE_ENV=development`; production builds return a 404 for this route. It feeds local media into the same processor registry used by `LiveCamera`; it does not replace or verify the Ring stream path.

The harness supports:

- server-generated signed PassFlow QR codes with valid, expired, and not-yet-valid windows;
- local static PNG, JPEG, and WebP QR images;
- local prerecorded doorway or QR videos, with independent QR and person processing;
- generated non-PassFlow QR codes; and
- an immediate repeated scan that records the first decision and confirms the duplicate is suppressed;
- person bounding boxes, confidence, anonymous track IDs, and the active entrance calibration when calibration is enabled; and
- credential-plus-video and no-credential video controls for authorized, tailgating, unauthorized, and no-crossing scenarios.

The main Ring screen also exposes an opt-in calibration panel for the live feed in development and production. It supports Boundary and Doorbell entrance modes, remembers all calibration values, including confidence, sampling rates, Doorbell near-camera threshold, and exit side in this browser, and adjusts mode-specific calibration plus person confidence, QR/person sampling rates, and the credential window. Anyone with the production URL can adjust calibration in their own browser. Doorbell inference requires sustained approach, movement toward the selected frame edge, and three seconds fully out of view on fresh video; ordinary detection loss, knocking, and retreat do not count. Ambiguous losses remain unconfirmed. See [`docs/physical-ring-test-plan.md`](docs/physical-ring-test-plan.md) for the ordered physical-device checklist and the values to record.

Static images and video files remain local to the browser. Every video frame passes through the same sampled QR and person processors as Ring video. Every new PassFlow value then passes through the same server verification request used by `LiveCamera`, while person detections pass through the shared tracker, boundary, and access-decision policy.

## Verification status

### Verified without Ring hardware

- Signed credential generation keeps `PASSFLOW_SIGNING_SECRET` on the server.
- HMAC signature checking rejects modified payloads and invalid signatures.
- Required credential fields and validity windows are validated.
- Verification returns distinct `valid`, `expired`, `not-yet-valid`, `malformed`, and `invalid-signature` states.
- Generated PassFlow QR values and ordinary non-PassFlow QR values decode through the shared decoder.
- QR scanning runs in a worker at a target of 8 FPS with an 8-second per-value cooldown. Person processing targets 5 FPS. Session resets clear transient QR/tracker state while keeping the model warm.
- Deterministic tests verify directional crossing, non-crossing near-door motion, reverse-motion rejection, duplicate track/count suppression, entry-window expiry, one authorized entrant, a second entrant triggering possible tailgating, and unauthorized entry.
- The development harness exercises generated QR codes, static QR images, local prerecorded doorway/QR video, non-PassFlow values, and model-based person detections without changing the Ring stream architecture.
- Ring access tokens and signing secrets remain server-only; no `NEXT_PUBLIC_` secret variables are used.

### Verified through the development harness

- A generated active PassFlow QR decodes and produces **CREDENTIAL VERIFIED — WAITING FOR ENTRY** with a visible countdown.
- Generated expired and not-yet-valid passes produce their explicit denied states.
- A non-PassFlow QR produces **Invalid credential** without being sent to the credential API.
- Scanning the same generated credential twice immediately emits one decision and suppresses the duplicate.
- Local static QR images use the shared decoder and verification flow.
- Local prerecorded video uses the same independent processors and direct event delivery as Ring video. COCO-SSD person results expose confidence and anonymous track boxes; development mode also shows track IDs and the entrance boundary.

Model-based prerecorded-video results are heuristic and must be reported separately from deterministic policy tests. Neither is evidence that a physical Ring camera can resolve a phone-displayed QR or reliably detect people through its real optics, viewpoint, compression, lighting, motion, WebRTC transport, and stream resolution.

### Still unverified: physical Ring camera in the loop

The following acceptance path remains explicitly unverified until a physical Ring device is available:

```text
phone QR → Ring camera → Ring WebRTC stream → QR verification → person tracking → entrance crossing → access decision
```

The Playground's prerecorded video cannot satisfy this acceptance test, and the development harness must not be used as a substitute.

## Future physical-device verification steps

1. Configure a current `RING_ACCESS_TOKEN` and a server-only `PASSFLOW_SIGNING_SECRET`, then restart `npm run dev`.
2. Load PassFlow on a computer, confirm that the intended physical Ring device is discovered, and start its real live view.
3. On a phone, open PassFlow and generate a currently valid signed pass for the selected door.
4. Set the phone brightness high enough for the QR to be clear, hold the full QR inside the physical Ring camera view, and vary distance/angle only as needed for focus.
5. Confirm the QR is verified and the UI changes to **CREDENTIAL VERIFIED — WAITING FOR ENTRY** with the correct visitor and location.
6. Keep the same QR in view and confirm the 8-second duplicate cooldown prevents a decision on every sampled frame; after the cooldown, confirm a deliberate rescan can be processed again.
7. Repeat with generated expired and not-yet-valid passes and confirm the explicit **Expired** and **Not yet valid** denied states.
8. Present a non-PassFlow QR and a visibly modified/invalid PassFlow QR and confirm both are denied gracefully without exposing tokens or secrets.
9. Calibrate `lib/entrance/config.mjs` against the real doorway so standing nearby and walking away do not count, while inbound crossings count once.
10. Repeat with one entrant, two entrants together, two entrants several seconds apart, and an entrant without a valid credential; confirm the three final decision states.
11. Stop live view and confirm the Ring session, animation loop, frame canvas, pending verification request, tracker, and QR debounce state are cleaned up while **Vision ready** remains available for a fast retry.
12. Record the physical device model, lighting, phone, distance, orientation, model load time, steady inference time, time-to-decision, missed detections, and false detections.

## Current limitations

- A live physical Ring account and device are still required for camera-in-the-loop QR acceptance. This is not yet verified.
- Playground tokens are short-lived and must be replaced manually.
- Camera selection is held in browser state and resets if the page is reloaded.
- Playground video is prerecorded, so the generated QR cannot be physically presented to that synthetic feed. Final camera-in-the-loop acceptance requires a real Ring camera pointed at the displayed pass.
- Person detection is heuristic and depends on the browser downloading the COCO-SSD model while the app starts. The 0.55 confidence threshold, 2 FPS sampling rate, tracker tolerances, and entrance boundary require real-camera calibration.
- There is no database, account system, smart-lock control, payment flow, notification system, facial recognition, or production deployment.

## Video-processing architecture

The QR and person processors share one frame-sampling registry so development video and Ring video consume the same CV modules. See [docs/video-processors.md](docs/video-processors.md).

## Next required validation (not completed here)

**Physical Ring camera calibration and camera-in-the-loop acceptance.**

Display a generated PassFlow QR on a phone, run real entrants through the doorway, calibrate the selected Boundary or Doorbell mode, and confirm the complete Ring WebRTC → QR verification → person detection → entrance-event → access-decision path. Doorbell mode infers entry from close approach followed by disappearance; it does not prove physical threshold crossing. Until that physical test is complete, the Ring path remains explicitly unverified.

## License

[MIT](LICENSE)
