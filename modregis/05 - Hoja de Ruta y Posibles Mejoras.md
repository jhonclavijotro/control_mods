# 05 - Hoja de Ruta y Posibles Mejoras

> Baúl Obsidian: `modregis` | Sección 05

---

## 🗺️ Visión de Evolución del Proyecto

A continuación se detalla la hoja de ruta estratégica para evolucionar la aplicación **Solaris Control (`modregis`)** hacia un sistema de gestión y supervisión industrial de nivel empresarial.

---

## 🚀 Fase 1: Autenticación y Control de Acceso basado en Roles (RBAC)

### Mejoras Propuestas:
- **Autenticación mediante tokens JWT**: Reemplazar la separación por puertos/contenedores con un módulo de autenticación unificado (Login / OAuth2 con Pydantic y Passlib).
- **Roles Definidos**:
  - **SuperAdmin / Jefe de Planta**: Permiso total de modificación, borrado de históricos y reinicio de base de datos.
  - **Técnico de Mantenimiento**: Capacidad de crear paradas, registrar reinicios y solicitar reemplazos.
  - **Stakeholder / Auditor**: Acceso de solo lectura mediante token restringido sin necesidad de instancias separadas.

---

## 📡 Fase 2: Integración IoT & Telemetría en Tiempo Real

### Mejoras Propuestas:
- **Conector Modbus TCP / RS-485**: Comunicación directa con las tarjetas de control físicas de las unidades inversoras (`A1`..`E1`) para detectar fallos de disparo y paradas automáticas sin intervención humana.
- **Servidor WebSockets**: Transmisión instantánea de eventos de falla a los navegadores de los operadores sin necesidad de refrescar la página.

---

## 🧠 Fase 3: Analítica Avanzada y Mantenimiento Predictivo (IA / ML)

### Mejoras Propuestas:
- **Predicción de Fallas mediante ML**: Utilizar algoritmos de clasificación/regresión sobre el histórico de horas acumuladas, MTBF y temperatura operativa para alertar antes de que ocurra una falla crítica en un módulo.
- **Optimización del Inventario de Respaldo**: Calcular el stock mínimo de módulos de repuesto recomendado según la tasa de fallos de la temporada.

---

## 🔔 Fase 4: Alertas y Notificaciones Multicanal

### Mejoras Propuestas:
- **Integración con Telegram / Webhooks / Email**: Envío de alertas automáticas al personal de guardia cuando una unidad inversora entre en "Parada General" o cuando un módulo supere un umbral de indisponibilidad.
- **Exportación de Reportes Avanzados**: Generación de informes de mantenimiento ejecutivos en formato PDF con firma digital del ingeniero responsable.

---

## 🔗 Notas Relacionadas
- [[00 - Visión General y Arquitectura]]
- [[01 - Guía de Instalación y Despliegue]]
- [[02 - Manual de Usuario y Operaciones]]
- [[03 - Documentación de API REST]]
- [[04 - Matriz de Pruebas y Validación]]
