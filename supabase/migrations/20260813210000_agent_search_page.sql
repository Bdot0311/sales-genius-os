-- Remember where the agent got to in the provider's results.
--
-- The page was derived from a count of leads the agent had already saved:
--   searchPage = floor(agent_lead_count / daily_target) + 1
--
-- which only advances when a run actually saves leads. A run that saves none —
-- because everything on that page was already saved, or deduped, or had no
-- email — leaves the count unchanged, so the next run asks for the same page,
-- gets the same people, saves none again, and never moves. The agent shows the
-- same leads every day with no way out of it.
--
-- Position belongs to the agent, not to a count of its output. This advances
-- once per run whatever the run produced.

ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS search_page integer NOT NULL DEFAULT 1;

-- The ICP the page position refers to. When the ICP changes the old position is
-- meaningless — page 7 of the previous search has nothing to do with page 7 of
-- the new one — so it restarts rather than skipping the first six pages of a
-- result set nobody has seen.
ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS search_page_icp_id uuid;

COMMENT ON COLUMN public.agent_configs.search_page IS
  'Next provider result page for lead discovery. Advances every run, not every save.';
COMMENT ON COLUMN public.agent_configs.search_page_icp_id IS
  'The icp_profile_id search_page counts against; a change resets the position.';
