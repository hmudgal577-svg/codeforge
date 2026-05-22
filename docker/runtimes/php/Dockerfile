# ============================================
# PHP Runtime — Sandboxed Execution
# ============================================
FROM php:8.3-cli-alpine

RUN adduser -D -u 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

WORKDIR /workspace
USER coderunner

CMD ["php", "code.php"]
