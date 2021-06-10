# AWS Infrastructure

AWS CDK is used to spin up and take down the application's infrastructure.

This application run in a ECS Fargate Cluster.

## Setup

If you've already setup the project a level up, you're good to go. This is the repo's second yarn workspace, so everything got installed when you ran `yarn install` at the top level

## Scripts

Make sure to have [setup and logged into AWS](https://github.com/sourceallies/sai-aws-auth) for the environment you are going to interact with:

- `*` &rarr; `dev`
- `*:prod` &rarr; `prod`

Create and destroy the application stack:

```bash
yarn up
yarn up:prod
yarn down
yarn down:prod
```

You'll need a `.secrets/dev.json` or a `.secrets/prod.json`. Copy and fill out the secrets from `.secrets/template.json`

Build the latest docker image, and deploy it:

```bash
yarn deploy
yarn deploy:prod
```

> `yarn deploy` can be ran from anywhere in the project. So you don't need to CD into `.aws/` to before doing a dev deploy
