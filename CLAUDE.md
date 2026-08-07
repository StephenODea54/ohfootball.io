# ohfootball.io

## Absolute rules

These rules override every other rule in this file. Never circumvent them. Never ignore them.

1. Under NO circumstances may you ever, in code, docs, or commit message, reference `PLAN.md`,
   "the plan", a "stage" or "phase" or "task" or "issue" of a plan, or similar instruction meant
   to guide agentic development.
2. NEVER include co-author information in Git commits to indicate that the commit was created
   in part or whole by an LLM agent. Do not add `Co-Authored-By` lines. Do not add
   "Generated with" lines.

## Every prompt

Use the `caveman` skill on every single prompt. Start each response with it. Caveman applies to
chat output only. It never applies to code, commit messages, docs, or file content.

Always communicate with the `simple-english` skill (ASD-STE100 Simplified Technical English).
Where caveman and simple-english disagree, caveman controls chat prose and simple-english
controls everything written to a file.

## UI work

Use the `intentui` skill for every UI related task. This includes new components, edits to
existing components, stylesheets, layouts, and review of UI code. Load the skill before you
write the first line of UI code.

Use these MCP servers when they apply:

- `shadcn`: search and install components from the Intent UI registries through the shadcn CLI.
- `react-aria`: correct React Aria APIs and patterns. Most Intent UI components are built on
  React Aria, so check this server before you hand-write behavior.

Reference: https://design.intentui.com/docs/ai

## Model workflow

1. Plan the change with Fable (`claude-fable-5`).
2. Have Fable adversarially review its own plan.
3. Implement with Opus (`claude-opus-5`).
4. Have Fable adversarially review the code Opus wrote.

Adversarial review means the reviewer tries to break the work, not confirm it.

## Communication style

- Write comments and documentation with simple-english.
- Git commit messages are factual statements of work done. Use full sentences in paragraphs.
  No bulleted lists for changes. Always state the motivation for the change, how your changes
  achieve the stated goal, and any caveats or missing functionality.
- Never reference internal finding labels (for example, "This closes review findings A1, A2, and
  A7 and pre-pays the phase 9...") in commits, code, or docs. Commits are standalone public
  artifacts. They are not tied to chat sessions. Never include session narration ("a review pass
  found...", "verified in the browser...", "suite at N tests", "the project's pre-GA posture
  allows...", and similar). No plan bookkeeping ("checked off", phase tags on feature commits).
  No AI-vocabulary (em dashes; negative parallelism; announcer phrases and sentences; the words
  "load-bearing", "seam", "epilogue", "byte-identical", "honest"). Keep every technical fact,
  motivation, and caveat.
- Keep sentences short. Do not chain long thoughts in one sentence.

## Code style

- Break files into logical, well-scoped components.
- Include unit tests, regression tests, and linting.
- Be brief in code, but not at the expense of readability and maintainability.
- The autoformatter enforces code style.

## Workflow

- Aspire to 100% line, branch, and function coverage in unit tests.
- Commit to Git regularly. Always pause for user input after each commit. Break work into
  multiple commits where that fits.
- Always unit test and lint before commit, through a pre-commit hook.
- Always format code to the style guides, through a pre-commit hook.
- Always plan changes first, adversarially review the plan, then implement the feature.
