export interface DetectionEvent {
  event_id: string
  event_type: string
  device_id?: string
  timestamp?: string
  confidence?: number
  bounding_box?: {
    x: number
    y: number
    width: number
    height: number
  }
  metadata?: Record<string, unknown>
}
