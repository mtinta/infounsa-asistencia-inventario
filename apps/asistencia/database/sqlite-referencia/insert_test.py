"""
insert_test.py
Inserta datos de prueba (sede, terminal, usuario, horario) y luego
una marcación en `attendance`, para demostrar que el trigger
trg_attendance_enqueue encola automáticamente el registro en sync_queue.

Uso: python insert_test.py
"""

import os
from sqlcipher3 import dbapi2 as sqlite

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "asistencia.db")


def get_db_key():
    key = os.environ.get("ASISTENCIA_DB_KEY")
    if not key:
        raise RuntimeError("ASISTENCIA_DB_KEY es obligatoria para abrir la base SQLCipher.")
    return key.replace("'", "''")


def conectar():
    conn = sqlite.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(f"PRAGMA key='{get_db_key()}';")
    cur.execute("PRAGMA cipher_compatibility = 4;")
    cur.execute("PRAGMA foreign_keys = ON;")
    return conn, cur


def seed_datos_base(cur):
    """Inserta datos mínimos de catálogo si no existen, para poder
    crear una marcación válida (FKs satisfechas)."""

    cur.execute("""
        INSERT OR IGNORE INTO sede (id_sede, nombre, codigo, estado)
        VALUES (1, 'Sede Central Arequipa', 'SCA-01', 'A');
    """)

    cur.execute("""
        INSERT OR IGNORE INTO terminal (id_terminal, nombre, codigo, ip_local, estado, id_sede)
        VALUES (1, 'Terminal Recepción', 'TRM-01', '192.168.1.50', 'A', 1);
    """)

    cur.execute("""
        INSERT OR IGNORE INTO horario (id_horario, nombre, hora_ingreso, hora_salida,
                                         tolerancia_minutos, estado)
        VALUES (1, 'Turno Mañana', '08:00', '17:00', 10, 'A');
    """)

    cur.execute("""
        INSERT OR IGNORE INTO usuario_local (id_usuario, nombres, apellidos, dni,
                                               estado, id_sede, id_horario)
        VALUES (1, 'Melvin', 'Quispe', '12345678', 'A', 1, 1);
    """)


def insertar_marcacion(cur):
    cur.execute("""
        INSERT INTO attendance (
            id_usuario, id_terminal, fecha_hora,
            tipo_marca, origen, device_uuid, observacion
        ) VALUES (?, ?, datetime('now'), ?, ?, ?, ?);
    """, (
        1,                          # id_usuario
        1,                          # id_terminal
        'Ingreso',                  # tipo_marca
        'Offline',                  # origen
        'DEVICE-LOCAL-0001',        # device_uuid
        'Marcación de prueba generada por insert_test.py'
    ))


def mostrar_resultados(cur):
    print("\n📌 Registro insertado en attendance:")
    cur.execute("""
        SELECT local_id, id_usuario, id_terminal, fecha_hora,
               tipo_marca, estado_sync
        FROM attendance
        ORDER BY created_at DESC LIMIT 1;
    """)
    row = cur.fetchone()
    print(f"   local_id     : {row[0]}")
    print(f"   id_usuario   : {row[1]}")
    print(f"   id_terminal  : {row[2]}")
    print(f"   fecha_hora   : {row[3]}")
    print(f"   tipo_marca   : {row[4]}")
    print(f"   estado_sync  : {row[5]}")

    print("\n📌 Registro generado automáticamente en sync_queue (por el trigger):")
    cur.execute("""
        SELECT id_sync, idempotency_key, entity_type, entity_local_id,
               estado, payload
        FROM sync_queue
        ORDER BY fecha_creacion DESC LIMIT 1;
    """)
    row = cur.fetchone()
    print(f"   id_sync          : {row[0]}")
    print(f"   idempotency_key  : {row[1]}")
    print(f"   entity_type      : {row[2]}")
    print(f"   entity_local_id  : {row[3]}")
    print(f"   estado           : {row[4]}")
    print(f"   payload (JSON)   : {row[5]}")


def main():
    conn, cur = conectar()
    try:
        seed_datos_base(cur)
        insertar_marcacion(cur)
        conn.commit()
        mostrar_resultados(cur)
        print("\n✅ Prueba completada: el trigger trg_attendance_enqueue funcionó correctamente.")
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Error durante la prueba: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
