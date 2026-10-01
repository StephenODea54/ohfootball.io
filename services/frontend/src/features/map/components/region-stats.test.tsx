import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import { RegionStats } from "@/features/map/components/region-stats"

it("names each number of the state", () => {
  const html = renderToStaticMarkup(
    <RegionStats
      stats={[
        { value: "700+", label: "Programs" },
        { value: "88", label: "Counties" },
      ]}
    />,
  )

  expect(html).toContain("<dt")
  expect(html).toContain("700+")
  expect(html).toContain("Counties")
})
