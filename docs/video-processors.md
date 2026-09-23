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

`PersonDetectionProcessor` lazy-loads COCO-SSD's `lite_mobilenet_v2` model and TensorFlow.js WebGL backend only when video processing starts. It:

- runs inference at no more than 2 FPS;
- keeps only `person` predictions at or above 0.55 confidence;
- returns video-pixel bounding boxes, confidence, anonymous track information, crossing events, and inference duration;
- disposes the model and resets the tracker when processing stops; and
- never performs face detection, facial recognition, biometric identification, or appearance matching.

COCO-SSD model weights are fetched by the browser on first initialization and are not committed to this repository.

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

- Use `init()` for expensive setup and `destroy()` for cleanup.
- Keep `process()` bounded; frame sampling runs repeatedly while enabled.
- Return `null` when there is no meaningful result.
- Keep model/provider concerns inside the processor implementation.
- Use video-pixel coordinates for bounding boxes; the overlay hook handles display scaling.
- Batch React state updates instead of updating the UI for every frame.
- Treat all CV output as advisory until the access-decision policy explicitly defines confidence and failure behavior.

## Tracking and entrance crossing

`lib/entrance/trackerCore.mjs` uses greedy IoU and bottom-center distance matching. Tracks expire after three missed frames or two seconds. No appearance embeddings or identifying information are retained.

The entrance calibration lives in `lib/entrance/config.mjs`. The default is a horizontal boundary at 62% of frame height, a 3.5% half-width neutral zone, and positive-axis inbound movement. A track counts once only after moving from the outside side, through or across the neutral zone, to the inside side. Tracks first seen inside, tracks that remain near the boundary, and tracks moving in the reverse direction do not produce entering events.

Development overlays show person boxes, confidence, track IDs, and the boundary. Those CV-debug overlays are marked development-only and are hidden from production UI.

## Access policy

`lib/access/decisionCore.mjs` opens a 12-second window after a valid server verification result. One credential authorizes one entrant:

- first distinct crossing in the active window → `AUTHORIZED ENTRY`;
- additional distinct crossing in that window → `POSSIBLE TAILGATING`;
- crossing without an active valid window → `UNAUTHORIZED ENTRY`;
- visible person without a directional crossing → no entrant event.

Both the tracker and policy suppress duplicate track IDs.

## Current state

The registry, processing hook, QR processor, person detector, tracker, entrance boundary, access policy, and generic overlay hook are active. The development-only harness accepts local prerecorded video through this same chain.

Physical Ring behavior remains unverified. The next required work is calibration and camera-in-the-loop acceptance with the real Ring viewpoint; this document does not claim that model behavior on development clips proves physical-camera performance.
