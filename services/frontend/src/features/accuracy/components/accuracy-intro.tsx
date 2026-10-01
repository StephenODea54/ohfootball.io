import { Heading } from "@/components/ui/heading"
import { Text } from "@/components/ui/text"

/** The heading of the Accuracy page and what it is for. */
export function AccuracyIntro() {
  return (
    <header className="max-w-4xl">
      <p className="font-semibold text-primary-subtle-fg text-sm/6 uppercase tracking-[0.18em]">
        Accuracy
      </p>
      <Heading className="mt-3 text-4xl/none sm:text-5xl/none">
        How Good Are The Predictions?
      </Heading>
      <Text className="mt-5 max-w-3xl text-base/7 sm:text-lg/8">
        This page grades the model predictions: overall metrics, how often the favorite won, how
        close the probabilities were to what happened, and where the model did atrociously.
      </Text>
    </header>
  )
}
