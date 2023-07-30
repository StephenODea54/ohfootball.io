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

    def __init__(self, url: str) -> None:
        """
        Args:
            url (str): url of the webpage to be scraped.
        
        Returns:
            None
        """
        request = requests.get(url)
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
