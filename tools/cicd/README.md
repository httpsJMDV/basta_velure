# CI/CD report tools

These tools live inside the Loved-IT project. They create reports and collect verification evidence; they do not deploy the marketplace or approve/merge pull requests.

## Install and run

From the project root:

```sh
npm ci --prefix tools/cicd
npm run check --prefix tools/cicd
npm run verify:pdf --prefix tools/cicd
npm run report --prefix tools/cicd
```

Use Node.js 22.13 or later. PDF generation uses installed Google Chrome on Windows when available. Otherwise install the matching Playwright browser with `npx playwright install chromium` inside this directory. Set `LOVED_IT_CHROME` to use another Chrome executable.

`npm run report` writes a review copy to `.local/artifacts/cicd/`. It does not overwrite the published submission. After reviewing it, use `npm run report:publish --prefix tools/cicd` from the project root to regenerate, verify and export it to `docs/cicd/submission/`.

The committed report and screenshots describe the recorded laboratory runs. Rebuilding uses the current repository source for the appendices; it does not prove that untested later changes passed the historical runs. Each member must review their contribution/reflection draft before submission.

## Optional evidence refresh

```sh
npm run collect:evidence --prefix tools/cicd
npm run collect:registry --prefix tools/cicd
npm run capture:evidence --prefix tools/cicd
npm run registry:verify --prefix tools/cicd
npm run status --prefix tools/cicd
```

GitHub reads use `GH_TOKEN` / `GITHUB_TOKEN`, or the existing Git credential manager. Tokens are never written to the report, evidence files or console. Supply credentials through the environment or credential manager, never source code. Registry verification uses anonymous access to the public image.

Raw logs, downloaded registry archives, generated HTML, PDF previews and rendered page checks stay in `.local/artifacts/cicd/`. Fresh checkouts bootstrap from the sanitized evidence under `docs/cicd/evidence/`. School logos in `assets/` came from the supplied laboratory handout.
