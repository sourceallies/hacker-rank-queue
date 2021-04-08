# HackerRank Queue Slack Bot

```bash
# Install dependencies
yarn install

# Create and fill out .env file (See "Env Variables" link)
touch .env

# Start the app locally
yarn start
```

> When filling out the `GOOGLE_PRIVATE_KEY` env variable in your `.env` file, put it all on a single line by replacing newlines with `\n`

## Development

Development is kinda weird since Slack wants a public URL to work off of. Because there isn't a "prod" yet, I've just been deploying each change to Heroku, then testing in Slack.

```bash
# Login to Heroku CLI - only have to do this once
yarn docker:login

# Deploy the app after making changes
yarn docker:deploy
```

<br/>

### Useful links

- Slack App Config: <https://api.slack.com/apps/A01TFKZKPT7/general>
- Heroku App: <https://dashboard.heroku.com/apps/hacker-rank-queue>
- Env Variables: <https://dashboard.heroku.com/apps/hacker-rank-queue/settings>
- Database Spreadsheet: <https://docs.google.com/spreadsheets/d/1ChOEjl5l_Uh5dTd_fRjGJt8z7bFNNOwPlzgRnhOLgTY/edit?usp=sharing>
