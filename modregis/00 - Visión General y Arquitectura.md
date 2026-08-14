# 00 - Visión General y Arquitectura

> Baúl Obsidian: `modregis` | Sección 00

---

## 📄 Descripción del Proyecto

La aplicación de **Gestión de Módulos de Potencia (Solaris Control)** es una solución web full-stack diseñada para supervisar, registrar y gestionar la topología física, estados de operación, mantenimiento y métricas de disponibilidad de los módulos de potencia instalados en las unidades inversoras de una granja solar.

### Estructura de la Granja Solar
- **Unidades Inversoras**: 8 Inversores (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`, `D1`, `E1`).
- **Capacidad**: 6 ranuras (slots) por inversor estándar (A1..D1) y 4 ranuras para el inversor especial (E1), totalizando **46 ranuras activas**.
- **Inventario de Respaldo**: Módulos de repuesto disponibles para reemplazo hot-swap o programado.

---

## 🏗️ Arquitectura de Software

```
+-----------------------------------------------------------------------+
|                            CLIENTE (SPA)                              |
|           HTML5 + Vanilla CSS (Tema Oscuro) + JavaScript ES6          |
+------------------------------------+----------------------------------+
                                     | REST API (JSON / HTTP)
                                     v
+-----------------------------------------------------------------------+
|                         BACKEND FASTAPI (Python)                      |
|  - Middleware de Solo Lectura (READ_ONLY_MODE=true/false)             |
|  - Motor de Cálculos Solares (MTBF, Horas Útiles 7am-6pm, Uptime %)    |
|  - Gestión de Base de Datos & Migraciones Automáticas                 |
+------------------------------------+----------------------------------+
                                     | SQLAlchemy ORM
                                     v
+-----------------------------------------------------------------------+
|                        BASE DE DATOS PERSISTENTE                      |
|                  SQLite (Almacenada en ./data/solar_farm.db)          |
+-----------------------------------------------------------------------+
```

---

## 💡 Componentes Principales

### 3. Motor de Cálculo de Tiempo de Operación Solar (solar_engine.py)
- **Ventana de Radiación Activa**: Filtra estrictamente las horas entre **07:00 AM y 06:00 PM (11 horas solares por día)**. Las horas nocturnas no suman al tiempo de generación ni a las penalizaciones por parada.
- **Independencia del Servidor**: El tiempo acumulado es **persistente y determinista**. No depende de si la aplicación o el servidor están encendidos, sino del cálculo matemático de intervalos entre la fecha de instalación (`installed_at`), la fecha actual (`current_time`) y las paradas registradas (`stop_time` / `restart_time`).
- **Línea Base Operativa**: Garantiza una ventana de evaluación estándar para evitar distorsiones del 0.0% cuando se registran fallas en módulos sembrados en fechas recientes.

---

## 🏗️ Arquitectura Multi-Entorno y Túneles (Docker Compose)
- **Instancia Administrador** (Puerto `8000`): Permite lectura y escritura completa (crear paradas, reinicios, reemplazos, eliminar inventarios).
- **Instancia Stakeholder / Solo Lectura** (Puerto `8001`): Activa la variable `READ_ONLY_MODE=true`, bloqueando cualquier mutación con código HTTP `403 Forbidden` y mostrando un banner informativo en la UI.
- **Túnel ngrok**: Contenedor `ngrok/ngrok:latest` que expone la instancia de stakeholders de forma segura vía HTTPS a la web sin exponer la IP ni puertos locales.

---

## 🔗 Notas Relacionadas
- [[01 - Guía de Instalación y Despliegue]]
- [[02 - Manual de Usuario y Operaciones]]
- [[03 - Documentación de API REST]]
