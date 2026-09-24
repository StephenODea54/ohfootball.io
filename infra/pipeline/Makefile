# The weekly run.
#
# Every target here runs inside the pipeline image, which holds the scraper, dbt, the rating
# package, the dataset package and a PostgreSQL client. The image is copied this file as its
# Makefile, so a scheduled job runs `make rate` and nothing else.
#
# Each target runs on its own. A run that stops part way is finished by calling the targets that
# did not run, in the order below.
#
# Run one of these on a workstation with:
#   make pipeline ARGS=rate

.PHONY: pipeline scrape transform rate publish-site publish-dataset backfill

# The order matters. The transform reads what the scrape collected, the rating reads the marts the
# transform built, and the site is drawn from the API after the ratings land.
#
# The dataset is published last. Nothing else in the run reads it, so a refusal by Kaggle costs
# the publication of the dataset and not the publication of the site.
pipeline:
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) scrape
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) transform
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) rate
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) publish-site
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) publish-dataset

# Collects the games the season has added. The season is named by SCRAPER_SEASON, which has to be
# set to the year of the season in progress. It does not follow the calendar on its own.
scrape:
	joe-eitel

# Rebuilds staging, intermediate and the marts from everything collected so far.
transform:
	cd $(ANALYTICS_DIR) && dbt build

# Rates every team and writes a prediction for every game. This reads the marts and writes to
# them, and it rewrites the rating of every season on each run, so a change to the rating settings
# reaches the whole record.
rate:
	ohfootball-elo publish

# Asks the host to build the site again.
#
# The site is drawn ahead of time and reads the API while it is built, so a new rating reaches a
# visitor only after the site is built again. The address is the deploy webhook of the site
# application.
#
# The webhook answers as soon as the request is accepted. It does not wait for the build, so this
# target reports that the build was asked for and not that the build worked. The log of the site
# application holds the result.
publish-site:
	@test -n "$(SITE_DEPLOY_WEBHOOK)" || { \
		echo "SITE_DEPLOY_WEBHOOK is required. It is the deploy webhook of the site." >&2; \
		exit 1; \
	}
	@status=$$(curl --silent --show-error --location --max-time 30 \
		--output /dev/null --write-out '%{http_code}' \
		--request POST "$(SITE_DEPLOY_WEBHOOK)") || { \
		echo "the request to build the site did not reach the host" >&2; \
		exit 1; \
	}; \
	case "$$status" in \
	2??) echo "the site build was asked for and the host answered $$status" ;; \
	*) echo "the host refused the request to build the site and answered $$status" >&2; exit 1 ;; \
	esac

# Writes the marts as files and sends them to Kaggle as one new version.
publish-dataset:
	ohfootball-dataset publish

# Reads the record of the seasons before the site the weekly scrape reads. This is not part of the
# weekly run. It is called by hand when the record has to be built again.
backfill:
	ohhsfbdb

# Where the dbt project is. The image holds it at this path, and a run on a workstation names its
# own.
ANALYTICS_DIR ?= /app/analytics
