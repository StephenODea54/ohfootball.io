from typing import List
from scraper.scraper import Scraper

def main():
    scraper = Scraper()

    # Get list of all season homepages
    season_homepage_links = scraper.get_season_homepage_links()
    print(season_homepage_links)


if __name__ == '__main__':
    main()
