.PHONY: coverage test vet

test:
	PYTHONPATH=src python3 -m unittest discover -s tests -v

vet:
	PYTHONPATH=src python3 -m compileall -q src tests

# This target measures line and branch coverage. It runs coverage.py through uvx, so the
# package gets no new dependency. The functions that need a database or a tracking server
# have no tests yet. The target reports the result and does not fail.
coverage:
	PYTHONPATH=src uvx --python 3.12 --from coverage coverage run --branch --source=src/ohfootball_elo -m unittest discover -s tests
	uvx --python 3.12 --from coverage coverage report -m
