# Heirloom sandbox runner
#
# Build:  docker build -t heirloom-runner ./runner
# Run:    see runner/README.md for the capped `docker run` command.
#
# The runner starts as the non-root `node` user (server.mjs refuses uid 0).
# HOME and the npm cache point into /tmp because the recommended run command
# uses --read-only, and npm writes logs/cache into $HOME.

# Go and Rust toolchains are copied from their official images so a Go or
# Rust repository runs its own test suite instead of stopping at static checks.
FROM golang:1.23-bookworm AS go
FROM rust:1-slim AS rust

FROM node:22-slim

# build-essential and pkg-config let native npm modules, Python C extensions
# and Rust crates compile and link; without them those installs fail.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates python3 python3-pip python3-venv \
       build-essential pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=go /usr/local/go /usr/local/go
COPY --from=rust /usr/local/rustup /usr/local/rustup
COPY --from=rust /usr/local/cargo /usr/local/cargo

# Node.js and Python toolchains the resolved strategies may call. Yarn ships
# with the node image, so installing it again fails with EEXIST. pytest is
# preinstalled so a Python repo can run its suite without a requirements file.
RUN npm install -g pnpm@9 bun@1.1.38 \
    && python3 -m pip install --no-cache-dir --break-system-packages pytest \
    && npm cache clean --force

WORKDIR /app
COPY server.mjs ./server.mjs

# Toolchain binaries stay read-only in /usr/local; every cache a build writes
# (npm, Go modules, Cargo registry) lives under /tmp.
ENV PORT=8790 \
    HOME=/tmp \
    npm_config_cache=/tmp/.npm \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    PATH=/usr/local/go/bin:/usr/local/cargo/bin:$PATH \
    GOPATH=/tmp/go \
    GOCACHE=/tmp/go-build \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/tmp/cargo

EXPOSE 8790
USER node

CMD ["node", "/app/server.mjs"]
