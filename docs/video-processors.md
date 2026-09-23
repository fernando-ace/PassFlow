# PassFlow video-processing architecture

PassFlow retains the Ring sample's browser-side processor registry as an extension point for later QR and computer-vision milestones. No processor is registered or active in the current live-view milestone.

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
  data?: Record<string, unknown>
  message?: string
}
```

## Registering a future processor

Create an implementation and register it through the existing registry:

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

## Current state

The registry, types, processing hook, and generic overlay hook are present. Demo games, sample analyzers, and ML dependencies from the original sample were removed to keep this milestone focused and dependency-light.

The next intended use of this architecture is:

**Signed visual credentials and QR recognition from Ring video.**
