# Playwright + FastAPI API for simulated-usability-runner.
# Browsers ship with the Microsoft image; keep playwright package major aligned.
FROM mcr.microsoft.com/playwright/python:v1.52.0-jammy

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Cloud / container: no display — always headless unless overridden at runtime.
    USABILITY_HEADLESS=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps chromium

COPY app/ ./app/
COPY scripts/ ./scripts/
COPY configs/ ./configs/
COPY requirements.txt ./

RUN mkdir -p output \
    && printf '' > output/.gitkeep

EXPOSE 8000

# Render/Railway inject PORT; default 8000 for local docker runs.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
