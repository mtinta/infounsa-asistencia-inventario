"""
create_db.py
Crea (o reabre) el archivo cifrado asistencia.db dentro de
apps/asistencia/database, aplicando el esquema schema.sql.

Requiere: pip install sqlcipher3
Uso:      python create_db.py
"""

import os
from sqlcipher3 import dbapi2 as sqlite

# --- Configuración ---------------------------------------------------
DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "asistencia.db")
SCHEMA_PATH = os.path.join(DB_DIR, "schema.sql")

def get_db_key():
    key = os.environ.get("ASISTENCIA_DB_KEY")
    if not key:
        raise RuntimeError("ASISTENCIA_DB_KEY es obligatoria para abrir la base SQLCipher.")
    return key.replace("'", "''")


def create_database():
    if not os.path.exists(SCHEMA_PATH):
        raise FileNotFoundError(f"No se encontró schema.sql en: {SCHEMA_PATH}")

    conn = sqlite.connect(DB_PATH)
    cur = conn.cursor()

    # 1. Aplicar clave de cifrado
    cur.execute(f"PRAGMA key='{get_db_key()}';")

    # 2. Configuración recomendada de SQLCipher / SQLite
    cur.execute("PRAGMA cipher_compatibility = 4;")
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("PRAGMA synchronous = NORMAL;")
    cur.execute("PRAGMA foreign_keys = ON;")

    # 3. Verificar que la clave es válida (si el archivo ya existía
    #    con otra clave, esta consulta lanzará un error "file is not a database")
    cur.execute("SELECT count(*) FROM sqlite_master;")

    # 4. Ejecutar el esquema completo
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema_sql = f.read()
    cur.executescript(schema_sql)

    conn.commit()

    # 5. Mostrar resumen de tablas creadas
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    tablas = [row[0] for row in cur.fetchall()]

    conn.close()

    print(f"✅ Base de datos creada/verificada en: {DB_PATH}")
    print(f"📋 Tablas presentes ({len(tablas)}):")
    for t in tablas:
        print(f"   - {t}")


if __name__ == "__main__":
    create_database()
