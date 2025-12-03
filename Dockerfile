# =============================================================================
# STAGE 1: Build the JavaScript bundle
# =============================================================================
# Use Chainguard's Node.js image - zero CVEs, rebuilt daily from source.
FROM cgr.dev/chainguard/node:latest AS js-builder

WORKDIR /app

# Copy package files and install dependencies.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files needed for bundling.
COPY multiplayer.js ./
COPY gen/ ./gen/

# Build the JavaScript bundle.
RUN npm run build

# =============================================================================
# STAGE 2: Build the Go backend server
# =============================================================================
# Use Go 1.25 on Alpine Linux as the build environment.
# Alpine is a minimal Linux distribution, making the image smaller.
# This stage is named "builder" so we can reference it later.
FROM golang:1.25-alpine AS go-builder

# Set the working directory inside the container.
# All subsequent commands will run from /app.
WORKDIR /app

# Copy only the Go module files first.
# This allows Docker to cache the dependency download step.
# If go.mod/go.sum haven't changed, Docker reuses the cached layer.
COPY go.mod go.sum ./

# Download all Go dependencies defined in go.mod.
# This is cached separately from the source code.
RUN go mod download

# Copy the server source code into the container.
# This is done after go mod download to maximize cache usage.
COPY server/ ./server/

# Build the Go server binary.
# - CGO_ENABLED=0: Disable C bindings for a fully static binary.
# - GOOS=linux: Target Linux (required for the runtime container).
# - Output the binary to /pirates-server.
RUN CGO_ENABLED=0 GOOS=linux go build -o /pirates-server ./server/cmd/server

# =============================================================================
# STAGE 2: Create the production runtime image
# =============================================================================
# Use nginx on Alpine as the base image for serving static files.
# This is a multi-stage build: we only copy what we need from the builder.
FROM nginx:1.29-alpine3.22-slim

# Install additional packages:
# - ca-certificates: Required for HTTPS connections from the Go server.
# - supervisor: Process manager to run both nginx and the Go server.
RUN apk --no-cache add ca-certificates supervisor

# Copy the compiled Go server binary from the builder stage.
# This is the only artifact we need from the build stage.
COPY --from=go-builder /pirates-server /pirates-server

# =============================================================================
# Copy frontend static files to nginx's default serving directory
# =============================================================================
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY gameLogic.js /usr/share/nginx/html/
COPY game.js /usr/share/nginx/html/
# Copy the bundled JavaScript from the js-builder stage.
COPY --from=js-builder /app/dist/ /usr/share/nginx/html/dist/

# Copy the generated protobuf JavaScript client code.
# This is used by multiplayer.js to communicate with the Go server.
COPY gen/ /usr/share/nginx/html/gen/

# Replace nginx's default configuration with our custom one.
# Our config proxies API requests to the Go server.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy supervisor configuration.
# Supervisor manages multiple processes in a single container.
# Cloud Run expects a single process, so supervisor acts as that process
# while internally running both nginx and the Go server.
COPY supervisord.conf /etc/supervisord.conf

# =============================================================================
# Container configuration
# =============================================================================
# Expose port 8080 (nginx listens here).
# Cloud Run will route external traffic to this port.
EXPOSE 8080

# Start supervisor, which will launch both nginx and the Go server.
# This is the main process that keeps the container running.
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
