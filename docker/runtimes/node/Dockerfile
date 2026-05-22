# ============================================
# Node.js Runtime — Sandboxed Execution
# ============================================
FROM node:20-alpine

RUN adduser -D -u 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

WORKDIR /workspace
USER coderunner

CMD ["node", "code.js"]
