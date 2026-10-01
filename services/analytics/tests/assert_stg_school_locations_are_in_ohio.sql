{{ config(severity='warn') }}

-- Every school location falls inside a box around Ohio. A point outside it is a
-- bad geocode or a swapped latitude and longitude.
--
-- This is a warning. A failure would stop the weekly build over a field that
-- only the map of the home page uses.
SELECT *
FROM {{ ref('stg_school_locations') }}
WHERE
    latitude NOT BETWEEN 38.3 AND 42.0
    OR longitude NOT BETWEEN -84.9 AND -80.5
