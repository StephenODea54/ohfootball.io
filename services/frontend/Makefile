# Makes the output of the build ready for Cloudflare Pages.
#
# The site workflow in .github/workflows/site.yml runs `pnpm build` and then `make pages`, and
# sends what is in OUTPUT to Pages. A check that fails here stops the workflow before the upload,
# and Pages keeps the site it served before.

.PHONY: pages

# The directory the build writes the site to.
OUTPUT ?= dist

# The page that tells callers how to use the API. It is the only file that may name the API.
API_DOCS_PAGE ?= api.html

# The sitemap index that the build writes. robots.txt names it.
SITEMAP ?= sitemap-index.xml

# What _routes.json must hold, with all white space removed.
ROUTES := {"version":1,"include":["/picks/*"],"exclude":[]}

# The address of the site, as site in astro.config.ts sets it. The sitemap may list only addresses
# that start with it.
SITE_ADDRESS ?= https://ohfootball.io/

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
# The build copies robots.txt from public/, and the sitemap integration in astro.config.ts writes
# the sitemap. robots.txt must name the sitemap index on SITE_ADDRESS. Each file that the index
# lists must be on SITE_ADDRESS and in the output. The sitemap may list only addresses that Pages
# serves as written, on SITE_ADDRESS. So no address may end in .html or in a slash, except the home
# page, and none may be 404. Each other address must have a page file of the same name with .html
# added. Each page except the not-found page must be listed, so a sitemap that lost pages fails.
# The check removes all white space before it reads an address, so an address split over lines is
# still read. It does not decode an address, so a page whose name must be encoded, such as one
# with a space, fails the check. Each case pattern starts with a parenthesis, because the sh of
# macOS cannot read a case inside $( ) without one.
#
# Pages runs the picks Function in functions/ for each address that _routes.json includes, and
# serves every other address from the files. The build copies _routes.json from public/. It must
# send only /picks/* to the Function, so that no page waits for the Function or counts toward its
# limits. The check removes all white space before it compares the file.
#
# Wrangler finds the Function in functions/ next to OUTPUT, and not in OUTPUT. A functions
# directory in OUTPUT would be served as files. A _worker.js in OUTPUT would run for every address
# in place of the Function and the files. So OUTPUT may hold neither.
#
# Every page is drawn while the site is built, and the browser never calls the GraphQL API. So no
# file of the output may name the API except API_DOCS_PAGE, the page that tells people how to call
# it.
# That keeps the name out of every script and stylesheet under assets/ and out of every other page.
# The search looks for the name of the API host and for "graphql", in any case. When GRAPHQL_API_KEY is set, no file of the output may hold the key,
# the API page included. The check prints only the names of such files and never the key. A key
# shorter than 16 characters is refused, because it is weak and the search for it could match text
# that is not the key.
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
	@test -f "$(OUTPUT)/_routes.json" || { \
		echo "$(OUTPUT)/_routes.json is missing. The build copies it from public/_routes.json." >&2; \
		exit 1; \
	}
	@routes=$$(tr -d '[:space:]' < "$(OUTPUT)/_routes.json"); \
	if [ "$$routes" != '$(ROUTES)' ]; then \
		echo "_routes.json must send only /picks/* to the Function" >&2; \
		exit 1; \
	fi
	@if [ -e "$(OUTPUT)/functions" ]; then \
		echo "$(OUTPUT)/functions must not exist. The Function is in functions/ next to $(OUTPUT)." >&2; \
		exit 1; \
	fi
	@if [ -e "$(OUTPUT)/_worker.js" ]; then \
		echo "$(OUTPUT)/_worker.js must not exist. It would replace the Function and the files." >&2; \
		exit 1; \
	fi
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
	@test -f "$(OUTPUT)/robots.txt" || { \
		echo "$(OUTPUT)/robots.txt is missing. The build copies it from public/robots.txt." >&2; \
		exit 1; \
	}
	@test -f "$(OUTPUT)/$(SITEMAP)" || { \
		echo "the build wrote no $(SITEMAP). The sitemap integration in astro.config.ts writes it." >&2; \
		exit 1; \
	}
	@tr -d '\r' < "$(OUTPUT)/robots.txt" | grep -qxF "Sitemap: $(SITE_ADDRESS)$(SITEMAP)" || { \
		echo "robots.txt does not name $(SITE_ADDRESS)$(SITEMAP)" >&2; \
		exit 1; \
	}
	@cd "$(OUTPUT)" || exit 1; \
	locs() { tr -d '[:space:]' < "$$1" | grep -o '<loc>[^<]*</loc>' | \
		sed -e 's#^<loc>##' -e 's#</loc>$$##'; }; \
	files=$$(locs "$(SITEMAP)"); \
	if [ -z "$$files" ]; then \
		echo "$(SITEMAP) lists no file of addresses" >&2; \
		exit 1; \
	fi; \
	names=""; \
	for file in $$files; do \
		case "$$file" in \
			("$(SITE_ADDRESS)"*) name=$${file#"$(SITE_ADDRESS)"} ;; \
			(*) echo "$(SITEMAP) lists $$file, which is not on $(SITE_ADDRESS)" >&2; exit 1 ;; \
		esac; \
		if [ ! -f "$$name" ] || [ ! -r "$$name" ]; then \
			echo "$(SITEMAP) lists $$name, and the build did not write it" >&2; \
			exit 1; \
		fi; \
		names="$$names $$name"; \
	done; \
	addresses=$$(for name in $$names; do locs "$$name"; done); \
	bad=$$(printf '%s\n' "$$addresses" | while IFS= read -r address; do \
		case "$$address" in \
			("" | "$(SITE_ADDRESS)") ;; \
			("$(SITE_ADDRESS)"*) \
				path=$${address#"$(SITE_ADDRESS)"}; \
				case "$$path" in \
					(404 | *.html | */) echo "$$address" ;; \
					(*) test -f "$$path.html" || echo "$$address" ;; \
				esac ;; \
			(*) echo "$$address" ;; \
		esac; \
	done); \
	if [ -n "$$bad" ]; then \
		echo "the sitemap lists these addresses, and Pages does not serve each as written:" >&2; \
		echo "$$bad" >&2; \
		exit 1; \
	fi; \
	missing=$$(find . -name '*.html' ! -path './assets/*' ! -path ./404.html | \
		sed -e 's#^\./##' -e 's#\.html$$##' -e 's#^index$$##' | \
		while IFS= read -r path; do \
			printf '%s\n' "$$addresses" | grep -qxF "$(SITE_ADDRESS)$$path" || echo "$$path.html"; \
		done); \
	if [ -n "$$missing" ]; then \
		echo "the sitemap does not list these pages:" >&2; \
		echo "$$missing" >&2; \
		exit 1; \
	fi
	@named=$$(cd "$(OUTPUT)" && grep -rlIiF -e 'api.ohfootball.io' -e graphql . | \
		grep -vxF "./$(API_DOCS_PAGE)"); \
	if [ -n "$$named" ]; then \
		echo "these files name the API, and only $(API_DOCS_PAGE) may:" >&2; \
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
