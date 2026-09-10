# ─────────────────────────────────────────────────────────────────────────
# S3 — ALB-Zugriffslogs + Backups (gated behind enable_fargate).
#   alb-logs : Application Load Balancer access logs werden hier archiviert
#   backups  : versionierter, verschlüsselter Bucket für DB-Exporte/Snapshots
# Beide: Public Access vollständig blockiert.
# ─────────────────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}
data "aws_elb_service_account" "main" {}

# ── ALB access logs bucket ───────────────────────────────────────────────
resource "aws_s3_bucket" "alb_logs" {
  count         = local.fargate_enabled
  bucket        = "${var.project_name}-alb-logs-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
  tags          = { Name = "${var.project_name}-alb-logs" }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  count                   = local.fargate_enabled
  bucket                  = aws_s3_bucket.alb_logs[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Allow the regional ELB log-delivery account to write access logs.
resource "aws_s3_bucket_policy" "alb_logs" {
  count  = local.fargate_enabled
  bucket = aws_s3_bucket.alb_logs[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = data.aws_elb_service_account.main.arn }
      Action    = "s3:PutObject"
      Resource  = "${aws_s3_bucket.alb_logs[0].arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
    }]
  })
}

# ── Backups bucket ───────────────────────────────────────────────────────
resource "aws_s3_bucket" "backups" {
  count         = local.fargate_enabled
  bucket        = "${var.project_name}-backups-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
  tags          = { Name = "${var.project_name}-backups" }
}

resource "aws_s3_bucket_versioning" "backups" {
  count  = local.fargate_enabled
  bucket = aws_s3_bucket.backups[0].id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  count  = local.fargate_enabled
  bucket = aws_s3_bucket.backups[0].id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  count                   = local.fargate_enabled
  bucket                  = aws_s3_bucket.backups[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  count  = local.fargate_enabled
  bucket = aws_s3_bucket.backups[0].id
  rule {
    id     = "expire-old-backups"
    status = "Enabled"
    filter {}
    expiration { days = 30 }
    noncurrent_version_expiration { noncurrent_days = 14 }
  }
}

output "alb_logs_bucket" {
  description = "S3 bucket für ALB-Zugriffslogs (leer, wenn enable_fargate = false)."
  value       = try(aws_s3_bucket.alb_logs[0].bucket, "")
}

output "backups_bucket" {
  description = "S3 bucket für Backups/DB-Exporte (leer, wenn enable_fargate = false)."
  value       = try(aws_s3_bucket.backups[0].bucket, "")
}
