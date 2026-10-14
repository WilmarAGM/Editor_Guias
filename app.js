/* Editor de guías · revisión por bloques.
   La guía se muestra en un iframe (mismo origen). Cada bloque trae data-bloque="H2b" (nombre de su
   variable en build_*.py); lo que no lo trae recibe un identificador derivado del bloque que lo contiene.
   Las correcciones viven en localStorage (por guía) y salen en un .md con los datos al final para poder
   cargarlo de nuevo. */
'use strict';

const FORMATO = 1;
const CLAVE = 'editorGuias.v1.';
const SEL_BLOQUES = '[data-bloque], .caja, section.libre, .fig, .hdr h1, .notes-sub';
const ACCIONES = {
  comentar: { nombre: 'Comentar', color: '#005a96' },
  proponer: { nombre: 'Proponer texto', color: '#b47818' },
  eliminar: { nombre: 'Eliminar', color: '#a63a3a' },
  mover:    { nombre: 'Mover', color: '#6b4fa0' },
  aprobar:  { nombre: 'Aprobado', color: '#2f7d4f' },
};

const $ = id => document.getElementById(id);
const ui = {
  guia: $('guia'), revisor: $('revisor'), contador: $('contador'),
  cargar: $('btn-cargar'), archivo: $('archivo'), descargar: $('btn-descargar'),
  marco: $('marco'), cargando: $('cargando'),
  inicio: $('vista-inicio'), edicion: $('vista-edicion'), lista: $('lista'), listaVacia: $('lista-vacia'),
  bHoja: $('b-hoja'), bTitulo: $('b-titulo'), bTipo: $('b-tipo'), bId: $('b-id'), bTexto: $('b-texto'),
  padre: $('btn-padre'), volver: $('btn-volver'),
  grupoMover: $('grupo-mover'), moverDonde: $('mover-donde'), moverRef: $('mover-ref'),
  grupoProp: $('grupo-propuesto'), propuesto: $('propuesto'), copiarActual: $('btn-copiar-actual'),
  comentario: $('comentario'), lblComentario: $('lbl-comentario'),
  aviso: $('aviso-form'), cancelar: $('btn-cancelar'), borrar: $('btn-borrar'), toast: $('toast'),
};

const estado = {
  guias: [],          // guias.json
  guia: null,         // la guía abierta
  doc: null,          // documento del iframe
  bloques: new Map(), // id -> {el, id, hoja, tituloHoja, tipo, titulo, orden}
  datos: null,        // {correcciones: {id: c}, descargado: huella}
  sel: null,          // bloque seleccionado
  sucio: false,       // formulario con cambios sin guardar
};

/* ---------- almacenamiento (puede fallar: ventana privada, datos bloqueados) ---------- */
const almacen = {
  leer(k) { try { return JSON.parse(localStorage.getItem(CLAVE + k)); } catch { return null; } },
  escribir(k, v) { try { localStorage.setItem(CLAVE + k, JSON.stringify(v)); return true; } catch { return false; } },
};
let avisoAlmacen = false;
function guardarDatos() {
  if (!almacen.escribir('guia.' + estado.guia.id, estado.datos) && !avisoAlmacen) {
    avisoAlmacen = true;
    toast('Este navegador no deja guardar: descarga el .md antes de cerrar la página.', true);
  }
}

/* ---------- utilidades ---------- */
function toast(msg, malo = false) {
  ui.toast.textContent = msg;
  ui.toast.classList.toggle('malo', malo);
  ui.toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { ui.toast.hidden = true; }, malo ? 6000 : 3200);
}
function huella(obj) {   // djb2 sobre el JSON: sólo para saber si cambió algo desde la última descarga
  const s = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function ahora() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
const recortar = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const sinDolares = s => s.replace(/\$/g, '');   // para mostrar títulos en el panel

/* Texto de un bloque con las fórmulas en LaTeX (KaTeX guarda la fuente en <annotation>). */
function aLatex(el) {
  let out = '';
  const BLOQUE = /^(P|DIV|LI|TR|H1|H2|H3|UL|OL|TABLE|SECTION|FIGCAPTION)$/;
  (function rec(n) {
    if (n.nodeType === 3) { out += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    const e = n;
    if (e.classList.contains('katex')) {
      const a = e.querySelector('annotation[encoding="application/x-tex"]');
      out += a ? '$' + a.textContent.trim() + '$' : e.textContent;
      return;
    }
    const tag = e.tagName.toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || e.classList.contains('espacio')) return;
    if (tag === 'BR') { out += '\n'; return; }
    if (e.classList.contains('blank')) { out += ' ______ '; return; }
    const bloque = BLOQUE.test(tag);
    if (bloque) out += '\n';
    if (tag === 'TD' || tag === 'TH') out += ' | ';
    const negrita = tag === 'B' || tag === 'STRONG';
    if (negrita) out += '**';
    e.childNodes.forEach(rec);
    if (negrita) out += '**';
    if (bloque) out += '\n';
  })(el);
  return out.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\*\* +\*\*/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function tipoDe(el) {
  const c = el.classList;
  if (el.matches('.hdr h1')) return 'Título de la hoja';
  if (c.contains('notes-sub')) return 'Frase de la columna de notas';
  if (c.contains('definicion')) return 'Definición';
  if (c.contains('teorema')) return 'Teorema';
  if (c.contains('faq')) return 'Preguntas frecuentes';
  if (c.contains('ej')) return /^Problema/.test(tituloDe(el)) ? 'Problema de examen' : 'Ejercicio';
  if (c.contains('teoria')) return 'Teoría';
  if (c.contains('ejemplo')) return 'Ejemplo';
  if (c.contains('practica')) return 'Ejemplo guiado';
  if (c.contains('errores')) return 'Errores comunes';
  if (c.contains('fig')) return 'Figura';
  if (c.contains('fila')) return 'Recuadros lado a lado';
  if (c.contains('rejilla')) return 'Grupo de ejercicios';
  return 'Bloque';
}
function tituloDe(el) {
  if (el.matches('.hdr h1, .notes-sub')) return aLatex(el);
  const t = el.querySelector(':scope > .caja-titulo, :scope > h2.sub, figcaption, .cap');
  return t ? aLatex(t) : '';
}

/* ---------- carga de la lista de guías y de una guía ---------- */
async function iniciar() {
  ui.revisor.value = almacen.leer('revisor') || '';
  try {
    const r = await fetch('guias.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    estado.guias = await r.json();
  } catch {
    ui.cargando.textContent = 'No se pudo leer la lista de guías (guias.json).';
    return;
  }
  ui.guia.innerHTML = '';
  for (const g of estado.guias) {
    const o = document.createElement('option');
    o.value = g.id;
    o.textContent = `${g.nombre} (${g.hojas} hojas)`;
    ui.guia.append(o);
  }
  ui.guia.disabled = false;
  const pedida = new URLSearchParams(location.search).get('guia');
  const inicial = [pedida, almacen.leer('ultimaGuia')].find(id => estado.guias.some(g => g.id === id)) || estado.guias[0].id;
  abrirGuia(inicial);
}

function abrirGuia(id) {
  const g = estado.guias.find(x => x.id === id);
  if (!g) return;
  estado.guia = g;
  estado.sel = null;
  estado.sucio = false;
  estado.datos = almacen.leer('guia.' + id) || { correcciones: {}, descargado: null };
  ui.guia.value = id;
  almacen.escribir('ultimaGuia', id);
  const url = new URL(location.href);
  url.searchParams.set('guia', id);
  history.replaceState(null, '', url);
  document.title = `${g.nombre} · Revisión`;
  ui.cargando.hidden = false;
  ui.cargando.textContent = `Cargando ${g.nombre}…`;
  mostrarInicio();
  ui.marco.src = `${g.archivo}?v=${encodeURIComponent(g.version)}`;
}

ui.marco.addEventListener('load', () => {
  let doc = null;
  try { doc = ui.marco.contentDocument; } catch { /* otro origen */ }
  if (!doc || !doc.querySelector('.page')) {
    ui.cargando.textContent = 'No se pudo abrir la guía. Si abriste index.html con doble clic, ábrelo desde un servidor (la página publicada en Vercel funciona).';
    return;
  }
  estado.doc = doc;
  prepararDocumento(doc);
  ajustarZoom();
  pintarMarcas();
  pintarLista();
  ui.cargando.hidden = true;
});

function prepararDocumento(doc) {
  const css = doc.createElement('style');
  css.textContent = `
    html, body { background: #eef1f4 !important; }
    [data-rev] { cursor: pointer; }
    .rev-hover { outline: 2px dashed rgba(0,90,150,.65) !important; outline-offset: -2px; }
    .rev-con { outline: 3px solid var(--rev-c) !important; outline-offset: -3px; }
    .rev-sel { outline: 3px solid #005a96 !important; outline-offset: -3px; background-color: rgba(0,90,150,.06) !important; }
    a { pointer-events: none; }`;
  doc.head.append(css);

  estado.bloques = new Map();
  const usados = new Map();
  let orden = 0;
  doc.querySelectorAll('.page').forEach((pg, i) => {
    const hoja = i + 1;
    const h1 = pg.querySelector('.hdr h1');
    const tituloHoja = h1 ? aLatex(h1) : '';
    pg.querySelectorAll(SEL_BLOQUES).forEach(el => {
      if (el.matches('.notes-sub') && !el.textContent.trim()) return;
      let id;
      if (el.dataset.bloque) id = el.dataset.bloque;
      else if (el.matches('.hdr h1')) id = `hoja${hoja}.titulo`;
      else if (el.matches('.notes-sub')) id = `hoja${hoja}.notas`;
      else {
        const padre = el.parentElement.closest('[data-rev]');
        const base = padre ? padre.dataset.rev : `hoja${hoja}`;
        id = `${base}›${slug(tituloDe(el) || tipoDe(el)) || 'bloque'}`;
      }
      const n = (usados.get(id) || 0) + 1;
      usados.set(id, n);
      if (n > 1) id += `#${n}`;
      el.dataset.rev = id;
      estado.bloques.set(id, { el, id, hoja, tituloHoja, tipo: tipoDe(el), titulo: tituloDe(el), orden: orden++ });
    });
  });

  let hover = null;
  doc.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest('[data-rev]');
    if (el === hover) return;
    if (hover) hover.classList.remove('rev-hover');
    hover = el;
    if (el) el.classList.add('rev-hover');
  });
  doc.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-rev]');
    if (!el) return;
    e.preventDefault();
    seleccionar(el.dataset.rev);
  });
  doc.addEventListener('keydown', e => { if (e.key === 'Escape') cancelar(); });
}

/* La hoja mide 33 cm (≈1247 px): se reduce para que quepa a lo ancho del visor. */
function ajustarZoom() {
  const doc = estado.doc;
  if (!doc) return;
  doc.documentElement.style.zoom = '';
  const pg = doc.querySelector('.page');
  const ancho = pg.offsetWidth + 60;
  const z = Math.min(1, (ui.marco.clientWidth - 8) / ancho);
  doc.documentElement.style.zoom = z.toFixed(3);
}
new ResizeObserver(() => ajustarZoom()).observe(ui.marco);

/* ---------- marcas y lista ---------- */
function pintarMarcas() {
  if (!estado.doc) return;
  estado.doc.querySelectorAll('.rev-con').forEach(el => { el.classList.remove('rev-con'); el.style.removeProperty('--rev-c'); });
  for (const c of Object.values(estado.datos.correcciones)) {
    const b = estado.bloques.get(c.bloque);
    if (!b) continue;
    b.el.classList.add('rev-con');
    b.el.style.setProperty('--rev-c', ACCIONES[c.accion].color);
  }
}

function ordenadas() {
  return Object.values(estado.datos.correcciones).sort((a, b) => {
    const A = estado.bloques.get(a.bloque), B = estado.bloques.get(b.bloque);
    return (A ? A.orden : 1e9 + a.hoja) - (B ? B.orden : 1e9 + b.hoja);
  });
}

function pintarLista() {
  const cs = ordenadas();
  ui.lista.replaceChildren();
  ui.listaVacia.hidden = cs.length > 0;
  for (const c of cs) {
    const b = estado.bloques.get(c.bloque);
    const li = document.createElement('li');
    const bt = document.createElement('button');
    bt.type = 'button';
    bt.style.setProperty('--c', ACCIONES[c.accion].color);
    const cab = document.createElement('span');
    cab.className = 'l-cab';
    const h = document.createElement('span');
    h.textContent = `Hoja ${c.hoja} · ${ACCIONES[c.accion].nombre}`;
    const idb = document.createElement('span');
    idb.textContent = c.bloque;
    cab.append(h, idb);
    const t = document.createElement('span');
    t.className = 'l-tit';
    t.textContent = recortar(sinDolares(c.titulo || c.tipo), 70);
    const x = document.createElement('span');
    x.className = 'l-txt' + (b ? '' : ' perdido');
    x.textContent = b ? (c.comentario || c.propuesto || c.moverRef || '—') : 'Este bloque ya no está en la guía';
    bt.append(cab, t, x);
    bt.addEventListener('click', () => { if (b) seleccionar(c.bloque, true); });
    li.append(bt);
    ui.lista.append(li);
  }
  pintarContador();
}

function pintarContador() {
  const n = Object.keys(estado.datos.correcciones).length;
  const pend = n > 0 && huella(estado.datos.correcciones) !== estado.datos.descargado;
  ui.contador.textContent = `${n} ${n === 1 ? 'corrección' : 'correcciones'}${pend ? ' · sin descargar' : ''}`;
  ui.contador.classList.toggle('pendiente', pend);
}

/* ---------- selección y formulario ---------- */
function seleccionar(id, desplazar = false) {
  if (estado.sucio && estado.sel && estado.sel.id !== id) {
    avisar('Tienes cambios sin guardar en este bloque: pulsa Guardar o Cancelar.');
    return;
  }
  const b = estado.bloques.get(id);
  if (!b) return;
  if (estado.sel) estado.sel.el.classList.remove('rev-sel');
  estado.sel = b;
  b.el.classList.add('rev-sel');
  if (desplazar) b.el.scrollIntoView({ block: 'center', behavior: 'smooth' });

  ui.bHoja.textContent = `Hoja ${b.hoja} · ${sinDolares(b.tituloHoja)}`;
  ui.bTitulo.textContent = sinDolares(b.titulo || b.tipo);
  ui.bTipo.textContent = b.tipo;
  ui.bId.textContent = b.id;
  ui.bTexto.textContent = aLatex(b.el);
  const padre = b.el.parentElement.closest('[data-rev]');
  ui.padre.hidden = !padre;
  ui.padre.dataset.id = padre ? padre.dataset.rev : '';

  const c = estado.datos.correcciones[id];
  ui.edicion.accion.value = c ? c.accion : 'comentar';
  ui.comentario.value = c ? c.comentario : '';
  ui.propuesto.value = c ? c.propuesto : '';
  ui.moverDonde.value = c && c.moverDonde ? c.moverDonde : 'antes';
  ui.moverRef.value = c ? c.moverRef : '';
  ui.borrar.hidden = !c;
  ui.aviso.hidden = true;
  estado.sucio = false;
  ajustarAccion();
  ui.inicio.hidden = true;
  ui.edicion.hidden = false;
  ui.edicion.scrollTop = 0;
  ui.comentario.focus({ preventScroll: true });
  if (matchMedia('(max-width: 900px)').matches) $('panel').scrollIntoView({ behavior: 'smooth' });
}

function ajustarAccion() {
  const a = ui.edicion.accion.value;
  ui.grupoMover.hidden = a !== 'mover';
  ui.grupoProp.hidden = a !== 'proponer';
  ui.lblComentario.textContent = a === 'comentar' ? 'Comentario' : 'Comentario (opcional)';
}

function avisar(msg) {
  ui.aviso.textContent = msg;
  ui.aviso.hidden = false;
}

function mostrarInicio() {
  if (estado.sel) estado.sel.el.classList.remove('rev-sel');
  estado.sel = null;
  estado.sucio = false;
  ui.edicion.hidden = true;
  ui.inicio.hidden = false;
}

function cancelar() {
  estado.sucio = false;
  mostrarInicio();
}

ui.edicion.addEventListener('input', () => { estado.sucio = true; ui.aviso.hidden = true; });
ui.edicion.addEventListener('change', e => { if (e.target.name === 'accion') ajustarAccion(); });
ui.edicion.addEventListener('keydown', e => {
  if (e.key === 'Escape') cancelar();
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ui.edicion.requestSubmit(); }
});
ui.edicion.addEventListener('submit', e => {
  e.preventDefault();
  const b = estado.sel;
  if (!b) return;
  const accion = ui.edicion.accion.value;
  const comentario = ui.comentario.value.trim();
  const propuesto = accion === 'proponer' ? ui.propuesto.value.trim() : '';
  const moverRef = accion === 'mover' ? ui.moverRef.value.trim() : '';
  if (accion === 'comentar' && !comentario) return avisar('Escribe el comentario.');
  if (accion === 'proponer' && !propuesto) return avisar('Escribe el texto propuesto.');
  if (accion === 'mover' && !moverRef) return avisar('Indica a dónde se mueve el bloque.');
  estado.datos.correcciones[b.id] = {
    bloque: b.id, hoja: b.hoja, tituloHoja: b.tituloHoja, tipo: b.tipo, titulo: b.titulo,
    accion, comentario, propuesto, moverDonde: accion === 'mover' ? ui.moverDonde.value : '', moverRef,
    textoActual: recortar(aLatex(b.el), 400), fecha: ahora(),
  };
  guardarDatos();
  pintarMarcas();
  pintarLista();
  mostrarInicio();
  toast(`Guardado: hoja ${b.hoja} · ${ACCIONES[accion].nombre}.`);
});
ui.cancelar.addEventListener('click', cancelar);
ui.volver.addEventListener('click', cancelar);
ui.borrar.addEventListener('click', () => {
  const b = estado.sel;
  if (!b) return;
  delete estado.datos.correcciones[b.id];
  guardarDatos();
  pintarMarcas();
  pintarLista();
  mostrarInicio();
  toast('Corrección quitada.');
});
ui.padre.addEventListener('click', () => {
  estado.sucio = false;
  seleccionar(ui.padre.dataset.id, true);
});
ui.copiarActual.addEventListener('click', () => {
  ui.propuesto.value = aLatex(estado.sel.el);
  estado.sucio = true;
  ui.propuesto.focus();
});

/* ---------- barra ---------- */
ui.guia.addEventListener('change', () => {
  if (estado.sucio) {
    ui.guia.value = estado.guia.id;
    avisar('Tienes cambios sin guardar en este bloque: pulsa Guardar o Cancelar antes de cambiar de guía.');
    return;
  }
  abrirGuia(ui.guia.value);
});
ui.revisor.addEventListener('input', () => almacen.escribir('revisor', ui.revisor.value.trim()));

/* ---------- .md ---------- */
function bloqueTexto(s) {   // cerca de código que no choque con el contenido
  let cerca = '```';
  while (s.includes(cerca)) cerca += '`';
  return `${cerca}text\n${s}\n${cerca}`;
}

function generarMd() {
  const g = estado.guia, cs = ordenadas();
  const revisor = ui.revisor.value.trim();
  const cuenta = {};
  cs.forEach(c => { cuenta[c.accion] = (cuenta[c.accion] || 0) + 1; });
  const resumen = Object.keys(ACCIONES).filter(a => cuenta[a]).map(a => `${cuenta[a]} ${ACCIONES[a].nombre.toLowerCase()}`).join(', ');
  const L = [
    `# Correcciones · ${g.nombre}`, '',
    `- **Revisor:** ${revisor}`,
    `- **Fecha:** ${ahora()}`,
    `- **Versión de la guía:** ${g.version}`,
    `- **Correcciones:** ${cs.length} (${resumen})`, '',
  ];
  let hoja = null;
  for (const c of cs) {
    if (c.hoja !== hoja) {
      hoja = c.hoja;
      L.push('---', '', `## Hoja ${c.hoja} · ${c.tituloHoja}`, '');
    }
    let tit = `### [${c.bloque}] ${c.tipo}${c.titulo && c.titulo !== c.tituloHoja ? ' · ' + c.titulo : ''} — ${ACCIONES[c.accion].nombre}`;
    if (c.accion === 'mover') tit += ` ${c.moverDonde === 'despues' ? 'después de' : 'antes de'}: ${c.moverRef}`;
    L.push(tit, '');
    if (c.comentario) L.push(`**Comentario:** ${c.comentario.replace(/\n/g, '  \n')}`, '');
    if (c.propuesto) L.push('**Texto propuesto:**', '', bloqueTexto(c.propuesto), '');
    L.push('<details><summary>Texto actual del bloque</summary>', '', bloqueTexto(c.textoActual), '', '</details>', '');
  }
  const datos = { formato: FORMATO, guia: g.id, version: g.version, revisor, fecha: ahora(), correcciones: cs };
  L.push('<!-- editor-guias:datos (no editar: sirve para «Cargar .md»)',
         JSON.stringify(datos).replace(/-->/g, '--\\u003e'), '-->', '');
  return L.join('\n');
}

ui.descargar.addEventListener('click', () => {
  if (!estado.guia) return;
  const n = Object.keys(estado.datos.correcciones).length;
  if (!n) { toast('Todavía no hay correcciones en esta guía.', true); return; }
  if (!ui.revisor.value.trim()) { toast('Escribe tu nombre en «Revisor» antes de descargar.', true); ui.revisor.focus(); return; }
  const blob = new Blob([generarMd()], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `correcciones_${estado.guia.id}_${slug(ui.revisor.value) || 'revisor'}_${ahora().slice(0, 10)}.md`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  estado.datos.descargado = huella(estado.datos.correcciones);
  guardarDatos();
  pintarContador();
  toast(`Descargado: ${a.download}`);
});

ui.cargar.addEventListener('click', () => ui.archivo.click());
ui.archivo.addEventListener('change', async () => {
  const f = ui.archivo.files[0];
  ui.archivo.value = '';
  if (!f) return;
  let datos;
  try {
    const m = (await f.text()).match(/<!-- editor-guias:datos[^\n]*\n([\s\S]*?)\n-->/);
    datos = JSON.parse(m[1]);
    if (datos.formato !== FORMATO || !Array.isArray(datos.correcciones)) throw new Error();
  } catch {
    toast('Ese archivo no es un .md descargado de este editor.', true);
    return;
  }
  const g = estado.guias.find(x => x.id === datos.guia);
  if (!g) { toast(`El archivo es de una guía que ya no está («${datos.guia}»).`, true); return; }
  if (estado.sucio) { avisar('Guarda o cancela el bloque abierto antes de cargar un archivo.'); return; }
  const previo = almacen.leer('guia.' + g.id) || { correcciones: {}, descargado: null };
  const habia = Object.keys(previo.correcciones).length;
  let reemplazadas = 0;
  for (const c of datos.correcciones) {
    if (!c || typeof c.bloque !== 'string' || !ACCIONES[c.accion]) continue;
    if (previo.correcciones[c.bloque]) reemplazadas++;
    previo.correcciones[c.bloque] = {
      bloque: c.bloque, hoja: Number(c.hoja) || 0, tituloHoja: String(c.tituloHoja || ''), tipo: String(c.tipo || ''),
      titulo: String(c.titulo || ''), accion: c.accion, comentario: String(c.comentario || ''),
      propuesto: String(c.propuesto || ''), moverDonde: c.moverDonde === 'despues' ? 'despues' : (c.accion === 'mover' ? 'antes' : ''),
      moverRef: String(c.moverRef || ''), textoActual: String(c.textoActual || ''), fecha: String(c.fecha || ''),
    };
  }
  if (!habia) previo.descargado = huella(previo.correcciones);
  almacen.escribir('guia.' + g.id, previo);
  if (!ui.revisor.value.trim() && datos.revisor) { ui.revisor.value = datos.revisor; almacen.escribir('revisor', datos.revisor); }
  if (estado.guia.id !== g.id) abrirGuia(g.id);
  else { estado.datos = previo; pintarMarcas(); pintarLista(); }
  let msg = `Se cargaron ${datos.correcciones.length} correcciones de ${g.nombre}`;
  if (reemplazadas) msg += ` (${reemplazadas} reemplazaron a las que ya había)`;
  if (datos.version !== g.version) msg += '. Ojo: el archivo es de otra versión de la guía; revisa que los bloques sigan iguales';
  toast(msg + '.', datos.version !== g.version);
});

/* Aviso al cerrar si hay correcciones sin descargar en alguna guía. */
window.addEventListener('beforeunload', e => {
  const pendiente = estado.guias.some(g => {
    const d = g.id === estado.guia?.id ? estado.datos : almacen.leer('guia.' + g.id);
    return d && Object.keys(d.correcciones).length && huella(d.correcciones) !== d.descargado;
  });
  if (pendiente || estado.sucio) { e.preventDefault(); e.returnValue = ''; }
});

iniciar();
