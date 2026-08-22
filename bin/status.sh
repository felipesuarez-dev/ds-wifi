#!/usr/bin/env python3
"""Snapshot de estado del AP ds-wifi. Corre como root (vía sudo). Emite JSON."""
import json
import subprocess
import os
import time

BASE = "/opt/ds-wifi"
ENV_FILE = os.path.join(BASE, "config", "generated", "net.env")
PID_H = "/run/ds-wifi/hostapd.pid"
LEASES = os.path.join(BASE, "config", "leases")

WIFI_IF = "wlp2s0"
AP_NETWORK = ""

if os.path.isfile(ENV_FILE):
    for line in open(ENV_FILE):
        line = line.strip()
        if line.startswith("WIFI_IF="):
            WIFI_IF = line.split("=", 1)[1]
        elif line.startswith("AP_NETWORK="):
            AP_NETWORK = line.split("=", 1)[1]


def active():
    if os.path.isfile(PID_H):
        try:
            pid = int(open(PID_H).read().strip())
            os.kill(pid, 0)
            return True
        except (ValueError, ProcessLookupError, FileNotFoundError):
            return False
    return False


def leases():
    """Lease DHCP -> {mac: {ip, host}}. Fuente principal de 'clientes conectados'."""
    out = {}
    if os.path.isfile(LEASES):
        for line in open(LEASES):
            parts = line.split()
            if len(parts) >= 5:
                out[parts[1].lower()] = {"ip": parts[2], "host": parts[3]}
    return out


def stations():
    """Station dump -> {mac: {signal, connected}}. Solo para enriquecer con señal."""
    res = {}
    try:
        raw = subprocess.run(["iw", "dev", WIFI_IF, "station", "dump"],
                             capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return res
    cur = None
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("Station "):
            mac = line.split()[1].lower()
            cur = {"mac": mac, "signal": None, "connected": None}
            res[mac] = cur
        elif cur is not None:
            if line.startswith("signal:"):
                cur["signal"] = line.split(":")[1].strip().split()[0]
            elif line.startswith("connected time:"):
                cur["connected"] = line.split(":")[1].strip()
    return res


def main():
    running = active()
    lease_map = leases()
    sta_map = stations()

    all_macs = sorted(set(list(lease_map.keys()) + list(sta_map.keys())))
    clients = []
    for mac in all_macs:
        l = lease_map.get(mac, {})
        s = sta_map.get(mac, {})
        clients.append({
            "mac": mac,
            "ip": l.get("ip"),
            "host": l.get("host"),
            "signal": s.get("signal"),
            "connected": s.get("connected"),
        })

    print(json.dumps({
        "active": running,
        "interface": WIFI_IF,
        "network": AP_NETWORK,
        "clients": clients,
        "ts": int(time.time()),
    }))


if __name__ == "__main__":
    main()
