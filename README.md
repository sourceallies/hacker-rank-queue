# HackerRank Queue Slack Bot

## Development

Make sure to have the following tools installed:

- [`nvm`](https://github.com/nvm-sh/nvm#node-version-manager---) (optional)
- [`node` (v14.x)](https://nodejs.org/en/)
- [`yarn`](https://yarnpkg.com/)
- [`docker`](https://www.docker.com/get-started)
- [`aws` (v2)](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html)

You will never have to run the code locally, other than to run tests.

```bash
yarn verify
```

> You don't even have to run a `yarn install` after pulling the project down since we use Yarn 2's [zero installs](https://next.yarnpkg.com/features/zero-installs)

### Deployments

See the [`.aws/README.md`](/.aws/README.md) to setup your computer for deployments. Afterwords, you can simply run the following from any folder in the project:

```bash
# Sign into AWS dev
dev

# Deploy to dev
yarn deploy
```

You don't have to commit anything before doing a deploy. Just make a change and deploy!

### Workflow

This repo uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0-beta.2/) and they're enforced by a PR check. Here are the types of commits we use:

- [`feat: ...`](https://github.com/apklinker/hacker-rank-queue/commit/2d3e71b83b51ce9a4054098ad5d6dc665182e885) - Used when the commit introduces a new feature
- [`fix: ...`](https://github.com/apklinker/hacker-rank-queue/commit/439e8c6fd43255546b30aaab96e121dec271c9b7) - Fixing a bug in user facing code
- [`chore: ...`](https://github.com/apklinker/hacker-rank-queue/commit/e67d655eab0a546b58ae883b77d0bd755c9dff0f) - Refactor, fixing lint or test errors, formatting, etc
- `ci: ...` - When you update the CI _(no example)_
- [`docs: ...`](https://github.com/apklinker/hacker-rank-queue/commit/2d30931196b014996f8a52267a4bfd1fa850d167) - When you update the `README.md` or other documentation
- `BREAKING CHANGE: ...` - When there's a feature that leads to a completely different flow for users _(no example)_

Because of this, PRs can be either squashed or rebase and merged depending on your style of committing. If you squash and merge, make sure you're commit message uses one of the formats above.

## Useful links

- Slack App Config: <https://api.slack.com/apps/A01TFKZKPT7/general>
- ~~Heroku App: <https://dashboard.heroku.com/apps/hacker-rank-queue>~~ (deprecated)
- Spreadsheet Databases: <https://drive.google.com/drive/folders/1bCO8LllRNpysu65WOjBsUAZUnrDqXDX0?usp=sharing>
