# ============================================
# Ruby Runtime — Sandboxed Execution
# ============================================
FROM ruby:3.3-alpine

RUN adduser -D -u 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

WORKDIR /workspace
USER coderunner

CMD ["ruby", "code.rb"]
