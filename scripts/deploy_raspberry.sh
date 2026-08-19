#!/bin/bash
# ==============================================================================
# SOLARIS CONTROL - SCRIPT DE DESPLIEGUE EN RASPBERRY PI
# ==============================================================================
# Este script automatiza la instalación de Docker, configuración de variables
# y puesta en marcha permanente del sistema Solaris Control con Ngrok.

set -e

echo "☀️  Iniciando Despliegue de Solaris Control en Raspberry Pi..."

# 1. Actualizar el sistema e instalar dependencias básicas
echo "📦 Actualizando paquetes de la Raspberry Pi..."
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw

# 2. Verificar o Instalar Docker Engine
if ! command -v docker &> /dev/null; then
    echo "🐳 Docker no encontrado. Instalando Docker Engine..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "✅ Docker instalado exitosamente."
else
    echo "✅ Docker ya está instalado."
fi

# 3. Verificar o Instalar Docker Compose plugin
if ! docker compose version &> /dev/null; then
    echo "🐳 Instalando Docker Compose plugin..."
    sudo apt-get install -y docker-compose-plugin
fi

# 4. Configuración del archivo .env
if [ ! -f .env ]; then
    echo "⚙️  Creando archivo .env desde .env.example..."
    cp .env.example .env
fi

echo "======================================================================"
echo "📌 CONFIGURACIÓN DE NGROK:"
echo "Dominio asignado: chiquita-unstructural-maura.ngrok-free.dev"
echo "Asegúrate de que NGROK_AUTHTOKEN esté configurado en el archivo .env"
echo "======================================================================"

# 5. Crear directorio de datos persistentes si no existe
mkdir -p data

# 6. Construir y lanzar los servicios Docker
echo "🚀 Levantando contenedores (Operador + Stakeholders + Ngrok)..."
docker compose up -d --build

# 7. Configurar servicio para arranque automático del sistema
echo "🔄 Habilitando inicio automático en el arranque del sistema..."
sudo systemctl enable docker

echo "======================================================================"
echo "✅ DESPLIEGUE COMPLETADO EXITOSAMENTE"
echo "----------------------------------------------------------------------"
echo "🟢 Vista Operador (Red Local/LAN): http://localhost:8000"
echo "🟢 Vista Stakeholders (Red Local): http://localhost:8001"
echo "🌐 Vista Stakeholders (Público Ngrok): https://chiquita-unstructural-maura.ngrok-free.dev"
echo "======================================================================"
