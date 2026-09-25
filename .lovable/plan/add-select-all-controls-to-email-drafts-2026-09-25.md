# Add select-all controls to Email Drafts

## What will change
- Add a checkbox to every draft row and a select-all checkbox in the table header.
- Show the selected count and a bulk Delete action above the list when drafts are selected.
- Reuse the existing confirmation dialog for one or many drafts, with clear count-based wording.
- Keep Edit and single-draft Delete actions unchanged.
- Clear removed selections after deletion or refresh, and visually mark selected rows.
- Add a customer-facing What's New note for bulk draft selection.

## Technical details
- Keep this frontend-only and use the existing checkbox, button, table, dialog, and notification components.
- Delete selected draft IDs in one authenticated database request, relying on existing row-level access controls.
- Add focused regression coverage for select-all and bulk-delete behavior, then verify the Drafts screen and current diagnostics.
