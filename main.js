// ══════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════
const CONFIG = {
    clientId:      '490204576711-mjpqqt3pjsh5nf9udo4272719eedhjvb.apps.googleusercontent.com',
    apiKey:        'AIzaSyDDg3DGAtuEqaDusmJxlmjmLfy40og0ccQ',
    spreadsheetId: '1JAFWVUenNEDssEPo9mb4Ni4YzKcZlAAf4dxEDDNSnA8',
};

const SCOPES        = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const CODIGO_PROF   = 'PR0F3SOR';
const POLL_INTERVAL = 10000;
const BASE_URL      = 'https://agrupador-de-alumnos.vercel.app/';

// ── Estado ────────────────────────────────────────────────────────
let tokenClient    = null;
let accessToken    = null;
let usuarioActual  = null;
let alumnos        = [];
let tamañoGrupo    = 30;
let maxVotos       = 1;
let modoProfesor   = false;
let codigoClase    = null;
let pollTimer      = null;
let profLoginDone  = false;   // profesor completó el login Google
let profValidado   = false;   // profesor pasó el código PR0F3SOR
let tokenClientProf = null;   // token client separado para el profesor

// ══════════════════════════════════════════════════════════════════
//  HELPERS DE NOMBRE DE HOJA (por clase)
// ══════════════════════════════════════════════════════════════════
function sheetConfig() { return `Config_${codigoClase}`; }
function sheetVotos()  { return `Votos_${codigoClase}`;  }

// ══════════════════════════════════════════════════════════════════
//  INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
    const pathCode = leerCodigoDeURL();
    if (pathCode) codigoClase = pathCode;

    gapi.load('client', async () => {
        await gapi.client.init({
            apiKey:        CONFIG.apiKey,
            discoveryDocs: [DISCOVERY_DOC],
        });
    });

    // Token client para ALUMNOS
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope:     SCOPES,
        callback:  async (resp) => {
            if (resp.error) { mostrarLoginError('Error de autenticación: ' + resp.error); return; }
            accessToken = resp.access_token;
            gapi.client.setToken({ access_token: accessToken });
            await cargarPerfilUsuario();
        },
    });

    // Token client para PROFESOR
    tokenClientProf = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope:     SCOPES,
        callback:  async (resp) => {
            if (resp.error) {
                const el = document.getElementById('loginErrorProf');
                el.textContent = 'Error al iniciar sesión: ' + resp.error;
                el.style.display = 'block';
                return;
            }
            accessToken  = resp.access_token;
            profLoginDone = true;
            gapi.client.setToken({ access_token: accessToken });
            // Pasar al siguiente paso: código PR0F3SOR
            document.getElementById('pasoLoginProf').style.display  = 'none';
            document.getElementById('pasoCodigoProf').style.display = '';
            setTimeout(() => document.getElementById('inputCodigoProf').focus(), 100);
        },
    });

    // Preview URL en pantalla profesor
    setTimeout(() => {
        const inputClase = document.getElementById('inputCodigoClase');
        if (inputClase) {
            inputClase.addEventListener('input', () => {
                const v = inputClase.value || 'CODIGO';
                document.getElementById('urlPreview').textContent = BASE_URL + v;
            });
        }
    }, 200);
});

function leerCodigoDeURL() {
    const path = window.location.pathname.replace(/^\//, '').trim();
    if (path && /^[A-Z0-9\-]+$/i.test(path)) return path.toUpperCase();
    const params = new URLSearchParams(window.location.search);
    const q = params.get('clase');
    if (q && /^[A-Z0-9\-]+$/i.test(q)) return q.toUpperCase();
    return null;
}

// ══════════════════════════════════════════════════════════════════
//  FLUJO PROFESOR
// ══════════════════════════════════════════════════════════════════
function mostrarPantallaProfesor() {
    profLoginDone = false;
    profValidado  = false;
    // Resetear pasos
    document.getElementById('pasoLoginProf').style.display  = '';
    document.getElementById('pasoCodigoProf').style.display = 'none';
    document.getElementById('pasoCodigoClase').style.display = 'none';
    document.getElementById('loginErrorProf').style.display = 'none';
    mostrarPantalla('pantallaProfesor');
}

function iniciarSesionProfesor() {
    const el = document.getElementById('loginErrorProf');
    el.style.display = 'none';
    tokenClientProf.requestAccessToken({ prompt: 'consent' });
}

function volverAlLogin() {
    profLoginDone = false;
    profValidado  = false;
    document.getElementById('pasoLoginProf').style.display   = '';
    document.getElementById('pasoCodigoProf').style.display  = 'none';
    document.getElementById('pasoCodigoClase').style.display = 'none';
    if (document.getElementById('inputCodigoProf'))
        document.getElementById('inputCodigoProf').value = '';
    mostrarPantalla('pantallaLogin');
}

function validarCodigoProf() {
    const input = document.getElementById('inputCodigoProf');
    const error = document.getElementById('errorCodigoProf');
    if (input.value === CODIGO_PROF) {
        profValidado = true;
        input.value  = '';
        error.style.display = 'none';
        document.getElementById('pasoCodigoProf').style.display  = 'none';
        document.getElementById('pasoCodigoClase').style.display = '';
        setTimeout(() => document.getElementById('inputCodigoClase').focus(), 100);
    } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
        setTimeout(() => { error.style.display = 'none'; }, 2000);
    }
}

async function validarCodigoClase() {
    const input  = document.getElementById('inputCodigoClase');
    const error  = document.getElementById('errorCodigoClase');
    const codigo = input.value.trim().toUpperCase();
    if (!codigo || !/^[A-Z0-9\-]+$/.test(codigo)) {
        error.style.display = 'block';
        setTimeout(() => { error.style.display = 'none'; }, 2500);
        return;
    }
    codigoClase  = codigo;
    modoProfesor = true;
    input.value  = '';
    await abrirPanelProfesor();
}

async function abrirPanelProfesor() {
    mostrarPantalla('pantallaProfesorActivo');
    document.getElementById('claseBadgeProf').textContent = '🏫 Clase: ' + codigoClase;
    document.getElementById('enlaceClaseUrl').textContent = BASE_URL + codigoClase;
    document.getElementById('tamañoValor').textContent    = tamañoGrupo;
    document.getElementById('maxVotosValor').textContent  = maxVotos;

    await cargarConfigDesdeSheets();
    await actualizarVotosProfesor();
    arrancarPoll();
}

function cerrarPanelProfesor() {
    modoProfesor  = false;
    profValidado  = false;
    profLoginDone = false;
    codigoClase   = leerCodigoDeURL();
    detenerPoll();
    document.getElementById('pasoLoginProf').style.display   = '';
    document.getElementById('pasoCodigoProf').style.display  = 'none';
    document.getElementById('pasoCodigoClase').style.display = 'none';
    if (document.getElementById('inputCodigoClase'))
        document.getElementById('inputCodigoClase').value = '';
    mostrarPantalla('pantallaLogin');
}

function copiarEnlaceClase() {
    const url = BASE_URL + codigoClase;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.btn-copiar-enlace');
        const orig = btn.textContent;
        btn.textContent = '✅ ¡Copiado!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
    }).catch(() => { prompt('Copia este enlace:', url); });
}

// ══════════════════════════════════════════════════════════════════
//  AUTH ALUMNO
// ══════════════════════════════════════════════════════════════════
function iniciarSesion() {
    mostrarLoginError('');
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function cerrarSesion() {
    detenerPoll();
    if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null; usuarioActual = null; modoProfesor = false;
    alumnos = []; tamañoGrupo = 30; maxVotos = 1;
    codigoClase = leerCodigoDeURL();
    mostrarPantalla('pantallaLogin');
}

async function cargarPerfilUsuario() {
    try {
        const res    = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: 'Bearer ' + accessToken }
        });
        const perfil = await res.json();
        usuarioActual = {
            nombre: perfil.name || perfil.email,
            email:  perfil.email,
            foto:   perfil.picture || '',
        };

        document.getElementById('userName').textContent  = usuarioActual.nombre;
        document.getElementById('userEmail').textContent = usuarioActual.email;

        const avatarImg      = document.getElementById('userAvatar');
        const avatarFallback = document.getElementById('userAvatarFallback');
        if (usuarioActual.foto) {
            avatarImg.src = usuarioActual.foto;
            avatarImg.style.display      = '';
            avatarFallback.style.display = 'none';
        } else {
            avatarImg.style.display      = 'none';
            avatarFallback.style.display = '';
            avatarFallback.textContent   = usuarioActual.nombre[0].toUpperCase();
        }

        if (codigoClase) {
            await entrarEnClaseComoAlumno();
        } else {
            mostrarPantalla('pantallaCodigoClase');
            setTimeout(() => document.getElementById('inputCodigoAlumno').focus(), 100);
        }
    } catch (err) {
        mostrarLoginError('No se pudo obtener el perfil: ' + err.message);
    }
}

async function unirseAClase() {
    const input  = document.getElementById('inputCodigoAlumno');
    const error  = document.getElementById('errorCodigoAlumno');
    const codigo = input.value.trim().toUpperCase();
    if (!codigo || !/^[A-Z0-9\-]+$/.test(codigo)) {
        error.style.display = 'block';
        setTimeout(() => { error.style.display = 'none'; }, 2500);
        return;
    }
    codigoClase = codigo;
    await entrarEnClaseComoAlumno();
}

async function entrarEnClaseComoAlumno() {
    document.getElementById('claseBadge').textContent = '🏫 ' + codigoClase;
    mostrarPantalla('pantallaApp');
    await cargarConfigDesdeSheets();
}

function mostrarLoginError(msg) {
    const el = document.getElementById('loginError');
    el.textContent   = msg;
    el.style.display = msg ? 'block' : 'none';
}

// ══════════════════════════════════════════════════════════════════
//  CAMBIO DE PANTALLA
// ══════════════════════════════════════════════════════════════════
function mostrarPantalla(id) {
    ['pantallaLogin','pantallaProfesor','pantallaCodigoClase','pantallaApp','pantallaProfesorActivo']
        .forEach(p => {
            const el = document.getElementById(p);
            if (el) el.style.display = (p === id) ? '' : 'none';
        });
}

// ══════════════════════════════════════════════════════════════════
//  POLLING
// ══════════════════════════════════════════════════════════════════
function arrancarPoll() {
    detenerPoll();
    pollTimer = setInterval(actualizarVotosProfesor, POLL_INTERVAL);
}

function detenerPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function actualizarVotosProfesor() {
    if (!modoProfesor || !codigoClase) return;
    try {
        const votos    = await leerVotos();
        const nVotos   = Object.keys(votos).length;
        const nAlumnos = alumnos.length;

        document.getElementById('votosNum').textContent  = nVotos;
        document.getElementById('votosDe').textContent   = `/ ${nAlumnos} alumnos`;

        const pct = nAlumnos > 0 ? Math.round((nVotos / nAlumnos) * 100) : 0;
        document.getElementById('votosBarra').style.width = pct + '%';

        document.getElementById('votosLista').innerHTML = Object.entries(votos).map(([nombre, v]) => {
            const prefs = Array.isArray(v.preferencias) ? v.preferencias.filter(Boolean) : (v.preferencia ? [v.preferencia] : []);
            const prefStr = prefs.length ? prefs.join(', ') : 'sin pref.';
            return `<span class="voto-chip">${nombre} → ${prefStr}</span>`;
        }).join('');
    } catch { /* silencioso */ }
}

// ══════════════════════════════════════════════════════════════════
//  CONTROLES PROFESOR
// ══════════════════════════════════════════════════════════════════
function cambiarTamaño(delta) {
    tamañoGrupo = Math.max(2, Math.min(100, tamañoGrupo + delta));
    document.getElementById('tamañoValor').textContent = tamañoGrupo;
    const el = document.getElementById('tamañoGrupoInfo');
    if (el) el.textContent = tamañoGrupo;
}

function cambiarMaxVotos(delta) {
    maxVotos = Math.max(1, Math.min(10, maxVotos + delta));
    document.getElementById('maxVotosValor').textContent = maxVotos;
    const el = document.getElementById('maxVotosInfo');
    if (el) el.textContent = maxVotos;
    // Regenerar selects del alumno si está en la pantalla de alumno
    renderizarSelectsAlumno();
}

// ══════════════════════════════════════════════════════════════════
//  GOOGLE SHEETS — Config por clase
//  Estructura:
//    __TAMAÑO__     | valor
//    __MAX_VOTOS__  | valor
//    nombre alumno  |
//    …
//    __GRUPO_X__    | alumno1,alumno2,…
// ══════════════════════════════════════════════════════════════════
async function cargarConfigDesdeSheets() {
    if (!codigoClase) return;
    try {
        const res   = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${sheetConfig()}!A1:B`,
        });
        const filas = res.result.values || [];

        let nuevoTamaño   = 30;
        let nuevoMaxVotos = 1;
        let nuevosAlumnos = [];

        filas.forEach(fila => {
            if (!fila[0]) return;
            const clave = fila[0].trim();
            if      (clave === '__TAMAÑO__')    { nuevoTamaño   = parseInt(fila[1]) || 30; }
            else if (clave === '__MAX_VOTOS__') { nuevoMaxVotos = parseInt(fila[1]) || 1;  }
            else if (!clave.startsWith('__'))   { nuevosAlumnos.push(clave); }
        });

        tamañoGrupo = nuevoTamaño;
        maxVotos    = nuevoMaxVotos;
        alumnos     = nuevosAlumnos;

        const infoEl    = document.getElementById('tamañoGrupoInfo');
        const valorEl   = document.getElementById('tamañoValor');
        const mvInfoEl  = document.getElementById('maxVotosInfo');
        const mvValorEl = document.getElementById('maxVotosValor');
        if (infoEl)    infoEl.textContent    = tamañoGrupo;
        if (valorEl)   valorEl.textContent   = tamañoGrupo;
        if (mvInfoEl)  mvInfoEl.textContent  = maxVotos;
        if (mvValorEl) mvValorEl.textContent = maxVotos;

        actualizarListaActiva();
        renderizarSelectsAlumno();
        actualizarListaPublicadaProf();

    } catch (err) {
        console.warn('Config no encontrada (clase nueva):', err.message);
        renderizarSelectsAlumno();
    }
}

async function guardarConfigEnSheets(grupos) {
    if (!codigoClase) throw new Error('No hay clase activa');
    if (!accessToken) throw new Error('No hay sesión de Google activa. El profesor debe iniciar sesión.');

    const valores = [
        ['__TAMAÑO__',    tamañoGrupo],
        ['__MAX_VOTOS__', maxVotos],
        ...alumnos.map(n => [n]),
    ];
    if (grupos && grupos.length > 0) {
        grupos.forEach((g, i) => valores.push([`__GRUPO_${i + 1}__`, g.join(',')]));
    }

    // Crear hoja si no existe
    await asegurarHoja(sheetConfig());

    const resClear = await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: CONFIG.spreadsheetId,
        range:         `${sheetConfig()}!A:B`,
    });
    if (resClear.status !== 200)
        throw new Error(`Error al limpiar Config (${resClear.status})`);

    const resUpdate = await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId:    CONFIG.spreadsheetId,
        range:            `${sheetConfig()}!A1`,
        valueInputOption: 'RAW',
        resource:         { values: valores },
    });
    if (resUpdate.status !== 200)
        throw new Error(`Error al escribir en Config (${resUpdate.status})`);
}

async function asegurarHoja(nombre) {
    try {
        await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${nombre}!A1`,
        });
    } catch (err) {
        if (err.status === 400 || err.status === 404) {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: CONFIG.spreadsheetId,
                resource: { requests: [{ addSheet: { properties: { title: nombre } } }] }
            });
        }
    }
}

// ══════════════════════════════════════════════════════════════════
//  GOOGLE SHEETS — Votos
//  Columnas: A=email, B=nombre, C=pref1, D=pref2, …, última=timestamp
// ══════════════════════════════════════════════════════════════════
async function leerVotos() {
    if (!codigoClase) return {};
    try {
        const res   = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${sheetVotos()}!A2:Z`,
        });
        const filas = res.result.values || [];
        const votos = {};
        filas.forEach(fila => {
            const email  = fila[0];
            const nombre = fila[1];
            if (!nombre) return;
            // Columnas C en adelante: preferencias + timestamp al final
            const resto = fila.slice(2);
            const tsIdx = resto.findLastIndex(v => v && v.includes('T') && v.includes('-'));
            const prefs = (tsIdx >= 0 ? resto.slice(0, tsIdx) : resto).filter(Boolean);
            votos[nombre] = { email, preferencias: prefs, preferencia: prefs[0] || null };
        });
        return votos;
    } catch (err) {
        if (err.status === 400 || err.status === 404) return {};
        throw new Error('Error leyendo votos: ' + (err.result?.error?.message || err.message));
    }
}

async function escribirVoto(nombre, email, preferencias) {
    if (!codigoClase) throw new Error('No hay clase activa');
    if (!accessToken) throw new Error('No hay sesión activa');

    const prefsLimpias = preferencias.filter(Boolean);
    await asegurarHoja(sheetVotos());

    let filaExistente = null;
    try {
        const res   = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${sheetVotos()}!A2:B`,
        });
        const filas = res.result.values || [];
        filas.forEach((fila, i) => {
            if (fila[1] === nombre || fila[0] === email) filaExistente = i + 2;
        });
    } catch { /* vacía */ }

    const fila = [email, nombre, ...prefsLimpias, new Date().toISOString()];

    if (filaExistente) {
        // Limpiar fila antigua primero (puede tener más columnas)
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${sheetVotos()}!A${filaExistente}:Z${filaExistente}`,
        });
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId:    CONFIG.spreadsheetId,
            range:            `${sheetVotos()}!A${filaExistente}`,
            valueInputOption: 'RAW',
            resource:         { values: [fila] },
        });
    } else {
        await asegurarCabeceraVotos();
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId:    CONFIG.spreadsheetId,
            range:            `${sheetVotos()}!A:A`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource:         { values: [fila] },
        });
    }
}

async function asegurarCabeceraVotos() {
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${sheetVotos()}!A1:B1`,
        });
        if (!res.result.values?.[0]) {
            const cab = ['Email','Nombre',...Array.from({length:10},(_,i)=>`Preferencia ${i+1}`),'Timestamp'];
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId:    CONFIG.spreadsheetId,
                range:            `${sheetVotos()}!A1`,
                valueInputOption: 'RAW',
                resource:         { values: [cab] },
            });
        }
    } catch { /* ignorar */ }
}

async function resetearVotos() {
    if (!confirm('¿Seguro que quieres borrar todos los votos? Esta acción no se puede deshacer.')) return;
    try {
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: CONFIG.spreadsheetId,
            range:         `${sheetVotos()}!A2:Z`,
        });
        document.getElementById('seccionGrupos').style.display    = 'none';
        document.getElementById('resultadoProfesor').innerHTML    = '';
        document.getElementById('profesorStatus').style.display   = 'none';
        await actualizarVotosProfesor();
        alert('✅ Votos borrados correctamente.');
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        alert('❌ Error al borrar votos: ' + msg);
    }
}

// ══════════════════════════════════════════════════════════════════
//  SELECTS DINÁMICOS ALUMNO (según maxVotos)
// ══════════════════════════════════════════════════════════════════
function renderizarSelectsAlumno() {
    const contenedor = document.getElementById('selectsPreferencias');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    for (let i = 0; i < maxVotos; i++) {
        const wrap = document.createElement('div');
        wrap.className = 'form-group';

        const label = document.createElement('label');
        label.setAttribute('for', `pref_${i}`);
        label.textContent = maxVotos === 1
            ? '¿Con quién quieres ir? (opcional)'
            : `${i + 1}ª preferencia${i === 0 ? ' (principal)' : ' (opcional)'}`;

        const select = document.createElement('select');
        select.id = `pref_${i}`;
        select.innerHTML = '<option value="">-- Sin preferencia --</option>';
        alumnos.forEach(a => {
            if (a !== (usuarioActual?.nombre ?? '')) {
                const o = document.createElement('option');
                o.value = o.textContent = a;
                select.appendChild(o);
            }
        });
        select.addEventListener('change', evitarDuplicadosEnSelects);

        wrap.appendChild(label);
        wrap.appendChild(select);
        contenedor.appendChild(wrap);
    }
}

function evitarDuplicadosEnSelects() {
    const selects  = Array.from(document.querySelectorAll('[id^="pref_"]'));
    const elegidos = selects.map(s => s.value).filter(Boolean);
    selects.forEach(sel => {
        const actual = sel.value;
        Array.from(sel.options).forEach(opt => {
            if (opt.value && opt.value !== actual && elegidos.includes(opt.value)) {
                opt.disabled = true;
            } else {
                opt.disabled = false;
            }
        });
    });
}

// ══════════════════════════════════════════════════════════════════
//  LISTAS UI
// ══════════════════════════════════════════════════════════════════
function actualizarListaActiva() {
    const div = document.getElementById('listaActiva');
    if (!div) return;
    div.innerHTML = alumnos.length
        ? alumnos.map(n => `<span class="chip-activo">${n}</span>`).join('')
        : '<span class="chip-inactive">El profesor aún no ha cargado la lista</span>';
    const infoEl   = document.getElementById('tamañoGrupoInfo');
    const mvInfoEl = document.getElementById('maxVotosInfo');
    if (infoEl)   infoEl.textContent   = tamañoGrupo;
    if (mvInfoEl) mvInfoEl.textContent = maxVotos;
}

function actualizarListaPublicadaProf() {
    const box = document.getElementById('listaPublicadaProf');
    if (!box) return;
    if (alumnos.length) {
        box.style.display = '';
        document.getElementById('countAlumnosPublicados').textContent = alumnos.length;
        document.getElementById('alumnosPublicados').innerHTML =
            alumnos.map(n => `<span class="chip-activo" style="font-size:12px;padding:4px 10px">${n}</span>`).join('');
    } else {
        box.style.display = 'none';
    }
}

// ══════════════════════════════════════════════════════════════════
//  CARGA DE DOCUMENTO (solo profesor)
// ══════════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
    setTimeout(() => {
        const uploadArea = document.getElementById('uploadArea');
        if (!uploadArea) return;
        uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
        uploadArea.addEventListener('drop', e => {
            e.preventDefault(); uploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) procesarArchivo(e.dataTransfer.files[0]);
        });
    }, 500);
});

function cargarArchivo(e) {
    if (e.target.files[0]) procesarArchivo(e.target.files[0]);
}

async function procesarArchivo(file) {
    const status  = document.getElementById('uploadStatus');
    const preview = document.getElementById('listaPreview');
    preview.style.display = 'none';
    status.style.display  = 'block';
    status.className      = 'upload-status loading';

    try {
        const ext = file.name.split('.').pop().toLowerCase();
        let nombres = [];

        if (ext === 'txt') {
            status.innerHTML = '⏳ Leyendo archivo…';
            nombres = await extraerDesdeTxt(file);
        } else if (['pdf','docx','jpg','jpeg','png','webp'].includes(ext)) {
            status.innerHTML = '⏳ Analizando documento con IA…';
            nombres = await extraerConClaude(file, ext);
        } else {
            throw new Error('Formato no soportado. Usa PDF, TXT, DOCX o imagen.');
        }

        if (!nombres.length) throw new Error('No se encontraron nombres en el documento.');
        nombres.sort((a, b) => a.localeCompare(b, 'es'));
        mostrarPreview(nombres);
        status.className = 'upload-status success';
        status.innerHTML = `✅ ${nombres.length} alumnos encontrados en "${file.name}"`;
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        status.className = 'upload-status error';
        status.innerHTML = `❌ ${msg}`;
    }
}

function extraerDesdeTxt(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = e => resolve(e.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 1));
        r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        r.readAsText(file);
    });
}

async function extraerConClaude(file, ext) {
    const base64 = await fileToBase64(file);
    const isImg  = ['jpg','jpeg','png','webp'].includes(ext);
    const mime   = isImg
        ? (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`)
        : (ext === 'pdf' ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const contentBlock = isImg
        ? { type: 'image',    source: { type: 'base64', media_type: mime, data: base64 } }
        : { type: 'document', source: { type: 'base64', media_type: mime, data: base64 } };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model:      'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system: `Eres un extractor de nombres de personas.
Devuelve ÚNICAMENTE un array JSON de nombres completos, sin texto adicional ni backticks.
Ejemplo: ["Ana García","Pedro López"]
Si no hay nombres: []`,
            messages: [{ role: 'user', content: [
                contentBlock,
                { type: 'text', text: 'Extrae todos los nombres de personas de este documento.' }
            ]}],
        })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'Error con la IA.'); }
    const data  = await res.json();
    const texto = data.content.map(b => b.text || '').join('').trim();
    try {
        const parsed = JSON.parse(texto);
        if (!Array.isArray(parsed)) throw 0;
        return parsed.filter(n => typeof n === 'string' && n.trim());
    } catch { throw new Error('La IA no devolvió una lista válida.'); }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = e => resolve(e.target.result.split(',')[1]);
        r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        r.readAsDataURL(file);
    });
}

function mostrarPreview(nombres) {
    document.getElementById('countAlumnos').textContent = nombres.length;
    document.getElementById('alumnosDetectados').innerHTML =
        nombres.map(n => `<span class="chip-preview">${n}</span>`).join('');
    document.getElementById('editarAlumnos').value = nombres.join('\n');
    document.getElementById('listaPreview').style.display = 'block';
}

async function usarAlumnos() {
    const nuevos = document.getElementById('editarAlumnos').value
        .split('\n').map(l => l.trim()).filter(l => l.length > 1);
    nuevos.sort((a, b) => a.localeCompare(b, 'es'));
    alumnos = nuevos;

    const status = document.getElementById('uploadStatus');
    status.style.display = 'block';
    status.className     = 'upload-status loading';
    status.innerHTML     = '⏳ Guardando en Google Sheets…';

    try {
        await guardarConfigEnSheets(null);
        actualizarListaPublicadaProf();
        document.getElementById('listaPreview').style.display = 'none';
        status.className = 'upload-status success';
        status.innerHTML = `✅ Lista publicada: <strong>${alumnos.length}</strong> alumnos · Grupos de <strong>${tamañoGrupo}</strong> · <strong>${maxVotos}</strong> voto(s).`;
        await actualizarVotosProfesor();
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        status.className = 'upload-status error';
        status.innerHTML = `❌ Error guardando: ${msg}`;
    }
}

// ══════════════════════════════════════════════════════════════════
//  ALUMNO: ENVIAR PREFERENCIAS
// ══════════════════════════════════════════════════════════════════
async function enviarPreferencia() {
    if (!usuarioActual)  { alert('Inicia sesión primero.'); return; }
    if (!alumnos.length) { alert('El profesor aún no ha publicado la lista.'); return; }

    const selects      = Array.from(document.querySelectorAll('[id^="pref_"]'));
    const preferencias = selects.map(s => s.value.trim()).filter(Boolean);

    const st = document.getElementById('alumnoStatus');
    st.style.display = 'block';
    st.className     = 'upload-status loading';
    st.innerHTML     = '⏳ Enviando preferencias…';

    try {
        await escribirVoto(usuarioActual.nombre, usuarioActual.email, preferencias);
        st.className = 'upload-status success';
        st.innerHTML = preferencias.length
            ? `✅ Preferencias enviadas: <strong>${preferencias.join(', ')}</strong>.`
            : '✅ Enviado sin preferencia.';
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        st.className = 'upload-status error';
        st.innerHTML = `❌ ${msg}`;
    }
}

function resetearAlumno() {
    document.querySelectorAll('[id^="pref_"]').forEach(s => { s.value = ''; });
    evitarDuplicadosEnSelects();
    document.getElementById('alumnoStatus').style.display = 'none';
}

// ══════════════════════════════════════════════════════════════════
//  PROFESOR: GENERAR GRUPOS
// ══════════════════════════════════════════════════════════════════
async function generarGrupos() {
    if (!alumnos.length) { alert('Primero publica la lista de alumnos.'); return; }

    const st = document.getElementById('profesorStatus');
    st.style.display = 'block';
    st.className     = 'upload-status loading';
    st.innerHTML     = '⏳ Leyendo votos y generando grupos…';

    try {
        const votos  = await leerVotos();
        const grupos = calcularGrupos(alumnos, votos);
        await guardarConfigEnSheets(grupos);
        st.className = 'upload-status success';
        st.innerHTML = `✅ ${grupos.length} grupos generados y guardados.`;
        mostrarResultadoProfesor(grupos, votos);
    } catch (err) {
        const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
        st.className = 'upload-status error';
        st.innerHTML = `❌ Error: ${msg}`;
    }
}

// ══════════════════════════════════════════════════════════════════
//  ALGORITMO DE EMPAREJAMIENTO (soporta múltiples preferencias)
// ══════════════════════════════════════════════════════════════════
function calcularGrupos(listaAlumnos, votos) {
    // prefs[nombre] = array de preferencias
    const prefs = {};
    listaAlumnos.forEach(a => {
        prefs[a] = votos[a]?.preferencias?.filter(Boolean) || [];
    });

    const asignado = new Set();
    const grupos   = [];

    // Paso 1: pares mutuos — A tiene a B Y B tiene a A
    listaAlumnos.forEach(a => {
        if (asignado.has(a)) return;
        for (const b of prefs[a]) {
            if (!b || asignado.has(b) || !listaAlumnos.includes(b)) continue;
            if ((prefs[b] || []).includes(a)) {
                asignado.add(a); asignado.add(b);
                grupos.push([a, b]);
                break;
            }
        }
    });

    // Paso 2: resto aleatorio
    const pool = shuffle(listaAlumnos.filter(a => !asignado.has(a)));
    let grupoAbierto = grupos.find(g => g.length < tamañoGrupo) ?? null;
    pool.forEach(a => {
        if (!grupoAbierto || grupoAbierto.length >= tamañoGrupo) {
            grupoAbierto = []; grupos.push(grupoAbierto);
        }
        grupoAbierto.push(a);
    });

    return grupos;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ══════════════════════════════════════════════════════════════════
//  MOSTRAR GRUPOS (solo profesor)
// ══════════════════════════════════════════════════════════════════
function mostrarResultadoProfesor(grupos, votos) {
    document.getElementById('seccionGrupos').style.display = '';
    const div      = document.getElementById('resultadoProfesor');
    const nVotaron = Object.keys(votos).length;

    let html = `<div class="stats" style="margin-bottom:16px">
        <div class="stat"><div class="stat-label">Grupos</div><div class="stat-value">${grupos.length}</div></div>
        <div class="stat"><div class="stat-label">Máx/grupo</div><div class="stat-value">${tamañoGrupo}</div></div>
        <div class="stat"><div class="stat-label">Votaron</div><div class="stat-value">${nVotaron}</div></div>
    </div><div class="grupos-grid">`;

    grupos.forEach((g, i) => {
        const delay = i * 60;
        html += `<div class="grupo-card" style="animation-delay:${delay}ms">
            <div class="grupo-titulo">Grupo ${i + 1} <span class="grupo-count">(${g.length})</span></div>
            <div class="chips">${g.map((n, j) => {
                const misPrefs  = votos[n]?.preferencias || [];
                const esMutuo   = misPrefs.some(p => p && g.includes(p) && (votos[p]?.preferencias || []).includes(n));
                return `<span class="chip" style="animation-delay:${delay + j * 30}ms">${n}${esMutuo ? ' 🤝' : ''}</span>`;
            }).join('')}</div>
        </div>`;
    });

    html += '</div>';
    div.innerHTML = html;
}
