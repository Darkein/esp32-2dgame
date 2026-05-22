#!/usr/bin/env bash
# Génère le code FlatBuffers (TS pour serveur+web, C++ pour ESP32) depuis le schéma.
# Prérequis : flatc dans le PATH (apt install flatbuffers-compiler).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA="$ROOT/packages/protocol/schema/world.fbs"
TS_OUT="$ROOT/packages/protocol/src/gen"
CPP_OUT="$ROOT/firmware/esp32/src/gen"

if ! command -v flatc >/dev/null 2>&1; then
  echo "flatc introuvable. Installez-le : sudo apt-get install -y flatbuffers-compiler" >&2
  exit 1
fi

mkdir -p "$TS_OUT" "$CPP_OUT"
echo "flatc $(flatc --version)"
flatc --ts --gen-all -o "$TS_OUT" "$SCHEMA"
flatc --cpp --gen-all -o "$CPP_OUT" "$SCHEMA"
echo "Codegen terminé : $TS_OUT (TS), $CPP_OUT (C++)"
