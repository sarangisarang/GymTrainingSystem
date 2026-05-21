from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker


# ============================================================
# SQLite Datenbank-Konfiguration
# ============================================================

# Lokale SQLite-Datenbankdatei
# Die Datei "gym.db" wird automatisch erstellt, falls sie nicht existiert.
SQLALCHEMY_DATABASE_URL = "sqlite:///./gym.db"


# Engine erstellen
# Für SQLite ist "check_same_thread=False" zwingend notwendig,
# weil FastAPI mit mehreren Threads arbeitet.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)


# ============================================================
# Session Factory
# ============================================================

# SessionLocal erzeugt einzelne Datenbank-Sessions.
# autocommit=False → Änderungen müssen manuell mit commit() gespeichert werden
# autoflush=False → verhindert automatische Synchronisation bei jeder Änderung
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# ============================================================
# Basismodell für alle SQLAlchemy-Modelle
# ============================================================

# Alle Models erben von dieser Basisklasse:
# class User(Base):
#     __tablename__ = "users"
Base = declarative_base()


# ============================================================
# FastAPI Dependency
# ============================================================

def get_db():
    """
    Gibt eine neue Datenbank-Session zurück.
    FastAPI erzeugt automatisch neue Sessions für jede Anfrage.

    Verwendung:
        @router.get("/beispiel")
        def route(db: Session = Depends(get_db)):
            # Hier kann man sicher mit der DB arbeiten
            result = db.query(User).all()
            return result

    Ablauf:
    - Session wird geöffnet
    - An die Route übergeben
    - Nach Abschluss der Anfrage automatisch geschlossen
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
