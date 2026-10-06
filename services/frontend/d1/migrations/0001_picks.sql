-- The picks of Pick 'Em and the count of picks for each game.
--
-- A pick row holds no client address. ip_hash is an HMAC-SHA256 of the address key, made with a
-- secret that only the Function knows. The Function removes each pick row 10 days after the date
-- of its game. The tally of the game stays.

CREATE TABLE picks (
    game_key TEXT NOT NULL,
    ip_hash TEXT NOT NULL CHECK (length(ip_hash) = 64),
    side TEXT NOT NULL CHECK (side IN ('a', 'b')),
    season INTEGER NOT NULL,
    game_date TEXT NOT NULL CHECK (
        game_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (game_key, ip_hash)
) STRICT, WITHOUT ROWID;

-- The board reads the picks of one address since a date.
CREATE INDEX picks_ip_hash_game_date ON picks (ip_hash, game_date);

-- The Function removes the picks before a date.
CREATE INDEX picks_game_date ON picks (game_date);

CREATE TABLE tallies (
    game_key TEXT NOT NULL PRIMARY KEY,
    season INTEGER NOT NULL,
    game_date TEXT NOT NULL CHECK (
        game_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    a INTEGER NOT NULL CHECK (a >= 0),
    b INTEGER NOT NULL CHECK (b >= 0)
) STRICT;

-- The board reads the tallies since a date.
CREATE INDEX tallies_game_date ON tallies (game_date);
