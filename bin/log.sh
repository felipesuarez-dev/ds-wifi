#!/bin/bash
# ds-wifi log reader — corre como root (vía sudo). Emite las últimas N líneas del log del AP.
N="${1:-200}"
LOG=/opt/ds-wifi/logs/ap.log

if [ -f "$LOG" ]; then
  tail -n "$N" "$LOG"
else
  echo "(sin log todavía)"
fi
