FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
ARG WITH_OCR=0
RUN if [ "$WITH_OCR" = "1" ]; then apt-get update && apt-get install -y --no-install-recommends tesseract-ocr && pip install --no-cache-dir pypdfium2 pytesseract && rm -rf /var/lib/apt/lists/*; fi
COPY app ./app
RUN mkdir /data && useradd -m svc && chown svc /data
USER svc
ENV RAG_DB=/data/rag.db
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
