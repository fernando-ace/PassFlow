# Physical Ring validation plan

Use this checklist during the Ring device session. The Ring feed calibration panel is available in both development and production. Do not change the model or product flow during the session unless a blocking defect is found; the goal is calibration, validation, and recording.

## Before the device session

- Install dependencies and run `npm test`, `npm run check:qr`, `npm run check:entrance`, `npx tsc --noEmit`, and `npm run build`.
- Put a current `RING_ACCESS_TOKEN` and a server-only `PASSFLOW_SIGNING_SECRET` in `.env.local`. Never record or commit their values.
- Start PassFlow with `npm run dev` and open `http://localhost:3000` on the validation computer.
- Prepare a phone that can display valid, expired, invalid, and non-PassFlow QR codes at adjustable brightness.
- Prepare the demo path so one and two people can cross naturally without blocking the camera.

## Ordered physical-device checklist

1. **Connect/discover the physical Ring.** Confirm the intended camera name appears, the Ring status reads **Online**, and no credential is exposed in browser requests or UI.
2. **Verify WHEP live video.** Select **Start Live View**. Confirm the real camera image appears, the **Live** indicator remains stable, and stopping/restarting closes and recreates the session cleanly.
3. **Choose an entrance mode.** Open **Calibrate Ring feed**. Choose **Boundary crossing** only if the actual doorway threshold is visible. For the front-door camera framing in the 2026-10-09 recording, choose **Doorbell approach and full exit**, **Left edge**, and start with a **60% near-camera size threshold**. Inference requires observed approach (person height grows at least 15% from their first detection), three close detections spanning at least 600 ms, movement reaching the selected edge, and three seconds of fresh video without reacquisition. It is not confirmation of physical doorway crossing.
4. **Calibrate and verify person detection.** Wait for **Model ready** / **Processing video**. Defaults are MobileNet v2, 40% confidence, 5 person FPS, and 8 QR FPS; confidence is passed into inference. Check actual samples/sec and fresh-video status. Adjust the close threshold to the camera view. Walk the approach and verify stable IDs, including brief detection gaps and partial people at the edge. Slow inference may suspend entry inference; do not substitute the requested FPS for the measured rate.
5. **Test phone QR at several distances, angles, and brightness levels.** Generate a new compact pass and select **Present QR full screen**. Hold the entire code steady, with its white border visible. Try low/medium/high brightness, several practical distances, and modest angles in daylight and at night. An overexposed or blurred phone cannot be reconstructed by software. Record the reliable range, hold time, and optical failure boundary; try a printed pass to distinguish screen glare from decoding failure. Legacy passes remain valid but their denser codes may require straight-on presentation or regeneration.
6. **Valid credential + one entrant.** Scan a currently valid pass, confirm the 12-second window opens, approach closely, then move through the selected edge and fully out of frame. Count only after the three-second healthy-video grace period, once, with **AUTHORIZED ENTRY** and an **Inferred entry** timeline label. Repeat with the disappearance occurring just before credential-window expiry; its later confirmation must use the departure time.
7. **Valid credential + two entrants.** Scan a fresh pass, have two people complete separate full departures in Doorbell mode, and verify **POSSIBLE TAILGATING** with distinct track IDs. Also test overlapping people; if the second person obscures the first departure, the ambiguous first loss must remain unconfirmed.
8. **Staggered second entrant.** Scan a fresh valid pass, cross once, then send the second person several seconds later but before the entry window closes. Verify the decision advances from authorized to possible tailgating.
9. **No credential.** Reset the session, cross without presenting a QR, and verify **UNAUTHORIZED ENTRY**.
10. **Expired/invalid credential.** Present an expired credential and a modified or non-PassFlow QR, then cross. Verify rejection is visible and the crossing results in **UNAUTHORIZED ENTRY**.
11. **Test session reset/retry.** During an active entry window and again after a final decision, select **Reset access session**. Confirm the window, entrant count, temporary tracks, and final decision clear without disconnecting Ring or returning vision to a loading state.
12. **Record multiple clean demo takes.** Capture at least two successful takes of the normal authorized flow and one clear tailgating take. Keep secrets, browser developer tools, and the calibration panel out of the final recording.

## Calibration record

Record these exact values immediately after calibration so the setup can be reproduced:

| Parameter | Value to record |
| --- | --- |
| Ring device model/name | Device used and selected camera name |
| Camera placement | Height, horizontal offset, tilt, rotation, and approximate distance to threshold |
| Stream | Reported resolution, orientation, and whether the connection stayed stable |
| Entrance boundary | Position percentage shown in the panel |
| Crossing direction | Toward lower/right or toward upper/left |
| Neutral-zone width | Percentage shown in the panel |
| Person confidence | Percentage shown in the panel |
| QR sampling rate | Frames per second shown in the panel |
| Person sampling rate | Frames per second shown in the panel |
| Credential entry window | Seconds shown in the panel |
| Vision cold start | Seconds from page load to **Vision ready** |
| Person inference | Typical and worst observed milliseconds |
| QR presentation | Reliable phone model, brightness, distance, angle, orientation, and hold time |
| Environment | Lighting direction/level, glare, backlight, and notable motion/compression artifacts |
| Tracking result | Missed detections, false detections, ID switches, duplicate crossings, and observed FPS |

Photograph or screenshot the final calibration panel and camera placement, but do not capture `.env.local`, tokens, signed credential strings, or other secrets.

## Pass criteria and evidence

- Every required decision scenario produces the expected final state twice in succession.
- Reset permits an immediate clean retry without a Ring reconnect or model reload.
- A valid unused credential returns to **WAITING FOR CREDENTIAL** after the configured timeout.
- Calibration overlays are available only while the calibration panel is enabled and disappear when it is hidden.
- Repeat each of these at least twice in daylight and at night: approach and knock while remaining visible; knock then retreat; partial exit with an arm/body still visible; loss away from the door-side edge; full entry through the right edge; brief occlusion; stream freeze during pending departure. Only full entry with continuous usable tracking evidence should count.
- Doorbell mode requires sustained close approach and door-side departure. Standing, retreating, reacquisition, and ambiguous loss do not count. A stalled stream or failed inference cancels pending absence evidence. The timeline explicitly labels the result inferred.
- Confirm calibration (confidence, FPS, threshold, exit side, and window) survives reload. Switching camera, resetting access, or stopping Live View must discard pending scans, verification responses, and departure candidates.
- The normal product UI always makes Ring, credential, vision, entry-window, entrant-count, and final-decision status understandable without debug data.
- Save only short, intentional demo recordings and the calibration notes; do not add large recordings to Git.
