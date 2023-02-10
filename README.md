# HackerRank Queue Slack Bot

## Development

Make sure to have the following tools installed:

- [`nvm`](https://github.com/nvm-sh/nvm#node-version-manager---) (optional)
- [`node` (v18.x)](https://nodejs.org/en/)
- [`pnpm`](https://pnpm.io/)
- [`docker`](https://www.docker.com/get-started)
- [`aws` (v2)](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html)

You will never have to run the code locally, other than to run tests.

```bash
pnpm verify
```

### Deployments

See the [`.aws/README.md`](/.aws/README.md) to setup your computer for deployments. Afterwords, you can simply run the following from any folder in the project:

```bash
# Sign into AWS dev
dev

# Deploy to dev
pnpm deploy
```

You don't have to commit anything before doing a deploy. Just make a change and deploy!

### Workflow

This repo uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0-beta.2/). Here are the types of commits we use:

- [`feat: ...`](https://github.com/sourceallies/hacker-rank-queue/commit/2d3e71b83b51ce9a4054098ad5d6dc665182e885) - Used when the commit introduces a new feature
- [`fix: ...`](https://github.com/sourceallies/hacker-rank-queue/commit/439e8c6fd43255546b30aaab96e121dec271c9b7) - Fixing a bug in user facing code
- [`chore: ...`](https://github.com/sourceallies/hacker-rank-queue/commit/e67d655eab0a546b58ae883b77d0bd755c9dff0f) - Refactor, fixing lint or test errors, formatting, etc
- `ci: ...` - When you update the CI _(no example)_
- [`docs: ...`](https://github.com/sourceallies/hacker-rank-queue/commit/2d30931196b014996f8a52267a4bfd1fa850d167) - When you update the `README.md` or other documentation
- `BREAKING CHANGE: ...` - When there's a feature that leads to a completely different flow for users _(no example)_

On feature branches, don't worry about doing conventional commits. Instead, just name the PR According to the patterns above, and scope it to just that one thing. When you squash and merge (the only allowed way to merge), the commit message will default to a conventional commit. Fill out a description if you want, but leave the title of the commit untouched.

## Useful links

- Slack App Config: <https://api.slack.com/apps/A01TFKZKPT7/general>
- Spreadsheet Databases: <https://drive.google.com/drive/folders/1bCO8LllRNpysu65WOjBsUAZUnrDqXDX0?usp=sharing>

### Running Locally

1. Create a `.env` file at the root of the project and add the following entries

   ```
   INTERVIEWING_CHANNEL_ID=
   ERRORS_CHANNEL_ID=
   SPREADSHEET_ID=1ChOEjl5l_Uh5dTd_fRjGJt8z7bFNNOwPlzgRnhOLgTY
   REQUEST_EXPIRATION_MIN=15
   PORT=3000
   MODE=dev
   SLACK_BOT_TOKEN=
   SLACK_SIGNING_SECRET=
   GOOGLE_SERVICE_ACCOUNT_EMAIL=
   GOOGLE_PRIVATE_KEY=
   ```

   - `INTERVIEWING_CHANNEL_ID`, `ERRORS_CHANNEL_ID`, and `SPREADSHEET_ID` can be found in [`cdk.json`](.aws/cdk.json)
   - `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` come from AWS Secrets Manager
   - The `GOOGLE_PRIVATE_KEY` multi-line variable needs to be turned into a single line wrapped in quotes.
     - `GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ\n-----END PRIVATE KEY-----"`

2. Create your own bot (optional)
   1. Within Slack create a new Bot with the following scopes
      1. `chat:write`
      2. `chat:write.customize`
      3. `workflow.steps:execute`
      4. `commands`
      5. `users:read`
      6. `reactions:read`
   2. The `SLACK_BOT_TOKEN` variable comes from the "OAuth Tokens for Your Workspace" section once the application has been installed into your test workspace.
3. Install `ngrok` - `brew install ngrok`, start the application using `ngrok http 3000` and make note of the URL.
4. Put the URL + `/slack/events` into the "Interactivity & Shortcuts" page within the slack website for your app.
