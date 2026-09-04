# BRECHA — servidor en vivo (Fase 3: árbol de desbloqueo)

Extiende todo lo anterior. Convierte el catálogo plano en un árbol de 3 niveles por
categoría — cada carta de nivel 2 o 3 es **invisible** hasta que el equipo tenga la carta de
la que depende, no solo deshabilitada. Sube el presupuesto total de 20 a 30 unidades.

## Idea general

Cada una de las 8 categorías (7 de amenaza + políticas) tiene su propio árbol lineal:

```
Nivel 1 (básico, sin requisito)
   └── Nivel 2 (intermedio, requiere nivel 1)
          ├── Nivel 3-A (avanzado, rama "recompensa" — requiere nivel 2)
          └── Nivel 3-B (avanzado, rama "resiliencia" — requiere nivel 2)
```

- **Nivel 1**: barato, sin efecto propio en la resolución de casos — es una inversión que
  solo sirve para desbloquear el nivel 2. No cuenta como Preventiva por sí sola.
- **Nivel 2**: acá es donde el equipo queda realmente cubierto — tener una carta de nivel 2
  (o superior) de una categoría es lo que ahora cuenta como Preventiva para un caso de esa
  categoría (ver "Cambio en la regla de Preventiva" más abajo).
- **Nivel 3**: dos ramas alternativas, ambas requieren nivel 2, el equipo elige cuál
  comprar (o ninguna, si no le alcanza el presupuesto):
  - **Rama A (recompensa)**: si el caso de esa categoría se resuelve como Preventiva, suma
    +1 reputación extra por encima de los +2 estándar.
  - **Rama B (resiliencia)**: si esa categoría llegara a caer en Omisión más adelante (a
    pesar de tener nivel 2, por ejemplo si después vendieron o perdieron la cobertura — en la
    práctica esto no debería pasar salvo que se implemente esa mecánica a futuro, pero dejar
    la carta lista de todas formas), el efecto de "duplicado por vulnerabilidad repetida" no
    se aplica **para esa categoría puntual**. A diferencia de `comite-gobierno` (política,
    efecto global sobre las 8 categorías), esta es una versión acotada a una sola.

`politicas` ya tenía esta forma desde `SPEC3.md` (relevamiento-ti → gestión de riesgos →
siem / comité de gobierno) — se mantiene igual, solo se le pone la etiqueta de nivel
correspondiente por prolijidad, sin cambiar ningún efecto.

## Cambio en la visibilidad (generaliza lo que ya existía solo para políticas)

Desde `SPEC3.md`, `gestion-riesgos` ya estaba bloqueada sin `relevamiento-ti`. Ese mismo
mecanismo (columna `requiere_herramienta_id`, ya existente) se generaliza ahora a **todas**
las cartas de nivel 2 y 3 de las 8 categorías. La diferencia importante respecto a como se
había pedido antes: no alcanza con deshabilitar el botón — la carta **no debe aparecer en el
catálogo en absoluto** hasta que se cumpla el requisito.

- El endpoint que devuelve el catálogo para `/equipo/:id` debe filtrar server-side: una carta
  se incluye en la respuesta si y solo si `requiere_herramienta_id IS NULL`, o el equipo ya
  tiene registrado el uso de esa herramienta requerida.
- Al inicio de la partida, un equipo ve únicamente las 8 cartas de nivel 1 (una por
  categoría) más `plan-respuesta-incidentes` (la única carta sin categoría de árbol, se
  mantiene visible siempre, sin cambios). Total: 9 cartas visibles al arrancar, de un
  catálogo total de 33.
- A medida que cada equipo va comprando, el catálogo que ve **cada uno** crece de forma
  distinta según sus propias decisiones — dos equipos pueden terminar la partida viendo
  catálogos completamente distintos entre sí, y ninguno se entera de las cartas que el otro
  llegó a desbloquear.

## Cambio en la regla de Preventiva

En `SPEC2.md`/`SPEC3.md`, "el equipo tiene la herramienta preventiva de la categoría" se
evaluaba como "el equipo tiene *cualquier* carta de esa categoría". Eso ya no alcanza. Nueva
regla:

> Un equipo cubre Preventiva para un caso de categoría `X` si tiene registrado el uso de
> **al menos una carta de categoría `X` con `nivel >= 2`**. Tener solo el nivel 1 no cuenta.

Esto aplica a las 7 categorías de amenaza (no aplica a `politicas`, que nunca tuvo casos
propios ni relación de Preventiva — su efecto siempre fue transversal).

## Presupuesto

`equipos.presupuesto` inicial pasa de 20 a 30 (default en el esquema y en "Reiniciar
partida"/"Borrar todo"). Esto es solo para el servidor en vivo — los materiales impresos, la
planilla de Excel y las diapositivas que existen aparte siguen en 20/20 salvo que se pida
explícitamente actualizarlos también (quedan fuera de alcance de este documento a propósito,
para no tocar tres archivos más sin que lo hayas pedido).

## Catálogo completo (reemplaza al de `SPEC.md`/`SPEC3.md`)

Columnas: id · categoría · nivel · costo · requiere · efecto/descripción. Las filas marcadas
"(ya existía)" son cartas que ya estaban en el catálogo y solo cambian de nivel/requisito, no
de contenido ni de efecto.

### Correo y phishing
| id | nivel | costo | requiere | descripción |
|---|---|---|---|---|
| capacitacion-phishing (ya existía) | 1 | 2 | — | Entrena al personal para identificar enlaces, adjuntos y remitentes sospechosos. |
| filtro-anti-phishing (ya existía) | 2 | 3 | capacitacion-phishing | Verifica automáticamente la autenticidad del remitente y bloquea dominios falsificados. |
| phishing-soar | 3-A | 3 | filtro-anti-phishing | Automatiza la respuesta ante intentos de phishing detectados. Rama recompensa: +1 reputación extra cuando resuelve Preventiva. |
| phishing-simulacros | 3-B | 2 | filtro-anti-phishing | Simulacros periódicos de phishing dirigido al personal. Rama resiliencia: sin duplicado por vulnerabilidad repetida, solo en phishing. |

### Contraseñas y accesos
| id | nivel | costo | requiere | descripción |
|---|---|---|---|---|
| gestor-contrasenas (ya existía) | 1 | 2 | — | Contraseñas únicas y complejas por servicio, sin reutilización entre sistemas. |
| mfa-accesos-criticos (ya existía) | 2 | 3 | gestor-contrasenas | Segundo factor de autenticación en VPN, correo y paneles de administración. |
| pass-auth-adaptativa | 3-A | 3 | mfa-accesos-criticos | Autenticación que ajusta el riesgo según el contexto del acceso. Rama recompensa: +1 reputación extra. |
| pass-rotacion-automatica | 3-B | 2 | mfa-accesos-criticos | Rotación automática de credenciales ante una filtración detectada. Rama resiliencia: sin duplicado, solo en contraseñas. |

### Ingeniería social
| id | nivel | costo | requiere | descripción |
|---|---|---|---|---|
| control-acceso-fisico (ya existía) | 1 | 2 | — | Badges, control de tailgating y registro de visitantes. |
| verificacion-fuera-banda (ya existía) | 2 | 2 | control-acceso-fisico | Confirmar pedidos sensibles por un canal distinto antes de actuar. |
| social-simulacros | 3-A | 3 | verificacion-fuera-banda | Simulacros de pretexting y vishing con el personal. Rama recompensa: +1 reputación extra. |
| social-protocolo-escalamiento | 3-B | 2 | verificacion-fuera-banda | Protocolo claro de a quién escalar ante una sospecha. Rama resiliencia: sin duplicado, solo en ingeniería social. |

### Ransomware y endpoints
| id | nivel | costo | requiere | descripción |
|---|---|---|---|---|
| gestion-parches (ya existía) | 1 | 3 | — | Reduce la ventana de exposición a vulnerabilidades conocidas. |
| backups-inmutables (ya existía) | 2 | 4 | gestion-parches | Copias offline probadas, restaurables sin depender del pago de rescate. |
| edr-aislamiento (ya existía) | 3-A | 4 | backups-inmutables | Detecta y aísla endpoints comprometidos automáticamente. Rama recompensa: +1 reputación extra. |
| ransom-plan-continuidad | 3-B | 3 | backups-inmutables | Plan de continuidad de negocio ante una interrupción prolongada. Rama resiliencia: sin duplicado, solo en ransomware. |

### Redes y desinformación
| id | nivel | costo | requiere | descripción |
|---|---|---|---|---|
| verificacion-fuentes (ya existía) | 1 | 1 | — | Antes de reaccionar públicamente, se chequea origen, fecha y autor. |
| plan-comunicacion-crisis (ya existía) | 2 | 2 | verificacion-fuentes | Canal oficial único para desmentir información falsa con rapidez. |
| monitoreo-marca (ya existía) | 3-A | 2 | plan-comunicacion-crisis | Detecta menciones anómalas en etapa temprana. Rama recompensa: +1 reputación extra. |
| fake-protocolo-desmentido | 3-B | 2 | plan-comunicacion-crisis | Protocolo coordinado de desmentido multicanal. Rama resiliencia: sin duplicado, solo en desinformación. |

### Nube y terceros
| id | nivel | costo | requiere | descripción |
|---|---|---|---|---|
| escaneo-dependencias (ya existía) | 1 | 2 | — | Verifica la integridad de librerías externas antes de actualizar. |
| minimo-privilegio (ya existía) | 2 | 3 | escaneo-dependencias | Revisión periódica de accesos y cuentas de servicio en la nube. |
| auditoria-proveedores (ya existía) | 3-A | 3 | minimo-privilegio | Evalúa el riesgo de seguridad de terceros con acceso a tus sistemas. Rama recompensa: +1 reputación extra. |
| cloud-segmentacion | 3-B | 3 | minimo-privilegio | Segmentación de entornos en la nube para limitar el impacto de un incidente. Rama resiliencia: sin duplicado, solo en nube. |

### Auditoría
| id | nivel | costo | requiere | descripción |
|---|---|---|---|---|
| auditoria-checklist-basico | 1 | 2 | — | Checklist básico de cumplimiento normativo. |
| programa-auditoria-interna (ya existía) | 2 | 3 | auditoria-checklist-basico | Revisiones periódicas que detectan y corrigen brechas antes de que las encuentre un auditor externo. **Mantiene el efecto especial de `SPEC4.md`: revela la pista privada de categoría al equipo.** |
| auditoria-automatizacion-reportes | 3-A | 3 | programa-auditoria-interna | Automatiza la generación de reportes de cumplimiento. Rama recompensa: +1 reputación extra. |
| comite-auditoria-interna | 3-B | 2 | programa-auditoria-interna | Comité dedicado a seguimiento de hallazgos de auditoría. Rama resiliencia: sin duplicado, solo en auditoría. |

### Políticas (sin cambios de efecto, solo se etiqueta el nivel)
| id | nivel | costo | requiere | descripción |
|---|---|---|---|---|
| relevamiento-ti (ya existía) | 1 | 2 | — | Sin efecto propio. Habilita `gestion-riesgos`. |
| gestion-riesgos (ya existía) | 2 | 3 | relevamiento-ti | Reduce un 30% cualquier penalización de Omisión, en cualquier categoría, mientras se tenga. |
| siem (ya existía) | 3-A | 4 | gestion-riesgos | Cualquier caso que hubiera terminado en Omisión se resuelve como Reactiva sin cobrar el costo de emergencia. |
| comite-gobierno (ya existía) | 3-B | 2 | gestion-riesgos | El duplicado por categoría vulnerable repetida nunca se aplica, en ninguna categoría. |

### Sin categoría de árbol (sin cambios)
| id | nivel | costo | requiere | descripción |
|---|---|---|---|---|
| plan-respuesta-incidentes (ya existía) | — | 4 | — | Reduce en 1 unidad el costo de emergencia de cualquier categoría. Siempre visible, sin requisito. |

33 cartas en total.

## Orden de aplicación de efectos (actualiza al de `SPEC3.md`)

Cuando un equipo tendría que caer en Omisión para un caso de categoría `X`, evaluar en este
orden:

1. ¿Tiene `siem`? → se resuelve como Reactiva gratis. Fin.
2. Calcular el delta base de la tabla de casos.
3. ¿La categoría `X` ya estaba vulnerable? → duplicar, salvo que tenga `comite-gobierno`
   (global) o la carta 3-B específica de `X` (local) — cualquiera de las dos alcanza para
   evitar el duplicado.
4. ¿Tiene `gestion-riesgos`? → reducir el resultado un 30%.
5. Aplicar el delta final.

Cuando un equipo resuelve un caso de categoría `X` como Preventiva (tiene una carta de nivel
2+ de esa categoría):

1. Aplicar el `+2` estándar de reputación.
2. ¿Tiene además la carta 3-A de esa misma categoría `X`? → sumar `+1` extra (total `+3`).

## Criterios de aceptación

- [ ] Un equipo nuevo ve exactamente 9 cartas al arrancar (8 de nivel 1 + plan de respuesta a
      incidentes).
- [ ] Comprar una carta de nivel 1 hace aparecer, sin recargar la página, la de nivel 2 de esa
      misma categoría — y solo esa, ninguna otra categoría se ve afectada.
- [ ] Comprar la de nivel 2 hace aparecer **ambas** ramas de nivel 3 de esa categoría.
- [ ] Una carta de nivel 2 o 3 nunca aparece en la respuesta del servidor si no se cumple su
      requisito — probarlo inspeccionando la llamada de red directamente, no solo mirando la
      pantalla.
- [ ] Tener solo el nivel 1 de una categoría **no** cuenta como Preventiva para un caso de esa
      categoría.
- [ ] Tener el nivel 2 (sin nivel 3) de una categoría sí cuenta como Preventiva, con el `+2`
      estándar, sin el `+1` extra.
- [ ] Tener nivel 2 + rama 3-A da el `+2` más el `+1` extra al resolver Preventiva.
- [ ] Tener nivel 2 + rama 3-B evita el duplicado en esa categoría específica, aunque el
      equipo no tenga `comite-gobierno`.
- [ ] El presupuesto inicial de un equipo nuevo es 30, no 20.
- [ ] `programa-auditoria-interna` sigue disparando la pista privada de `SPEC4.md` al
      usarse, sin cambios en ese comportamiento.
