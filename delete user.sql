
SELECT id, username, role FROM users WHERE username = '';


UPDATE runs            SET created_by = NULL WHERE created_by = (SELECT id FROM users WHERE username = '');
UPDATE issues           SET created_by = NULL WHERE created_by = (SELECT id FROM users WHERE username = '');
UPDATE project_configs  SET created_by = NULL WHERE created_by = (SELECT id FROM users WHERE username = '');


DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = '');


DELETE FROM users WHERE username = '';