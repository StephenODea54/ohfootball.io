import { Card, CardContent } from "@/components/ui/card"

/** The card that holds a table of the Accuracy page. */
export function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** The class of the header row of each table. */
export const tableHeaderClass = "bg-muted/70 text-xs/5 uppercase tracking-wide"
