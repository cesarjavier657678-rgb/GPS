window.GPS = {
    mapa: null,
    geocodificador: null,
    autocompletadoOrigen: null,
    autocompletadoDestino: null,
    posicionOrigen: null,
    posicionDestino: null,
    lineaRuta: null,
    marcadoresRuta: [],
    marcadoresPeajes: [],
    zonas: [],
    capasZonas: [],
    zonasVisibles: false,
    modoColocarZona: false,
};

function porId(id) {
    return document.getElementById(id);
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatearMoneda(valor, codigoMoneda = "MXN") {
    const numero = Number(valor || 0);
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: codigoMoneda,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(numero) ? numero : 0);
}

async function solicitarJson(url, opciones = {}) {
    const respuesta = await fetch(url, {
        ...opciones,
        headers: {
            "Content-Type": "application/json",
            ...(opciones.headers || {}),
        },
    });

    const contenido = await respuesta.json().catch(() => ({
        ok: false,
        error: "El servidor devolvió una respuesta no válida.",
    }));

    if (!respuesta.ok || contenido.ok === false) {
        throw new Error(contenido.error || `Error HTTP ${respuesta.status}`);
    }
    return contenido;
}

function mostrarMensaje(texto, tipo = "info") {
    let contenedor = document.getElementById("toast-container");
    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.id = "toast-container";
        contenedor.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 380px;
            width: 100%;
            pointer-events: none;
        `;
        document.body.appendChild(contenedor);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${tipo}`;
    toast.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 14px 18px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
        border-left: 5px solid var(--color-primary);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        pointer-events: auto;
        animation: slideIn 0.3s ease;
        transition: opacity 0.3s ease, transform 0.3s ease;
        font-family: 'Inter', sans-serif;
        font-size: 0.9rem;
        color: var(--color-text);
    `;

    const colores = {
        info: { border: '#00b4d8', bg: '#e8f4fd' },
        success: { border: '#2d7a5a', bg: '#e3f2ed' },
        error: { border: '#b33c3c', bg: '#fde8e8' }
    };
    const color = colores[tipo] || colores.info;
    toast.style.borderLeftColor = color.border;
    toast.style.background = color.bg;

    const textoEl = document.createElement("span");
    textoEl.textContent = texto;
    textoEl.style.flex = "1";

    const cerrarBtn = document.createElement("button");
    cerrarBtn.innerHTML = "✕";
    cerrarBtn.style.cssText = `
        background: transparent;
        border: none;
        font-size: 1.2rem;
        color: #6b7a8b;
        cursor: pointer;
        padding: 0 4px;
        transition: color 0.2s;
    `;
    cerrarBtn.addEventListener("click", () => {
        toast.remove();
    });
    cerrarBtn.addEventListener("mouseenter", () => {
        cerrarBtn.style.color = "#1a2a3a";
    });
    cerrarBtn.addEventListener("mouseleave", () => {
        cerrarBtn.style.color = "#6b7a8b";
    });

    toast.appendChild(textoEl);
    toast.appendChild(cerrarBtn);
    contenedor.appendChild(toast);

    const timeoutId = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(30px)";
        setTimeout(() => toast.remove(), 300);
    }, 5000);

    cerrarBtn.addEventListener("click", () => {
        clearTimeout(timeoutId);
    });

    if (!document.getElementById("toast-styles")) {
        const style = document.createElement("style");
        style.id = "toast-styles";
        style.textContent = `
            @keyframes slideIn {
                from { opacity: 0; transform: translateX(30px); }
                to { opacity: 1; transform: translateX(0); }
            }
        `;
        document.head.appendChild(style);
    }
}

function ocultarMensaje() {
}

function establecerCarga(activo) {
    const boton = porId("botonCalcular");
    boton.disabled = activo;
    boton.textContent = activo ? "Calculando..." : "Calcular ruta";
}

async function calcularRuta() {
    const origen = porId("entradaOrigen").value.trim();
    const destino = porId("entradaDestino").value.trim();
    const rendimiento = Number(porId("entradaRendimiento").value);
    const vehiculoSeleccionado = porId("selectorVehiculo").value;

    const mapeoBackend = {
        'SUV': 'GASOLINE',
        'PICKUP': 'GASOLINE',
        'MOTORCYCLE': 'GASOLINE',
        'TRAILER': 'TRUCK'
    };
    let vehicleType = mapeoBackend[vehiculoSeleccionado] || vehiculoSeleccionado;

    const PRECIO_DIESEL_MXN = 23.50;

    if (!origen || !destino) {
        mostrarMensaje("EScoje un inicio y un destino.", "error");
        return;
    }
    if (!Number.isFinite(rendimiento) || rendimiento <= 0 || rendimiento > 100) {
        mostrarMensaje("El rendimiento debe estar entre 0 y 100 km/l.", "error");
        return;
    }

    const payload = {
        origin: origen,
        destination: destino,
        vehicle_type: vehicleType,
        vehicle_real_type: vehiculoSeleccionado,
        efficiency_km_l: rendimiento,
    };

    if (vehiculoSeleccionado === "TRAILER") {
        payload.fuel_price_mxn = PRECIO_DIESEL_MXN;
        const precioPorCaseta = Number(porId("selectorEjes").value);
        if (!isNaN(precioPorCaseta) && precioPorCaseta > 0) {
            payload.toll_price_per_booth = precioPorCaseta;
        }
    }

    establecerCarga(true);
    mostrarMensaje("Calculando...", "info");

    try {
        const respuesta = await solicitarJson("/api/route", {
            method: "POST",
            body: JSON.stringify(payload),
        });
        window.GPSMapa.dibujarRuta(respuesta.data);
        mostrarResultado(respuesta.data);
        mostrarMensaje("Ruta calculada .", "success");
    } catch (error) {
        mostrarMensaje(error.message, "error");
    } finally {
        establecerCarga(false);
    }
}

function mostrarResultado(datos) {
    porId("valorDistancia").textContent = `${Number(datos.distance_km).toFixed(2)} km`;
    porId("valorDuracion").textContent = `${Math.round(Number(datos.duration_min))} min`;
    porId("valorLitros").textContent = `${Number(datos.estimated_liters).toFixed(2)} L`;
    porId("valorCostoCombustible").textContent = formatearMoneda(datos.fuel_cost_mxn);
    porId("valorCostoPeajes").textContent = formatearMoneda(
        datos.toll_cost,
        datos.toll_currency || "MXN",
    );
    porId("valorCostoTotal").textContent = formatearMoneda(datos.total_cost_mxn);

    const vehiculoSeleccionado = porId("selectorVehiculo").value;
    const labelCombustible = porId("labelCombustible");
    if (vehiculoSeleccionado === "TRAILER") {
        labelCombustible.textContent = "Diésel";
    } else {
        labelCombustible.textContent = "Gasolina";
    }

    const origen = datos.origin?.address || datos.origin?.query || "Origen";
    const destino = datos.destination?.address || datos.destination?.query || "Destino";
    porId("descripcionRuta").textContent = `${origen} → ${destino}`;
    mostrarZonasRojas(datos.red_zones || []);
    mostrarPeajes(datos);

    const dialog = porId("dialogoResultados");
    dialog.showModal();
}

function mostrarZonasRojas(zonas) {
    const bloque = porId("resultadoZonasRojas");
    const insignia = porId("insigniaAdvertenciaZona");
    const lista = porId("listaZonasRojas");
    lista.innerHTML = "";

    if (!zonas.length) {
        bloque.classList.add("hidden");
        insignia.classList.add("hidden");
        return;
    }

    bloque.classList.remove("hidden");
    insignia.classList.remove("hidden");
    zonas.forEach((zona) => {
        const elemento = document.createElement("li");
        const lugar = [zona.municipality, zona.state].filter(Boolean).join(", ");
        elemento.textContent = `${zona.name}${lugar ? ` — ${lugar}` : ""}`;
        lista.appendChild(elemento);
    });
}

function mostrarPeajes(datos) {
    const contenedor = porId("listaPeajes");
    const peajes = Array.isArray(datos.tolls) ? datos.tolls : [];

    if (!datos.has_tolls) {
        contenedor.innerHTML = '<p class="small-text">La ruta seleccionada no tiene peajes.</p>';
        return;
    }

    const advertencias = (datos.toll_warnings || [])
        .map((texto) => `<p class="small-text">${escaparHtml(texto)}</p>`)
        .join("");

    const elementos = peajes.map((peaje) => {
        const detalle = peaje.address || peaje.instruction || "";
        return `
            <article class="toll-item">
                <strong>${escaparHtml(peaje.name || "Caseta de cobro")}</strong>
                ${detalle ? `<span>${escaparHtml(detalle)}</span>` : ""}
            </article>`;
    }).join("");

    const mensajeSinCasetas = '<p class="small-text">Se detectaron peajes, pero no fue posible identificar cada caseta.</p>';
    contenedor.innerHTML = `${elementos || mensajeSinCasetas}${advertencias}`;
}

function limpiarOrigen() {
    porId("entradaOrigen").value = "";
    GPS.posicionOrigen = null;
    window.GPSMapa?.limpiarRuta();
}

function limpiarDestino() {
    porId("entradaDestino").value = "";
    GPS.posicionDestino = null;
    window.GPSMapa?.limpiarRuta();
}

function limpiarTodo() {
    limpiarOrigen();
    limpiarDestino();
    const dialog = porId("dialogoResultados");
    if (dialog.open) {
        dialog.close();
    }
}

function cerrarDialogoResultados() {
    const dialog = porId("dialogoResultados");
    if (dialog.open) {
        dialog.close();
    }
}

function cerrarDialogoAlClicFuera(evento) {
    const dialog = porId("dialogoResultados");
    if (evento.target === dialog) {
        dialog.close();
    }
}

function abrirPanelOpciones() {
    const panel = porId("panelOpciones");
    const overlay = porId("overlayOpciones");
    panel.classList.add("abierto");
    overlay.classList.add("visible");
    document.body.style.overflow = "hidden";
}

function cerrarPanelOpciones() {
    const panel = porId("panelOpciones");
    const overlay = porId("overlayOpciones");
    panel.classList.remove("abierto");
    overlay.classList.remove("visible");
    document.body.style.overflow = "";
}

window.gm_authFailure = function () {
    mostrarMensaje(
        "La API key fue rechazada. Revisa configuracion.py y los servicios habilitados.",
        "error",
    );
};

document.addEventListener("DOMContentLoaded", () => {
    const selectorVehiculo = porId("selectorVehiculo");
    const inputRendimiento = porId("entradaRendimiento");
    const campoEjes = porId("campoEjes");

    const botonToggle = porId("botonToggleOpciones");
    const botonCerrar = porId("botonCerrarOpciones");
    const overlay = porId("overlayOpciones");

    botonToggle.addEventListener("click", () => {
        const panel = porId("panelOpciones");
        if (panel.classList.contains("abierto")) {
            cerrarPanelOpciones();
        } else {
            abrirPanelOpciones();
        }
    });

    botonCerrar.addEventListener("click", cerrarPanelOpciones);
    overlay.addEventListener("click", cerrarPanelOpciones);

    document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape") {
            const panel = porId("panelOpciones");
            if (panel.classList.contains("abierto")) {
                cerrarPanelOpciones();
            }
        }
    });

    function actualizarCamposPorVehiculo() {
        const tipo = selectorVehiculo.value;
        if (tipo === "TRAILER") {
            campoEjes.style.display = "block";
        } else {
            campoEjes.style.display = "none";
        }
    }

    selectorVehiculo.addEventListener("change", actualizarCamposPorVehiculo);
    actualizarCamposPorVehiculo();

    const rendimientosPorDefecto = {
        GASOLINE: 14,
        SUV: 12,
        PICKUP: 10,
        MOTORCYCLE: 35,
        TRAILER: 4
    };

    function actualizarRendimientoPorDefecto() {
        const tipo = selectorVehiculo.value;
        if (rendimientosPorDefecto[tipo] !== undefined) {
            inputRendimiento.value = rendimientosPorDefecto[tipo];
        }
    }

    selectorVehiculo.addEventListener("change", actualizarRendimientoPorDefecto);
    actualizarRendimientoPorDefecto();

    porId("botonCalcular").addEventListener("click", calcularRuta);
    porId("botonLimpiarTodo").addEventListener("click", limpiarTodo);
    porId("botonLimpiarOrigen").addEventListener("click", limpiarOrigen);
    porId("botonLimpiarDestino").addEventListener("click", limpiarDestino);

    const dialogResultados = porId("dialogoResultados");
    const cerrarBtn = porId("botonCerrarResultados");
    const cerrarFooterBtn = porId("botonCerrarResultadosFooter");

    cerrarBtn.addEventListener("click", cerrarDialogoResultados);
    cerrarFooterBtn.addEventListener("click", cerrarDialogoResultados);
    dialogResultados.addEventListener("click", cerrarDialogoAlClicFuera);

    [porId("entradaOrigen"), porId("entradaDestino")].forEach((entrada) => {
        entrada.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter") {
                evento.preventDefault();
                calcularRuta();
            }
        });
    });
});