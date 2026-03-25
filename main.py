import random

alumnos = ["Juan", "Maria", "David", "Nuria", "Paco", "Richard", "Dani", "Marta", "Maite", "Clara"]

def emparejar_alumnos(lista, tamaño_grupo):import random
import os
import sys

# ─── Dependencias opcionales ──────────────────────────────────────
try:
    import fitz  # PyMuPDF
    PDF_OK = True
except ImportError:
    PDF_OK = False

try:
    from docx import Document as DocxDocument
    DOCX_OK = True
except ImportError:
    DOCX_OK = False

try:
    from PIL import Image
    import pytesseract
    OCR_OK = True
except ImportError:
    OCR_OK = False


# ─── Extracción de nombres desde documento ────────────────────────

def extraer_nombres_txt(ruta):
    """Lee un .txt y devuelve las líneas no vacías como nombres."""
    with open(ruta, 'r', encoding='utf-8') as f:
        lineas = [l.strip() for l in f.readlines()]
    return [l for l in lineas if len(l) > 1]


def extraer_nombres_pdf(ruta):
    """Extrae texto de un PDF con PyMuPDF y devuelve líneas como nombres."""
    if not PDF_OK:
        raise ImportError("Instala PyMuPDF: pip install pymupdf")
    doc = fitz.open(ruta)
    nombres = []
    for pagina in doc:
        texto = pagina.get_text()
        for linea in texto.split('\n'):
            linea = linea.strip()
            if len(linea) > 1:
                nombres.append(linea)
    return nombres


def extraer_nombres_docx(ruta):
    """Extrae párrafos de un .docx como nombres."""
    if not DOCX_OK:
        raise ImportError("Instala python-docx: pip install python-docx")
    doc = DocxDocument(ruta)
    nombres = []
    for parrafo in doc.paragraphs:
        texto = parrafo.text.strip()
        if len(texto) > 1:
            nombres.append(texto)
    return nombres


def extraer_nombres_imagen(ruta):
    """Usa OCR (Tesseract) para extraer texto de una imagen."""
    if not OCR_OK:
        raise ImportError("Instala Pillow y pytesseract: pip install Pillow pytesseract")
    imagen = Image.open(ruta)
    texto = pytesseract.image_to_string(imagen, lang='spa+eng')
    nombres = []
    for linea in texto.split('\n'):
        linea = linea.strip()
        if len(linea) > 1:
            nombres.append(linea)
    return nombres


def cargar_alumnos_desde_archivo(ruta):
    """Detecta el tipo de archivo y extrae los nombres, ordenados alfabéticamente."""
    if not os.path.exists(ruta):
        raise FileNotFoundError(f"No se encontró el archivo: {ruta}")

    ext = ruta.split('.')[-1].lower()

    if ext == 'txt':
        nombres = extraer_nombres_txt(ruta)
    elif ext == 'pdf':
        nombres = extraer_nombres_pdf(ruta)
    elif ext == 'docx':
        nombres = extraer_nombres_docx(ruta)
    elif ext in ('jpg', 'jpeg', 'png', 'webp'):
        nombres = extraer_nombres_imagen(ruta)
    else:
        raise ValueError(f"Formato no soportado: .{ext}\nUsa PDF, TXT, DOCX o imagen (JPG/PNG).")

    # Filtrar líneas que parezcan números, fechas o basura OCR
    nombres = [n for n in nombres if any(c.isalpha() for c in n)]

    # Ordenar alfabéticamente
    nombres.sort(key=lambda n: n.lower())

    return nombres


# ─── Lógica de emparejamiento ────────────────────────────────────

def emparejar_alumnos(lista, nombre_usuario, compañero_deseado=None):
    tamaño_grupo = 2

    # El usuario no necesita estar en la lista; se elimina si aparece para evitar duplicados
    mezclados = [a for a in lista if a != nombre_usuario]

    if compañero_deseado:
        if compañero_deseado not in mezclados:
            print(f"Error: {compañero_deseado} no está disponible o no existe.")
            return
        mezclados.remove(compañero_deseado)
        random.shuffle(mezclados)
        grupos = [[nombre_usuario, compañero_deseado]]
    else:
        random.shuffle(mezclados)
        grupos = [[nombre_usuario, mezclados[0]]]
        mezclados = mezclados[1:]

    for i in range(0, len(mezclados), tamaño_grupo):
        grupo = mezclados[i:i + tamaño_grupo]
        if grupo:
            grupos.append(grupo)

    print(f"\n✓ Grupos creados (tamaño de grupo: {tamaño_grupo}):")
    print("-" * 40)
    for i, grupo in enumerate(grupos, start=1):
        print(f"  Grupo {i}: {' y '.join(grupo)}")
    print("-" * 40)
    print(f"Total de grupos: {len(grupos)}")


# ─── Menú de carga de alumnos ────────────────────────────────────

def menu_cargar_alumnos():
    """Pide al usuario una ruta de archivo o permite lista manual."""
    print("\n══════════════════════════════════")
    print("  📄  CARGAR LISTA DE ALUMNOS")
    print("══════════════════════════════════")
    print("Opciones:")
    print("  1. Cargar desde archivo (PDF, TXT, DOCX, imagen)")
    print("  2. Introducir nombres manualmente")
    opcion = input("\nElige una opción (1/2): ").strip()

    if opcion == '1':
        ruta = input("Ruta del archivo: ").strip()
        try:
            alumnos = cargar_alumnos_desde_archivo(ruta)
            if not alumnos:
                print("⚠️  No se encontraron nombres en el archivo.")
                return []
            print(f"\n✅ {len(alumnos)} alumnos cargados y ordenados alfabéticamente:")
            print("  " + ", ".join(alumnos))
            confirmar = input("\n¿Usar esta lista? (s/n): ").strip().lower()
            if confirmar == 's':
                return alumnos
            else:
                print("Lista descartada.")
                return []
        except Exception as e:
            print(f"❌ Error: {e}")
            return []

    elif opcion == '2':
        print("Introduce los nombres uno por línea. Deja en blanco y pulsa Enter para terminar.")
        alumnos = []
        while True:
            nombre = input("  Nombre: ").strip()
            if not nombre:
                break
            alumnos.append(nombre)
        alumnos.sort(key=lambda n: n.lower())
        print(f"\n✅ {len(alumnos)} alumnos cargados.")
        return alumnos

    else:
        print("Opción no válida.")
        return []


# ─── Bucle principal ─────────────────────────────────────────────

def main():
    print("\n╔══════════════════════════════════╗")
    print("║   📚  EMPAREJAR ALUMNOS          ║")
    print("╚══════════════════════════════════╝")

    alumnos = []

    while True:
        if not alumnos:
            alumnos = menu_cargar_alumnos()
            if not alumnos:
                respuesta = input("\n¿Quieres intentarlo de nuevo? (s/n): ").strip().lower()
                if respuesta != 's':
                    print("¡Hasta luego!")
                    break
                continue

        print(f"\nLista activa ({len(alumnos)} alumnos): {', '.join(alumnos)}")

        nombre = input("\n¿Cuál es tu nombre? ").strip()
        if not nombre:
            print("Por favor, introduce tu nombre.")
            continue

        print(f"\nTamaño de grupo: 2")
        disponibles = [a for a in alumnos if a != nombre]
        print(f"Alumnos disponibles (excepto tú): {', '.join(disponibles)}")
        compañero = input("¿Con quién quieres ir? (deja en blanco si no tienes preferencia): ").strip()

        if compañero and compañero not in alumnos:
            print(f"Error: '{compañero}' no está en la lista de alumnos.")
            continue

        emparejar_alumnos(alumnos, nombre, compañero if compañero else None)

        print("\n¿Qué quieres hacer ahora?")
        print("  1. Volver a emparejar con la misma lista")
        print("  2. Cargar una lista nueva")
        print("  3. Salir")
        opcion = input("Opción (1/2/3): ").strip()

        if opcion == '1':
            continue
        elif opcion == '2':
            alumnos = []
        else:
            print("¡Hasta luego!")
            break


if __name__ == '__main__':
    main()
        print(f"Error: el tamaño del grupo debe estar entre 1 y {len(lista)}.")
        return

    mezclados = lista.copy()
    random.shuffle(mezclados)

    grupos = [mezclados[i:i + tamaño_grupo] for i in range(0, len(mezclados), tamaño_grupo)]

    print(f"\nAlumnos emparejados en grupos de {tamaño_grupo}:")
    print("-" * 35)
    for i, grupo in enumerate(grupos, start=1):
        print(f"  Grupo {i}: {', '.join(grupo)}")
    print("-" * 35)
    print(f"Total de grupos: {len(grupos)}")
    #if len(grupos[-1]) < tamaño_grupo:
        #print(f"(El último grupo tiene {len(grupos[-1])} alumno(s) por no ser divisible exactamente)")

#Bucle principal para permitir al usuario emparejar varias veces
while True:
    try:
        tamaño = int(input(f"\nIntroduce el tamaño de cada grupo (1 - {len(alumnos)}): "))
        emparejar_alumnos(alumnos, tamaño)
    except ValueError:
        print("Error: introduce un número entero válido.")

    respuesta = input("\n¿Quieres volver a emparejar? (s/n): ").strip().lower()
    if respuesta != "s":
        print("¡Hasta luego!")
        break
