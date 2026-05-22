# ============================================
# Perl Runtime — Sandboxed Execution
# ============================================
FROM perl:5.40-slim

RUN adduser --disabled-password --gecos "" --uid 1000 coderunner
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

WORKDIR /workspace
USER coderunner

CMD ["perl", "code.pl"]
