CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL,
  committed_at timestamptz,
  status text NOT NULL,
  manifest jsonb NOT NULL,
  source jsonb NOT NULL,
  signature text,
  signature_algorithm text,
  receipt_version text NOT NULL
);
CREATE INDEX IF NOT EXISTS receipts_device_created_idx ON receipts(device_id, created_at DESC);
