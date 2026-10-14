# Editor_Guias

Página de revisión de las guías de Álgebra Lineal (REMAT). Es un sitio estático que publica Vercel.

## Para el revisor

1. Elige la guía en el menú **Guía a corregir**.
2. Haz clic sobre el bloque que quieres corregir: una definición, un ejemplo, una figura, un ejercicio o el título de la hoja.
3. Elige **Comentar**, **Proponer texto**, **Eliminar**, **Mover** o **Aprobado**, escribe y pulsa **Guardar**.
4. Pulsa **Descargar correcciones (.md)** y envía el archivo.

Lo escrito se guarda en tu navegador. Para seguir en otro equipo, usa **Cargar .md** con el último archivo descargado.

## Contenido

| Archivo | Qué es |
|---|---|
| `index.html`, `estilos.css`, `app.js` | la interfaz, sin dependencias externas |
| `guias.json` | la lista del menú desplegable (id, nombre, hojas, versión) |
| `guias/*.html` | las guías ya compuestas; cada bloque trae `data-bloque` con el nombre de su variable en `build_*.py` |

Estos archivos **no se editan a mano**. Se generan en `Guias_AL/_fuente` con:

```
python3 build_vectores.py && python3 prerender.py
python3 build_matrices.py && python3 prerender.py ../Guia_Matrices_prototipo.html
python3 publicar_revision.py
```

Después, en esta carpeta: `git add -A && git commit -m "..." && git push`. Vercel publica solo.
