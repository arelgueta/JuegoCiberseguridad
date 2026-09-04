# BRECHA — servidor en vivo (Fase 2, corrección de diseño)

Extiende `SPEC6.md`. Corrige una interpretación mía equivocada en el Cambio 1 de ese
documento: el color **no** debe indicar cuál noticia es la pista real — eso había que
seguir ocultándolo, tal como se definió desde `SPEC4.md`. El color distingue otra cosa
completamente distinta: **de dónde viene la información** — una noticia del mundo exterior,
o algo que se comenta puertas adentro de la empresa. La ambigüedad pista/señuelo sigue
invisible en ambos casos.

## Columna nueva en `noticias`

```sql
ALTER TABLE noticias ADD COLUMN fuente TEXT NOT NULL DEFAULT 'mundo';  -- 'mundo' | 'interna'
```

## Cambio 1 (reemplaza al Cambio 1 de `SPEC6.md`) — el color indica fuente, no veracidad

En `/proyector-noticias`, seguir mostrando las 4 noticias del caso activo en grilla 2×2. El
tratamiento visual distinto ya **no** se aplica según `es_pista` — se aplica según `fuente`:

- `fuente = 'mundo'`: estilo neutro (el mismo que ya tenían todas hasta ahora), con un ícono
  o etiqueta chica "🌐 Noticia del mundo".
- `fuente = 'interna'`: acento cálido — borde y fondo tostado (`#8A6D1E` / fondo `#FBF3DC`,
  el mismo tono que se había propuesto antes para "pista", reutilizado acá con otro
  significado) y etiqueta "🏢 Dentro de la empresa".

`es_pista` sigue existiendo en la base exactamente igual que en `SPEC5.md`/`SPEC6.md` (para
que el docente lo pueda consultar aparte si quiere), pero **no se refleja de ninguna forma
visual** en `/proyector-noticias`. Ninguna de las dos fuentes (mundo o interna) es más
confiable que la otra — una pista real puede llegar por cualquiera de los dos caminos, y
también un señuelo.

## Contenido — reemplaza por completo las tablas de noticias de `SPEC5.md` y `SPEC6.md`

Por cada caso: 1 pista-mundo, 1 pista-interna, 1 señuelo-mundo, 1 señuelo-interna (4 en
total, 2 pistas + 2 señuelos, igual que definió `SPEC6.md` — lo que cambia es que ahora cada
pista y cada señuelo tiene asignada explícitamente una fuente).

### Caso 1 — Fraude del CEO (BEC)
- **Pista, mundo**: "Alertan sobre fraudes de suplantación de correo corporativo (BEC)" — Una cámara empresarial reporta un aumento del 40% en fraudes de tipo BEC dirigidos a áreas de finanzas en el último trimestre.
- **Pista, interna**: "Mesa de ayuda registra varios tickets por correos sospechosos" — Varios empleados reportaron mensajes que simulan ser de un directivo, pidiendo aprobar una transferencia antes de fin de día.
- **Señuelo, mundo**: "Encuesta revela que la mayoría reutiliza contraseñas" — Un estudio de hábitos digitales encuentra que 6 de cada 10 personas usa la misma contraseña en varios servicios.
- **Señuelo, interna**: "Recursos Humanos recibe consultas sobre un video que circula entre el personal" — Algunos empleados preguntan si es real un video viral que pide donar dinero a una causa urgente.

### Caso 2 — Credential stuffing contra la VPN
- **Pista, mundo**: "Foro clandestino ofrece millones de credenciales filtradas" — Se detecta la venta de una base de datos combinada con credenciales de distintos servicios online.
- **Pista, interna**: "Sistemas nota un pico de intentos de inicio de sesión fallidos" — Varios usuarios reportan bloqueos temporales de sus cuentas sin haberlo intentado ellos mismos.
- **Señuelo, mundo**: "Aviso urgente por una vulnerabilidad crítica ya explotada" — Se publica un CVE de severidad alta que ya está siendo aprovechado por atacantes en distintos países.
- **Señuelo, interna**: "Comunicación interna recibe consultas sobre un aviso que circula afuera" — Algunos clientes preguntan si es real un comunicado que menciona el cierre de operaciones.

### Caso 3 — Vishing con voz clonada por IA
- **Pista, mundo**: "Documentan estafas telefónicas con voz clonada por IA" — Un caso reciente muestra cómo estafadores replican la voz de un directivo para pedir transferencias urgentes.
- **Pista, interna**: "Finanzas reporta una llamada pidiendo una transferencia urgente" — Un empleado duda de la identidad de quien llamó, pese a reconocer la voz.
- **Señuelo, mundo**: "Un banco advierte sobre correos que imitan sus notificaciones" — Se detectan campañas de phishing que copian el diseño exacto de los avisos oficiales del banco.
- **Señuelo, interna**: "Sistemas reporta lentitud en los servidores esta mañana" — Todavía no se identifica la causa; podría tratarse de mantenimiento programado.

### Caso 4 — Cifrado de servidores de producción
- **Pista, mundo**: "Especialistas insisten en probar restauraciones reales de backups" — Tener copias de seguridad no alcanza: recomiendan simulacros periódicos de recuperación completa.
- **Pista, interna**: "Un empleado reporta no poder acceder a archivos compartidos" — El equipo de sistemas está revisando si se trata de una falla puntual.
- **Señuelo, mundo**: "Recomiendan pasar a llaves de acceso para reducir robo de contraseñas" — Las passkeys eliminan la necesidad de recordar contraseñas y reducen el riesgo de phishing de credenciales.
- **Señuelo, interna**: "Marketing consulta por comentarios negativos que aparecieron de golpe en redes" — No está claro todavía si se trata de una campaña organizada o pura casualidad.

### Caso 5 — Deepfake del CEO pidiendo donaciones
- **Pista, mundo**: "Una herramienta gratuita de voz con IA se vuelve tendencia" — La app permite imitar voces conocidas con solo unos segundos de audio de referencia.
- **Pista, interna**: "Tesorería recibe una consulta sobre una transferencia a una billetera cripto" — Alguien solicitó el pago mostrando un video del director que nadie termina de reconocer del todo.
- **Señuelo, mundo**: "Un impostor ingresa a una oficina siguiendo a un empleado" — El caso, capturado por cámaras de seguridad, reabre el debate sobre el control de acceso físico.
- **Señuelo, interna**: "Compras pregunta si hay que avisarle a un proveedor sobre un problema de acceso" — Todavía no está confirmado si el inconveniente afecta a los sistemas propios.

### Caso 6 — Bucket de almacenamiento público por error
- **Pista, mundo**: "Recomiendan revisar permisos de cuentas de servicio olvidadas" — Muchas cuentas con privilegios elevados quedan activas mucho después de haber dejado de usarse.
- **Pista, interna**: "Un cliente escribe preguntando por qué pudo ver documentos que no le correspondían" — El equipo de soporte deriva la consulta al área técnica para revisar el caso.
- **Señuelo, mundo**: "Se detecta un aumento de dominios que imitan marcas conocidas" — Usan caracteres visualmente similares a los originales para engañar a quien no revisa con atención.
- **Señuelo, interna**: "Un empleado comenta que un supuesto reclutador le hizo preguntas raras" — No se sabe si fue una coincidencia o algo más serio; el comentario quedó en el grupo del equipo.

### Caso 7 — Librería de código abierto comprometida
- **Pista, mundo**: "Investigadores detectan una puerta trasera en una librería popular" — La última actualización de una dependencia muy usada en proyectos empresariales incluía código no autorizado.
- **Pista, interna**: "Desarrollo reporta un comportamiento extraño después de la última actualización" — Todavía no lograron identificar si el problema viene de una dependencia externa.
- **Señuelo, mundo**: "Aumentan los intentos de acceso automatizado contra portales VPN" — Los ataques prueban combinaciones de usuario y contraseña obtenidas de filtraciones previas.
- **Señuelo, interna**: "RR.HH. comparte una propuesta para sumar pasantes al área técnica" — Todavía se está evaluando el presupuesto disponible para el programa.

### Caso 8 — Día cero explotado activamente (RaaS)
- **Pista, mundo**: "Un grupo ofrece su malware como servicio a otros atacantes" — El modelo de "ransomware como servicio" permite a grupos con menos experiencia técnica lanzar campañas propias.
- **Pista, interna**: "Sistemas detecta un servidor con una actualización pendiente hace semanas" — Se está evaluando si aplicarla esta noche o esperar al próximo mantenimiento programado.
- **Señuelo, mundo**: "Aparecen pendrives 'perdidos' con logos corporativos" — Se encuentran en estacionamientos de varias empresas de la zona en las últimas semanas.
- **Señuelo, interna**: "Un empleado de depósito pregunta por un correo de seguimiento de un pedido" — No recuerda haber hecho ese pedido, pero tampoco está seguro de lo contrario.

### Caso 9 — Comunicado falso de cierre de operaciones
- **Pista, mundo**: "Cuentas coordinadas amplifican un hashtag con información falsa" — El patrón de publicaciones sugiere una campaña organizada contra la reputación de una marca conocida.
- **Pista, interna**: "Atención al cliente recibe llamados preguntando si la empresa cierra" — Todavía no hay un comunicado oficial que lo confirme ni lo desmienta.
- **Señuelo, mundo**: "Encuesta revela que la mayoría reutiliza contraseñas" — El estudio encuentra que la reutilización es más frecuente entre cuentas personales que laborales.
- **Señuelo, interna**: "Sistemas comenta que aplicó un parche preventivo esta semana" — Por ahora no se relaciona con ningún incidente detectado.

### Caso 10 — Auditoría de cumplimiento sin previo aviso
- **Pista, mundo**: "Reguladores anuncian inspecciones de cumplimiento sin aviso previo" — Distintos organismos comenzarán a realizar auditorías sorpresa para verificar el cumplimiento de normas de seguridad.
- **Pista, interna**: "Legales pregunta si la documentación de cumplimiento está actualizada" — Todavía no hay fecha confirmada para una posible revisión.
- **Señuelo, mundo**: "Documentan nuevas estafas telefónicas con voz clonada por IA" — Los casos reportados muestran variantes cada vez más difíciles de distinguir de una llamada real.
- **Señuelo, interna**: "Compras comparte una propuesta de un proveedor con nuevas certificaciones" — Se está evaluando si conviene avanzar con el cambio de proveedor.

## Qué NO cambia

- Todo lo demás de `SPEC6.md` (grilla 2×2, bloqueo de cartas entre rondas, anuncio de
  bienvenida por equipo en la Ronda 0) sigue exactamente igual.
- `es_pista` se sigue guardando y sigue sin mostrarse en ningún lado de `/proyector-noticias`.

## Criterios de aceptación

- [ ] El color/acento de cada noticia en `/proyector-noticias` corresponde a `fuente`, nunca
      a `es_pista`.
- [ ] Mirando la pantalla, es imposible saber cuál de las 4 noticias es la pista real —
      confirmar mezclando a propósito: alguna vez la pista debe quedar del lado "mundo",
      alguna vez del lado "interna" (ya está así en el contenido de arriba, verificar que se
      cargó tal cual).
- [ ] Los 10 casos tienen sus 4 noticias con `fuente` asignada (2 mundo, 2 interna) y
      `es_pista` asignada (2 pista, 2 señuelo), cruzadas sin patrón fijo.
