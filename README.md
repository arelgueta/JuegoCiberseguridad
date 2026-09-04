# JuegoCiberseguridad

BRECHA — servidor en vivo para la simulación de ciberseguridad de clase. El detalle funcional
está repartido en [SPEC.md](SPEC.md) (Fase 1: MVP), [SPEC2.md](SPEC2.md) (Fase 2: rondas con
cronómetro), [SPEC3.md](SPEC3.md) (sorteo de casos y Momento 0, reemplaza el cierre especial de
auditoría de SPEC2) y [SPEC4.md](SPEC4.md) (pista privada de auditoría vía salas de Socket.io) —
cada documento extiende o corrige al anterior, en ese orden.

## Uso

```
docker compose up
```

Levanta el servidor en `http://localhost:3000` (y en la IP de la PC del docente dentro de la
WiFi del aula, por ejemplo `http://192.168.1.50:3000`).

- `/docente` — panel del profesor.
- `/equipo` — selector de equipo, para abrir desde el celular.
- `/proyector` — ranking en vivo, para conectar al cañón.

Los datos se guardan en `./data/brecha.sqlite`, que persiste aunque se reinicie el contenedor.

## Desarrollo sin Docker

```
npm install
npm start
```
