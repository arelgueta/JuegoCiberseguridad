# JuegoCiberseguridad

BRECHA — servidor en vivo para la simulación de ciberseguridad de clase. Ver [SPEC.md](SPEC.md)
para el detalle funcional de esta fase.

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
