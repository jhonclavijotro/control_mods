# ⚡ Baúl Obsidian: modregis
> **Sistema de Gestión y Registro de Módulos de Potencia (Granja Solar)**

Bienvenido al baúl de documentación **`modregis`**. Este espacio contiene toda la documentación técnica, arquitectónica, operativa y de despliegue para la aplicación de control y monitoreo de módulos de potencia en unidades inversoras.

---

## 📌 Índice de Contenidos

1. [[00 - Visión General y Arquitectura]]
   - Arquitectura del sistema, pila tecnológica, componentes backend/frontend y estructura multi-entorno.
2. [[01 - Guía de Instalación y Despliegue]]
   - Requisitos, despliegue paso a paso con Docker, configuración `.env`, uso del `Makefile`, entorno virtual local y túneles seguros con ngrok.
3. [[02 - Manual de Usuario y Operaciones]]
   - Guía de uso de las dos visiones (**Operario** vs **Stakeholder**), operaciones en tarjetas de módulos, regla de diagnóstico obligatorio y modo solo lectura.
4. [[03 - Documentación de API REST]]
   - Definición detallada de endpoints REST, modelos Pydantic, esquemas de datos, validaciones y códigos de respuesta HTTP.
5. [[04 - Matriz de Pruebas y Validación]]
   - Casos de prueba automatizados, validaciones de seguridad (403 Forbidden), pruebas de endpoints y comandos de verificación.
6. [[05 - Hoja de Ruta y Posibles Mejoras]]
   - Plan de evolución futura: autenticación JWT, telemetría IoT Modbus, mantenimiento predictivo con IA y alertas en tiempo real.
7. [[06 - Bitácora de Registro de Fallas y Correcciones del Sistema]]
   - Bitácora cronológica de incidencias técnicas, análisis de causa raíz y parches de corrección aplicados al sistema.

---

## 🔗 Visores y Accesos del Sistema

* **Visión Operario (Modo Administrador)**:
  `http://localhost:8000` *(Operaciones completas: Paradas, Reinicios, Reemplazos y Repuestos)*
* **Visión Stakeholder (Modo Solo Lectura Local)**:
  `http://localhost:8001` *(Banner amarillo de aviso, botones deshabilitados y protección 403)*
* **Visión Stakeholder (Túnel Ngrok Web Seguro)**:
  `https://chiquita-unstructural-maura.ngrok-free.dev`

---

## 🚀 Referencia Rápida de Comandos

```bash
# Construir la imagen Docker
make build

# Iniciar entorno Administrador (Visión Operario - Puerto 8000)
make up

# Iniciar entorno de Solo Lectura (Visión Stakeholder - Puerto 8001)
make stakeholder

# Iniciar Túnel Seguro ngrok hacia la vista Stakeholder
make tunnel

# Detener todos los servicios
make down
```

---

*Baúl generado para el proyecto Solaris Control &mdash; Registro de Módulos de Potencia (`modregis`)*
