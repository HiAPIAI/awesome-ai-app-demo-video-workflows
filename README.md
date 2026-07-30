# Awesome AI App Demo Video Workflows

Executable workflows for turning app screenshots and exported UI prototype states into polished, reproducible product demo videos.

> Bootstrap status: the `demo-v1` and `compiled-demo-v1` contracts, CLI names, dependencies, and lane boundaries are frozen. Core, render, and workflow implementations are developed in separate worktrees.

## Command contract

```text
npm run doctor -- [--strict]
npm run validate -- <demo.yaml>
npm run compile -- <demo.yaml> --out-dir <directory>
npm run render -- --compiled <compiled-demo-v1.json> --out-dir <directory>
npm run generate -- --request <hiapi-request.json> --out-dir <directory> [--confirm-preflight <token>]
npm test
```

All commands currently expose their frozen help contract. Feature implementation follows on `integration/app-demo-v1`.
