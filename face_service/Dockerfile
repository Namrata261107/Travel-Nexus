FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TF_CPP_MIN_LOG_LEVEL=3

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/deepface
COPY deepface-master/requirements_local /opt/deepface/requirements_local.txt
COPY deepface-master/setup.py /opt/deepface/setup.py
COPY deepface-master/package_info.json /opt/deepface/package_info.json
COPY deepface-master/README.md /opt/deepface/README.md
COPY deepface-master/deepface /opt/deepface/deepface
RUN pip install --no-cache-dir -r requirements_local.txt \
    && pip install --no-cache-dir pandas==1.5.3 \
    && pip install --no-cache-dir --no-deps -e .

WORKDIR /app
COPY backend/face_recognition_service.py /app/app.py
EXPOSE 10000
CMD ["sh", "-c", "gunicorn --workers=1 --threads=2 --timeout=600 --bind 0.0.0.0:${PORT:-10000} app:app"]
