/**
 * Perfect circle arc math for koru jigsaw. Cookie-cutter: use circles to cut sections.
 */

export const PHI = (1 + Math.sqrt(5)) / 2

/** Semicircle arc: chord (lineX,y1)-(lineX,y2), radius r. bulgeDir 1=right, -1=left. */
export function semicircleArc(
  lineX: number,
  _y1: number,
  y2: number,
  r: number,
  bulgeDir: 1 | -1,
): string {
  const laf = 1
  const sf = bulgeDir === 1 ? 1 : 0
  return `A ${r} ${r} 0 ${laf} ${sf} ${lineX} ${y2}`
}

/** Koru boundary: two semicircles forming S curve. */
export function koruBoundaryArcs(barY: number, barH: number): string {
  const chord1 = barH / (PHI * PHI)
  const chord2 = barH / PHI
  const midY = barY + chord1
  const r1 = chord1 / 2
  const r2 = chord2 / 2
  const a1 = semicircleArc(0, barY, midY, r1, 1)
  const a2 = semicircleArc(0, midY, barY + barH, r2, -1)
  return `${a1} ${a2}`
}
