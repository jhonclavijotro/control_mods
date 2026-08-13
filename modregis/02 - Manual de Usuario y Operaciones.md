# 02 - Manual de Usuario y Operaciones

> Baúl Obsidian: `modregis` | Sección 02

---

## 🖥️ Interfaz de Usuario y Navegación

La barra superior en forma de cinta ofrece un diseño limpio enfocado en las secciones principales:

1. **Dashboard**: Vista general con KPIs globales, horas de operación útil (7am-6pm), resumen por inversor y tabla de eventos recientes.
2. **Respaldo**: Gestión de módulos en inventario de repuestos.
3. **Historial**: Reporte detallado de paradas, reanudaciones y reemplazos con filtros por inversor, serial o estado.
4. **Catálogo**: Registro consolidado de todos los módulos instalados e inventariados.

---

## ⚡ Operaciones en las Tarjetas de Módulos de Potencia

Al hacer clic en cualquier inversor desde el Dashboard, el sistema despliega la cuadrícula de módulos instalados en esa unidad. Cada tarjeta cuenta con 3 botones de acción compactos basados en íconos:

| Ícono | Acción | Descripción / Requisito |
| :---: | :--- | :--- |
| `<i class="fa-solid fa-pause">` | **Registrar Parada** | Detiene el módulo indicando el motivo y fecha/hora de la falla. |
| `<i class="fa-solid fa-play">` | **Registrar Arranque** | **¡REGLA OBLIGATORIA!** Reanuda el módulo exigiendo ingresar un **Diagnóstico Final / Solución Aplicada**. |
| `<i class="fa-solid fa-arrows-rotate">` | **Reemplazar Módulo** | Retira el módulo averiado e instala uno nuevo del inventario de respaldo. |
| `<i class="fa-solid fa-clock-rotate-left">` | **Ver Historial** | Redirige al historial filtrando eventos de ese módulo específico. |

---

## 🔒 Regla de Negocio: Diagnóstico Obligatorio en Reinicios

> [!IMPORTANT]
> **Ninguna parada o reparación puede finalizarse o reiniciarse sin registrar un diagnóstico técnico final o solución aplicada.**

### Comportamiento del Sistema:
1. **Frontend**: El área de texto *"Diagnóstico Final / Solución Aplicada"* en el formulario de arranque posee el atributo `required` e indicador visual asterisco rojo (`*`). Si se deja vacío, se bloquea el envío y se despliega una notificación Toast.
2. **Backend**: Los endpoints `/api/repairs/restart` y `/api/repairs/restart-inverter` validan que la cadena de texto no esté vacía o compuesta solo por espacios, devolviendo `HTTP 400 Bad Request` en caso contrario.

---

## 👁️ Modo Solo Lectura (Entorno Restringido para Stakeholders)

Cuando la aplicación corre con la variable `READ_ONLY_MODE=true` (Puerto `8001` o vía túnel ngrok):

1. **Banner Prominente**:
   Se muestra un aviso amarillo fijo en la parte superior:
   `👁️ ENTORNO DE SOLO LECTURA (STAKEHOLDERS): Las funciones de modificación y registro de reparaciones están restringidas.`
2. **Deshabilitación de Controles**:
   Todos los botones de acción (`Registrar Parada`, `Registrar Arranque`, `Reemplazar`, `Eliminar`, `Editar Serial`) se desactivan y muestran el mensaje *"Operación no disponible en Modo Solo Lectura (Stakeholders)"*.
3. **Protección a Nivel de Servidor**:
   Cualquier petición `POST`, `PUT`, `DELETE` realizada por un usuario o script hacia esta instancia es rechazada con un estado **`403 Forbidden`**.

---

## 🔗 Notas Relacionadas
- [[01 - Guía de Instalación y Despliegue]]
- [[03 - Documentación de API REST]]
- [[04 - Matriz de Pruebas y Validación]]
