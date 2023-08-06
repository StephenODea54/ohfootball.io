from dataclasses import dataclass, field

@dataclass
class Team:
    season: int
    id: int = field(init = False)
    primary_color: str = field(init = False)
    secondary_color: str = field(init = False)
    city: str = field(init = False)
    county: str = field(init = False)
    state: str = field(init = False)
    division: int = field(init = False)
    region: int = field(init = False)
    name: str = field(init = False)
    mascot: str = field(init = False)
