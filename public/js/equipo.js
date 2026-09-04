(function () {
  const socket = io();
  const mensajeEl = document.getElementById('mensaje');
  const valorPresupuesto = document.getElementById('valor-presupuesto');
  const valorReputacion = document.getElementById('valor-reputacion');
  const listaCompradas = document.getElementById('lista-compradas');
  const bannerRonda = document.getElementById('banner-ronda');
  const tarjetaPista = document.getElementById('tarjeta-pista');
  const toastContenedor = document.getElementById('toast-resultado');
  const catalogoEl = document.getElementById('catalogo');

  const inicial = JSON.parse(document.getElementById('equipo-inicial').textContent);
  const categoriasInfo = JSON.parse(document.getElementById('categorias-info').textContent);
  const equipoId = inicial.id;

  let estadoActual = inicial;
  let sesionActual = JSON.parse(document.getElementById('sesion-inicial').textContent);
  let catalogoPorId = new Map();

  socket.emit('equipo:unirse', equipoId);

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function mostrarMensaje(texto, tipo) {
    mensajeEl.textContent = texto;
    mensajeEl.className = 'mensaje ' + tipo;
    setTimeout(() => {
      mensajeEl.textContent = '';
      mensajeEl.className = '';
    }, 4000);
  }

  function formatTiempo(segundos) {
    const s = Math.max(0, Math.ceil(segundos));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function segundosRestantes(sesion) {
    if (!sesion.rondaInicio) return 0;
    const inicio = new Date(sesion.rondaInicio).getTime();
    const transcurrido = (Date.now() - inicio) / 1000;
    return sesion.rondaDuracionSeg - transcurrido;
  }

  // Cubre Preventiva desde nivel 2 en adelante (SPEC8.md) — nivel 1 solo no alcanza.
  function tieneCategoriaCubierta(equipo, categoria) {
    return [...catalogoPorId.values()].some(
      (h) => h.categoria === categoria && ['2', '3-A', '3-B'].includes(h.nivel) && equipo.herramientas.includes(h.id)
    );
  }

  function renderBannerRonda() {
    const sesion = sesionActual;
    const equipo = estadoActual;

    if (sesion.rondaEstado !== 'activa') {
      bannerRonda.hidden = true;
      bannerRonda.innerHTML = '';
      return;
    }

    bannerRonda.hidden = false;

    if (sesion.rondaNumero === 0) {
      bannerRonda.innerHTML = `
        <p class="titulo-ronda">Momento 0</p>
        <p class="cronometro" id="cronometro">--:--</p>
        <p>Elegí en qué invertir usando el catálogo completo mientras dure el cronómetro.</p>
      `;
      return;
    }

    const caso = sesion.casoActivo;
    if (!caso) {
      bannerRonda.hidden = true;
      return;
    }

    const cubierto = tieneCategoriaCubierta(equipo, caso.categoria);
    const yaReacciono = equipo.reaccionoEstaRonda;

    let accionHtml;
    if (cubierto) {
      accionHtml = '<p class="cartel-cubierto">Ya estás cubierto — se te va a aplicar Preventiva.</p>';
    } else if (yaReacciono) {
      accionHtml = '<p class="cartel-cubierto">Ya reaccionaste en esta ronda.</p>';
    } else {
      const alcanza = equipo.presupuesto >= caso.costoReactiva;
      accionHtml = `<button id="btn-reaccionar" type="button" ${alcanza ? '' : 'disabled'}>${
        alcanza ? `Reaccionar (cuesta ${caso.costoReactiva})` : 'Presupuesto insuficiente para reaccionar'
      }</button>`;
    }

    bannerRonda.innerHTML = `
      <p class="titulo-ronda">Caso #${caso.numero}: ${escapeHtml(caso.titulo)}</p>
      <p class="cronometro" id="cronometro">--:--</p>
      ${accionHtml}
    `;
  }

  bannerRonda.addEventListener('click', async (e) => {
    if (e.target.id !== 'btn-reaccionar') return;
    e.target.disabled = true;
    const res = await fetch(`/api/equipos/${equipoId}/reaccionar`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      mostrarMensaje(data.error || 'No se pudo reaccionar.', 'error');
      renderBannerRonda();
      return;
    }
    mostrarMensaje('Reaccionaste a tiempo.', 'exito');
  });

  setInterval(() => {
    const el = document.getElementById('cronometro');
    if (!el || sesionActual.rondaEstado !== 'activa') return;
    el.textContent = formatTiempo(segundosRestantes(sesionActual));
  }, 250);

  function renderPista(pista) {
    if (!pista) {
      tarjetaPista.hidden = true;
      return;
    }
    tarjetaPista.hidden = false;
    const cat = pista.categoriaSugerida ? categoriasInfo[pista.categoriaSugerida] : null;
    tarjetaPista.style.background = cat ? cat.fondo : '#F1EFE8';
    tarjetaPista.style.color = cat ? cat.color : '#5F5E5A';
    tarjetaPista.querySelector('.pista-texto').textContent = pista.mensaje;
  }

  function mostrarToastResultado(item) {
    const etiquetas = { preventiva: 'Preventiva', reactiva: 'Reactiva', omision: 'Omisión' };
    const clases = { preventiva: 'toast-preventiva', reactiva: 'toast-reactiva', omision: 'toast-omision' };
    const div = document.createElement('div');
    div.className = `toast ${clases[item.ruta] || ''}`;
    const signoP = item.deltaPresupuesto >= 0 ? '+' : '';
    const signoR = item.deltaReputacion >= 0 ? '+' : '';
    div.innerHTML = `
      <button class="toast-cerrar" type="button" aria-label="Cerrar">×</button>
      <strong>${etiquetas[item.ruta] || item.ruta}</strong>
      <span>Presupuesto ${signoP}${item.deltaPresupuesto} · Reputación ${signoR}${item.deltaReputacion}</span>
    `;
    div.querySelector('.toast-cerrar').addEventListener('click', () => div.remove());
    toastContenedor.appendChild(div);
    setTimeout(() => div.remove(), 6000);
  }

  function renderListaCompradas(equipo) {
    if (equipo.herramientas.length === 0) {
      listaCompradas.innerHTML = '<span>Todavía no utilizaron nada.</span>';
      return;
    }
    listaCompradas.innerHTML = equipo.herramientas
      .map((hid) => {
        const info = catalogoPorId.get(hid);
        return `<span>${info ? escapeHtml(info.nombre) : hid}</span>`;
      })
      .join('');
  }

  function aplicarEstadoBotones() {
    const equipo = estadoActual;
    document.querySelectorAll('.herramienta-card').forEach((card) => {
      const id = card.dataset.id;
      const costo = Number(card.dataset.costo);
      const btn = card.querySelector('.btn-utilizar');

      if (sesionActual.rondaEstado !== 'activa') {
        btn.disabled = true;
        btn.textContent = 'Esperando a que el docente inicie la próxima ronda';
      } else if (equipo.herramientas.includes(id)) {
        btn.disabled = true;
        btn.textContent = 'Ya la estás utilizando';
      } else if (equipo.presupuesto < costo) {
        btn.disabled = true;
        btn.textContent = 'Presupuesto insuficiente';
      } else {
        btn.disabled = false;
        btn.textContent = `Utilizar (${costo})`;
      }
    });
  }

  // El catálogo que llega acá ya viene filtrado por el servidor (SPEC8.md): una carta de
  // nivel 2/3 sin desbloquear directamente no está en esta lista, no solo deshabilitada.
  function renderCatalogo(catalogo) {
    catalogoPorId = new Map(catalogo.map((h) => [h.id, h]));
    const porCategoria = new Map();
    for (const h of catalogo) {
      if (!porCategoria.has(h.categoria)) porCategoria.set(h.categoria, []);
      porCategoria.get(h.categoria).push(h);
    }

    catalogoEl.innerHTML = '';
    for (const [slug, cat] of Object.entries(categoriasInfo)) {
      const items = porCategoria.get(slug);
      if (!items || items.length === 0) continue;
      const grupo = document.createElement('div');
      grupo.className = 'categoria-grupo';
      const cabecera = document.createElement('span');
      cabecera.className = 'categoria-titulo';
      cabecera.style.background = cat.fondo;
      cabecera.style.color = cat.color;
      cabecera.textContent = cat.nombre;
      grupo.appendChild(cabecera);

      for (const h of items) {
        const card = document.createElement('div');
        card.className = 'herramienta-card';
        card.dataset.id = h.id;
        card.dataset.costo = h.costo;
        card.style.background = cat.fondo;
        card.innerHTML = `
          <div class="info">
            <div class="nombre" style="color: ${cat.color};">${escapeHtml(h.nombre)}</div>
            <div class="descripcion">${escapeHtml(h.descripcion)}</div>
          </div>
          <div class="costo">Costo: ${h.costo}</div>
          <button class="btn-utilizar" type="button">Utilizar</button>
        `;
        grupo.appendChild(card);
      }
      catalogoEl.appendChild(grupo);
    }

    aplicarEstadoBotones();
  }

  async function refrescarCatalogo() {
    const res = await fetch(`/api/equipos/${equipoId}/catalogo`);
    const data = await res.json();
    renderCatalogo(data.catalogo);
  }

  function renderEstado(equipo) {
    estadoActual = equipo;
    valorPresupuesto.textContent = equipo.presupuesto;
    valorReputacion.textContent = equipo.reputacion;
    renderListaCompradas(equipo);
    renderBannerRonda();
    refrescarCatalogo();
  }

  catalogoEl.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('btn-utilizar') || e.target.disabled) return;
    const card = e.target.closest('.herramienta-card');
    const herramientaId = card.dataset.id;
    e.target.disabled = true;
    e.target.textContent = 'Utilizando...';
    const res = await fetch(`/api/equipos/${equipoId}/comprar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ herramienta_id: herramientaId }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarMensaje(data.error || 'No se pudo utilizar.', 'error');
      aplicarEstadoBotones();
      return;
    }
    mostrarMensaje('Herramienta en uso.', 'exito');
  });

  socket.on('estado:actualizado', (data) => {
    sesionActual = data.sesion;
    const propio = data.equipos.find((e) => e.id === equipoId);
    if (propio) {
      renderEstado(propio);
    } else {
      renderBannerRonda();
    }
  });

  socket.on('pista:auditoria', (pista) => {
    renderPista(pista);
    mostrarMensaje('Llegó una pista de la auditoría interna.', 'exito');
  });

  socket.on('resultado:caso', (item) => {
    mostrarToastResultado(item);
  });

  renderPista(JSON.parse(document.getElementById('pista-inicial').textContent));
  renderCatalogo(JSON.parse(document.getElementById('catalogo-inicial').textContent));
  estadoActual = inicial;
  valorPresupuesto.textContent = inicial.presupuesto;
  valorReputacion.textContent = inicial.reputacion;
  renderListaCompradas(inicial);
  renderBannerRonda();
})();
