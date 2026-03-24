import random

alumnos = ["Juan", "Maria", "David", "Nuria", "Paco", "Richard", "Dani", "Marta", "Maite", "Clara"]

def emparejar_alumnos(lista, tamaño_grupo):
    if tamaño_grupo < 1 or tamaño_grupo > len(lista):
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
    if len(grupos[-1]) < tamaño_grupo:
        print(f"(El último grupo tiene {len(grupos[-1])} alumno(s) por no ser divisible exactamente)")

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