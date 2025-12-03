.PHONY: dev prod test-dev-cache test-index start stop watch-ui

dev:
	SPARKQ_ENV=dev ./sparkq.sh run --foreground

prod:
	SPARKQ_ENV=prod ./sparkq.sh run --foreground

test-dev-cache:
	SPARKQ_ENV=dev pytest sparkq/tests/unit/test_dev_caching.py

start:
	./sparkq.sh start

stop:
	./sparkq.sh stop

test-index:
	python3 tools/test_index.py --fail-on-missing

watch-ui:
	npm run watch:ui
