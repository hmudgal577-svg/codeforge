# ============================================
# Go Runtime — Sandboxed Execution
# ============================================
FROM golang:1.23-alpine

RUN adduser -D -u 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true
RUN mkdir -p /build && chown coderunner:coderunner /build

WORKDIR /workspace
ENV GOTMPDIR=/build
ENV GOCACHE=/build/.cache

USER coderunner

CMD ["go", "run", "code.go"]
