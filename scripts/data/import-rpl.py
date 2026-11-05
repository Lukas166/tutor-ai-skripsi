# Impor dataset administratif; course tujuan selalu dipilih dengan ID eksplisit.
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/rag/src"))

from tutor_rag.core.config import Settings
from tutor_rag.domain.importer import import_dataset
from tutor_rag.infrastructure.database import connect_database

if len(sys.argv) != 2:
    raise SystemExit("Penggunaan: pnpm seed:domain:rpl <course-id>")

# Tidak ada pencocokan judul otomatis: kelas dengan judul sama tidak boleh tertukar.
with connect_database(Settings()) as connection:
    print(import_dataset(connection, ROOT / "data/rpl/RPL.xlsm", sys.argv[1]))
