WITH test_cases(roman_numeral, expected_value) AS (
    VALUES
        ('I', 1),
        ('IV', 4),
        ('VII', 7),
        ('ix', 9),
        ('XLIX', 49),
        ('MCMXCIV', 1994),
        ('MMMCMXCIX', 3999),
        ('IIII', NULL),
        ('not a numeral', NULL),
        ('', NULL)
),

actual AS (
    SELECT
        roman_numeral,
        expected_value,
        {{ roman_numeral_to_int('roman_numeral') }} AS actual_value
    FROM test_cases
)

SELECT *
FROM actual
WHERE actual_value IS DISTINCT FROM expected_value
