from typing import List
from bs4 import BeautifulSoup
import requests

class Scraper(BeautifulSoup):
    """
    Class that inherits from BeautifulSoup. Responsible for navigating and
    scraping the data.

    The rationale for inheriting is that multiple scrapers will need to be
    implemented while scraping the entire website. So instead of making a
    new request and reinstantiating a new BeautifulSoup object, the url
    is embedded into this class so that when the url changes
    a new instance of is automatically created.
    """

    def __init__(self, url: str = '') -> None:
        """
        Args:
            url (str): url of the webpage to be scraped.
                If no url is given, the scraper initializes with the
                default base url: 'http://www.joeeitel.com/hsfoot/'
        
        Returns:
            None
        """
        self.BASE_URL = 'http://www.joeeitel.com/hsfoot/'
        self.url = url

        request = requests.get(self.BASE_URL + self.url)
        super().__init__(request.text, 'html.parser')
    
    def update_url(self, url: str) -> None:
        """
        Function that reinitizalizes the class instance.

        Args:
            url (str): url of the webpage to be scraped.
        
        Returns:
            None
        """
        self.__init__(url)
    
    def get_season_homepage_links(self) -> List[str]:
        """
        Function that retrieves the url for each season's homepage.

        Args:
            None
        
        Returns:
            homepage links (List[str]): the urls for each season homepage.
        """
        if self.url.startswith(self.BASE_URL + '/region') or self.url.startswith(self.BASE_URL + '/teams'):
            raise Exception('Url does not contain the season homepage links.')
        else:
            season_homepage_links: List[str] = []
            season_anchor_tags = self.find('div', class_ = 'previous').findChildren()

            for season_anchor_tag in season_anchor_tags:
                season_homepage_link = season_anchor_tag['href']
                season_homepage_links.append(season_homepage_link)
        
        return season_homepage_links
