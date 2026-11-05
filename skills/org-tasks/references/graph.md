# graphs

## Where edges come from

Nodes are entries with an active state (TODO NEXT WAITING SOMEDAY); edges are
`:BLOCKER: id:X` properties pointing at the entry whose :ID: is X. Unresolvable
blocker ids render as dashed "unresolved" nodes - they are lint errors too.

agenda graph   # DOT
agenda graph mermaid

Mermaid renders natively on git hosts - paste the output into a weekly log and
the graph is live with no pipeline. For a real canvas (drawio), convert from
the DOT output; do not hand-maintain a second copy of the graph.

## org-edna (background)

GNU ELPA package, "Extensible Dependencies 'N' Actions" (maintainer Ian Dunn,
1.1.2, 2024). Reads the SAME :BLOCKER: (and :TRIGGER:) properties, but
enforces them interactively: blocks TODO->DONE transitions and fires actions
when a blocker completes. Descendant of contrib org-depend.el. Relevant only
if a live Emacs session edits these files; our CLI layer computes blockers
instead. The property name is deliberately shared so files stay compatible
with both worlds.
