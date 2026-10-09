/** @param {number} modules @param {number} availablePixels */
export function qrPresentationOptions(modules, availablePixels = 360) {
  const scale = Math.max(1, Math.floor(availablePixels / (modules + 8)))
  return { errorCorrectionLevel: /** @type {'M'} */ ('M'), margin: 4, scale, color: { dark: '#000000', light: '#ffffff' } }
}
