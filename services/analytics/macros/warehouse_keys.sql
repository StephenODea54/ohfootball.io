{% macro ohfootball_uuid(name_expression) -%}
    uuid_generate_v5(
        uuid_ns_url(),
        {{ name_expression }}
    )
{%- endmacro %}

{% macro team_key(season_expression, team_id_expression) -%}
    {{ ohfootball_uuid(
        "CONCAT('https://ohfootball.io/teams/', "
        ~ season_expression
        ~ ", '/', "
        ~ team_id_expression
        ~ ")"
    ) }}
{%- endmacro %}

{% macro game_key(season_expression, game_date_expression, team_a_id_expression, team_b_id_expression) -%}
    {{ ohfootball_uuid(
        "CONCAT('https://ohfootball.io/games/', "
        ~ season_expression
        ~ ", '/', "
        ~ game_date_expression
        ~ ", '/', "
        ~ team_a_id_expression
        ~ ", '/', "
        ~ team_b_id_expression
        ~ ")"
    ) }}
{%- endmacro %}
