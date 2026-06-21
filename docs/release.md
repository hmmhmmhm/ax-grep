# Release

## npm Trusted Publisher

Configure npm once before publishing from GitHub Actions:

- Package settings: `https://www.npmjs.com/package/ax-grep/access`
- Publisher: GitHub Actions
- Organization or user: `hmmhmmhm`
- Repository: `ax-grep`
- Workflow filename: `publish.yml`
- Environment name: leave blank
- Allowed actions: `npm publish`

After the trusted publisher is saved, publish a release by pushing a version tag:

```sh
git tag v0.1.2
git push origin v0.1.2
```

The workflow uses GitHub OIDC instead of an npm token and runs `npm publish`.
For GitHub Actions and public packages, npm automatically publishes provenance
attestations when trusted publishing is used.
