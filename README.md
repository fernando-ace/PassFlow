# PassFlow

PassFlow is a privacy-first visual access-control system for small businesses. It is being built for the Ring track of the Amazon App Dev Challenge.

This repository currently covers one focused milestone: use a Ring Developer Playground token to discover an associated Ring device, create a WHEP/WebRTC live-view session, and display the video in a minimal PassFlow interface.

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
```

The Access Decision and Entrants areas are intentional placeholders. Credential handling and computer vision are not part of this milestone.

## Architecture

- **Next.js 15 App Router + TypeScript** provides the application and API routes.
- **`lib/auth.ts`** reads Ring credentials only on the server and supports direct Playground access tokens plus optional refresh-token OAuth.
- **`app/api/ring/devices`** discovers devices and normalizes the Ring response for the UI.
- **`app/api/ring/stream`** creates and closes Ring WHEP sessions. The access token never enters client code.
- **`app/hooks/useRingDevice.ts`** manages browser-side discovery state without handling credentials.
- **`app/hooks/useWebRTCStream.ts`** manages the peer connection, SDP exchange, video attachment, errors, and cleanup.
- **`lib/video-processors/`** preserves a provider-independent frame-processing registry for later QR/CV work. No processors are active in this milestone.

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
```

Do not prefix the variable with `NEXT_PUBLIC_`. PassFlow reads this value only from server-side code.

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
npx tsc --noEmit
npm run build
```

## Current limitations

- A live Ring account and device are required for end-to-end stream verification.
- Playground tokens are short-lived and must be replaced manually.
- PassFlow currently selects the first discovered device.
- There is no device picker.
- Access Decision and Entrants do not perform analysis yet.
- There is no credential generation, QR recognition, credential validation, person detection, tailgating detection, database, account system, smart-lock control, payment flow, or production deployment.
- The preserved webhook and processor foundations are not surfaced in the current UI.

## Video-processing extension point

The frame processor contracts and registry are intentionally retained for future work. See [docs/video-processors.md](docs/video-processors.md).

## Next milestone

**Signed visual credentials and QR recognition from Ring video.**

That milestone should build on the existing server-only Ring boundary and preserved video-processing interfaces. It should not begin until this live-view milestone is verified with a real Ring device.

## License

[MIT](LICENSE)
