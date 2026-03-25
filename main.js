// ─── Estado global ───────────────────────────────────────────────
let alumnos = [];

// ─── Drag & drop ─────────────────────────────────────────────────
const uploadArea = document.getElementById('uploadArea');
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivo(file);
});

// ─── Entrada de archivo ───────────────────────────────────────────
function cargarArchivo(event) {
    const file = event.target.files[0];
    if (file) procesarArchivo(file);
}

async function procesarArchivo(file) {
    const status = document.getElementById('uploadStatus');
    const preview = document.getElementById('listaPreview');
    preview.style.display = 'none';
    status.style.display = 'block';
    status.className = 'upload-status loading';
    status.innerHTML = '⏳ Analizando documento con IA…';

    try {
        const ext = file.name.split('.').pop().toLowerCase();
        let nombres = [];

        if (ext === 'txt') {
            nombres = await extraerDesdeTxt(file);
        } else if (ext === 'pdf' || ext === 'docx' || ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            nombres = await extraerConClaude(file, ext);
        } else {
            throw new Error('Formato no soportado. Usa PDF, TXT, DOCX o imagen.');
        }

        if (nombres.length === 0) throw new Error('No se encontraron nombres en el documento.');

        nombres.sort((a, b) => a.localeCompare(b, 'es'));
        mostrarPreview(nombres);

        status.className = 'upload-status success';
        status.innerHTML = `✅ Se encontraron <strong>${nombres.length}</strong> alumnos en "${file.name}"`;

    } catch (err) {
        status.className = 'upload-status error';
        status.innerHTML = `❌ ${err.message}`;
    }
}

// ─── TXT: extracción local ────────────────────────────────────────
function extraerDesdeTxt(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const lineas = e.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 1);
            resolve(lineas);
        };
        reader.onerror = () => reject(new Error('No se pudo leer el archivo de texto.'));
        reader.readAsText(file);
    });
}

// ─── PDF / DOCX / Imagen: Claude API ────────────────────────────
async function extraerConClaude(file, ext) {
    const base64 = await fileToBase64(file);

    let mediaType;
    let contentBlock;

    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        mediaType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        contentBlock = {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
        };
    } else {
        // PDF y DOCX se envían como documento
        mediaType = ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        contentBlock = {
            type: 'document',
            source: { type: 'base64', media_type: mediaType, data: base64 }
        };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system: `Eres un extractor de nombres de personas. 
Analiza el documento y devuelve ÚNICAMENTE una lista JSON de nombres completos encontrados, sin ningún texto adicional, sin markdown, sin explicaciones.
Formato exacto: ["Nombre1", "Nombre2", "Nombre3"]
Si no encuentras nombres, devuelve: []`,
            messages: [{
                role: 'user',
                content: [
                    contentBlock,
                    { type: 'text', text: 'Extrae todos los nombres de personas de este documento y devuélvelos como JSON.' }
                ]
            }]
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Error al conectar con la IA.');
    }

    const data = await response.json();
    const texto = data.content.map(b => b.text || '').join('').trim();

    try {
        const parsed = JSON.parse(texto);
        if (!Array.isArray(parsed)) throw new Error();
        return parsed.filter(n => typeof n === 'string' && n.trim().length > 0);
    } catch {
        throw new Error('La IA no devolvió una lista válida de nombres.');
    }
}

// ─── Helpers ──────────────────────────────────────────────────────
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
    });
}

// ─── Preview de alumnos detectados ───────────────────────────────
function mostrarPreview(nombres) {
    const preview = document.getElementById('listaPreview');
    const chips = document.getElementById('alumnosDetectados');
    const textarea = document.getElementById('editarAlumnos');
    document.getElementById('countAlumnos').textContent = nombres.length;

    chips.innerHTML = nombres.map(n => `<span class="chip-preview">${n}</span>`).join('');
    textarea.value = nombres.join('\n');
    preview.style.display = 'block';
}

function usarAlumnos() {
    const textarea = document.getElementById('editarAlumnos');
    const nuevos = textarea.value.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    nuevos.sort((a, b) => a.localeCompare(b, 'es'));

    alumnos = nuevos;
    actualizarListaActiva();
    inicializarSelect();

    document.getElementById('listaPreview').style.display = 'none';
    document.getElementById('uploadStatus').className = 'upload-status success';
    document.getElementById('uploadStatus').innerHTML = `✅ Lista activa con <strong>${alumnos.length}</strong> alumnos.`;
}

function actualizarListaActiva() {
    const div = document.getElementById('listaActiva');
    if (alumnos.length === 0) {
        div.innerHTML = '<span class="chip-inactive">Sin alumnos cargados</span>';
    } else {
        div.innerHTML = alumnos.map(n => `<span class="chip-activo">${n}</span>`).join('');
    }
}

// ─── Select de compañeros ─────────────────────────────────────────
function inicializarSelect() {
    const select = document.getElementById('compañero');
    select.innerHTML = '<option value="">-- Sin preferencia --</option>';
    const nombre = document.getElementById('nombre').value.trim();

    if (nombre && alumnos.length > 0) {
        alumnos.forEach(alumno => {
            if (alumno !== nombre) {
                const option = document.createElement('option');
                option.value = alumno;
                option.textContent = alumno;
                select.appendChild(option);
            }
        });
    }
}

document.getElementById('nombre').addEventListener('input', inicializarSelect);

// ─── Shuffle ──────────────────────────────────────────────────────
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ─── Errores ──────────────────────────────────────────────────────
function limpiarErrores() {
    document.getElementById('errorNombre').classList.remove('show');
    document.getElementById('errorCompañero').classList.remove('show');
}

function mostrarError(id, mensaje) {
    const el = document.getElementById(id);
    el.textContent = mensaje;
    el.classList.add('show');
}

// ─── Emparejar ────────────────────────────────────────────────────
function emparejar() {
    limpiarErrores();

    if (alumnos.length === 0) {
        alert('Primero carga una lista de alumnos desde un documento.');
        return;
    }

    const nombre = document.getElementById('nombre').value.trim();
    const compañero = document.getElementById('compañero').value.trim();

    if (!nombre) { mostrarError('errorNombre', 'Por favor, introduce tu nombre'); return; }
    if (compañero && !alumnos.includes(compañero)) { mostrarError('errorCompañero', 'El compañero seleccionado no existe'); return; }

    // El usuario puede no estar en la lista; se elimina si aparece para evitar duplicados
    let mezclados = alumnos.filter(a => a !== nombre);
    const grupos = [];

    if (compañero) {
        if (!mezclados.includes(compañero)) { mostrarError('errorCompañero', 'El compañero no está disponible'); return; }
        mezclados = mezclados.filter(a => a !== compañero);
        grupos.push([nombre, compañero]);
    } else {
        grupos.push([nombre, mezclados[0]]);
        mezclados = mezclados.slice(1);
    }

    mezclados = shuffle(mezclados);
    for (let i = 0; i < mezclados.length; i += 2) {
        grupos.push(mezclados.slice(i, i + 2));
    }

    let html = `<div class="resultado-titulo">✓ Grupos creados</div>
    <div class="stats">
        <div class="stat"><div class="stat-label">Grupos</div><div class="stat-value">${grupos.length}</div></div>
        <div class="stat"><div class="stat-label">Por grupo</div><div class="stat-value">2</div></div>
        <div class="stat"><div class="stat-label">Total</div><div class="stat-value">${alumnos.length}</div></div>
    </div><div id="grupos">`;

    grupos.forEach((g, i) => {
        const delay = i * 60;
        html += `<div class="grupo-card" style="animation-delay:${delay}ms">
            <div class="grupo-titulo">Grupo ${i + 1}</div>
            <div class="chips">${g.map((n, j) => `<span class="chip" style="animation-delay:${delay + j * 40}ms">${n}</span>`).join('')}</div>
        </div>`;
    });

    html += '</div>';
    document.getElementById('resultado').innerHTML = html;
}

// ─── Resetear ────────────────────────────────────────────────────
function resetear() {
    document.getElementById('nombre').value = '';
    document.getElementById('compañero').value = '';
    document.getElementById('resultado').innerHTML = '';
    limpiarErrores();
    inicializarSelect();
}

// ─── Enter ───────────────────────────────────────────────────────
document.getElementById('compañero').addEventListener('keypress', e => { if (e.key === 'Enter') emparejar(); });
document.getElementById('nombre').addEventListener('keypress', e => { if (e.key === 'Enter') emparejar(); });
