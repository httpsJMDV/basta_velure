# ITEL 304 — CI/CD laboratory

**Section:** BSIT 3C · **Instructor:** Jeremy Reyes · **Project:** Loved-IT

**Members:** Jay Mark Del Valle, King Ordoña, Liam Rubiales, Amaru Jay Balmes.

The handout asks students to adapt the sample SIS pipeline to their ongoing project. This implementation uses Loved-IT's actual website and Laravel test suite rather than creating an unrelated sample application.

## Requirements and implementation

| Requirement | Implementation |
| --- | --- |
| Source repository | https://github.com/httpsJMDV/basta_velure |
| Workflow | `.github/workflows/ci-cd.yml` |
| Lint | Existing frontend Oxlint plus PHP syntax lint |
| Automated tests | Storefront pricing/output tests and the full Laravel suite |
| Build | TypeScript and Vite production build |
| Container | Multi-stage root `Dockerfile`; unprivileged Nginx on 8080 |
| Registry | `ghcr.io/httpsjmdv/basta_velure` |
| Secret | Dummy `DEMO_API_KEY`; only its presence is logged |
| Delivery guard | Docker job `needs: ci`; PR publishing is skipped |
| Runtime verification | Built image on 3000; pulled published image on 3001 |

## Reproduce

1. Follow the root README to run local lint, frontend tests/build and Laravel tests.
2. In repository Settings → Secrets and variables → Actions, create `DEMO_API_KEY` with the handout's dummy value `classroom-demo-12345`. Never substitute a real key.
3. Open a feature PR to main. Confirm that CI runs and Docker publishing is skipped.
4. For failure detection, change only the expected classroom message in `frontend/tests/storefront.test.mjs` on the lab PR branch. Push it, observe the test failure, restore it and push again. Never merge the intentionally failing revision.
5. Merge the passing PR with a merge commit. Main CI must pass before Docker publishing begins.
6. Open the package, copy the actual tag, pull it and run it using the root README commands. The workflow also executes this pull/run demonstration on the GitHub runner.
7. Create a classroom version tag such as `v1.0.0-cicd-lab.1`. Verify that the corresponding semver and commit tags appear in GHCR.
8. For the image modification challenge, update the public classroom release message and its version/assertions together, run CI and verify the new message from the published container. This changes the probe output, not marketplace prices or order behavior.

## Evidence and report

The reviewed PDF is in [submission/](submission/). Sanitized run summaries and screenshots are in [evidence/](evidence/). Reusable generation/verification scripts are in [tools/cicd](../../tools/cicd/README.md); raw logs and generated previews stay in `.local/artifacts/cicd/`.

The submission bundle contains the report, individual answer/reflection worksheets, screenshots, raw Actions results and an evidence manifest with run URLs and image digests. Failed test evidence must come from a real failed run; successful publication and version tags must be backed by actual GHCR records.

Docker Desktop is not installed on the development PC. Container build, pull and HTTP execution are demonstrated on the GitHub-hosted Ubuntu runner; this limitation must be stated in the report. The live production hosting is not replaced by the classroom container.

Project roles in `frontend/src/pages/AboutUsPage.tsx`, `amaru.md`, `king.md` and `liam.md` describe existing team responsibilities. Do not present them as proof that a member performed a CI/CD lab task. Each member must review the work, record their actual contribution and personalize their own reflection and individual answers before submission.

## Primary references

- https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- https://docs.docker.com/build/ci/github-actions/
- https://docs.docker.com/build/building/multi-stage/
