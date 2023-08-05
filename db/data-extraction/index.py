# import logging
from typing import List
import pandas as pd
from scraper.scraper import Scraper
from dataframe_builder.dataframe_builder import scrape_and_build_dataframes

def main():
    # logging.basicConfig(
    #     level=logging.BASIC_FORMAT,
    #     format="%(asctime)s %(levelname)s %(message)s",
    #     datefmt="%Y-%m-%d %H:%M:%S",
    #     filename="basic.log",
    # )

    scraper = Scraper()

    # Get list of all season homepages
    season_homepage_links = scraper.get_season_homepage_links()
    
    # Loop through each season's homepage and scrape the data
    # If you wanted to add a logger, here is a good chance to use it!
    for season_homepage_link in season_homepage_links:
        scraper.update_url(season_homepage_link)

        season = scraper.url[-4 : ]
        team_schedule_links = scraper.get_team_schedule_links(season)
     
        scrape_and_build_dataframes(
            season,
            team_schedule_links,
            scraper
        )


if __name__ == '__main__':
    main()
