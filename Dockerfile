FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        pkg-config \
        libffi-dev \
    && pip install --no-cache-dir \
        pwntools \
        capstone \
        keystone-engine \
        unicorn \
        lief \
        yara-python \
        pycryptodome \
        dill \
    && apt-get purge -y build-essential cmake pkg-config \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash sandbox

COPY src/docker/runner.py /opt/runner.py
RUN chmod 555 /opt/runner.py

USER sandbox
WORKDIR /tmp
CMD ["sleep", "infinity"]
