#!/usr/bin/env bash
# Fase 0 of docs/bonzaiwork/project-breinen-plan.md (§3.2): what git with the
# system ssh in BatchMode reports in each failure case, so the app can turn it
# into plain Dutch. Needs git, ssh, ssh-keygen, ssh-keyscan, ssh-agent and
# sshd on PATH; starts a throwaway sshd on 127.0.0.1:2222. Linux/macOS only;
# Windows is a manual check (see project-breinen-fase0.md).
#
#   bash scripts/bonzaiwork/spikes/brains/ssh-matrix.sh
set -u
SSHD=${SSHD:-$(command -v sshd || echo /usr/sbin/sshd)}
W=$(mktemp -d)
trap '[ -f "$W/sshd.pid" ] && kill "$(cat "$W/sshd.pid")" 2>/dev/null; [ -n "${SSH_AGENT_PID:-}" ] && kill "$SSH_AGENT_PID" 2>/dev/null; rm -rf "$W"' EXIT
mkdir -p "$W/home/.ssh" "$W/hostkeys" && chmod 700 "$W/home/.ssh"
[ "$(id -u)" = 0 ] && mkdir -p /run/sshd
ssh-keygen -q -t ed25519 -N "" -f "$W/hostkeys/a" -C host-a
ssh-keygen -q -t ed25519 -N "" -f "$W/hostkeys/b" -C host-b
ssh-keygen -q -t ed25519 -N "" -f "$W/home/.ssh/id_plain" -C plain
ssh-keygen -q -t ed25519 -N "geheim" -f "$W/home/.ssh/id_locked" -C locked
ssh-keygen -q -t ed25519 -N "" -f "$W/home/.ssh/id_other" -C other
cat "$W/home/.ssh/id_plain.pub" "$W/home/.ssh/id_locked.pub" > "$W/authorized_keys"
git init -q --bare "$W/repo.git"
printf '#!/bin/sh\necho geheim\n' > "$W/askpass" && chmod +x "$W/askpass"
touch "$W/known_hosts"

sshd_with() {
  [ -f "$W/sshd.pid" ] && kill "$(cat "$W/sshd.pid")" 2>/dev/null && sleep 0.3
  "$SSHD" -f /dev/null -p 2222 -h "$W/hostkeys/$1" -o PidFile="$W/sshd.pid" -o AuthorizedKeysFile="$W/authorized_keys" \
    -o PermitRootLogin=prohibit-password -o StrictModes=no -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -E "$W/sshd.log"
  sleep 0.5
}

# What BonzaiWork would run: clean environment, own known_hosts, never a prompt.
ls_remote() { # $1 url, $2 extra ssh options
  env -i PATH="$PATH" HOME="$W/home" ${AGENT:+SSH_AUTH_SOCK=$AGENT} GIT_TERMINAL_PROMPT=0 GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null \
    GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$W/known_hosts -o ConnectTimeout=5 $2" \
    timeout 20 git ls-remote "$1" 2>&1
}
show() { echo "$1"; shift; local out; out=$(ls_remote "$@"); echo "    exit=$? $(echo "$out" | grep -v 'Please make sure\|repository exists\|^$\|^@@@' | head -2 | tr '\n' ' ')"; }
diagnose() { # ssh -v for "Verbinding testen": did the server accept a key the client then could not use?
  echo "$1"; shift
  env -i PATH="$PATH" HOME="$W/home" ssh -v -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$W/known_hosts" -p 2222 "$@" "$(whoami)@127.0.0.1" true 2>&1 \
    | grep -E 'Server accepts key|Permission denied' | sed 's|key: /[^ ]*|key: …|; s|^|    |'
}

URL="ssh://$(whoami)@127.0.0.1:2222$W/repo.git"
sshd_with a
show "Onbekende host" "$URL" "-o IdentitiesOnly=yes -i $W/home/.ssh/id_plain"
echo "Vingerafdruk voor de bevestiging (ssh-keyscan + ssh-keygen -lf):"
ssh-keyscan -p 2222 -t ed25519 127.0.0.1 2>/dev/null > "$W/scan" && ssh-keygen -lf "$W/scan" | sed 's/^/    /'
cp "$W/scan" "$W/known_hosts"
show "Bekende host, sleutel zonder wachtwoord" "$URL" "-o IdentitiesOnly=yes -i $W/home/.ssh/id_plain"
show "Sleutel met wachtwoord, niet in de agent" "$URL" "-o IdentitiesOnly=yes -i $W/home/.ssh/id_locked"
show "Sleutel zonder toegang" "$URL" "-o IdentitiesOnly=yes -i $W/home/.ssh/id_other"
diagnose "  -v bij sleutel met wachtwoord, niet in de agent:" -o IdentitiesOnly=yes -i "$W/home/.ssh/id_locked"
diagnose "  -v bij sleutel zonder toegang:" -o IdentitiesOnly=yes -i "$W/home/.ssh/id_other"
eval "$(ssh-agent -s -a "$W/agent.sock")" > /dev/null
SSH_AUTH_SOCK="$W/agent.sock" DISPLAY=probe SSH_ASKPASS_REQUIRE=force SSH_ASKPASS="$W/askpass" ssh-add -q "$W/home/.ssh/id_locked" < /dev/null
AGENT="$W/agent.sock" show "Sleutel met wachtwoord, ontgrendeld in de agent" "$URL" ""
AGENT="$W/agent.sock" show "Repo bestaat niet" "ssh://$(whoami)@127.0.0.1:2222$W/nope.git" ""
sshd_with b
AGENT="$W/agent.sock" show "Host-sleutel veranderd" "$URL" ""
show "Poort dicht" "ssh://git@127.0.0.1:2299/x.git" ""
show "Naam onbekend" "ssh://git@gitlab.voorbeeld.invalid/x.git" ""
