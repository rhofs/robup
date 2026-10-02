-- Data only, no schema change. The default "To Do" colour was a mustard yellow (#c89642) that the
-- user found ugly (2026-10-02); the default is now a calm grey (#8d97a5). Every Space created until now
-- stored the old default in its own Status row, so it is updated here — but only where it is still
-- exactly the untouched default, so a To Do someone deliberately coloured that way elsewhere would
-- have to have been named something else, and any other colour choice is left alone.
UPDATE "Status" SET "color" = '#8d97a5' WHERE lower("name") = 'to do' AND lower("color") = '#c89642';
