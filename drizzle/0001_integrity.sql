CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN
  SELECT RAISE(ABORT, 'Event records are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN
  SELECT RAISE(ABORT, 'Event records are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER payouts_fixed_terms BEFORE UPDATE ON payouts
WHEN NEW.job_id != OLD.job_id OR NEW.chain_id != OLD.chain_id
  OR NEW.sender != OLD.sender OR NEW.recipient != OLD.recipient
  OR NEW.amount_micros != OLD.amount_micros OR NEW.reward_cents != OLD.reward_cents
  OR NEW.min_block != OLD.min_block OR NEW.approved_at != OLD.approved_at
  OR (OLD.tx_hash IS NOT NULL AND NEW.tx_hash IS NOT OLD.tx_hash)
BEGIN
  SELECT RAISE(ABORT, 'Approved payout terms are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER payouts_no_delete BEFORE DELETE ON payouts BEGIN
  SELECT RAISE(ABORT, 'Payout records cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER jobs_fixed_terms BEFORE UPDATE ON jobs
WHEN NEW.reward_cents != OLD.reward_cents OR NEW.chain_id != OLD.chain_id
  OR NEW.payer != OLD.payer OR NEW.owner_id != OLD.owner_id
  OR NEW.repo != OLD.repo OR NEW.issue_url != OLD.issue_url
BEGIN
  SELECT RAISE(ABORT, 'Job reward, network, payer and repository are fixed');
END;
