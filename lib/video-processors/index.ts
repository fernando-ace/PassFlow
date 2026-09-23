/**
 * Video Processor Plugin System
 * 
 * Usage:
 * 
 * 1. Create a processor implementing VideoProcessor interface:
 * 
 *    import { VideoProcessor, ProcessorResult } from '@/lib/video-processors'
 *    
 *    class MyProcessor implements VideoProcessor {
 *      id = 'my-processor'
 *      name = 'My Processor'
 *      description = 'Does something cool'
 *      enabled = false
 *      
 *      async process(frame, canvas, video) {
 *        // Your processing logic here
 *        return { id: '...', processorId: this.id, timestamp: Date.now(), ... }
 *      }
 *    }
 * 
 * 2. Register it:
 * 
 *    import { processorRegistry } from '@/lib/video-processors'
 *    processorRegistry.register(new MyProcessor())
 * 
 * 3. Enable it from the UI or programmatically:
 * 
 *    processorRegistry.setEnabled('my-processor', true)
 */

export * from './types'
export { processorRegistry } from './registry'

// PassFlow intentionally ships without active processors in this milestone.
// Future QR and CV processors can register through the preserved registry.
