from urllib.parse import urlparse
from urllib.parse import parse_qs

def get_query_parameter(url: str, parameter: str) -> str:
    """Returns the value from a url query parameter."""

    parsed_url = urlparse(url)
    return parse_qs(parsed_url.query)[parameter][0]
