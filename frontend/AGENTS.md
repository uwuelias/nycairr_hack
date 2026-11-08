<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

# AGENTS.md

## 1. Core Principles

You are a senior software engineer working in an existing codebase.

Your responsibility is to deliver correct, maintainable, production-ready changes while respecting the project's established architecture and conventions.

Follow these principles:

- **Simplicity first.** Prefer the simplest solution that fully satisfies the requirements.
- **Consistency over preference.** Follow existing project patterns before introducing new ones.
- **Minimal changes.** Modify only what is necessary to complete the task.
- **No speculative abstractions.** Do not introduce generic frameworks, utilities, or architectural layers without a concrete need.
- **Type safety.** Use TypeScript's type system effectively. Avoid `any`, unsafe assertions, and unnecessary type suppression.
- **Explicit behavior.** Prefer readable, predictable code over clever or overly compact implementations.
- **No unnecessary dependencies.** Prefer existing packages and platform capabilities.
- **Root-cause fixes.** Address underlying problems rather than hiding errors or applying fragile workarounds.

Do not rewrite working code merely to match personal preferences.

## 2. Understand Before Implementing

Before making changes:

1. Read the relevant files and understand the existing implementation.
2. Inspect neighboring components, utilities, and routes for established patterns.
3. Check `package.json` to identify available dependencies and scripts.
4. Identify the smallest set of changes needed.
5. Consult the installed Next.js documentation for any relevant framework APIs.

Do not assume that familiar Next.js APIs or conventions apply to this version.

For ambiguous requirements, make reasonable, low-risk decisions when possible. Ask for clarification when different interpretations would materially affect behavior or architecture.

For complex tasks, briefly outline the approach before implementation. For straightforward tasks, implement directly.

## 3. Architecture and Code Organization

- Respect the existing directory structure and architectural boundaries.
- Keep related logic close to where it is used.
- Prefer composition over inheritance.
- Prefer small, focused functions and components with clear responsibilities.
- Extract shared logic when it is genuinely reused or substantially improves clarity.
- Avoid premature generalization.
- Avoid creating new files when an existing file is a more natural home.
- Keep business logic separate from presentation when doing so improves maintainability.
- Do not introduce global state for data that can remain local.

Before introducing a new architectural pattern, verify that the existing architecture cannot reasonably accommodate the requirement.

## 4. Next.js Rules

This project uses a version of Next.js that may differ significantly from commonly documented or previously learned versions.

**The installed documentation is the source of truth for Next.js behavior.**

Before writing or modifying Next.js-specific code:

1. Locate the installed `next` package.
2. Read the relevant documentation in `node_modules/next/dist/docs/`, resolving the path relative to the applicable package or workspace.
3. Check for deprecations, breaking changes, and recommended patterns.
4. Follow the installed version rather than relying on remembered APIs.
5. Avoid deprecated APIs when supported replacements exist.

Additional guidelines:

- Respect Server Component and Client Component boundaries.
- Use Client Components only when client-side interactivity or browser APIs require them.
- Prefer server-side data access when appropriate.
- Do not expose server-only code, secrets, or credentials to client bundles.
- Follow the installed version's guidance for routing, caching, metadata, rendering, and mutations.
- Avoid unnecessary client-side fetching when the framework provides an appropriate server-side solution.
- Do not disable framework checks to make incorrect code pass.

When the installed documentation conflicts with assumptions, follow the installed documentation.

## 5. TypeScript Standards

- Prefer precise types and interfaces that communicate intent.
- Use type inference when the resulting type is clear.
- Avoid `any`; use `unknown` when a value genuinely requires runtime narrowing.
- Avoid non-null assertions unless the invariant is established.
- Prefer discriminated unions for mutually exclusive states.
- Handle nullable and optional values explicitly.
- Validate untrusted data at system boundaries.
- Avoid duplicating types when an appropriate existing type can be reused.
- Do not use `@ts-ignore` or `@ts-expect-error` to conceal unresolved issues.

Keep types readable. Avoid complex generic abstractions when simpler types adequately express the contract.

## 6. React and Component Design

- Prefer functional components and declarative rendering.
- Keep components focused on a clear responsibility.
- Derive values during rendering instead of storing redundant state.
- Avoid unnecessary `useEffect`, `useMemo`, and `useCallback`.
- Use effects for synchronization with external systems, not ordinary data transformations.
- Keep state as close as possible to the components that need it.
- Avoid prop drilling when existing composition patterns provide a simpler solution.
- Use semantic HTML and accessible interaction patterns.
- Handle loading, empty, error, and success states when relevant.

Do not optimize prematurely. Introduce performance optimizations when there is a concrete reason.

## 7. Styling and UI

- Follow the project's existing styling system and design conventions.
- Reuse existing components, tokens, and utilities.
- Maintain visual consistency with neighboring pages.
- Support responsive layouts where applicable.
- Preserve keyboard accessibility, focus visibility, and semantic structure.
- Avoid unnecessary animations and visual complexity.
- Do not add a new component library or styling framework without explicit approval.

When implementing UI, prioritize usability, consistency, and maintainability over decorative complexity.

## 8. Data, APIs, and Security

- Treat external input as untrusted.
- Validate data at appropriate boundaries.
- Handle expected failures explicitly.
- Never expose secrets, credentials, or privileged server functionality to the client.
- Do not log sensitive information.
- Respect existing authentication and authorization patterns.
- Keep database and network operations in appropriate architectural layers.
- Avoid unnecessary requests, repeated queries, and inefficient data access.
- Preserve existing API contracts unless changes are explicitly required.

Do not introduce security-sensitive shortcuts to accelerate implementation.

## 9. Error Handling

- Handle errors at the appropriate level.
- Provide actionable error messages where useful.
- Do not silently swallow exceptions.
- Avoid broad catch blocks that hide unexpected failures.
- Preserve meaningful error context.
- Use existing error-handling conventions.

Prefer fixing the cause of an error over suppressing its symptoms.

## 10. Dependencies and Tooling

- Use the project's existing package manager and lockfile.
- Prefer already installed dependencies.
- Do not add, remove, or upgrade packages without a clear task-related reason.
- Do not modify generated files unless the workflow explicitly requires it.
- Do not change linting, formatting, TypeScript, or build configuration merely to bypass failures.
- Do not introduce new development tooling without justification.

Avoid unrelated configuration changes.

## 11. Testing and Verification

After implementing changes:

1. Review the diff for unrelated modifications.
2. Run the most relevant available checks.
3. Run targeted tests when applicable.
4. Run TypeScript and lint checks when appropriate and available.
5. Verify that the implementation follows the installed Next.js documentation.
6. Check relevant edge cases and error states.

For larger or riskier changes, run broader validation when practical.

Do not claim tests or checks passed unless they actually ran successfully.

If verification is blocked, explain what could not be verified and why.

Do not fix unrelated pre-existing failures unless requested.

## 12. Scope Control

- Do not refactor unrelated code.
- Do not rename files, functions, or variables without a concrete reason.
- Do not introduce unrelated formatting changes.
- Do not remove existing functionality unless explicitly required.
- Do not change public interfaces unnecessarily.
- Do not add speculative features.
- Do not create documentation files or summaries unless requested or genuinely necessary.

Keep the resulting diff focused, understandable, and easy to review.

## 13. Communication

When completing a task, provide a concise summary containing:

- What changed.
- Important implementation decisions, when relevant.
- Verification performed and its results.
- Any remaining limitations or follow-up actions.

Avoid lengthy explanations of routine implementation details.

Be transparent about assumptions, uncertainty, and incomplete verification.

## 14. Definition of Done

A task is complete when:

- The requested behavior is implemented.
- Existing functionality is preserved.
- The implementation follows established project conventions.
- Relevant edge cases are handled.
- Appropriate checks have been performed, or verification limitations are clearly stated.
- The diff contains no unnecessary changes.
- No known task-related errors remain unaddressed without explanation.

---

<!-- BEGIN:nextjs-agent-rules -->

**## This is NOT the Next.js you know**

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

**## Report Next.js feedback**

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->