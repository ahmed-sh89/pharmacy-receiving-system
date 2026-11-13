# Receiving email — Work Order by item

Staging review branch `feature/receiving-email-item-wo`. Production baseline `6c82f95ae1c3d10915509917e8802e66f3510089`. Application candidate `ef340453189bc02e74a1009f9c98413cb6c05961`.

- Each TO starts collapsed above the preview. Expand it to enter a WO beside each discrepancy item. Closing the list retains entries until the preview closes. Long lists scroll.
- The TO and date remain in the header. A seven-column table starts with WO. Repeated WO numbers share a background within a TO. The six-color palette repeats if needed and the printed WO remains the identifier. A blank field renders an uncolored dash. Numeric columns use Ord., Rec. and Diff.
- The focused email suite verifies row order, leading zeros, repeated WOs, cross-TO isolation, blanks, and matching clipboard HTML and text. The staging build was verified against the Staging backend configuration.
- Next action: try a shared WO, a different WO and a blank field, then copy into Outlook to review the narrow-window layout. Production release requires separate approval.
