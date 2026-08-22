#!/bin/bash
# ds-wifi AP control — corre como root via systemd (ds-wifi-ap.service)
set -e

BASE=/opt/ds-wifi
ENV_FILE="$BASE/config/generated/net.env"
RUN=/run/ds-wifi
PID_H="$RUN/hostapd.pid"
LOG="$BASE/logs/ap.log"
CONF_H="$BASE/config/generated/hostapd.conf"
CONF_D="$BASE/config/generated/dnsmasq.conf"

log() {
  local m="$(date '+%Y-%m-%d %H:%M:%S') - $1"
  echo "$m" >> "$LOG"
  echo "$m"
}

setup_isolation() {
  iptables -D FORWARD -j DSWIFI-FWD 2>/dev/null || true
  iptables -F DSWIFI-FWD 2>/dev/null || true
  iptables -X DSWIFI-FWD 2>/dev/null || true

  if [ "$ISOLATION" = "1" ]; then
    iptables -N DSWIFI-FWD
    iptables -A DSWIFI-FWD -i "$WIFI_IF" -o "$LAN_IF" -d 10.0.0.0/8 -j DROP
    iptables -A DSWIFI-FWD -i "$WIFI_IF" -o "$LAN_IF" -d 172.16.0.0/12 -j DROP
    iptables -A DSWIFI-FWD -i "$WIFI_IF" -o "$LAN_IF" -d 192.168.0.0/16 -j DROP
    iptables -A DSWIFI-FWD -i "$WIFI_IF" -o "$LAN_IF" -d 100.64.0.0/10 -j DROP
    iptables -A DSWIFI-FWD -i "$WIFI_IF" -o "$LAN_IF" -d 169.254.0.0/16 -j DROP
    iptables -I FORWARD 1 -j DSWIFI-FWD
    log "Aislamiento guest ACTIVADO"
  else
    log "Aislamiento guest DESACTIVADO"
  fi
}

teardown_isolation() {
  iptables -D FORWARD -j DSWIFI-FWD 2>/dev/null || true
  iptables -F DSWIFI-FWD 2>/dev/null || true
  iptables -X DSWIFI-FWD 2>/dev/null || true
}

start() {
  [ -f "$ENV_FILE" ] || { echo "net.env no existe; generá la config desde la UI web"; exit 1; }
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  mkdir -p "$RUN"
  mkdir -p "$(dirname "$LOG")"

  # 1. Interfaz arriba + IP estática
  ip link set "$WIFI_IF" up
  ip addr flush dev "$WIFI_IF" 2>/dev/null || true
  ip addr add "$AP_IP/$AP_PREFIX" dev "$WIFI_IF"

  # 2. IP forwarding
  sysctl -w net.ipv4.ip_forward=1 >/dev/null

  # 3. NAT (idempotente)
  iptables -t nat -C POSTROUTING -s "$AP_NETWORK" ! -d "$AP_NETWORK" -j MASQUERADE 2>/dev/null || \
    iptables -t nat -A POSTROUTING -s "$AP_NETWORK" ! -d "$AP_NETWORK" -j MASQUERADE

  # 4. Aislamiento
  setup_isolation

  # 5. hostapd + dnsmasq
  log "Iniciando hostapd y dnsmasq en $WIFI_IF"
  hostapd -B -t -f "$LOG" -P "$PID_H" "$CONF_H"
  dnsmasq -C "$CONF_D"

  log "AP iniciado ($WIFI_IF, subred $AP_NETWORK, aislamiento=$ISOLATION)"
}

stop() {
  # shellcheck disable=SC1090
  [ -f "$ENV_FILE" ] && source "$ENV_FILE" || { WIFI_IF=${WIFI_IF:-wlp2s0}; }

  [ -f "$PID_H" ] && kill "$(cat "$PID_H")" 2>/dev/null || true
  pkill -f "dnsmasq.*ds-wifi" 2>/dev/null || true
  sleep 1

  teardown_isolation
  iptables -t nat -D POSTROUTING -s "$AP_NETWORK" ! -d "$AP_NETWORK" -j MASQUERADE 2>/dev/null || true

  ip addr flush dev "$WIFI_IF" 2>/dev/null || true
  ip link set "$WIFI_IF" down 2>/dev/null || true

  rm -f "$PID_H"
  log "AP detenido ($WIFI_IF)"
}

status() {
  if [ -f "$PID_H" ] && kill -0 "$(cat "$PID_H")" 2>/dev/null; then
    echo "running"
  else
    echo "stopped"
  fi
}

case "$1" in
  start) start ;;
  stop) stop ;;
  restart) stop || true; start ;;
  status) status ;;
  *) echo "Uso: $0 {start|stop|restart|status}"; exit 1 ;;
esac
