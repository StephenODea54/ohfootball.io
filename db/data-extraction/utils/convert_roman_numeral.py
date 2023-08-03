def convert_roman_numeral(numeral: str) -> int:
    mapping = {
        'I': 1,
        'II': 2,
        'III': 3,
        'IV': 4,
        'V': 5,
        'VI': 6,
        'VII': 7,
    }

    return mapping[numeral]
