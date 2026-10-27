# SheetJS Community Edition 0.20.3

SheetJS Community Edition -- https://sheetjs.com/
Copyright (C) 2012-present SheetJS LLC. Apache License 2.0; see LICENSE.

Unmodified full browser artifact obtained from the authoritative distribution:
https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js

Independently compared byte-for-byte with `package/dist/xlsx.full.min.js` in
https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz. Both copies match.

SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`

The manifest records byte count and SHA-384 Subresource Integrity. Both HTML
entry points select this artifact. The worker imports this same local file;
version validation fails closed unless XLSX.version is exactly 0.20.3.
The Vite legacy-runtime copier includes the worker, guard and vendor directory.
No CDN fallback, npm xlsx dependency, or source map is deployed.

Vendor documentation identifies 0.20.3 as the current standalone full build:
https://docs.sheetjs.com/docs/getting-started/installation/standalone/

Security ranges fixed by this artifact:
- CVE-2023-30533: affected through 0.19.2; fixed since 0.19.3.
  https://cdn.sheetjs.com/advisories/CVE-2023-30533
- CVE-2024-22363: affected through 0.20.1; fixed since 0.20.2.
  https://cdn.sheetjs.com/advisories/CVE-2024-22363

The application keeps XLSX.utils, XLSX.SSF, XLSX.CFB, read/write and date/export
contracts. Input parsing alone is routed through the bounded worker. An exact
version and local hash do not replace future advisory monitoring; review vendor
releases explicitly before replacing this artifact.
