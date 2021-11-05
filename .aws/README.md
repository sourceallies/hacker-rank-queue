# AWS Infrastructure

AWS CDK is used to spin up and take down the application's infrastructure.

This application run in a ECS Fargate Cluster.

## Setup

1. Follow [`sourceallies/sai-aws-auth`](https://github.com/sourceallies/sai-aws-auth#aws-federated-login)
1. Login to AWS using the `dev` alias you setup in the previous step. After listing S3 buckets, you should see all of them

   ```bash
   dev
   aws s3 ls
   ```

## Scripts

Make sure to have [setup and logged into AWS](https://github.com/sourceallies/sai-aws-auth) for the environment you are going to interact with:

- `*` &rarr; `dev`
- `*:prod` &rarr; `prod`

Create and destroy the application stack:

```bash
pnpm infra:up
pnpm infra:down

pnpm infra:up:prod
pnpm infra:down:prod
```

> The stack does not deploy the application!

Build the app, and deploy it to dev:

```bash
pnpm deploy
```

> `pnpm deploy` can be ran from anywhere in the project. So you don't need to CD into `.aws/` to before doing a dev deploy
