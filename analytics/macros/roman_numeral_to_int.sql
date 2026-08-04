{% macro roman_numeral_to_int(column_name) %}
    (
        WITH normalized AS (
            SELECT UPPER(NULLIF(TRIM({{ column_name }}), '')) AS numeral
        ),

        validated AS (
            SELECT numeral
            FROM normalized
            WHERE numeral ~ '^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$'
        ),

        symbols AS (
            SELECT
                position,
                (ARRAY[1, 5, 10, 50, 100, 500, 1000])[
                    STRPOS(
                        'IVXLCDM',
                        SUBSTRING(numeral FROM position FOR 1)
                    )
                ] AS symbol_value
            FROM validated
            CROSS JOIN LATERAL GENERATE_SERIES(1, LENGTH(numeral)) AS positions(position)
        ),

        signed_symbols AS (
            SELECT
                CASE
                    WHEN symbol_value < LEAD(symbol_value, 1, 0) OVER (ORDER BY position)
                    THEN -symbol_value
                    ELSE symbol_value
                END AS signed_value
            FROM symbols
        )

        SELECT SUM(signed_value)::SMALLINT
        FROM signed_symbols
    )
{% endmacro %}
