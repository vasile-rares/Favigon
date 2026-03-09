# Copilot Instructions for Prismatic

## Scope

These guidelines apply to the entire repository.

## Project Vision

Prismatic is a collaborative design-to-code and code-to-design platform.

Designers should work primarily through a visual canvas workflow, while developers interact with structured source code.
The long-term goal is bidirectional synchronization between visual design and code through a shared intermediate representation.

When proposing or implementing features:

* Preserve parity between visual composition and programmatic implementation.
* Prefer solutions that reduce friction between designer and developer workflows.
* Avoid coupling either side to tooling specific to the other workflow.

## Architecture (Required)

Backend follows a layered architecture:

API → Application → Domain → Infrastructure

General responsibilities:

* **API**: request handling, routing, and orchestration.
* **Application**: business logic and service coordination.
* **Domain**: core entities and domain rules.
* **Infrastructure**: persistence, external services, and integrations.

Guidelines:

* Controllers should remain thin and delegate work to services.
* Business logic belongs in Application services.
* Persistence logic belongs in repositories or DbContext.
* Application depends on repository **interfaces**, not Infrastructure implementations.
* Dependencies should be registered through each layer’s DI configuration.

## Authentication and Security

* Authentication uses cookie-based JWT unless explicitly changed.
* Authorization checks should happen at endpoint or service boundaries.
* Resource ownership must be validated for user-scoped data.
* Exception-to-HTTP translation should be handled centrally in middleware.
* All user-facing messages and errors must be written in English.

## Data and Persistence

* PostgreSQL is the primary database.
* Maintain compatibility with existing schema conventions and mappings.
* Entities should not be exposed directly through API responses; use DTOs.
* Reuse existing mapping profiles when converting between entities and DTOs.
* Respect existing timestamp conventions when adding entities.

## Backend ↔ Frontend Contracts

* Keep API routes and DTO shapes aligned with frontend services.
* When changing backend endpoints or response models, update the frontend contracts in the same change.
* Authenticated frontend requests should continue using credentialed requests unless the auth strategy changes.

## Developer Workflows

* Use workspace tasks for backend build/run when available.
* Use standard Angular CLI commands for frontend development.
* After backend changes, ensure the backend builds successfully.

## Coding Guidelines

* Prefer reusing existing services, utilities, and abstractions when possible.
* Avoid duplicating logic that already exists in the repository.
* Keep implementations simple and consistent with existing patterns.
* Favor minimal and focused changes over broad refactors unless explicitly requested.

## UI and Styling

* Maintain the premium UI style established.
* Ensure new components visually align with existing UI patterns.
* Use CSS nesting to organize styles hierarchically where appropriate.
