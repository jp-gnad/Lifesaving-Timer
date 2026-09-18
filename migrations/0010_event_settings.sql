ALTER TABLE events ADD COLUMN timer_enabled INTEGER NOT NULL DEFAULT 1 CHECK(timer_enabled IN (0, 1));
ALTER TABLE events ADD COLUMN results_mode TEXT NOT NULL DEFAULT 'live' CHECK(results_mode IN ('live', 'pause', 'stop'));
ALTER TABLE events ADD COLUMN results_paused_at TEXT;
ALTER TABLE events ADD COLUMN pool_length TEXT NOT NULL DEFAULT '25' CHECK(pool_length IN ('25', '50', 'custom'));
ALTER TABLE events ADD COLUMN custom_pool_length REAL CHECK(custom_pool_length IS NULL OR custom_pool_length > 0);
ALTER TABLE events ADD COLUMN enabled_disciplines_json TEXT NOT NULL DEFAULT '["normal","rescue50","rescue100","lifesaver100","medley100","superLifesaver200","obstacle200","manikinRelay4x25","rescueTubeRelay4x50","rescueRelay4x50","obstacleRelay4x50","mixedRelay4x50","lineThrow"]';
ALTER TABLE events ADD COLUMN result_url TEXT NOT NULL DEFAULT '' CHECK(length(result_url) <= 500);
