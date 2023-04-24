FROM node:20-alpine as base
RUN apk --no-cache add curl
RUN npm i -g pnpm@7.30.5
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
