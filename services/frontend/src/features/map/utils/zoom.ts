/** A point in map units. */
export interface Point {
  x: number
  y: number
}

/** A box in map units: the left, top, right, and bottom edges. */
export type Bounds = [minX: number, minY: number, maxX: number, maxY: number]

/** The part of the map that the SVG shows, in map units. */
export interface ViewBox {
  x: number
  y: number
  width: number
  height: number
}

/** The size of the map, in map units. */
export interface MapSize {
  width: number
  height: number
}

/** The smallest view, in map units, so a small county still shows a little of its neighbors. */
export const MIN_VIEW = 160

/** The room around the chosen area, as a share of its larger side. */
const PADDING = 0.06

/** The least room around the chosen area, in map units. */
const MIN_PADDING = 12

/** The time of a typical zoom. A long trip across the state takes more, a short one less. */
export const ZOOM_DURATION_MS = 700

const SHORTEST_ZOOM_MS = 600
const LONGEST_ZOOM_MS = 1200

/** The box around all the boxes, or null when there are none. */
export function unionBounds(boxes: readonly Bounds[]): Bounds | null {
  if (boxes.length === 0) return null
  return boxes.reduce((all, box) => [
    Math.min(all[0], box[0]),
    Math.min(all[1], box[1]),
    Math.max(all[2], box[2]),
    Math.max(all[3], box[3]),
  ])
}

/** The box of one point, which has no size. */
export function pointBounds(point: Point): Bounds {
  return [point.x, point.y, point.x, point.y]
}

export function wholeMap(map: MapSize): ViewBox {
  return { x: 0, y: 0, width: map.width, height: map.height }
}

/**
 * The view that shows the box with some room around it. The view has the shape of the map, so
 * the SVG never changes its size on the page. The box is in the middle of the view, even when the
 * view then goes past the edge of the map.
 */
export function viewBoxFor(bounds: Bounds | null, map: MapSize): ViewBox {
  if (bounds === null) return wholeMap(map)
  const [minX, minY, maxX, maxY] = bounds
  const pad = Math.max(MIN_PADDING, PADDING * Math.max(maxX - minX, maxY - minY))
  const aspect = map.width / map.height
  let width = Math.max(maxX - minX + 2 * pad, MIN_VIEW)
  let height = Math.max(maxY - minY + 2 * pad, MIN_VIEW / aspect)
  if (width / height > aspect) height = width / aspect
  else width = height * aspect
  if (width >= map.width) return wholeMap(map)
  return {
    x: (minX + maxX) / 2 - width / 2,
    y: (minY + maxY) / 2 - height / 2,
    width,
    height,
  }
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value))
}

/** Slow at the start and at the end, fast in the middle. */
export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

/** The path of a zoom from one view to another, and the time it should take. */
export interface ZoomPath {
  /** The view at t, from 0 for the first view to 1 for the last. */
  at: (t: number) => ViewBox
  durationMs: number
}

/** How much the zoom pulls back on a long trip. This is the value that van Wijk and Nuij advise. */
const RHO = Math.SQRT2

/**
 * A smooth zoom between two views of one shape, after "Smooth and efficient zooming and panning"
 * by van Wijk and Nuij, as d3-interpolate does it. A short trip zooms in or out in place. A long
 * trip pulls back first, so the eye can follow where the view goes. The speed feels the same at
 * every scale.
 */
export function interpolateViewBox(from: ViewBox, to: ViewBox): ZoomPath {
  const aspect = from.width / from.height
  const x0 = from.x + from.width / 2
  const y0 = from.y + from.height / 2
  const w0 = from.width
  const dx = to.x + to.width / 2 - x0
  const dy = to.y + to.height / 2 - y0
  const w1 = to.width
  const d2 = dx * dx + dy * dy
  let distance: number
  // The share of the way from the first middle to the last, and the width, at t.
  let frame: (t: number) => { center: number; width: number }

  if (d2 < 1e-12) {
    // The views share a middle, so the zoom only changes the size.
    distance = Math.log(w1 / w0) / RHO
    frame = (t) => ({ center: t, width: w0 * Math.exp(RHO * t * distance) })
  } else {
    const d1 = Math.sqrt(d2)
    const b0 = (w1 * w1 - w0 * w0 + RHO ** 4 * d2) / (2 * w0 * RHO ** 2 * d1)
    const b1 = (w1 * w1 - w0 * w0 - RHO ** 4 * d2) / (2 * w1 * RHO ** 2 * d1)
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0)
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1)
    distance = (r1 - r0) / RHO
    frame = (t) => {
      const s = RHO * t * distance + r0
      return {
        center: (w0 / (RHO ** 2 * d1)) * (Math.cosh(r0) * Math.tanh(s) - Math.sinh(r0)),
        width: (w0 * Math.cosh(r0)) / Math.cosh(s),
      }
    }
  }

  return {
    at: (t) => {
      if (t <= 0) return from
      if (t >= 1) return to
      const { center, width } = frame(t)
      const height = width / aspect
      return {
        x: x0 + center * dx - width / 2,
        y: y0 + center * dy - height / 2,
        width,
        height,
      }
    },
    durationMs: clamp(
      ZOOM_DURATION_MS * (0.75 + 0.5 * Math.abs(distance)),
      SHORTEST_ZOOM_MS,
      LONGEST_ZOOM_MS,
    ),
  }
}

/** The view as the value of the viewBox attribute, with one decimal. */
export function viewBoxAttribute(view: ViewBox) {
  return [view.x, view.y, view.width, view.height]
    .map((value) => Number(value.toFixed(1)))
    .join(" ")
}

/**
 * The place of a map point in the SVG box on the screen, in CSS pixels from the top left. The
 * view has the shape of the box, so one scale holds for both axes.
 */
export function screenPoint(point: Point, view: ViewBox, width: number): Point {
  const scale = width / view.width
  return { x: (point.x - view.x) * scale, y: (point.y - view.y) * scale }
}
