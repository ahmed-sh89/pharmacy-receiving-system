# Receiving email — Work Order by item

Staging review branch `feature/receiving-email-item-wo`. Production baseline `6c82f95ae1c3d10915509917e8802e66f3510089`. Application candidate `14e625d94b8c42454f3b641d245a9967fcce2131`.

- Each TO starts collapsed above the preview. Expand it to enter a WO beside each discrepancy item. Closing the list retains entries until the preview closes. Long lists scroll.
- The TO and date remain in the header. A seven-column table starts with WO. Repeated WO numbers share a background within a TO. Assigned WOs use dark bold text and a palette starting with lavender and sand, separate from the blue column header and the discrepancy status colors. The six-color palette repeats if needed and the printed WO remains the identifier. A blank field renders an uncolored dash. Numeric columns use Ord., Rec. and Diff.
- The focused email suite verifies row order, leading zeros, repeated WOs, cross-TO isolation, blanks, and matching clipboard HTML and text. The staging build was verified against the Staging backend configuration.
- Product Owner approved PR #59 with the WO color adjustment for direct Production release after checks. Manual Outlook verification remains available after deployment.
