# Dockerfile para la aplicación de Gestión de Módulos de Potencia (Granja Solar)
FROM python:3.11-slim

# Evitar escritura de archivos .pyc y forzar buffer de salida para logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Instalar dependencias del sistema si fueran necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar e instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código fuente del proyecto
COPY backend/ ./backend/
COPY static/ ./static/

# Crear el directorio para la base de datos persistente
RUN mkdir -p /app/data

# Puerto expuesto
EXPOSE 8000

# Comando por defecto para iniciar el servidor FastAPI
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
