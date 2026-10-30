# Heirloom sandbox runner
#
# Build:  docker build -t heirloom-runner ./runner
# Run:    see runner/README.md for the capped `docker run` command.
#
# The runner starts as the non-root `node` user (server.mjs refuses uid 0).
# HOME and the npm cache point into /tmp because the recommended run command
# uses --read-only, and npm writes logs/cache into $HOME.

FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Node.js and Python toolchains the resolved strategies may call. Yarn ships
# with the node image, so installing it again fails with EEXIST. pytest is
# preinstalled so a Python repo can run its suite without a requirements file.
RUN npm install -g pnpm@9 bun@1.1.38 \
    && python3 -m pip install --no-cache-dir --break-system-packages pytest \
    && npm cache clean --force

WORKDIR /app
COPY server.mjs ./server.mjs

ENV PORT=8790 \
    HOME=/tmp \
    npm_config_cache=/tmp/.npm \
    PIP_BREAK_SYSTEM_PACKAGES=1

EXPOSE 8790
USER node

CMD ["node", "/app/server.mjs"]
