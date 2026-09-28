# Makes the output of the build ready for Cloudflare Pages.
#
# The site workflow in .github/workflows/site.yml runs `pnpm build` and then `make pages`, and
# sends what is in OUTPUT to Pages. A check that fails here stops the workflow before the upload,
# and Pages keeps the site it served before.

.PHONY: pages

# The directory the build writes the site to.
OUTPUT ?= dist

# Pages serves an address from the file of the same name with .html added. It serves a directory
# only when the address ends with a slash, and it sends every other form of the address to the
# served one with a 308. So each page has to be a file such as leaderboard.html and not
# leaderboard/index.html. build.format in astro.config.ts sets which of the two the build writes.
#
# Pages answers an address that has no file with the nearest 404.html and the status 404. The
# build writes 404.html at the root from src/pages/404.astro. It is a real not-found page and not
# a copy of the home page. A team that did not play the current season has no page, so its
# address gets this page too.
#
# A missing file under assets/ is a missing script or stylesheet and not a page, so
# assets/404.html is plain text.
#
# Every page is drawn while the site is built, and the browser never calls the API. So no file of
# the output may name the API. When GRAPHQL_API_KEY is set, no file may hold the key either. The
# check prints only the names of such files and never the key. A key shorter than 16 characters
# is refused, because it is weak and the search for it could match text that is not the key.
pages:
	@test -f "$(OUTPUT)/index.html" || { \
		echo "the build wrote no pages to $(OUTPUT)" >&2; \
		echo "check the output settings in astro.config.ts" >&2; \
		exit 1; \
	}
	@test -d "$(OUTPUT)/assets" || { \
		echo "the build wrote no assets to $(OUTPUT)/assets" >&2; \
		exit 1; \
	}
	@test -f "$(OUTPUT)/_headers" || { \
		echo "$(OUTPUT)/_headers is missing. The build copies it from public/_headers." >&2; \
		exit 1; \
	}
	@test -f "$(OUTPUT)/404.html" || { \
		echo "the build wrote no 404.html. src/pages/404.astro writes it." >&2; \
		exit 1; \
	}
	@if cmp -s "$(OUTPUT)/index.html" "$(OUTPUT)/404.html"; then \
		echo "404.html is a copy of the home page. src/pages/404.astro writes the real page." >&2; \
		exit 1; \
	fi
	@nested=$$(find "$(OUTPUT)" -mindepth 2 -name index.html); \
	if [ -n "$$nested" ]; then \
		echo "these pages are directories, so Pages would redirect each of them:" >&2; \
		echo "$$nested" >&2; \
		echo "set build.format to 'file' in astro.config.ts" >&2; \
		exit 1; \
	fi
	@named=$$(grep -rlIiF -e 'api.ohfootball.io' -e graphql "$(OUTPUT)"); \
	if [ -n "$$named" ]; then \
		echo "these files name the API, and a browser must not call it:" >&2; \
		echo "$$named" >&2; \
		exit 1; \
	fi
	@if [ -n "$$GRAPHQL_API_KEY" ] && [ $${#GRAPHQL_API_KEY} -lt 16 ]; then \
		echo "GRAPHQL_API_KEY is shorter than 16 characters. Set a longer key." >&2; \
		exit 1; \
	fi
	@if [ -n "$$GRAPHQL_API_KEY" ]; then \
		held=$$(grep -rlF -e "$$GRAPHQL_API_KEY" "$(OUTPUT)"); \
		if [ -n "$$held" ]; then \
			echo "these files hold the API key:" >&2; \
			echo "$$held" >&2; \
			exit 1; \
		fi; \
	fi
	@pages=$$(find "$(OUTPUT)" -name '*.html' ! -name 404.html | wc -l | tr -d ' '); \
	printf 'Not found\n' > "$(OUTPUT)/assets/404.html" && \
	echo "$(OUTPUT) holds $$pages pages and is ready for Pages"
