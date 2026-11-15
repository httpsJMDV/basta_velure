# Loved-IT project organization

Open `Loved-IT.code-workspace` in VS Code to work with this project alone. It gives the Explorer a **Loved-IT** root and hides generated files and local archives.

```text
basta_velure/
├── .github/workflows/       # Automated CI/CD
├── backend/                # Laravel API and backend tests
├── frontend/               # React website and storefront tests
├── mobile/                 # Flutter Android app
├── docker/                 # Website container configuration
├── tools/cicd/             # Reusable evidence and PDF report tools
├── docs/
│   ├── api/                # API contracts
│   ├── defense/            # Defense preparation guide
│   ├── reports/            # Feature audits and shipping notes
│   └── cicd/
│       ├── evidence/       # Sanitized classroom verification evidence
│       └── submission/     # PDF to review and submit
├── guides/                 # User guides for marketplace roles
├── setup/                  # Existing setup and release scripts
├── .local/                 # Local files; excluded from Git
├── Dockerfile
├── Loved-IT.code-workspace
└── README.md
```

## Quick links

- [Defense preparation](defense/DEFENSE_GUIDE.md)
- [CI/CD laboratory instructions](cicd/README.md)
- [Submission PDF](cicd/submission/Loved-IT_CICD_Lab_Report_BSIT3C_ITEL304.pdf)
- [Report tooling](../tools/cicd/README.md)
- [Mobile feature audit](reports/mobile-feature-audit-2026-11-14.md)
- [Shipping and offers notes](reports/shipping-and-offers.md)

The defense/audit/shipping notes are dated snapshots. Current API contracts and application code take precedence over older proposals.

## What belongs in GitHub

Commit application source, tests, workflows, Docker configuration, dependency manifests/lockfiles, reusable tools, documentation, the reviewed submission PDF and sanitized classroom evidence.

Keep database backups, actual credentials, private documents, APK binaries, local logs, installers, generated dependencies and one-off release utilities out of Git. GitHub Actions uploads build/test artifacts separately, and GHCR stores container images.

## Local archive

```text
.local/
├── logs/                   # Previous frontend/backend/Flutter check logs
├── backups/database/       # Preserved SQL backups
├── artifacts/
│   ├── cicd/               # Raw lab evidence and report previews
│   ├── releases/           # APKs and previous deployment bundles
│   └── screenshots/        # Historical UI checks
├── archive/
│   ├── scripts/            # One-off historical release utilities
│   ├── pull-requests/      # Previous PR drafts
│   └── workspace-moves.json # Inventory of the organization changes
└── installers/             # Reserved for local installers; excluded from Git
```

The archive preserves earlier work without adding it to the repository. Old release utilities are historical references and should not be executed as current deployment instructions. Downloads may also contain convenient PDF export copies; the project’s reviewed copy lives under `docs/cicd/submission/`.
