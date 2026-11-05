# views.awk - computed views over org files: ready / blocked / graph / lint. POSIX awk.
BEGIN {
  split("DONE CANCELLED", d, " ")
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
  }
  pfile = FILENAME
  hastodo = 0
  sawcontent = 0
  split("", vocab)
}
/^#\+TODO:/ {
  hastodo = 1
  rest = substr($0, 9)
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
/^[[:space:]]*#[[:space:]]*\\+begin_/ { inblock = 1 }
/^[[:space:]]*#[[:space:]]*\\+end_/ { inblock = 0 }
!inblock && mode == "find" && !inblock && /^[*]+[[:space:]]/ && index($0, fsub) != 0 {
  printf "%d:%s\n", FNR, $0
}
match($0, /^[[:space:]]*:ID:[[:space:]]*/) {
  id = substr($0, RSTART + RLENGTH); sub(/[[:space:]].*/, "", id)
  idcount[id]++
  if (mode == "lint" && idcount[id] > 1)
    printf "%s:%d: duplicate :ID: %s\n", FILENAME, FNR, id
  if (!(id in idstate)) idstate[id] = cstate[cur]
  if (!(id in ientry)) ientry[id] = cur
}
!inblock && match($0, /^[[:space:]]*:BLOCKER:[[:space:]]*/) {
  if (cur != "") eblk[cur] = eblk[cur] " " substr($0, RSTART + RLENGTH)
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
  if (mode == "lint" && w1 != "" && w1 == toupper(w1) && w1 != tolower(w1) && !(w1 in vocab)) {
    printf "%s:%d: undeclared keyword %s\n", FILENAME, FNR, w1
    wcount++
  }
  pend = 1; pline = FNR; pfile2 = FILENAME; sawcontent = 0
}
# planning lines are neutral between heading and drawer
pend && $0 !~ /^[*]+[[:space:]]/ && $0 !~ /^[[:space:]]*(DEADLINE|SCHEDULED|CLOSED):/ && $0 !~ /^[[:space:]]*:PROPERTIES:/ && $0 !~ /^[[:space:]]*$/ { sawcontent = 1 }
/^[[:space:]]*:PROPERTIES:/ {
  if (mode == "lint" && pend) {
    if (sawcontent) { printf "%s:%d: :PROPERTIES: not directly after heading\n", pfile2, FNR; pend = 0; wcount++ }
    else pend = 0
  }
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
  }
  for (i = 1; i <= cur; i++) {
    unres = ""; dang = ""
    n = split(eblk[i], bs, " ")
    for (j = 1; j <= n; j++) {
      id = bs[j]; sub(/^id:/, "", id)
      if (id == "") continue
      if (!(id in idstate)) { dang = dang " " bs[j]; continue }
      if (!(idstate[id] in fin)) unres = unres " " bs[j]
    }
    if (mode == "blocked" && unres != "")
      printf "%s:%d %s [unresolved:%s]\n", curfile[i], curline[i], curhead[i], unres
    if (mode == "ready" && cstate[i] == "NEXT" && unres == "")
      printf "%s:%d %s\n", curfile[i], curline[i], curhead[i]
    if (mode == "lint" && dang != "") {
      printf "%s:%d: dangling blocker%s\n", curfile[i], curline[i], dang
      wcount++
    }
  }
  if (mode == "graph") {
    printf "digraph tasks {\n  rankdir=LR;\n"
    for (i = 1; i <= cur; i++) {
      lbl = curhead[i]; gsub(/"/, "", lbl)
      printf "  n%d [label=\"%s (%s)\"];\n", i, lbl, cstate[i]
    }
    for (i = 1; i <= cur; i++) {
      n = split(eblk[i], bs, " ")
      for (j = 1; j <= n; j++) {
        id = bs[j]; sub(/^id:/, "", id)
        tgt = ientry[id]
        if (tgt != "" && tgt != i)
          printf "  n%d -> n%d;\n", tgt, i
      }
    }
    printf "}\n"
  }
  if (mode == "lint") exit (wcount > 0 ? 1 : 0)
}
