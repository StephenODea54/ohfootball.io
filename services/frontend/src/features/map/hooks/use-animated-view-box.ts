import { type RefObject, useEffect, useRef } from "react"
import {
  easeInOutCubic,
  interpolateViewBox,
  type ViewBox,
  viewBoxAttribute,
} from "@/features/map/utils/zoom"

interface AnimatedViewBoxOptions {
  /** The view that the page draws first. */
  start: ViewBox
  /** The width of the SVG on the screen, in CSS pixels. */
  width: number
  /** Jump to each view, with no zoom. */
  reducedMotion: boolean
}

/**
 * Writes the view and the map units of one CSS pixel into the SVG. The dots and the ranks read
 * --map-px, so they keep their size on the screen at every step of a zoom.
 */
function draw(svg: SVGSVGElement, view: ViewBox, width: number) {
  svg.setAttribute("viewBox", viewBoxAttribute(view))
  svg.style.setProperty("--map-px", String(view.width / width))
}

/**
 * Zooms the SVG from the view it shows to the target view. Each frame writes to the SVG
 * directly, so React does not draw the map again during a zoom. A new target starts from the view
 * on the screen, so a zoom can change direction at any time.
 */
export function useAnimatedViewBox(
  ref: RefObject<SVGSVGElement | null>,
  target: ViewBox,
  { start, width, reducedMotion }: AnimatedViewBoxOptions,
) {
  const shown = useRef(start)
  const shownWidth = useRef(width)
  const { x, y, width: viewWidth, height: viewHeight } = target

  useEffect(() => {
    shownWidth.current = width
    if (ref.current) draw(ref.current, shown.current, width)
  }, [ref, width])

  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const to = { x, y, width: viewWidth, height: viewHeight }
    const show = (view: ViewBox) => {
      shown.current = view
      draw(svg, view, shownWidth.current)
    }
    if (reducedMotion || viewBoxAttribute(shown.current) === viewBoxAttribute(to)) {
      show(to)
      return
    }
    const zoom = interpolateViewBox(shown.current, to)
    let begin: number | null = null
    // CSS hides the glow and the card while the view moves, so each frame stays cheap.
    svg.setAttribute("data-zooming", "")
    let frame = requestAnimationFrame(function step(now) {
      begin ??= now
      const t = Math.min(1, (now - begin) / zoom.durationMs)
      show(zoom.at(easeInOutCubic(t)))
      if (t < 1) frame = requestAnimationFrame(step)
      else svg.removeAttribute("data-zooming")
    })
    return () => {
      cancelAnimationFrame(frame)
      svg.removeAttribute("data-zooming")
    }
  }, [ref, x, y, viewWidth, viewHeight, reducedMotion])
}
