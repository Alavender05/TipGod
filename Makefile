PYTHON ?= python
START ?=
END ?=

.PHONY: install fetch parse report test

install:
	$(PYTHON) -m pip install -U pip
	$(PYTHON) -m pip install -e .

fetch:
	$(PYTHON) build_yahoo_nba_fetch.py --start $(START) --end $(if $(END),$(END),$(START))

parse:
	$(PYTHON) build_yahoo_nba_longform.py

report:
	$(PYTHON) build_yahoo_nba_report.py

test:
	$(PYTHON) -m unittest discover -s tests -p 'test_*.py'
	$(PYTHON) -m unittest discover -s python_tests -p 'test_*.py'
