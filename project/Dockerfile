FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY mybot ./mybot

ENV SGR_DATA_DIR=/app

EXPOSE 8765
