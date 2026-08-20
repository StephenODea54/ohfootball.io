.PHONY: test vet

test:
	PYTHONPATH=src python3 -m unittest discover -s tests -v

vet:
	PYTHONPATH=src python3 -m compileall -q src tests
