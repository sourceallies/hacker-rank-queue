# HackerRank Queue Slack Bot

## Development

Make sure to have the following tools installed:

- `nvm` (optional)
- `node v14.15.5`
- `yarn`
- `docker`
- Heroku CLI

You will never have to run the code locally, other than to run tests.

To manually try out changes, you'll simply deploy to Heroku and actually use the bot in slack!

```bash
# Install dependencies
yarn install

# Login to Heroku CLI - only have to do this once
yarn docker:login

# Deploy the app after making changes
yarn docker:deploy
```

You don't have to commit anything before doing a deploy. Just make the change and deploy

> Just be aware if multiple people are working on it at the same time, you'll be fighting for who's change is the latest change

### Workflow

This repo uses [Conventional Commits](), and they're enforced by a PR check. For examples, just look at the repo history.

Here are the types of commits we use (and examples):

- [`feat: ...`](https://github.com/apklinker/hacker-rank-queue/commit/2d3e71b83b51ce9a4054098ad5d6dc665182e885) - Used when the commit introduces a new feature
- [`fix: ...`](https://github.com/apklinker/hacker-rank-queue/commit/439e8c6fd43255546b30aaab96e121dec271c9b7) - Fixing a bug in user facing code
- [`chore: ...`](https://github.com/apklinker/hacker-rank-queue/commit/e67d655eab0a546b58ae883b77d0bd755c9dff0f) - Refactor, fixing lint or test errors, formatting, etc
- `ci: ...` - When you update the CI
- [`docs: ...`](https://github.com/apklinker/hacker-rank-queue/commit/2d30931196b014996f8a52267a4bfd1fa850d167) - When you update the `README.md` or other documentation
- `BREAKING CHANGE: ...` - When there's a feature that leads to a completely different flow for users

Beceause of this, PRs can be either squashed or rebase and merged depending on your style of commiting. If you just commit all the time, limit PRs to a single scope, squash it, and fill out the commit as a conventional commit. If you have nice, clean, separated commits, feel free to rebase and merge once the commit lint passes.

## Useful links

- Slack App Config: <https://api.slack.com/apps/A01TFKZKPT7/general>
- Heroku App: <https://dashboard.heroku.com/apps/hacker-rank-queue>
- Spreadsheet Databases: <https://drive.google.com/drive/folders/1bCO8LllRNpysu65WOjBsUAZUnrDqXDX0?usp=sharing>
