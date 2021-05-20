# HackerRank Queue Slack Bot

## Development

Make sure to have the following tools installed:

- `nvm` (optional)
- `node v14.15.5`
- `yarn`
- Heroku CLI

You will never have to run the code locally, other than to run tests.

To manually test out changes, you'll simply deploy to Heroku and actually use the bot in slack!

```bash
# Install dependencies
yarn install

# Login to Heroku CLI - only have to do this once
yarn docker:login

# Deploy the app after making changes
yarn docker:deploy
```

> You don't have to commit anything before doing a deploy. Just make the change and deploy

### Useful links

- Slack App Config: <https://api.slack.com/apps/A01TFKZKPT7/general>
- Heroku App: <https://dashboard.heroku.com/apps/hacker-rank-queue>
- Spreadsheet Databases: <https://drive.google.com/drive/folders/1bCO8LllRNpysu65WOjBsUAZUnrDqXDX0?usp=sharing>
