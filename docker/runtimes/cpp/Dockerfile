# ============================================
# C++ Runtime — Sandboxed Execution
# ============================================
FROM alpine:3.19

RUN apk add --no-cache g++ libc-dev
RUN adduser -D -u 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true
RUN mkdir -p /build && chown coderunner:coderunner /build

WORKDIR /workspace
USER coderunner

CMD ["sh", "-c", "g++ -o /build/a.out code.cpp && /build/a.out"]
