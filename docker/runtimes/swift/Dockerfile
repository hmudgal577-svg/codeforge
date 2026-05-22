FROM swift:6.0-slim
RUN apt-get update && apt-get install -y --no-install-recommends adduser && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 -s /bin/bash coderunner || true
RUN rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true
WORKDIR /workspace
USER coderunner
CMD ["swift", "code.swift"]