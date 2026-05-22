FROM r-base:4.4.0
RUN useradd -m -u 1001 -s /bin/bash coderunner
WORKDIR /workspace
USER coderunner
CMD ["Rscript", "code.r"]