CREATE TABLE IF NOT EXISTS ring_credentials (
  account_id TEXT PRIMARY KEY,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  link_state TEXT NOT NULL DEFAULT 'unclaimed'
    CHECK (link_state IN ('unclaimed', 'linking', 'awaiting', 'completed')),
  partner_identifier TEXT,
  nonce_digest TEXT,
  nonce_time_ms BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ring_credentials_link_state_idx
  ON ring_credentials (link_state, created_at);
