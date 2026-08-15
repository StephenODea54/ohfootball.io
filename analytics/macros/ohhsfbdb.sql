{#
    The site writes every number as text, and leaves a cell empty when the
    number does not apply. This reads such a cell as a whole number, and gives
    null for anything else.
#}
{% macro ohhsfbdb_count(column_name) -%}
    CASE
        WHEN NULLIF(TRIM({{ column_name }}), '') ~ '^[0-9]+$'
        THEN TRIM({{ column_name }})::SMALLINT
    END
{%- endmacro %}

{#
    True when the name of an opponent names a state or a province other than
    Ohio. The site writes the place inside the name, as in "Linsly (WV)" and
    "Hamilton (ON) Cathedral". Such a school has no sheet of its own, so the
    warehouse mints an identifier for it rather than leaving its games with no
    opponent.
#}
{% macro ohhsfbdb_is_out_of_state(column_name) -%}
    {{ column_name }} ~ '\((AK|AL|AR|AZ|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|AB|BC|MB|NB|NL|NS|ON|PE|QC|SK)\)'
{%- endmacro %}

{#
    The newest run of the backfill that succeeded.

    Every raw table appends, so a second run of the backfill doubles every row.
    The models of this source read one run, and a failed run never qualifies,
    which is what makes a repeat run safe.
#}
{% macro ohhsfbdb_latest_run() -%}
    (
        SELECT id
        FROM {{ source('ohfootball_metadata', 'scrape_runs') }}
        WHERE LOWER(TRIM(status)) = 'succeeded'
          AND scraper_version LIKE 'ohhsfbdb@%'
        ORDER BY COALESCE(finished_at, started_at) DESC, id DESC
        LIMIT 1
    )
{%- endmacro %}

{#
    The state or province inside the name of a school, as the site writes it,
    for example "Linsly (WV)". Null for a school of Ohio, which the site never
    marks, because the site holds the football of Ohio and marks only what lies
    outside it.
#}
{% macro ohhsfbdb_state_in_name(column_name) -%}
    SUBSTRING(
        {{ column_name }}
        FROM '\((AK|AL|AR|AZ|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|AB|BC|MB|NB|NL|NS|ON|PE|QC|SK)\)'
    )
{%- endmacro %}
