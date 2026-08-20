#!/bin/bash
# Script de despliegue local automatizado para la Raspberry Pi

echo "=== 1. Obteniendo últimos cambios de Git ==="
git pull origin dev

echo "=== 2. Reconstruyendo imágenes de contenedores Docker ==="
docker compose build

echo "=== 3. Iniciando servicios en segundo plano ==="
docker compose down --remove-orphans
docker compose up -d solar-control-app solar-control-stakeholder ngrok

echo "=== 4. Estado de los contenedores activos ==="
docker ps

echo "=== Despliegue completo con éxito! ==="
