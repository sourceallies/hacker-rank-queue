FROM node:14-alpine as base
WORKDIR /app
COPY .yarnrc.yml .pnp.js package.json yarn.lock ./
COPY .yarn .yarn
RUN yarn install

FROM base as builder
COPY . .
RUN yarn build

FROM base as prod
COPY --from=builder /app/dist .
CMD [ "yarn", "node", "index.js" ]
