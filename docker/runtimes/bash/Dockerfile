# ============================================
# Bash Runtime — Sandboxed Execution
# ============================================
FROM alpine:3.20

RUN apk add --no-cache bash coreutils
RUN adduser -D -u 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

WORKDIR /workspace
USER coderunner

CMD ["bash", "code.sh"]
