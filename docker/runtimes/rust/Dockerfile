# ============================================
# Rust Runtime — Sandboxed Execution
# ============================================
FROM rust:1.82-alpine

RUN apk add --no-cache musl-dev
RUN adduser -D -u 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true
RUN mkdir -p /build && chown coderunner:coderunner /build

WORKDIR /workspace
USER coderunner

CMD ["sh", "-c", "rustc -o /build/a.out code.rs && /build/a.out"]
