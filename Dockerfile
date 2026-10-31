FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TF_CPP_MIN_LOG_LEVEL=2 \
    TF_ENABLE_ONEDNN_OPTS=0 \
    TF_NUM_INTEROP_THREADS=1 \
    TF_NUM_INTRAOP_THREADS=1 \
    OMP_NUM_THREADS=1 \
    YOLO_POSE_WEIGHTS=/app/yolov8n-pose.pt

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && python -m pip install --no-cache-dir -r requirements.txt

# Fetch the small official pose model at build time so a cold start does not
# need an outbound download before /health can respond.
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n-pose.pt')" \
    && test -s /app/yolov8n-pose.pt

COPY signova_features.py ./signova_features.py
COPY Signova_Frontend_DarkAI/app.py ./Signova_Frontend_DarkAI/app.py
COPY Signova_Frontend_DarkAI/pose_infer.py ./Signova_Frontend_DarkAI/pose_infer.py
COPY New_dataset/dataset/models_combined_166/sign_language_model_166.keras ./New_dataset/dataset/models_combined_166/sign_language_model_166.keras
COPY New_dataset/dataset/models_combined_166/class_names_166.npy ./New_dataset/dataset/models_combined_166/class_names_166.npy
COPY New_dataset/dataset/models_combined_166/training_report_166.json ./New_dataset/dataset/models_combined_166/training_report_166.json

EXPOSE 8080
CMD ["sh", "-c", "exec python -m uvicorn Signova_Frontend_DarkAI.app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
