# ============================================
# Python Runtime — Sandboxed Execution
# ============================================
# Minimal Alpine image with Python 3.12
# Non-root user, no network, read-only FS

FROM python:3.12-alpine

# Security: Create non-root user
RUN adduser -D -u 1000 coderunner

# Install common packages (numpy, etc. can be added)
RUN pip install --no-cache-dir --quiet \
    numpy pandas requests 2>/dev/null || true

# Remove pip to prevent installation at runtime
RUN pip uninstall -y pip setuptools 2>/dev/null || true

# Security: Remove shells and tools that could be abused
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

WORKDIR /workspace
USER coderunner

# Default: execute python script
CMD ["python3", "code.py"]
