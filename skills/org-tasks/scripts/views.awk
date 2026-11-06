# views.awk - computed views over org files. POSIX awk (FreeBSD BWK ok).
# modes: find (fsub) / vocab / list-support / ready / blocked / graph / lint
BEGIN {
  fin["DONE"] = 1; fin["CANCELLED"] = 1
  act["TODO"] = 1; act["NEXT"] = 1; act["WAITING"] = 1; act["SOMEDAY"] = 1
  canon["TODO"] = 1; canon["NEXT"] = 1; canon["WAITING"] = 1; canon["SOMEDAY"] = 1
  canon["DONE"] = 1; canon["CANCELLED"] = 1
}
FNR == 1 {
  if (NR > 1 && mode == "lint" && !hastodo) {
    printf "%s:1: no #+TODO: declaration\n", pfile
    wcount++
  }
  if (NR > 1 && mode == "lint" && hastodo) {
    for (c in canon) if (!(c in vocab)) {
      printf "%s:1: declaration missing %s\n", pfile, c
      wcount++
    }
    for (c in vocab) if (!(c in canon)) {
      printf "%s:1: vocabulary divergence: %s\n", pfile, c
      wcount++
    }
  }
  pfile = FILENAME
  nfseq++
  fseq[nfseq] = FILENAME
  hastodo = 0
  sawcontent = 0
  indrawer = 0
  split("", vocab)
}
/^#\+TODO:/ {
  hastodo = 1
  rest = substr($0, 9)
  fdecl[FILENAME] = rest
  m = split(rest, v, " ")
  for (k = 1; k <= m; k++) {
    if (v[k] == "|") continue
    vocab[v[k]] = 1
    if (mode == "lint" && !(v[k] in canon)) {
      printf "%s:%d: vocabulary divergence: %s\n", FILENAME, FNR, v[k]
      wcount++
    }
  }
}
inblock && /^[[:space:]]*#[[:space:]]*\+end_/ { inblock = 0 }
!inblock && /^[[:space:]]*#[[:space:]]*\+begin_/ { inblock = 1 }
!inblock && indrawer && /^[[:space:]]*:END:/ { indrawer = 0 }
!inblock && cur != "" && indrawer && match($0, /^[[:space:]]*:ID:[[:space:]]*/) {
  id = substr($0, RSTART + RLENGTH); sub(/[[:space:]].*/, "", id)
  idcount[id]++
  if (mode == "lint" && idcount[id] > 1)
    printf "%s:%d: duplicate :ID: %s\n", FILENAME, FNR, id
  if (!(id in idstate)) { idstate[id] = cstate[cur]; ientry[id] = cur }
  eid[cur] = id
}
!inblock && cur != "" && indrawer && match($0, /^[[:space:]]*:BLOCKER:[[:space:]]*/) {
  blk = substr($0, RSTART + RLENGTH)
  gsub(/,/, " ", blk)
  gsub(/[[:space:]]+$/, "", blk)
  eblk[cur] = eblk[cur] " " blk
}
mode == "find" && !inblock && /^[*]+[[:space:]]/ && index($0, fsub) != 0 {
  printf "%d:%s\n", FNR, $0
}
!inblock && /^[*]+[[:space:]]/ {
  cur++
  curfile[cur] = FILENAME
  curline[cur] = FNR
  txt = $0
  sub(/^[*]+[[:space:]]+/, "", txt)
  curhead[cur] = txt
  split(txt, w, " ")
  w1 = w[1]
  cstate[cur] = (w1 ~ /^[A-Z]+$/) ? w1 : ""
  uw = toupper(w1)
  if (mode == "lint" && w1 != "" && (uw in canon) && !(w1 in vocab)) {
    printf "%s:%d: undeclared keyword %s (canonical states are case-sensitive)\n", FILENAME, FNR, w1
    wcount++
  }
  pend = 1; pline = FNR; pfile2 = FILENAME; sawcontent = 0
}
pend && !inblock && $0 !~ /^[*]+[[:space:]]/ && $0 !~ /^[[:space:]]*:PROPERTIES:/ && $0 !~ /^[[:space:]]*(DEADLINE|SCHEDULED|CLOSED):/ && $0 !~ /^[[:space:]]*$/ && $0 !~ /^[[:space:]]*:/ { sawcontent = 1 }
/^[[:space:]]*:PROPERTIES:/ {
  if (mode == "lint" && pend) {
    if (sawcontent) {
      printf "%s:%d: :PROPERTIES: not directly after heading\n", pfile2, FNR
      wcount++
    }
    pend = 0
  }
  if (!inblock) indrawer = 1
}
END {
  if (mode == "lint" && !hastodo) {
    printf "%s:1: no #+TODO: declaration\n", pfile
    wcount++
  }
  if (mode == "lint" && hastodo) {
    for (c in canon) if (!(c in vocab)) {
      printf "%s:1: declaration missing %s\n", pfile, c
      wcount++
    }
    for (c in vocab) if (!(c in canon)) {
      printf "%s:1: vocabulary divergence: %s\n", pfile, c
      wcount++
    }
  }
  if (mode == "vocab") {
    for (i = 1; i <= nfseq; i++) {
      f = fseq[i]
      printf "%s: %s\n", f, (fdecl[f] == "" ? "(none)" : fdecl[f])
    }
    exit 0
  }
  for (i = 1; i <= cur; i++) {
    unres = ""; dang = ""; selfb = 0
    n = split(eblk[i], bs, " ")
    for (j = 1; j <= n; j++) {
      id = bs[j]; sub(/^id:/, "", id)
      if (id == "") continue
      if (eid[i] != "" && id == eid[i]) selfb = 1
      if (!(id in idstate)) { unres = unres " " bs[j]; dang = dang " " bs[j]; continue }
      if (!(idstate[id] in fin)) unres = unres " " bs[j]
    }
    if (mode == "blocked" && unres != "" && !(cstate[i] in fin))
      printf "%s:%d %s [unresolved:%s]%s\n", curfile[i], curline[i], curhead[i], unres, (selfb ? " [self-block]" : "")
    if (mode == "ready" && cstate[i] == "NEXT" && unres == "")
      printf "%s:%d %s\n", curfile[i], curline[i], curhead[i]
    if (mode == "lint") {
      if (dang != "") { printf "%s:%d: dangling blocker%s\n", curfile[i], curline[i], dang; wcount++ }
      if (selfb) { printf "%s:%d: self-block %s\n", curfile[i], curline[i], curhead[i]; wcount++ }
    }
    if (mode == "graph" && (cstate[i] in act)) {
      lbl = curhead[i]; gsub(/"/, "", lbl)
      sub(/^[A-Z]+[[:space:]]+/, "", lbl)
      printf "  n%d [label=\"%s (%s)\"];\n", i, lbl, cstate[i]
    }
  }
  if (mode == "graph") {
    printf "digraph tasks {\n  rankdir=LR;\n"
    for (i = 1; i <= cur; i++) {
      if (!(cstate[i] in act)) continue
      lbl = curhead[i]; gsub(/"/, "", lbl)
      sub(/^[A-Z]+[[:space:]]+/, "", lbl)
      printf "  n%d [label=\"%s (%s)\"];\n", i, lbl, cstate[i]
    }
    for (i = 1; i <= cur; i++) {
      if (!(cstate[i] in act)) continue
      n = split(eblk[i], bs, " ")
      for (j = 1; j <= n; j++) {
        id = bs[j]; sub(/^id:/, "", id)
        tgt = ientry[id]
        if (tgt != "" && (cstate[tgt] in act))
          printf "  n%d -> n%d;\n", tgt, i
        else if (tgt == "")
          printf "  q%d [label=\"unresolved %s\" style=dashed]; q%d -> n%d;\n", i, bs[j], i, i
      }
    }
    printf "}\n"
  }
  if (mode == "lint") exit (wcount > 0 ? 1 : 0)
}
