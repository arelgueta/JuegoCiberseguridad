(function () {
  const socket = io();
  const mensajeEl = document.getElementById('mensaje');
  const valorPresupuesto = document.getElementById('valor-presupuesto');
  const valorReputacion = document.getElementById('valor-reputacion');
  const listaCompradas = document.getElementById('lista-compradas');
  const inicial = JSON.parse(document.getElementById('equipo-inicial').textContent);
  const herramientasInfo = JSON.parse(document.getElementById('herramientas-info').textContent);
  const herramientasPorId = new Map(herramientasInfo.map((h) => [h.id, h]));
  const equipoId = inicial.id;

  let estadoActual = inicial;

  function mostrarMensaje(texto, tipo) {
    mensajeEl.textContent = texto;
    mensajeEl.className = 'mensaje ' + tipo;
    setTimeout(() => {
      mensajeEl.textContent = '';
      mensajeEl.className = '';
    }, 4000);
  }

  function renderEstado(equipo) {
    estadoActual = equipo;
    valorPresupuesto.textContent = equipo.presupuesto;
    valorReputacion.textContent = equipo.reputacion;

    if (equipo.herramientas.length === 0) {
      listaCompradas.innerHTML = '<span>Todavía no compraron nada.</span>';
    } else {
      listaCompradas.innerHTML = equipo.herramientas
        .map((hid) => {
          const info = herramientasPorId.get(hid);
          return `<span>${info ? info.nombre : hid}</span>`;
        })
        .join('');
    }

    document.querySelectorAll('.herramienta-card').forEach((card) => {
      const id = card.dataset.id;
      const costo = Number(card.dataset.costo);
      const btn = card.querySelector('.btn-comprar');
      if (equipo.herramientas.includes(id)) {
        btn.disabled = true;
        btn.textContent = 'Ya la tenés';
      } else if (equipo.presupuesto < costo) {
        btn.disabled = true;
        btn.textContent = 'Presupuesto insuficiente';
      } else {
        btn.disabled = false;
        btn.textContent = `Comprar (${costo})`;
      }
    });
  }

  document.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('btn-comprar') || e.target.disabled) return;
    const card = e.target.closest('.herramienta-card');
    const herramientaId = card.dataset.id;
    e.target.disabled = true;
    e.target.textContent = 'Comprando...';
    const res = await fetch(`/api/equipos/${equipoId}/comprar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ herramienta_id: herramientaId }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarMensaje(data.error || 'No se pudo comprar.', 'error');
      renderEstado(estadoActual);
      return;
    }
    mostrarMensaje('Compra realizada.', 'exito');
  });

  socket.on('estado:actualizado', (data) => {
    const propio = data.equipos.find((e) => e.id === equipoId);
    if (propio) {
      renderEstado(propio);
    }
  });

  renderEstado(inicial);
})();
