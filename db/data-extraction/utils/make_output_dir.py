from pathlib import Path, PurePath


def make_output_dir() -> str:
    CURRENT_DIR = Path(__file__).parent
    ROOT_DIR = CURRENT_DIR.parent
    DATA_DIR = ROOT_DIR / 'output'

    Path(DATA_DIR).mkdir(parents = True, exist_ok = True)
    return str(PurePath(DATA_DIR))
