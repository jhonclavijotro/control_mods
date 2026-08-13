# 01 - Guía de Instalación y Despliegue

> Baúl Obsidian: `modregis` | Sección 01

---

## 🛠️ Requisitos Previos

Antes de ejecutar o desplegar la aplicación, asegúrese de contar con:
- **Docker** y **Docker Compose** (recomendado para producción y entornos aislados).
- **Python 3.11+** (para desarrollo local sin contenedores).
- **Make** (opcional, para ejecutar los comandos simplificados del `Makefile`).

---

## 🚀 Opciones de Despliegue

### Opción 1: Usando el Makefile (Recomendado)

El archivo `Makefile` automatiza las tareas comunes de construcción y ejecución:

```bash
# 1. Ver el menú de ayuda con todos los comandos
make help

# 2. Construir la imagen Docker local
make build

# 3. Iniciar la aplicación en Modo Administrador (Puerto 8000)
make up

# 4. Iniciar la instancia restringida para Stakeholders (Puerto 8001)
make stakeholder

# 5. Iniciar el túnel seguro ngrok expuesto a la web para Stakeholders
make tunnel

# 6. Ver logs en tiempo real
make logs

# 7. Detener todos los contenedores
make down
```

---

### Opción 2: Usando Docker Compose Directamente

```bash
# Iniciar la instancia principal (Administrador)
docker compose up -d solar-control-app

# Iniciar la instancia de Stakeholders (Solo Lectura)
docker compose up -d solar-control-stakeholder

# Iniciar todo el stack junto con ngrok
docker compose up -d

# Detener los servicios
docker compose down
```

---

### Opción 3: Entorno de Desarrollo Local (Sin Docker)

Si desea ejecutar el backend directamente en su máquina con Python:

1. **Activar el entorno virtual** (PowerShell):
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```

2. **Instalar dependencias**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Iniciar el servidor Uvicorn**:
   ```powershell
   uvicorn backend.main:app --reload --port 8000
   ```

> [!WARNING]
> **Importante**: No intente lanzar la aplicación ejecutando `python .\backend\main.py` directamente, ya que arrojará un error `ImportError: attempted relative import`. Utilice siempre `uvicorn backend.main:app --reload`.

---

## 🌐 Configuración del Túnel ngrok

Para exponer la vista de stakeholders a internet de forma segura:

1. Defina la variable `NGROK_AUTHTOKEN` en su archivo `.env` o en la terminal:
   ```bash
   export NGROK_AUTHTOKEN="tu_token_de_ngrok"
   ```
2. Ejecute el comando:
   ```bash
   make tunnel
   ```
3. Acceda a la consola de inspección en `http://localhost:4040` para consultar la URL pública HTTPS asignada por ngrok (ejemplo: `https://abcd-123.ngrok-free.app`).

---

## 🔗 Notas Relacionadas
- [[00 - Visión General y Arquitectura]]
- [[02 - Manual de Usuario y Operaciones]]
- [[04 - Matriz de Pruebas y Validación]]
