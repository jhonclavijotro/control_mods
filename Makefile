# ==============================================================================
# Makefile para Gestión de Despliegues - Control de Módulos de Potencia
# ==============================================================================

.PHONY: help build up down restart logs stakeholder tunnel ngrok clean

# Definición de variables por defecto
IMAGE_NAME = solar-farm-control
ADMIN_PORT ?= 8000
STAKEHOLDER_PORT ?= 8001

help:
	@echo "======================================================================"
	@echo "   Comandos de Despliegue y Control - Granja Solar Power Modules"
	@echo "======================================================================"
	@echo "  make build         : Construye la imagen Docker de la aplicación"
	@echo "  make up            : Inicia el entorno Administrador en segundo plano (Puerto 8000)"
	@echo "  make down          : Detiene y elimina todos los contenedores activos"
	@echo "  make restart       : Reinicia los servicios Docker"
	@echo "  make logs          : Muestra los logs en tiempo real del servidor"
	@echo "  make stakeholder   : Inicia la instancia en Modo Solo Lectura (Puerto 8001)"
	@echo "  make tunnel        : Inicia el túnel ngrok seguro hacia la vista de Stakeholders"
	@echo "  make ngrok         : Alias para 'make tunnel'"
	@echo "  make clean         : Detiene contenedores y limpia imágenes o temporales"
	@echo "======================================================================"

build:
	@echo "--> Construyendo imagen Docker '$(IMAGE_NAME)'..."
	docker build -t $(IMAGE_NAME) .

up:
	@echo "--> Iniciando aplicación en modo Administrador (Puerto $(ADMIN_PORT))..."
	docker compose up -d solar-control-app

down:
	@echo "--> Deteniendo todos los servicios Docker..."
	docker compose down

restart:
	@echo "--> Reiniciando servicios Docker..."
	docker compose restart

logs:
	docker compose logs -f

stakeholder:
	@echo "--> Iniciando entorno restringido de Solo Lectura para Stakeholders (Puerto $(STAKEHOLDER_PORT))..."
	docker compose up -d solar-control-stakeholder

tunnel ngrok:
	@echo "--> Iniciando entorno Stakeholder con Túnel Seguro ngrok..."
	docker compose up -d solar-control-stakeholder ngrok
	@echo "--> Esperando inicialización del túnel ngrok..."
	@sleep 3
	@echo "======================================================================"
	@echo "   Túnel ngrok activo. Puede ver el estado en http://localhost:4040"
	@echo "======================================================================"

clean: down
	@echo "--> Limpiando recursos y contenedores no utilizados..."
	docker system prune -f
