/** @param {Array<{id: string, name: string, online: boolean, capabilities: Record<string, unknown>}>} devices @param {string | null} [selectedId] */
export function selectDefaultRingDevice(devices, selectedId = null) {
  if (!Array.isArray(devices) || devices.length === 0) return null
  return devices.find((device) => device.id === selectedId)
    ?? devices.find((device) => device.online)
    ?? devices[0]
}
