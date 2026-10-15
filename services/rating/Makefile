.PHONY: coverage test vet

# numpy is the one package that the tests import. By default uv runs the tests in a cached
# environment that holds it, so the system Python needs no package. CI installs numpy with pip
# and sets PYTHON to its own interpreter on the command line. A PYTHON variable of the shell does
# not change it. Keep the version range the same as in pyproject.toml.
NUMPY := numpy>=2.1,<3
PYTHON := uv run --quiet --no-project --python 3.12 --with "$(NUMPY)" python

test:
	PYTHONPATH=src $(PYTHON) -m unittest discover -s tests -v

vet:
	PYTHONPATH=src python3 -m compileall -q src tests

# This target measures line and branch coverage. It runs coverage.py through uv, so the package
# gets no new dependency. The functions that need a database have no tests yet. The target
# reports the result and does not fail.
coverage:
	PYTHONPATH=src uv run --quiet --no-project --python 3.12 --with coverage --with "$(NUMPY)" coverage run --branch --source=src/ohfootball_rating -m unittest discover -s tests
	uv run --quiet --no-project --python 3.12 --with coverage coverage report -m
