from time import time
from scraper.scraper import Scraper
from dataframe_builder.dataframe_builder import scrape_and_build_dataframes

def main():
    scraper = Scraper()

    # Get list of all season homepages
    season_homepage_links = scraper.get_season_homepage_links()
    
    # Loop through each season's homepage and scrape the data
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
    start_time = time()
    main()
    elapsed_time = (time() - start_time) / 60

    print(f'Scraper finished in {elapsed_time} minutes.')
