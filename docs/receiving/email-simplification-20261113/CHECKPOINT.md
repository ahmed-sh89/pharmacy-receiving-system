# Receiving discrepancy email — 13 November 2026

Staging review branch `feature/receiving-email-simple-staging-20261113`. Production baseline `1da5ae0b4d2d9d9141eeb9db6d2206aa139cf4c2`. Application candidate `ab5f0b5ad9ad6578f2806a7c1cfeece381166253`.

- Centered Arabic greeting, short review request and existing closing in Arial. One detail table groups discrepancies by TO, optional Work Order and order date. Orderless extras stay grouped by receipt date. Ordered, Received and signed Diff remain visible. Negative rows show ناقص in red and positive rows show زيادة in green.
- Enter a Work Order once per TO or override it per item. These values belong to the open email preview and are read when copied. Outlook Web subject uses the active pharmacy code and Riyadh date.
- Focused email, Preview diagnostic gate and Production artifact checks passed locally. The Preview build declares Staging and embeds its backend ref. Product Owner verification still needs a narrow Outlook compose paste from the Staging link.
- No migrations, operational writes, backend changes or Production deployment in this task.
