# go-api/Dockerfile - Optimized for v2.0.0

# --- Stage 1: The Builder ---
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Set the working directory
WORKDIR /app

# Copy dependency files first for better layer caching
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy source code
COPY . .

# Build optimized binary with security flags
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o server main_v2.go

# --- Stage 2: Security Scan (optional, comment out for faster builds) ---
# FROM alpine:latest AS security
# RUN apk add --no-cache ca-certificates
# COPY --from=builder /app/server /app/server
# RUN chmod +x /app/server

# --- Stage 3: Final Runtime Image ---
FROM scratch

# Copy timezone data and CA certificates from builder
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the optimized binary
COPY --from=builder /app/server /server

# Add non-root user (security best practice)
USER 65534:65534

# Expose the port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/server", "--health-check"] || exit 1

# Run the server
ENTRYPOINT ["/server"]
