from abc import ABC, abstractmethod
import bs4
from typing import List, Type
import pandas as pd
from scraper.scraper import Scraper
from .team import Team
from utils.get_query_parameter import get_query_parameter
from utils.convert_roman_numeral import convert_roman_numeral
from utils.make_output_dir import make_output_dir


# TODO: Break these up into separate files
class TeamDataframeBuilder(ABC):
    """
    Responsible for scraping team-specific information, which includes:
        - season (int): The season for which the information is applicable.
        - id (int): Team ID for internal DB use. This ID is able to keep track
          of teams from season-to-season, even for things such as 
          name changes.
        - primary_color (str): Primary jersey color.
        - secondary_color (str): Secondary jersey color.
        - city (str): City of the team's school.
        - county (str): County of the team's school.
        - state (str): State of the team's school.
        - division (str): The division the team is a part of.
        - region (str): The region the team is a part of.
        - name (str): Name of the school.
        - mascot (str): Name of the mascot.
    """

    def __init__(
        self,
        team_schedule_links: List[str],
        scraper: type[Scraper],
        season: str,
    ) -> None:
        """
        Args:
            team_schedule_links (List[str]): A list of urls that correspond to each team.
            scraper (Type[Scraper]): A Scraper object that uses BeautifulSoup.
            season (str): The season for which the information is applicable for.
        Returns:
            None
        """

        self.team_schedule_links = team_schedule_links
        self.scraper = scraper
        self.team = Team(season = int(season))
    
    def get_team_id(self, url: str) -> None:
        """Returns the unique identifier for each team."""

        self.team.id = int(get_query_parameter(url, 'teamID'))
        return self

    @abstractmethod    
    def get_team_colors(self) -> None:
        """Sets the team's primary and secondary colors."""
        pass
    
    @abstractmethod
    def get_team_location_info(self) -> None:
        """Sets the team's city, county, state, division, and region information."""
        pass

    @abstractmethod
    def get_team_name_info(self) -> None:
        """Sets the team's name and mascot."""
        pass

    # These can probably go into its own class for a more "traditional"
    # builder pattern. But I don't feel like defining a single class with
    # one method in it.
    def build(self) -> pd.DataFrame:
        """
        Exports a Pandas DataFrame by building each attribute
        of the class for each of the available team schedule links.
        """

        teams: List[pd.DataFrame] = []

        for team_schedule_link in self.team_schedule_links:
            self.scraper.update_url(team_schedule_link)
            self.get_team_id(team_schedule_link) \
                .get_team_colors() \
                .get_team_location_info() \
                .get_team_name_info()
            
            # Put this to_dict into its own helper function!
            team_attrs = self.team.__dict__.items()

            # TODO: What is the type here?
            team_dict = {}
            for k, v in team_attrs:
                team_dict[k] = v
            
            teams.append(pd.DataFrame([team_dict]))
        
        teams_df = pd.concat(teams)
        
        return teams_df


class NonTableTeamDataframeBuilder(TeamDataframeBuilder):
    """
    Class that defines the methods for scraping team information
    for seasons 2000, 2001, and 2013-2023.
    """
    
    def get_team_colors(self) -> None:
        team_colors_tag = self.scraper.find('div', id = 'header')

        colors = team_colors_tag['style'].split(';')

        base_color_style = colors[0]
        secondary_color_style = colors[1]

        self.team.primary_color = base_color_style.replace('background-color:', '')
        self.team.secondary_color = secondary_color_style.replace('color:', '')
        return self
    
    def get_team_location_info(self) -> None:
        h3_tag = self.scraper.find('h3')
        h3_tag_text_arr = h3_tag.text.strip().split('\n')

        self.team.city = h3_tag_text_arr[0].split(', ')[0]
        self.team.county = h3_tag_text_arr[1].split(', ')[-1].replace(' County', '').strip()
        self.team.state = h3_tag_text_arr[0].split(', ')[-1].strip()
        self.team.division = convert_roman_numeral(
            h3_tag_text_arr[-1].split(' ')[2][ : -1]
        )
        self.team.region = int(h3_tag_text_arr[-1].split(' ')[-1])
        return self

    def get_team_name_info(self) -> None:
        full_name = self.scraper.find('h2').text
        caption = self.scraper.find('caption').text

        season_idx = caption.find(str(self.team.season))
        team_name_only = caption[ : season_idx]
        
        self.team.name = team_name_only.strip()
        self.team.mascot = full_name.replace(team_name_only, '')
        return self


class TableTeamDataframeBuilder(TeamDataframeBuilder):
    """
    Class that defines the methods for scraping team information
    for seasons 2002 - 2012.
    """
    
    def get_font_tags(self) -> bs4.ResultSet:
        """Returns all font tags found on the webpage."""
        return self.scraper.find_all('font')
    
    def get_team_colors(self) -> None:
        td_tag = self.scraper.find('td', {'valign', 'Top'})
        font_tag = self.get_font_tags()[0]

        # May not be hexadecimal 🙃
        self.team.primary_color = td_tag['bgcolor']
        self.team.secondary_color = font_tag['color']
    
    def get_team_location_info(self) -> None:
        font_tag = self.get_font_tags()[1]

        font_tag_text_arr = font_tag.text.strip().split('\n')

        self.team.city = font_tag_text_arr[0].split(', ')[0]
        self.team.county = font_tag_text_arr[1].split(', ')[-1].replace(' County', '').strip()
        self.team.state = font_tag_text_arr[0].split(', ')[-1].strip()
        self.team.division = convert_roman_numeral(
            font_tag_text_arr[-1].split(' ')[2][ : -1]
        )
        self.team.region = int(font_tag_text_arr[-1].split(' ')[-1])
        return self

    def get_team_name_info(self) -> None:
        td_tag_text = self.scraper.find('td', {'bgcolor': '#ffffff'}).text
        season_idx = td_tag_text.find(self.team.season)
        
        self.team.name = td_tag_text[ : season_idx - 4]

        b_tag_text = self.scraper.find('b').text
        self.mascot = b_tag_text.replace(self.team.name, '').strip()

        print('TEAM NAME IS:', self.team.name)
        print('TEAM MASCOT IS:', self.team.mascot)

        return self


class ScheduleDataframeBuilder(ABC):
    """
    Responsible for scraping team-specific information. Unlike the
    team builder, the team builder only holds a single pandas DataFrame
    output and not each individual one.

    This is because the td tags for some of the seasons do not hold
    any additional attribute information like class names. To add to
    the complexity, many of the layouts are built using tables, so
    grabbing a list of all td attributes becomes to large to reasonably
    parse individually.
    """

    def __init__(
        self,
        team_schedule_links: List[str],
        scraper: Type[Scraper],
        season: str,
    ) -> None:
        """
        Args:
            team_schedule_links (List[str]): A list of urls that correspond to each team.
            scraper (Type[Scraper]): A Scraper object that uses BeautifulSoup.
            season (str): The season for which the information is applicable for.
        
        Returns:
            None
        """

        self.team_schedule_links = team_schedule_links
        self.scraper = scraper
        self.season = season
        self.df: pd.DataFrame = pd.DataFrame(data = None)

    @abstractmethod
    def read_tables(self, url: str) -> pd.DataFrame:
        """Returns a specific table from a url using pandas."""
    
    @abstractmethod
    def rename_columns(self) -> pd.DataFrame:
        """Renames the columns of a dataframe since the site does not hold column headers."""
    
    @abstractmethod
    def drop_columns(self) -> pd.DataFrame:
        """Drops columns from the dataframe."""
        pass
    
    @abstractmethod
    def rename_columns(self) -> pd.DataFrame:
        """Renames the columns of a dataframe."""
        pass
    
    @abstractmethod
    def add_season(self) -> pd.DataFrame:
        """Adds constant column equal to the value of the current season."""
        pass

    def drop_info_rows(self) -> pd.DataFrame:
        """
        Removes the following rows from the tables:
            - "* - game does not count in OHSAA rankings"
            - "# - Ohio playoff game"
        """

        info_rows_to_drop = [
            '* - game does not count in OHSAA rankings',
            '# - Ohio playoff game',
        ]

        self.df = self.df[~self.df['game_dates'].isin(info_rows_to_drop)]

        return self

    def build(self) -> pd.DataFrame:
        """
        Exports a Pandas DataFrame by manipulating the internal
        dataframe for each of the available team schedule links.
        """

        schedules: List[pd.DataFrame] = []

        for team_schedule_link in self.team_schedule_links:
            self.read_tables(self.scraper.BASE_URL + team_schedule_link) \
                .drop_columns() \
                .rename_columns() \
                .drop_info_rows() \
                .add_season()
            
            schedules.append(self.df)
        
        schedule_dfs = pd.concat(schedules)
        
        return schedule_dfs


class ScheduleDataframeBuilderOne(ScheduleDataframeBuilder):
    """
    Class that defines the methods for scraping schedule information
    for seasons 2002 - 2012.
    """
    
    def read_tables(self, url: str) -> pd.DataFrame:
        dfs = pd.read_html(url)

        self.df = dfs[0]
        return self
    
    def drop_columns(self) -> pd.DataFrame:
        self.df = self.df.drop(columns = [3])
        return self
    
    def rename_columns(self) -> pd.DataFrame:
        self.df = self.df.rename(columns = {
            0: 'game_dates',
            1: 'field',
            2: 'opponent',
            4: 'result',
            5: 'score',
            6: 'game_info'
        })
        return self
    
    def add_season(self) -> pd.DataFrame:
        self.df['season'] = self.season
        return self


class ScheduleDataframeBuilderTwo(ScheduleDataframeBuilder):
    # Works for seasons 2002 - 2012
    def __init__(
        self,
        team_schedule_links: List[str],
        scraper: Type[Scraper],
        season: str,
    ) -> None:
        self.team_schedule_links = team_schedule_links
        self.scraper = scraper
        self.season = season
        self.df: pd.DataFrame = pd.DataFrame(data = None)
    
    def read_tables(self, url: str) -> pd.DataFrame:
        dfs = pd.read_html(url)

        self.df = dfs[4]
        return self
    
    def drop_columns(self) -> pd.DataFrame:
        self.df = self.df.drop(columns = [3])
        return self
    
    def rename_columns(self) -> pd.DataFrame:
        self.df = self.df.rename(columns = {
            0: 'game_dates',
            1: 'field',
            2: 'opponent',
            4: 'result',
            5: 'score',
            6: 'game_info'
        })
        return self
    
    def add_season(self) -> pd.DataFrame:
        self.df['season'] = self.season
        return self


class DataframeBuilderFactory(ABC):
    """
    Abstract class that returns the appropriate builders for a particular season.
    """

    @abstractmethod
    def get_team_dataframe_builder(self) -> TeamDataframeBuilder:
        pass

    @abstractmethod
    def get_schedule_dataframe_builder(self) -> ScheduleDataframeBuilder:
        pass


class DataframeBuilderOne(DataframeBuilderFactory):
    """Factory that returns the appropriate builders for seasons 2000, 2001 and 2013-2023"""

    def __init__(
        self,
        team_schedule_links: List[str],
        scraper: Type[Scraper],
        season: str,
    ) -> None:
        """
        Args:
            team_schedule_links (List[str]): A list of urls that correspond to each team.
            scraper (Type[Scraper]): A Scraper object that uses BeautifulSoup.
            season (str): The season for which the information is applicable for.
        
        Returns:
            None
        """

        self.team_schedule_links = team_schedule_links
        self.scraper = scraper
        self.season = season
        self.team = Team(season = int(season))
        self.df: pd.DataFrame = pd.DataFrame(data = None)

    def get_team_dataframe_builder(self) -> TeamDataframeBuilder:
        return NonTableTeamDataframeBuilder(
            self.team_schedule_links,
            self.scraper,
            self.season,
        )
    
    def get_schedule_dataframe_builder(self) -> ScheduleDataframeBuilder:
        return ScheduleDataframeBuilderOne(
            self.team_schedule_links,
            self.scraper,
            self.season,
        )
    

class DataframeBuilderTwo(DataframeBuilderFactory):
    """Factory that returns the appropriate builders for seasons 2002-2012"""

    def __init__(
        self,
        team_schedule_links: List[str],
        scraper: Type[Scraper],
        season: str,
    ) -> None:
        """
        Args:
            team_schedule_links (List[str]): A list of urls that correspond to each team.
            scraper (Type[Scraper]): A Scraper object that uses BeautifulSoup.
            season (str): The season for which the information is applicable for.
        
        Returns:
            None
        """

        self.team_schedule_links = team_schedule_links
        self.scraper = scraper
        self.season = season
        self.team = Team(season = int(season))
        self.df: pd.DataFrame = pd.DataFrame(data = None)

    def get_team_dataframe_builder(self) -> TeamDataframeBuilder:
        return TableTeamDataframeBuilder(
            self.team_schedule_links,
            self.scraper,
            self.season,
        )
    
    def get_schedule_dataframe_builder(self) -> ScheduleDataframeBuilder:
        return ScheduleDataframeBuilderTwo(
            self.team_schedule_links,
            self.scraper,
            self.season,
        )


def read_dataframe_builder_factory(
    season: str,
    team_schedule_links: List[str],
    scraper: Type[Scraper],
) -> DataframeBuilderFactory:
    """Constructs the appropriate dataframe builder based on the given season."""

    season_variants = [
        '2000',
        '2001',
        '2013',
        '2013',
        '2014',
        '2015',
        '2016',
        '2017',
        '2018',
        '2019',
        '2020',
        '2021',
        '2022',
        '2023',
    ]

    if season in season_variants:
        return DataframeBuilderOne(
            team_schedule_links,
            scraper,
            season,
        )
    else:
        return DataframeBuilderTwo(
            team_schedule_links,
            scraper,
            season,
        )


def export_dataframes(dataframe_builder_factory: DataframeBuilderFactory, season: str):
    team_dataframe_builder = dataframe_builder_factory.get_team_dataframe_builder()
    schedule_dataframe_builder = dataframe_builder_factory.get_schedule_dataframe_builder()

    teams_df = team_dataframe_builder.build()
    schedules_df = schedule_dataframe_builder.build()

    # Put this into it's own function
    data_dir = make_output_dir()

    teams_df.to_csv(data_dir + f'/teams_{season}.csv', index = False)
    schedules_df.to_csv(data_dir + f'/schedules_{season}.csv', index = False)

def scrape_and_build_dataframes(
    season: str,
    team_schedule_links: List[str],
    scraper: Type[Scraper],
):
    dataframe_builder_factory = read_dataframe_builder_factory(season, team_schedule_links, scraper)
    export_dataframes(dataframe_builder_factory, season)
