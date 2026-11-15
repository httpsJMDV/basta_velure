# Loved-IT

[![CI/CD](https://github.com/httpsJMDV/basta_velure/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/httpsJMDV/basta_velure/actions/workflows/ci-cd.yml)

Loved-IT is a Philippine marketplace with a React/TypeScript website, Laravel REST API and Flutter Android app. Buyers, sellers, administrators, riders, hub staff and courier companies share the order, messaging and logistics platform.

- Website: https://loved-it.shop
- API: https://api.loved-it.shop
- Classroom pipeline: [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml)
- Full local development setup: [SETUP.md](SETUP.md)
- Lab procedures and evidence: [docs/cicd/README.md](docs/cicd/README.md)

## Local checks

Use Node.js 22.12+ (22 LTS), PHP 8.4, Composer 2 and MySQL 8. Install frontend packages with `npm ci` in `frontend/`, then run:

```sh
npm run lint
npm test
npm run build
```

Install backend dependencies with `composer install` in `backend/`. Configure the separate `velure_test` database as described in SETUP.md, run additive migrations on it and run `php artisan test --compact`. Tests refuse databases whose names do not end in `_test`. Do not use a production database, destructive migration reset or real AI credentials for tests.

## Run the Docker website

```sh
docker build -t loved-it-web:local .
docker run --rm -d --name loved-it-web -p 3000:8080 loved-it-web:local
```

Open http://localhost:3000. Health is at `/healthz`; the classroom output is at `/ci-status.json`. The SPA supports direct routes such as `/products/133`. `/api/` proxies to the existing Loved-IT API. This image contains the website, not the Laravel server, MySQL database or Flutter APK. Google sign-in requires a public OAuth client ID/build and authorized origin configured separately. Standard token sign-in uses the shared API.

After the trusted main workflow publishes an image:

```sh
docker pull ghcr.io/httpsjmdv/basta_velure:main
docker run --rm -d --name loved-it-published -p 3001:8080 ghcr.io/httpsjmdv/basta_velure:main
docker stop loved-it-published
```

A private GHCR package requires `docker login ghcr.io` with an appropriately scoped token. No registry password, cloud API key, `.env`, database dump or signing key is copied into the image.

## Automated CI/CD

Main pushes, `v*` version tags, pull requests targeting main and manual dispatches run lint, frontend tests, the full Laravel suite against an isolated MySQL service and a production website build. PHP checks are syntax linting; frontend checks use the existing Oxlint rules. The CI artifact retains the website build and JUnit results for seven days.

Only trusted main/version-tag runs may publish after CI passes. Docker runtime checks run before publishing; the published image is then pulled and run again. Pull requests never log in to GHCR or publish images. Actions are pinned to verified commit SHAs and registry writes are limited to the Docker job. `DEMO_API_KEY` is a classroom dummy repository secret whose presence is checked without printing its value; publishing uses the automatically issued `GITHUB_TOKEN` with `packages: write`.

This is continuous delivery to GHCR. The workflow does not deploy the container to the live website or change the API hosting/scheduler. Existing Laravel Cloud and Cloudflare hosting are separate. Docker builds use `/api/v1` and must not replace Cloudflare artifacts that expect a different API origin.
