# Herramientas MiND

Herramientas web con el manual de identidad visual de MiND: títulos animados (estilos Colorblock, Mayúsculas y Monoblock) y coloración de fotos en rojo o azul.

**Abrir la herramienta:** https://ardent37.github.io/mind-generador-titulos/

En Títulos animados elige estilo (Colorblock con 1 o 2 líneas; Mayúsculas y Monoblock hasta 6 líneas), formato, animación y encuadre, y descarga. Todo se genera en el navegador y no se envía nada a ningún servidor.

## Formatos
MP4 · MOV con transparencia · SVG animado · Lottie · WebM con transparencia · GIF · Secuencia PNG (ZIP)

Para MP4 y WebM hace falta Chrome o Edge actualizados.

## Regenerar el HTML
Los fuentes están en `fuente/`. Solo necesita Python:

```bash
cd fuente
python build.py ../index.html
```

## Créditos
- Tipografía [Inter](https://rsms.me/inter/) (SIL Open Font License 1.1), incrustada como subconjunto.
- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (MIT), incluido en `fuente/lib`.
