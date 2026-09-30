# The weekly run.
#
# Every target here runs inside the pipeline image, which holds the scraper, dbt, the rating
# package, the dataset package, the recruiting package and a PostgreSQL client. The image is copied
# this file as its Makefile, so a scheduled job runs `make rate` and nothing else.
#
# Each target runs on its own. A run that stops part way is finished by calling the targets that
# did not run, in the order below.
#
# Run one of these on a workstation with:
#   make pipeline ARGS=rate

.PHONY: pipeline snapshot-recruits scrape transform rate publish-site publish-download \
	publish-dataset backfill

# The order matters. The recruiting snapshot goes first, because it needs nothing else in the run
# and it must be stored before the games of the week, however long the scrape takes. The run stops
# when the snapshot fails, the same as when any other source fails. The transform reads what the
# scrape collected, the rating reads the marts the transform built, and the site is drawn from the
# API after the ratings land.
#
# The download and the dataset are published last. Nothing else in the run reads them, so a
# refusal by R2 or by Kaggle costs that publication and not the publication of the site. The
# download goes first, because its upload is short and nothing is sent after it that can be
# refused. The Kaggle publication can wait for 10 minutes and can fail after its upload.
pipeline:
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) snapshot-recruits
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) scrape
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) transform
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) rate
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) publish-site
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) publish-download
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) publish-dataset

# Stores the recruiting classes that are still in high school, with one call to CollegeFootballData
# for each class. The command reads the key from CFBD_API_KEY in the environment, so the key is not
# part of a command line. The free key allows 1,000 calls a month, and this target makes three a
# week. The terms of CollegeFootballData do not allow the records to be published, so they go in a
# private schema that nothing publishes. The rating does not read them. See
# services/recruiting/README.md.
snapshot-recruits:
	ohfootball-recruiting snapshot

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
	ohfootball-rating publish

# Asks GitHub to build the site again and publish it.
#
# The site is drawn ahead of time and reads the API while it is built, so a new rating reaches a
# visitor only after the site is built again. The build runs in GitHub Actions. It is the workflow
# SITE_WORKFLOW of the repository SITE_REPOSITORY, and it publishes the site to Cloudflare Pages.
# This target starts that workflow on the branch SITE_BRANCH.
#
# SITE_WORKFLOW_TOKEN is a fine-grained personal access token. It holds this one repository and
# the permission to read and write Actions, and nothing else. The shell reads it from the
# environment and gives it to curl on standard input. It is therefore not part of a command line,
# and make does not print it in the commands it runs.
#
# GitHub answers as soon as it accepts the request. It does not wait for the build, so this target
# reports that the build was asked for and not that the build worked. The run of the workflow in
# the Actions tab of the repository holds the result.
publish-site:
	@test -n "$${SITE_WORKFLOW_TOKEN:-}" || { \
		echo "SITE_WORKFLOW_TOKEN is required. It is the token that starts the site workflow." >&2; \
		exit 1; \
	}
	@status=$$(printf 'Authorization: Bearer %s\n' "$$SITE_WORKFLOW_TOKEN" | \
		curl --silent --show-error --max-time 30 \
		--output /dev/null --write-out '%{http_code}' \
		--header @- \
		--header 'Accept: application/vnd.github+json' \
		--header 'X-GitHub-Api-Version: $(GITHUB_API_VERSION)' \
		--header 'Content-Type: application/json' \
		--data '{"ref":"$(SITE_BRANCH)"}' \
		--request POST \
		"$(GITHUB_API_URL)/repos/$(SITE_REPOSITORY)/actions/workflows/$(SITE_WORKFLOW)/dispatches") || { \
		echo "the request to build the site did not reach GitHub" >&2; \
		exit 1; \
	}; \
	case "$$status" in \
	2??) echo "GitHub accepted the request to build the site and answered $$status" ;; \
	401) echo "GitHub refused the token and answered 401. The token is wrong or has expired." >&2; exit 1 ;; \
	403|404) echo "GitHub answered $$status. The token cannot start $(SITE_WORKFLOW) in $(SITE_REPOSITORY), or the workflow does not exist." >&2; exit 1 ;; \
	422) echo "GitHub answered 422. The workflow has no workflow_dispatch trigger, or the branch $(SITE_BRANCH) does not exist." >&2; exit 1 ;; \
	*) echo "GitHub refused the request to build the site and answered $$status" >&2; exit 1 ;; \
	esac

# Writes the marts as files, zips them, and sends the zip to the R2 bucket that data.ohfootball.io
# serves. The zip goes under the date of the run and under latest/. See services/dataset/README.md.
publish-download:
	ohfootball-dataset publish-download

# Writes the marts as files and sends them to Kaggle as one new version.
publish-dataset:
	ohfootball-dataset publish

# Reads the record of the seasons before the site the weekly scrape reads. This is not part of the
# weekly run. It is called by hand when the record has to be built again.
backfill:
	ohhsfbdb

# The repository, the workflow and the branch that publish-site starts. The workflow is named by
# its file name.
SITE_REPOSITORY ?= StephenODea54/ohfootball.io
SITE_WORKFLOW ?= site.yml
SITE_BRANCH ?= main

# The REST API of GitHub and the version of it that publish-site asks for. The tests point the
# address at a server on the loopback address.
GITHUB_API_URL ?= https://api.github.com
GITHUB_API_VERSION ?= 2026-03-10

# Where the dbt project is. The image holds it at this path, and a run on a workstation names its
# own.
ANALYTICS_DIR ?= /app/analytics
