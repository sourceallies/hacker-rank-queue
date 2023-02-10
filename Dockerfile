FROM node:18-alpine as base
RUN apk --no-cache add curl
RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm@6
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

FROM base as builder
COPY . .
RUN pnpm build

FROM base as prod
RUN apk add --no-cache aws-cli
COPY --from=builder /app/dist .
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
