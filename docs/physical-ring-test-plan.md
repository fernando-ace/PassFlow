# Physical Ring validation plan

Use this checklist during the limited Saturday device session. Keep PassFlow in development mode so the Ring feed calibration panel is available. Do not change the model or product flow during the session unless a blocking defect is found; the goal is calibration, validation, and recording.

## Before the device session

- Install dependencies and run `npm test`, `npm run check:qr`, `npm run check:entrance`, `npx tsc --noEmit`, and `npm run build`.
- Put a current `RING_ACCESS_TOKEN` and a server-only `PASSFLOW_SIGNING_SECRET` in `.env.local`. Never record or commit their values.
- Start PassFlow with `npm run dev` and open `http://localhost:3000` on the validation computer.
- Prepare a phone that can display valid, expired, invalid, and non-PassFlow QR codes at adjustable brightness.
- Prepare the demo path so one and two people can cross naturally without blocking the camera.

## Ordered physical-device checklist

1. **Connect/discover the physical Ring.** Confirm the intended camera name appears, the Ring status reads **Online**, and no credential is exposed in browser requests or UI.
2. **Verify WHEP live video.** Select **Start Live View**. Confirm the real camera image appears, the **Live** indicator remains stable, and stopping/restarting closes and recreates the session cleanly.
3. **Choose an entrance mode.** Open **Calibrate Ring feed** and select **Boundary crossing** for a view that shows the threshold, or **Doorbell close approach** for a camera mounted beside the door. Boundary mode uses a calibrated line and direction. Doorbell mode counts an inferred entry when a person reaches the near-camera size threshold and then remains unseen until the track expires.
4. **Calibrate and verify person detection.** Wait for **Vision ready**. In Boundary mode, place the boundary across the visible threshold and adjust direction/neutral zone. In Doorbell mode, adjust the near-camera size threshold until close approaches are highlighted while people farther away are not. Walk through the visible approach and confirm the expected event occurs once.
5. **Test phone QR at several distances, angles, and brightness levels.** Try straight-on and modest angles, low/medium/high brightness, and several practical distances. Record the reliable range and failure boundary.
6. **Valid credential + one entrant.** Scan a currently valid pass, confirm the 12-second window opens, complete one boundary crossing or doorbell close-approach/disappearance, and verify **AUTHORIZED ENTRY** with one entrant counted.
7. **Valid credential + two entrants.** Scan a fresh valid pass, have two people cross the boundary or approach and disappear separately in Doorbell mode, and verify **POSSIBLE TAILGATING** with at least two distinct track IDs.
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
- Calibration overlays are available only in development and disappear when the panel is hidden.
- Doorbell mode does not count a near-camera person who remains visible or a person who disappears without first reaching the configured size threshold; its entry decision is an inference, not confirmation of physical threshold crossing.
- The normal product UI always makes Ring, credential, vision, entry-window, entrant-count, and final-decision status understandable without debug data.
- Save only short, intentional demo recordings and the calibration notes; do not add large recordings to Git.
