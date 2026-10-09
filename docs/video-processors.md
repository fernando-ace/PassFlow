# PassFlow video-processing architecture

PassFlow uses the Ring sample's browser-side processor registry for credential QR recognition and anonymous person detection. Ring video and development-only local video share the same frame sampler, processors, tracker, crossing logic, and access-decision policy.

## Boundaries

- Ring authentication, device discovery, and WHEP session creation remain in server-side API routes.
- `useWebRTCStream` attaches the Ring `MediaStream` to the browser video element.
- `useVideoProcessing` can sample frames from that video at a controlled rate.
- `processorRegistry` owns registered processors and their enabled state.
- `useCanvasOverlay` can render generic processor bounding boxes over a video surface.
- Product decisions should consume normalized processor results rather than provider-specific Ring response shapes.

This separation lets later CV work change without rewriting the Ring integration.

## Processor contract

```typescript
interface VideoProcessor {
  id: string
  name: string
  description: string
  enabled: boolean
  init?(): Promise<void>
  process(
    frame: ImageData,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement
  ): Promise<ProcessorResult | null>
  destroy?(): Promise<void>
}
```

A processor may return data, a message, or bounding boxes:

```typescript
interface ProcessorResult {
  id: string
  processorId: string
  timestamp: number
  boundingBoxes?: BoundingBox[]
  overlayLines?: OverlayLine[]
  data?: Record<string, unknown>
  message?: string
}
```

## Registered processors

`QrCredentialProcessor` is registered when the live-camera component mounts. It samples frames at 2 FPS, runs `jsQR` locally, returns a token and bounding box, and suppresses repeated values for eight seconds. The access-decision workflow then sends the token to the server verification route; the signing secret never enters this processor or the browser.

`PersonDetectionProcessor` starts warming COCO-SSD's `lite_mobilenet_v2` model and the TensorFlow.js WebGL backend when the live-camera component mounts. It:

- runs inference at no more than 2 FPS;
- keeps only `person` predictions at or above 0.55 confidence;
- returns video-pixel bounding boxes, confidence, anonymous track information, crossing events, and inference duration;
- resets short-lived tracker state while keeping the model warm across stream stops and access-session resets;
- never performs face detection, facial recognition, biometric identification, or appearance matching.

COCO-SSD model weights are fetched by the browser during the first warm-up and are not committed to this repository. The UI reports **Loading vision model**, **Vision ready**, or a visible retryable failure instead of implying detection is active while the model is unavailable.

Additional processors can use the same registry:

```typescript
import type { ProcessorResult, VideoProcessor } from '@/lib/video-processors'
import { processorRegistry } from '@/lib/video-processors'

class ExampleProcessor implements VideoProcessor {
  id = 'example'
  name = 'Example'
  description = 'Reserved for a future milestone'
  enabled = false

  async process(): Promise<ProcessorResult | null> {
    return null
  }
}

processorRegistry.register(new ExampleProcessor())
```

Do not register placeholder processors merely to populate the UI. Add a processor only when its milestone includes an implemented workflow, validation plan, and performance budget.

## Implementation guidance

- Use `init()` for expensive setup, `resetSession()` for transient state, and `destroy()` only for final resource cleanup.
- Keep `process()` bounded; frame sampling runs repeatedly while enabled.
- Return `null` when there is no meaningful result.
- Keep model/provider concerns inside the processor implementation.
- Use video-pixel coordinates for bounding boxes; the overlay hook handles display scaling.
- Batch React state updates instead of updating the UI for every frame.
- Treat all CV output as advisory until the access-decision policy explicitly defines confidence and failure behavior.

## Tracking and entrance detection

`lib/entrance/trackerCore.mjs` uses greedy IoU and bottom-center distance matching. Tracks expire after three missed frames or two seconds. No appearance embeddings or identifying information are retained.

The entrance defaults live in `lib/entrance/config.mjs`. Boundary mode remains the default: it uses a horizontal boundary at 62% of frame height, a 3.5% half-width neutral zone, and positive-axis inbound movement. A track counts once only after moving from the outside side through or across the neutral zone to the inside side.

Doorbell mode defaults to right-edge departure. A person must grow at least 15% from their initial detected height, remain above the close threshold (65% by default) for at least three fresh detections spanning 600 ms, and move toward the exit edge until their box reaches the outermost 10% of the frame. Only then can three seconds of fresh absence produce an `inferred` event. Retreat, partial visibility/reacquisition, and blocked exit areas cancel the candidate. Missed tracks remain internal; overlays show fresh detections only. Model/capture errors, long inference gaps, and stalled video interrupt pending absence. Up to two lost-track crops are rechecked per sample; incomplete recovery coverage suspends inference rather than treating unchecked people as absent. All calibration settings persist in versioned local storage, with migration from the old mode/threshold preferences.

When calibration is enabled, overlays show person boxes, confidence, and track IDs. Boundary mode draws the boundary and neutral-zone edges; Doorbell mode highlights boxes that reached the near-camera threshold. The overlays are hidden when calibration is turned off.

## Access policy

`lib/access/decisionCore.mjs` opens a 12-second window after a valid server verification result. One credential authorizes one entrant:

- first distinct crossing in the active window → `AUTHORIZED ENTRY`;
- additional distinct crossing in that window → `POSSIBLE TAILGATING`;
- crossing without an active valid window → `UNAUTHORIZED ENTRY`;
- visible person without a directional crossing → no entrant event.

Both the tracker and policy suppress duplicate track IDs.

Doorbell events include `evidence: 'inferred'`, the observed disappearance `timestamp`, and the later `confirmedAt`. Authorization uses the disappearance time; UI countdowns use confirmation time. Recent credential-window history is bounded to 16 windows, retained across expiry for delayed inference, closed by subsequent verification attempts, and cleared on session reset.

## Processing and QR budgets

- MobileNet v2 runs at a target of 5 FPS with 40% confidence passed directly to `detect`; calibration can lower it to 20%. Crop recovery uses up to two additional inferences and a 20% recovery threshold so partial people block false disappearance decisions.
- QR scanning targets 8 FPS in a dedicated worker. It attempts native full-frame decoding, full-frame contrast normalization, then a rotating enlarged crop with raw/normalized pixels: at most four attempts, each capped at 1.5 million pixels. These are targets, not guaranteed processing rates.
- Each processor has its own single-flight lane. Freshness uses presented video frame callbacks (or decoded-frame counters), so an advancing playback clock alone cannot advance absence. Browsers without either freshness signal can scan QR but cannot infer entry. Results reach callbacks immediately; the 2 Hz display map is solely for overlays and diagnostics. Session versions discard old results and old verification responses on reset or source change.
- New credentials encode a `pf2` HMAC-signed tuple `[passId, displayName, location, validFromMs, validUntilMs]`; verification also accepts existing `pf1` credentials. Public credential fields remain unchanged. QR presentation uses pure black and white, a four-module quiet zone, and integer module scaling.
- Synthetic degraded-image tests establish decoding and failure boundaries. A dense legacy QR at the tested perspective remains unreadable while the compact symbol decodes; regeneration is preferred for phone presentation. Neither decoder nor preprocessing can recover a clipped, fully washed-out, or severely blurred code.

## Current state

The registry, processing hook, QR processor, person detector, tracker, entrance boundary, access policy, and generic overlay hook are active. The development-only harness accepts local prerecorded video through this same chain.

Physical Ring behavior remains unverified. The next required work is calibration and camera-in-the-loop acceptance with the real Ring viewpoint; this document does not claim that model behavior on development clips proves physical-camera performance.
