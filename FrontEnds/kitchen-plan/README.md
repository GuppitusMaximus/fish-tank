# Kitchen Plan

Kitchen Plan is the household dinner dashboard for two adults. It shows fourteen dinner dates, a three-day ingredient review, shopping and a private recipe library. SQLite is the accepted source for both the dashboard and the read-only Meals calendar. A fresh installation has empty dinner dates. The bundled Paprika archive provides recipe choices. The September meal plan and static ICS are historical fixtures.

Use the private app to record ingredient availability, compare proposed replacements and their shopping changes, accept a choice, or Undo it. The public subscription URL is a secret. Copy it from the private app when setting up Proton Calendar.

## Run locally

Use Node.js 22.13 or newer. Run `npm start` to start the service, `npm test` for the tests and `npm run check` for syntax checks. Local data defaults to the ignored var directory.

## Household operations

Use [deployment and recovery instructions](deploy/operations.md) for the service, backup and feed configuration. The household's approved access route and device setup are recorded in the FishTank Planning repository at `docs/guides/kitchen-plan-meals.md`. Future orchestrator sessions should start there and use `skills/kitchen-plan/meals-calendar/SKILL.md` for dinner changes and subscription verification.
