;;; agenda.el --- native org views, executed by scripts/agenda -*- lexical-binding: t; -*-
;; Shell wrapper exports AGENDA_ROOT and AGENDA_FILES (newline-separated).

(require 'org)
(require 'org-agenda)
(require 'org-id)

(setq org-agenda-files
      (mapcar (lambda (f)
                (expand-file-name f (or (getenv "AGENDA_ROOT") default-directory)))
              (split-string (or (getenv "AGENDA_FILES") "") "\n" t)))

(defun agenda--root ()
  (or (getenv "AGENDA_ROOT") default-directory))

(defun agenda--print (func)
  "Run native org view FUNC and print the buffer it renders."
  (funcall func)
  (princ (buffer-string)))

(defun agenda--stamp (file line fulltext)
  "Stamp an org-id on LINE of FILE, guarded by exact FULLTEXT match."
  (let ((path (expand-file-name file (agenda--root))))
    (with-current-buffer (find-file-noselect path)
      (goto-char (point-min))
      (forward-line (1- line))
      (if (and (org-at-heading-p)
               (string= (buffer-substring (point) (line-end-position)) fulltext))
          (progn
            (org-id-get (point) 'create)
            (save-buffer)
            (org-id-update-id-locations (list path))
            (princ (buffer-substring (point) (line-end-position))))
        (princ "heading mismatch - not stamping\n")
        (kill-emacs 3)))))

(let* ((a0 (pop command-line-args-left))
       (cmd (if (string= a0 "--") (pop command-line-args-left) a0)))
  (pcase cmd
    ("agenda" (agenda--print #'org-agenda-list))
    ("todos" (agenda--print #'org-todo-list))
    ("stamp" (let ((file (pop command-line-args-left))
                   (line (pop command-line-args-left))
                   (fulltext (pop command-line-args-left)))
               (unless (and file line fulltext)
                 (princ "usage: agenda stamp FILE LINE FULLTEXT\n")
                 (kill-emacs 2))
               (agenda--stamp file (string-to-number line) fulltext)))
    (_ (princ (format "unknown command: %s\n" (or cmd ""))) (kill-emacs 2))))
