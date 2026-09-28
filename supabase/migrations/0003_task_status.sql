-- Must run alone (new enum values can't be used in the same transaction that adds them).
alter type task_status add value if not exists 'returned';   -- "Return for modifications"
