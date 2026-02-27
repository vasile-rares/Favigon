# Copilot Instructions for Prismatic

## Scope

- Apply these instructions to the entire repository.

## Project Vision

- Prismatic is a collaborative design-to-code and code-to-design platform.
- Designers should be able to work only in a visual canvas workflow, and developers should be able to work only in structured source code.
- The product direction is bidirectional synchronization between visual design and code through a shared intermediate representation.
- When proposing or implementing features, preserve parity between visual composition and programmatic implementation.
- Prefer changes that reduce designer/developer workflow friction and avoid coupling either side to the other side's tooling.

## Big Picture Architecture

- Prismatic is a full-stack app with a .NET backend and Angular frontend.
- Backend follows a layered design: API -> Application -> Domain -> Infrastructure.
- Keep request flow consistent: controller orchestration in API, business logic in services, persistence in repositories/DbContext.
- Register dependencies through each layer's DI configuration instead of ad-hoc wiring.

## Auth, Security, and Error Handling

- Preserve cookie-based JWT authentication behavior unless a migration is explicitly requested.
- Keep authorization at endpoint/service boundaries and enforce resource ownership checks.
- Centralize exception-to-HTTP mapping in middleware; avoid duplicating error translation in controllers.
- Ensure all error messages and user-facing text are in English; translate any Romanian text if found.

## Data and Persistence Conventions

- Treat PostgreSQL as the primary persistence target and keep provider-specific mappings compatible with existing schema patterns.
- Prefer extending existing repositories/services rather than introducing parallel data-access paths.
- Respect automatic timestamp handling and existing mapping profiles when adding entities/DTOs.

## Developer Workflows

- Use workspace tasks for backend build/run when available.
- Use standard Angular CLI commands for frontend development and verification.
- After backend code changes, validate with at least one successful backend build.

## Integration Notes (Backend <-> Frontend)

- Keep backend/ frontend contracts aligned when changing routes, DTO shapes, or auth behavior.
- Preserve credentialed frontend requests for authenticated API flows unless auth strategy is intentionally changed.
- When introducing new backend capabilities, ensure frontend service contracts are updated in the same change.

## Design & UI Guidelines

- Follow the design philosophy and component styling of **PrimeUI** (https://primeui.com/), specifically the Dark Mode theme.
- Ensure all new UI components match the "premium" look and feel established in the Project Dashboard and Canvas.
- Use CSS nesting to organize styles hierarchically and improve readability.

## Change Guidelines for AI Agents

- Make minimal, focused changes and avoid unrelated refactors.
- Keep public contracts stable unless explicitly asked to evolve them.
- Favor consistency with existing naming, folder structure, and coding style over new patterns.
- Avoid excessive or redundant comments.

