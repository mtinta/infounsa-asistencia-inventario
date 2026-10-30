# Portal General - InfoUNSA

El Portal General es la interfaz de redirección, navegación y descubrimiento centralizada de la plataforma institucional.

---

## Estructura

```
apps/portal-general/
├── frontend/        # Archivos estáticos (HTML, JS, CSS)
│   ├── index.html   # Estructura del portal
│   ├── index.js     # Lógica de redirección y semáforo de red
│   └── index.css    # Estilizado HSL Vanilla CSS
│
└── public-assets/   # Imágenes y logotipos institucionales
```

---

## Ejecución y Despliegue

Este portal se sirve mediante un contenedor ligero Nginx Alpine en el puerto `8000` (configurable mediante la variable `PORTAL_PORT`). No requiere compilación de frameworks pesados al ser un desarrollo puramente estático en HTML5 y Vanilla CSS3.
