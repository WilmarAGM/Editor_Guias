# Editor_Guias

Página de revisión de las guías de Álgebra Lineal (REMAT). Es un sitio estático que publica Vercel.

## Para el revisor

1. Elige la guía en el menú **Guía a corregir**.
2. Haz clic sobre el bloque que quieres corregir: una definición, un ejemplo, una figura, un ejercicio o el título de la hoja.
3. Elige **Comentar**, **Proponer texto**, **Eliminar**, **Mover** o **Aprobado**, escribe y pulsa **Guardar**.
4. Pulsa **Descargar correcciones (.md)** y envía el archivo.

Lo escrito se guarda en tu navegador. Para seguir en otro equipo, usa **Cargar .md** con el último archivo descargado.

### Rondas

Después de aplicar tus correcciones, la guía se republica con una pestaña **Respuestas**: cada comentario tuyo
con su estado (aplicado, pregunta para ti, no aplicado) y lo que se hizo. Los bloques corregidos aparecen marcados
en la guía. Tus correcciones viejas se archivan solas (puedes descargarlas desde esa pestaña) y empieza una ronda
nueva en blanco: si algo no quedó bien, o para responder una pregunta, haz clic en el bloque y coméntalo otra vez.

## Contenido

| Archivo | Qué es |
|---|---|
| `index.html`, `estilos.css`, `app.js` | la interfaz, sin dependencias externas |
| `guias.json` | la lista del menú desplegable (id, nombre, hojas, versión, ronda abierta, respuestas) |
| `respuestas/*.json` | respuestas a la ronda anterior de cada guía (estado y respuesta por bloque) |
| `guias/*.html` | las guías ya compuestas; cada bloque trae `data-bloque` con el nombre de su variable en `build_*.py` |

Estos archivos **no se editan a mano**. Se generan en `Guias_AL/_fuente` con:

```
python3 build_vectores.py && python3 prerender.py
python3 build_matrices.py && python3 prerender.py ../Guia_Matrices_prototipo.html
python3 publicar_revision.py
```

Después, en esta carpeta: `git add -A && git commit -m "..." && git push`. Vercel publica solo.
