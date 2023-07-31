from typing import List, Type
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
    
    def get_team_schedule_links(self, season: str) -> List[str]:
        """
        Function that returns the urls of each team's schedule.
        
        Args:
            season (str): The season for which we want to get the
                          team schedules from.
        
        Returns:
            team schedule links (List[str]): A list of the team schedule urls.
        """

        if season == '2000':
            return simple_team_schedule_extractor(self)
        else:
            return complex_team_schedule_extractor(self)


def simple_team_schedule_extractor(scraper: Type[Scraper]) -> List[str]:
    """
    Function that returns a list of each team's schedule url. This is considered
    the "simple" extractor because, for instance, the team schedules for the 2000
    season all exist on one url.

    Args:
        scraper (Scraper): Scraper object.
    
    Returns:
        team schedule links (List[str]): A list of urls for each team's schedule.
    """

    anchor_tag_link = scraper.find('a')['href']
    scraper.update_url(anchor_tag_link)

    team_schedule_links: List[str] = []
    team_schedule_anchor_tags = scraper.find_all('a')

    for team_schedule_anchor_tag in team_schedule_anchor_tags:
        team_schedule_link = team_schedule_anchor_tag['href']
        team_schedule_links.append(team_schedule_link)
    
    return team_schedule_links

def complex_team_schedule_extractor(scraper: Type[Scraper]) -> List[str]:
    """
    Function that returns a list of each team's schedule url. This is considered
    the "complex" extractor because, for instance, the team schedules for the 2001
    season exist on a variety of different urls.

    Args:
        scraper (Scraper): Scraper object.

    Returns:
        team schedule links (List[str]): A list of urls for each team's schedule.
    """
    region_homepage_links: List[str] = []
    region_table = scraper.find('table', class_ = 'rankings')
    region_anchor_tags = region_table.find_all('a')

    for region_anchor_tag in region_anchor_tags:
        region_homepage_link = region_anchor_tag['href']
        region_homepage_links.append(region_homepage_link)
    
    team_schedule_links: List[str] = []
    
    for region_homepage_link in region_homepage_links:
        scraper.update_url(region_homepage_link)

        # Instead of parsing with a bunch of classes that change, the regions
        # table is always the second one.
        region_leaderboard_table = scraper.find_all('table')[1]
        team_schedule_anchor_tags = region_leaderboard_table.find_all('a')

        for team_schedule_anchor_tag in team_schedule_anchor_tags:
            # Some links include the full url, some don't. To keep the navigation
            # functionality of the scraper consistent, we are going to remove the base url part.
            team_schedule_link = team_schedule_anchor_tag['href'].replace('http://www.joeeitel.com/hsfoot/', '')
            team_schedule_links.append(team_schedule_link)
    
    return team_schedule_links
