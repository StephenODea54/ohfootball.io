# import logging
from scraper.scraper import Scraper

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
        print(f'Now scraping team schedule links for season {season}')
        team_schedule_links = scraper.get_team_schedule_links(season)
        print(team_schedule_links[:5])
        print('')
        
            
        # dataframe_constructor = Dataframeconstructor(scraper, team_schedule_links)
        # team_dfs.append(dataframe_constructor.construct_team_df())
        # schedule_dfs.append(dataframe_constructor.construct_schedule_df())

if __name__ == '__main__':
    main()
