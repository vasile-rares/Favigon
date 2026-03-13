# Prismatic

Prismatic is a collaborative design-to-code and code-to-design platform. Designers compose UIs visually on a canvas, developers get structured, production-ready code. Both sides stay in sync through a shared **Intermediate Representation (IR)**.

Long-term goal: bidirectional sync between visual design and source code, where changes on either side reflect on the other.

Core principles when implementing features:
- Preserve parity between visual composition and programmatic output
- Reduce friction between designer and developer workflows
- Avoid coupling either side to tooling specific to the other

---

## Repository Structure

```
Backend/          .NET (C#), layered: API → Application → Domain → Infrastructure
  Prismatic.API/           Controllers, middleware, global exception handler
  Prismatic.Application/   Business logic, DTOs, service interfaces
  Prismatic.Domain/        Entities, domain rules
  Prismatic.Infrastructure/ Repositories, DbContext, external integrations
  Prismatic.Converter/     IR → HTML/CSS/React/Angular code generation
  Prismatic.Tests/         Unit/integration tests

Frontend/         Angular 18+ (standalone components, Signals)
  src/app/
    core/         Shared DTOs/models, cross-feature HTTP services, interceptors
    shared/       Reusable UI components
    features/
      auth/       Login, register
      canvas/     Visual design editor (main feature)
      dashboard/  Project listing
      profile/    User profile
      settings/   User settings
```

## Canvas Feature (`features/canvas/`)

The canvas is the core of the product.

- **pages/** — `canvas-page.component.ts` orchestrates the editor
- **services/** — focused single-responsibility services: `CanvasViewportService`, `CanvasHistoryService`, `CanvasClipboardService`, `CanvasElementService`, `CanvasKeyboardService`, `CanvasContextMenuService`, `CanvasPersistenceService`, `CanvasGenerationService`
- **mappers/** — `canvas-ir.mapper.ts` converts canvas elements ↔ IR tree
- **utils/** — `canvas-interaction.util.ts` (math: clamp, rounding, normalization, bounds), `canvas-label.util.ts`
- **components/** — toolbar, project panel (layers/pages), properties panel
- **canvas.types.ts** — shared TS types (Point, Bounds, ResizeState, HistorySnapshot, …)

Data flow: Canvas elements → IR tree → Backend converter API → HTML/CSS output.

---

## Key Conventions

**Backend**
- Thin controllers — delegate to Application services
- Business logic belongs in Application, not API or Domain
- Use repository interfaces (never depend on concrete Infrastructure implementations)
- Never expose entities directly; always use DTOs
- Auth: cookie-based JWT; validate resource ownership at service boundaries
- Database: PostgreSQL; follow existing schema and timestamp conventions
- Exceptions → HTTP translation handled centrally in middleware

**Frontend**
- Feature-scoped files stay inside their feature (`services/`, `utils/`, `mappers/` per feature)
- `core/` only for cross-feature models (DTOs matching backend) and HTTP services
- Canvas services are registered with `providers: [...]` on the component, not `providedIn: 'root'`
- Prefer Angular Signals over observables for local component state

**General**
- Keep backend DTOs and frontend models in sync — update both in the same change
- All user-facing text and error messages in English
- Match existing premium dark UI style; use CSS nesting; maintain visual consistency
