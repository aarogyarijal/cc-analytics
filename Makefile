VENV := .venv
PYTHON := $(VENV)/bin/python
UVICORN := $(VENV)/bin/uvicorn

.PHONY: dev backend frontend install setup-shell

# Start both backend and frontend
dev: $(VENV)
	@trap 'kill %1 %2 2>/dev/null; exit' INT; \
	PYTHONPATH=backend $(UVICORN) backend.main:app --host 0.0.0.0 --port 6767 --reload & \
	cd frontend && npm run dev & \
	wait

backend: $(VENV)
	PYTHONPATH=backend $(UVICORN) backend.main:app --host 0.0.0.0 --port 6767 --reload

frontend:
	cd frontend && npm run dev

$(VENV):
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -r backend/requirements.txt -q

install: $(VENV)
	@echo "Backend dependencies installed in .venv"
	cd frontend && npm install
	@echo "Frontend dependencies installed"

# Append OTel env vars to ~/.zshrc (idempotent)
setup-shell:
	@if grep -q "CLAUDE_CODE_ENABLE_TELEMETRY" ~/.zshrc 2>/dev/null; then \
		echo "OTel env vars already present in ~/.zshrc"; \
	else \
		echo "" >> ~/.zshrc; \
		echo "# Claude Code analytics (cc-analytics)" >> ~/.zshrc; \
		echo "export CLAUDE_CODE_ENABLE_TELEMETRY=1" >> ~/.zshrc; \
		echo "export OTEL_METRICS_EXPORTER=otlp" >> ~/.zshrc; \
		echo "export OTEL_LOGS_EXPORTER=otlp" >> ~/.zshrc; \
		echo "export OTEL_EXPORTER_OTLP_PROTOCOL=http/json" >> ~/.zshrc; \
		echo "export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:6767" >> ~/.zshrc; \
		echo "export OTEL_METRIC_EXPORT_INTERVAL=15000" >> ~/.zshrc; \
		echo "export OTEL_LOGS_EXPORT_INTERVAL=5000" >> ~/.zshrc; \
		echo "export OTEL_LOG_TOOL_DETAILS=1" >> ~/.zshrc; \
		echo "✓ OTel env vars added to ~/.zshrc"; \
		echo "  Run: source ~/.zshrc"; \
	fi
