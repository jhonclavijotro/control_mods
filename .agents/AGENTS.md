# Reglas y Pautas del Proyecto (Solaris Control)

## UI & CSS Best Practices
- **Contraste de Selectores de Fecha y Hora en Temas Oscuros**:
  En navegadores basados en WebKit/Chromium y Firefox, los iconos nativos de calendario y reloj (`::-webkit-calendar-picker-indicator`) dentro de `<input type="datetime-local">`, `<input type="date">` o `<input type="time">` se dibujan por defecto en negro. En aplicaciones con temas oscuros (ej. fondo `#0f1523`), siempre aplicar:
  ```css
  input[type="datetime-local"],
  input[type="date"],
  input[type="time"] {
      color-scheme: dark;
  }

  input[type="datetime-local"]::-webkit-calendar-picker-indicator,
  input[type="date"]::-webkit-calendar-picker-indicator,
  input[type="time"]::-webkit-calendar-picker-indicator {
      filter: invert(1) brightness(100%);
      cursor: pointer;
  }
  ```

## Frontend & Manipulación de Eventos
- **Filtros e Interacciones de Usuario**:
  - Asegurar siempre el atributo explícito `type="button"` en botones de acción como "Aplicar Filtros" o "Limpiar Filtros" para evitar comportamientos imprevistos de envío de formulario.
  - Ofrecer siempre retroalimentación visual clara (como notificaciones Toast) tras ejecutar acciones de filtrado.
  - Prevenir problemas de almacenamiento en caché en los navegadores agregando un parámetro de versión al cargar scripts (`/static/js/app.js?v=x.x`).
  - Mantener sincronizada la respuesta de la API REST backend con lógica de filtrado de respaldo en memoria en el cliente para garantizar una respuesta instantánea.

## Control de Versiones y Flujo Git
- Desarrollar nuevas características o correcciones en la rama `dev`.
- Probar y validar la estabilidad de los cambios.
- Realizar la fusión (*merge*) a la rama principal (`main`) una vez confirmado el correcto funcionamiento.
