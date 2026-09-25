# Makes the output of the build ready for Cloudflare Pages.
#
# The site workflow in .github/workflows/site.yml runs `pnpm build` and then `make pages`, and
# sends what is in OUTPUT to Pages. A check that fails here stops the workflow before the upload,
# and Pages keeps the site it served before.

.PHONY: pages

# The directory the build writes the site to.
OUTPUT ?= .output/public

# Pages serves an address from the file of the same name with .html added. It serves a directory
# only when the address ends with a slash, and it sends every other form of the address to the
# served one with a 308. The router removes the slash at the end of an address, so each page has
# to be a file such as leaderboard.html and not leaderboard/index.html. autoSubfolderIndex in
# vite.config.ts sets which of the two the build writes.
#
# Pages answers an address that has no file with the nearest 404.html and the status 404. The site
# answers such an address with the application, and the application draws the page from the API.
# A team that did not play the current season is reached this way. So 404.html at the root is a
# copy of the home page.
#
# A missing file under assets/ is a missing script or stylesheet and not a page. The application
# in its place would only fail later, so assets/404.html is plain text.
pages:
	@test -f "$(OUTPUT)/index.html" || { \
		echo "the build wrote no pages to $(OUTPUT)" >&2; \
		echo "check the prerender settings in vite.config.ts" >&2; \
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
	@nested=$$(find "$(OUTPUT)" -mindepth 2 -name index.html); \
	if [ -n "$$nested" ]; then \
		echo "these pages are directories, so Pages would redirect each of them:" >&2; \
		echo "$$nested" >&2; \
		echo "set autoSubfolderIndex to false in vite.config.ts" >&2; \
		exit 1; \
	fi
	@pages=$$(find "$(OUTPUT)" -name '*.html' ! -name 404.html | wc -l | tr -d ' '); \
	cp "$(OUTPUT)/index.html" "$(OUTPUT)/404.html" && \
	printf 'Not found\n' > "$(OUTPUT)/assets/404.html" && \
	echo "$(OUTPUT) holds $$pages pages and is ready for Pages"
