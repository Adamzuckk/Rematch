export interface OverlayPayload {
  matchLabel: string
  minuteLabel: string
  eventType: string
  headline: string
  detail: string
  provenance: string
  tMs: number
}

export function buildTimedOverlayJson(
  items: OverlayPayload[],
): { version: string; items: OverlayPayload[] } {
  return {
    version: 'rematch-overlay-v1',
    items: items.map((item) => ({ ...item })),
  }
}
