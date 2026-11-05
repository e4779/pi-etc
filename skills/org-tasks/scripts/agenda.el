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

(defun agenda--stamp-id (file substring)
  "Stamp an org-id on the first heading in FILE whose text matches SUBSTRING."
  (let ((path (expand-file-name file (agenda--root)))
        found)
    (with-current-buffer (find-file-noselect path)
      (goto-char (point-min))
      (while (and (not found)
                  (re-search-forward org-outline-regexp-bol nil t))
        (goto-char (match-beginning 0))
        (when (string-match-p (regexp-quote substring)
                              (buffer-substring (point) (line-end-position)))
          (setq found (org-id-get (point) 'create)))
        (forward-line 1))
      (if (not found)
          (progn
            (princ (format "no heading matching %S in %s\n" substring file))
            (kill-emacs 3))
        (save-buffer)
        (princ (format "%s\n" found))))))

(let* ((a0 (pop command-line-args-left))
       (cmd (if (string= a0 "--") (pop command-line-args-left) a0)))
  (pcase cmd
    ("agenda" (agenda--print #'org-agenda-list))
    ("todos" (agenda--print #'org-todo-list))
    ("id" (let ((file (pop command-line-args-left))
                (sub (pop command-line-args-left)))
            (unless (and file sub)
              (princ "usage: agenda id FILE SUBSTRING\n")
              (kill-emacs 2))
            (agenda--stamp-id file sub)))
    (_ (princ (format "unknown command: %s\n" (or cmd ""))) (kill-emacs 2))))
