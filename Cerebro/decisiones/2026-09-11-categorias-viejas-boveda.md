# Las categorías viejas de Bóveda (`Desarrollo`, `React`, `Universidad`, `Ideas`, `General`, `IAs Noticias`, `Sin Categorizar`) se reemplazan por el árbol PARA

## Decisión

Las filas de `categorias` en `app.db` se borran/reemplazan por filas que representan las carpetas
de `D:\Boveda` (`00 - Sin categorizar` ... `05 - Basura`, con dominios de Áreas/Recursos). No
conviven las dos — se reemplaza, no se suma.

## Por qué

El contenido de las categorías viejas ya se migró a las carpetas nuevas (ver migración de hojas,
sesión previa). Mantener ambos árboles de categorías visibles en el picker de la app sería
confuso sin ningún beneficio.

## Cómo ejecutarlo (importante, no es solo la decisión)

No como paso aislado contra `app.db` real — se hace como parte de Milestone 2 (conexión de
`crud.py`), probado en el sandbox `dev-start.ps1` antes de aplicarlo a la base real local. Hacerlo
suelto antes rompería el picker/las hojas reales en la app en vivo hasta que el resto de la
conexión esté lista.
