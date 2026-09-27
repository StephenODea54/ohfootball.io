{#
    True when a joeeitel.com team row is a placeholder. The scraper writes such
    a row for a team whose page is empty. It holds the identifier, the name and
    at most the state, so every other attribute is null. The state is not part
    of the rule, because the placeholder of an OHSAA team holds the state of
    Ohio.
#}
{% macro joeeitel_is_placeholder(relation) -%}
    (
        {{ relation }}.mascot IS NULL
        AND {{ relation }}.city IS NULL
        AND {{ relation }}.county IS NULL
        AND {{ relation }}.primary_color_hex IS NULL
        AND {{ relation }}.secondary_color_hex IS NULL
        AND {{ relation }}.division IS NULL
        AND {{ relation }}.region IS NULL
    )
{%- endmacro %}
