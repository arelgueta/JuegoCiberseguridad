# BRECHA — servidor en vivo (Fase 2, ajustes de experiencia)

Extiende `SPEC5.md`. Cuatro ajustes, pensados para probarse juntos: rediseño visual del
proyector de noticias, más pistas y marcadas con color, bloqueo de cartas entre rondas, y un
anuncio de bienvenida personalizado por equipo en la Ronda 0.

## Cambio 1 — grilla simétrica y pistas marcadas con color

En `/proyector-noticias`, mostrar las 4 noticias del caso activo en una **grilla 2×2**, todas
del mismo tamaño. Las que sean pista (`es_pista = 1`) llevan un tratamiento visual distinto —
borde y fondo de acento en un color dorado/mostaza (no usado por ninguna categoría existente,
para no generar confusión: `#8A6D1E` / fondo `#FBF3DC`) y una pequeña etiqueta "Pista" en la
esquina. Las que no lo sean quedan con el estilo neutro que ya tienen, sin etiqueta.

Esto es un cambio de diseño deliberado: antes ninguna noticia se distinguía, ahora sí. Es
decisión del docente, documentado para que quede claro que no es un descuido.

## Cambio 2 — 2 pistas en vez de 1

Cada caso pasa de tener 1 pista + 3 señuelos a **2 pistas + 2 señuelos**, se mantiene el total
en 4 noticias por caso. Para cada uno de los 10 casos, agregar una segunda fila con
`es_pista = 1` y sacar una de las tres filas de señuelo existentes (cualquiera de las tres,
no importa cuál, para volver a dejar el total en 4).

### Segunda pista por caso (agregar a la tabla `noticias` de `SPEC5.md`)

| caso_numero | titulo | descripcion |
|---|---|---|
| 1 | Un peritaje forense revela el origen de varios fraudes recientes | Varios casos investigados este año comenzaron con un simple correo de apariencia oficial que nadie verificó a tiempo. |
| 2 | Los ataques automatizados de prueba de contraseñas se duplicaron | Especialistas en seguridad señalan un fuerte aumento de intentos de acceso masivo contra portales corporativos. |
| 3 | Un centro de atención al cliente evita un pago indebido por poco | Un intento de manipulación telefónica casi logra autorizar una transferencia antes de ser detectado. |
| 4 | Las aseguradoras reportan más reclamos por archivos cifrados | Los pedidos de cobertura por ataques que bloquean el acceso a sistemas aumentaron un 25% este año. |
| 5 | Un banco alerta sobre transferencias pedidas por videollamada | Se identifican casos de solicitudes de pago mediante video manipulado digitalmente para simular una persona real. |
| 6 | Los errores de configuración lideran las exposiciones de datos en la nube | Un informe del sector identifica esta causa como la más común, por encima de fallas técnicas complejas. |
| 7 | Recomiendan verificar la integridad de cada actualización de software | Firmas del sector insisten en revisar el origen de cada nueva versión antes de instalarla en producción. |
| 8 | Confirman explotación activa de una falla crítica recién publicada | Analistas de amenazas monitorean campañas que ya aprovechan la vulnerabilidad en organizaciones sin parchear. |
| 9 | Especialistas remarcan la importancia de un canal oficial único | En comunicación de crisis, la velocidad de respuesta define si un rumor se instala o se apaga a tiempo. |
| 10 | Instan a mantener la documentación de cumplimiento siempre lista | Cámaras empresariales recomiendan no esperar a un aviso previo para tener todo en regla. |

## Cambio 3 — bloqueo de cartas entre rondas

Ajuste sobre `SPEC5.md`: el catálogo completo sigue disponible **durante** una ronda con
cronómetro corriendo (`ronda_estado = 'activa'`) — eso no cambia. Lo que se agrega es un
bloqueo explícito para el instante en que el cronómetro llega a cero y todavía no arrancó la
próxima ronda:

- Al vencer el cronómetro (`ronda_estado` pasa a `'resuelta'`, según `SPEC2.md`), el endpoint
  de usar una herramienta debe **rechazar cualquier intento**, para cualquier categoría,
  hasta que el docente presione "Siguiente ronda" (o "Sortear y comenzar" si todavía no
  arrancó la primera).
- En `/equipo/:id`, mientras `ronda_estado === 'resuelta'`, todos los botones "Utilizar" del
  catálogo deben verse deshabilitados, con un texto tipo "Esperando a que el docente inicie
  la próxima ronda" — no ocultar el catálogo, solo bloquear la acción, para que el equipo
  pueda seguir mirando qué tiene disponible mientras espera.
- Esto aplica también al cierre de la Ronda 0: en cuanto termina su cronómetro, se bloquea
  igual hasta que el docente presione "Siguiente ronda".
- Validar esto del lado del servidor, no solo deshabilitando el botón en el cliente.

## Cambio 4 — anuncio de bienvenida por equipo en la Ronda 0

Mientras `ronda_numero === 0`, `/proyector-noticias` deja de mostrar el texto neutro genérico
que definía `SPEC5.md` y en su lugar arma dinámicamente **una tarjeta por cada equipo
existente en la partida**, usando el nombre real que cargó el docente (mismo listado que ya
usa `/proyector` para el ranking — no hace falta una fuente de datos nueva). Mismo estilo
neutro que las noticias señuelo (sin acento dorado, esto no es una pista).

Texto sugerido, reemplazando `{equipo}` por el nombre real:

> **{equipo} incorpora su primer equipo de ciberseguridad**
> La dirección aprueba la creación de un área dedicada, con el presupuesto inicial ya
> asignado. Empieza la carrera contra el tiempo.

Si hay más equipos de los que entran cómodos en una grilla 2×2, permitir que la grilla crezca
hacia abajo (más filas) — la Ronda 0 tiene su propio cronómetro, no hay apuro de que entre
todo en una sola pantalla sin scroll.

## Criterios de aceptación

- [ ] `/proyector-noticias` muestra las 4 noticias en grilla 2×2 simétrica.
- [ ] Las 2 noticias con `es_pista = 1` tienen el acento dorado y la etiqueta "Pista"; las
      otras 2 no tienen ningún acento ni etiqueta.
- [ ] Cada uno de los 10 casos tiene exactamente 2 pistas y 2 señuelos cargados.
- [ ] Con el cronómetro en cero y antes de que el docente presione "Siguiente ronda", ningún
      equipo puede usar ninguna carta — probarlo intentando igual desde la consola del
      navegador contra el endpoint, no solo con el botón deshabilitado.
- [ ] Al presionar "Siguiente ronda", el catálogo se desbloquea de inmediato para todos los
      equipos conectados, sin necesidad de refrescar la página.
- [ ] Durante la Ronda 0, `/proyector-noticias` muestra una tarjeta de bienvenida por cada
      equipo cargado en esa partida, con su nombre real.
- [ ] Si se crea un equipo nuevo mientras la Ronda 0 sigue activa, aparece también en la
      grilla de bienvenida sin necesidad de recargar la pantalla del proyector.
