"""
Helpers for parsing OTLP HTTP/JSON payloads.

OTel sends:
  POST /v1/metrics  →  {"resourceMetrics": [...]}
  POST /v1/logs     →  {"resourceLogs": [...]}

Attribute values are wrapped: {"stringValue": "..."} | {"doubleValue": 1.0} | {"intValue": "42"} | {"boolValue": true}
"""

from __future__ import annotations
from typing import Any


def unwrap_value(v: dict) -> Any:
    """Turn {'stringValue': 'foo'} → 'foo', etc."""
    if "stringValue" in v:
        return v["stringValue"]
    if "doubleValue" in v:
        return v["doubleValue"]
    if "intValue" in v:
        return int(v["intValue"])
    if "boolValue" in v:
        return v["boolValue"]
    if "arrayValue" in v:
        return [unwrap_value(i) for i in v["arrayValue"].get("values", [])]
    if "kvlistValue" in v:
        return flatten_attrs(v["kvlistValue"].get("values", []))
    return None


def flatten_attrs(attrs: list[dict]) -> dict:
    """[{"key": "model", "value": {"stringValue": "claude-sonnet-4-6"}}] → {"model": "claude-sonnet-4-6"}"""
    return {a["key"]: unwrap_value(a["value"]) for a in attrs if "key" in a and "value" in a}


def parse_metrics(body: dict) -> list[dict]:
    """
    Returns a list of:
      {"name": str, "value": float, "labels": dict, "ts_ms": int}
    """
    results = []
    for resource_metrics in body.get("resourceMetrics", []):
        resource_attrs = flatten_attrs(resource_metrics.get("resource", {}).get("attributes", []))
        for scope_metrics in resource_metrics.get("scopeMetrics", []):
            for metric in scope_metrics.get("metrics", []):
                name = metric.get("name", "")
                # Handle Sum (counters) and Gauge
                for kind in ("sum", "gauge"):
                    container = metric.get(kind)
                    if not container:
                        continue
                    for dp in container.get("dataPoints", []):
                        labels = flatten_attrs(dp.get("attributes", []))
                        # Merge resource attrs that are useful as labels (model, session.id, etc.)
                        for k in ("session.id", "user.id", "terminal.type", "app.version"):
                            if k in resource_attrs:
                                labels.setdefault(k, resource_attrs[k])

                        value = dp.get("asDouble") or dp.get("asInt") or 0
                        # timeUnixNano is a string in JSON ("1234567890123456789")
                        ts_nano = dp.get("timeUnixNano", "0")
                        ts_ms = int(ts_nano) // 1_000_000 if ts_nano else None
                        results.append({
                            "name": name,
                            "value": float(value),
                            "labels": labels,
                            "ts_ms": ts_ms or None,
                        })
    return results


def parse_logs(body: dict) -> list[dict]:
    """
    Returns a list of:
      {"event_name": str, "attrs": dict, "ts_ms": int}
    """
    results = []
    for resource_logs in body.get("resourceLogs", []):
        resource_attrs = flatten_attrs(resource_logs.get("resource", {}).get("attributes", []))
        for scope_logs in resource_logs.get("scopeLogs", []):
            for record in scope_logs.get("logRecords", []):
                attrs = flatten_attrs(record.get("attributes", []))
                # Merge relevant resource attrs
                for k in ("session.id", "user.id", "user.email", "terminal.type", "app.version",
                          "organization.id", "user.account_uuid"):
                    if k in resource_attrs:
                        attrs.setdefault(k, resource_attrs[k])

                event_name = attrs.get("event.name", "unknown")
                ts_nano = record.get("timeUnixNano", "0")
                ts_ms = int(ts_nano) // 1_000_000 if ts_nano else None
                results.append({
                    "event_name": event_name,
                    "attrs": attrs,
                    "ts_ms": ts_ms or None,
                })
    return results
